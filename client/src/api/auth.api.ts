import apiClient from './client'
import type { AuthResponse, LoginPayload, RegisterPayload, User } from '../types/auth.types'

export const registerUser = async (payload: RegisterPayload): Promise<AuthResponse> => {
  const { data } = await apiClient.post<AuthResponse>('/auth/register', payload)
  return data
}

export const loginUser = async (payload: LoginPayload): Promise<AuthResponse> => {
  const { data } = await apiClient.post<AuthResponse>('/auth/login', payload)
  return data
}

export const getMe = async (): Promise<User> => {
  const { data } = await apiClient.get<User>('/auth/me')
  return data
}
