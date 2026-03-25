import type { ReactNode } from 'react'
import Button from './Button'

interface ModalProps {
  open: boolean
  title: string
  children: ReactNode
  onClose: () => void
}

export default function Modal({ open, title, children, onClose }: ModalProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-stone-950/40 p-4 sm:items-center">
      <div className="w-full max-w-lg rounded-3xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-xl font-semibold text-stone-900">{title}</h2>
          <Button variant="ghost" onClick={onClose}>
            Band karo
          </Button>
        </div>
        {children}
      </div>
    </div>
  )
}
