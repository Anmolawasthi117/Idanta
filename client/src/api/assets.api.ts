import type { Brand } from '../types/brand.types'
import type { Product } from '../types/product.types'
import { rasterizeSvgUrl, slugifyFilename } from '../lib/utils'

export interface AssetDownload {
  url: string
  filename: string
  cleanup?: () => void
}

export const getBrandAssetUrl = async (
  brand: Brand,
  type: 'kit' | 'logo' | 'banner',
): Promise<AssetDownload> => {
  const name = slugifyFilename(brand.name || 'brand')
  if (type === 'kit' && brand.kit_zip_url) {
    return { url: brand.kit_zip_url, filename: `${name}-brand-kit.zip` }
  }
  if (type === 'logo' && brand.logo_url) {
    if (brand.logo_url.endsWith('.svg')) {
      const rasterizedUrl = await rasterizeSvgUrl(brand.logo_url, { width: 2000, height: 2000 })
      return {
        url: rasterizedUrl,
        filename: `${name}-logo.png`,
        cleanup: () => URL.revokeObjectURL(rasterizedUrl),
      }
    }
    return { url: brand.logo_url, filename: `${name}-logo.png` }
  }
  if (type === 'banner' && brand.banner_url) {
    if (brand.banner_url.endsWith('.svg')) {
      const rasterizedUrl = await rasterizeSvgUrl(brand.banner_url, { width: 2400, height: 800 })
      return {
        url: rasterizedUrl,
        filename: `${name}-banner.png`,
        cleanup: () => URL.revokeObjectURL(rasterizedUrl),
      }
    }
    return { url: brand.banner_url, filename: `${name}-banner.png` }
  }
  throw new Error('Ye file abhi available nahi hai.')
}

export const getProductAssetUrl = async (
  product: Product,
  type: 'hang_tag' | 'label' | 'photo' | 'story_card' | 'certificate' | 'kit',
): Promise<AssetDownload> => {
  const name = slugifyFilename(product.name || 'product')
  if (type === 'kit' && product.kit_zip_url) {
    return { url: product.kit_zip_url, filename: `${name}-asset-kit.zip` }
  }
  if (type === 'hang_tag' && product.hang_tag_url) {
    return { url: product.hang_tag_url, filename: `${name}-hang-tag.png` }
  }
  if (type === 'label' && product.label_url) {
    return { url: product.label_url, filename: `${name}-label.png` }
  }
  if (type === 'photo' && product.branded_photo_url) {
    return { url: product.branded_photo_url, filename: `${name}-photo.png` }
  }
  if (type === 'story_card' && product.story_card_url) {
    return { url: product.story_card_url, filename: `${name}-story-card.png` }
  }
  if (type === 'certificate' && product.certificate_url) {
    return { url: product.certificate_url, filename: `${name}-certificate.png` }
  }
  throw new Error('Ye asset abhi available nahi hai.')
}
