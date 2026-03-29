import { useEffect, useRef, useState } from 'react'
import { ArrowRight, CheckCircle2, Mic, MicOff, Sparkles, Square, Volume2 } from 'lucide-react'
import { brandAssistStream } from '../../api/chat.api'
import { brandAssistChat } from '../../api/brand.api'
import ChatInput from '../../components/chat/ChatInput'
import ChatMessage from '../../components/chat/ChatMessage'
import ChatWindow from '../../components/chat/ChatWindow'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import { useToast } from '../../components/ui/useToast'
import { useCrafts, useGenerateBrandIdentityCandidates, useRankBrandIdentityCandidates, useSaveBrandIdentityDraft } from '../../hooks/useBrand'
import { useVoiceChat } from '../../hooks/useVoiceChat'
import { normalizeBrandExtracted } from '../../lib/chatNormalization'
import { clearOnboardingDraft, loadOnboardingDraft, saveOnboardingDraft, type OnboardingDraftMessage } from '../../lib/onboardingDraft'
import { copyFor, useLanguage } from '../../lib/i18n'
import { getErrorMessage } from '../../lib/utils'
import { useAuthStore } from '../../store/authStore'
import type { AppLanguage } from '../../store/uiStore'
import type { BrandCreatePayload, BrandIdentityPair, CraftItem, RankedBrandIdentityPair } from '../../types/brand.types'

interface Message {
  id: string
  role: 'assistant' | 'user'
  content: string
  timestamp: Date
}

type ExtractedFormData = Partial<BrandCreatePayload>
type OnboardingPhase = 1 | 2

const REQUIRED_PHASE_ONE_FIELDS: Array<keyof BrandCreatePayload> = ['craft_id', 'region', 'years_of_experience', 'generations_in_craft', 'primary_occasion', 'target_customer']
const REQUIRED_PHASE_TWO_FIELDS: Array<keyof BrandCreatePayload> = ['brand_values', 'brand_vision', 'brand_mission']

const createMessage = (role: Message['role'], content: string): Message => ({ id: `${role}-${Date.now()}-${Math.random()}`, role, content, timestamp: new Date() })
const serializeMessages = (messages: Message[]): OnboardingDraftMessage[] => messages.map((message) => ({ ...message, timestamp: message.timestamp.toISOString() }))
const hydrateMessages = (messages: OnboardingDraftMessage[]): Message[] => messages.map((message) => ({ ...message, timestamp: new Date(message.timestamp) }))
const buildPhaseDefaults = (language: AppLanguage, artisanName?: string): ExtractedFormData => ({ artisan_name: artisanName ?? '', preferred_language: language === 'hi' ? 'hi' : 'en', script_preference: language === 'hi' ? 'hindi' : 'english' })
const buildArtisanStory = (data: ExtractedFormData) => [data.brand_values, data.brand_vision, data.brand_mission].filter(Boolean).join('\n\n')
const pairKey = (pair: Pick<BrandIdentityPair, 'pair_id' | 'name' | 'tagline'>) => `${pair.pair_id}::${pair.name.trim().toLowerCase()}::${pair.tagline.trim().toLowerCase()}`

const buildPhaseOnePrompt = (language: AppLanguage, isVoiceMode: boolean, crafts: CraftItem[]) => {
  const craftChoices = crafts.map((craft) => `"${craft.display_name}" => "${craft.craft_id}"`).join(', ')
  const craftExamples = crafts.slice(0, 5).map((craft) => craft.display_name).join(', ')
  const preferredPhaseLanguage = language === 'hi' ? 'hi' : 'hg'
  const baseRules = `You are helping with phase 1 of brand onboarding.
Collect: craft_id from ${craftChoices}; region; years_of_experience; generations_in_craft; primary_occasion from wedding/festival/daily/gifting/home_decor/export/general; target_customer from local_bazaar/tourist/online_india/export.
Rules: artisan_name is already known. Do not ask name. Do not ask story yet. Do not ask brand tone or feel. script_preference must be "${preferredPhaseLanguage === 'hi' ? 'hindi' : 'english'}". preferred_language must be "${preferredPhaseLanguage === 'hi' ? 'hi' : 'en'}". Use only these craft examples: ${craftExamples || craftChoices}. Ask one question at a time. Keep messages under 2 sentences. Once all fields are collected, clearly say phase 1 is complete.`
  if (preferredPhaseLanguage === 'hi' || isVoiceMode) return `You are Idanta's friendly brand assistant helping Indian artisans create their brand. Speak only in pure Hindi using Devanagari script. Do not use English words.\n${baseRules}`
  return `You are Idanta's friendly brand assistant helping Indian artisans create their brand. Speak only in easy Hinglish written in English letters.\n${baseRules}`
}

