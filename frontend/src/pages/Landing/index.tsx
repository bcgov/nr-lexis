import { useState, type FC } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Column, Grid, InlineNotification } from '@carbon/react'
import { Login } from '@carbon/icons-react'
import type { LoginProvider } from '@/context/auth/types'
import { useAuth } from '@/context/auth/useAuth'
import logo from '@/assets/gov-bc-logo-horiz.png'
import landingImage from '@/assets/landing.jpg'

const LandingPage: FC = () => {
  const navigate = useNavigate()
  const { defaultRoute, isLoading, isLoggedIn, login, usesExternalLogin } = useAuth()

  const [errorMessage, setErrorMessage] = useState('')

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
    <main className="landing-grid-container" id="main-content" aria-busy={isLoading}>
      <Grid fullWidth className="landing-grid">
        <Column className="landing-content-col" sm={4} md={8} lg={8}>
          <div className="landing-content-wrapper">
            <img src={logo} alt="Government of British Columbia" className="landing-logo" />

            <div className="landing-title-group">
              <p className="landing-kicker">NR LEXIS</p>
              <h1 className="landing-title">Log Exemption Information System</h1>
              <p className="landing-subtitle">
                Ministry and industry access for log export exemption, permit, offer, and
                application workflows.
              </p>
            </div>

            <p className="landing-description">
              Apply for and manage log export exemptions, permits, offers, and related LEXIS
              workflows.
            </p>

            <div className="landing-actions">
              {!isLoggedIn && (
                <>
                  <Button
                    kind="primary"
                    renderIcon={Login}
                    onClick={() => void onLogin('idir')}
                    disabled={isLoading || !usesExternalLogin}
                  >
                    Log in with IDIR
                  </Button>
                  <Button
                    kind="secondary"
                    renderIcon={Login}
                    onClick={() => void onLogin('business-bceid')}
                    disabled={isLoading || !usesExternalLogin}
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

              {isLoggedIn && (
                <Button
                  kind="secondary"
                  onClick={() => navigate(defaultRoute)}
                  disabled={isLoading}
                >
                  Continue to Application
                </Button>
              )}
            </div>

            <p className="landing-support-text">
              Industry users sign in with Business BCeID. Ministry users sign in with IDIR. Access
              must be granted through Forests Access Management before LEXIS roles appear here.
            </p>

            {errorMessage && (
              <InlineNotification
                kind="error"
                title="Session Error"
                subtitle={errorMessage}
                lowContrast
                onCloseButtonClick={() => setErrorMessage('')}
              />
            )}
          </div>
        </Column>

        <Column className="landing-img-col" sm={4} md={8} lg={8}>
          <img src={landingImage} alt="" className="landing-img" aria-hidden="true" />
        </Column>
      </Grid>
    </main>
  )
}

export default LandingPage
