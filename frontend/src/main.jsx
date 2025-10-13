import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import '@/i18n'
import { FeatureFlagProvider } from '@/contexts/FeatureFlagContext.jsx'
import { ThemeProvider } from '@/contexts/ThemeContext.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <FeatureFlagProvider>
        <App />
      </FeatureFlagProvider>
    </ThemeProvider>
  </React.StrictMode>
)