const buildPhaseTwoPrompt = (language: AppLanguage, isVoiceMode: boolean) => {
  const preferredPhaseLanguage = language === 'hi' ? 'hi' : 'hg'
  const baseRules = `You are helping with phase 2 of brand onboarding.
Collect through indirect reflective questions: brand_values, brand_vision, brand_mission.
Rules: do not ask artisan_name. Do not ask directly for story. Do not repeat craft basics if already collected. Ask one question at a time. Keep messages under 2 sentences. Once all three answers are collected, clearly say phase 2 is complete.`
  if (preferredPhaseLanguage === 'hi' || isVoiceMode) return `You are Idanta's friendly brand assistant helping Indian artisans create their brand. Speak only in pure Hindi using Devanagari script. Do not use English words.\n${baseRules}`
  return `You are Idanta's friendly brand assistant helping Indian artisans create their brand. Speak only in easy Hinglish written in English letters.\n${baseRules}`
}

const buildInitialMessages = (language: AppLanguage, crafts: CraftItem[]) => {
  const craftExamples = crafts.slice(0, 5).map((craft) => craft.display_name).join(', ')
  return [createMessage('assistant', copyFor(language, `Namaste. Aap kaunsi kala karte ho? Jaise: ${craftExamples || 'Batik, Maheshwari'}`, `Hello. Which craft do you practice? For example: ${craftExamples || 'Batik, Maheshwari'}`))]
}

const buildPhaseTwoKickoffMessage = (language: AppLanguage) =>
  createMessage('assistant', copyFor(language, 'Ab phase 2 shuru karte hain. Jab koi aapka product kharidta hai, aap chahte ho ki woh aapke baare me kya mehsoos ya yaad rakhe?', 'Now let us begin phase 2. When someone buys your product, what do you want them to feel or remember about you?'))

const buildIdentityPayload = (data: ExtractedFormData, language: AppLanguage, userName?: string, brandId?: string | null): BrandCreatePayload => {
  const normalizedData = normalizeBrandExtracted(data) ?? data
  const story = (normalizedData.artisan_story ?? buildArtisanStory(normalizedData)).trim()
  const name = normalizedData.name?.trim()
  const tagline = normalizedData.tagline?.trim()
  return {
    ...(brandId ? { brand_id: brandId } : {}),
    craft_id: normalizedData.craft_id ?? '',
    artisan_name: userName ?? normalizedData.artisan_name ?? '',
    region: normalizedData.region ?? '',
    years_of_experience: typeof normalizedData.years_of_experience === 'number' && !Number.isNaN(normalizedData.years_of_experience) ? normalizedData.years_of_experience : 0,
    generations_in_craft: typeof normalizedData.generations_in_craft === 'number' && !Number.isNaN(normalizedData.generations_in_craft) ? normalizedData.generations_in_craft : 1,
    primary_occasion: normalizedData.primary_occasion ?? 'general',
    target_customer: normalizedData.target_customer ?? 'local_bazaar',
    brand_feel: normalizedData.brand_feel ?? 'earthy',
    script_preference: normalizedData.script_preference ?? (language === 'hi' ? 'hindi' : 'english'),
    ...(story ? { artisan_story: story } : {}),
    ...(normalizedData.brand_values ? { brand_values: normalizedData.brand_values } : {}),
    ...(normalizedData.brand_vision ? { brand_vision: normalizedData.brand_vision } : {}),
    ...(normalizedData.brand_mission ? { brand_mission: normalizedData.brand_mission } : {}),
    preferred_language: language === 'hi' ? 'hi' : 'en',
    ...(name ? { name } : {}),
    ...(tagline ? { tagline } : {}),
  }
}

