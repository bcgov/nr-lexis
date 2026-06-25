import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../AuthProvider'
import { useAuth } from '@/context/auth/useAuth'
import { fetchSessionCapabilities } from '@/service/session-service'

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
}))

vi.mock('@/service/session-service', () => ({
  fetchSessionCapabilities: vi.fn(),
}))

const mockedFetchSessionCapabilities = vi.mocked(fetchSessionCapabilities)
let consoleWarnSpy: ReturnType<typeof vi.spyOn>

const LogoutProbe = () => {
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

  it('signs out of Cognito', async () => {
    renderProbe()

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false')
    })
    expect(screen.getByTestId('is-logged-in')).toHaveTextContent('true')

    await userEvent.click(screen.getByRole('button', { name: 'Logout' }))

    await waitFor(() => {
      expect(authMocks.signOut).toHaveBeenCalledTimes(1)
    })
    expect(authMocks.signOut).toHaveBeenCalledWith()
    expect(screen.getByTestId('is-logged-in')).toHaveTextContent('false')
  })

  it('clears local auth state after Cognito signout fails', async () => {
    authMocks.signOut.mockRejectedValue(new Error('cognito unavailable'))
    renderProbe()

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false')
    })

    await userEvent.click(screen.getByRole('button', { name: 'Logout' }))

    await waitFor(() => {
      expect(authMocks.signOut).toHaveBeenCalledTimes(1)
    })
    expect(authMocks.signOut).toHaveBeenCalledWith()
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'Unable to complete Cognito sign-out. Clearing local auth state.',
      expect.any(Error),
    )
    expect(screen.getByTestId('is-logged-in')).toHaveTextContent('false')
  })
})
