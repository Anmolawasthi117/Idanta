import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

interface BadgeProps {
  children: ReactNode
  tone?: 'default' | 'success' | 'warning' | 'danger'
  className?: string
}

export default function Badge({ children, tone = 'default', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex rounded-full px-3 py-1 text-sm font-medium',
        tone === 'default' && 'bg-stone-100 text-stone-700',
        tone === 'success' && 'bg-emerald-100 text-emerald-700',
        tone === 'warning' && 'bg-amber-100 text-amber-700',
        tone === 'danger' && 'bg-red-100 text-red-700',
        className,
      )}
    >
      {children}
    </span>
  )
}
