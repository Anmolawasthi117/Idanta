import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { productAssist } from '../../api/chat.api'
import { productAssistChat } from '../../api/product.api'
import ChatInput from '../../components/chat/ChatInput'
import ChatMessage from '../../components/chat/ChatMessage'
import ChatWindow from '../../components/chat/ChatWindow'
import CategoryFieldset from '../../components/product/CategoryFieldset'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import Textarea from '../../components/ui/Textarea'
import { useToast } from '../../components/ui/useToast'
import { useJobs } from '../../hooks/useJobs'
import { useCreateProduct, useGenerateProductAssets } from '../../hooks/useProduct'
import { normalizeProductExtracted } from '../../lib/chatNormalization'
import { ACCEPTED_IMAGE_TYPES, MAX_PRODUCT_PHOTO_SIZE_BYTES, MAX_PRODUCT_PHOTOS } from '../../lib/constants'
import { copyFor, useLanguage } from '../../lib/i18n'
import { getErrorMessage } from '../../lib/utils'
import type { CategoryData, ProductAssistExtracted, ProductCategory, ProductOccasion } from '../../types/product.types'

interface Message {
  id: string
  role: 'assistant' | 'user'
  content: string
  timestamp: Date
}

const makeMessage = (role: Message['role'], content: string): Message => ({
  id: `${role}-${Date.now()}-${Math.random()}`,
  role,
  content,
  timestamp: new Date(),
})

const buildProductPrompt = (language: 'hi' | 'en') =>
  language === 'hi'
    ? `
You are Idanta's warm product assistant for Indian artisans.
Speak only in simple Hindi or easy Hinglish. Do not reply in English-only.
Keep every reply under 2 short sentences and ask only one question at a time.

Collect these fields naturally:
1. name
2. price_mrp
3. category
4. occasion
5. description_voice
6. time_to_make_hrs

Important normalization rules:
- category must be one of: apparel, jewelry, pottery, painting, home_decor, other
- occasion must be one of: wedding, festival, daily, gifting, home_decor, export, general
- Ask simple user-facing questions, but when returning JSON always use only the exact allowed values above.
- If the user's answer is unclear or does not map cleanly, ask a clarification question instead of guessing.

Respond as JSON with keys: message, extracted, is_complete.
`.trim()
    : `
You are Idanta's warm product assistant for Indian artisans.
Speak only in simple English. Do not reply in Hindi or Hinglish.
Keep every reply under 2 short sentences and ask only one question at a time.

Collect these fields naturally:
1. name
2. price_mrp
3. category
4. occasion
5. description_voice
6. time_to_make_hrs

Important normalization rules:
- category must be one of: apparel, jewelry, pottery, painting, home_decor, other
- occasion must be one of: wedding, festival, daily, gifting, home_decor, export, general
- Ask simple user-facing questions, but when returning JSON always use only the exact allowed values above.
- If the user's answer is unclear or does not map cleanly, ask a clarification question instead of guessing.

Respond as JSON with keys: message, extracted, is_complete.
`.trim()

