import { useMemo, useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { productAssistStream } from '../../api/chat.api'
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
import { useVoiceChat } from '../../hooks/useVoiceChat'
import { normalizeProductExtracted } from '../../lib/chatNormalization'
import { ACCEPTED_IMAGE_TYPES, MAX_PRODUCT_PHOTO_SIZE_BYTES, MAX_PRODUCT_PHOTOS } from '../../lib/constants'
import { copyFor, useLanguage } from '../../lib/i18n'
import { getErrorMessage } from '../../lib/utils'
import { Mic, MicOff, Square, Volume2 } from 'lucide-react'
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

import type { AppLanguage } from '../../store/uiStore'

const buildProductPrompt = (language: AppLanguage, isVoiceMode: boolean) => {
  const baseRules = `
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

CRITICAL RULE: You must only ask a maximum of 10 questions in total across the entire conversation. If you reach 10 questions and still do not have all information, you must immediately wrap up the conversation gracefully and mark is_complete as true even if required fields are missing. Do not exceed 10 questions under any circumstance.

Respond as JSON with keys: message, extracted, is_complete.`

  if (language === 'hi' || isVoiceMode) {
    return `
You are Idanta's warm product assistant for Indian artisans.
Speak only in pure Hindi using the Devanagari script. Do not use English words.
Keep every reply under 2 short sentences and ask only one question at a time.
${baseRules}`.trim()
  } else if (language === 'hg') {
    return `
You are Idanta's warm product assistant for Indian artisans.
Speak only in easy Hinglish (Hindi written in the English alphabet). Do not reply in pure English or pure Devanagari.
Keep every reply under 2 short sentences and ask only one question at a time.
${baseRules}`.trim()
  } else {
    return `
You are Idanta's warm product assistant for Indian artisans.
Speak only in simple English. Do not reply in Hindi or Hinglish.
Keep every reply under 2 short sentences and ask only one question at a time.
${baseRules}`.trim()
  }
}

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
  const [isVoiceMode, setIsVoiceMode] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const {
    isRecording,
    isPlaying,
    isProcessingTranscription,
    startRecording,
    stopRecording,
    playSynthesizedSpeech,
    enqueueSynthesizedSpeech,
    stopAudio,
  } = useVoiceChat({
    language,
    onResult: (text) => {
      if (text) handleChatSend(text)
    },
    onError: (err) => pushToast(err),
  })

  useEffect(() => {
    if (mode === 'chat') {
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
    }
  }, [messages, mode])

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
    setIsLoading(true)

    try {
      let mergedData = phaseOne
      let fullMessage = ''
      let spokenLength = 0
      const assistantMessageId = `assistant-${Date.now()}`
      setMessages((current) => [...current, { id: assistantMessageId, role: 'assistant', content: '', timestamp: new Date() }])

      let isFallback = false

      try {
        await productAssistStream(
          {
            system_prompt: buildProductPrompt(language, isVoiceMode),
            messages: nextMessages.map((item) => ({
              role: item.role,
              content: item.content,
            })),
            context: {
              selected_language: language,
              extracted_data: phaseOne,
            },
          },
          (event) => {
            if (event.type === 'chunk') {
              fullMessage += event.content
              setMessages((current) => 
                current.map(m => m.id === assistantMessageId ? { ...m, content: fullMessage } : m)
              )
              if (isVoiceMode) {
                const unseen = fullMessage.substring(spokenLength)
                const sentences = unseen.match(/[^।.?!\n]+[।.?!\n]+/g)
                if (sentences) {
                  for (const s of sentences) {
                    spokenLength += s.length
                    enqueueSynthesizedSpeech(s)
                  }
                }
              }
            } else if (event.type === 'message_done') {
              if (isVoiceMode) {
                 const remaining = fullMessage.substring(spokenLength)
                 if (remaining.trim()) enqueueSynthesizedSpeech(remaining)
              }
            } else if (event.type === 'final') {
              const normalizedExtracted = normalizeProductExtracted(event.extracted ?? {})
              if (normalizedExtracted) {
                mergedData = { ...mergedData, ...normalizedExtracted }
                setPhaseOne(mergedData)
              }
              setPhaseOneComplete(
                Boolean(event.is_complete) &&
                  Boolean(
                    mergedData.name &&
                      mergedData.price_mrp &&
                      mergedData.category &&
                      mergedData.occasion &&
                      mergedData.description_voice &&
                      mergedData.time_to_make_hrs,
                  ),
              )
              setIsLoading(false)
            } else if (event.type === 'error') {
              pushToast(event.content)
              setIsLoading(false)
            }
          }
        )
        setIsBackendChatLive(true)
      } catch (chatError) {
        setIsBackendChatLive(false)
        isFallback = true
      }

      if (isFallback) {
        const response = await productAssistChat(message, phaseOne, language)
        const normalizedExtracted = normalizeProductExtracted(response.extracted ?? {})
        if (normalizedExtracted) {
          mergedData = { ...mergedData, ...normalizedExtracted }
          setPhaseOne(mergedData)
        }
        setMessages((current) => 
          current.map(m => m.id === assistantMessageId ? { ...m, content: response.message } : m)
        )
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
        if (isVoiceMode && response.message) {
          playSynthesizedSpeech(response.message)
        }
        setIsLoading(false)
      }

    } catch (error) {
      pushToast(getErrorMessage(error))
      setIsLoading(false)
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
          <Card className="flex flex-col items-start gap-4 bg-orange-50 text-stone-700 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm sm:text-base">
              {isBackendChatLive
                ? copyFor(language, 'Phase 1 product chat ab backend se connected hai.', 'Phase 1 product chat is now connected to the backend.')
                : copyFor(language, 'Backend chat abhi respond nahi kar raha, isliye temporary fallback chat chal rahi hai.', 'The backend chat is not responding right now, so a temporary fallback chat is being used.')}
            </span>
            <Button variant={isVoiceMode ? 'primary' : 'secondary'} size="sm" onClick={() => {
              const newMode = !isVoiceMode
              setIsVoiceMode(newMode)
              if (newMode) {
                const lastAssistantMessage = messages.slice().reverse().find(m => m.role === 'assistant')
                if (lastAssistantMessage && lastAssistantMessage.content) {
                  playSynthesizedSpeech(lastAssistantMessage.content)
                }
              } else { 
                stopAudio()
                stopRecording() 
              }
            }}>
              {isVoiceMode ? <Mic className="h-4 w-4 mr-2" /> : <MicOff className="h-4 w-4 mr-2" />}
              {isVoiceMode ? copyFor(language, 'Voice Mode On', 'Voice Mode On') : copyFor(language, 'Voice Mode Off', 'Voice Mode Off')}
            </Button>
          </Card>
          <ChatWindow>
            {messages.map((message) => (
              <ChatMessage key={message.id} role={message.role} content={message.content} timestamp={message.timestamp} />
            ))}
            <div ref={messagesEndRef} />
          </ChatWindow>
          
          {isVoiceMode ? (
            <Card className="flex flex-col items-center justify-center p-6 border-orange-200">
              {isPlaying ? (
                <div className="flex flex-col items-center gap-4">
                  <Volume2 className="h-12 w-12 text-orange-500 animate-pulse" />
                  <p className="text-stone-700 font-medium">
                    {copyFor(language, 'Assistant bol raha hai...', 'Assistant is speaking...')}
                  </p>
                  <Button variant="secondary" onClick={stopAudio}>
                    <Square className="h-4 w-4 mr-2" /> {copyFor(language, 'Roko', 'Stop')}
                  </Button>
                </div>
              ) : isRecording ? (
                <div className="flex flex-col items-center gap-4">
                  <div className="relative">
                    <Mic className="h-12 w-12 text-red-500" />
                    <span className="absolute top-0 right-0 h-3 w-3 animate-ping rounded-full bg-red-400"></span>
                  </div>
                  <p className="text-stone-700 font-medium animate-pulse">
                    {copyFor(language, 'Aapki awaaz sun rahe hain...', 'Listening to you...')}
                  </p>
                  <Button variant="secondary" onClick={stopRecording}>
                    <Square className="h-4 w-4 mr-2" /> {copyFor(language, 'Done', 'Done')}
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4 w-full sm:w-auto">
                  <Button size="lg" className="h-14 w-full rounded-full px-6 text-base shadow-md sm:h-16 sm:w-auto sm:px-8 sm:text-lg" onClick={startRecording} loading={isLoading}>
                    <Mic className="h-5 w-5 mr-2 sm:h-6 sm:w-6" />
                    {copyFor(language, 'Tap karke Boliye', 'Tap to Speak')}
                  </Button>
                </div>
              )}
            </Card>
          ) : (
            <ChatInput onSend={handleChatSend} loading={isLoading} placeholder={copyFor(language, 'Apne product ke baare me likhiye...', 'Write about your product...')} />
          )}
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
            <h2 className="text-xl font-semibold text-stone-900 sm:text-2xl">
              {copyFor(language, 'Phase 2 - Category details aur photos', 'Phase 2 - Category details and photos')}
            </h2>
            <p className="text-sm text-stone-600 sm:text-base">
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
