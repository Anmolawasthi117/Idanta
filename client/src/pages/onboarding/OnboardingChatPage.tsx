import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { brandAssist } from '../../api/chat.api'
import { brandAssistChat } from '../../api/brand.api'
import ChatInput from '../../components/chat/ChatInput'
import ChatMessage from '../../components/chat/ChatMessage'
import ChatWindow from '../../components/chat/ChatWindow'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import { useToast } from '../../components/ui/useToast'
import { useCrafts, useCreateBrand } from '../../hooks/useBrand'
import { normalizeBrandExtracted } from '../../lib/chatNormalization'
import { copyFor, useLanguage } from '../../lib/i18n'
import { getErrorMessage } from '../../lib/utils'
import type { BrandCreatePayload } from '../../types/brand.types'

interface Message {
  id: string
  role: 'assistant' | 'user'
  content: string
  timestamp: Date
}

type ExtractedFormData = Partial<BrandCreatePayload>

const createMessage = (role: Message['role'], content: string): Message => ({
  id: `${role}-${Date.now()}-${Math.random()}`,
  role,
  content,
  timestamp: new Date(),
})

import type { AppLanguage } from '../../store/uiStore'

const buildBrandPrompt = (language: AppLanguage) => {
  const baseRules = `
You need to collect:
1. craft_id
2. artisan_name
3. region
4. years_of_experience
5. generations_in_craft
6. primary_occasion
7. target_customer
8. brand_feel
9. artisan_story

Important normalization rules:
- primary_occasion must be one of: wedding, festival, daily, gifting, home_decor, export, general
- target_customer must be one of: local_bazaar, tourist, online_india, export
- brand_feel must be one of: earthy, royal, vibrant, minimal
- script_preference must be one of: hindi, english, both
- preferred_language must be "${language === 'en' ? 'en' : 'hi'}"

Ask natural questions, but when returning JSON always use only the exact allowed values above.
If the user's answer is unclear, ask a clarification question instead of guessing.
Respond as JSON with keys: message, extracted, is_complete.`

  if (language === 'hi') {
    return `
You are Idanta's friendly brand assistant helping Indian artisans create their brand.
Speak only in pure Hindi using the Devanagari script. Do not use English words.
Keep every message under 2 sentences. Ask one question at a time. Never use technical jargon.
${baseRules}`.trim()
  } else if (language === 'hg') {
    return `
You are Idanta's friendly brand assistant helping Indian artisans create their brand.
Speak only in easy Hinglish (Hindi written in the English alphabet). Do not reply in pure English or pure Devanagari.
Keep every message under 2 sentences. Ask one question at a time. Never use technical jargon.
${baseRules}`.trim()
  } else {
    return `
You are Idanta's friendly brand assistant helping Indian artisans create their brand.
Speak only in simple English. Do not reply in Hindi or Hinglish.
Keep every message under 2 sentences. Ask one question at a time. Never use technical jargon.
${baseRules}`.trim()
  }
}

