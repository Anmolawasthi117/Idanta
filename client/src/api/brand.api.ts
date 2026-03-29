import apiClient from './client'
import type {
  Brand,
  BrandChatMessage,
  BrandCreatePayload,
  BrandIdentityPair,
  BrandIdentityRankResponse,
  BrandIdentitySetResponse,
  BrandVisualFoundation,
  CraftItem,
} from '../types/brand.types'
import type { AppLanguage } from '../store/uiStore'

export interface BrandCreateResponse {
  job_id: string
  message: string
}
export type RegenerableBrandAsset = 'logo' | 'banner' | 'tagline' | 'name' | 'identity'

export const createBrand = async (payload: BrandCreatePayload): Promise<BrandCreateResponse> => {
  const { data } = await apiClient.post<BrandCreateResponse>('/brands/', payload)
  return data
}

export const uploadBrandImages = async (formData: FormData): Promise<string[]> => {
  const { data } = await apiClient.post<string[]>('/brands/upload-images', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export const getBrand = async (brandId: string): Promise<Brand> => {
  const { data } = await apiClient.get<Brand>(`/brands/${brandId}`)
  return data
}

export const getCrafts = async (): Promise<CraftItem[]> => {
  const { data } = await apiClient.get<CraftItem[]>('/brands/crafts')
  return data
}

export const regenerateBrand = async (brandId: string): Promise<BrandCreateResponse> => {
  const { data } = await apiClient.post<BrandCreateResponse>(`/brands/${brandId}/generate`)
  return data
}

export const regenerateBrandAsset = async (
  brandId: string,
  assetType: RegenerableBrandAsset,
  payload?: { name?: string; tagline?: string },
): Promise<BrandCreateResponse> => {
  const { data } = await apiClient.post<BrandCreateResponse>(`/brands/${brandId}/regenerate-asset`, {
    asset_type: assetType,
    ...(payload ?? {}),
  })
  return data
}

export const updateBrandIdentity = async (
  brandId: string,
  payload: { name: string; tagline: string },
): Promise<Brand> => {
  const { data } = await apiClient.patch<Brand>(`/brands/${brandId}/identity`, payload)
  return data
}

export const generateBrandIdentityCandidates = async (
  payload: BrandCreatePayload & {
    set_number: 1 | 2
    excluded_pairs?: BrandIdentityPair[]
  },
): Promise<BrandIdentitySetResponse> => {
  const { data } = await apiClient.post<BrandIdentitySetResponse>('/brands/identity-candidates', payload)
  return data
}

export const rankBrandIdentityCandidates = async (
  payload: BrandCreatePayload & {
    selected_pairs: BrandIdentityPair[]
  },
): Promise<BrandIdentityRankResponse> => {
  const { data } = await apiClient.post<BrandIdentityRankResponse>('/brands/identity-rank', payload)
  return data
}

export const saveBrandIdentityDraft = async (
  payload: BrandCreatePayload & {
    name: string
    tagline: string
  },
): Promise<{ brand_id: string; name: string; tagline: string }> => {
  const { data } = await apiClient.post<{ brand_id: string; name: string; tagline: string }>('/brands/identity-draft', payload)
  return data
}

export const analyzeBrandVisualFoundation = async (
  payload: BrandCreatePayload & {
    brand_id: string
    reference_images: string[]
  },
): Promise<BrandVisualFoundation> => {
  const { data } = await apiClient.post<BrandVisualFoundation>('/brands/visual-foundation', payload)
  return data
}

const parseYears = (value: string) => {
  const match = value.match(/\d+/)
  return match ? Number(match[0]) : undefined
}

const findCraft = (message: string, crafts: CraftItem[]) =>
  crafts.find((craft) => {
    const haystack = `${craft.display_name} ${craft.craft_id}`.toLowerCase()
    return haystack.includes(message.toLowerCase())
  })

const copy = (language: AppLanguage, hgString: string, enString: string, hiString?: string) => {
  if (language === 'en') return enString
  if (language === 'hi') return hiString || hgString
  return hgString
}

export const brandAssistChat = async (
  message: string,
  extracted: Partial<BrandCreatePayload>,
  crafts: CraftItem[],
  language: AppLanguage,
  _systemPrompt?: string,
  phase: 1 | 2 = 1,
): Promise<BrandChatMessage> => {
  void _systemPrompt
  const next = { ...extracted }
  const lower = message.toLowerCase()

  if (phase === 2) {
    if (!next.brand_values) {
      next.brand_values = message.trim()
      return {
        message: copy(
          language,
          'Aane wale kuch saalon me aap chahoge log aapke kaam ke baare me kya kahe?',
          'In a few years, what would you love people to say about your work?',
        ),
        extracted: next,
      }
    }

    if (!next.brand_vision) {
      next.brand_vision = message.trim()
      return {
        message: copy(
          language,
          'Roz ye kaam karne ki sabse badi wajah kya hai?',
          'Why do you do this work every day?',
        ),
        extracted: next,
      }
    }

    if (!next.brand_mission) {
      next.brand_mission = message.trim()
      return {
        message: copy(
          language,
          'Phase 2 complete ho gaya. Aapki brand story ka core direction save ho gaya hai.',
          'Phase 2 is complete. Your brand story direction has been saved.',
        ),
        extracted: next,
        is_complete: true,
      }
    }

    return {
      message: copy(language, 'Phase 2 ki sari information mil gayi hai.', 'We have all the phase 2 information.'),
      extracted: next,
      is_complete: true,
    }
  }

  if (!next.craft_id) {
    const craft = findCraft(message, crafts)
    if (craft) {
      next.craft_id = craft.craft_id
      return {
        message: copy(language, 'Bahut badhiya. Aap kis shehar ya area se kaam karte ho?', 'Lovely. Which city, town, or area do you work from?'),
        extracted: next,
      }
    }
    return {
      message: copy(
        language,
        `Aap kis kaam me mahir ho? In me se batayein: ${crafts.map((item) => item.display_name).join(', ')}`,
        `Which craft do you practice? Please choose from: ${crafts.map((item) => item.display_name).join(', ')}`,
      ),
      extracted: next,
    }
  }

  if (!next.region) {
    next.region = message.trim()
    return {
      message: copy(language, 'Ye kaam kitne saal se kar rahe ho?', 'How many years have you done this craft?'),
      extracted: next,
    }
  }

  if (!next.years_of_experience) {
    const years = parseYears(message)
    if (typeof years === 'number') {
      next.years_of_experience = years
      return {
        message: copy(
          language,
          'Ye kala ghar me kitni peedhi se chal rahi hai?',
          'How many generations has this craft been in your family?',
        ),
        extracted: next,
      }
    }
    return { message: copy(language, 'Bas number me batayein, jaise 10 saal.', 'Please answer with a number, like 10 years.'), extracted: next }
  }

  if (!next.generations_in_craft) {
    const generations = parseYears(message)
    if (typeof generations === 'number') {
      next.generations_in_craft = generations
      return {
        message: copy(
          language,
          'Zyada bikri kis kaam ke liye hoti hai - shaadi, festival, daily, gifting, home decor ya export?',
          'What is your main selling occasion - wedding, festival, daily use, gifting, home decor, or export?',
        ),
        extracted: next,
      }
    }
    return { message: copy(language, 'Peedhi number me batayein, jaise 2 ya 3.', 'Please answer with a generation number, like 2 or 3.'), extracted: next }
  }

  if (!next.primary_occasion) {
    const options: BrandCreatePayload['primary_occasion'][] = ['wedding', 'festival', 'daily', 'gifting', 'home_decor', 'export', 'general']
    const matched = options.find((option) => option && (lower.includes(option.replace('_', ' ')) || lower.includes(option)))
    if (matched) {
      next.primary_occasion = matched
      return {
        message: copy(
          language,
          'Aap zyada kis ko bechte ho - local bazaar, tourist, online India ya export?',
          'Who do you mostly sell to - local bazaar, tourists, online India, or export buyers?',
        ),
        extracted: next,
      }
    }
    return {
      message: copy(
        language,
        'In me se ek batayein: wedding, festival, daily, gifting, home decor, export.',
        'Please choose one: wedding, festival, daily, gifting, home decor, or export.',
      ),
      extracted: next,
    }
  }

  if (!next.target_customer) {
    const options: BrandCreatePayload['target_customer'][] = ['local_bazaar', 'tourist', 'online_india', 'export']
    const matched = options.find(
      (option) => option && (lower.includes(option.replace('_', ' ')) || lower.includes(option.split('_')[0] ?? option)),
    )
    if (matched) {
      next.target_customer = matched
      next.script_preference = next.script_preference ?? (language === 'hi' ? 'hindi' : 'english')
      next.preferred_language = next.preferred_language ?? (language === 'hi' ? 'hi' : 'en')
      return {
        message: copy(
          language,
          'Phase 1 complete ho gaya. Aapka progress save ho gaya hai.',
          'Phase 1 is complete. Your progress has been saved.',
        ),
        extracted: next,
        is_complete: true,
      }
    }
    return {
      message: copy(
        language,
        'Simple batayein - local bazaar, tourist, online India ya export.',
        'Please choose simply - local bazaar, tourist, online India, or export.',
      ),
      extracted: next,
    }
  }

  return {
    message: copy(language, 'Phase 1 ki sari information mil gayi hai.', 'We have all the phase 1 information.'),
    extracted: next,
    is_complete: true,
  }
}
