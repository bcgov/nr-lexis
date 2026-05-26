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
import { useAuth } from '@/context/auth/useAuth'
import logo from '@/assets/gov-bc-logo-horiz.png'

const DEV_ROLE_OPTIONS = [
  { value: '', label: 'Select a role' },
  { value: 'ADMIN', label: 'ADMIN' },
  { value: 'READ_ONLY', label: 'READ_ONLY' },
  { value: 'APPLICATION_APPROVER', label: 'APPLICATION_APPROVER' },
  { value: 'EXEMPTION_APPROVER', label: 'EXEMPTION_APPROVER' },
  { value: 'LEXIS_INDUSTRY', label: 'LEXIS_INDUSTRY' },
  { value: 'LOG_EXPORT_INDUSTRY', label: 'LOG_EXPORT_INDUSTRY' },
]

const LandingPage: FC = () => {
  const navigate = useNavigate()
  const {
    capabilities,
    defaultRoute,
    devRoles,
    isLoading,
    isLoggedIn,
    login,
    setDevRoles,
    clearLoginSimulation,
  } = useAuth()
  const [selectedRole, setSelectedRole] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  const effectiveRoles = useMemo(() => {
    if (capabilities.roles.length > 0) {
      return capabilities.roles
    }

    return devRoles
  }, [capabilities.roles, devRoles])

  const onRefreshSession = async () => {
    setErrorMessage('')
    try {
      await login()
    } catch (error) {
      console.error(error)
      setErrorMessage('Unable to load session information.')
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
        <Column sm={4} md={8} lg={16}>
          <h1>NR LEXIS</h1>
          <p>Log Exemption Information System modernization frontend.</p>
        </Column>
        <Column sm={4} md={8} lg={10}>
          <Tile>
            <div className="landing-actions">
              <Button kind="primary" onClick={onRefreshSession} disabled={isLoading}>
                Refresh Session
              </Button>
              <Select
                id="devRole"
                labelText="Development Role Simulation"
                value={selectedRole}
                onChange={(event) => setSelectedRole(event.target.value)}
              >
                {DEV_ROLE_OPTIONS.map((option) => (
                  <SelectItem key={option.label} value={option.value} text={option.label} />
                ))}
              </Select>
              <Button kind="secondary" onClick={onUseDevRole} disabled={isLoading || !selectedRole}>
                Use Development Role
              </Button>
              <Button
                kind="tertiary"
                onClick={onClearSimulation}
                disabled={isLoading || devRoles.length === 0}
              >
                Clear Development Role
              </Button>
              {isLoggedIn && (
                <Button kind="ghost" onClick={() => navigate(defaultRoute)} disabled={isLoading}>
                  Continue to Application
                </Button>
              )}
            </div>
          </Tile>
        </Column>

        <Column sm={4} md={8} lg={6}>
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
