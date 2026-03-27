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
  const ttsQueue = useRef<string[]>([])
  const isPlayingQueueRef = useRef(false)

  const stopAudio = useCallback(() => {
    ttsQueue.current = []
    isPlayingQueueRef.current = false
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      audioRef.current = null
    }
    setIsPlaying(false)
  }, [])

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


  const processTTSQueue = useCallback(async () => {
    if (isPlayingQueueRef.current || ttsQueue.current.length === 0) return
    isPlayingQueueRef.current = true
    setIsPlaying(true)
    const textToPlay = ttsQueue.current.shift()!
    try {
      const audioBase64 = await synthesizeSpeech(textToPlay, language)
      const audioEl = new Audio(`data:audio/wav;base64,${audioBase64}`)
      audioRef.current = audioEl
      
      audioEl.onended = () => {
        isPlayingQueueRef.current = false
        if (ttsQueue.current.length === 0) setIsPlaying(false)
        processTTSQueue()
      }
      audioEl.onerror = () => {
         isPlayingQueueRef.current = false
         if (ttsQueue.current.length === 0) setIsPlaying(false)
         processTTSQueue()
      }
      await audioEl.play()
    } catch (err) {
      console.error('TTS error:', err)
      isPlayingQueueRef.current = false
      if (ttsQueue.current.length === 0) setIsPlaying(false)
      processTTSQueue()
    }
  }, [language])

  const enqueueSynthesizedSpeech = useCallback(
    (text: string) => {
      const cleanText = text.replace(/[*_#`~>]/g, '').trim()
      if (!cleanText) return
      ttsQueue.current.push(cleanText)
      processTTSQueue()
    },
    [processTTSQueue]
  )

  const playSynthesizedSpeech = useCallback(
    async (text: string) => {
      ttsQueue.current = []
      isPlayingQueueRef.current = false
      const cleanText = text.replace(/[*_#`~>]/g, '').trim()
      if (!cleanText) return

      stopAudio()
      ttsQueue.current.push(cleanText)
      await processTTSQueue()
    },
    [processTTSQueue, stopAudio]
  )
  

  return {
    isRecording,
    isPlaying,
    isProcessingTranscription,
    startRecording,
    stopRecording,
    playSynthesizedSpeech,
    enqueueSynthesizedSpeech,
    stopAudio,
  }
}
