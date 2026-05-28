import { render, screen, waitFor } from '@testing-library/react'
import { type FC } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '@/context/auth/AuthProvider'
import { useAuth } from '@/context/auth/useAuth'
import { fetchSessionCapabilities } from '@/service/session-service'

vi.mock('@/service/session-service', () => ({
  fetchSessionCapabilities: vi.fn(),
  performLogoff: vi.fn(),
}))

const mockedFetchSessionCapabilities = vi.mocked(fetchSessionCapabilities)

type ProbeProps = {
  actionChecks: string[]
}

const AuthProbe: FC<ProbeProps> = ({ actionChecks }) => {
  const { capabilities, canPerform, defaultRoute, hasAnyRole, isLoading, isLoggedIn } = useAuth()

  return (
    <div>
      <div data-testid="loading">{String(isLoading)}</div>
      <div data-testid="is-logged-in">{String(isLoggedIn)}</div>
      <div data-testid="has-any-role">{String(hasAnyRole)}</div>
      <div data-testid="roles">{capabilities.roles.join(',')}</div>
      <div data-testid="default-route">{defaultRoute}</div>
      {actionChecks.map((action) => (
        <div key={action} data-testid={`action-${action}`}>
          {String(canPerform(action))}
        </div>
      ))}
    </div>
  )
}

const renderProbe = (actionChecks: string[] = []) => {
  render(
    <AuthProvider>
      <AuthProbe actionChecks={actionChecks} />
    </AuthProvider>,
  )
}

const waitForAuthLoad = async () => {
  await waitFor(() => {
    expect(screen.getByTestId('loading')).toHaveTextContent('false')
  })
}

