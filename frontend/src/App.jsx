import './App.css'
import Pages from '@/pages/index.jsx'
import OnboardingTour from '@/components/common/OnboardingTour.jsx'
import { Toaster } from '@/components/ui/toaster'

function App() {
  return (
    <>
      <Pages />
      <OnboardingTour />
      <Toaster />
    </>
  )
}

export default App
