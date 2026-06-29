import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Column, Grid } from '@carbon/react'
import { Login } from '@carbon/icons-react'
import { AppNotification } from '../../components/AppNotification'
import type { LoginProvider } from '@/context/auth/types'
import { useAuth } from '@/context/auth/useAuth'
import logo from '@/assets/BCID_H_rgb_pos.png'
import landingImage from '@/assets/landing.jpg'

const LandingPage = () => {
  const navigate = useNavigate()
  const { defaultRoute, isLoading, isLoggedIn, login, usesExternalLogin } = useAuth()

  const [errorMessage, setErrorMessage] = useState('')

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
    <main className="landing-grid-container" id="main-content" aria-busy={isLoading}>
      <Grid fullWidth className="landing-grid">
        <Column className="landing-content-col" sm={4} md={5} lg={10}>
          <div className="landing-content-wrapper">
            <div className="landing-logo-mark">
              <img src={logo} alt="Government of British Columbia" className="landing-logo" />
            </div>

            <div className="landing-title-group">
              <h1 className="landing-title">Welcome to LEXIS</h1>
              <p className="landing-subtitle">
                Create and manage applications, view offers and permits
              </p>
            </div>

            <div className="landing-actions">
              {!isLoggedIn && (
                <>
                  <Button
                    kind="primary"
                    renderIcon={Login}
                    onClick={() => void onLogin('idir')}
                    disabled={isLoading || !usesExternalLogin}
                    data-testid="landing-button__idir"
                  >
                    Log in with IDIR
                  </Button>
                  <Button
                    kind="tertiary"
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

        <Column className="landing-img-col" sm={4} md={3} lg={6}>
          <img src={landingImage} alt="" className="landing-img" aria-hidden="true" />
        </Column>
      </Grid>
    </main>
  )
}

export default LandingPage
