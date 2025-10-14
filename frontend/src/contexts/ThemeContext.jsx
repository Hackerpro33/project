import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import PropTypes from 'prop-types'

const STORAGE_KEY = 'analyzer:theme-preference'
const VALID_PREFERENCES = new Set(['light', 'dark', 'system'])

function getStoredPreference() {
  if (typeof window === 'undefined') {
    return 'system'
  }

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored && VALID_PREFERENCES.has(stored)) {
      return stored
    }
  } catch (error) {
    // ignore storage access errors (e.g. private mode)
  }

  return 'system'
}

function resolveTheme(preference) {
  if (preference === 'light' || preference === 'dark') {
    return preference
  }

  if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark'
  }

  return 'light'
}

const ThemeContext = createContext({
  theme: 'system',
  resolvedTheme: 'light',
  setTheme: () => {},
  toggleTheme: () => {},
})

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => getStoredPreference())
  const [resolvedTheme, setResolvedTheme] = useState(() => resolveTheme(theme))

  useEffect(() => {
    setResolvedTheme(resolveTheme(theme))
  }, [theme])

  useEffect(() => {
    if (typeof document === 'undefined') {
      return
    }

    const root = document.documentElement
    root.classList.remove('light', 'dark')
    root.classList.add(resolvedTheme)
  }, [resolvedTheme])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined
    }

    const media = window.matchMedia('(prefers-color-scheme: dark)')

    if (theme !== 'system') {
      return undefined
    }

    const handleChange = () => {
      setResolvedTheme(resolveTheme('system'))
    }

    media.addEventListener('change', handleChange)
    return () => media.removeEventListener('change', handleChange)
  }, [theme])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    try {
      window.localStorage.setItem(STORAGE_KEY, theme)
    } catch (error) {
      // ignore
    }
  }, [theme])

  const toggleTheme = useCallback(() => {
    setTheme((current) => {
      const nextResolved = resolveTheme(current)
      return nextResolved === 'dark' ? 'light' : 'dark'
    })
  }, [])

  const value = useMemo(
    () => ({ theme, resolvedTheme, setTheme, toggleTheme }),
    [resolvedTheme, setTheme, theme, toggleTheme]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

ThemeProvider.propTypes = {
  children: PropTypes.node.isRequired,
}

export function useTheme() {
  return useContext(ThemeContext)
}

export default ThemeProvider
