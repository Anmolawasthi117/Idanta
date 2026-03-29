import { useState } from 'react'
import { Link } from 'react-router-dom'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Input from '../../components/ui/Input'
import { useToast } from '../../components/ui/useToast'
import { useLogin } from '../../hooks/useAuth'
import { getErrorMessage } from '../../lib/utils'

export default function LoginPage() {
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const loginMutation = useLogin()
  const { pushToast } = useToast()

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(31,92,90,0.12),_transparent_28%),linear-gradient(180deg,_#f6f1e8_0%,_#fbf8f2_100%)] px-4 py-10">
      <Card className="w-full max-w-md space-y-6 bg-white/92 p-6">
        <div className="space-y-2 text-center">
          <p className="text-sm font-medium text-[#1f5c5a]">Idanta</p>
          <h1 className='font-["Iowan_Old_Style","Palatino_Linotype","Book_Antiqua",serif] text-3xl font-semibold text-stone-900'>
            Welcome back
          </h1>
          <p className="text-base text-stone-500">Enter your phone number and password to continue.</p>
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
            Log in
          </Button>
        </form>
        <p className="text-center text-sm text-stone-600">
          Need a new account?{' '}
          <Link to="/register" className="font-semibold text-[#1f5c5a]">
            Register
          </Link>
        </p>
      </Card>
    </div>
  )
}
