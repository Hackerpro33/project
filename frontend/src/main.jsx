import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { FeatureFlagProvider } from '@/contexts/FeatureFlagContext.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <FeatureFlagProvider>
      <App />
    </FeatureFlagProvider>
  </React.StrictMode>
)