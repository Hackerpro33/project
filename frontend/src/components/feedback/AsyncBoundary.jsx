import React from 'react'
import { QueryErrorResetBoundary } from '@tanstack/react-query'
import { ErrorBoundary } from 'react-error-boundary'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTranslation } from 'react-i18next'

export function AsyncBoundary({ children }) {
  const { t } = useTranslation()

  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <ErrorBoundary
          onReset={reset}
          fallbackRender={({ error, resetErrorBoundary }) => (
            <div className="min-h-[50vh] flex flex-col items-center justify-center gap-4 text-center text-slate-600 px-6">
              <span className="text-lg font-semibold">{t('errors.boundaryTitle')}</span>
              <p className="max-w-md">{t('errors.boundaryDescription')}</p>
              {error?.message && (
                <code className="text-xs bg-slate-100 px-3 py-2 rounded-md text-slate-500 whitespace-pre-wrap break-all">
                  {error.message}
                </code>
              )}
              <Button onClick={() => resetErrorBoundary()}>{t('errors.retry')}</Button>
            </div>
          )}
        >
          <React.Suspense
            fallback={
              <div className="min-h-[50vh] flex items-center justify-center text-slate-500 gap-3" role="status">
                <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
                {t('loading.default')}
              </div>
            }
          >
            {children}
          </React.Suspense>
        </ErrorBoundary>
      )}
    </QueryErrorResetBoundary>
  )
}

export default AsyncBoundary

