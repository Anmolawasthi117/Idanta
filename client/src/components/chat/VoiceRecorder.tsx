import { Mic } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import Button from '../ui/Button'
import { useToast } from '../ui/useToast'

interface SpeechRecognitionResultLike {
  readonly isFinal: boolean
  readonly 0: { transcript: string }
}

interface SpeechRecognitionEventLike extends Event {
  readonly results: ArrayLike<SpeechRecognitionResultLike>
}

interface SpeechRecognitionLike extends EventTarget {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: Event) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionLike
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitSpeechRecognition?: SpeechRecognitionConstructor
  }
}

export default function VoiceRecorder({ onTranscript }: { onTranscript: (value: string) => void }) {
  const [isRecording, setIsRecording] = useState(false)
  const { pushToast } = useToast()
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const Recognition = useMemo(
    () => window.SpeechRecognition ?? window.webkitSpeechRecognition,
    [],
  )

  useEffect(() => {
    if (!Recognition) return
    const recognition = new Recognition()
    recognition.lang = 'hi-IN'
    recognition.interimResults = false
    recognition.continuous = false
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0].transcript)
        .join(' ')
        .trim()
      if (transcript) onTranscript(transcript)
    }
    recognition.onerror = () => {
      setIsRecording(false)
      pushToast('Awaaz nahi suni - dobara try karein')
    }
    recognition.onend = () => setIsRecording(false)
    recognitionRef.current = recognition
    return () => recognition.stop()
  }, [Recognition, onTranscript, pushToast])

  if (!Recognition) return null

  return (
    <Button
      type="button"
      variant="secondary"
      onClick={() => {
        if (isRecording) {
          recognitionRef.current?.stop()
          return
        }
        setIsRecording(true)
        recognitionRef.current?.start()
      }}
      className="shrink-0"
    >
      <span className="inline-flex items-center gap-2">
        <Mic className="h-4 w-4" />
        {isRecording ? <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" /> : null}
        Bolo
      </span>
    </Button>
  )
}
