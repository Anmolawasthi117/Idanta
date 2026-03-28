import { useMutation, useQuery } from '@tanstack/react-query'
import { createBrand, getBrand, getCrafts, regenerateBrand, regenerateBrandAsset, type RegenerableBrandAsset } from '../api/brand.api'
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
    mutationFn: ({ brandId, assetType }: { brandId: string; assetType: RegenerableBrandAsset }) =>
      regenerateBrandAsset(brandId, assetType),
  })
