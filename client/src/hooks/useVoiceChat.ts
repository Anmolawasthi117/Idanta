import { useCallback, useRef, useState } from 'react'
import { transcribeAudio, synthesizeSpeech } from '../api/chat.api'

export interface VoiceChatOptions {
  language: 'hi' | 'en' | 'hg'
  onResult: (text: string) => void
  onSpeechStarted?: () => void
  onSpeechEnded?: () => void
  onError?: (err: string) => void
}

export const useVoiceChat = ({
  language,
  onResult,
  onSpeechStarted,
  onSpeechEnded,
  onError,
}: VoiceChatOptions) => {
  const [isRecording, setIsRecording] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isProcessingTranscription, setIsProcessingTranscription] = useState(false)
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const startRecording = useCallback(async () => {
    try {
      stopAudio()
      setIsPlaying(false)

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstart = () => {
        setIsRecording(true)
        onSpeechStarted?.()
      }

      mediaRecorder.onstop = async () => {
        setIsRecording(false)
        onSpeechEnded?.()
        
        // Process the blobs
        if (audioChunksRef.current.length > 0) {
          setIsProcessingTranscription(true)
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
          
          try {
            const text = await transcribeAudio(audioBlob, language)
            if (text && text.trim()) {
               onResult(text.trim())
            }
          } catch (err: any) {
            console.error('Transcription error:', err)
            onError?.('Awaaz samajh nahi aayi, please dobara koshish karein.')
          } finally {
            setIsProcessingTranscription(false)
          }
        }
        
        // Stop all tracks to release microphone
        stream.getTracks().forEach(track => track.stop())
      }

      mediaRecorderRef.current = mediaRecorder
      mediaRecorder.start()

    } catch (err: any) {
      console.error('Microphone access denied or error:', err)
      onError?.('Microphone ki permission nahi milli. Check karein.')
    }
  }, [language, onError, onResult, onSpeechEnded, onSpeechStarted])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
  }, [])

  const playSynthesizedSpeech = useCallback(
    async (text: string) => {
      // Strip markdown
      const cleanText = text.replace(/[*_#`~>]/g, '')
      if (!cleanText.trim()) return

      stopAudio()
      setIsPlaying(true)
      
      try {
        const audioBase64 = await synthesizeSpeech(cleanText, language)
        const audioEl = new Audio(`data:audio/wav;base64,${audioBase64}`)
        audioRef.current = audioEl
        
        audioEl.onended = () => {
          setIsPlaying(false)
        }
        audioEl.onerror = () => {
           setIsPlaying(false)
        }
        
        await audioEl.play()
      } catch (err) {
        console.error('TTS error:', err)
        setIsPlaying(false)
      }
    },
    [language]
  )
  
  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      audioRef.current = null
    }
    setIsPlaying(false)
  }, [])

  return {
    isRecording,
    isPlaying,
    isProcessingTranscription,
    startRecording,
    stopRecording,
    playSynthesizedSpeech,
    stopAudio,
  }
}
