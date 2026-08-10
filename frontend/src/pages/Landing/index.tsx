import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Column, Grid, InlineNotification } from '@carbon/react'
import { Login } from '@carbon/icons-react'
import { AppNotification } from '../../components/AppNotification'
import type { LoginProvider } from '@/context/auth/types'
import {
  clearSessionExpiredLoginNotice,
  hasSessionExpiredLoginNotice,
} from '@/context/auth/session-expiry'
import { useAuth } from '@/context/auth/useAuth'
import { useTheme } from '@/context/theme/useTheme'
import logo from '@/assets/BCID_H_rgb_pos.png'
import reverseLogo from '@/assets/gov-bc-logo-horiz.png'
import landingImage from '@/assets/landing.jpg'

const LandingPage = () => {
  const navigate = useNavigate()
  const { defaultRoute, isLoading, isLoggedIn, login, usesExternalLogin } = useAuth()
  const { theme } = useTheme()
  const logoSource = theme === 'g100' ? reverseLogo : logo

  const [errorMessage, setErrorMessage] = useState('')
  const [showSessionExpiredMessage, setShowSessionExpiredMessage] = useState(
    hasSessionExpiredLoginNotice,
  )

  useEffect(() => {
    if (showSessionExpiredMessage) {
      clearSessionExpiredLoginNotice()
    }
  }, [showSessionExpiredMessage])

  useEffect(() => {
    if (!isLoading && isLoggedIn) {
      navigate(defaultRoute, { replace: true })
    }
  }, [defaultRoute, isLoading, isLoggedIn, navigate])

  const onLogin = async (provider: LoginProvider) => {
    setErrorMessage('')
    try {
      await login(provider)
    } catch (error) {
      console.error(error)
      setErrorMessage('Unable to start the login flow.')
    }
  }

  return (
    <main className="landing-grid-container login-landing" id="main-content" aria-busy={isLoading}>
      <Grid fullWidth className="landing-grid">
        <Column className="landing-content-col" sm={4} md={8} lg={8}>
          <div className="landing-content-wrapper">
            <div className="landing-logo-mark">
              <img src={logoSource} alt="Government of British Columbia" className="landing-logo" />
            </div>

            <div className="landing-title-group">
              <h1 className="landing-title">LEXIS</h1>
              <h2 className="landing-subtitle">Log Exemption Information System</h2>
            </div>

            {showSessionExpiredMessage && (
              <InlineNotification
                className="landing-session-expired-notification"
                kind="warning"
                lowContrast
                title="You’ve been logged out"
                subtitle="Your session expired for security reasons and any unsaved changes were lost. Log in again to continue."
                onCloseButtonClick={() => setShowSessionExpiredMessage(false)}
              />
            )}

            <div className="landing-actions">
              {!isLoggedIn && (
                <>
                  <Button
                    kind="primary"
                    size="md"
                    renderIcon={Login}
                    onClick={() => void onLogin('idir')}
                    disabled={isLoading || !usesExternalLogin}
                    data-testid="landing-button__idir"
                  >
                    Log in with IDIR
                  </Button>
                  <Button
                    kind="tertiary"
                    size="md"
                    renderIcon={Login}
                    onClick={() => void onLogin('business-bceid')}
                    disabled={isLoading || !usesExternalLogin}
                    data-testid="landing-button__bceid"
                  >
                    Log in with Business BCeID
                  </Button>
                </>
              )}

              {!usesExternalLogin && !isLoggedIn && (
                <p className="landing-help-text">
                  LEXIS login is not configured for this environment. Contact the system
                  administrator.
                </p>
              )}
            </div>

            {errorMessage && (
              <AppNotification
                kind="error"
                title="Session error"
                subtitle={errorMessage}
                lowContrast
                onCloseButtonClick={() => setErrorMessage('')}
              />
            )}
          </div>
        </Column>

        <Column className="landing-img-col" sm={4} md={8} lg={8}>
          <img
            src={landingImage}
            alt="Log sorting operation at a British Columbia harbour"
            className="landing-img"
          />
        </Column>
      </Grid>
    </main>
  )
}

export default LandingPage
