import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ChatInput from '../../components/chat/ChatInput'
import ChatMessage from '../../components/chat/ChatMessage'
import ChatWindow from '../../components/chat/ChatWindow'
import CategoryFieldset from '../../components/product/CategoryFieldset'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import Textarea from '../../components/ui/Textarea'
import { useJobs } from '../../hooks/useJobs'
import { useCreateProduct, useGenerateProductAssets } from '../../hooks/useProduct'
import { productAssistChat } from '../../api/product.api'
import { ACCEPTED_IMAGE_TYPES, MAX_PRODUCT_PHOTO_SIZE_BYTES, MAX_PRODUCT_PHOTOS } from '../../lib/constants'
import { getErrorMessage } from '../../lib/utils'
import { useToast } from '../../components/ui/useToast'
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

export default function AddProductPage() {
  const navigate = useNavigate()
  const { pushToast } = useToast()
  const jobsQuery = useJobs()
  const createProductMutation = useCreateProduct()
  const generateMutation = useGenerateProductAssets()
  const brandId =
    jobsQuery.data?.find((job) => job.job_type === 'brand_onboarding' && job.status === 'done' && job.ref_id)?.ref_id ??
    null

  const [mode, setMode] = useState<'chat' | 'form'>('chat')
  const [messages, setMessages] = useState<Message[]>([
    makeMessage('assistant', 'Product ka naam kya hai?'),
  ])
  const [phaseOne, setPhaseOne] = useState<ProductAssistExtracted>({
    occasion: 'general',
  })
  const [phaseOneComplete, setPhaseOneComplete] = useState(false)
  const [categoryData, setCategoryData] = useState<Partial<CategoryData>>({})
  const [material, setMaterial] = useState('')
  const [motifUsed, setMotifUsed] = useState('')
  const [files, setFiles] = useState<File[]>([])

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
    setMessages((current) => [...current, makeMessage('user', message)])
    const response = await productAssistChat(message, phaseOne)
    if (response.extracted) setPhaseOne((current) => ({ ...current, ...response.extracted }))
    setMessages((current) => [...current, makeMessage('assistant', response.message)])
    setPhaseOneComplete(Boolean(response.is_complete))
  }

  const handleFiles = (incoming: FileList | null) => {
    if (!incoming) return
    const next = [...files]
    for (const file of Array.from(incoming)) {
      if (next.length >= MAX_PRODUCT_PHOTOS) {
        pushToast('Max 5 photos hi add kar sakte hain.')
        break
      }
      if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
        pushToast('Sirf JPG, PNG ya WEBP photo chalegi.')
        continue
      }
      if (file.size > MAX_PRODUCT_PHOTO_SIZE_BYTES) {
        pushToast('Har photo 5MB se chhoti honi chahiye.')
        continue
      }
      next.push(file)
    }
    setFiles(next)
  }

  const submitProduct = async () => {
    if (!brandId || !phaseOneReady) {
      pushToast('Pehle basic product details poori kijiye.')
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
    return <Card>Pehle brand banao, phir product jodenge.</Card>
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-3">
        <Button variant={mode === 'chat' ? 'primary' : 'secondary'} onClick={() => setMode('chat')}>
          Baat karke batao
        </Button>
        <Button variant={mode === 'form' ? 'primary' : 'secondary'} onClick={() => setMode('form')}>
          Form bharo
        </Button>
      </div>

      {mode === 'chat' ? (
        <div className="space-y-4">
          <Card className="bg-orange-50 text-stone-700">
            Product assist backend proxy abhi nahi hai, isliye Phase 1 chat abhi local mock se chal rahi hai.
          </Card>
          <ChatWindow>
            {messages.map((message) => (
              <ChatMessage key={message.id} role={message.role} content={message.content} timestamp={message.timestamp} />
            ))}
          </ChatWindow>
          <ChatInput onSend={handleChatSend} placeholder="Apne product ke baare me likhiye..." />
        </div>
      ) : (
        <Card className="grid gap-4">
          <Input label="Product name" value={phaseOne.name ?? ''} onChange={(event) => setPhaseOne((current) => ({ ...current, name: event.target.value }))} />
          <Input type="number" label="Price" value={phaseOne.price_mrp ?? ''} onChange={(event) => setPhaseOne((current) => ({ ...current, price_mrp: Number(event.target.value) }))} />
          <Select
            label="Category"
            value={phaseOne.category ?? 'apparel'}
            onChange={(event) => setPhaseOne((current) => ({ ...current, category: event.target.value as ProductCategory }))}
            options={['apparel', 'jewelry', 'pottery', 'painting', 'home_decor', 'other'].map((item) => ({ label: item, value: item }))}
          />
          <Select
            label="Occasion"
            value={phaseOne.occasion ?? 'general'}
            onChange={(event) => setPhaseOne((current) => ({ ...current, occasion: event.target.value as ProductOccasion }))}
            options={['general', 'wedding', 'festival', 'daily', 'gifting', 'home_decor', 'export'].map((item) => ({ label: item, value: item }))}
          />
          <Textarea label="Description" value={phaseOne.description_voice ?? ''} onChange={(event) => setPhaseOne((current) => ({ ...current, description_voice: event.target.value }))} />
          <Input type="number" label="Time to make (hours)" value={phaseOne.time_to_make_hrs ?? ''} onChange={(event) => setPhaseOne((current) => ({ ...current, time_to_make_hrs: Number(event.target.value) }))} />
        </Card>
      )}

      {(phaseOneComplete || mode === 'form') && (
        <Card className="space-y-5">
          <div>
            <h2 className="text-2xl font-semibold text-stone-900">Phase 2 - Category details aur photos</h2>
            <p className="text-stone-600">Ye hissa structured hai taki backend sahi asset bana sake.</p>
          </div>
          <Input label="Material" value={material} onChange={(event) => setMaterial(event.target.value)} />
          <Input label="Motif used" value={motifUsed} onChange={(event) => setMotifUsed(event.target.value)} />
          <CategoryFieldset category={category} value={categoryData} onChange={setCategoryData} />

          <div className="space-y-3">
            <p className="text-base font-medium text-stone-800">Photos upload</p>
            <label className="flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed border-orange-200 bg-orange-50 px-4 py-6 text-center text-stone-600">
              <span className="font-medium text-stone-800">Photo yahan select karo</span>
              <span className="text-sm">JPG, PNG, WEBP · max 5 photos · max 5MB each</span>
              <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(event) => handleFiles(event.target.files)} />
            </label>
            <label className="inline-flex">
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => handleFiles(event.target.files)} />
              <span className="inline-flex min-h-11 items-center rounded-2xl border border-stone-200 bg-white px-4 py-3 text-base font-medium text-stone-700">
                Camera se lo
              </span>
            </label>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {files.map((file) => (
                <div key={`${file.name}-${file.size}`} className="rounded-2xl border border-stone-200 bg-white p-3 text-sm">
                  <p className="truncate font-medium text-stone-800">{file.name}</p>
                  <p className="text-stone-500">{Math.round(file.size / 1024)} KB</p>
                  <button type="button" className="mt-2 text-red-600" onClick={() => setFiles((current) => current.filter((item) => item !== file))}>
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>

          <Button className="w-full" size="lg" loading={createProductMutation.isPending || generateMutation.isPending} onClick={submitProduct}>
            Product banao aur assets chalu karo
          </Button>
        </Card>
      )}
    </div>
  )
}
