import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import PropTypes from 'prop-types'
import { jsonRequest } from '@/api/http.js'

export const FeatureFlagContext = createContext({ flags: {}, loading: true, error: null })

async function fetchFeatureFlags(signal) {
  const payload = await jsonRequest('/feature-flags', { signal })
  return payload.flags || {}
}

export function FeatureFlagProvider({ children }) {
  const [flags, setFlags] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)

    fetchFeatureFlags(controller.signal)
      .then((result) => {
        setFlags(result)
      })
      .catch((err) => {
        console.error('Feature flag fetch failed', err)
        setError(err)
        setFlags({})
      })
      .finally(() => setLoading(false))

    return () => controller.abort()
  }, [])

  const value = useMemo(() => ({ flags, loading, error }), [flags, loading, error])

  return <FeatureFlagContext.Provider value={value}>{children}</FeatureFlagContext.Provider>
}

FeatureFlagProvider.propTypes = {
  children: PropTypes.node.isRequired
}

export function useFeatureFlag(flagName, defaultValue = false) {
  const { flags } = useContext(FeatureFlagContext)
  if (!flagName) return defaultValue
  const normalized = flags?.[flagName]
  return typeof normalized === 'boolean' ? normalized : defaultValue
}

export function useFeatureFlagsState() {
  return useContext(FeatureFlagContext)
}
