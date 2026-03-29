import { useMutation, useQuery } from '@tanstack/react-query'
import {
  analyzeBrandVisualFoundation,
  createBrand,
  generateBrandIdentityCandidates,
  getBrand,
  getCrafts,
  rankBrandIdentityCandidates,
  regenerateBrand,
  regenerateBrandAsset,
  saveBrandIdentityDraft,
  type RegenerableBrandAsset,
  updateBrandIdentity,
} from '../api/brand.api'
import type { BrandCreatePayload, BrandIdentityPair } from '../types/brand.types'

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

export const useGenerateBrandIdentityCandidates = () =>
  useMutation({
    mutationFn: (payload: BrandCreatePayload & { set_number: 1 | 2; excluded_pairs?: BrandIdentityPair[] }) =>
      generateBrandIdentityCandidates(payload),
  })

export const useRankBrandIdentityCandidates = () =>
  useMutation({
    mutationFn: (payload: BrandCreatePayload & { selected_pairs: BrandIdentityPair[] }) => rankBrandIdentityCandidates(payload),
  })

export const useSaveBrandIdentityDraft = () =>
  useMutation({
    mutationFn: (payload: BrandCreatePayload & { name: string; tagline: string }) => saveBrandIdentityDraft(payload),
  })

export const useAnalyzeBrandVisualFoundation = () =>
  useMutation({
    mutationFn: (payload: BrandCreatePayload & { brand_id: string; reference_images: string[] }) => analyzeBrandVisualFoundation(payload),
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
