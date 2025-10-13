import React from 'react'
import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TaskEventProvider } from '@/lib/taskEvents'

export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        suspense: false,
        throwOnError: false,
      },
      mutations: {
        retry: false,
        throwOnError: false,
      },
    },
  })
}

export function renderWithProviders(ui, { queryClient = createTestQueryClient(), wrapper: Wrapper, ...renderOptions } = {}) {
  function AllProviders({ children }) {
    const content = (
      <QueryClientProvider client={queryClient}>
        <TaskEventProvider>{children}</TaskEventProvider>
      </QueryClientProvider>
    )

    if (Wrapper) {
      return <Wrapper>{content}</Wrapper>
    }

    return content
  }

  return render(ui, { wrapper: AllProviders, ...renderOptions })
}

