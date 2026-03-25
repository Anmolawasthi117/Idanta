import type { Brand } from '../types/brand.types'
import type { Product } from '../types/product.types'
import { slugifyFilename } from '../lib/utils'

export interface AssetDownload {
  url: string
  filename: string
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
    return { url: brand.logo_url, filename: `${name}-logo.svg` }
  }
  if (type === 'banner' && brand.banner_url) {
    return { url: brand.banner_url, filename: `${name}-banner.svg` }
  }
  throw new Error('Ye file abhi available nahi hai.')
}

export const getProductAssetUrl = async (
  product: Product,
  type: 'hang_tag' | 'label' | 'photo',
): Promise<AssetDownload> => {
  const name = slugifyFilename(product.name || 'product')
  if (type === 'hang_tag' && product.hang_tag_url) {
    return { url: product.hang_tag_url, filename: `${name}-hang-tag.pdf` }
  }
  if (type === 'label' && product.label_url) {
    return { url: product.label_url, filename: `${name}-label.pdf` }
  }
  if (type === 'photo' && product.branded_photo_url) {
    return { url: product.branded_photo_url, filename: `${name}-photo.jpg` }
  }
  throw new Error('Ye asset abhi available nahi hai.')
}
