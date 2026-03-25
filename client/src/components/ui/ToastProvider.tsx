import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { cn } from '../../lib/utils'
import { ToastContext } from './toastContext'

interface ToastItem {
  id: number
  message: string
  tone: 'error' | 'success'
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])

  const pushToast = useCallback((message: string, tone: 'error' | 'success' = 'error') => {
    const id = Date.now()
    setItems((current) => [...current, { id, message, tone }])
    window.setTimeout(() => {
      setItems((current) => current.filter((item) => item.id !== id))
    }, 3500)
  }, [])

  const value = useMemo(() => ({ pushToast }), [pushToast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 top-4 z-[60] space-y-3 sm:left-auto sm:right-4 sm:w-96">
        {items.map((item) => (
          <div
            key={item.id}
            className={cn(
              'rounded-2xl px-4 py-3 text-sm font-medium text-white shadow-lg',
              item.tone === 'error' ? 'bg-stone-900' : 'bg-emerald-600',
            )}
          >
            {item.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
