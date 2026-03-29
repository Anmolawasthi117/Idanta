import type { TextareaHTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
}

export default function Textarea({ label, error, className, id, ...props }: TextareaProps) {
  const textareaId = id ?? props.name
  return (
    <label className="block space-y-2">
      {label ? <span className="block text-base font-medium text-stone-800">{label}</span> : null}
      <textarea
        id={textareaId}
        className={cn(
          'min-h-28 w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-base text-stone-900 outline-none transition focus:border-[#1f5c5a] focus:ring-2 focus:ring-[#dce9e5]',
          error && 'border-red-300 focus:border-red-400 focus:ring-red-100',
          className,
        )}
        {...props}
      />
      {error ? <span className="text-sm text-red-600">{error}</span> : null}
    </label>
  )
}
