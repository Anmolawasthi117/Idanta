import apiClient from './client'
import { API_BASE_URL } from '../lib/constants'
import { useAuthStore } from '../store/authStore'
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

export type StreamEvent<T> =
  | { type: 'chunk'; content: string }
  | { type: 'final'; extracted?: Partial<T>; is_complete?: boolean }
  | { type: 'error'; content: string }

export const createChatStream = async <T>(
  endpoint: string,
  payload: ChatAssistRequest,
  onEvent: (event: StreamEvent<T>) => void,
): Promise<void> => {
  const token = useAuthStore.getState().token
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    throw new Error(`Stream Error: ${response.statusText}`)
  }

  const reader = response.body?.getReader()
  const decoder = new TextDecoder('utf-8')
  if (!reader) throw new Error('No reader')

  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n\n')
    buffer = parts.pop() ?? '' // Last part might be incomplete

    for (const part of parts) {
      if (part.startsWith('data: ')) {
        try {
          const data = JSON.parse(part.substring(6)) as StreamEvent<T>
          onEvent(data)
        } catch (e) {
          console.error('Failed to parse stream part', part, e)
        }
      }
    }
  }
}

export const brandAssistStream = (
  payload: ChatAssistRequest,
  onEvent: (event: StreamEvent<BrandCreatePayload>) => void,
) => createChatStream('/chat/brand-assist-stream', payload, onEvent)

export const productAssistStream = (
  payload: ChatAssistRequest,
  onEvent: (event: StreamEvent<ProductAssistExtracted>) => void,
) => createChatStream('/chat/product-assist-stream', payload, onEvent)

export const transcribeAudio = async (audioBlob: Blob, language: string): Promise<string> => {
  const formData = new FormData()
  formData.append('audio', audioBlob, 'recording.webm')
  if (language) {
    formData.append('language', language === 'en' ? 'en' : 'hi')
  }

  const { data } = await apiClient.post<{ text: string }>('/chat/transcribe-audio', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data.text
}

export const synthesizeSpeech = async (text: string, language: string): Promise<string> => {
  // Enforce Hindi target language as per user requirement for this version
  const payload = {
    text,
    target_language_code: 'hi-IN'
  }
  const { data } = await apiClient.post<{ audio_base64: string }>('/chat/synthesize-speech', payload)
  return data.audio_base64
}
