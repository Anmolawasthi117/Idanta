import type { HTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

export default function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-3xl border border-[#1f5c5a]/10 bg-white/95 p-5 shadow-[0_20px_45px_rgba(55,43,31,0.06)]', className)}
      {...props}
    />
  )
}
