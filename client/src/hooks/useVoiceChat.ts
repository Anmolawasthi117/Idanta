import { useCallback, useRef, useState } from 'react'
import { transcribeAudio, synthesizeSpeech, synthesizeSpeechStreamResponse } from '../api/chat.api'

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
    console.info('[TTS] start queue item', { chars: textToPlay.length, language })
    try {
      const streamResponse = await synthesizeSpeechStreamResponse(textToPlay, language)
      const streamMime = streamResponse.headers.get('content-type')?.split(';')[0]?.trim() || 'audio/webm'
      console.info('[TTS] stream response', {
        ok: streamResponse.ok,
        status: streamResponse.status,
        contentType: streamResponse.headers.get('content-type'),
      })
      const streamBody = streamResponse.body
      if (!streamBody) throw new Error('No audio stream body')

      const mimeForMse =
        streamMime === 'audio/webm'
          ? 'audio/webm; codecs=opus'
          : streamMime === 'audio/mpeg'
          ? 'audio/mpeg'
          : ''
      if (!mimeForMse || !MediaSource.isTypeSupported(mimeForMse)) {
        throw new Error(`Unsupported MediaSource MIME type: ${mimeForMse || streamMime}`)
      }

      const mediaSource = new MediaSource()
      const objectUrl = URL.createObjectURL(mediaSource)
      const audioEl = new Audio(objectUrl)
      audioEl.autoplay = false
      audioEl.muted = false
      audioEl.volume = 1
      audioRef.current = audioEl

      await new Promise<void>((resolve, reject) => {
        const onError = () => reject(new Error('Audio stream playback failed'))
        audioEl.onerror = onError
        audioEl.onplay = () => console.info('[TTS] audio element onplay fired')
        audioEl.onpause = () => console.info('[TTS] audio element onpause fired')
        audioEl.onwaiting = () => console.info('[TTS] audio element onwaiting fired')
        audioEl.onstalled = () => console.info('[TTS] audio element onstalled fired')
        audioEl.oncanplay = () => console.info('[TTS] audio element oncanplay fired')
        audioEl.oncanplaythrough = () => console.info('[TTS] audio element oncanplaythrough fired')
        let sawTimeProgress = false
        audioEl.ontimeupdate = () => {
          if (!sawTimeProgress && audioEl.currentTime > 0) {
            sawTimeProgress = true
            console.info('[TTS] audio time progressed', { currentTime: audioEl.currentTime })
          }
        }
        audioEl.onended = () => {
          console.info('[TTS] stream playback ended')
          URL.revokeObjectURL(objectUrl)
          resolve()
        }

        mediaSource.addEventListener(
          'sourceopen',
          async () => {
            console.info('[TTS] MediaSource opened')
            try {
              const sourceBuffer = mediaSource.addSourceBuffer(mimeForMse)
              sourceBuffer.mode = 'sequence'
              const reader = streamBody.getReader()
              let hasStartedPlayback = false
              let chunkCount = 0
              let totalBytes = 0
              const minBytesToStart = 12000

              const appendChunk = (chunk: BufferSource) =>
                new Promise<void>((appendResolve, appendReject) => {
                  const onUpdateEnd = () => {
                    sourceBuffer.removeEventListener('updateend', onUpdateEnd)
                    appendResolve()
                  }
                  const onUpdateError = () => {
                    sourceBuffer.removeEventListener('error', onUpdateError)
                    appendReject(new Error('SourceBuffer append failed'))
                  }
                  sourceBuffer.addEventListener('updateend', onUpdateEnd)
                  sourceBuffer.addEventListener('error', onUpdateError, { once: true })
                  sourceBuffer.appendBuffer(chunk)
                })

              while (true) {
                const { done, value } = await reader.read()
                if (done) break
                if (value && value.byteLength > 0) {
                  chunkCount += 1
                  totalBytes += value.byteLength
                  if (chunkCount <= 3 || chunkCount % 10 === 0) {
                    console.info('[TTS] stream chunk', { chunkCount, bytes: value.byteLength, totalBytes })
                  }
                  await appendChunk(value)
                  if (!hasStartedPlayback && totalBytes >= minBytesToStart) {
                    hasStartedPlayback = true
                    console.info('[TTS] attempting first audioEl.play() from stream')
                    await audioEl.play()
                    console.info('[TTS] first audioEl.play() resolved')
                    window.setTimeout(() => {
                      if (!sawTimeProgress && chunkCount > 0) {
                        console.warn('[TTS] playback still buffering after initial play()')
                      }
                    }, 2500)
                  }
                }
              }

              console.info('[TTS] stream read complete', { chunkCount, totalBytes, hasStartedPlayback })

              if (chunkCount === 0) {
                reject(new Error('No audio chunks received from streaming TTS'))
                return
              }

              if (!hasStartedPlayback) {
                console.info('[TTS] starting playback at end of stream due low buffered bytes', { totalBytes })
                await audioEl.play()
                hasStartedPlayback = true
              }

              if (!hasStartedPlayback) {
                reject(new Error('Streaming TTS did not start audio playback'))
                return
              }

              if (mediaSource.readyState === 'open') {
                mediaSource.endOfStream()
              }
            } catch (err) {
              reject(err instanceof Error ? err : new Error('Unknown audio stream error'))
            }
          },
          { once: true },
        )
      })
    } catch (err) {
      console.error('Streaming TTS error, falling back to REST TTS:', err)
      try {
        const { audio_base64: audioBase64, mime_type: mimeType } = await synthesizeSpeech(textToPlay, language)
        console.info('[TTS] fallback REST audio received', { base64Chars: audioBase64.length, mimeType })
        const audioEl = new Audio(`data:${mimeType || 'audio/mpeg'};base64,${audioBase64}`)
        audioRef.current = audioEl
        await new Promise<void>((resolve) => {
          audioEl.onended = () => {
            console.info('[TTS] fallback playback ended')
            resolve()
          }
          audioEl.onerror = () => {
            console.error('[TTS] fallback audio element error')
            resolve()
          }
          void audioEl.play().then(() => {
            console.info('[TTS] fallback audioEl.play() resolved')
          }).catch((playErr) => {
            console.error('[TTS] fallback audioEl.play() rejected', playErr)
            resolve()
          })
        })
      } catch (fallbackErr) {
        console.error('Fallback TTS error:', fallbackErr)
      }
    } finally {
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
