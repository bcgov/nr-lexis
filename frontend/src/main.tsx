import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'aws-amplify/auth/enable-oauth-listener'
import { Amplify } from 'aws-amplify'
import '@/scss/styles.scss'
import App from '@/App'
import amplifyConfig, { isCognitoConfigured } from '@/config/fam/config'
import { registerStaleChunkRecovery } from '@/config/stale-chunk-recovery'
import { AuthProvider } from './context/auth/AuthProvider'

registerStaleChunkRecovery()

if (isCognitoConfigured) {
  Amplify.configure(amplifyConfig)
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
)
