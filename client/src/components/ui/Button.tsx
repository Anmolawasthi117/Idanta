import type { ButtonHTMLAttributes, ReactNode } from 'react'
import Spinner from './Spinner'
import { cn } from '../../lib/utils'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost'
  size?: 'md' | 'lg'
  loading?: boolean
  children: ReactNode
}

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex min-h-11 items-center justify-center rounded-2xl font-semibold transition disabled:cursor-not-allowed disabled:opacity-60',
        variant === 'primary' && 'bg-[#1f5c5a] text-white shadow-sm hover:bg-[#184b49]',
        variant === 'secondary' && 'border border-[#1f5c5a]/15 bg-white text-[#1f5c5a] hover:bg-[#eef4f1]',
        variant === 'ghost' && 'text-stone-700 hover:bg-stone-100',
        size === 'md' && 'px-4 py-3 text-base',
        size === 'lg' && 'px-5 py-4 text-lg',
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Spinner className="mr-2" /> : null}
      {children}
    </button>
  )
}
