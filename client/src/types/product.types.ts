export type ProductCategory = 'apparel' | 'jewelry' | 'pottery' | 'painting' | 'home_decor' | 'other'
export type ProductOccasion = 'wedding' | 'festival' | 'daily' | 'gifting' | 'home_decor' | 'export' | 'general'

export interface ApparelData {
  category_type: 'apparel'
  fabric_type: string
  sizes_available: string[]
  wash_care: string
  print_technique: string
  dye_type?: string
}

export interface JewelryData {
  category_type: 'jewelry'
  jewelry_type: string
  sizes_available: string[]
  metal_or_base: string
  stone_or_inlay?: string
  pair_or_set: string
}

export interface PotteryData {
  category_type: 'pottery'
  pottery_type: string
  capacity_ml?: number
  finish_type: string
  is_food_safe: boolean
  fragility_note: boolean
}

export interface PaintingData {
  category_type: 'painting'
  art_style: string
  medium: string
  surface: string
  width_cm: number
  height_cm: number
  is_original: boolean
}

export interface HomeDecorData {
  category_type: 'home_decor'
  decor_type: string
  material_primary: string
  width_cm?: number
  height_cm?: number
  depth_cm?: number
  assembly_required: boolean
  indoor_outdoor: string
}

export interface OtherData {
  category_type: 'other'
  custom_description?: string
}

export type CategoryData =
  | ApparelData
  | JewelryData
  | PotteryData
  | PaintingData
  | HomeDecorData
  | OtherData

export interface Product {
  id: string
  brand_id: string
  name: string
  price_mrp: number
  category: ProductCategory
  occasion: ProductOccasion
  motif_used?: string
  material?: string
  description_voice?: string
  time_to_make_hrs: number
  listing_copy?: string
  social_caption?: string
  care_instructions?: string
  photos: string[]
  branded_photo_url?: string
  hang_tag_url?: string
  label_url?: string
  story_card_url?: string
  certificate_url?: string
  kit_zip_url?: string
  status: 'pending' | 'processing' | 'ready' | 'failed'
  category_data: CategoryData
}

export interface ProductCreateResponse {
  id: string
  brand_id: string
  name: string
  status: string
}

export interface GenerateResponse {
  job_id: string
  message: string
}

export interface ProductAssistExtracted {
  name?: string
  price_mrp?: number
  category?: ProductCategory
  occasion?: ProductOccasion
  description_voice?: string
  time_to_make_hrs?: number
}
