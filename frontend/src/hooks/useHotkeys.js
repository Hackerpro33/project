import { useEffect, useMemo } from 'react'

function normalizeCombo(combo) {
  return combo
    .split('+')
    .map((key) => key.trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join('+')
}

function getEventCombo(event) {
  const parts = []

  if (event.ctrlKey) parts.push('ctrl')
  if (event.metaKey) parts.push('meta')
  if (event.altKey) parts.push('alt')
  if (event.shiftKey) parts.push('shift')

  const key = event.key?.length === 1 ? event.key.toLowerCase() : event.key.toLowerCase()

  if (key && !['control', 'meta', 'alt', 'shift'].includes(key)) {
    parts.push(key)
  }

  return normalizeCombo(parts.join('+'))
}

export function useHotkeys(definitions, deps = []) {
  const comboMap = useMemo(() => {
    if (!Array.isArray(definitions)) {
      return new Map()
    }

    return new Map(
      definitions
        .filter((definition) => definition && definition.combo && typeof definition.handler === 'function')
        .map((definition) => [normalizeCombo(definition.combo), definition.handler])
    )
  }, [definitions, ...deps])

  useEffect(() => {
    if (!comboMap.size) {
      return
    }

    const onKeyDown = (event) => {
      const combo = getEventCombo(event)
      const handler = comboMap.get(combo)

      if (handler) {
        event.preventDefault()
        handler(event)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [comboMap])
}
