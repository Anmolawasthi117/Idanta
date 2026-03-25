export interface User {
  id: string
  name: string
  phone: string
  language: 'hi' | 'en'
  has_brand: boolean
}

export interface AuthResponse {
  access_token: string
  token_type: string
  user: User
}

export interface RegisterPayload {
  name: string
  phone: string
  password: string
  language: 'hi' | 'en'
}

export interface LoginPayload {
  phone: string
  password: string
}
