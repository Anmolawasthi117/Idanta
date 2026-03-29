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
type OnboardingPhase = 1 | 2

const REQUIRED_PHASE_ONE_FIELDS: Array<keyof BrandCreatePayload> = [
  'craft_id',
  'region',
  'years_of_experience',
  'generations_in_craft',
  'primary_occasion',
  'target_customer',
]

const REQUIRED_PHASE_TWO_FIELDS: Array<keyof BrandCreatePayload> = ['brand_values', 'brand_vision', 'brand_mission']

const createMessage = (role: Message['role'], content: string): Message => ({
  id: `${role}-${Date.now()}-${Math.random()}`,
  role,
  content,
  timestamp: new Date(),
})

const buildPhaseOnePrompt = (language: AppLanguage, isVoiceMode: boolean, crafts: CraftItem[]) => {
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
- artisan_story will be collected in later phases. Do not ask for the user's story yet.
- brand_feel will be collected in a later phase. Do not ask about brand tone or brand feel.
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

const buildPhaseTwoPrompt = (language: AppLanguage, isVoiceMode: boolean) => {
  const preferredPhaseLanguage = language === 'hi' ? 'hi' : 'hg'
  const baseRules = `
You are helping with phase 2 of brand onboarding.

You need to collect the following information through indirect reflective questions:
1. brand_values
Question intent: What should a buyer feel or remember about the maker and the work?
2. brand_vision
Question intent: In a few years, what would the artisan love people to say about the work?
3. brand_mission
Question intent: Why does the artisan continue this work every day?

Important normalization rules:
- Do not ask for artisan_name.
- Do not ask directly for "story". Ask warm reflective questions instead.
- Do not ask about craft basics again if they are already collected.
- Ask exactly one question at a time.
- Keep messages under 2 sentences.
- Once all three answers are collected, clearly say phase 2 is complete.
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

const buildPhaseTwoKickoffMessage = (language: AppLanguage) =>
  createMessage(
    'assistant',
    copyFor(
      language,
      'Ab phase 2 shuru karte hain. Jab koi aapka product kharidta hai, aap chahte ho ki woh aapke baare me kya mehsoos ya yaad rakhe?',
      'Now let us begin phase 2. When someone buys your product, what do you want them to feel or remember about you?',
    ),
  )

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

const buildPhaseDefaults = (language: AppLanguage, artisanName?: string): ExtractedFormData => ({
  artisan_name: artisanName ?? '',
  preferred_language: language === 'hi' ? 'hi' : 'en',
  script_preference: language === 'hi' ? 'hindi' : 'english',
})

const buildArtisanStory = (data: ExtractedFormData) => {
  const parts = [data.brand_values, data.brand_vision, data.brand_mission].filter(Boolean)
  return parts.join('\n\n')
}

export default function OnboardingChatPage() {
  const { pushToast } = useToast()
  const craftsQuery = useCrafts()
  const language = useLanguage()
  const user = useAuthStore((state) => state.user)
  const [messages, setMessages] = useState<Message[]>([])
  const [extractedData, setExtractedData] = useState<ExtractedFormData>(buildPhaseDefaults(language, user?.name))
  const [currentPhase, setCurrentPhase] = useState<OnboardingPhase>(1)
  const [completedPhases, setCompletedPhases] = useState<number[]>([])
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
            ...buildPhaseDefaults(language, user.name),
            ...savedDraft.extractedData,
            artisan_name: user.name,
          })
          setCurrentPhase(savedDraft.currentPhase)
          setCompletedPhases(savedDraft.completedPhases)
          setIsComplete(savedDraft.completedPhases.includes(2) || savedDraft.isComplete)
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
      currentPhase,
      completedPhases,
      messages: serializeMessages(messages),
      extractedData,
      isComplete,
      updatedAt: new Date().toISOString(),
    })
  }, [completedPhases, currentPhase, extractedData, isComplete, isDraftReady, messages, user?.id])

  const moveToPhaseTwo = () => {
    setCompletedPhases((current) => (current.includes(1) ? current : [...current, 1]))
    setCurrentPhase(2)
    setMessages((current) => {
      if (current.some((message) => message.content === buildPhaseTwoKickoffMessage(language).content)) {
        return current
      }
      return [...current, buildPhaseTwoKickoffMessage(language)]
    })
  }

  const completePhaseTwo = (data: ExtractedFormData) => {
    const nextData = {
      ...data,
      artisan_story: buildArtisanStory(data),
    }
    setExtractedData(nextData)
    setCompletedPhases([1, 2])
    setCurrentPhase(2)
    setIsComplete(true)
    return nextData
  }

  const handleSend = async (message: string) => {
    if (!message.trim()) return

    const userMessage = createMessage('user', message.trim())
    const nextMessages = [...messages, userMessage]
    setMessages(nextMessages)
    setIsLoading(true)

    const requiredFields = currentPhase === 1 ? REQUIRED_PHASE_ONE_FIELDS : REQUIRED_PHASE_TWO_FIELDS
    const systemPrompt =
      currentPhase === 1 ? buildPhaseOnePrompt(language, isVoiceMode, craftsQuery.data ?? []) : buildPhaseTwoPrompt(language, isVoiceMode)

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

      setMessages((current) => [...current, { id: assistantMessageId, role: 'assistant', content: '', timestamp: new Date() }])

      let isFallback = false

      try {
        await brandAssistStream(
          {
            system_prompt: systemPrompt,
            messages: nextMessages.map((item) => ({ role: item.role, content: item.content })),
            context: {
              selected_language: language,
              crafts: craftsQuery.data ?? [],
              extracted_data: mergedData,
              onboarding_phase: currentPhase,
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
              const cleaned: ExtractedFormData = {}
              for (const [key, value] of Object.entries({ ...(event.extracted ?? {}), ...(normalizedExtracted ?? {}) })) {
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

              const hasAllRequired = requiredFields.every((field) => Boolean(mergedData[field]))

              if (currentPhase === 1) {
                setExtractedData(mergedData)
                if (Boolean(event.is_complete) || hasAllRequired) {
                  moveToPhaseTwo()
                }
              } else {
                const completedData = Boolean(event.is_complete) || hasAllRequired ? completePhaseTwo(mergedData) : mergedData
                setExtractedData(completedData)
              }

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
        const response = await brandAssistChat(message.trim(), mergedData, craftsQuery.data ?? [], language, undefined, currentPhase)
        const normalizedExtracted = normalizeBrandExtracted(response.extracted ?? {})
        mergedData = {
          ...mergedData,
          ...(response.extracted ?? {}),
          ...(normalizedExtracted ?? {}),
          artisan_name: user?.name ?? mergedData.artisan_name ?? '',
          preferred_language: language === 'hi' ? 'hi' : 'en',
          script_preference: language === 'hi' ? 'hindi' : 'english',
        }

        setMessages((current) =>
          current.map((item) => (item.id === assistantMessageId ? { ...item, content: response.message } : item)),
        )

        if (isVoiceMode && response.message) {
          playSynthesizedSpeech(response.message)
        }

        const hasAllRequired = requiredFields.every((field) => Boolean(mergedData[field]))

        if (currentPhase === 1) {
          setExtractedData(mergedData)
          if (Boolean(response.is_complete) || hasAllRequired) {
            moveToPhaseTwo()
          }
        } else {
          const completedData = Boolean(response.is_complete) || hasAllRequired ? completePhaseTwo(mergedData) : mergedData
          setExtractedData(completedData)
        }

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
        <p className="text-sm font-semibold text-orange-700">{copyFor(language, `Phase ${currentPhase}`, `Phase ${currentPhase}`)}</p>
        <p className="text-base text-stone-700">
          {currentPhase === 1
            ? copyFor(
                language,
                'Hum phase 1 me aapke craft aur business context samajh rahe hain. Progress local draft me save hota rahega.',
                'In phase 1, we are collecting your craft and business context. Progress is being saved locally.',
              )
            : copyFor(
                language,
                'Ab phase 2 me hum aapki kahani ko indirect sawaalon se samajh rahe hain, taki brand ke assets aur copy aur gehre ho sakein.',
                'In phase 2, we are understanding your story through indirect questions so the brand assets and copy can become richer.',
              )}
        </p>
      </Card>

      <div className="space-y-4">
        <div className="space-y-2">
          <div className="flex flex-col items-start gap-4 pb-2 sm:flex-row sm:items-center sm:justify-between">
            <h1 className="text-2xl font-semibold text-stone-900 sm:text-3xl">
              {copyFor(language, `Phase ${currentPhase}: Baat karke brand banao`, `Phase ${currentPhase}: Create your brand by chatting`)}
            </h1>
            <Button
              variant={isVoiceMode ? 'primary' : 'secondary'}
              onClick={() => {
                const nextMode = !isVoiceMode
                setIsVoiceMode(nextMode)
                if (nextMode) {
                  const lastAssistantMessage = messages.slice().reverse().find((message) => message.role === 'assistant' && message.content)
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
            {currentPhase === 1
              ? copyFor(
                  language,
                  'Naam, kahani aur tone hum agle phases me lenge. Abhi phase 1 ka zaroori context jama karte hain.',
                  'Name, story, and tone will come in later phases. Right now we are collecting phase 1 essentials.',
                )
              : copyFor(
                  language,
                  'Ab hum values, vision aur mission ko natural tareeke se samajh rahe hain.',
                  'Now we are understanding your values, vision, and mission in a natural way.',
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
                <p className="font-medium text-stone-700">{copyFor(language, 'Assistant bol raha hai...', 'Assistant is speaking...')}</p>
                <Button variant="secondary" onClick={stopAudio}>
                  <Square className="mr-2 h-4 w-4" /> {copyFor(language, 'Roko', 'Stop')}
                </Button>
              </div>
            ) : isProcessingTranscription ? (
              <div className="flex flex-col items-center gap-4">
                <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-orange-500" />
                <p className="animate-pulse font-medium text-stone-700">{copyFor(language, 'Samajh rahe hain...', 'Processing audio...')}</p>
              </div>
            ) : isRecording ? (
              <div className="flex flex-col items-center gap-4">
                <div className="relative">
                  <Mic className="h-12 w-12 text-red-500" />
                  <span className="absolute right-0 top-0 h-3 w-3 animate-ping rounded-full bg-red-400" />
                </div>
                <p className="animate-pulse font-medium text-stone-700">{copyFor(language, 'Aapki awaaz sun rahe hain...', 'Listening to you...')}</p>
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
                  {copyFor(language, 'Boliye aur hum aapka context save karenge.', 'Speak and we will save your context.')}
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
                  'Phase 1 aur phase 2 complete ho chuke hain. Aapka sara progress local draft me save hai.',
                  'Phase 1 and phase 2 are complete. Your full progress is saved locally.',
                )
              : copyFor(
                  language,
                  'Aapka ongoing chat local draft me save ho raha hai, taki reload ke baad bhi context bana rahe.',
                  'Your ongoing chat is being saved locally so the context stays intact after reload.',
                )}
          </p>
          {isComplete ? (
            <Button
              variant="secondary"
              onClick={() => {
                if (!user?.id || !craftsQuery.data?.length) return
                void clearOnboardingDraft(user.id)
                setExtractedData(buildPhaseDefaults(language, user.name))
                setMessages(buildInitialMessages(language, craftsQuery.data))
                setCompletedPhases([])
                setCurrentPhase(1)
                setIsComplete(false)
                stopAudio()
                stopRecording()
              }}
            >
              {copyFor(language, 'Onboarding dubara shuru karein', 'Restart onboarding')}
            </Button>
          ) : null}
        </Card>
      </div>
    </div>
  )
}
