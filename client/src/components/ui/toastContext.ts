import { createContext } from 'react'

export interface ToastContextValue {
  pushToast: (message: string, tone?: 'error' | 'success') => void
}

export const ToastContext = createContext<ToastContextValue | null>(null)
