import './App.css'
import Pages from '@/pages/index.jsx'
import { Toaster } from '@/components/ui/toaster'
import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { getQueryClient } from '@/lib/queryClient'
import { TaskEventProvider } from '@/lib/taskEvents'
import AsyncBoundary from '@/components/feedback/AsyncBoundary.jsx'

const queryClient = getQueryClient()

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TaskEventProvider>
        <AsyncBoundary>
          <Pages />
        </AsyncBoundary>
      </TaskEventProvider>
      <Toaster />
      <ReactQueryDevtools initialIsOpen={false} position="bottom-right" />
    </QueryClientProvider>
  )
}

export default App
