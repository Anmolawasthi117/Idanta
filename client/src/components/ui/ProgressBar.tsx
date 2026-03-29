import { cn } from '../../lib/utils'

interface ProgressBarProps {
  value: number
  className?: string
}

export default function ProgressBar({ value, className }: ProgressBarProps) {
  return (
    <progress
      className={cn(
        'progress-bar h-2.5 w-full overflow-hidden rounded-full bg-[#dce9e5] [&::-webkit-progress-bar]:bg-[#dce9e5] [&::-webkit-progress-value]:bg-[#1f5c5a] [&::-webkit-progress-value]:transition-all [&::-moz-progress-bar]:bg-[#1f5c5a]',
        className,
      )}
      max={100}
      value={Math.max(0, Math.min(100, value))}
    />
  )
}
