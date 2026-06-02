import { useState, type FC } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Column, Grid, InlineNotification, Tile } from '@carbon/react'
import { Login } from '@carbon/icons-react'
import type { LoginProvider } from '@/context/auth/types'
import { useAuth } from '@/context/auth/useAuth'
import logo from '@/assets/gov-bc-logo-horiz.png'

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
    <div className="landing-page">
      <Grid fullWidth className="landing-grid">
        <Column sm={4} md={8} lg={16}>
          <img src={logo} alt="Government of British Columbia" className="landing-logo" />
        </Column>

        <Column sm={4} md={8} lg={9}>
          <Tile className="landing-card">
            <p className="landing-kicker">Government of British Columbia</p>
            <h1>Log Exemption Information System</h1>
            <p>
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
          </Tile>
        </Column>

        <Column sm={4} md={8} lg={7}>
          <Tile className="landing-card landing-card--support">
            <h2>Access to LEXIS</h2>
            <p>
              Industry users sign in with Business BCeID. Ministry users sign in with IDIR. Access
              must be granted through Forests Access Management before LEXIS roles appear here.
            </p>
          </Tile>
        </Column>

        {errorMessage && (
          <Column sm={4} md={8} lg={16}>
            <InlineNotification
              kind="error"
              title="Session Error"
              subtitle={errorMessage}
              lowContrast
              onCloseButtonClick={() => setErrorMessage('')}
            />
          </Column>
        )}
      </Grid>
    </div>
  )
}

export default LandingPage
