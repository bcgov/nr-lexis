import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'aws-amplify/auth/enable-oauth-listener'
import { Amplify } from 'aws-amplify'
import { cognitoUserPoolsTokenProvider } from 'aws-amplify/auth/cognito'
import { CookieStorage } from 'aws-amplify/utils'
import '@/scss/styles.scss'
import App from '@/App'
import amplifyConfig, { isCognitoConfigured } from '@/config/fam/config'
import { AuthProvider } from '@/context/auth/AuthProvider'

if (isCognitoConfigured) {
  cognitoUserPoolsTokenProvider.setKeyValueStorage(
    new CookieStorage({
      domain: window.location.hostname,
      path: '/',
      secure: window.location.protocol === 'https:',
      sameSite: 'strict',
      expires: undefined,
    }),
  )
  Amplify.configure(amplifyConfig)
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
)
