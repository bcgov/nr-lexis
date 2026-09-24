import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@/scss/styles.scss'
import App from '@/App'
import { registerStaleChunkRecovery } from '@/config/stale-chunk-recovery'
import { AuthProvider } from './context/auth/AuthProvider'
import ThemeProvider from './context/theme/ThemeProvider'

registerStaleChunkRecovery()

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <AuthProvider>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </AuthProvider>
  </StrictMode>,
)
