import { cn, formatDate } from '../../lib/utils'

interface ChatMessageProps {
  role: 'assistant' | 'user'
  content: string
  timestamp: Date
}

export default function ChatMessage({ role, content, timestamp }: ChatMessageProps) {
  return (
    <div className={cn('flex', role === 'assistant' ? 'justify-start' : 'justify-end')}>
      <div
        className={cn(
          'max-w-[85%] rounded-3xl px-4 py-3 text-base shadow-sm',
          role === 'assistant' ? 'rounded-bl-md bg-white text-stone-800' : 'rounded-br-md bg-orange-500 text-white',
        )}
      >
        <div className="flex items-start gap-3">
          {role === 'assistant' ? <span className="mt-2 h-2.5 w-2.5 rounded-full bg-orange-400" /> : null}
          <div className="space-y-2">
            <p className="whitespace-pre-wrap leading-relaxed">{content}</p>
            <p className={cn('text-xs', role === 'assistant' ? 'text-stone-400' : 'text-orange-100')}>
              {formatDate(timestamp)} {timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
