import { SendHorizonal } from 'lucide-react'
import { useState } from 'react'
import Button from '../ui/Button'
import VoiceRecorder from './VoiceRecorder'

interface ChatInputProps {
  onSend: (message: string) => void
  loading?: boolean
  placeholder?: string
}

export default function ChatInput({ onSend, loading = false, placeholder = 'Yahan likhiye...' }: ChatInputProps) {
  const [value, setValue] = useState('')

  const submit = () => {
    const trimmed = value.trim()
    if (!trimmed || loading) return
    onSend(trimmed)
    setValue('')
  }

  return (
    <div className="space-y-3">
      <textarea
        className="min-h-28 w-full rounded-3xl border border-stone-200 bg-white px-4 py-3 text-base outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
        placeholder={placeholder}
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      <div className="flex items-center justify-between gap-3">
        <VoiceRecorder onTranscript={(transcript) => setValue((current) => `${current} ${transcript}`.trim())} />
        <Button type="button" onClick={submit} loading={loading} className="ml-auto">
          <span className="inline-flex items-center gap-2">
            <SendHorizonal className="h-4 w-4" />
            Bhejo
          </span>
        </Button>
      </div>
    </div>
  )
}
