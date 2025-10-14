import './App.css'
import Pages from '@/pages/index.jsx'
import { Toaster } from '@/components/ui/toaster'
import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { getQueryClient } from '@/lib/queryClient'
import { TaskEventProvider } from '@/lib/taskEvents'
import AsyncBoundary from '@/components/feedback/AsyncBoundary.jsx'
import { ThemeProvider } from '@/contexts/ThemeProvider.jsx'

const queryClient = getQueryClient()

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TaskEventProvider>
          <div className="app-shell">
            <div className="app-shell__glow" aria-hidden />
            <AsyncBoundary>
              <div className="app-shell__content">
                <Pages />
              </div>
            </AsyncBoundary>
          </div>
        </TaskEventProvider>
        <Toaster />
        <ReactQueryDevtools initialIsOpen={false} position="bottom-right" />
      </ThemeProvider>
    </QueryClientProvider>
  )
}

export default App
