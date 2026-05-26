import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@/scss/styles.scss'
import App from '@/App'
import { AuthProvider } from '@/context/auth/AuthProvider'

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
)
