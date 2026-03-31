import { useMemo } from 'react'
import { useUiStore, type AppLanguage } from '../store/uiStore'

const translations = {
  hi: {
    tagline: 'Aapki kala, aapki pehchaan',
    home: 'Home',
    brand: 'Brand',
    products: 'Products',
    logout: 'Logout',
  },
  en: {
    tagline: 'Your craft, your identity',
    home: 'Home',
    brand: 'Brand',
    products: 'Products',
    logout: 'Logout',
  },
  hg: {
    tagline: 'Aapki kala, aapki pehchaan',
    home: 'Home',
    brand: 'Brand',
    products: 'Products',
    logout: 'Logout',
  },
} as const

type TranslationKey = keyof (typeof translations)['en']

export const copyFor = (
  language: AppLanguage,
  hgString: string,
  enString: string,
  hiString?: string,
) => {
  if (language === 'en') return enString
  if (language === 'hi') return hiString ?? hgString
  return hgString
}

export const useLanguage = (): AppLanguage => useUiStore((state) => state.language)

export const useT = () => {
  const language = useLanguage()
  return useMemo(
    () => (key: TranslationKey) => copyFor(language, translations.hg[key], translations.en[key], translations.hi[key]),
    [language],
  )
}

