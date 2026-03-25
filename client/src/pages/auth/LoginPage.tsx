import { Link } from 'react-router-dom'
import { useState } from 'react'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Input from '../../components/ui/Input'
import { useLogin } from '../../hooks/useAuth'
import { getErrorMessage } from '../../lib/utils'
import { useToast } from '../../components/ui/useToast'

export default function LoginPage() {
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const loginMutation = useLogin()
  const { pushToast } = useToast()

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#fff8ef] px-4 py-10">
      <Card className="w-full max-w-md space-y-6">
        <div className="space-y-2 text-center">
          <p className="text-sm font-medium text-orange-600">Idanta</p>
          <h1 className="text-3xl font-semibold text-stone-900">Wapas swagat hai</h1>
          <p className="text-base text-stone-500">Apna phone number aur password dijiye.</p>
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
          <Input label="Phone number" value={phone} onChange={(event) => setPhone(event.target.value)} />
          <Input label="Password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          <Button type="submit" size="lg" className="w-full" loading={loginMutation.isPending}>
            Login karo
          </Button>
        </form>
        <p className="text-center text-sm text-stone-600">
          Naya account chahiye?{' '}
          <Link to="/register" className="font-semibold text-orange-600">
            Register karo
          </Link>
        </p>
      </Card>
    </div>
  )
}
