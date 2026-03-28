import { useMemo, useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { brandAssistStream } from '../../api/chat.api'
import { brandAssistChat, uploadBrandImages } from '../../api/brand.api'
import ChatInput from '../../components/chat/ChatInput'
import ChatMessage from '../../components/chat/ChatMessage'
import ChatWindow from '../../components/chat/ChatWindow'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import Textarea from '../../components/ui/Textarea'
import { useToast } from '../../components/ui/useToast'
import { useCrafts, useCreateBrand } from '../../hooks/useBrand'
import { useVoiceChat } from '../../hooks/useVoiceChat'
import { normalizeBrandExtracted } from '../../lib/chatNormalization'
import { copyFor, useLanguage } from '../../lib/i18n'
import { getErrorMessage } from '../../lib/utils'
import { Mic, Square, Volume2, MicOff } from 'lucide-react'
import type { BrandCreatePayload } from '../../types/brand.types'

interface Message {
  id: string
  role: 'assistant' | 'user'
  content: string
  timestamp: Date
}

type ExtractedFormData = Partial<BrandCreatePayload>

const createMessage = (role: Message['role'], content: string): Message => ({
  id: `${role}-${Date.now()}-${Math.random()}`,
  role,
  content,
  timestamp: new Date(),
})

import type { AppLanguage } from '../../store/uiStore'

const buildBrandPrompt = (language: AppLanguage, isVoiceMode: boolean, crafts: any[]) => {
  const craftChoices = crafts.map((c: any) => `ID: "${c.craft_id}" (${c.display_name})`).join(', ')
  const baseRules = `
You need to collect the following information from the user:
1. craft_id (Must be ONE of exactly these IDs: ${craftChoices})
2. artisan_name (Name of the artisan)
3. region (Location/Village/City)
4. years_of_experience (Numerical years)
5. generations_in_craft (Numerical generations)
6. artisan_story (A short background story)

Important normalization rules:
- script_preference must be: "hindi", "english", or "both"
- preferred_language must be: "${language === 'en' ? 'en' : 'hi'}"

CRITICAL RULE: You must ask a maximum of 10 questions in total across the entire conversation. If you reach 10 questions and still do not have all information, you must immediately wrap up the conversation gracefully.
If the user's answer is unclear, ask a clarification question. Never guess the craft ID if the user statement does not match.`

  if (language === 'hi' || isVoiceMode) {
    return `
You are Idanta's friendly brand assistant helping Indian artisans create their brand.
Speak only in pure Hindi using the Devanagari script. Do not use English words.
Keep every message under 2 sentences. Ask one question at a time. Never use technical jargon.
${baseRules}`.trim()
  } else if (language === 'hg') {
    return `
You are Idanta's friendly brand assistant helping Indian artisans create their brand.
Speak only in easy Hinglish (Hindi written in the English alphabet). Do not reply in pure English or pure Devanagari.
Keep every message under 2 sentences. Ask one question at a time. Never use technical jargon.
${baseRules}`.trim()
  } else {
    return `
You are Idanta's friendly brand assistant helping Indian artisans create their brand.
Speak only in simple English. Do not reply in Hindi or Hinglish.
Keep every message under 2 sentences. Ask one question at a time. Never use technical jargon.
${baseRules}`.trim()
  }
}

export default function OnboardingChatPage() {
  const navigate = useNavigate()
  const { pushToast } = useToast()
  const craftsQuery = useCrafts()
  const createBrandMutation = useCreateBrand()
  const language = useLanguage()
  const [messages, setMessages] = useState<Message[]>([
    createMessage(
      'assistant',
      copyFor(language, 'Namaste. Aap kaunsi kala ya craft karte ho?', 'Hello. Which craft do you practice?'),
    ),
  ])
  const [extractedData, setExtractedData] = useState<ExtractedFormData>({
    preferred_language: language === 'en' ? 'en' : 'hi',
    script_preference: language === 'hi' ? 'hindi' : 'english',
  })
  const [isComplete, setIsComplete] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isBackendChatLive, setIsBackendChatLive] = useState(true)
  const [isVoiceMode, setIsVoiceMode] = useState(false)
  const [mode, setMode] = useState<'chat' | 'form'>('chat')
  const [phase, setPhase] = useState<1 | 2>(1)
  const [files, setFiles] = useState<File[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
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
    language: language,
    onResult: (text) => {
      if (text) handleSend(text)
    },
    onError: (err) => pushToast(err),
  })

  // Auto-scroll to bottom of chat
  useMemo(() => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, 100)
  }, [messages])

  const missingFields = useMemo(() => {
    const required: Array<keyof BrandCreatePayload> = [
      'craft_id',
      'artisan_name',
      'region',
      'years_of_experience',
      'generations_in_craft',
      'script_preference',
      'preferred_language',
    ]
    return required.filter((field) => !extractedData[field])
  }, [extractedData])

  const handleSend = async (message: string) => {
    const userMessage = createMessage('user', message)
    const nextMessages = [...messages, userMessage]
    setMessages(nextMessages)
    setIsLoading(true)

    try {
      let mergedData = extractedData
      let fullMessage = ''
      let spokenLength = 0
      const assistantMessageId = `assistant-${Date.now()}`
      setMessages((current) => [...current, { id: assistantMessageId, role: 'assistant', content: '', timestamp: new Date() }])

      let isFallback = false

      try {
        await brandAssistStream(
          {
            system_prompt: buildBrandPrompt(language, isVoiceMode, craftsQuery.data ?? []),
            messages: nextMessages.map((item) => ({
              role: item.role,
              content: item.content,
            })),
            context: {
              selected_language: language,
              crafts: craftsQuery.data ?? [],
              extracted_data: extractedData,
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
                // Chunk on punctuation or commas to reduce perceived latency
                const sentences = unseen.match(/[^।.?!,\n]+[।.?!,\n]+/g)
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
              const normalizedExtracted = normalizeBrandExtracted(event.extracted ?? {})
              if (normalizedExtracted) {
                mergedData = {
                  ...mergedData,
                  ...normalizedExtracted,
                  preferred_language: language === 'en' ? 'en' : 'hi',
                  script_preference: normalizedExtracted.script_preference ?? mergedData.script_preference ?? (language === 'hi' ? 'hindi' : 'english'),
                }
                setExtractedData(mergedData)
              }
              const requiredFields: Array<keyof BrandCreatePayload> = [
                'craft_id', 'artisan_name', 'region', 'years_of_experience',
                'generations_in_craft', 'script_preference', 'preferred_language'
              ]
              setIsComplete(Boolean(event.is_complete) && requiredFields.every((field) => Boolean(mergedData[field])))
              
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
        // Fallback logic for non-streaming response
        const response = await brandAssistChat(message, extractedData, craftsQuery.data ?? [], language)
        const normalizedExtracted = normalizeBrandExtracted(response.extracted ?? {})
        if (normalizedExtracted) {
          mergedData = {
            ...mergedData,
            ...normalizedExtracted,
            preferred_language: language === 'en' ? 'en' : 'hi',
            script_preference: normalizedExtracted.script_preference ?? mergedData.script_preference ?? (language === 'hi' ? 'hindi' : 'english'),
          }
          setExtractedData(mergedData)
        }
        setMessages((current) => 
          current.map(m => m.id === assistantMessageId ? { ...m, content: response.message } : m)
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
      if (next.length >= 8) {
        pushToast(copyFor(language, 'Max 8 photos upload kar sakte hain, usme se 3 select karni hongi.', 'Max 8 photos allowed, you must select the best 3.'))
        break
      }
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        pushToast(copyFor(language, 'Sirf JPG, PNG ya WEBP allow hain.', 'Only JPG, PNG, or WEBP allowed.'))
        continue
      }
      if (file.size > 5 * 1024 * 1024) {
        pushToast(copyFor(language, 'File 5MB se chhoti honi chahiye.', 'File must be under 5MB.'))
        continue
      }
      next.push(file)
    }
    setFiles(next)
  }

  const submitBrand = async () => {
    if (missingFields.length || isSubmitting) {
      if (mode === 'chat') {
        pushToast(copyFor(language, 'Abhi thodi aur jaankari chahiye.', 'A little more information is still needed.'))
      } else {
        pushToast(copyFor(language, 'Saari fields bharna zaruri hai.', 'All fields are required.'))
      }
      return
    }

    if (files.length > 3) {
      pushToast(copyFor(language, 'Kripya sirf best 3 photos rakhein. Baaki remove karein.', 'Please keep only your best 3 photos. Remove the rest.'))
      return
    }
    
    setIsSubmitting(true)
    
    try {
      let uploadedUrls: string[] = []
      if (files.length > 0) {
        const formData = new FormData()
        files.forEach((file) => formData.append('photos', file))
        uploadedUrls = await uploadBrandImages(formData)
      }
      
      createBrandMutation.mutate(
        {
          ...(extractedData as BrandCreatePayload),
          preferred_language: language === 'en' ? 'en' : 'hi',
          script_preference: extractedData.script_preference ?? (language === 'hi' ? 'hindi' : 'english'),
          reference_images: uploadedUrls
        },
        {
          onSuccess: (data) => navigate(`/jobs/${data.job_id}`),
          onError: (error) => {
            setIsSubmitting(false)
            pushToast(getErrorMessage(error))
          },
        },
      )
    } catch (e) {
      setIsSubmitting(false)
      pushToast(getErrorMessage(e))
    }
  }

  useEffect(() => {
    if (isComplete && phase === 1 && !isSubmitting) {
       if (missingFields.length === 0) {
         setPhase(2)
       } else {
         setMode('form')
         pushToast(copyFor(language, 'Kuch jankari adhoori hai, form se poori karein.', 'Some info is missing, please complete the form.'))
       }
       stopAudio()
       stopRecording()
    }
  }, [isComplete, missingFields.length, isSubmitting, phase, language])

  return (
    <div className="space-y-6">
      <Card className="space-y-3 bg-orange-50">
        <p className="text-sm font-semibold text-orange-700">
          {copyFor(language, 'Chat connection', 'Chat connection')}
        </p>
        <p className="text-base text-stone-700">
          {isBackendChatLive
            ? copyFor(
                language,
                'Brand chat ab backend se connected hai. Agar server issue aaya to safe fallback chat use hoga.',
                'Brand chat is connected to the backend. If the server has an issue, a safe fallback chat will be used.',
              )
            : copyFor(
                language,
                'Backend chat abhi respond nahi kar raha, isliye temporary fallback chat chal rahi hai.',
                'The backend chat is not responding right now, so a temporary fallback chat is being used.',
              )}
        </p>
      </Card>

      <div className="flex gap-3">
        <Button variant={mode === 'chat' ? 'primary' : 'secondary'} onClick={() => setMode('chat')}>
          {copyFor(language, 'Baat karke batao', 'Chat it out')}
        </Button>
        <Button variant={mode === 'form' ? 'primary' : 'secondary'} onClick={() => setMode('form')}>
          {copyFor(language, 'Form bharo', 'Fill the form')}
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_0.9fr]">
        {mode === 'chat' ? (
          <div className="space-y-4">
            <div className="space-y-2">
          <div className="flex flex-col items-start gap-4 pb-2 sm:flex-row sm:items-center sm:justify-between">
            <h1 className="text-2xl font-semibold text-stone-900 sm:text-3xl">
              {copyFor(language, 'Baat karke brand banao', 'Create your brand by chatting')}
            </h1>
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
          </div>
          <p className="text-sm text-stone-600 sm:text-base">
            {copyFor(
              language,
              'Simple sawaal, simple jawaab. Aapka kaam hi sabse important hai.',
              'Simple questions, simple answers. Your craft is the most important.',
            )}
          </p>
        </div>
        <ChatWindow>
          {messages.map((message) => (
            <ChatMessage key={message.id} role={message.role} content={message.content} timestamp={message.timestamp} />
          ))}
          <div ref={messagesEndRef} />
        </ChatWindow>
        
        {isVoiceMode ? (
          <Card className="flex flex-col items-center justify-center p-6 bg-orange-50 border-orange-200">
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
            ) : isProcessingTranscription ? (
              <div className="flex flex-col items-center gap-4">
                <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-orange-500"></div>
                <p className="text-stone-700 font-medium animate-pulse">
                  {copyFor(language, 'Samajh rahe hain...', 'Processing audio...')}
                </p>
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
              <div className="flex flex-col items-center gap-4">
                <Button size="lg" className="h-14 w-full rounded-full px-6 text-base shadow-md sm:h-16 sm:w-auto sm:px-8 sm:text-lg" onClick={startRecording} loading={isLoading}>
                  <Mic className="h-5 w-5 mr-2 sm:h-6 sm:w-6" />
                  {copyFor(language, 'Tap karke Boliye', 'Tap to Speak')}
                </Button>
                <p className="text-center text-xs text-stone-500 sm:text-sm">
                  {copyFor(language, 'Boliye aur hum aapka brand banayenge.', 'Speak and we will build your brand.')}
                </p>
              </div>
            )}
          </Card>
        ) : (
          <ChatInput
            onSend={handleSend}
            loading={isLoading || craftsQuery.isLoading}
            placeholder={copyFor(language, 'Yahan jawaab likhiye...', 'Write your answer here...')}
          />
        )}
        </div>
        ) : (
          <Card className="grid gap-4">
            <Select
              label={copyFor(language, 'Craft', 'Craft')}
              value={extractedData.craft_id ?? ''}
              onChange={(event) => setExtractedData(current => ({...current, craft_id: event.target.value}))}
              options={craftsQuery.data?.map(c => ({ label: c.display_name, value: c.craft_id })) ?? []}
            />
            <Input label={copyFor(language, 'Artisan Name', 'Artisan Name')} value={extractedData.artisan_name ?? ''} onChange={(event) => setExtractedData(current => ({...current, artisan_name: event.target.value}))} />
            <Input label={copyFor(language, 'Region', 'Region')} value={extractedData.region ?? ''} onChange={(event) => setExtractedData(current => ({...current, region: event.target.value}))} />
            <Input type="number" label={copyFor(language, 'Years of Experience', 'Years of Experience')} value={extractedData.years_of_experience ?? ''} onChange={(event) => setExtractedData(current => ({...current, years_of_experience: Number(event.target.value)}))} />
            <Input type="number" label={copyFor(language, 'Generations in Craft', 'Generations in Craft')} value={extractedData.generations_in_craft ?? ''} onChange={(event) => setExtractedData(current => ({...current, generations_in_craft: Number(event.target.value)}))} />
            <Textarea label={copyFor(language, 'Story', 'Story')} value={extractedData.artisan_story ?? ''} onChange={(event) => setExtractedData(current => ({...current, artisan_story: event.target.value}))} />
            {(mode === 'form' || isComplete) && phase === 1 && (
              <Button className="w-full mt-2" size="lg" onClick={() => {
                if (missingFields.length) {
                  pushToast(copyFor(language, 'Saari fields bharna zaruri hai.', 'All fields are required.'))
                  return
                }
                setPhase(2)
              }}>
                {copyFor(language, 'Aage Badhein (Photos)', 'Next (Photos)')}
              </Button>
            )}
          </Card>
        )}

        {phase === 2 && (
          <Card className="col-span-1 lg:col-span-2 space-y-5 animate-in fade-in slide-in-from-bottom-4">
             <div>
              <h2 className="text-xl font-semibold text-stone-900 sm:text-2xl">
                {copyFor(language, 'Phase 2: Apne kaam ki photos', 'Phase 2: Photos of your work')}
              </h2>
              <p className="text-sm text-stone-600 sm:text-base">
                {copyFor(language, 'AI aapki photos dekh kar aapke brand ke rang aur design chusega. Apni best 3 photos hi select karke rakhein.', 'The AI will analyze your photos to select the best colors and designs for your brand. Please keep exactly your best 3 photos.')}
              </p>
            </div>
            
            <div className="space-y-3">
              <label className="flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed border-orange-200 bg-orange-50 px-4 py-6 text-center text-stone-600 transition-colors hover:bg-orange-100">
                <span className="font-medium text-stone-800">{copyFor(language, 'Photo yahan select karo', 'Select photos here')}</span>
                <span className="text-sm">JPG, PNG, WEBP · select max 3 photos</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(event) => handleFiles(event.target.files)} />
              </label>
              
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {files.map((file) => (
                  <div key={`${file.name}-${file.size}`} className="rounded-2xl border border-stone-200 bg-white p-3 text-sm flex flex-col justify-between">
                    <div>
                      <p className="truncate font-medium text-stone-800" title={file.name}>{file.name}</p>
                      <p className="text-stone-500">{Math.round(file.size / 1024)} KB</p>
                    </div>
                    <button type="button" className="mt-2 text-red-600 text-left font-medium" onClick={() => setFiles((current) => current.filter((item) => item !== file))}>
                      {copyFor(language, 'Remove', 'Remove')}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-4 pt-4">
              <Button variant="secondary" onClick={() => setPhase(1)}>
                {copyFor(language, 'Peeche Jao', 'Go Back')}
              </Button>
              <Button className="flex-1" size="lg" loading={isSubmitting || createBrandMutation.isPending} onClick={submitBrand}>
                {copyFor(language, 'Apna Brand Banao', 'Create My Brand')} ({files.length}/3)
              </Button>
            </div>
          </Card>
        )}

        {phase === 1 && (
          <Card className="space-y-4">
            <div>
              <p className="text-sm font-semibold text-orange-600">
                {copyFor(language, 'Brand summary', 'Brand summary')}
              </p>
              <h2 className="text-2xl font-semibold text-stone-900">
                {copyFor(language, 'Jo humne samjha', 'What we understood')}
              </h2>
            </div>
          <SummaryRow label={copyFor(language, 'Craft', 'Craft')} value={extractedData.craft_id} language={language} />
          <SummaryRow label={copyFor(language, 'Naam', 'Name')} value={extractedData.artisan_name} language={language} />
          <SummaryRow label={copyFor(language, 'Jagah', 'Region')} value={extractedData.region} language={language} />
          <SummaryRow
            label={copyFor(language, 'Anubhav', 'Experience')}
            value={extractedData.years_of_experience ? `${extractedData.years_of_experience}` : undefined}
            language={language}
          />
          <SummaryRow
            label={copyFor(language, 'Peedhi', 'Generations')}
            value={extractedData.generations_in_craft ? `${extractedData.generations_in_craft}` : undefined}
            language={language}
          />
          <SummaryRow label={copyFor(language, 'Kahani', 'Story')} value={extractedData.artisan_story} language={language} />
          {isComplete && mode === 'chat' && (
            <p className="text-sm font-medium text-orange-600 mt-2">
              {copyFor(language, 'Jankari complete! Phase 2 loading...', 'Information complete! Loading Phase 2...')}
            </p>
          )}
        </Card>
        )}
      </div>
    </div>
  )
}

function SummaryRow({
  label,
  value,
  language,
}: {
  label: string
  value?: string | number
  language: 'hi' | 'en'
}) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3">
      <p className="text-sm font-medium text-stone-500">{label}</p>
      <p className="text-base text-stone-900">{value || copyFor(language, 'Abhi baaki hai', 'Still pending')}</p>
    </div>
  )
}
