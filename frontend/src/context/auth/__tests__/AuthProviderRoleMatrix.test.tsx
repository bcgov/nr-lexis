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
  })

  it('normalizes legacy concrete submitter roles to canonical forms', async () => {
    mockedFetchSessionCapabilities.mockResolvedValue({
      authenticated: true,
      principal: 'idir\\tester',
      roles: ['LEXIS_INDUSTRY_00012345', 'LOG_EXPORT_INDUSTRY_00067890'],
      welcomeTarget: null,
      legacyPath: null,
      grantedActions: [],
    })

    renderProbe(['/summary'])
    await waitForAuthLoad()

    expect(screen.getByTestId('roles')).toHaveTextContent(
      'PROVINCIAL_SUBMITTER_00012345,FEDERAL_SUBMITTER',
    )
    expect(screen.getByTestId('default-route')).toHaveTextContent('/provincial/summary')
    expect(screen.getByTestId('action-/summary')).toHaveTextContent('false')
  })

  it('maps legacy admin alias to canonical admin role and admin route', async () => {
    mockedFetchSessionCapabilities.mockResolvedValue({
      authenticated: true,
      principal: 'idir\\admin',
      roles: ['LEXIS_ADMIN'],
      welcomeTarget: null,
      legacyPath: null,
      grantedActions: [],
    })

    renderProbe(['/lexisAgentAdmin'])
    await waitForAuthLoad()

    expect(screen.getByTestId('roles')).toHaveTextContent('ADMIN')
    expect(screen.getByTestId('default-route')).toHaveTextContent('/admin')
    expect(screen.getByTestId('action-/lexisAgentAdmin')).toHaveTextContent('false')
  })

  it('does not use legacyPath for default route routing anymore', async () => {
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
    expect(screen.getByTestId('action-/applicationsReview')).toHaveTextContent('false')
  })

  it('uses backend granted actions for canPerform and roleless default route selection', async () => {
    mockedFetchSessionCapabilities.mockResolvedValue({
      authenticated: true,
      principal: 'idir\\reviewer',
      roles: [],
      welcomeTarget: null,
      legacyPath: null,
      grantedActions: ['/applicationsReview'],
    })

    renderProbe(['/applicationsReview', '/applicationSearch'])
    await waitForAuthLoad()

    expect(screen.getByTestId('default-route')).toHaveTextContent('/provincial/review')
    expect(screen.getByTestId('action-/applicationsReview')).toHaveTextContent('true')
    expect(screen.getByTestId('action-/applicationSearch')).toHaveTextContent('false')
  })

  it('sets login state from authenticated flag only', async () => {
    mockedFetchSessionCapabilities.mockResolvedValue({
      authenticated: false,
      principal: null,
      roles: ['READ_ONLY'],
      welcomeTarget: null,
      legacyPath: null,
      grantedActions: [],
    })

    renderProbe()
    await waitForAuthLoad()

    expect(screen.getByTestId('is-logged-in')).toHaveTextContent('false')
    expect(screen.getByTestId('has-any-role')).toHaveTextContent('true')
  })
})
