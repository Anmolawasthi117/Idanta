import { useMutation } from '@tanstack/react-query'
import { getBrandAssetUrl, getProductAssetUrl } from '../api/assets.api'
import type { Brand } from '../types/brand.types'
import type { Product } from '../types/product.types'

export const useBrandAsset = () =>
  useMutation({
    mutationFn: ({ brand, type }: { brand: Brand; type: 'kit' | 'logo' | 'banner' }) =>
      getBrandAssetUrl(brand, type),
  })

export const useProductAsset = () =>
  useMutation({
    mutationFn: ({ product, type }: { product: Product; type: 'hang_tag' | 'label' | 'photo' }) =>
      getProductAssetUrl(product, type),
  })
