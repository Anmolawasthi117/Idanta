import { useState } from 'react'
import { Link } from 'react-router-dom'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Input from '../../components/ui/Input'
import { useToast } from '../../components/ui/useToast'
import { useRegister } from '../../hooks/useAuth'
import { getErrorMessage } from '../../lib/utils'

export default function RegisterPage() {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const registerMutation = useRegister()
  const { pushToast } = useToast()

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(143,93,59,0.12),_transparent_24%),linear-gradient(180deg,_#f6f1e8_0%,_#fbf8f2_100%)] px-4 py-10">
      <Card className="w-full max-w-md space-y-6 bg-white/92 p-6">
        <div className="space-y-2 text-center">
          <p className="text-sm font-medium text-[#8f5d3b]">Idanta</p>
          <h1 className='font-["Iowan_Old_Style","Palatino_Linotype","Book_Antiqua",serif] text-3xl font-semibold text-stone-900'>
            Create your account
          </h1>
          <p className="text-base text-stone-500">Fill in a few details and we will take you into onboarding.</p>
        </div>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            registerMutation.mutate(
              { name, phone, password, language: 'en' },
              {
                onError: (error) => pushToast(getErrorMessage(error)),
              },
            )
          }}
        >
          <Input label="Name" value={name} onChange={(event) => setName(event.target.value)} />
          <Input label="Phone number" value={phone} onChange={(event) => setPhone(event.target.value)} />
          <Input label="Password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          <Button type="submit" size="lg" className="w-full" loading={registerMutation.isPending}>
            Register
          </Button>
        </form>
        <p className="text-center text-sm text-stone-600">
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-[#1f5c5a]">
            Log in
          </Link>
        </p>
      </Card>
    </div>
  )
}
