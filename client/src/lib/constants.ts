export const API_BASE_URL =
  (import.meta.env.VITE_API_URL as string | undefined)?.trim() ||
  'http://localhost:8000/api/v1'

export const JOB_POLL_INTERVAL_MS = 2500

export const MAX_PRODUCT_PHOTOS = 5
export const MAX_PRODUCT_PHOTO_SIZE_BYTES = 5 * 1024 * 1024
export const ACCEPTED_IMAGE_TYPES: string[] = ['image/jpeg', 'image/png', 'image/webp']
