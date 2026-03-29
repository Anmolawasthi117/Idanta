import { useEffect, useRef, useState } from 'react'
import { Mic, MicOff, Square, Volume2 } from 'lucide-react'
import { brandAssistStream } from '../../api/chat.api'
import { brandAssistChat } from '../../api/brand.api'
import ChatInput from '../../components/chat/ChatInput'
import ChatMessage from '../../components/chat/ChatMessage'
import ChatWindow from '../../components/chat/ChatWindow'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import { useToast } from '../../components/ui/useToast'
import { useCrafts } from '../../hooks/useBrand'
import { useVoiceChat } from '../../hooks/useVoiceChat'
import { normalizeBrandExtracted } from '../../lib/chatNormalization'
import { clearOnboardingDraft, loadOnboardingDraft, saveOnboardingDraft, type OnboardingDraftMessage } from '../../lib/onboardingDraft'
import { copyFor, useLanguage } from '../../lib/i18n'
import { getErrorMessage } from '../../lib/utils'
import { useAuthStore } from '../../store/authStore'
import type { AppLanguage } from '../../store/uiStore'
import type { BrandCreatePayload, CraftItem } from '../../types/brand.types'

interface Message {
  id: string
  role: 'assistant' | 'user'
  content: string
  timestamp: Date
}

type ExtractedFormData = Partial<BrandCreatePayload>

const REQUIRED_PHASE_ONE_FIELDS: Array<keyof BrandCreatePayload> = [
  'craft_id',
  'region',
  'years_of_experience',
  'generations_in_craft',
  'primary_occasion',
  'target_customer',
]

const createMessage = (role: Message['role'], content: string): Message => ({
  id: `${role}-${Date.now()}-${Math.random()}`,
  role,
  content,
  timestamp: new Date(),
})

const buildBrandPrompt = (language: AppLanguage, isVoiceMode: boolean, crafts: CraftItem[]) => {
  const craftChoices = crafts.map((craft) => `"${craft.display_name}" => "${craft.craft_id}"`).join(', ')
  const craftExamples = crafts.slice(0, 5).map((craft) => craft.display_name).join(', ')
  const preferredPhaseLanguage = language === 'hi' ? 'hi' : 'hg'
  const baseRules = `
You are helping with phase 1 of brand onboarding.

You need to collect the following information from the user:
1. craft_id (Must be ONE of exactly these IDs: ${craftChoices})
2. region (Location, village, town, or city)
3. years_of_experience (Numerical years)
4. generations_in_craft (Numerical generations)
5. primary_occasion (Must be one of: wedding, festival, daily, gifting, home_decor, export, general)
6. target_customer (Must be one of: local_bazaar, tourist, online_india, export)

Important normalization rules:
- artisan_name is already known. Do not ask for the user's name.
- artisan_story will be collected in phase 2. Do not ask for the user's story.
- script_preference must be: "${preferredPhaseLanguage === 'hi' ? 'hindi' : 'english'}"
- preferred_language must be: "${preferredPhaseLanguage === 'hi' ? 'hi' : 'en'}"
- When asking about craft, give examples ONLY from this list: ${craftExamples || craftChoices}
- Do not ask or suggest any craft outside the allowed craft list.
- Ask exactly one question at a time.
- Keep messages under 2 sentences.
- Once all phase 1 fields are collected, clearly say phase 1 is complete.
`.trim()

  if (preferredPhaseLanguage === 'hi' || isVoiceMode) {
    return `
You are Idanta's friendly brand assistant helping Indian artisans create their brand.
Speak only in pure Hindi using Devanagari script. Do not use English words.
${baseRules}
`.trim()
  }

  return `
You are Idanta's friendly brand assistant helping Indian artisans create their brand.
Speak only in easy Hinglish written in English letters.
${baseRules}
`.trim()
}

const buildInitialMessages = (language: AppLanguage, crafts: CraftItem[]) => {
  const craftExamples = crafts.slice(0, 5).map((craft) => craft.display_name).join(', ')
  return [
    createMessage(
      'assistant',
      copyFor(
        language,
        `Namaste. Aap kaunsi kala karte ho? Jaise: ${craftExamples || 'Batik, Maheshwari'}`,
        `Hello. Which craft do you practice? For example: ${craftExamples || 'Batik, Maheshwari'}`,
      ),
    ),
  ]
}

