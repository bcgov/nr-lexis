import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { type FC } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '@/context/auth/AuthProvider'
import { useAuth } from '@/context/auth/useAuth'
import { fetchSessionCapabilities, performLogoff } from '@/service/session-service'

const authMocks = vi.hoisted(() => ({
  fetchAuthSession: vi.fn(),
  signInWithRedirect: vi.fn(),
  signOut: vi.fn(),
}))

vi.mock('aws-amplify/auth', () => authMocks)

vi.mock('@/config/fam/config', () => ({
  businessBceidProviderName: 'DEV-BCEIDBUSINESS',
  idirProviderName: 'DEV-IDIR',
  isCognitoConfigured: true,
  redirectSignOut: 'https://nr-lexis-test.apps.silver.devops.gov.bc.ca/',
}))

vi.mock('@/service/session-service', () => ({
  fetchSessionCapabilities: vi.fn(),
  performLogoff: vi.fn(),
}))

const mockedFetchSessionCapabilities = vi.mocked(fetchSessionCapabilities)
const mockedPerformLogoff = vi.mocked(performLogoff)
let consoleWarnSpy: ReturnType<typeof vi.spyOn>

const LogoutProbe: FC = () => {
  const { isLoading, isLoggedIn, logout } = useAuth()

  return (
    <div>
      <div data-testid="loading">{String(isLoading)}</div>
      <div data-testid="is-logged-in">{String(isLoggedIn)}</div>
      <button type="button" onClick={() => void logout()}>
        Logout
      </button>
    </div>
  )
}

const renderProbe = () => {
  render(
    <AuthProvider>
      <LogoutProbe />
    </AuthProvider>,
  )
}

describe('AuthProvider logout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    authMocks.fetchAuthSession.mockResolvedValue({
      tokens: {
        accessToken: 'access-token',
        idToken: {
          payload: {},
        },
      },
    })
    authMocks.signOut.mockResolvedValue(undefined)
    mockedFetchSessionCapabilities.mockResolvedValue({
      authenticated: true,
      principal: 'idir\\tester',
      roles: ['LEXIS_ADMIN'],
      welcomeTarget: null,
      legacyPath: null,
      grantedActions: ['/lexisAgentAdmin'],
      orgUnitNo: null,
    })
  })

  afterEach(() => {
    consoleWarnSpy.mockRestore()
  })

  it('still signs out of Cognito when backend logoff fails', async () => {
    mockedPerformLogoff.mockRejectedValue(new Error('backend unavailable'))

    renderProbe()

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false')
    })
    expect(screen.getByTestId('is-logged-in')).toHaveTextContent('true')

    await userEvent.click(screen.getByRole('button', { name: 'Logout' }))

    await waitFor(() => {
      expect(authMocks.signOut).toHaveBeenCalledTimes(1)
    })
    expect(authMocks.signOut).toHaveBeenCalledWith({
      global: false,
      oauth: { redirectUrl: 'https://nr-lexis-test.apps.silver.devops.gov.bc.ca/' },
    })
    expect(mockedPerformLogoff).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('is-logged-in')).toHaveTextContent('false')
  })
})
