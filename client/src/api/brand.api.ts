import apiClient from './client'
import type { Brand, BrandCreatePayload, BrandChatMessage, CraftItem } from '../types/brand.types'

export interface BrandCreateResponse {
  job_id: string
  message: string
}

export const createBrand = async (payload: BrandCreatePayload): Promise<BrandCreateResponse> => {
  const { data } = await apiClient.post<BrandCreateResponse>('/brands/', payload)
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

export const regenerateBrand = async (_brandId: string) => {
  void _brandId
  throw new Error('Brand regenerate endpoint abhi backend me available nahi hai.')
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

export const brandAssistChat = async (
  message: string,
  extracted: Partial<BrandCreatePayload>,
  crafts: CraftItem[],
  _systemPrompt?: string,
): Promise<BrandChatMessage> => {
  void _systemPrompt
  const next = { ...extracted }
  const lower = message.toLowerCase()

  if (!next.craft_id) {
    const craft = findCraft(message, crafts)
    if (craft) {
      next.craft_id = craft.craft_id
      return { message: `Bahut badhiya. Aapka naam kya hai?`, extracted: next }
    }
    return {
      message: `Aap kis kaam me mahir ho? In me se batayein: ${crafts.map((item) => item.display_name).join(', ')}`,
      extracted: next,
    }
  }

  if (!next.artisan_name) {
    next.artisan_name = message.trim()
    return { message: 'Aap kis shehar ya area se kaam karte ho?', extracted: next }
  }

  if (!next.region) {
    next.region = message.trim()
    return { message: 'Ye kaam kitne saal se kar rahe ho?', extracted: next }
  }

  if (!next.years_of_experience) {
    const years = parseYears(message)
    if (typeof years === 'number') {
      next.years_of_experience = years
      return { message: 'Ye kala ghar me kitni peedhi se chal rahi hai?', extracted: next }
    }
    return { message: 'Bas number me batayein, jaise 10 saal.', extracted: next }
  }

  if (!next.generations_in_craft) {
    const generations = parseYears(message)
    if (typeof generations === 'number') {
      next.generations_in_craft = generations
      return { message: 'Zyada bikri kis kaam ke liye hoti hai - shaadi, festival, daily, gifting, home decor ya export?', extracted: next }
    }
    return { message: 'Peedhi number me batayein, jaise 2 ya 3.', extracted: next }
  }

  if (!next.primary_occasion) {
    const options: BrandCreatePayload['primary_occasion'][] = ['wedding', 'festival', 'daily', 'gifting', 'home_decor', 'export', 'general']
    const matched = options.find((option) => lower.includes(option.replace('_', ' ')) || lower.includes(option))
    if (matched) {
      next.primary_occasion = matched
      return { message: 'Aap zyada kis ko bechte ho - local bazaar, tourist, online India ya export?', extracted: next }
    }
    return { message: 'In me se ek batayein: wedding, festival, daily, gifting, home decor, export.', extracted: next }
  }

  if (!next.target_customer) {
    const options: BrandCreatePayload['target_customer'][] = ['local_bazaar', 'tourist', 'online_india', 'export']
    const matched = options.find((option) => lower.includes(option.replace('_', ' ')) || lower.includes(option.split('_')[0]))
    if (matched) {
      next.target_customer = matched
      return { message: 'Brand ka ehsaas kaisa ho - earthy, royal, vibrant ya minimal?', extracted: next }
    }
    return { message: 'Simple batayein - local bazaar, tourist, online India ya export.', extracted: next }
  }

  if (!next.brand_feel) {
    const options: BrandCreatePayload['brand_feel'][] = ['earthy', 'royal', 'vibrant', 'minimal']
    const matched = options.find((option) => lower.includes(option))
    if (matched) {
      next.brand_feel = matched
      next.script_preference = next.script_preference ?? 'both'
      next.preferred_language = next.preferred_language ?? 'hi'
      return { message: 'Apne kaam se judi koi yaad ya kahani 1-2 line me batao.', extracted: next }
    }
    return { message: 'Ek option chuniye - earthy, royal, vibrant ya minimal.', extracted: next }
  }

  if (!next.artisan_story) {
    next.artisan_story = message.trim()
    return {
      message: 'Sab taiyar hai. Neeche dekhkar confirm kijiye aur apna brand banaiye.',
      extracted: next,
      is_complete: true,
    }
  }

  return { message: 'Sab information mil gayi. Ab brand banana shuru karte hain.', extracted: next, is_complete: true }
}
