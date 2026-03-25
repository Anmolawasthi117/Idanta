import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export type AppLanguage = 'hi' | 'en'

interface UiState {
  language: AppLanguage
  setLanguage: (language: AppLanguage) => void
  toggleLanguage: () => void
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      language: 'hi',
      setLanguage: (language) => set({ language }),
      toggleLanguage: () => set((state) => ({ language: state.language === 'hi' ? 'en' : 'hi' })),
    }),
    {
      name: 'idanta-ui',
      storage: createJSONStorage(() => localStorage),
    },
  ),
)
