import { cn } from '../../lib/utils'

interface ProgressBarProps {
  value: number
  className?: string
}

export default function ProgressBar({ value, className }: ProgressBarProps) {
  return (
    <progress
      className={cn(
        'progress-bar h-2.5 w-full overflow-hidden rounded-full bg-orange-100 [&::-webkit-progress-bar]:bg-orange-100 [&::-webkit-progress-value]:bg-orange-500 [&::-webkit-progress-value]:transition-all [&::-moz-progress-bar]:bg-orange-500',
        className,
      )}
      max={100}
      value={Math.max(0, Math.min(100, value))}
    />
  )
}
