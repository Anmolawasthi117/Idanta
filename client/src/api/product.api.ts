import { listJobs } from './jobs.api'
import apiClient from './client'
import type { GenerateResponse, Product, ProductAssistExtracted, ProductCreateResponse } from '../types/product.types'
import { uniqueBy } from '../lib/utils'

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
    jobs
      .filter((job) => job.job_type === 'product_assets' && job.ref_id)
      .map((job) => job.ref_id as string),
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

export const productAssistChat = async (
  message: string,
  extracted: ProductAssistExtracted,
): Promise<{ message: string; extracted?: ProductAssistExtracted; is_complete?: boolean }> => {
  const next = { ...extracted }
  const lower = message.toLowerCase()

  if (!next.name) {
    next.name = message.trim()
    return { message: 'Iski keemat kitni rakhni hai?', extracted: next }
  }

  if (!next.price_mrp) {
    const price = parseNumber(message)
    if (typeof price === 'number') {
      next.price_mrp = price
      return { message: 'Ye kis category me aata hai - apparel, jewelry, pottery, painting, home decor ya other?', extracted: next }
    }
    return { message: 'Price number me batayein, jaise 1299.', extracted: next }
  }

  if (!next.category) {
    const options: NonNullable<ProductAssistExtracted['category']>[] = ['apparel', 'jewelry', 'pottery', 'painting', 'home_decor', 'other']
    const matched = options.find((option) => lower.includes(option.replace('_', ' ')) || lower.includes(option))
    if (matched) {
      next.category = matched
      return { message: 'Ye zyada kis mauke ke liye hai?', extracted: next }
    }
    return { message: 'Ek category chuniye - apparel, jewelry, pottery, painting, home decor ya other.', extracted: next }
  }

  if (!next.occasion) {
    const options: NonNullable<ProductAssistExtracted['occasion']>[] = ['wedding', 'festival', 'daily', 'gifting', 'home_decor', 'export', 'general']
    const matched = options.find((option) => lower.includes(option.replace('_', ' ')) || lower.includes(option))
    if (matched) {
      next.occasion = matched
      return { message: 'Is product ko apni zubaan me thoda sa batao.', extracted: next }
    }
    return { message: 'Simple option batayein - wedding, festival, daily, gifting, home decor, export ya general.', extracted: next }
  }

  if (!next.description_voice) {
    next.description_voice = message.trim()
    return { message: 'Ye banane me kitne ghante lagte hain?', extracted: next }
  }

  if (!next.time_to_make_hrs) {
    const hours = parseNumber(message)
    if (typeof hours === 'number') {
      next.time_to_make_hrs = hours
      return { message: 'Bahut badhiya. Ab neeche category details aur photos bhar do.', extracted: next, is_complete: true }
    }
    return { message: 'Ghante number me batayein, jaise 6 ya 12.', extracted: next }
  }

  return { message: 'Phase 1 complete hai. Ab category details bhariye.', extracted: next, is_complete: true }
}
