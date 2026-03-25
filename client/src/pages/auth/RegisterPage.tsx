import { Link } from 'react-router-dom'
import { useState } from 'react'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import { useRegister } from '../../hooks/useAuth'
import { getErrorMessage } from '../../lib/utils'
import { useToast } from '../../components/ui/useToast'

export default function RegisterPage() {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [language, setLanguage] = useState<'hi' | 'en'>('hi')
  const registerMutation = useRegister()
  const { pushToast } = useToast()

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#fff8ef] px-4 py-10">
      <Card className="w-full max-w-md space-y-6">
        <div className="space-y-2 text-center">
          <p className="text-sm font-medium text-orange-600">Idanta</p>
          <h1 className="text-3xl font-semibold text-stone-900">Naya khata banaiye</h1>
          <p className="text-base text-stone-500">Bas kuch simple details bharni hain.</p>
        </div>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            registerMutation.mutate(
              { name, phone, password, language },
              {
                onError: (error) => pushToast(getErrorMessage(error)),
              },
            )
          }}
        >
          <Input label="Naam" value={name} onChange={(event) => setName(event.target.value)} />
          <Input label="Phone number" value={phone} onChange={(event) => setPhone(event.target.value)} />
          <Input label="Password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          <Select
            label="Bhasha"
            value={language}
            onChange={(event) => setLanguage(event.target.value as 'hi' | 'en')}
            options={[
              { label: 'Hindi', value: 'hi' },
              { label: 'English', value: 'en' },
            ]}
          />
          <Button type="submit" size="lg" className="w-full" loading={registerMutation.isPending}>
            Register karo
          </Button>
        </form>
        <p className="text-center text-sm text-stone-600">
          Pehle se account hai?{' '}
          <Link to="/login" className="font-semibold text-orange-600">
            Login karo
          </Link>
        </p>
      </Card>
    </div>
  )
}
