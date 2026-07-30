import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../AuthProvider'
import {
  clearSessionExpiredLoginNotice,
  hasSessionExpiredLoginNotice,
  markSessionExpiredLoginNotice,
  SESSION_EXPIRED_EVENT,
  SESSION_IDLE_TIMEOUT_MS,
  SESSION_IDLE_WARNING_MS,
} from '@/context/auth/session-expiry'
import { useAuth } from '@/context/auth/useAuth'
import {
  clearActiveForestClientNumber,
  getActiveForestClientNumber,
  setActiveForestClientNumber,
} from '@/service/forest-client-selection'
import { fetchSessionCapabilities } from '@/service/session-service'

const authMocks = vi.hoisted(() => ({
  fetchAuthSession: vi.fn(),
  signInWithRedirect: vi.fn(),
  signOut: vi.fn(),
}))
const logoutChainMocks = vi.hoisted(() => ({
  startFederatedLogout: vi.fn(),
}))

vi.mock('aws-amplify/auth', () => authMocks)
vi.mock('@/context/auth/logout-chain', () => logoutChainMocks)

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
    clearActiveForestClientNumber()
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
    logoutChainMocks.startFederatedLogout.mockReturnValue(false)
    mockedFetchSessionCapabilities.mockResolvedValue({
      authenticated: true,
      principal: 'idir\\tester',
      roles: ['LEXIS_ADMIN'],
      welcomeTarget: null,
      legacyPath: null,
      grantedActions: ['/lexisAgentAdmin'],
      orgUnitNo: null,
      forestClientNumber: null,
      availableForestClientNumbers: [],
      forestClientSelectionRequired: false,
    })
  })

  afterEach(() => {
    consoleWarnSpy.mockRestore()
    vi.useRealTimers()
    window.history.replaceState({}, document.title, '/')
    clearSessionExpiredLoginNotice()
    clearActiveForestClientNumber()
  })

  it('signs out of Cognito', async () => {
    markSessionExpiredLoginNotice()
    setActiveForestClientNumber('00012345')
    window.sessionStorage.setItem(
      'lexis.search-state.v1.provincial-review',
      'applicationNumber=43278',
    )
    window.sessionStorage.setItem('unrelated', 'keep')
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
    expect(hasSessionExpiredLoginNotice()).toBe(false)
    expect(getActiveForestClientNumber()).toBeNull()
    expect(window.sessionStorage.getItem('lexis.search-state.v1.provincial-review')).toBeNull()
    expect(window.sessionStorage.getItem('unrelated')).toBe('keep')
  })

  it('uses the FSPTS-style federated logout chain when it is configured', async () => {
    logoutChainMocks.startFederatedLogout.mockReturnValue(true)
    markSessionExpiredLoginNotice()
    renderProbe()

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false')
    })

    await userEvent.click(screen.getByRole('button', { name: 'Logout' }))

    expect(logoutChainMocks.startFederatedLogout).toHaveBeenCalledOnce()
    expect(authMocks.signOut).not.toHaveBeenCalled()
    expect(hasSessionExpiredLoginNotice()).toBe(false)
  })

  it('uses the FSPTS 30 minute idle timeout', () => {
    expect(SESSION_IDLE_TIMEOUT_MS).toBe(30 * 60 * 1000)
    expect(SESSION_IDLE_WARNING_MS).toBe(5 * 60 * 1000)
  })

  it('preserves the inactivity notice while bootstrapping without Cognito tokens', async () => {
    markSessionExpiredLoginNotice()
    window.sessionStorage.setItem(
      'lexis.search-state.v1.provincial-review',
      'applicationNumber=43278',
    )
    authMocks.fetchAuthSession.mockResolvedValue({ tokens: undefined })

    renderProbe()

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false')
    })

    expect(screen.getByTestId('is-logged-in')).toHaveTextContent('false')
    expect(mockedFetchSessionCapabilities).not.toHaveBeenCalled()
    expect(hasSessionExpiredLoginNotice()).toBe(true)
    expect(window.sessionStorage.getItem('lexis.search-state.v1.provincial-review')).toBeNull()
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

  it('expires authenticated sessions after 30 minutes of inactivity', async () => {
    window.history.replaceState({}, document.title, '/provincial/review')
    window.sessionStorage.setItem(
      'lexis.search-state.v1.provincial-review',
      'applicationNumber=43278',
    )
    let pathnameWhenSignOutStarted = ''
    authMocks.signOut.mockImplementation(async () => {
      pathnameWhenSignOutStarted = window.location.pathname
    })
    renderProbe()

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false')
    })

    vi.useFakeTimers()
    window.dispatchEvent(new Event('keydown'))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(SESSION_IDLE_TIMEOUT_MS - SESSION_IDLE_WARNING_MS)
    })
    expect(
      screen.getByRole('alertdialog', { name: 'You’re about to be logged out' }),
    ).toBeInTheDocument()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(SESSION_IDLE_WARNING_MS - 1)
    })
    expect(authMocks.signOut).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })

    expect(authMocks.signOut).toHaveBeenCalledTimes(1)
    expect(pathnameWhenSignOutStarted).toBe('/')
    expect(screen.getByTestId('is-logged-in')).toHaveTextContent('false')
    expect(window.location.pathname).toBe('/')
    expect(hasSessionExpiredLoginNotice()).toBe(true)
    expect(window.sessionStorage.getItem('lexis.search-state.v1.provincial-review')).toBeNull()
  })

  it('resets the 30 minute inactivity timer when the user interacts with the page', async () => {
    window.history.replaceState({}, document.title, '/provincial/review')
    renderProbe()

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false')
    })

    vi.useFakeTimers()
    window.dispatchEvent(new Event('keydown'))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(SESSION_IDLE_TIMEOUT_MS - SESSION_IDLE_WARNING_MS - 1)
    })
    window.dispatchEvent(new KeyboardEvent('keydown'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(document.querySelector('.lexis-session-timeout-warning')).not.toHaveClass('is-visible')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(SESSION_IDLE_TIMEOUT_MS - 2)
    })
    expect(authMocks.signOut).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })

    expect(authMocks.signOut).toHaveBeenCalledTimes(1)
    expect(window.location.pathname).toBe('/')
  })

  it('keeps the Cognito token fresh while the user remains active', async () => {
    renderProbe()

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false')
    })
    authMocks.fetchAuthSession.mockClear()
    vi.useFakeTimers()

    window.dispatchEvent(new MouseEvent('mousemove'))
    await act(async () => {
      await Promise.resolve()
    })
    expect(authMocks.fetchAuthSession).toHaveBeenCalledOnce()
    expect(authMocks.fetchAuthSession).toHaveBeenLastCalledWith({ forceRefresh: false })

    window.dispatchEvent(new MouseEvent('mousemove'))
    expect(authMocks.fetchAuthSession).toHaveBeenCalledOnce()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })
    window.dispatchEvent(new MouseEvent('mousemove'))
    await act(async () => {
      await Promise.resolve()
    })
    expect(authMocks.fetchAuthSession).toHaveBeenCalledTimes(2)
    expect(authMocks.fetchAuthSession).toHaveBeenLastCalledWith({ forceRefresh: false })
  })

  it('extends the idle session only when the user chooses to stay logged in', async () => {
    renderProbe()

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false')
    })

    vi.useFakeTimers()
    window.dispatchEvent(new Event('keydown'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SESSION_IDLE_TIMEOUT_MS - SESSION_IDLE_WARNING_MS)
    })

    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Stay logged in' }))
      await Promise.resolve()
    })
    expect(authMocks.fetchAuthSession).toHaveBeenCalledWith({ forceRefresh: true })
    expect(document.querySelector('.lexis-session-timeout-warning')).not.toHaveClass('is-visible')
    expect(screen.getByText('You’re still logged in')).toBeInTheDocument()
    expect(screen.getByText('Your session has been extended.')).toBeInTheDocument()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(SESSION_IDLE_TIMEOUT_MS - SESSION_IDLE_WARNING_MS)
    })
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  })

  it('ends the session when the forced refresh cannot extend it', async () => {
    renderProbe()

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false')
    })

    vi.useFakeTimers()
    window.dispatchEvent(new Event('keydown'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SESSION_IDLE_TIMEOUT_MS - SESSION_IDLE_WARNING_MS)
    })
    authMocks.fetchAuthSession.mockRejectedValueOnce(new Error('refresh token expired'))

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Stay logged in' }))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(authMocks.fetchAuthSession).toHaveBeenCalledWith({ forceRefresh: true })
    expect(authMocks.signOut).toHaveBeenCalledOnce()
    expect(hasSessionExpiredLoginNotice()).toBe(false)
  })

  it.each([
    ['the API reports session expiry', 'api-unauthorized'],
    ['the auth token cannot be resolved', 'token-unavailable'],
  ] as const)('returns authenticated users to the login shell when %s', async (_label, reason) => {
    window.history.replaceState({}, document.title, '/provincial/review')
    let pathnameWhenSignOutStarted = ''
    authMocks.signOut.mockImplementation(async () => {
      pathnameWhenSignOutStarted = window.location.pathname
    })
    renderProbe()

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false')
    })
    expect(screen.getByTestId('is-logged-in')).toHaveTextContent('true')

    window.dispatchEvent(
      new CustomEvent(SESSION_EXPIRED_EVENT, {
        detail: { reason },
      }),
    )

    await waitFor(() => {
      expect(authMocks.signOut).toHaveBeenCalledTimes(1)
    })
    expect(pathnameWhenSignOutStarted).toBe('/')
    expect(screen.getByTestId('is-logged-in')).toHaveTextContent('false')
    expect(window.location.pathname).toBe('/')
    expect(hasSessionExpiredLoginNotice()).toBe(false)
  })
})
