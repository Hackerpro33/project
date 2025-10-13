import { QueryCache, MutationCache, QueryClient } from '@tanstack/react-query'
import { toast } from '@/components/ui/use-toast.jsx'
import i18n from '@/i18n'

const DEFAULT_RETRYABLE_STATUSES = new Set([408, 409, 425, 429, 500, 502, 503, 504])

function resolveMessage(meta, fallbackTitleKey, fallbackDescriptionKey, error, payload) {
  if (!meta) {
    return {
      title: i18n.t(fallbackTitleKey),
      description: i18n.t(fallbackDescriptionKey),
    }
  }

  if (typeof meta === 'function') {
    try {
      return meta({ error, payload }) ?? {
        title: i18n.t(fallbackTitleKey),
        description: i18n.t(fallbackDescriptionKey),
      }
    } catch (functionError) {
      console.warn('Failed to resolve toast message from function', functionError)
    }
  }

  if (typeof meta === 'string') {
    return { title: meta }
  }

  if (typeof meta === 'object') {
    return {
      title: meta.title ?? i18n.t(fallbackTitleKey),
      description: meta.description ?? meta.message ?? i18n.t(fallbackDescriptionKey),
    }
  }

  return {
    title: error?.message ?? i18n.t(fallbackTitleKey),
    description: i18n.t(fallbackDescriptionKey),
  }
}

function shouldRetry(error, failureCount) {
  if (failureCount >= 3) {
    return false
  }

  const status = error?.status ?? error?.response?.status
  if (status && !DEFAULT_RETRYABLE_STATUSES.has(status)) {
    return false
  }

  return true
}

function shouldSkipToast(meta) {
  return Boolean(meta?.skipGlobalToast)
}

export function createQueryClient() {
  const queryCache = new QueryCache({
    onError: (error, query) => {
      if (shouldSkipToast(query?.meta)) {
        return
      }

      const metaMessage = resolveMessage(
        query?.meta?.errorMessage,
        'errors.defaultTitle',
        'errors.defaultDescription',
        error,
      )

      toast({
        variant: 'destructive',
        ...metaMessage,
      })
    },
  })

  const mutationCache = new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      if (shouldSkipToast(mutation?.meta)) {
        return
      }

      const metaMessage = resolveMessage(
        mutation?.meta?.errorMessage,
        'errors.mutationTitle',
        'errors.mutationDescription',
        error,
      )

      toast({
        variant: 'destructive',
        ...metaMessage,
      })
    },
    onSuccess: (_data, _variables, _context, mutation) => {
      if (!mutation?.meta?.successMessage) {
        return
      }

      const message = resolveMessage(
        mutation.meta.successMessage,
        'notifications.successTitle',
        'notifications.successDescription',
        undefined,
        mutation.state.data,
      )

      toast({ variant: 'default', ...message })
    },
  })

  const client = new QueryClient({
    queryCache,
    mutationCache,
    defaultOptions: {
      queries: {
        retry: shouldRetry,
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30_000),
        staleTime: 30_000,
        gcTime: 5 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        throwOnError: true,
      },
      mutations: {
        retry: false,
        throwOnError: true,
      },
    },
  })

  return client
}

let queryClient

export function getQueryClient() {
  if (!queryClient) {
    queryClient = createQueryClient()
  }

  return queryClient
}

