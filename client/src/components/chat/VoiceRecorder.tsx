import { Mic, Loader2 } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import Button from '../ui/Button'
import { useToast } from '../ui/useToast'
import { transcribeAudio } from '../../api/chat.api'

export default function VoiceRecorder({ onTranscript }: { onTranscript: (value: string) => void }) {
  const [isRecording, setIsRecording] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const { pushToast } = useToast()
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data)
      }

      mediaRecorder.onstart = () => {
        setIsRecording(true)
      }

      mediaRecorder.onstop = async () => {
        setIsRecording(false)
        if (audioChunksRef.current.length > 0) {
          setIsProcessing(true)
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
          try {
            const text = await transcribeAudio(audioBlob, 'hi')
            if (text && text.trim()) onTranscript(text.trim())
          } catch (err: any) {
             pushToast('Awaaz samajh nahi aayi, please dobara try karein.')
          } finally {
             setIsProcessing(false)
          }
        }
        stream.getTracks().forEach(track => track.stop())
      }

      mediaRecorderRef.current = mediaRecorder
      mediaRecorder.start()
    } catch (err) {
      pushToast('Microphone access denied.')
    }
  }, [onTranscript, pushToast])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
  }, [])

  return (
    <Button
      type="button"
      variant="secondary"
      onClick={() => {
        if (isRecording) {
            stopRecording()
        } else {
            startRecording()
        }
      }}
      disabled={isProcessing}
      className="shrink-0"
    >
      <span className="inline-flex items-center gap-2">
        {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
        {isRecording ? <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" /> : null}
        {isProcessing ? 'Processing' : 'Bolo'}
      </span>
    </Button>
  )
}
