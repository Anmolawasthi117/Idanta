import type { SelectHTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

interface SelectOption {
  label: string
  value: string
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  options: SelectOption[]
  error?: string
}

export default function Select({ label, options, error, className, id, ...props }: SelectProps) {
  const selectId = id ?? props.name
  return (
    <label className="block space-y-2">
      {label ? <span className="block text-base font-medium text-stone-800">{label}</span> : null}
      <select
        id={selectId}
        className={cn(
          'min-h-11 w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-base text-stone-900 outline-none focus:border-[#1f5c5a] focus:ring-2 focus:ring-[#dce9e5]',
          error && 'border-red-300 focus:border-red-400 focus:ring-red-100',
          className,
        )}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error ? <span className="text-sm text-red-600">{error}</span> : null}
    </label>
  )
}
