import { Link } from 'react-router-dom'
import { useState } from 'react'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Input from '../../components/ui/Input'
import { useToast } from '../../components/ui/useToast'
import { useLogin } from '../../hooks/useAuth'
import { copyFor, useLanguage, useT } from '../../lib/i18n'
import { getErrorMessage } from '../../lib/utils'

export default function LoginPage() {
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const loginMutation = useLogin()
  const { pushToast } = useToast()
  const t = useT()
  const language = useLanguage()

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#fff8ef] px-4 py-10">
      <Card className="w-full max-w-md space-y-6">
        <div className="space-y-2 text-center">
          <p className="text-sm font-medium text-orange-600">Idanta</p>
          <h1 className="text-3xl font-semibold text-stone-900">{t('loginTitle')}</h1>
          <p className="text-base text-stone-500">{t('loginSubtitle')}</p>
        </div>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            loginMutation.mutate(
              { phone, password },
              {
                onError: (error) => pushToast(getErrorMessage(error)),
              },
            )
          }}
        >
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
          <Button type="submit" size="lg" className="w-full" loading={loginMutation.isPending}>
            {t('loginButton')}
          </Button>
        </form>
        <p className="text-center text-sm text-stone-600">
          {copyFor(language, 'Naya account chahiye?', 'Need a new account?')}{' '}
          <Link to="/register" className="font-semibold text-orange-600">
            {copyFor(language, 'Register karo', 'Register')}
          </Link>
        </p>
      </Card>
    </div>
  )
}
