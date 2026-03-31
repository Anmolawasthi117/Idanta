import type {
  BrandCreatePayload,
  BrandIdentityPair,
  BrandPhaseFourCandidates,
  BrandVisualFoundation,
  RankedBrandIdentityPair,
} from '../types/brand.types'

const PREFIX = 'idanta:onboarding:draft:'

export interface OnboardingDraftMessage {
  id: string
  role: 'assistant' | 'user'
  content: string
  timestamp: string
}

export interface OnboardingDraft {
  userId: string
  currentPhase: 1 | 2
  completedPhases: number[]
  messages: OnboardingDraftMessage[]
  extractedData: Partial<BrandCreatePayload>
  isComplete: boolean
  draftBrandId?: string
  identitySets?: BrandIdentityPair[][]
  currentIdentitySetIndex?: number
  shortlistedPairs?: BrandIdentityPair[]
  rankedPairs?: RankedBrandIdentityPair[]
  recommendedPairId?: string
  finalSelectedPair?: BrandIdentityPair | null
  rankingPrompt?: string
  visualFoundation?: BrandVisualFoundation | null
  phaseFourCandidates?: BrandPhaseFourCandidates | null
  selectedLogoCandidateId?: string
  selectedBannerCandidateId?: string
  updatedAt: string
}

const keyFor = (userId: string) => `${PREFIX}${userId}`

export const loadOnboardingDraft = async (userId: string): Promise<OnboardingDraft | null> => {
  const raw = localStorage.getItem(keyFor(userId))
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as OnboardingDraft
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.messages)) return null
    return parsed
  } catch {
    return null
  }
}

export const saveOnboardingDraft = async (draft: OnboardingDraft): Promise<void> => {
  localStorage.setItem(keyFor(draft.userId), JSON.stringify(draft))
}

export const clearOnboardingDraft = async (userId: string): Promise<void> => {
  localStorage.removeItem(keyFor(userId))
}

