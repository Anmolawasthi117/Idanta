import { listJobs } from './jobs.api'
import apiClient from './client'
import { uniqueBy } from '../lib/utils'
import type { AppLanguage } from '../store/uiStore'
import type {
  GenerateResponse,
  Product,
  ProductAssistExtracted,
  ProductCreateResponse,
} from '../types/product.types'

export const createProduct = async (formData: FormData): Promise<ProductCreateResponse> => {
  const { data } = await apiClient.post<ProductCreateResponse>('/products/', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export const generateProductAssets = async (productId: string): Promise<GenerateResponse> => {
  const { data } = await apiClient.post<GenerateResponse>(`/products/${productId}/generate`)
  return data
}

export const getProduct = async (productId: string): Promise<Product> => {
  const { data } = await apiClient.get<Product>(`/products/${productId}`)
  return data
}

export const listProducts = async (brandId: string): Promise<Product[]> => {
  const jobs = await listJobs()
  const productIds = uniqueBy(
    jobs.filter((job) => job.job_type === 'product_assets' && job.ref_id).map((job) => job.ref_id as string),
    (item) => item,
  )

  if (!productIds.length) return []

  const products = await Promise.all(productIds.map((productId) => getProduct(productId)))
  return products.filter((product) => product.brand_id === brandId)
}

const parseNumber = (value: string) => {
  const match = value.match(/\d+/)
  return match ? Number(match[0]) : undefined
}

const copy = (language: AppLanguage, hgString: string, enString: string, hiString?: string) => {
  if (language === 'en') return enString
  if (language === 'hi') return hiString || hgString
  return hgString
}

export const productAssistChat = async (
  message: string,
  extracted: ProductAssistExtracted,
  language: AppLanguage,
): Promise<{ message: string; extracted?: ProductAssistExtracted; is_complete?: boolean }> => {
  const next = { ...extracted }
  const lower = message.toLowerCase()

  if (!next.name) {
    next.name = message.trim()
    return { message: copy(language, 'Iski keemat kitni rakhni hai?', 'What price do you want to keep for this?'), extracted: next }
  }

  if (!next.price_mrp) {
    const price = parseNumber(message)
    if (typeof price === 'number') {
      next.price_mrp = price
      return {
        message: copy(
          language,
          'Ye kis category me aata hai - apparel, jewelry, pottery, painting, home decor ya other?',
          'Which category is this - apparel, jewelry, pottery, painting, home decor, or other?',
        ),
        extracted: next,
      }
    }
    return { message: copy(language, 'Price number me batayein, jaise 1299.', 'Please answer the price as a number, like 1299.'), extracted: next }
  }

  if (!next.category) {
    const options: NonNullable<ProductAssistExtracted['category']>[] = ['apparel', 'jewelry', 'pottery', 'painting', 'home_decor', 'other']
    const matched = options.find((option) => lower.includes(option.replace('_', ' ')) || lower.includes(option))
    if (matched) {
      next.category = matched
      return { message: copy(language, 'Ye zyada kis mauke ke liye hai?', 'What main occasion is this product for?'), extracted: next }
    }
    return {
      message: copy(
        language,
        'Ek category chuniye - apparel, jewelry, pottery, painting, home decor ya other.',
        'Please choose one category - apparel, jewelry, pottery, painting, home decor, or other.',
      ),
      extracted: next,
    }
  }

  if (!next.occasion) {
    const options: NonNullable<ProductAssistExtracted['occasion']>[] = ['wedding', 'festival', 'daily', 'gifting', 'home_decor', 'export', 'general']
    const matched = options.find((option) => lower.includes(option.replace('_', ' ')) || lower.includes(option))
    if (matched) {
      next.occasion = matched
      return { message: copy(language, 'Is product ko apni zubaan me thoda sa batao.', 'Please describe this product in your own words.'), extracted: next }
    }
    return {
      message: copy(
        language,
        'Simple option batayein - wedding, festival, daily, gifting, home decor, export ya general.',
        'Please choose simply - wedding, festival, daily, gifting, home decor, export, or general.',
      ),
      extracted: next,
    }
  }

  if (!next.description_voice) {
    next.description_voice = message.trim()
    return { message: copy(language, 'Ye banane me kitne ghante lagte hain?', 'How many hours does this take to make?'), extracted: next }
  }

  if (!next.time_to_make_hrs) {
    const hours = parseNumber(message)
    if (typeof hours === 'number') {
      next.time_to_make_hrs = hours
      return {
        message: copy(
          language,
          'Bahut badhiya. Ab neeche category details aur photos bhar do.',
          'Great. Now please fill the category details and upload photos below.',
        ),
        extracted: next,
        is_complete: true,
      }
    }
    return { message: copy(language, 'Ghante number me batayein, jaise 6 ya 12.', 'Please answer the hours as a number, like 6 or 12.'), extracted: next }
  }

  return {
    message: copy(language, 'Phase 1 complete hai. Ab category details bhariye.', 'Phase 1 is complete. Please fill the category details now.'),
    extracted: next,
    is_complete: true,
  }
}
