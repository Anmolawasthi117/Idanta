import { useMutation, useQuery } from '@tanstack/react-query'
import { createProduct, generateProductAssets, getProduct, listProducts } from '../api/product.api'

export const useProducts = (brandId: string | null) =>
  useQuery({
    queryKey: ['products', brandId],
    queryFn: () => listProducts(brandId as string),
    enabled: Boolean(brandId),
  })

export const useProduct = (productId: string | null) =>
  useQuery({
    queryKey: ['product', productId],
    queryFn: () => getProduct(productId as string),
    enabled: Boolean(productId),
  })

export const useCreateProduct = () =>
  useMutation({
    mutationFn: (formData: FormData) => createProduct(formData),
  })

export const useGenerateProductAssets = () =>
  useMutation({
    mutationFn: (productId: string) => generateProductAssets(productId),
  })