const serializeMessages = (messages: Message[]): OnboardingDraftMessage[] =>
  messages.map((message) => ({
    ...message,
    timestamp: message.timestamp.toISOString(),
  }))

const hydrateMessages = (messages: OnboardingDraftMessage[]): Message[] =>
  messages.map((message) => ({
    ...message,
    timestamp: new Date(message.timestamp),
  }))

const buildPhaseOneDefaults = (language: AppLanguage, artisanName?: string): ExtractedFormData => ({
  artisan_name: artisanName ?? '',
  preferred_language: language === 'hi' ? 'hi' : 'en',
  script_preference: language === 'hi' ? 'hindi' : 'english',
})

export default function OnboardingChatPage() {
  const { pushToast } = useToast()
  const craftsQuery = useCrafts()
  const language = useLanguage()
  const user = useAuthStore((state) => state.user)
  const [messages, setMessages] = useState<Message[]>([])
  const [extractedData, setExtractedData] = useState<ExtractedFormData>(buildPhaseOneDefaults(language, user?.name))
  const [isComplete, setIsComplete] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isBackendChatLive, setIsBackendChatLive] = useState(true)
  const [isVoiceMode, setIsVoiceMode] = useState(false)
  const [isDraftReady, setIsDraftReady] = useState(false)
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
      if (text) void handleSend(text)
    },
    onError: (err) => pushToast(err),
  })

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (!user?.id || !craftsQuery.data?.length || isDraftReady) return

    let active = true

    const restoreDraft = async () => {
      try {
        const savedDraft = await loadOnboardingDraft(user.id)
        if (!active) return

        if (savedDraft) {
          setMessages(hydrateMessages(savedDraft.messages))
          setExtractedData({
            ...buildPhaseOneDefaults(language, user.name),
            ...savedDraft.extractedData,
            artisan_name: user.name,
          })
          setIsComplete(savedDraft.isComplete)
        } else {
          setMessages(buildInitialMessages(language, craftsQuery.data))
        }
      } catch (error) {
        if (!active) return
        setMessages(buildInitialMessages(language, craftsQuery.data))
        console.error('Failed to restore onboarding draft:', error)
      } finally {
        if (active) setIsDraftReady(true)
      }
    }

    void restoreDraft()

    return () => {
      active = false
    }
  }, [craftsQuery.data, isDraftReady, language, user?.id, user?.name])

  useEffect(() => {
    if (!isDraftReady || !user?.id || messages.length === 0) return

    void saveOnboardingDraft({
      userId: user.id,
      currentPhase: 1,
      completedPhases: isComplete ? [1] : [],
      messages: serializeMessages(messages),
      extractedData,
      isComplete,
      updatedAt: new Date().toISOString(),
    })
  }, [extractedData, isComplete, isDraftReady, messages, user?.id])

  const handleSend = async (message: string) => {
    if (!message.trim()) return

    const userMessage = createMessage('user', message.trim())
    const nextMessages = [...messages, userMessage]
    setMessages(nextMessages)
    setIsLoading(true)

    try {
      let mergedData: ExtractedFormData = {
        ...extractedData,
        artisan_name: user?.name ?? extractedData.artisan_name ?? '',
        preferred_language: language === 'hi' ? 'hi' : 'en',
        script_preference: language === 'hi' ? 'hindi' : 'english',
      }
      let fullMessage = ''
      let spokenLength = 0
      const assistantMessageId = `assistant-${Date.now()}`

      setMessages((current) => [
        ...current,
        { id: assistantMessageId, role: 'assistant', content: '', timestamp: new Date() },
      ])

      let isFallback = false

      try {
        await brandAssistStream(
          {
            system_prompt: buildBrandPrompt(language, isVoiceMode, craftsQuery.data ?? []),
            messages: nextMessages.map((item) => ({ role: item.role, content: item.content })),
            context: {
              selected_language: language,
              crafts: craftsQuery.data ?? [],
              extracted_data: mergedData,
              onboarding_phase: 1,
            },
          },
          (event) => {
            if (event.type === 'chunk') {
              fullMessage += event.content
              setMessages((current) =>
                current.map((item) => (item.id === assistantMessageId ? { ...item, content: fullMessage } : item)),
              )

              if (isVoiceMode) {
                const unseen = fullMessage.substring(spokenLength)
                const sentences = unseen.match(/[^।.?!,\n]+[।.?!,\n]+/g)
                if (sentences) {
                  for (const sentence of sentences) {
                    spokenLength += sentence.length
                    enqueueSynthesizedSpeech(sentence)
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
                const cleaned: ExtractedFormData = {}
                for (const [key, value] of Object.entries(normalizedExtracted)) {
                  if (value !== null && value !== undefined && value !== '') {
                    ;(cleaned as Record<string, unknown>)[key] = value
                  }
                }

                mergedData = {
                  ...mergedData,
                  ...cleaned,
                  artisan_name: user?.name ?? mergedData.artisan_name ?? '',
                  preferred_language: language === 'hi' ? 'hi' : 'en',
                  script_preference: language === 'hi' ? 'hindi' : 'english',
                }
              }

              setExtractedData(mergedData)
              const hasAllRequired = REQUIRED_PHASE_ONE_FIELDS.every((field) => Boolean(mergedData[field]))
              setIsComplete(Boolean(event.is_complete) || hasAllRequired)
              setIsLoading(false)
            } else if (event.type === 'error') {
              pushToast(event.content)
              setIsLoading(false)
            }
          },
        )
        setIsBackendChatLive(true)
      } catch {
        setIsBackendChatLive(false)
        isFallback = true
      }

      if (isFallback) {
        const response = await brandAssistChat(message.trim(), mergedData, craftsQuery.data ?? [], language)
        const normalizedExtracted = normalizeBrandExtracted(response.extracted ?? {})
        if (normalizedExtracted) {
          mergedData = {
            ...mergedData,
            ...normalizedExtracted,
            artisan_name: user?.name ?? mergedData.artisan_name ?? '',
            preferred_language: language === 'hi' ? 'hi' : 'en',
            script_preference: language === 'hi' ? 'hindi' : 'english',
          }
        }

        setExtractedData(mergedData)
        setMessages((current) =>
          current.map((item) => (item.id === assistantMessageId ? { ...item, content: response.message } : item)),
        )

        if (isVoiceMode && response.message) {
          playSynthesizedSpeech(response.message)
        }

        const hasAllRequired = REQUIRED_PHASE_ONE_FIELDS.every((field) => Boolean(mergedData[field]))
        setIsComplete(Boolean(response.is_complete) || hasAllRequired)
        setIsLoading(false)
      }
    } catch (error) {
      pushToast(getErrorMessage(error))
      setIsLoading(false)
    }
  }

  if (!isDraftReady) {
    return <Card>Loading your brand chat...</Card>
  }

  return (
    <div className="space-y-6">
      <Card className="space-y-3 bg-orange-50">
        <p className="text-sm font-semibold text-orange-700">{copyFor(language, 'Phase 1', 'Phase 1')}</p>
        <p className="text-base text-stone-700">
          {isBackendChatLive
            ? copyFor(
                language,
                'Hum phase 1 me aapke craft, jagah, anubhav aur brand direction samajh rahe hain. Aapka progress local draft me save hota rahega.',
                'In phase 1, we are collecting your craft, region, experience, and brand direction. Your progress is being saved locally.',
              )
            : copyFor(
                language,
                'Backend chat abhi respond nahi kar raha, isliye temporary fallback chat chal rahi hai. Aapka progress fir bhi local draft me save ho raha hai.',
                'The backend chat is not responding right now, so a temporary fallback chat is running. Your progress is still being saved locally.',
              )}
        </p>
      </Card>

      <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex flex-col items-start gap-4 pb-2 sm:flex-row sm:items-center sm:justify-between">
              <h1 className="text-2xl font-semibold text-stone-900 sm:text-3xl">
                {copyFor(language, 'Phase 1: Baat karke brand banao', 'Phase 1: Create your brand by chatting')}
              </h1>
              <Button
                variant={isVoiceMode ? 'primary' : 'secondary'}
                onClick={() => {
                  const nextMode = !isVoiceMode
                  setIsVoiceMode(nextMode)
                  if (nextMode) {
                    const lastAssistantMessage = messages
                      .slice()
                      .reverse()
                      .find((message) => message.role === 'assistant' && message.content)
                    if (lastAssistantMessage) {
                      playSynthesizedSpeech(lastAssistantMessage.content)
                    }
                  } else {
                    stopAudio()
                    stopRecording()
                  }
                }}
              >
                {isVoiceMode ? <Mic className="mr-2 h-4 w-4" /> : <MicOff className="mr-2 h-4 w-4" />}
                {isVoiceMode ? copyFor(language, 'Voice Mode On', 'Voice Mode On') : copyFor(language, 'Voice Mode Off', 'Voice Mode Off')}
              </Button>
            </div>
            <p className="text-sm text-stone-600 sm:text-base">
              {copyFor(
                language,
                'Naam aur kahani hum baad me lenge. Abhi sirf phase 1 ka zaroori context jama karte hain.',
                'We will ask for the name and story in later steps. Right now we are only collecting phase 1 essentials.',
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
            <Card className="flex flex-col items-center justify-center border-orange-200 bg-orange-50 p-6">
              {isPlaying ? (
                <div className="flex flex-col items-center gap-4">
                  <Volume2 className="h-12 w-12 animate-pulse text-orange-500" />
                  <p className="font-medium text-stone-700">
                    {copyFor(language, 'Assistant bol raha hai...', 'Assistant is speaking...')}
                  </p>
                  <Button variant="secondary" onClick={stopAudio}>
                    <Square className="mr-2 h-4 w-4" /> {copyFor(language, 'Roko', 'Stop')}
                  </Button>
                </div>
              ) : isProcessingTranscription ? (
                <div className="flex flex-col items-center gap-4">
                  <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-orange-500" />
                  <p className="animate-pulse font-medium text-stone-700">
                    {copyFor(language, 'Samajh rahe hain...', 'Processing audio...')}
                  </p>
                </div>
              ) : isRecording ? (
                <div className="flex flex-col items-center gap-4">
                  <div className="relative">
                    <Mic className="h-12 w-12 text-red-500" />
                    <span className="absolute right-0 top-0 h-3 w-3 animate-ping rounded-full bg-red-400" />
                  </div>
                  <p className="animate-pulse font-medium text-stone-700">
                    {copyFor(language, 'Aapki awaaz sun rahe hain...', 'Listening to you...')}
                  </p>
                  <Button variant="secondary" onClick={stopRecording}>
                    <Square className="mr-2 h-4 w-4" /> {copyFor(language, 'Done', 'Done')}
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4">
                  <Button size="lg" className="h-14 w-full rounded-full px-6 text-base shadow-md sm:h-16 sm:w-auto sm:px-8 sm:text-lg" onClick={startRecording} loading={isLoading}>
                    <Mic className="mr-2 h-5 w-5 sm:h-6 sm:w-6" />
                    {copyFor(language, 'Tap karke Boliye', 'Tap to Speak')}
                  </Button>
                  <p className="text-center text-xs text-stone-500 sm:text-sm">
                    {copyFor(language, 'Boliye aur hum phase 1 ka context save karenge.', 'Speak and we will save your phase 1 context.')}
                  </p>
                </div>
              )}
            </Card>
          ) : (
            <ChatInput
              onSend={(value) => void handleSend(value)}
              loading={isLoading || craftsQuery.isLoading}
              placeholder={copyFor(language, 'Yahan jawaab likhiye...', 'Yahan jawaab likhiye...')}
            />
          )}
          <Card className="space-y-3">
            <p className="text-sm font-semibold text-stone-700">{copyFor(language, 'Local draft', 'Local draft')}</p>
            <p className="text-sm text-stone-600">
              {isComplete
                ? copyFor(
                    language,
                    'Phase 1 complete ho chuka hai aur aapka progress local draft me save hai. Reload karne par bhi yahi context milega.',
                    'Phase 1 is complete and your progress is saved locally. Even after a reload, this context will still be here.',
                  )
                : copyFor(
                    language,
                    'Aapka ongoing chat aur summary local draft me save ho raha hai, taki reload ke baad bhi kuch na kho jaaye.',
                    'Your ongoing chat and summary are being saved locally so nothing gets lost after a reload.',
                  )}
            </p>
            {isComplete ? (
              <Button
                variant="secondary"
                onClick={() => {
                  if (!user?.id || !craftsQuery.data?.length) return
                  void clearOnboardingDraft(user.id)
                  setExtractedData({
                    ...buildPhaseOneDefaults(language, user.name),
                  })
                  setMessages(buildInitialMessages(language, craftsQuery.data))
                  setIsComplete(false)
                  stopAudio()
                  stopRecording()
                }}
              >
                {copyFor(language, 'Phase 1 dubara shuru karein', 'Restart phase 1')}
              </Button>
            ) : null}
          </Card>
      </div>
    </div>
  )
}
