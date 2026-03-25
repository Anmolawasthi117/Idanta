import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ChatInput from '../../components/chat/ChatInput'
import ChatMessage from '../../components/chat/ChatMessage'
import ChatWindow from '../../components/chat/ChatWindow'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import { useToast } from '../../components/ui/useToast'
import { brandAssistChat } from '../../api/brand.api'
import { useCrafts, useCreateBrand } from '../../hooks/useBrand'
import { getErrorMessage } from '../../lib/utils'
import type { BrandCreatePayload } from '../../types/brand.types'

const BRAND_CHAT_SYSTEM_PROMPT = `
You are Idanta's friendly brand assistant helping Indian artisans create their brand.
Speak in simple Hindi mixed with English words the user will know (Hinglish).
Keep every message under 2 sentences. Ask one question at a time. Never use technical jargon.

You need to collect this information through natural conversation:
1. craft_id
2. artisan_name
3. region
4. years_of_experience
5. generations_in_craft
6. primary_occasion
7. target_customer
8. brand_feel
9. artisan_story
`

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

export default function OnboardingChatPage() {
  const navigate = useNavigate()
  const { pushToast } = useToast()
  const craftsQuery = useCrafts()
  const createBrandMutation = useCreateBrand()
  const [messages, setMessages] = useState<Message[]>([
    createMessage('assistant', 'Namaste. Aap kaunsi kala ya craft karte ho?'),
  ])
  const [extractedData, setExtractedData] = useState<ExtractedFormData>({
    preferred_language: 'hi',
    script_preference: 'both',
  })
  const [isComplete, setIsComplete] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

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
    setMessages((current) => [...current, createMessage('user', message)])
    setIsLoading(true)
    try {
      const response = await brandAssistChat(message, extractedData, craftsQuery.data ?? [], BRAND_CHAT_SYSTEM_PROMPT)
      if (response.extracted) {
        setExtractedData((current) => ({ ...current, ...response.extracted }))
      }
      setMessages((current) => [...current, createMessage('assistant', response.message)])
      setIsComplete(Boolean(response.is_complete))
    } catch (error) {
      pushToast(getErrorMessage(error))
    } finally {
      setIsLoading(false)
    }
  }

  const submitBrand = () => {
    if (missingFields.length) {
      pushToast('Abhi thodi aur jaankari chahiye.')
      return
    }

    createBrandMutation.mutate(extractedData as BrandCreatePayload, {
      onSuccess: (data) => navigate(`/jobs/${data.job_id}`),
      onError: (error) => pushToast(getErrorMessage(error)),
    })
  }

  return (
    <div className="space-y-6">
      <Card className="space-y-3 bg-orange-50">
        <p className="text-sm font-semibold text-orange-700">Backend note</p>
        <p className="text-base text-stone-700">
          `/chat/brand-assist` backend proxy abhi available nahi hai, isliye chat flow abhi frontend mock se chal raha hai.
        </p>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_0.9fr]">
        <div className="space-y-4">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold text-stone-900">Baat karke brand banao</h1>
            <p className="text-base text-stone-600">
              Simple sawaal, simple jawaab. Aapka kaam hi sabse important hai.
            </p>
          </div>
          <ChatWindow>
            {messages.map((message) => (
              <ChatMessage key={message.id} role={message.role} content={message.content} timestamp={message.timestamp} />
            ))}
          </ChatWindow>
          <ChatInput onSend={handleSend} loading={isLoading || craftsQuery.isLoading} placeholder="Yahan jawaab likhiye..." />
        </div>

        <Card className="space-y-4">
          <div>
            <p className="text-sm font-semibold text-orange-600">Brand summary</p>
            <h2 className="text-2xl font-semibold text-stone-900">Jo humne samjha</h2>
          </div>
          <SummaryRow label="Craft" value={extractedData.craft_id} />
          <SummaryRow label="Naam" value={extractedData.artisan_name} />
          <SummaryRow label="Jagah" value={extractedData.region} />
          <SummaryRow label="Anubhav" value={extractedData.years_of_experience ? `${extractedData.years_of_experience} saal` : undefined} />
          <SummaryRow label="Peedhi" value={extractedData.generations_in_craft ? `${extractedData.generations_in_craft}` : undefined} />
          <SummaryRow label="Occasion" value={extractedData.primary_occasion} />
          <SummaryRow label="Customer" value={extractedData.target_customer} />
          <SummaryRow label="Feel" value={extractedData.brand_feel} />
          <SummaryRow label="Kahani" value={extractedData.artisan_story} />
          {isComplete ? (
            <Button className="w-full" size="lg" loading={createBrandMutation.isPending} onClick={submitBrand}>
              Apna Brand Banao
            </Button>
          ) : (
            <p className="text-sm text-stone-500">Chat complete hone ke baad yahan bada button dikhega.</p>
          )}
        </Card>
      </div>
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value?: string | number }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3">
      <p className="text-sm font-medium text-stone-500">{label}</p>
      <p className="text-base text-stone-900">{value || 'Abhi baaki hai'}</p>
    </div>
  )
}
