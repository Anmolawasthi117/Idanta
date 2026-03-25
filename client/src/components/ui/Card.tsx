import type { HTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

export default function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-3xl border border-stone-200 bg-white p-5 shadow-sm', className)} {...props} />
}
