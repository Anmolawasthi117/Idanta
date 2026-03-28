import { useMutation, useQuery } from '@tanstack/react-query'
import {
  createBrand,
  getBrand,
  getCrafts,
  regenerateBrand,
  regenerateBrandAsset,
  type RegenerableBrandAsset,
  updateBrandIdentity,
} from '../api/brand.api'
import type { BrandCreatePayload } from '../types/brand.types'

export const useCrafts = () =>
  useQuery({
    queryKey: ['crafts'],
    queryFn: getCrafts,
    staleTime: Infinity,
  })

export const useBrand = (brandId: string | null) =>
  useQuery({
    queryKey: ['brand', brandId],
    queryFn: () => getBrand(brandId as string),
    enabled: Boolean(brandId),
  })

export const useCreateBrand = () =>
  useMutation({
    mutationFn: (payload: BrandCreatePayload) => createBrand(payload),
  })

export const useRegenerateBrand = () =>
  useMutation({
    mutationFn: (brandId: string) => regenerateBrand(brandId),
  })

export const useRegenerateBrandAsset = () =>
  useMutation({
    mutationFn: ({
      brandId,
      assetType,
      payload,
    }: {
      brandId: string
      assetType: RegenerableBrandAsset
      payload?: { name?: string; tagline?: string }
    }) => regenerateBrandAsset(brandId, assetType, payload),
  })

export const useUpdateBrandIdentity = () =>
  useMutation({
    mutationFn: ({ brandId, name, tagline }: { brandId: string; name: string; tagline: string }) =>
      updateBrandIdentity(brandId, { name, tagline }),
  })
