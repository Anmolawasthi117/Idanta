import type { InputHTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  hint?: string
  error?: string
}

export default function Input({ label, hint, error, className, id, ...props }: InputProps) {
  const inputId = id ?? props.name
  return (
    <label className="block space-y-2">
      {label ? <span className="block text-base font-medium text-stone-800">{label}</span> : null}
      <input
        id={inputId}
        className={cn(
          'min-h-11 w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-base text-stone-900 outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-100',
          error && 'border-red-300 focus:border-red-400 focus:ring-red-100',
          className,
        )}
        {...props}
      />
      {error ? <span className="text-sm text-red-600">{error}</span> : null}
      {!error && hint ? <span className="text-sm text-stone-500">{hint}</span> : null}
    </label>
  )
}
