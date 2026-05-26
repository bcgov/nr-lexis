import { useMemo, useState, type FC } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Button,
  Column,
  Grid,
  InlineNotification,
  Select,
  SelectItem,
  Tag,
  Tile,
} from '@carbon/react'
import { Login } from '@carbon/icons-react'
import { useAuth } from '@/context/auth/useAuth'
import logo from '@/assets/gov-bc-logo-horiz.png'

const DEV_ROLE_OPTIONS = [
  { value: '', label: 'Select a role' },
  { value: 'ADMIN', label: 'ADMIN' },
  { value: 'READ_ONLY', label: 'READ_ONLY' },
  { value: 'APPLICATION_APPROVER', label: 'APPLICATION_APPROVER' },
  { value: 'EXEMPTION_APPROVER', label: 'EXEMPTION_APPROVER' },
  { value: 'LEXIS_INDUSTRY', label: 'LEXIS_INDUSTRY (Abstract Parent)' },
  { value: 'LEXIS_INDUSTRY_00012345', label: 'LEXIS_INDUSTRY_00012345 (Concrete Child)' },
  { value: 'LOG_EXPORT_INDUSTRY', label: 'LOG_EXPORT_INDUSTRY (Abstract Parent)' },
  {
    value: 'LOG_EXPORT_INDUSTRY_00012345',
    label: 'LOG_EXPORT_INDUSTRY_00012345 (Concrete Child)',
  },
]

const isDevRoleSimulationEnabled = (): boolean => {
  if (import.meta.env.VITE_ENABLE_DEV_ROLE_SIMULATION === 'true') {
    return true
  }
  return import.meta.env.DEV
}

const LandingPage: FC = () => {
  const navigate = useNavigate()
  const {
    capabilities,
    defaultRoute,
    devRoles,
    isLoading,
    isLoggedIn,
    login,
    refresh,
    setDevRoles,
    clearLoginSimulation,
    usesExternalLogin,
  } = useAuth()

  const [selectedRole, setSelectedRole] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [showDevTools, setShowDevTools] = useState(false)

  const roleSimulationEnabled = useMemo(() => isDevRoleSimulationEnabled(), [])

  const effectiveRoles = useMemo(() => {
    if (capabilities.roles.length > 0) {
      return capabilities.roles
    }
    return devRoles
  }, [capabilities.roles, devRoles])

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

  const onUseDevRole = async () => {
    if (!selectedRole) {
      return
    }

    setErrorMessage('')
    try {
      await setDevRoles([selectedRole])
    } catch (error) {
      console.error(error)
      setErrorMessage('Unable to set development role simulation.')
    }
  }

  const onClearSimulation = async () => {
    setErrorMessage('')
    try {
      await clearLoginSimulation()
    } catch (error) {
      console.error(error)
      setErrorMessage('Unable to clear development role simulation.')
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
                  External login URL is not configured. Local development mode can use role
                  simulation.
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
              {effectiveRoles.length === 0 && <Tag type="gray">No roles</Tag>}
              {effectiveRoles.map((role) => (
                <Tag key={role} type="blue">
                  {role}
                </Tag>
              ))}
            </div>
          </Tile>
        </Column>

        {roleSimulationEnabled && (
          <Column sm={4} md={8} lg={16}>
            <Tile>
              <div className="landing-dev-header">
                <h2>Development Role Simulation</h2>
                <Button
                  kind="tertiary"
                  onClick={() => setShowDevTools((current) => !current)}
                  disabled={isLoading}
                >
                  {showDevTools ? 'Hide' : 'Show'}
                </Button>
              </div>

              {showDevTools && (
                <>
                  <p className="landing-help-text">
                    FAM role model note: <code>LEXIS_INDUSTRY</code> and{' '}
                    <code>LOG_EXPORT_INDUSTRY</code> are abstract parents. Concrete client-scoped
                    roles use the suffix pattern <code>ROLE_&lt;forestClientNumber&gt;</code>.
                  </p>
                  <div className="landing-actions">
                    <Select
                      id="devRole"
                      labelText="Development Role"
                      value={selectedRole}
                      onChange={(event) => setSelectedRole(event.target.value)}
                    >
                      {DEV_ROLE_OPTIONS.map((option) => (
                        <SelectItem key={option.label} value={option.value} text={option.label} />
                      ))}
                    </Select>
                    <Button
                      kind="secondary"
                      onClick={() => void onUseDevRole()}
                      disabled={isLoading || !selectedRole}
                    >
                      Use Development Role
                    </Button>
                    <Button
                      kind="ghost"
                      onClick={() => void onClearSimulation()}
                      disabled={isLoading || devRoles.length === 0}
                    >
                      Clear Development Role
                    </Button>
                  </div>
                </>
              )}
            </Tile>
          </Column>
        )}

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
