import { create } from 'zustand'
import i18n from '@/i18n'

const normalizeLanguage = (language) => {
  if (!language) {
    return 'en'
  }

  return language.startsWith('ru') ? 'ru' : 'en'
}

export const useAppPreferencesStore = create((set, get) => {
  const handleLanguageChanged = (language) => {
    const normalized = normalizeLanguage(language)
    if (get().language !== normalized) {
      set({ language: normalized })
    }
  }

  i18n.on('languageChanged', handleLanguageChanged)

  const initialLanguage = normalizeLanguage(i18n.language)

  return {
    language: initialLanguage,
    autoRefreshEnabled: true,
    autoRefreshInterval: 60_000,
    setLanguage: (language) => {
      const normalized = normalizeLanguage(language)
      i18n.changeLanguage(normalized)
      set({ language: normalized })
    },
    toggleAutoRefresh: () => {
      set((state) => ({ autoRefreshEnabled: !state.autoRefreshEnabled }))
    },
    setAutoRefreshEnabled: (enabled) => {
      set({ autoRefreshEnabled: Boolean(enabled) })
    },
    setAutoRefreshInterval: (interval) => {
      set({ autoRefreshInterval: interval })
    },
  }
})