describe('Auth Provider Role Matrix', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    localStorage.clear()
  })

  it('normalizes final and legacy concrete submitter roles and grants expected actions', async () => {
    vi.stubEnv('VITE_LEXIS_ENABLE_ROLE_ACTION_FALLBACK', 'true')
    mockedFetchSessionCapabilities.mockResolvedValue({
      authenticated: true,
      principal: 'idir\\tester',
      roles: ['LEXIS_INDUSTRY_00012345', 'LOG_EXPORT_INDUSTRY_00067890'],
      welcomeTarget: null,
      legacyPath: null,
      grantedActions: [],
    })

    renderProbe(['/summary', '/federalApplicationSearch', '/lexisAgentAdmin'])
    await waitForAuthLoad()

    expect(screen.getByTestId('roles')).toHaveTextContent(
      'PROVINCIAL_SUBMITTER_00012345,FEDERAL_SUBMITTER',
    )
    expect(screen.getByTestId('default-route')).toHaveTextContent('/provincial/summary')
    expect(screen.getByTestId('action-/summary')).toHaveTextContent('true')
    expect(screen.getByTestId('action-/federalApplicationSearch')).toHaveTextContent('true')
    expect(screen.getByTestId('action-/lexisAgentAdmin')).toHaveTextContent('false')
  })

  it('maps legacy admin alias to canonical admin role and admin route', async () => {
    vi.stubEnv('VITE_LEXIS_ENABLE_ROLE_ACTION_FALLBACK', 'true')
    mockedFetchSessionCapabilities.mockResolvedValue({
      authenticated: true,
      principal: 'idir\\admin',
      roles: ['LEXIS_ADMIN'],
      welcomeTarget: null,
      legacyPath: null,
      grantedActions: [],
    })

    renderProbe(['/lexisAgentAdmin', '/applicationSearch'])
    await waitForAuthLoad()

    expect(screen.getByTestId('roles')).toHaveTextContent('ADMIN')
    expect(screen.getByTestId('default-route')).toHaveTextContent('/admin')
    expect(screen.getByTestId('action-/lexisAgentAdmin')).toHaveTextContent('true')
    expect(screen.getByTestId('action-/applicationSearch')).toHaveTextContent('true')
  })

  it('preserves legacy path routing precedence when legacyPath is present', async () => {
    vi.stubEnv('VITE_LEXIS_ENABLE_LEGACY_PATH_ROUTING', 'true')
    vi.stubEnv('VITE_LEXIS_ENABLE_ROLE_ACTION_FALLBACK', 'true')
    mockedFetchSessionCapabilities.mockResolvedValue({
      authenticated: true,
      principal: 'idir\\approver',
      roles: ['APPLICATION_APPROVER'],
      welcomeTarget: null,
      legacyPath: '/permitSearch.do?actionMapping=view',
      grantedActions: [],
    })

    renderProbe(['/applicationsReview'])
    await waitForAuthLoad()

    expect(screen.getByTestId('default-route')).toHaveTextContent('/provincial/permit')
    expect(screen.getByTestId('action-/applicationsReview')).toHaveTextContent('true')
  })

  it('ignores legacy path routing by default when legacy routing is not enabled', async () => {
    vi.stubEnv('VITE_LEXIS_ENABLE_ROLE_ACTION_FALLBACK', 'true')
    mockedFetchSessionCapabilities.mockResolvedValue({
      authenticated: true,
      principal: 'idir\\approver',
      roles: ['APPLICATION_APPROVER'],
      welcomeTarget: null,
      legacyPath: '/permitSearch.do?actionMapping=view',
      grantedActions: [],
    })

    renderProbe(['/applicationsReview'])
    await waitForAuthLoad()

    expect(screen.getByTestId('default-route')).toHaveTextContent('/provincial/review')
    expect(screen.getByTestId('action-/applicationsReview')).toHaveTextContent('true')
  })

  it('treats FEDERAL_SUBMITTER suffixed values as concrete federal role', async () => {
    vi.stubEnv('VITE_LEXIS_ENABLE_ROLE_ACTION_FALLBACK', 'true')
    mockedFetchSessionCapabilities.mockResolvedValue({
      authenticated: true,
      principal: 'idir\\federal',
      roles: ['FEDERAL_SUBMITTER_99999999'],
      welcomeTarget: null,
      legacyPath: null,
      grantedActions: [],
    })

    renderProbe(['/federalApplicationSearch', 'viewFederalApplication'])
    await waitForAuthLoad()

    expect(screen.getByTestId('roles')).toHaveTextContent('FEDERAL_SUBMITTER')
    expect(screen.getByTestId('action-/federalApplicationSearch')).toHaveTextContent('true')
    expect(screen.getByTestId('action-viewFederalApplication')).toHaveTextContent('true')
    expect(screen.getByTestId('default-route')).toHaveTextContent('/provincial/summary')
  })

  it('grants exemption approval actions to EXEMPTION_APPROVER', async () => {
    vi.stubEnv('VITE_LEXIS_ENABLE_ROLE_ACTION_FALLBACK', 'true')
    mockedFetchSessionCapabilities.mockResolvedValue({
      authenticated: true,
      principal: 'idir\\exemption-approver',
      roles: ['EXEMPTION_APPROVER'],
      welcomeTarget: null,
      legacyPath: null,
      grantedActions: [],
    })

    renderProbe(['approveExemption', '/applicationsReview', '/exemptionSearch'])
    await waitForAuthLoad()

    expect(screen.getByTestId('roles')).toHaveTextContent('EXEMPTION_APPROVER')
    expect(screen.getByTestId('default-route')).toHaveTextContent('/provincial/exemption')
    expect(screen.getByTestId('action-approveExemption')).toHaveTextContent('true')
    expect(screen.getByTestId('action-/applicationsReview')).toHaveTextContent('true')
    expect(screen.getByTestId('action-/exemptionSearch')).toHaveTextContent('true')
  })

  it('can disable role-derived action fallback when backend action claims are expected', async () => {
    vi.stubEnv('VITE_LEXIS_ENABLE_ROLE_ACTION_FALLBACK', 'false')
    mockedFetchSessionCapabilities.mockResolvedValue({
      authenticated: true,
      principal: 'idir\\read-only',
      roles: ['READ_ONLY'],
      welcomeTarget: null,
      legacyPath: null,
      grantedActions: [],
    })

    renderProbe(['/applicationSearch'])
    await waitForAuthLoad()

    expect(screen.getByTestId('roles')).toHaveTextContent('READ_ONLY')
    expect(screen.getByTestId('default-route')).toHaveTextContent('/provincial/application')
    expect(screen.getByTestId('action-/applicationSearch')).toHaveTextContent('false')
  })

  it('defaults role-derived action fallback to disabled when env is not configured', async () => {
    mockedFetchSessionCapabilities.mockResolvedValue({
      authenticated: true,
      principal: 'idir\\read-only',
      roles: ['READ_ONLY'],
      welcomeTarget: null,
      legacyPath: null,
      grantedActions: [],
    })

    renderProbe(['/applicationSearch'])
    await waitForAuthLoad()

    expect(screen.getByTestId('roles')).toHaveTextContent('READ_ONLY')
    expect(screen.getByTestId('action-/applicationSearch')).toHaveTextContent('false')
  })
})
