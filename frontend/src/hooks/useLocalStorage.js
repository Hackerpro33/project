import { useCallback, useEffect, useState } from 'react'

const isBrowser = typeof window !== 'undefined'

function readStorageValue(key, defaultValue) {
  if (!isBrowser) {
    return typeof defaultValue === 'function' ? defaultValue() : defaultValue
  }

  try {
    const item = window.localStorage.getItem(key)
    if (item === null || item === undefined) {
      return typeof defaultValue === 'function' ? defaultValue() : defaultValue
    }
    return JSON.parse(item)
  } catch (error) {
    console.warn(`Не удалось прочитать localStorage ключ "${key}":`, error)
    return typeof defaultValue === 'function' ? defaultValue() : defaultValue
  }
}

export function useLocalStorage(key, defaultValue) {
  const [storedValue, setStoredValue] = useState(() => readStorageValue(key, defaultValue))

  useEffect(() => {
    if (!isBrowser) return

    const handleStorageChange = (event) => {
      if (event.storageArea === window.localStorage && event.key === key) {
        setStoredValue(readStorageValue(key, defaultValue))
      }
    }

    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [key, defaultValue])

  const setValue = useCallback(
    (value) => {
      const valueToStore = value instanceof Function ? value(storedValue) : value
      setStoredValue(valueToStore)

      if (!isBrowser) return

      try {
        window.localStorage.setItem(key, JSON.stringify(valueToStore))
        window.dispatchEvent(new StorageEvent('storage', { key, newValue: JSON.stringify(valueToStore) }))
      } catch (error) {
        console.warn(`Не удалось записать localStorage ключ "${key}":`, error)
      }
    },
    [key, storedValue]
  )

  return [storedValue, setValue]
}
