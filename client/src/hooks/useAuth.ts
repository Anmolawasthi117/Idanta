import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { loginUser, registerUser } from '../api/auth.api'
import { useAuthStore } from '../store/authStore'
import { useUiStore } from '../store/uiStore'
import type { LoginPayload, RegisterPayload } from '../types/auth.types'

export const useLogin = () => {
  const setAuth = useAuthStore((state) => state.setAuth)
  const setLanguage = useUiStore((state) => state.setLanguage)
  const navigate = useNavigate()

  return useMutation({
    mutationFn: (payload: LoginPayload) => loginUser(payload),
    onSuccess: (data) => {
      setAuth(data.access_token, data.user)
      setLanguage(data.user.language)
      navigate(data.user.has_brand ? '/dashboard' : '/onboarding')
    },
  })
}

export const useRegister = () => {
  const setAuth = useAuthStore((state) => state.setAuth)
  const setLanguage = useUiStore((state) => state.setLanguage)
  const navigate = useNavigate()

  return useMutation({
    mutationFn: (payload: RegisterPayload) => registerUser(payload),
    onSuccess: (data) => {
      setAuth(data.access_token, data.user)
      setLanguage(data.user.language)
      navigate('/onboarding')
    },
  })
}