export default function OnboardingChatPage() {
  const { pushToast } = useToast()
  const craftsQuery = useCrafts()
  const language = useLanguage()
  const user = useAuthStore((state) => state.user)
  const generateIdentityMutation = useGenerateBrandIdentityCandidates()
  const rankIdentityMutation = useRankBrandIdentityCandidates()
  const saveIdentityDraftMutation = useSaveBrandIdentityDraft()
  const [messages, setMessages] = useState<Message[]>([])
  const [extractedData, setExtractedData] = useState<ExtractedFormData>(buildPhaseDefaults(language, user?.name))
  const [currentPhase, setCurrentPhase] = useState<OnboardingPhase>(1)
  const [completedPhases, setCompletedPhases] = useState<number[]>([])
  const [isComplete, setIsComplete] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isVoiceMode, setIsVoiceMode] = useState(false)
  const [isDraftReady, setIsDraftReady] = useState(false)
  const [draftBrandId, setDraftBrandId] = useState<string | null>(null)
  const [identitySets, setIdentitySets] = useState<BrandIdentityPair[][]>([])
  const [currentIdentitySetIndex, setCurrentIdentitySetIndex] = useState(0)
  const [shortlistedPairs, setShortlistedPairs] = useState<BrandIdentityPair[]>([])
  const [rankedPairs, setRankedPairs] = useState<RankedBrandIdentityPair[]>([])
  const [recommendedPairId, setRecommendedPairId] = useState<string>()
  const [finalSelectedPair, setFinalSelectedPair] = useState<BrandIdentityPair | null>(null)
  const [rankingPrompt, setRankingPrompt] = useState('')
  const [isIdentityLoading, setIsIdentityLoading] = useState(false)
  const [hasIdentityBootstrapFailed, setHasIdentityBootstrapFailed] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const { isRecording, isPlaying, isProcessingTranscription, startRecording, stopRecording, playSynthesizedSpeech, enqueueSynthesizedSpeech, stopAudio } = useVoiceChat({
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
          setExtractedData({ ...buildPhaseDefaults(language, user.name), ...savedDraft.extractedData, artisan_name: user.name })
          setCurrentPhase(savedDraft.currentPhase)
          setCompletedPhases(savedDraft.completedPhases)
          setIsComplete(savedDraft.completedPhases.includes(2) || savedDraft.isComplete)
          setDraftBrandId(savedDraft.draftBrandId ?? null)
          setIdentitySets(savedDraft.identitySets ?? [])
          setCurrentIdentitySetIndex(savedDraft.currentIdentitySetIndex ?? 0)
          setShortlistedPairs(savedDraft.shortlistedPairs ?? [])
          setRankedPairs(savedDraft.rankedPairs ?? [])
          setRecommendedPairId(savedDraft.recommendedPairId)
          setFinalSelectedPair(savedDraft.finalSelectedPair ?? null)
          setRankingPrompt(savedDraft.rankingPrompt ?? '')
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
      draftBrandId: draftBrandId ?? undefined,
      identitySets,
      currentIdentitySetIndex,
      shortlistedPairs,
      rankedPairs,
      recommendedPairId,
      finalSelectedPair,
      rankingPrompt,
      updatedAt: new Date().toISOString(),
    })
  }, [completedPhases, currentIdentitySetIndex, currentPhase, draftBrandId, extractedData, finalSelectedPair, identitySets, isComplete, isDraftReady, messages, rankedPairs, rankingPrompt, recommendedPairId, shortlistedPairs, user?.id])

  const moveToPhaseTwo = () => {
    setCompletedPhases((current) => (current.includes(1) ? current : [...current, 1]))
    setCurrentPhase(2)
    setMessages((current) => {
      const kickoff = buildPhaseTwoKickoffMessage(language)
      return current.some((message) => message.content === kickoff.content) ? current : [...current, kickoff]
    })
  }

  const completePhaseTwo = (data: ExtractedFormData) => {
    const nextData = { ...data, artisan_story: buildArtisanStory(data) }
    setExtractedData(nextData)
    setCompletedPhases([1, 2])
    setCurrentPhase(2)
    setIsComplete(true)
    return nextData
  }

  const requestIdentitySet = async (setNumber: 1 | 2) => {
    if (!user?.name) return
    setIsIdentityLoading(true)
    try {
      const response = await generateIdentityMutation.mutateAsync({
        ...buildIdentityPayload(extractedData, language, user.name, draftBrandId),
        set_number: setNumber,
        excluded_pairs: setNumber === 2 ? identitySets.flat() : [],
      })
      setIdentitySets((current) => {
        const next = [...current]
        next[setNumber - 1] = response.pairs
        return next
      })
      setCurrentIdentitySetIndex(setNumber - 1)
      setHasIdentityBootstrapFailed(false)
    } catch (error) {
      pushToast(getErrorMessage(error))
      if (setNumber === 1) setHasIdentityBootstrapFailed(true)
    } finally {
      setIsIdentityLoading(false)
    }
  }

  useEffect(() => {
    if (!isDraftReady || !isComplete || identitySets.length > 0 || isIdentityLoading || !user?.name || hasIdentityBootstrapFailed) return
    void requestIdentitySet(1)
  }, [hasIdentityBootstrapFailed, identitySets.length, isComplete, isDraftReady, isIdentityLoading, user?.name])

  const handleSend = async (message: string) => {
    if (!message.trim()) return
    const userMessage = createMessage('user', message.trim())
    const nextMessages = [...messages, userMessage]
    setMessages(nextMessages)
    setIsLoading(true)
    const requiredFields = currentPhase === 1 ? REQUIRED_PHASE_ONE_FIELDS : REQUIRED_PHASE_TWO_FIELDS
    const systemPrompt = currentPhase === 1 ? buildPhaseOnePrompt(language, isVoiceMode, craftsQuery.data ?? []) : buildPhaseTwoPrompt(language, isVoiceMode)
    try {
      let mergedData: ExtractedFormData = { ...extractedData, artisan_name: user?.name ?? extractedData.artisan_name ?? '', preferred_language: language === 'hi' ? 'hi' : 'en', script_preference: language === 'hi' ? 'hindi' : 'english' }
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
            context: { selected_language: language, crafts: craftsQuery.data ?? [], extracted_data: mergedData, onboarding_phase: currentPhase },
          },
          (event) => {
            if (event.type === 'chunk') {
              fullMessage += event.content
              setMessages((current) => current.map((item) => (item.id === assistantMessageId ? { ...item, content: fullMessage } : item)))
              if (isVoiceMode) {
                const unseen = fullMessage.substring(spokenLength)
                const sentences = unseen.match(/[^à¥¤.?!,\n]+[à¥¤.?!,\n]+/g)
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
                if (value !== null && value !== undefined && value !== '') (cleaned as Record<string, unknown>)[key] = value
              }
              mergedData = { ...mergedData, ...cleaned, artisan_name: user?.name ?? mergedData.artisan_name ?? '', preferred_language: language === 'hi' ? 'hi' : 'en', script_preference: language === 'hi' ? 'hindi' : 'english' }
              const hasAllRequired = requiredFields.every((field) => Boolean(mergedData[field]))
              if (currentPhase === 1) {
                setExtractedData(mergedData)
                if (Boolean(event.is_complete) || hasAllRequired) moveToPhaseTwo()
              } else {
                setExtractedData(Boolean(event.is_complete) || hasAllRequired ? completePhaseTwo(mergedData) : mergedData)
              }
              setIsLoading(false)
            } else if (event.type === 'error') {
              pushToast(event.content)
              setIsLoading(false)
            }
          },
        )
      } catch {
        isFallback = true
      }

      if (isFallback) {
        const response = await brandAssistChat(message.trim(), mergedData, craftsQuery.data ?? [], language, undefined, currentPhase)
        const normalizedExtracted = normalizeBrandExtracted(response.extracted ?? {})
        mergedData = { ...mergedData, ...(response.extracted ?? {}), ...(normalizedExtracted ?? {}), artisan_name: user?.name ?? mergedData.artisan_name ?? '', preferred_language: language === 'hi' ? 'hi' : 'en', script_preference: language === 'hi' ? 'hindi' : 'english' }
        setMessages((current) => current.map((item) => (item.id === assistantMessageId ? { ...item, content: response.message } : item)))
        if (isVoiceMode && response.message) playSynthesizedSpeech(response.message)
        const hasAllRequired = requiredFields.every((field) => Boolean(mergedData[field]))
        if (currentPhase === 1) {
          setExtractedData(mergedData)
          if (Boolean(response.is_complete) || hasAllRequired) moveToPhaseTwo()
        } else {
          setExtractedData(Boolean(response.is_complete) || hasAllRequired ? completePhaseTwo(mergedData) : mergedData)
        }
        setIsLoading(false)
      }
    } catch (error) {
      pushToast(getErrorMessage(error))
      setIsLoading(false)
    }
  }

  const toggleShortlist = (pair: BrandIdentityPair) => {
    setShortlistedPairs((current) => {
      const nextKey = pairKey(pair)
      if (current.some((item) => pairKey(item) === nextKey)) return current.filter((item) => pairKey(item) !== nextKey)
      if (current.length >= 3) {
        pushToast(copyFor(language, 'Aap max 3 pairs shortlist kar sakte ho.', 'You can shortlist up to 3 pairs.'))
        return current
      }
      return [...current, pair]
    })
  }

  const handleRankShortlist = async () => {
    if (!user?.name || shortlistedPairs.length === 0) return
    setIsIdentityLoading(true)
    try {
      const response = await rankIdentityMutation.mutateAsync({ ...buildIdentityPayload(extractedData, language, user.name, draftBrandId), selected_pairs: shortlistedPairs })
      setRankedPairs(response.ranked_pairs)
      setRecommendedPairId(response.recommended_pair_id ?? undefined)
      setRankingPrompt(response.next_prompt)
    } catch (error) {
      pushToast(getErrorMessage(error))
    } finally {
      setIsIdentityLoading(false)
    }
  }

  const handleFinalizeIdentity = async (pair: BrandIdentityPair) => {
    if (!user?.name) return
    setIsIdentityLoading(true)
    try {
      const response = await saveIdentityDraftMutation.mutateAsync({
        ...buildIdentityPayload({ ...extractedData, name: pair.name, tagline: pair.tagline }, language, user.name, draftBrandId),
        name: pair.name,
        tagline: pair.tagline,
      })
      setDraftBrandId(response.brand_id)
      setFinalSelectedPair(pair)
      setExtractedData((current) => ({ ...current, name: pair.name, tagline: pair.tagline }))
      pushToast(copyFor(language, 'Ye identity next phase ke liye save ho gayi.', 'This identity has been saved for the next phase.'))
    } catch (error) {
      pushToast(getErrorMessage(error))
    } finally {
      setIsIdentityLoading(false)
    }
  }

  const resetOnboarding = () => {
    if (!user?.id || !craftsQuery.data?.length) return
    void clearOnboardingDraft(user.id)
    setExtractedData(buildPhaseDefaults(language, user.name))
    setMessages(buildInitialMessages(language, craftsQuery.data))
    setCompletedPhases([])
    setCurrentPhase(1)
    setIsComplete(false)
    setDraftBrandId(null)
    setIdentitySets([])
    setCurrentIdentitySetIndex(0)
    setShortlistedPairs([])
    setRankedPairs([])
    setRecommendedPairId(undefined)
    setFinalSelectedPair(null)
    setRankingPrompt('')
    setHasIdentityBootstrapFailed(false)
    stopAudio()
    stopRecording()
  }

  if (!isDraftReady) return <Card>Loading your brand chat...</Card>

  const activeIdentitySet = identitySets[currentIdentitySetIndex] ?? []
  const isIdentityStage = isComplete

  return (
    <div className="space-y-6">
      <Card className="space-y-3 bg-orange-50">
        <p className="text-sm font-semibold text-orange-700">{isIdentityStage ? copyFor(language, 'Brand identity selection', 'Brand identity selection') : copyFor(language, `Phase ${currentPhase}`, `Phase ${currentPhase}`)}</p>
        <p className="text-base text-stone-700">
          {isIdentityStage
            ? copyFor(language, 'Ab aapke context, craft RAG aur example pool ke base par 6-6 brand name aur tagline pairs milenge. Aap dono sets me se max 3 shortlist kar sakte ho.', 'Now you will see 6-by-6 brand name and tagline pairs based on your context, craft RAG, and example pool. You can shortlist up to 3 across both sets.')
            : currentPhase === 1
              ? copyFor(language, 'Hum phase 1 me aapke craft aur business context samajh rahe hain. Progress local draft me save hota rahega.', 'In phase 1, we are collecting your craft and business context. Progress is being saved locally.')
              : copyFor(language, 'Ab phase 2 me hum aapki kahani ko indirect sawaalon se samajh rahe hain, taki brand ke assets aur copy aur gehre ho sakein.', 'In phase 2, we are understanding your story through indirect questions so the brand assets and copy can become richer.')}
        </p>
      </Card>

      {!isIdentityStage ? (
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex flex-col items-start gap-4 pb-2 sm:flex-row sm:items-center sm:justify-between">
              <h1 className="text-2xl font-semibold text-stone-900 sm:text-3xl">{copyFor(language, `Phase ${currentPhase}: Baat karke brand banao`, `Phase ${currentPhase}: Create your brand by chatting`)}</h1>
              <Button
                variant={isVoiceMode ? 'primary' : 'secondary'}
                onClick={() => {
                  const nextMode = !isVoiceMode
                  setIsVoiceMode(nextMode)
                  if (nextMode) {
                    const lastAssistantMessage = messages.slice().reverse().find((message) => message.role === 'assistant' && message.content)
                    if (lastAssistantMessage) playSynthesizedSpeech(lastAssistantMessage.content)
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
                ? copyFor(language, 'Naam, kahani aur tone hum agle phases me lenge. Abhi phase 1 ka zaroori context jama karte hain.', 'Name, story, and tone will come in later phases. Right now we are collecting phase 1 essentials.')
                : copyFor(language, 'Ab hum values, vision aur mission ko natural tareeke se samajh rahe hain.', 'Now we are understanding your values, vision, and mission in a natural way.')}
            </p>
          </div>

          <ChatWindow>
            {messages.map((message) => <ChatMessage key={message.id} role={message.role} content={message.content} timestamp={message.timestamp} />)}
            <div ref={messagesEndRef} />
          </ChatWindow>

          {isVoiceMode ? (
            <Card className="flex flex-col items-center justify-center border-orange-200 bg-orange-50 p-6">
              {isPlaying ? (
                <div className="flex flex-col items-center gap-4">
                  <Volume2 className="h-12 w-12 animate-pulse text-orange-500" />
                  <p className="font-medium text-stone-700">{copyFor(language, 'Assistant bol raha hai...', 'Assistant is speaking...')}</p>
                  <Button variant="secondary" onClick={stopAudio}><Square className="mr-2 h-4 w-4" /> {copyFor(language, 'Roko', 'Stop')}</Button>
                </div>
              ) : isProcessingTranscription ? (
                <div className="flex flex-col items-center gap-4">
                  <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-orange-500" />
                  <p className="animate-pulse font-medium text-stone-700">{copyFor(language, 'Samajh rahe hain...', 'Processing audio...')}</p>
                </div>
              ) : isRecording ? (
                <div className="flex flex-col items-center gap-4">
                  <div className="relative"><Mic className="h-12 w-12 text-red-500" /><span className="absolute right-0 top-0 h-3 w-3 animate-ping rounded-full bg-red-400" /></div>
                  <p className="animate-pulse font-medium text-stone-700">{copyFor(language, 'Aapki awaaz sun rahe hain...', 'Listening to you...')}</p>
                  <Button variant="secondary" onClick={stopRecording}><Square className="mr-2 h-4 w-4" /> {copyFor(language, 'Done', 'Done')}</Button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4">
                  <Button size="lg" className="h-14 w-full rounded-full px-6 text-base shadow-md sm:h-16 sm:w-auto sm:px-8 sm:text-lg" onClick={startRecording} loading={isLoading}><Mic className="mr-2 h-5 w-5 sm:h-6 sm:w-6" />{copyFor(language, 'Tap karke Boliye', 'Tap to Speak')}</Button>
                  <p className="text-center text-xs text-stone-500 sm:text-sm">{copyFor(language, 'Boliye aur hum aapka context save karenge.', 'Speak and we will save your context.')}</p>
                </div>
              )}
            </Card>
          ) : (
            <ChatInput onSend={(value) => void handleSend(value)} loading={isLoading || craftsQuery.isLoading} placeholder={copyFor(language, 'Yahan jawaab likhiye...', 'Yahan jawaab likhiye...')} />
          )}
        </div>
      ) : (
        <div className="space-y-5">
          <Card className="space-y-4 border-orange-200">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-orange-600">{copyFor(language, 'Identity step', 'Identity step')}</p>
                <h1 className="text-2xl font-semibold text-stone-900 sm:text-3xl">{copyFor(language, 'Apne brand ke naam aur tagline chuniye', 'Choose your brand name and tagline')}</h1>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant={currentIdentitySetIndex === 0 ? 'primary' : 'secondary'} onClick={() => setCurrentIdentitySetIndex(0)} disabled={!identitySets[0]}>{copyFor(language, 'Set 1', 'Set 1')}</Button>
                {identitySets[1] ? <Button variant={currentIdentitySetIndex === 1 ? 'primary' : 'secondary'} onClick={() => setCurrentIdentitySetIndex(1)}>{copyFor(language, 'Set 2', 'Set 2')}</Button> : null}
              </div>
            </div>
            <p className="text-sm text-stone-600">{copyFor(language, 'Agar pehla set pasand na aaye to doosra aur final set mangwa sakte ho. Dono sets mila kar max 3 pairs shortlist karo.', 'If you do not like the first set, you can request the second and final set. Shortlist up to 3 pairs across both sets.')}</p>
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-[#1f5c5a]/10 px-3 py-1 text-sm font-medium text-[#1f5c5a]">{copyFor(language, `${shortlistedPairs.length}/3 shortlisted`, `${shortlistedPairs.length}/3 shortlisted`)}</span>
              {!identitySets[1] ? <Button variant="secondary" onClick={() => void requestIdentitySet(2)} loading={isIdentityLoading}><Sparkles className="mr-2 h-4 w-4" />{copyFor(language, 'Doosra set dikhao', 'Show second set')}</Button> : null}
              <Button onClick={() => void handleRankShortlist()} loading={isIdentityLoading} disabled={shortlistedPairs.length === 0}><ArrowRight className="mr-2 h-4 w-4" />{copyFor(language, 'Next: rank my picks', 'Next: rank my picks')}</Button>
            </div>
          </Card>

          {activeIdentitySet.length === 0 ? (
            <Card className="space-y-3">
              <p>{copyFor(language, 'Identity suggestions load ho rahe hain...', 'Identity suggestions are loading...')}</p>
              {hasIdentityBootstrapFailed ? (
                <Button onClick={() => void requestIdentitySet(1)} loading={isIdentityLoading}>
                  <Sparkles className="mr-2 h-4 w-4" />
                  {copyFor(language, 'Suggestions phir se lao', 'Try loading suggestions again')}
                </Button>
              ) : null}
            </Card>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
              {activeIdentitySet.map((pair) => {
                const isSelected = shortlistedPairs.some((item) => pairKey(item) === pairKey(pair))
                return (
                  <Card key={pair.pair_id} className={`space-y-4 border transition ${isSelected ? 'border-[#1f5c5a] shadow-[0_20px_45px_rgba(31,92,90,0.12)]' : 'border-[#1f5c5a]/10'}`}>
                    <div className="space-y-2">
                      <p className="text-2xl font-semibold text-stone-900">{pair.name}</p>
                      <p className="rounded-2xl bg-orange-50 px-4 py-3 text-sm font-medium text-orange-800">{pair.tagline}</p>
                    </div>
                    {pair.why_it_fits ? <p className="text-sm leading-6 text-stone-600">{pair.why_it_fits}</p> : null}
                    <Button variant={isSelected ? 'primary' : 'secondary'} onClick={() => toggleShortlist(pair)}>{isSelected ? copyFor(language, 'Shortlisted', 'Shortlisted') : copyFor(language, 'Shortlist this pair', 'Shortlist this pair')}</Button>
                  </Card>
                )
              })}
            </div>
          )}

          {rankedPairs.length > 0 ? (
            <Card className="space-y-4 border-orange-200 bg-gradient-to-br from-orange-50 to-amber-50">
              <div>
                <p className="text-sm font-semibold text-orange-700">{copyFor(language, 'AI ranking', 'AI ranking')}</p>
                <h2 className="text-2xl font-semibold text-stone-900">{copyFor(language, 'Aapke shortlisted pairs ka analysis', 'Analysis of your shortlisted pairs')}</h2>
                <p className="mt-2 text-sm text-stone-600">{rankingPrompt}</p>
              </div>
              <div className="space-y-3">
                {rankedPairs.slice().sort((a, b) => a.rank - b.rank).map((pair) => {
                  const isRecommended = pair.pair_id === recommendedPairId
                  const isFinal = pair.pair_id === finalSelectedPair?.pair_id
                  return (
                    <Card key={pair.pair_id} className={`space-y-3 ${isRecommended ? 'border-orange-300 bg-white' : ''}`}>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="rounded-full bg-stone-900 px-3 py-1 text-xs font-semibold text-white">#{pair.rank}</span>
                            {isRecommended ? <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-800">{copyFor(language, 'Recommended', 'Recommended')}</span> : null}
                          </div>
                          <p className="text-2xl font-semibold text-stone-900">{pair.name}</p>
                          <p className="rounded-2xl bg-orange-50 px-4 py-3 text-sm font-medium text-orange-800">{pair.tagline}</p>
                        </div>
                        <Button onClick={() => void handleFinalizeIdentity(pair)} loading={isIdentityLoading && isFinal} disabled={Boolean(finalSelectedPair) && !isFinal}>{isFinal ? copyFor(language, 'Finalized', 'Finalized') : copyFor(language, 'Choose this one', 'Choose this one')}</Button>
                      </div>
                      <p className="text-sm leading-6 text-stone-600">{pair.explanation}</p>
                    </Card>
                  )
                })}
              </div>
            </Card>
          ) : null}

          {finalSelectedPair ? (
            <Card className="space-y-3 border-[#1f5c5a]/20 bg-[#1f5c5a]/5">
              <div className="flex items-center gap-2 text-[#1f5c5a]"><CheckCircle2 className="h-5 w-5" /><p className="font-semibold">{copyFor(language, 'Identity saved', 'Identity saved')}</p></div>
              <p className="text-2xl font-semibold text-stone-900">{finalSelectedPair.name}</p>
              <p className="rounded-2xl bg-white px-4 py-3 text-sm font-medium text-stone-700">{finalSelectedPair.tagline}</p>
              <p className="text-sm text-stone-600">{copyFor(language, 'Ye pair DB me pending brand draft ke roop me save ho gaya hai. Phase 3 me isi identity ke saath aage badhenge.', 'This pair has been saved in the database as a pending brand draft. Phase 3 can continue with this identity.')}</p>
            </Card>
          ) : null}
        </div>
      )}

      <Card className="space-y-3">
        <p className="text-sm font-semibold text-stone-700">{copyFor(language, 'Local draft', 'Local draft')}</p>
        <p className="text-sm text-stone-600">{isIdentityStage ? copyFor(language, 'Chat, shortlisted pairs aur final selection sab local draft me save ho rahe hain, taki reload ke baad bhi flow wahi se continue ho.', 'Your chat, shortlisted pairs, and final selection are all saved locally so the flow can continue after reload.') : copyFor(language, 'Aapka ongoing chat local draft me save ho raha hai, taki reload ke baad bhi context bana rahe.', 'Your ongoing chat is being saved locally so the context stays intact after reload.')}</p>
        {(isComplete || messages.length > 1) ? <Button variant="secondary" onClick={resetOnboarding}>{copyFor(language, 'Onboarding dubara shuru karein', 'Restart onboarding')}</Button> : null}
      </Card>
    </div>
  )
}
