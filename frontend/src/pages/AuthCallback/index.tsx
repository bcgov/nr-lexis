import { Loading } from '@carbon/react'
import { useEffect } from 'react'
import { clearLoginDestination } from '@/context/auth/login-destination'
import { completeOidcLogin } from '@/service/oidc-service'

const AuthCallback = () => {
  useEffect(() => {
    let mounted = true
    void completeOidcLogin()
      .then(() => {
        if (mounted) window.location.replace('/')
      })
      .catch(() => {
        if (mounted) {
          clearLoginDestination()
          window.location.replace('/')
        }
      })
    return () => {
      mounted = false
    }
  }, [])
  return <Loading withOverlay description="Completing login…" />
}

export default AuthCallback