export default function OnboardingChatPage() {
  const navigate = useNavigate()
  const { pushToast } = useToast()
  const craftsQuery = useCrafts()
  const createBrandMutation = useCreateBrand()
  const language = useLanguage()
  const [messages, setMessages] = useState<Message[]>([
    createMessage(
      'assistant',
      copyFor(language, 'Namaste. Aap kaunsi kala ya craft karte ho?', 'Hello. Which craft do you practice?'),
    ),
  ])
  const [extractedData, setExtractedData] = useState<ExtractedFormData>({
    preferred_language: language === 'en' ? 'en' : 'hi',
    script_preference: language === 'hi' ? 'hindi' : 'english',
  })
  const [isComplete, setIsComplete] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isBackendChatLive, setIsBackendChatLive] = useState(true)

  const missingFields = useMemo(() => {
    const required: Array<keyof BrandCreatePayload> = [
      'craft_id',
      'artisan_name',
      'region',
      'years_of_experience',
      'generations_in_craft',
      'primary_occasion',
      'target_customer',
      'brand_feel',
      'script_preference',
      'preferred_language',
    ]
    return required.filter((field) => !extractedData[field])
  }, [extractedData])

  const handleSend = async (message: string) => {
    const userMessage = createMessage('user', message)
    const nextMessages = [...messages, userMessage]
    setMessages(nextMessages)
    setIsLoading(true)

    try {
      let response

      try {
        response = await brandAssist({
          system_prompt: buildBrandPrompt(language),
          messages: nextMessages.map((item) => ({
            role: item.role,
            content: item.content,
          })),
          context: {
            selected_language: language,
            crafts: craftsQuery.data ?? [],
            extracted_data: extractedData,
          },
        })
        setIsBackendChatLive(true)
      } catch (chatError) {
        setIsBackendChatLive(false)
        response = await brandAssistChat(message, extractedData, craftsQuery.data ?? [], language)
        pushToast(getErrorMessage(chatError))
      }

      const normalizedExtracted = normalizeBrandExtracted(response.extracted)
      let mergedData = extractedData
      if (normalizedExtracted) {
        mergedData = {
          ...extractedData,
          preferred_language: language === 'en' ? 'en' : 'hi',
          script_preference:
            normalizedExtracted.script_preference ??
            extractedData.script_preference ??
            (language === 'hi' ? 'hindi' : 'english'),
        }
        setExtractedData(mergedData)
      }

      setMessages((current) => [...current, createMessage('assistant', response.message)])
      const requiredFields: Array<keyof BrandCreatePayload> = [
        'craft_id',
        'artisan_name',
        'region',
        'years_of_experience',
        'generations_in_craft',
        'primary_occasion',
        'target_customer',
        'brand_feel',
        'script_preference',
        'preferred_language',
      ]
      setIsComplete(Boolean(response.is_complete) && requiredFields.every((field) => Boolean(mergedData[field])))
    } catch (error) {
      pushToast(getErrorMessage(error))
    } finally {
      setIsLoading(false)
    }
  }

  const submitBrand = () => {
    if (missingFields.length) {
      pushToast(copyFor(language, 'Abhi thodi aur jaankari chahiye.', 'A little more information is still needed.'))
      return
    }

    createBrandMutation.mutate(
      {
        ...(extractedData as BrandCreatePayload),
        preferred_language: language === 'en' ? 'en' : 'hi',
        script_preference: extractedData.script_preference ?? (language === 'hi' ? 'hindi' : 'english'),
      },
      {
        onSuccess: (data) => navigate(`/jobs/${data.job_id}`),
        onError: (error) => pushToast(getErrorMessage(error)),
      },
    )
  }

  return (
    <div className="space-y-6">
      <Card className="space-y-3 bg-orange-50">
        <p className="text-sm font-semibold text-orange-700">
          {copyFor(language, 'Chat connection', 'Chat connection')}
        </p>
        <p className="text-base text-stone-700">
          {isBackendChatLive
            ? copyFor(
                language,
                'Brand chat ab backend se connected hai. Agar server issue aaya to safe fallback chat use hoga.',
                'Brand chat is connected to the backend. If the server has an issue, a safe fallback chat will be used.',
              )
            : copyFor(
                language,
                'Backend chat abhi respond nahi kar raha, isliye temporary fallback chat chal rahi hai.',
                'The backend chat is not responding right now, so a temporary fallback chat is being used.',
              )}
        </p>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_0.9fr]">
        <div className="space-y-4">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold text-stone-900">
              {copyFor(language, 'Baat karke brand banao', 'Create your brand by chatting')}
            </h1>
            <p className="text-base text-stone-600">
              {copyFor(
                language,
                'Simple sawaal, simple jawaab. Aapka kaam hi sabse important hai.',
                'Simple questions, simple answers. Your craft is the most important thing here.',
              )}
            </p>
          </div>
          <ChatWindow>
            {messages.map((message) => (
              <ChatMessage key={message.id} role={message.role} content={message.content} timestamp={message.timestamp} />
            ))}
          </ChatWindow>
          <ChatInput
            onSend={handleSend}
            loading={isLoading || craftsQuery.isLoading}
            placeholder={copyFor(language, 'Yahan jawaab likhiye...', 'Write your answer here...')}
          />
        </div>

        <Card className="space-y-4">
          <div>
            <p className="text-sm font-semibold text-orange-600">
              {copyFor(language, 'Brand summary', 'Brand summary')}
            </p>
            <h2 className="text-2xl font-semibold text-stone-900">
              {copyFor(language, 'Jo humne samjha', 'What we understood')}
            </h2>
          </div>
          <SummaryRow label={copyFor(language, 'Craft', 'Craft')} value={extractedData.craft_id} language={language} />
          <SummaryRow label={copyFor(language, 'Naam', 'Name')} value={extractedData.artisan_name} language={language} />
          <SummaryRow label={copyFor(language, 'Jagah', 'Region')} value={extractedData.region} language={language} />
          <SummaryRow
            label={copyFor(language, 'Anubhav', 'Experience')}
            value={extractedData.years_of_experience ? `${extractedData.years_of_experience}` : undefined}
            language={language}
          />
          <SummaryRow
            label={copyFor(language, 'Peedhi', 'Generations')}
            value={extractedData.generations_in_craft ? `${extractedData.generations_in_craft}` : undefined}
            language={language}
          />
          <SummaryRow label={copyFor(language, 'Occasion', 'Occasion')} value={extractedData.primary_occasion} language={language} />
          <SummaryRow label={copyFor(language, 'Customer', 'Customer')} value={extractedData.target_customer} language={language} />
          <SummaryRow label={copyFor(language, 'Feel', 'Feel')} value={extractedData.brand_feel} language={language} />
          <SummaryRow label={copyFor(language, 'Kahani', 'Story')} value={extractedData.artisan_story} language={language} />
          {isComplete ? (
            <Button className="w-full" size="lg" loading={createBrandMutation.isPending} onClick={submitBrand}>
              {copyFor(language, 'Apna Brand Banao', 'Create My Brand')}
            </Button>
          ) : (
            <p className="text-sm text-stone-500">
              {copyFor(language, 'Chat complete hone ke baad yahan bada button dikhega.', 'The main button will appear here after the chat is complete.')}
            </p>
          )}
        </Card>
      </div>
    </div>
  )
}

function SummaryRow({
  label,
  value,
  language,
}: {
  label: string
  value?: string | number
  language: 'hi' | 'en'
}) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3">
      <p className="text-sm font-medium text-stone-500">{label}</p>
      <p className="text-base text-stone-900">{value || copyFor(language, 'Abhi baaki hai', 'Still pending')}</p>
    </div>
  )
}
