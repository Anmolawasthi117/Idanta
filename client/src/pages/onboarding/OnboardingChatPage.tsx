import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, CheckCircle2, Mic, MicOff, Sparkles, Square, Volume2 } from 'lucide-react'
import { brandAssistStream } from '../../api/chat.api'
import { brandAssistChat, uploadBrandImages } from '../../api/brand.api'
import ChatInput from '../../components/chat/ChatInput'
import ChatMessage from '../../components/chat/ChatMessage'
import ChatWindow from '../../components/chat/ChatWindow'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import { useToast } from '../../components/ui/useToast'
import { useAnalyzeBrandVisualFoundation, useCrafts, useGenerateBrandIdentityCandidates, useGenerateBrandPhaseFourCandidates, useRankBrandIdentityCandidates, useSaveBrandIdentityDraft, useSelectBrandPhaseFourAssets, useSelectBrandPaletteOption } from '../../hooks/useBrand'
import { useVoiceChat } from '../../hooks/useVoiceChat'
import { normalizeBrandExtracted } from '../../lib/chatNormalization'
import { clearOnboardingDraft, loadOnboardingDraft, saveOnboardingDraft, type OnboardingDraftMessage } from '../../lib/onboardingDraft'
import { copyFor, useLanguage } from '../../lib/i18n'
import { getErrorMessage } from '../../lib/utils'
import { useAuthStore } from '../../store/authStore'
import type { AppLanguage } from '../../store/uiStore'
import type { BrandAssetCandidate, BrandCreatePayload, BrandIdentityPair, BrandPaletteOption, BrandPhaseFourCandidates, BrandVisualFoundation, CraftItem, RankedBrandIdentityPair } from '../../types/brand.types'

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
const paletteSwatches = (option: BrandPaletteOption) => [
  ['Primary', option.palette.primary],
  ['Secondary', option.palette.secondary],
  ['Accent', option.palette.accent],
  ['Background', option.palette.background ?? '#F5E6C8'],
]
const normalizeVisualFoundation = (foundation: BrandVisualFoundation | null | undefined): BrandVisualFoundation | null => {
  if (!foundation) return null
  const palette = foundation.palette ?? {
    primary: '#8B2635',
    secondary: '#4A7C59',
    accent: '#C4963B',
    background: '#F5E6C8',
  }
  const paletteOptions = Array.isArray(foundation.palette_options) ? foundation.palette_options : []
  const recommendedPaletteId = foundation.recommended_palette_id ?? paletteOptions[0]?.option_id ?? null
  const selectedPaletteId = foundation.selected_palette_id ?? null
  return {
    ...foundation,
    visual_motifs: Array.isArray(foundation.visual_motifs) ? foundation.visual_motifs : [],
    motif_previews: Array.isArray(foundation.motif_previews) ? foundation.motif_previews : [],
    signature_patterns: Array.isArray(foundation.signature_patterns) ? foundation.signature_patterns : [],
    palette,
    palette_options: paletteOptions,
    recommended_palette_id: recommendedPaletteId,
    selected_palette_id: selectedPaletteId,
  }
}
const getSavedReferenceImages = (foundation: BrandVisualFoundation | null | undefined, extractedData: ExtractedFormData) =>
  Array.isArray(foundation?.reference_images) && foundation.reference_images.length > 0
    ? foundation.reference_images
    : Array.isArray(extractedData.reference_images)
      ? extractedData.reference_images
      : []
