import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { ArrowRight, LogIn, Sparkles } from 'lucide-react'
import { synthesizeSpeech } from '../api/chat.api'
import { useLatestBrand } from '../hooks/useBrand'
import { useAuthStore } from '../store/authStore'

const welcomeNotes = [
  'नमस्ते, आज हम आपके ब्रांड की कहानी को एक नई पहचान देंगे।',
  'स्वागत है, आइए आपके काम को सरल, सुंदर और यादगार रूप दें।',
  'आपका हार्दिक स्वागत है, मिलकर कुछ ऐसा रचते हैं जो लोगों के मन में बस जाए।',
  'नमस्ते, आपकी नई शुरुआत को यहीं से एक सधा हुआ और सुंदर मार्ग मिलता है।',
]

export default function HomePage() {
  const token = useAuthStore((state) => state.token)
  const user = useAuthStore((state) => state.user)
  const hasHydrated = useAuthStore((state) => state.hasHydrated)
  const latestBrandQuery = useLatestBrand(Boolean(token))
  const [welcomeNote] = useState(() => welcomeNotes[Math.floor(Math.random() * welcomeNotes.length)])
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const hasStartedAudioRef = useRef(false)
  const isRequestInFlightRef = useRef(false)
  const pendingAudioRef = useRef<{ mimeType: string; audioBase64: string } | null>(null)
  const awaitingInteractionRef = useRef(false)
  const interactionUnlockedRef = useRef(false)

  const setInteractionState = useCallback((value: boolean) => {
    awaitingInteractionRef.current = value
  }, [])

  const playBufferedAudio = useCallback(async () => {
    if (hasStartedAudioRef.current) return

    const pendingAudio = pendingAudioRef.current
    if (!pendingAudio) return

    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }

    const audio = new Audio(`data:${pendingAudio.mimeType};base64,${pendingAudio.audioBase64}`)
    audioRef.current = audio
    await audio.play()
    hasStartedAudioRef.current = true
    setInteractionState(false)
  }, [setInteractionState])

  const playWelcomeNote = useCallback(async () => {
    if (hasStartedAudioRef.current || isRequestInFlightRef.current) return

    isRequestInFlightRef.current = true

    try {
      const { audio_base64: audioBase64, mime_type: mimeType } = await synthesizeSpeech(welcomeNote, 'hi')
      pendingAudioRef.current = { audioBase64, mimeType: mimeType || 'audio/mpeg' }

      if (interactionUnlockedRef.current) {
        await playBufferedAudio()
        return
      }

      await playBufferedAudio()
    } catch (error) {
      const isAutoplayBlocked =
        error instanceof DOMException &&
        (error.name === 'NotAllowedError' || error.name === 'AbortError')

      if (!isAutoplayBlocked) {
        console.error('Failed to autoplay homepage Sarvam TTS:', error)
      }
      setInteractionState(true)
    } finally {
      isRequestInFlightRef.current = false
    }
  }, [playBufferedAudio, setInteractionState, welcomeNote])

  const resumeWelcomeNote = useCallback(async () => {
    try {
      interactionUnlockedRef.current = true

      if (pendingAudioRef.current) {
        await playBufferedAudio()
      } else if (!isRequestInFlightRef.current) {
        await playWelcomeNote()
      }
    } catch (error) {
      console.error('Failed to resume homepage Sarvam TTS after interaction:', error)
    }
  }, [playBufferedAudio, playWelcomeNote])

  useEffect(() => {
    if (!hasHydrated || token) return

    const handleVisibleAutoplay = () => {
      if (document.visibilityState === 'visible') {
        void playWelcomeNote()
      }
    }

    void playWelcomeNote()
    window.addEventListener('pageshow', handleVisibleAutoplay)
    document.addEventListener('visibilitychange', handleVisibleAutoplay)

    return () => {
      window.removeEventListener('pageshow', handleVisibleAutoplay)
      document.removeEventListener('visibilitychange', handleVisibleAutoplay)
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.currentTime = 0
      }
    }
  }, [hasHydrated, playWelcomeNote, token])

  useEffect(() => {
    if (!hasHydrated || token || hasStartedAudioRef.current) return

    const handleInteraction = () => {
      interactionUnlockedRef.current = true
      if (awaitingInteractionRef.current || pendingAudioRef.current) {
        void resumeWelcomeNote()
      }
    }

    window.addEventListener('pointerdown', handleInteraction)
    window.addEventListener('keydown', handleInteraction)
    window.addEventListener('touchstart', handleInteraction)

    return () => {
      window.removeEventListener('pointerdown', handleInteraction)
      window.removeEventListener('keydown', handleInteraction)
      window.removeEventListener('touchstart', handleInteraction)
    }
  }, [hasHydrated, resumeWelcomeNote, token])

  if (!hasHydrated) return null
  if (token && latestBrandQuery.isLoading) return null
  if (token) return <Navigate to={user?.has_brand || Boolean(latestBrandQuery.data) ? '/dashboard' : '/onboarding'} replace />

  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(31,92,90,0.14),_transparent_32%),linear-gradient(180deg,_#f5efe4_0%,_#fbf8f2_48%,_#f6f1e8_100%)] px-4 py-8 text-stone-900 sm:px-6 lg:px-8">
      <div className="absolute left-0 top-0 h-72 w-72 rounded-full bg-[#d6e7df]/60 blur-3xl" />
      <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-[#e2c7aa]/40 blur-3xl" />

      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-center">
        <div className="grid w-full gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:gap-12">
          <section className="flex flex-col justify-center">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[#1f5c5a]/15 bg-white/70 px-4 py-2 text-sm font-medium text-[#1f5c5a] shadow-sm backdrop-blur">
              <Sparkles className="h-4 w-4" />
              Idanta
            </div>
            <div className="mt-6 space-y-5">
              <p className="max-w-2xl text-lg font-medium leading-8 text-[#1f5c5a] sm:text-xl">{welcomeNote}</p>
              <h1 className='max-w-3xl font-["Iowan_Old_Style","Palatino_Linotype","Book_Antiqua",serif] text-4xl leading-tight text-stone-900 sm:text-5xl lg:text-6xl'>
                Build a brand home that feels warm, intentional, and ready to grow with you.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-stone-600 sm:text-lg">
                We are simplifying the platform from the ground up. Start here, register if you are new,
                or log back in if you have already worked with us.
              </p>
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/login"
                className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-[#1f5c5a] px-5 py-4 text-lg font-semibold text-white shadow-sm transition hover:bg-[#184b49] hover:text-white visited:text-white"
                style={{ color: '#ffffff' }}
              >
                Log in
                <LogIn className="ml-2 h-5 w-5" />
              </Link>
              <Link
                to="/register"
                className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-[#1f5c5a]/15 bg-white px-5 py-4 text-lg font-semibold text-[#1f5c5a] transition hover:bg-[#eef4f1]"
              >
                Create account
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </div>
          </section>

          <section className="rounded-[2rem] border border-[#1f5c5a]/12 bg-white/78 p-5 shadow-[0_24px_60px_rgba(55,43,31,0.08)] backdrop-blur sm:p-7">
            <div className="rounded-[1.75rem] bg-[#f7f2e8] p-5 sm:p-6">
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#8f5d3b]">First step</p>
              <h2 className='mt-3 font-["Iowan_Old_Style","Palatino_Linotype","Book_Antiqua",serif] text-3xl text-stone-900'>
                A clearer welcome for every visitor
              </h2>
              <p className="mt-3 text-base leading-7 text-stone-600">
                New users can begin with a straightforward registration flow, while returning users can jump
                back in without distractions.
              </p>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="rounded-[1.5rem] border border-[#1f5c5a]/10 bg-[#eef4f1] p-5">
                <p className="text-sm font-semibold text-[#1f5c5a]">नए उपयोगकर्ता यहाँ पंजीकरण करें</p>
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  Create your account in a few steps and move straight into onboarding.
                </p>
                <Link to="/register" className="mt-5 inline-flex text-sm font-semibold text-[#1f5c5a]">
                  Go to register
                </Link>
              </div>
              <div className="rounded-[1.5rem] border border-[#8f5d3b]/12 bg-[#fbf7f0] p-5">
                <p className="text-sm font-semibold text-[#8f5d3b]">पहले के उपयोगकर्ता लॉग इन कर सकते हैं</p>
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  Pick up where you left off with your brand, products, and ongoing jobs.
                </p>
                <Link to="/login" className="mt-5 inline-flex text-sm font-semibold text-[#8f5d3b]">
                  Go to login
                </Link>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
