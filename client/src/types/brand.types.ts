export type PrimaryOccasion =
  | 'wedding'
  | 'festival'
  | 'daily'
  | 'gifting'
  | 'home_decor'
  | 'export'
  | 'general'

export type TargetCustomer = 'local_bazaar' | 'tourist' | 'online_india' | 'export'
export type BrandFeel = 'earthy' | 'royal' | 'vibrant' | 'minimal'
export type ScriptPreference = 'hindi' | 'english' | 'both'

export interface BrandCreatePayload {
  craft_id: string
  artisan_name: string
  region: string
  years_of_experience: number
  generations_in_craft: number
  primary_occasion: PrimaryOccasion
  target_customer: TargetCustomer
  brand_feel: BrandFeel
  script_preference: ScriptPreference
  artisan_story?: string
  preferred_language: string
}

export interface BrandPalette {
  primary: string
  secondary: string
  accent: string
  background?: string
}

export interface Brand {
  id: string
  craft_id: string
  name: string
  tagline: string
  palette: BrandPalette
  story_en: string
  story_hi: string
  logo_url: string | null
  banner_url: string | null
  kit_zip_url: string | null
  status: 'pending' | 'ready' | 'failed'
  artisan_name: string
  region: string
  brand_feel: BrandFeel
  years_of_experience?: number
  generations_in_craft?: number
  primary_occasion?: PrimaryOccasion
  target_customer?: TargetCustomer
  script_preference?: ScriptPreference
  artisan_story?: string
  preferred_language?: string
}

export interface CraftItem {
  craft_id: string
  display_name: string
  region: string
  description: string
}

export interface BrandChatMessage {
  message: string
  extracted?: Partial<BrandCreatePayload>
  is_complete?: boolean
}
