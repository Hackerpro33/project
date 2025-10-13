import React from 'react'
import '../src/index.css'
import '../src/i18n'
import { QueryClientProvider } from '@tanstack/react-query'
import { createQueryClient } from '@/lib/queryClient'
import { TaskEventProvider } from '@/lib/taskEvents'
import { FeatureFlagContext } from '@/contexts/FeatureFlagContext.jsx'

const withProviders = (Story) => {
  const queryClient = createQueryClient()

  return (
    <FeatureFlagContext.Provider value={{ flags: {}, loading: false, error: null }}>
      <QueryClientProvider client={queryClient}>
        <TaskEventProvider>
          <Story />
        </TaskEventProvider>
      </QueryClientProvider>
    </FeatureFlagContext.Provider>
  )
}

export const decorators = [withProviders]

export const parameters = {
  actions: { argTypesRegex: '^on[A-Z].*' },
  controls: {
    matchers: {
      color: /(background|color)$/i,
      date: /Date$/,
    },
  },
  a11y: {
    config: {
      rules: [
        {
          id: 'color-contrast',
          enabled: false,
        },
      ],
    },
  },
}

