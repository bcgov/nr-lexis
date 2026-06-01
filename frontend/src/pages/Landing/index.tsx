import { useState, type FC } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Column, Grid, InlineNotification, Tag, Tile } from '@carbon/react'
import { Login } from '@carbon/icons-react'
import { useAuth } from '@/context/auth/useAuth'
import logo from '@/assets/gov-bc-logo-horiz.png'

const LandingPage: FC = () => {
  const navigate = useNavigate()
  const { capabilities, defaultRoute, isLoading, isLoggedIn, login, refresh, usesExternalLogin } =
    useAuth()

  const [errorMessage, setErrorMessage] = useState('')

  const onLogin = async () => {
    setErrorMessage('')
    try {
      await login()
    } catch (error) {
      console.error(error)
      setErrorMessage('Unable to start the login flow.')
    }
  }

  const onRefreshSession = async () => {
    setErrorMessage('')
    try {
      await refresh()
    } catch (error) {
      console.error(error)
      setErrorMessage('Unable to refresh session information.')
    }
  }

  return (
    <div className="landing-page">
      <Grid fullWidth className="landing-grid">
        <Column sm={4} md={8} lg={16}>
          <img src={logo} alt="Government of British Columbia" className="landing-logo" />
        </Column>

        <Column sm={4} md={8} lg={9}>
          <Tile>
            <h1>NR LEXIS</h1>
            <p>Log Exemption Information System modernization frontend.</p>
            <div className="landing-actions">
              <Button
                kind="primary"
                renderIcon={Login}
                onClick={() => void onLogin()}
                disabled={isLoading}
              >
                Log in with IDIR
              </Button>

              {!usesExternalLogin && !isLoggedIn && (
                <p className="landing-help-text">
                  External login URL is not configured. Login is expected through backend session
                  auth.
                </p>
              )}

              {isLoggedIn && (
                <>
                  <Button
                    kind="secondary"
                    onClick={() => navigate(defaultRoute)}
                    disabled={isLoading}
                  >
                    Continue to Application
                  </Button>
                  <Button kind="ghost" onClick={() => void onRefreshSession()} disabled={isLoading}>
                    Refresh Session
                  </Button>
                </>
              )}
            </div>
          </Tile>
        </Column>

        <Column sm={4} md={8} lg={7}>
          <Tile>
            <h2>Session Status</h2>
            <p>
              Principal: <strong>{capabilities.principal ?? 'Anonymous'}</strong>
            </p>
            <p>
              Authenticated: <strong>{isLoggedIn ? 'Yes' : 'No'}</strong>
            </p>
            <div className="landing-role-tags">
              {capabilities.roles.length === 0 && <Tag type="gray">No roles</Tag>}
              {capabilities.roles.map((role) => (
                <Tag key={role} type="blue">
                  {role}
                </Tag>
              ))}
            </div>
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
