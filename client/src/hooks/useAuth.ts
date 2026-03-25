import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { loginUser, registerUser } from '../api/auth.api'
import { useAuthStore } from '../store/authStore'
import type { LoginPayload, RegisterPayload } from '../types/auth.types'

export const useLogin = () => {
  const setAuth = useAuthStore((state) => state.setAuth)
  const navigate = useNavigate()

  return useMutation({
    mutationFn: (payload: LoginPayload) => loginUser(payload),
    onSuccess: (data) => {
      setAuth(data.access_token, data.user)
      navigate(data.user.has_brand ? '/dashboard' : '/onboarding')
    },
  })
}

export const useRegister = () => {
  const setAuth = useAuthStore((state) => state.setAuth)
  const navigate = useNavigate()

  return useMutation({
    mutationFn: (payload: RegisterPayload) => registerUser(payload),
    onSuccess: (data) => {
      setAuth(data.access_token, data.user)
      navigate('/onboarding')
    },
  })
}
