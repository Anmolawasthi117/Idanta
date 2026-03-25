import apiClient from './client'
import type { BrandCreatePayload } from '../types/brand.types'
import type { ProductAssistExtracted } from '../types/product.types'

export interface ChatMessagePayload {
  role: 'assistant' | 'user'
  content: string
}

export interface ChatAssistRequest {
  system_prompt: string
  messages: ChatMessagePayload[]
  context?: Record<string, unknown>
}

export interface ChatAssistResponse {
  content: string
}

export interface ParsedChatAssist<T> {
  message: string
  extracted?: Partial<T>
  is_complete?: boolean
}

const parseChatContent = <T,>(content: string): ParsedChatAssist<T> => {
  try {
    const parsed = JSON.parse(content) as {
      message?: string
      extracted?: Partial<T>
      is_complete?: boolean
      summary_message?: string
    }
    return {
      message: parsed.message ?? parsed.summary_message ?? content,
      extracted: parsed.extracted,
      is_complete: parsed.is_complete,
    }
  } catch {
    return { message: content }
  }
}

export const brandAssist = async (
  payload: ChatAssistRequest,
): Promise<ParsedChatAssist<BrandCreatePayload>> => {
  const { data } = await apiClient.post<ChatAssistResponse>('/chat/brand-assist', payload)
  return parseChatContent<BrandCreatePayload>(data.content)
}

export const productAssist = async (
  payload: ChatAssistRequest,
): Promise<ParsedChatAssist<ProductAssistExtracted>> => {
  const { data } = await apiClient.post<ChatAssistResponse>('/chat/product-assist', payload)
  return parseChatContent<ProductAssistExtracted>(data.content)
}
