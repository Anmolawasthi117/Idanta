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
  brand_id?: string
  craft_id: string
  artisan_name: string
  region: string
  years_of_experience: number
  generations_in_craft: number
  primary_occasion?: PrimaryOccasion
  target_customer?: TargetCustomer
  brand_feel?: BrandFeel
  script_preference: ScriptPreference
  artisan_story?: string
  brand_values?: string
  brand_vision?: string
  brand_mission?: string
  preferred_language: string
  name?: string
  tagline?: string
  reference_images?: string[]
}

export interface BrandPattern {
  name: string
  description: string
  image_url?: string | null
}

export interface BrandMotifPreview {
  name: string
  description?: string | null
  image_url: string
}

export interface BrandPalette {
  primary: string
  secondary: string
  accent: string
  background?: string
}

export interface BrandPaletteOption {
  option_id: string
  name: string
  rationale: string
  palette: BrandPalette
}

export interface BrandAssetCandidate {
  candidate_id: string
  image_url: string
  title: string
  rationale: string
}

export interface BrandPhaseFourCandidates {
  brand_id: string
  logos: BrandAssetCandidate[]
  banners: BrandAssetCandidate[]
}

export interface BrandVisualFoundation {
  brand_id: string
  reference_images: string[]
  visual_summary: string
  visual_motifs: string[]
  motif_previews: BrandMotifPreview[]
  signature_patterns: BrandPattern[]
  palette: BrandPalette
  palette_options: BrandPaletteOption[]
  recommended_palette_id?: string | null
  selected_palette_id?: string | null
}

export interface BrandIdentityPair {
  pair_id: string
  name: string
  tagline: string
  why_it_fits?: string | null
}

export interface RankedBrandIdentityPair extends BrandIdentityPair {
  rank: number
  explanation: string
}

export interface BrandIdentitySetResponse {
  set_number: number
  pairs: BrandIdentityPair[]
  has_more: boolean
}

export interface BrandIdentityRankResponse {
  ranked_pairs: RankedBrandIdentityPair[]
  recommended_pair_id?: string | null
  next_prompt: string
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
  brand_values?: string
  brand_vision?: string
  brand_mission?: string
  preferred_language?: string
  reference_images?: string[]
  visual_summary?: string
  visual_motifs?: string[]
  motif_previews?: BrandMotifPreview[]
  signature_patterns?: BrandPattern[]
  palette_options?: BrandPaletteOption[]
  recommended_palette_id?: string | null
  selected_palette_id?: string | null
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
