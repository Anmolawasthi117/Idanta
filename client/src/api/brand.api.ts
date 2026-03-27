import apiClient from './client'
import type { Brand, BrandCreatePayload, BrandChatMessage, CraftItem } from '../types/brand.types'
import type { AppLanguage } from '../store/uiStore'

export interface BrandCreateResponse {
  job_id: string
  message: string
}

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
): Promise<BrandChatMessage> => {
  void _systemPrompt
  const next = { ...extracted }
  const lower = message.toLowerCase()

  if (!next.craft_id) {
    const craft = findCraft(message, crafts)
    if (craft) {
      next.craft_id = craft.craft_id
      return {
        message: copy(language, 'Bahut badhiya. Aapka naam kya hai?', 'Lovely. What is your name?'),
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

  if (!next.artisan_name) {
    next.artisan_name = message.trim()
    return {
      message: copy(language, 'Aap kis shehar ya area se kaam karte ho?', 'Which city, town, or area do you work from?'),
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
    const matched = options.find((option) => lower.includes(option.replace('_', ' ')) || lower.includes(option))
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
    const matched = options.find((option) => lower.includes(option.replace('_', ' ')) || lower.includes(option.split('_')[0]))
    if (matched) {
      next.target_customer = matched
      return {
        message: copy(
          language,
          'Brand ka ehsaas kaisa ho - earthy, royal, vibrant ya minimal?',
          'What should the brand feel like - earthy, royal, vibrant, or minimal?',
        ),
        extracted: next,
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

  if (!next.brand_feel) {
    const options: BrandCreatePayload['brand_feel'][] = ['earthy', 'royal', 'vibrant', 'minimal']
    const matched = options.find((option) => lower.includes(option))
    if (matched) {
      next.brand_feel = matched
      next.script_preference = next.script_preference ?? (language === 'en' ? 'english' : 'hindi')
      next.preferred_language = next.preferred_language ?? (language === 'en' ? 'en' : 'hi')
      return {
        message: copy(
          language,
          'Apne kaam se judi koi yaad ya kahani 1-2 line me batao.',
          'Please share one special memory or short story about your craft in 1 or 2 lines.',
        ),
        extracted: next,
      }
    }
    return {
      message: copy(
        language,
        'Ek option chuniye - earthy, royal, vibrant ya minimal.',
        'Please choose one option - earthy, royal, vibrant, or minimal.',
      ),
      extracted: next,
    }
  }

  if (!next.artisan_story) {
    next.artisan_story = message.trim()
    return {
      message: copy(
        language,
        'Sab taiyar hai. Neeche dekhkar confirm kijiye aur apna brand banaiye.',
        'Everything is ready. Please review below and create your brand.',
      ),
      extracted: next,
      is_complete: true,
    }
  }

  return {
    message: copy(language, 'Sab information mil gayi. Ab brand banana shuru karte hain.', 'We have all the information. Let us start building your brand.'),
    extracted: next,
    is_complete: true,
  }
}
