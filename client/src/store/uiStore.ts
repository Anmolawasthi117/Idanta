import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export type AppLanguage = 'hi' | 'en' | 'hg'

interface UiState {
  language: AppLanguage
  setLanguage: (language: AppLanguage) => void
  toggleLanguage: () => void
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      language: 'en',
      setLanguage: (language) => set({ language }),
      toggleLanguage: () =>
        set((state) => {
          const nextLang = { en: 'hi', hi: 'hg', hg: 'en' } as const
          return { language: nextLang[state.language] }
        }),
    }),
    {
      name: 'idanta-ui',
      storage: createJSONStorage(() => localStorage),
    },
  ),
)
