import { clsx, type ClassValue } from 'clsx'
import DOMPurify from 'dompurify'
import { twMerge } from 'tailwind-merge'

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs))

export const formatDate = (value: Date | string | number) =>
  new Date(value).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
  })

export const formatPrice = (value: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value)

export const getErrorMessage = (error: unknown): string => {
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message
  if (
    typeof error === 'object' &&
    error !== null &&
    'response' in error &&
    typeof (error as { response?: unknown }).response === 'object'
  ) {
    const response = (error as { response?: { data?: unknown } }).response
    const detail =
      typeof response?.data === 'object' &&
      response?.data !== null &&
      'detail' in response.data
        ? (response.data as { detail?: unknown }).detail
        : undefined
    if (typeof detail === 'string' && detail.trim()) return detail
  }
  return 'Something went wrong. Please try again.'
}

export const sanitizeHtml = (html: string) => DOMPurify.sanitize(html)

export const downloadBlob = (url: string, filename: string) => {
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

export const uniqueBy = <T, K>(items: T[], keyFn: (item: T) => K): T[] => {
  const seen = new Set<K>()
  return items.filter((item) => {
    const key = keyFn(item)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export const slugifyFilename = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'file'

const loadImage = (url: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Image could not be loaded'))
    image.src = url
  })

const canvasToBlob = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Unable to convert image'))
        return
      }
      resolve(blob)
    }, 'image/png')
  })

export const rasterizeSvgUrl = async (
  svgUrl: string,
  options: { width: number; height: number },
): Promise<string> => {
  const response = await fetch(svgUrl)
  if (!response.ok) throw new Error('Unable to fetch SVG file')

  const svgBlob = await response.blob()
  const svgObjectUrl = URL.createObjectURL(svgBlob)

  try {
    const image = await loadImage(svgObjectUrl)
    const canvas = document.createElement('canvas')
    canvas.width = options.width
    canvas.height = options.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas is not supported')
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const pngBlob = await canvasToBlob(canvas)
    return URL.createObjectURL(pngBlob)
  } finally {
    URL.revokeObjectURL(svgObjectUrl)
  }
}

