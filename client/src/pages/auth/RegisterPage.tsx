import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import { useToast } from '../../components/ui/useToast'
import { useRegister } from '../../hooks/useAuth'
import { copyFor, useLanguage, useT } from '../../lib/i18n'
import { getErrorMessage } from '../../lib/utils'
import { useUiStore } from '../../store/uiStore'

export default function RegisterPage() {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const appLanguage = useLanguage()
  const setAppLanguage = useUiStore((state) => state.setLanguage)
  const [language, setLanguage] = useState<'hi' | 'en'>(appLanguage)
  const registerMutation = useRegister()
  const { pushToast } = useToast()
  const t = useT()

  useEffect(() => {
    setAppLanguage(language)
  }, [language, setAppLanguage])

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#fff8ef] px-4 py-10">
      <Card className="w-full max-w-md space-y-6">
        <div className="space-y-2 text-center">
          <p className="text-sm font-medium text-orange-600">Idanta</p>
          <h1 className="text-3xl font-semibold text-stone-900">{t('registerTitle')}</h1>
          <p className="text-base text-stone-500">{t('registerSubtitle')}</p>
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
          <Input label={copyFor(language, 'Naam', 'Name')} value={name} onChange={(event) => setName(event.target.value)} />
          <Input
            label={copyFor(language, 'Phone number', 'Phone number')}
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
          <Input
            label={copyFor(language, 'Password', 'Password')}
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <Select
            label={t('language')}
            value={language}
            onChange={(event) => setLanguage(event.target.value as 'hi' | 'en')}
            options={[
              { label: t('hindi'), value: 'hi' },
              { label: t('english'), value: 'en' },
            ]}
          />
          <Button type="submit" size="lg" className="w-full" loading={registerMutation.isPending}>
            {t('registerButton')}
          </Button>
        </form>
        <p className="text-center text-sm text-stone-600">
          {copyFor(language, 'Pehle se account hai?', 'Already have an account?')}{' '}
          <Link to="/login" className="font-semibold text-orange-600">
            {copyFor(language, 'Login karo', 'Log in')}
          </Link>
        </p>
      </Card>
    </div>
  )
}
