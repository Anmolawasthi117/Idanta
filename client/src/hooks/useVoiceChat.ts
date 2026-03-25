import { useCallback, useRef, useState } from 'react'
import { transcribeAudio } from '../api/chat.api'

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
  const utterancesRef = useRef<SpeechSynthesisUtterance[]>([])

  const startRecording = useCallback(async () => {
    try {
      window.speechSynthesis.cancel()
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
    (text: string) => {
      if (!window.speechSynthesis) return

      // Strip markdown so the bot doesn't pronounce asterisks
      const cleanText = text.replace(/[*_#`~>]/g, '')
      if (!cleanText.trim()) return

      window.speechSynthesis.cancel()
      setIsPlaying(true)
      
      const utterance = new SpeechSynthesisUtterance(cleanText)
      utterancesRef.current.push(utterance) // Prevent Chrome garbage collection bug
      
      utterance.lang = language === 'en' ? 'en-IN' : 'hi-IN'
      
      const voices = window.speechSynthesis.getVoices()
      const langPrefix = language === 'en' ? 'en' : 'hi'
      
      const preferredVoice = voices.find(
        v => v.lang.startsWith(langPrefix) && v.localService
      ) || voices.find(v => v.lang.startsWith(langPrefix))

      if (preferredVoice) {
        utterance.voice = preferredVoice
      }

      utterance.onend = () => {
        setIsPlaying(false)
        // Cleanup ref
        const index = utterancesRef.current.indexOf(utterance)
        if (index > -1) utterancesRef.current.splice(index, 1)
      }
      
      utterance.onerror = () => {
        setIsPlaying(false)
      }
      
      window.speechSynthesis.speak(utterance)
    },
    [language]
  )
  
  const stopAudio = useCallback(() => {
    window.speechSynthesis.cancel()
    setIsPlaying(false)
    utterancesRef.current = []
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