export default function AddProductPage() {
  const navigate = useNavigate()
  const { pushToast } = useToast()
  const jobsQuery = useJobs()
  const createProductMutation = useCreateProduct()
  const generateMutation = useGenerateProductAssets()
  const language = useLanguage()
  const brandId =
    jobsQuery.data?.find((job) => job.job_type === 'brand_onboarding' && job.status === 'done' && job.ref_id)?.ref_id ??
    null

  const [mode, setMode] = useState<'chat' | 'form'>('chat')
  const [messages, setMessages] = useState<Message[]>([
    makeMessage('assistant', copyFor(language, 'Product ka naam kya hai?', 'What is the name of your product?')),
  ])
  const [phaseOne, setPhaseOne] = useState<ProductAssistExtracted>({
    occasion: 'general',
  })
  const [phaseOneComplete, setPhaseOneComplete] = useState(false)
  const [categoryData, setCategoryData] = useState<Partial<CategoryData>>({})
  const [material, setMaterial] = useState('')
  const [motifUsed, setMotifUsed] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [isBackendChatLive, setIsBackendChatLive] = useState(true)

  const category = (phaseOne.category ?? 'apparel') as ProductCategory

  const phaseOneReady = useMemo(
    () =>
      Boolean(
        brandId &&
          phaseOne.name &&
          phaseOne.price_mrp &&
          phaseOne.category &&
          phaseOne.occasion &&
          phaseOne.description_voice &&
          phaseOne.time_to_make_hrs,
      ),
    [brandId, phaseOne],
  )

  const handleChatSend = async (message: string) => {
    const userMessage = makeMessage('user', message)
    const nextMessages = [...messages, userMessage]
    setMessages(nextMessages)

    try {
      let response
      try {
        response = await productAssist({
          system_prompt: buildProductPrompt(language),
          messages: nextMessages.map((item) => ({
            role: item.role,
            content: item.content,
          })),
          context: {
            selected_language: language,
            extracted_data: phaseOne,
          },
        })
        setIsBackendChatLive(true)
      } catch (chatError) {
        setIsBackendChatLive(false)
        response = await productAssistChat(message, phaseOne, language)
        pushToast(getErrorMessage(chatError))
      }

      const normalizedExtracted = normalizeProductExtracted(response.extracted)
      let mergedData = phaseOne
      if (normalizedExtracted) {
        mergedData = { ...phaseOne, ...normalizedExtracted }
        setPhaseOne(mergedData)
      }

      setMessages((current) => [...current, makeMessage('assistant', response.message)])
      setPhaseOneComplete(
        Boolean(response.is_complete) &&
          Boolean(
            mergedData.name &&
              mergedData.price_mrp &&
              mergedData.category &&
              mergedData.occasion &&
              mergedData.description_voice &&
              mergedData.time_to_make_hrs,
          ),
      )
    } catch (error) {
      pushToast(getErrorMessage(error))
    }
  }

  const handleFiles = (incoming: FileList | null) => {
    if (!incoming) return
    const next = [...files]
    for (const file of Array.from(incoming)) {
      if (next.length >= MAX_PRODUCT_PHOTOS) {
        pushToast(copyFor(language, 'Max 5 photos hi add kar sakte hain.', 'You can add at most 5 photos.'))
        break
      }
      if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
        pushToast(copyFor(language, 'Sirf JPG, PNG ya WEBP photo chalegi.', 'Only JPG, PNG, or WEBP photos are allowed.'))
        continue
      }
      if (file.size > MAX_PRODUCT_PHOTO_SIZE_BYTES) {
        pushToast(copyFor(language, 'Har photo 5MB se chhoti honi chahiye.', 'Each photo must be smaller than 5MB.'))
        continue
      }
      next.push(file)
    }
    setFiles(next)
  }

  const submitProduct = async () => {
    if (!brandId || !phaseOneReady) {
      pushToast(copyFor(language, 'Pehle basic product details poori kijiye.', 'Please complete the basic product details first.'))
      return
    }

    try {
      const formData = new FormData()
      formData.append('brand_id', brandId)
      formData.append('name', phaseOne.name as string)
      formData.append('price_mrp', String(phaseOne.price_mrp))
      formData.append('category', category)
      formData.append('occasion', String(phaseOne.occasion as ProductOccasion))
      formData.append('description_voice', phaseOne.description_voice as string)
      formData.append('time_to_make_hrs', String(phaseOne.time_to_make_hrs))
      if (material) formData.append('material', material)
      if (motifUsed) formData.append('motif_used', motifUsed)
      formData.append('category_data', JSON.stringify(categoryData))
      files.forEach((file) => formData.append('photos', file))

      const product = await createProductMutation.mutateAsync(formData)
      const generation = await generateMutation.mutateAsync(product.id)
      navigate(`/jobs/${generation.job_id}`)
    } catch (error) {
      pushToast(getErrorMessage(error))
    }
  }

  if (!brandId) {
    return <Card>{copyFor(language, 'Pehle brand banao, phir product jodenge.', 'Create your brand first, then we will add products.')}</Card>
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-3">
        <Button variant={mode === 'chat' ? 'primary' : 'secondary'} onClick={() => setMode('chat')}>
          {copyFor(language, 'Baat karke batao', 'Chat it out')}
        </Button>
        <Button variant={mode === 'form' ? 'primary' : 'secondary'} onClick={() => setMode('form')}>
          {copyFor(language, 'Form bharo', 'Fill the form')}
        </Button>
      </div>

      {mode === 'chat' ? (
        <div className="space-y-4">
          <Card className="bg-orange-50 text-stone-700">
            {isBackendChatLive
              ? copyFor(language, 'Phase 1 product chat ab backend se connected hai.', 'Phase 1 product chat is now connected to the backend.')
              : copyFor(language, 'Backend chat abhi respond nahi kar raha, isliye temporary fallback chat chal rahi hai.', 'The backend chat is not responding right now, so a temporary fallback chat is being used.')}
          </Card>
          <ChatWindow>
            {messages.map((message) => (
              <ChatMessage key={message.id} role={message.role} content={message.content} timestamp={message.timestamp} />
            ))}
          </ChatWindow>
          <ChatInput onSend={handleChatSend} placeholder={copyFor(language, 'Apne product ke baare me likhiye...', 'Write about your product...')} />
        </div>
      ) : (
        <Card className="grid gap-4">
          <Input label={copyFor(language, 'Product name', 'Product name')} value={phaseOne.name ?? ''} onChange={(event) => setPhaseOne((current) => ({ ...current, name: event.target.value }))} />
          <Input type="number" label={copyFor(language, 'Price', 'Price')} value={phaseOne.price_mrp ?? ''} onChange={(event) => setPhaseOne((current) => ({ ...current, price_mrp: Number(event.target.value) }))} />
          <Select
            label={copyFor(language, 'Category', 'Category')}
            value={phaseOne.category ?? 'apparel'}
            onChange={(event) => setPhaseOne((current) => ({ ...current, category: event.target.value as ProductCategory }))}
            options={['apparel', 'jewelry', 'pottery', 'painting', 'home_decor', 'other'].map((item) => ({ label: item, value: item }))}
          />
          <Select
            label={copyFor(language, 'Occasion', 'Occasion')}
            value={phaseOne.occasion ?? 'general'}
            onChange={(event) => setPhaseOne((current) => ({ ...current, occasion: event.target.value as ProductOccasion }))}
            options={['general', 'wedding', 'festival', 'daily', 'gifting', 'home_decor', 'export'].map((item) => ({ label: item, value: item }))}
          />
          <Textarea label={copyFor(language, 'Description', 'Description')} value={phaseOne.description_voice ?? ''} onChange={(event) => setPhaseOne((current) => ({ ...current, description_voice: event.target.value }))} />
          <Input type="number" label={copyFor(language, 'Time to make (hours)', 'Time to make (hours)')} value={phaseOne.time_to_make_hrs ?? ''} onChange={(event) => setPhaseOne((current) => ({ ...current, time_to_make_hrs: Number(event.target.value) }))} />
        </Card>
      )}

      {(phaseOneComplete || mode === 'form') && (
        <Card className="space-y-5">
          <div>
            <h2 className="text-2xl font-semibold text-stone-900">
              {copyFor(language, 'Phase 2 - Category details aur photos', 'Phase 2 - Category details and photos')}
            </h2>
            <p className="text-stone-600">
              {copyFor(language, 'Ye hissa structured hai taki backend sahi asset bana sake.', 'This part is structured so the backend can generate the right assets.')}
            </p>
          </div>
          <Input label={copyFor(language, 'Material', 'Material')} value={material} onChange={(event) => setMaterial(event.target.value)} />
          <Input label={copyFor(language, 'Motif used', 'Motif used')} value={motifUsed} onChange={(event) => setMotifUsed(event.target.value)} />
          <CategoryFieldset category={category} value={categoryData} onChange={setCategoryData} />

          <div className="space-y-3">
            <p className="text-base font-medium text-stone-800">{copyFor(language, 'Photos upload', 'Photo upload')}</p>
            <label className="flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed border-orange-200 bg-orange-50 px-4 py-6 text-center text-stone-600">
              <span className="font-medium text-stone-800">{copyFor(language, 'Photo yahan select karo', 'Select photos here')}</span>
              <span className="text-sm">JPG, PNG, WEBP · max 5 photos · max 5MB each</span>
              <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(event) => handleFiles(event.target.files)} />
            </label>
            <label className="inline-flex">
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => handleFiles(event.target.files)} />
              <span className="inline-flex min-h-11 items-center rounded-2xl border border-stone-200 bg-white px-4 py-3 text-base font-medium text-stone-700">
                {copyFor(language, 'Camera se lo', 'Use camera')}
              </span>
            </label>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {files.map((file) => (
                <div key={`${file.name}-${file.size}`} className="rounded-2xl border border-stone-200 bg-white p-3 text-sm">
                  <p className="truncate font-medium text-stone-800">{file.name}</p>
                  <p className="text-stone-500">{Math.round(file.size / 1024)} KB</p>
                  <button type="button" className="mt-2 text-red-600" onClick={() => setFiles((current) => current.filter((item) => item !== file))}>
                    {copyFor(language, 'Remove', 'Remove')}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <Button className="w-full" size="lg" loading={createProductMutation.isPending || generateMutation.isPending} onClick={submitProduct}>
            {copyFor(language, 'Product banao aur assets chalu karo', 'Create product and start asset generation')}
          </Button>
        </Card>
      )}
    </div>
  )
}