const normalizePhaseFourCandidates = (candidates: BrandPhaseFourCandidates | null | undefined): BrandPhaseFourCandidates | null => {
  if (!candidates) return null
  return {
    brand_id: candidates.brand_id,
    logos: Array.isArray(candidates.logos) ? candidates.logos : [],
    banners: Array.isArray(candidates.banners) ? candidates.banners : [],
  }
}

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
  const navigate = useNavigate()
  const { pushToast } = useToast()
  const craftsQuery = useCrafts()
  const language = useLanguage()
  const user = useAuthStore((state) => state.user)
  const generateIdentityMutation = useGenerateBrandIdentityCandidates()
  const rankIdentityMutation = useRankBrandIdentityCandidates()
  const saveIdentityDraftMutation = useSaveBrandIdentityDraft()
  const analyzeVisualFoundationMutation = useAnalyzeBrandVisualFoundation()
  const selectPaletteMutation = useSelectBrandPaletteOption()
  const generatePhaseFourCandidatesMutation = useGenerateBrandPhaseFourCandidates()
  const selectPhaseFourAssetsMutation = useSelectBrandPhaseFourAssets()
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
  const [selectedVisualFiles, setSelectedVisualFiles] = useState<File[]>([])
  const [visualFoundation, setVisualFoundation] = useState<BrandVisualFoundation | null>(null)
  const [phaseFourCandidates, setPhaseFourCandidates] = useState<BrandPhaseFourCandidates | null>(null)
  const [selectedLogoCandidateId, setSelectedLogoCandidateId] = useState<string>()
  const [selectedBannerCandidateId, setSelectedBannerCandidateId] = useState<string>()
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
          setVisualFoundation(normalizeVisualFoundation(savedDraft.visualFoundation))
          setPhaseFourCandidates(normalizePhaseFourCandidates(savedDraft.phaseFourCandidates))
          setSelectedLogoCandidateId(savedDraft.selectedLogoCandidateId)
          setSelectedBannerCandidateId(savedDraft.selectedBannerCandidateId)
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
      visualFoundation,
      phaseFourCandidates,
      selectedLogoCandidateId,
      selectedBannerCandidateId,
      updatedAt: new Date().toISOString(),
    })
  }, [completedPhases, currentIdentitySetIndex, currentPhase, draftBrandId, extractedData, finalSelectedPair, identitySets, isComplete, isDraftReady, messages, phaseFourCandidates, rankedPairs, rankingPrompt, recommendedPairId, selectedBannerCandidateId, selectedLogoCandidateId, shortlistedPairs, user?.id, visualFoundation])

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
      setPhaseFourCandidates(null)
      setSelectedLogoCandidateId(undefined)
      setSelectedBannerCandidateId(undefined)
      setExtractedData((current) => ({ ...current, name: pair.name, tagline: pair.tagline }))
      pushToast(copyFor(language, 'Ye identity next phase ke liye save ho gayi.', 'This identity has been saved for the next phase.'))
    } catch (error) {
      pushToast(getErrorMessage(error))
    } finally {
      setIsIdentityLoading(false)
    }
  }

  const handleAnalyzeVisualFoundation = async () => {
    if (!user?.name || !draftBrandId) return
    setIsIdentityLoading(true)
    try {
      let uploadedUrls: string[] = []
      if (selectedVisualFiles.length > 0) {
        const formData = new FormData()
        selectedVisualFiles.forEach((file) => formData.append('photos', file))
        uploadedUrls = await uploadBrandImages(formData)
      }

      if (uploadedUrls.length === 0) {
        pushToast(copyFor(language, 'Phase 3 visuals banane ke liye pehle images select ya upload kijiye.', 'Please select or upload images before generating Phase 3 visuals.'))
        return
      }

      const response = await analyzeVisualFoundationMutation.mutateAsync({
        ...buildIdentityPayload(extractedData, language, user.name, draftBrandId),
        brand_id: draftBrandId,
        reference_images: uploadedUrls,
        generate_visual_assets: false,
      })
      setVisualFoundation(normalizeVisualFoundation(response))
      setExtractedData((current) => ({ ...current, reference_images: uploadedUrls }))
      pushToast(copyFor(language, 'Palette options ready ho gaye.', 'Palette options are ready.'))
    } catch (error) {
      pushToast(getErrorMessage(error))
    } finally {
      setIsIdentityLoading(false)
    }
  }

  const handleGenerateMotifsAndPatterns = async () => {
    if (!user?.name || !draftBrandId) return
    const referenceImages = getSavedReferenceImages(visualFoundation, extractedData)
    if (referenceImages.length === 0) {
      pushToast(copyFor(language, 'Motif aur pattern visuals ke liye pehle Phase 3 images chahiye.', 'Phase 3 images are required before generating motif and pattern visuals.'))
      return
    }
    if (!visualFoundation?.selected_palette_id) {
      pushToast(copyFor(language, 'Pehle ek color palette choose kijiye.', 'Please choose a color palette first.'))
      return
    }
    setIsIdentityLoading(true)
    try {
      const response = await analyzeVisualFoundationMutation.mutateAsync({
        ...buildIdentityPayload(extractedData, language, user.name, draftBrandId),
        brand_id: draftBrandId,
        reference_images: referenceImages,
        generate_visual_assets: true,
      })
      setVisualFoundation(normalizeVisualFoundation(response))
      setExtractedData((current) => ({ ...current, reference_images: referenceImages }))
      setPhaseFourCandidates(null)
      setSelectedLogoCandidateId(undefined)
      setSelectedBannerCandidateId(undefined)
      pushToast(copyFor(language, 'Selected palette ke saath motif aur pattern visuals ready hain.', 'Motif and pattern visuals are ready for the selected palette.'))
    } catch (error) {
      pushToast(getErrorMessage(error))
    } finally {
      setIsIdentityLoading(false)
    }
  }

  const handleGeneratePhaseFourCandidates = async () => {
    if (!draftBrandId) return
    setIsIdentityLoading(true)
    try {
      const response = await generatePhaseFourCandidatesMutation.mutateAsync(draftBrandId)
      setPhaseFourCandidates(normalizePhaseFourCandidates(response))
      setSelectedLogoCandidateId(undefined)
      setSelectedBannerCandidateId(undefined)
      pushToast(copyFor(language, 'Logo aur banner options ready hain.', 'Logo and banner options are ready.'))
    } catch (error) {
      pushToast(getErrorMessage(error))
    } finally {
      setIsIdentityLoading(false)
    }
  }

  const handleSelectPhaseFourAssets = async () => {
    if (!draftBrandId || !phaseFourCandidates || !selectedLogoCandidateId || !selectedBannerCandidateId) return
    const selectedLogo = phaseFourCandidates.logos.find((item) => item.candidate_id === selectedLogoCandidateId)
    const selectedBanner = phaseFourCandidates.banners.find((item) => item.candidate_id === selectedBannerCandidateId)
    if (!selectedLogo || !selectedBanner) return
    setIsIdentityLoading(true)
    try {
      await selectPhaseFourAssetsMutation.mutateAsync({
        brandId: draftBrandId,
        logoUrl: selectedLogo.image_url,
        bannerUrl: selectedBanner.image_url,
      })
      if (user?.id) await clearOnboardingDraft(user.id)
      pushToast(copyFor(language, 'Phase 4 assets save ho gaye. Ab aapke final brand page par chalte hain.', 'Phase 4 assets have been saved. Taking you to your final brand page.'))
      navigate('/brand')
    } catch (error) {
      pushToast(getErrorMessage(error))
    } finally {
      setIsIdentityLoading(false)
    }
  }

  const handleSelectPaletteOption = async (optionId: string) => {
    if (!draftBrandId || !visualFoundation) return
    try {
      const response = await selectPaletteMutation.mutateAsync({ brandId: draftBrandId, optionId })
      setVisualFoundation((current) => {
        if (!current) return current
        return normalizeVisualFoundation({
          ...current,
          palette: response.palette,
          selected_palette_id: response.selected_palette_id,
          visual_motifs: [],
          motif_previews: [],
          signature_patterns: [],
        })
      })
      setPhaseFourCandidates(null)
      setSelectedLogoCandidateId(undefined)
      setSelectedBannerCandidateId(undefined)
      pushToast(copyFor(language, 'Color palette save ho gayi.', 'Color palette saved.'))
    } catch (error) {
      pushToast(getErrorMessage(error))
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
    setSelectedVisualFiles([])
    setVisualFoundation(null)
    setPhaseFourCandidates(null)
    setSelectedLogoCandidateId(undefined)
    setSelectedBannerCandidateId(undefined)
    stopAudio()
    stopRecording()
  }

  if (!isDraftReady) return <Card>Loading your brand chat...</Card>

  const activeIdentitySet = identitySets[currentIdentitySetIndex] ?? []
  const isIdentityStage = isComplete
  const normalizedVisualFoundation = normalizeVisualFoundation(visualFoundation)
  const savedReferenceImages = getSavedReferenceImages(normalizedVisualFoundation, extractedData)
  const hasPaletteOptions = (normalizedVisualFoundation?.palette_options.length ?? 0) > 0
  const hasSelectedPalette = Boolean(normalizedVisualFoundation?.selected_palette_id)
  const hasGeneratedVisualAssets = Boolean(normalizedVisualFoundation && ((normalizedVisualFoundation.motif_previews.length > 0) || (normalizedVisualFoundation.signature_patterns.length > 0)))
  const normalizedPhaseFourCandidates = normalizePhaseFourCandidates(phaseFourCandidates)
  const canEnterPhaseFour = Boolean(finalSelectedPair && hasGeneratedVisualAssets)
  const selectedLogoCandidate = normalizedPhaseFourCandidates?.logos.find((item) => item.candidate_id === selectedLogoCandidateId)
  const selectedBannerCandidate = normalizedPhaseFourCandidates?.banners.find((item) => item.candidate_id === selectedBannerCandidateId)
  const stepItems = [
    {
      id: 'phase1',
      label: 'Phase 1',
      title: copyFor(language, 'Craft basics', 'Craft basics'),
      active: !isIdentityStage && currentPhase === 1,
      done: completedPhases.includes(1) || isIdentityStage,
    },
    {
      id: 'phase2',
      label: 'Phase 2',
      title: copyFor(language, 'Brand story', 'Brand story'),
      active: !isIdentityStage && currentPhase === 2,
      done: completedPhases.includes(2) || isIdentityStage,
    },
    {
      id: 'identity',
      label: copyFor(language, 'Identity', 'Identity'),
      title: finalSelectedPair ? copyFor(language, 'Name locked', 'Name locked') : copyFor(language, 'Choose name', 'Choose name'),
      active: isIdentityStage && !finalSelectedPair,
      done: Boolean(finalSelectedPair),
    },
    {
      id: 'phase3',
      label: 'Phase 3',
      title: hasGeneratedVisualAssets
        ? copyFor(language, 'Visuals ready', 'Visuals ready')
        : hasPaletteOptions
          ? copyFor(language, 'Choose palette', 'Choose palette')
          : copyFor(language, 'Visual direction', 'Visual direction'),
      active: Boolean(finalSelectedPair),
      done: hasGeneratedVisualAssets,
    },
    {
      id: 'phase4',
      label: 'Phase 4',
      title: normalizedPhaseFourCandidates
        ? copyFor(language, 'Choose logo/banner', 'Choose logo/banner')
        : copyFor(language, 'Logo and banner', 'Logo and banner'),
      active: canEnterPhaseFour,
      done: Boolean(selectedLogoCandidateId && selectedBannerCandidateId),
    },
  ]

  return (
    <div className="space-y-6">
      <Card className="space-y-4 bg-orange-50">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-orange-700">{copyFor(language, 'Brand onboarding', 'Brand onboarding')}</p>
            <h1 className="text-2xl font-semibold text-stone-900">{copyFor(language, 'Ek step par focus kijiye', 'Focus on one step at a time')}</h1>
          </div>
          <p className="text-sm text-stone-600">{copyFor(language, 'Progress save hota rahega.', 'Progress is saved as you go.')}</p>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          {stepItems.map((step) => (
            <div key={step.id} className={`rounded-2xl border px-4 py-3 ${step.done ? 'border-[#1f5c5a]/20 bg-white' : step.active ? 'border-orange-300 bg-white' : 'border-transparent bg-white/60'}`}>
              <p className={`text-xs font-semibold uppercase tracking-wide ${step.done ? 'text-[#1f5c5a]' : step.active ? 'text-orange-700' : 'text-stone-500'}`}>{step.label}</p>
              <p className="mt-1 text-sm font-medium text-stone-800">{step.title}</p>
            </div>
          ))}
        </div>
      </Card>

      {!isIdentityStage ? (
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex flex-col items-start gap-4 pb-2 sm:flex-row sm:items-center sm:justify-between">
              <h1 className="text-2xl font-semibold text-stone-900 sm:text-3xl">{copyFor(language, currentPhase === 1 ? 'Phase 1: Basic details' : 'Phase 2: Brand story', currentPhase === 1 ? 'Phase 1: Basic details' : 'Phase 2: Brand story')}</h1>
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
                ? copyFor(language, 'Sirf zaroori craft aur business details.', 'Only the essential craft and business details.')
                : copyFor(language, 'Ab aapke brand ki soch aur kahani samajhte hain.', 'Now we capture the thinking and story behind your brand.')}
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
          {!finalSelectedPair ? (
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
              <p className="text-sm text-stone-600">{copyFor(language, 'Pehle jo pasand aaye unme se max 3 shortlist karo, phir hum best option suggest karenge.', 'Shortlist up to 3 options you like, then we will suggest the best one.')}</p>
              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-full bg-[#1f5c5a]/10 px-3 py-1 text-sm font-medium text-[#1f5c5a]">{copyFor(language, `${shortlistedPairs.length}/3 shortlisted`, `${shortlistedPairs.length}/3 shortlisted`)}</span>
                {!identitySets[1] ? <Button variant="secondary" onClick={() => void requestIdentitySet(2)} loading={isIdentityLoading}><Sparkles className="mr-2 h-4 w-4" />{copyFor(language, 'Doosra set dikhao', 'Show second set')}</Button> : null}
                <Button onClick={() => void handleRankShortlist()} loading={isIdentityLoading} disabled={shortlistedPairs.length === 0}><ArrowRight className="mr-2 h-4 w-4" />{copyFor(language, 'Rank my picks', 'Rank my picks')}</Button>
              </div>
            </Card>
          ) : null}

          {!finalSelectedPair && activeIdentitySet.length === 0 ? (
            <Card className="space-y-3">
              <p>{copyFor(language, 'Identity suggestions load ho rahe hain...', 'Identity suggestions are loading...')}</p>
              {hasIdentityBootstrapFailed ? (
                <Button onClick={() => void requestIdentitySet(1)} loading={isIdentityLoading}>
                  <Sparkles className="mr-2 h-4 w-4" />
                  {copyFor(language, 'Suggestions phir se lao', 'Try loading suggestions again')}
                </Button>
              ) : null}
            </Card>
          ) : !finalSelectedPair ? (
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
          ) : null}

          {!finalSelectedPair && rankedPairs.length > 0 ? (
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
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-2xl font-semibold text-stone-900">{finalSelectedPair.name}</p>
                  <p className="mt-2 rounded-2xl bg-white px-4 py-3 text-sm font-medium text-stone-700">{finalSelectedPair.tagline}</p>
                </div>
                <p className="max-w-sm text-sm text-stone-600">{copyFor(language, 'Identity lock ho gayi. Ab seedha Phase 3 par focus karte hain.', 'Your identity is locked. Now we can focus directly on Phase 3.')}</p>
              </div>
            </Card>
          ) : null}

          {finalSelectedPair ? (
            <Card className="space-y-4 border-orange-200">
              <div>
                <p className="text-sm font-semibold text-orange-600">{copyFor(language, 'Phase 3', 'Phase 3')}</p>
                <h2 className="text-2xl font-semibold text-stone-900">{copyFor(language, 'Visual direction', 'Visual direction')}</h2>
                <p className="mt-2 text-sm text-stone-600">{copyFor(language, 'Bas do steps: palette choose karo, phir ussi palette ke saath visuals banao.', 'Just two steps: choose a palette, then generate visuals with it.')}</p>
              </div>
              <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
                <Card className="space-y-4 border-[#1f5c5a]/15 bg-[#f7faf8]">
                  <div>
                    <p className="text-sm font-semibold text-[#1f5c5a]">{copyFor(language, 'Step 1', 'Step 1')}</p>
                    <h3 className="text-xl font-semibold text-stone-900">{copyFor(language, 'Upload images and choose palette', 'Upload images and choose palette')}</h3>
                    <p className="mt-1 text-sm text-stone-600">{copyFor(language, 'Aapke images se 3 palette options aayenge.', 'We will create 3 palette options from your images.')}</p>
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(event) => setSelectedVisualFiles(Array.from(event.target.files ?? []))}
                    className="block w-full rounded-2xl border border-dashed border-[#1f5c5a]/20 bg-white px-4 py-5 text-sm text-stone-600"
                  />
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="rounded-full bg-white px-3 py-1 text-sm text-stone-700">{copyFor(language, `${selectedVisualFiles.length} files selected`, `${selectedVisualFiles.length} files selected`)}</span>
                    <Button onClick={() => void handleAnalyzeVisualFoundation()} loading={isIdentityLoading} disabled={!draftBrandId || selectedVisualFiles.length === 0}>
                      {copyFor(language, 'Generate palette options', 'Generate palette options')}
                    </Button>
                  </div>
                  {hasPaletteOptions ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-stone-800">{copyFor(language, 'Choose one palette', 'Choose one palette')}</p>
                        {normalizedVisualFoundation?.selected_palette_id ? <span className="rounded-full bg-[#1f5c5a]/10 px-3 py-1 text-xs font-semibold text-[#1f5c5a]">{copyFor(language, 'Palette selected', 'Palette selected')}</span> : <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-800">{copyFor(language, 'Select one to continue', 'Select one to continue')}</span>}
                      </div>
                      <div className="space-y-3">
                        {normalizedVisualFoundation?.palette_options.map((option) => {
                          const isRecommended = option.option_id === normalizedVisualFoundation.recommended_palette_id
                          const isSelected = option.option_id === normalizedVisualFoundation.selected_palette_id
                          return (
                            <div key={option.option_id} className={`rounded-3xl bg-white p-4 shadow-sm ring-1 ${isSelected ? 'ring-[#1f5c5a]' : isRecommended ? 'ring-orange-300' : 'ring-stone-200'}`}>
                              <div className="flex flex-wrap items-center gap-2">
                                {isRecommended ? <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-800">{copyFor(language, 'Recommended', 'Recommended')}</span> : null}
                                {isSelected ? <span className="rounded-full bg-[#1f5c5a] px-3 py-1 text-xs font-semibold text-white">{copyFor(language, 'Selected', 'Selected')}</span> : null}
                              </div>
                              <p className="mt-3 text-lg font-semibold text-stone-900">{option.name}</p>
                              <p className="mt-1 text-sm leading-6 text-stone-600">{option.rationale}</p>
                              <div className="mt-4 grid grid-cols-4 gap-2">
                                {paletteSwatches(option).map(([label, value]) => (
                                  <div key={`${option.option_id}-${label}`} className="space-y-2">
                                    <div className="h-14 rounded-2xl border border-stone-200" style={{ backgroundColor: String(value) }} />
                                    <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">{label}</p>
                                  </div>
                                ))}
                              </div>
                              <Button
                                className="mt-4 w-full"
                                variant={isSelected ? 'primary' : 'secondary'}
                                onClick={() => void handleSelectPaletteOption(option.option_id)}
                                loading={selectPaletteMutation.isPending && isSelected}
                                disabled={selectPaletteMutation.isPending}
                              >
                                {isSelected ? copyFor(language, 'Palette selected', 'Palette selected') : copyFor(language, 'Choose this palette', 'Choose this palette')}
                              </Button>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ) : null}
                </Card>

                <Card className="space-y-4 border-[#1f5c5a]/15 bg-[#f7faf8]">
                  <div>
                    <p className="text-sm font-semibold text-[#1f5c5a]">{copyFor(language, 'Step 2', 'Step 2')}</p>
                    <h3 className="text-xl font-semibold text-stone-900">{copyFor(language, 'Generate motif and pattern visuals', 'Generate motif and pattern visuals')}</h3>
                    <p className="mt-1 text-sm text-stone-600">{copyFor(language, 'Selected palette ke saath final visual direction banegi.', 'The final visual direction will be generated using the selected palette.')}</p>
                  </div>
                  <Button
                    onClick={() => void handleGenerateMotifsAndPatterns()}
                    loading={isIdentityLoading}
                    disabled={!draftBrandId || !hasSelectedPalette || savedReferenceImages.length === 0}
                  >
                    {copyFor(language, hasGeneratedVisualAssets ? 'Refresh visuals' : 'Generate visuals', hasGeneratedVisualAssets ? 'Refresh visuals' : 'Generate visuals')}
                  </Button>
                  {normalizedVisualFoundation ? <p className="text-sm leading-6 text-stone-600">{normalizedVisualFoundation.visual_summary}</p> : null}
                  {hasGeneratedVisualAssets ? (
                    <>
                      <div className="space-y-2">
                        <p className="text-sm font-semibold text-stone-800">{copyFor(language, 'Motif directions', 'Motif directions')}</p>
                        <div className="flex flex-wrap gap-2">
                          {normalizedVisualFoundation.visual_motifs.map((motif) => <span key={motif} className="rounded-full bg-white px-3 py-1 text-sm text-stone-700 shadow-sm">{motif}</span>)}
                        </div>
                        <div className="grid gap-4 md:grid-cols-2">
                          {normalizedVisualFoundation.motif_previews.map((motif) => (
                            <div key={motif.name} className="overflow-hidden rounded-3xl bg-white shadow-sm">
                              <img src={motif.image_url} alt={`${motif.name} motif preview`} className="h-48 w-full object-cover" />
                              <div className="space-y-2 p-4">
                                <p className="font-semibold text-stone-900">{motif.name}</p>
                                {motif.description ? <p className="text-sm text-stone-600">{motif.description}</p> : null}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <p className="text-sm font-semibold text-stone-800">{copyFor(language, 'Pattern previews', 'Pattern previews')}</p>
                        <div className="grid gap-4 md:grid-cols-2">
                          {normalizedVisualFoundation.signature_patterns.map((pattern) => (
                            <div key={pattern.name} className="overflow-hidden rounded-3xl bg-white shadow-sm">
                              {pattern.image_url ? <img src={pattern.image_url} alt={`${pattern.name} pattern preview`} className="h-48 w-full object-cover" /> : null}
                              <div className="p-4">
                                <p className="font-semibold text-stone-900">{pattern.name}</p>
                                <p className="mt-1 text-sm text-stone-600">{pattern.description}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                      <p className="text-sm font-medium text-[#1f5c5a]">{copyFor(language, 'Phase 3 complete. Ab hum phase 4 me logo aur banner direction ki taraf badh sakte hain.', 'Phase 3 is complete. We can now move to phase 4 for logo and banner direction.')}</p>
                    </>
                  ) : (
                    <p className="text-sm font-medium text-[#1f5c5a]">{copyFor(language, hasSelectedPalette ? 'Palette select ho gayi hai. Ab visuals generate kijiye.' : 'Pehle left side me ek palette choose kijiye.', hasSelectedPalette ? 'Your palette is selected. Now generate the visuals.' : 'Choose a palette on the left first.')}</p>
                  )}
                </Card>
              </div>
            </Card>
          ) : null}

          {canEnterPhaseFour ? (
            <Card className="space-y-5 border-orange-200">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-orange-600">{copyFor(language, 'Phase 4', 'Phase 4')}</p>
                  <h2 className="text-2xl font-semibold text-stone-900">{copyFor(language, 'Choose your logo and banner', 'Choose your logo and banner')}</h2>
                  <p className="mt-2 text-sm text-stone-600">{copyFor(language, 'Pehle 3 logo directions ko ek line me compare kijiye. Uske baad niche se 1 banner choose karke final brand page par badhiye.', 'Compare the 3 logo directions in one line first. Then choose 1 banner below and move to the final brand page.')}</p>
                </div>
                <Button onClick={() => void handleGeneratePhaseFourCandidates()} loading={isIdentityLoading} disabled={!draftBrandId}>
                  {copyFor(language, normalizedPhaseFourCandidates ? 'Refresh Phase 4 options' : 'Generate Phase 4 options', normalizedPhaseFourCandidates ? 'Refresh Phase 4 options' : 'Generate Phase 4 options')}
                </Button>
              </div>

              {normalizedPhaseFourCandidates ? (
                <>
                  <Card className="space-y-4 border-[#1f5c5a]/15 bg-[#f7faf8]">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[#1f5c5a]">{copyFor(language, 'Step 1 · Logo options', 'Step 1 · Logo options')}</p>
                        <p className="mt-1 text-sm text-stone-600">{copyFor(language, '3 logo boxes ko side by side dekhiye aur ek choose kijiye.', 'Review the 3 logo boxes side by side and choose one.')}</p>
                      </div>
                      {selectedLogoCandidate ? <span className="rounded-full bg-[#1f5c5a]/10 px-3 py-1 text-xs font-semibold text-[#1f5c5a]">{copyFor(language, 'Logo selected', 'Logo selected')}</span> : null}
                    </div>
                    <div className="flex gap-4 overflow-x-auto pb-2">
                      {normalizedPhaseFourCandidates.logos.map((candidate) => {
                        const isSelected = candidate.candidate_id === selectedLogoCandidateId
                        return (
                          <button
                            key={candidate.candidate_id}
                            type="button"
                            onClick={() => setSelectedLogoCandidateId(candidate.candidate_id)}
                            className={`min-w-[220px] flex-1 overflow-hidden rounded-3xl bg-white text-left shadow-sm ring-1 transition hover:-translate-y-0.5 ${isSelected ? 'ring-[#1f5c5a] shadow-md' : 'ring-stone-200 hover:ring-orange-200'}`}
                          >
                            <div className="flex h-40 items-center justify-center bg-stone-50 p-4">
                              <img src={candidate.image_url} alt={candidate.title} className="max-h-full max-w-full object-contain" />
                            </div>
                            <div className="space-y-2 p-4">
                              <div className="flex items-center justify-between gap-3">
                                <p className="font-semibold text-stone-900">{candidate.title}</p>
                                {isSelected ? <span className="rounded-full bg-[#1f5c5a]/10 px-2 py-1 text-[11px] font-semibold text-[#1f5c5a]">{copyFor(language, 'Picked', 'Picked')}</span> : null}
                              </div>
                              <p className="text-sm text-stone-600">{candidate.rationale}</p>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </Card>

                  <Card className="space-y-4 border-[#1f5c5a]/15 bg-[#f7faf8]">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[#1f5c5a]">{copyFor(language, 'Step 2 · Banner options', 'Step 2 · Banner options')}</p>
                        <p className="mt-1 text-sm text-stone-600">{copyFor(language, 'Ab niche se 1 banner choose kijiye jo aapke pattern aur palette ke saath sabse achha lage.', 'Now choose 1 banner below that works best with your pattern and palette.')}</p>
                      </div>
                      {selectedBannerCandidate ? <span className="rounded-full bg-[#1f5c5a]/10 px-3 py-1 text-xs font-semibold text-[#1f5c5a]">{copyFor(language, 'Banner selected', 'Banner selected')}</span> : null}
                    </div>
                    <div className="grid gap-4 lg:grid-cols-3">
                      {normalizedPhaseFourCandidates.banners.map((candidate) => {
                        const isSelected = candidate.candidate_id === selectedBannerCandidateId
                        return (
                          <button
                            key={candidate.candidate_id}
                            type="button"
                            onClick={() => setSelectedBannerCandidateId(candidate.candidate_id)}
                            className={`overflow-hidden rounded-3xl bg-white text-left shadow-sm ring-1 transition hover:-translate-y-0.5 ${isSelected ? 'ring-[#1f5c5a] shadow-md' : 'ring-stone-200 hover:ring-orange-200'}`}
                          >
                            <img src={candidate.image_url} alt={candidate.title} className="h-40 w-full object-cover" />
                            <div className="space-y-2 p-4">
                              <div className="flex items-center justify-between gap-3">
                                <p className="font-semibold text-stone-900">{candidate.title}</p>
                                {isSelected ? <span className="rounded-full bg-[#1f5c5a]/10 px-2 py-1 text-[11px] font-semibold text-[#1f5c5a]">{copyFor(language, 'Picked', 'Picked')}</span> : null}
                              </div>
                              <p className="text-sm text-stone-600">{candidate.rationale}</p>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </Card>

                  <div className="flex flex-wrap items-center gap-3 rounded-3xl border border-dashed border-orange-200 bg-orange-50 px-4 py-4">
                    <Button onClick={() => void handleSelectPhaseFourAssets()} loading={isIdentityLoading} disabled={!selectedLogoCandidate || !selectedBannerCandidate}>
                      {copyFor(language, 'Continue to brand page', 'Continue to brand page')}
                    </Button>
                    <p className="text-sm text-stone-600">{copyFor(language, 'Ek logo aur ek banner choose karte hi hum aapko final brand page par le jayenge jahan story Hindi aur English dono me milegi.', 'Once you choose one logo and one banner, we will take you to the final brand page with the story in both Hindi and English.')}</p>
                  </div>
                </>
              ) : (
                <Card className="border-[#1f5c5a]/15 bg-[#f7faf8]">
                  <p className="text-sm text-stone-600">{copyFor(language, 'Phase 4 options dekhne ke liye button dabaiye. Hum 3 premium logo aur 3 banner choices banayenge.', 'Click the button to generate Phase 4 options. We will create 3 premium logo and 3 banner choices.')}</p>
                </Card>
              )}
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
