import type { BrandCreatePayload } from '../types/brand.types'
import type { ProductAssistExtracted, ProductCategory, ProductOccasion } from '../types/product.types'

const toTrimmedString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  const next = value.trim()
  return next.length > 0 ? next : undefined
}

const toNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return undefined
  const cleaned = value.replace(/[^\d.]/g, '')
  if (!cleaned) return undefined
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : undefined
}

const normalizeEnum = <T extends string>(value: unknown, allowed: readonly T[]): T | undefined => {
  const raw = toTrimmedString(value)?.toLowerCase().replace(/[\s-]+/g, '_')
  if (!raw) return undefined
  return allowed.includes(raw as T) ? (raw as T) : undefined
}

const BRAND_OCCASIONS = ['wedding', 'festival', 'daily', 'gifting', 'home_decor', 'export', 'general'] as const
const BRAND_CUSTOMERS = ['local_bazaar', 'tourist', 'online_india', 'export'] as const
const BRAND_FEELS = ['earthy', 'royal', 'vibrant', 'minimal'] as const
const BRAND_SCRIPT = ['hindi', 'english', 'both'] as const

const PRODUCT_CATEGORIES = ['apparel', 'jewelry', 'pottery', 'painting', 'home_decor', 'other'] as const
const PRODUCT_OCCASIONS = ['wedding', 'festival', 'daily', 'gifting', 'home_decor', 'export', 'general'] as const

export const normalizeBrandExtracted = (
  input: Partial<BrandCreatePayload> | Record<string, unknown>,
): Partial<BrandCreatePayload> | undefined => {
  const source = input as Record<string, unknown>
  const normalized: Partial<BrandCreatePayload> = {}

  const craftId = toTrimmedString(source.craft_id)
  if (craftId) normalized.craft_id = craftId

  const artisanName = toTrimmedString(source.artisan_name)
  if (artisanName) normalized.artisan_name = artisanName

  const region = toTrimmedString(source.region)
  if (region) normalized.region = region

  const years = toNumber(source.years_of_experience)
  if (typeof years === 'number') normalized.years_of_experience = Math.max(0, Math.round(years))

  const generations = toNumber(source.generations_in_craft)
  if (typeof generations === 'number') normalized.generations_in_craft = Math.max(0, Math.round(generations))

  const occasion = normalizeEnum(source.primary_occasion, BRAND_OCCASIONS)
  if (occasion) normalized.primary_occasion = occasion

  const customer = normalizeEnum(source.target_customer, BRAND_CUSTOMERS)
  if (customer) normalized.target_customer = customer

  const feel = normalizeEnum(source.brand_feel, BRAND_FEELS)
  if (feel) normalized.brand_feel = feel

  const script = normalizeEnum(source.script_preference, BRAND_SCRIPT)
  if (script) normalized.script_preference = script

  const preferredLanguage = normalizeEnum(source.preferred_language, ['hi', 'en'] as const)
  if (preferredLanguage) normalized.preferred_language = preferredLanguage

  const textFields: Array<keyof Pick<
    BrandCreatePayload,
    'name' | 'tagline' | 'artisan_story' | 'brand_values' | 'brand_vision' | 'brand_mission'
  >> = ['name', 'tagline', 'artisan_story', 'brand_values', 'brand_vision', 'brand_mission']

  for (const field of textFields) {
    const value = toTrimmedString(source[field])
    if (value) {
      normalized[field] = value as never
    }
  }

  const referenceImages = Array.isArray(source.reference_images)
    ? source.reference_images.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : undefined
  if (referenceImages && referenceImages.length > 0) normalized.reference_images = referenceImages

  return Object.keys(normalized).length > 0 ? normalized : undefined
}

export const normalizeProductExtracted = (
  input: Partial<ProductAssistExtracted> | Record<string, unknown>,
): ProductAssistExtracted | undefined => {
  const source = input as Record<string, unknown>
  const normalized: ProductAssistExtracted = {}

  const name = toTrimmedString(source.name)
  if (name) normalized.name = name

  const price = toNumber(source.price_mrp)
  if (typeof price === 'number') normalized.price_mrp = Math.max(0, Math.round(price))

  const category = normalizeEnum(source.category, PRODUCT_CATEGORIES)
  if (category) normalized.category = category as ProductCategory

  const occasion = normalizeEnum(source.occasion, PRODUCT_OCCASIONS)
  if (occasion) normalized.occasion = occasion as ProductOccasion

  const description = toTrimmedString(source.description_voice)
  if (description) normalized.description_voice = description

  const hours = toNumber(source.time_to_make_hrs)
  if (typeof hours === 'number') normalized.time_to_make_hrs = Math.max(0, Math.round(hours))

  return Object.keys(normalized).length > 0 ? normalized : undefined
}

