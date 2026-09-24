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
  getOidcUser: vi.fn(),
  startOidcLogin: vi.fn(),
  endOidcSession: vi.fn(),
}))
vi.mock('@/service/oidc-service', () => ({
  ...authMocks,
  isOidcConfigured: true,
  AUTH_CALLBACK_PATH: '/authCallback',
}))

vi.mock('@/service/session-service', () => ({
  fetchSessionCapabilities: vi.fn(),
}))

const mockedFetchSessionCapabilities = vi.mocked(fetchSessionCapabilities)
let consoleWarnSpy: ReturnType<typeof vi.spyOn>

const LogoutProbe = () => {
  const { defaultRoute, isLoading, isLoggedIn, login, logout } = useAuth()

  return (
    <div>
      <div data-testid="loading">{String(isLoading)}</div>
      <div data-testid="is-logged-in">{String(isLoggedIn)}</div>
      <div data-testid="default-route">{defaultRoute}</div>
      <button type="button" onClick={() => void login('idir')}>
        Login
      </button>
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
    authMocks.getOidcUser.mockResolvedValue({ access_token: 'access-token', profile: {} })
    authMocks.endOidcSession.mockResolvedValue(undefined)
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
    window.sessionStorage.removeItem('lexis.login-destination')
  })

  it('signs out of OIDC', async () => {
    markSessionExpiredLoginNotice()
    setActiveForestClientNumber('00012345')
    window.sessionStorage.setItem(
      'lexis.search-state.v1.provincial-review',
      'applicationNumber=43278',
    )
    window.sessionStorage.setItem('unrelated', 'keep')
    window.sessionStorage.setItem('lexis.login-destination', '/provincial/offers/123')
    renderProbe()

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false')
    })
    expect(screen.getByTestId('is-logged-in')).toHaveTextContent('true')

    await userEvent.click(screen.getByRole('button', { name: 'Logout' }))

    await waitFor(() => {
      expect(authMocks.endOidcSession).toHaveBeenCalledTimes(1)
    })
    expect(authMocks.endOidcSession).toHaveBeenCalledWith()
    expect(screen.getByTestId('is-logged-in')).toHaveTextContent('false')
    expect(hasSessionExpiredLoginNotice()).toBe(false)
    expect(getActiveForestClientNumber()).toBeNull()
    expect(window.sessionStorage.getItem('lexis.search-state.v1.provincial-review')).toBeNull()
    expect(window.sessionStorage.getItem('unrelated')).toBe('keep')
    expect(window.sessionStorage.getItem('lexis.login-destination')).toBeNull()
  })

  it('uses the REPT 25 minute idle timeout', () => {
    expect(SESSION_IDLE_TIMEOUT_MS).toBe(25 * 60 * 1000)
    expect(SESSION_IDLE_WARNING_MS).toBe(5 * 60 * 1000)
  })

  it('preserves the inactivity notice while bootstrapping without OIDC tokens', async () => {
    markSessionExpiredLoginNotice()
    window.sessionStorage.setItem(
      'lexis.search-state.v1.provincial-review',
      'applicationNumber=43278',
    )
    authMocks.getOidcUser.mockResolvedValue(null)

    renderProbe()

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false')
    })

    expect(screen.getByTestId('is-logged-in')).toHaveTextContent('false')
    expect(mockedFetchSessionCapabilities).not.toHaveBeenCalled()
    expect(hasSessionExpiredLoginNotice()).toBe(true)
    expect(window.sessionStorage.getItem('lexis.search-state.v1.provincial-review')).toBeNull()
  })

  it('restores an existing OIDC session instead of starting another login flow', async () => {
    authMocks.getOidcUser
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ access_token: 'access-token', profile: {} })

    renderProbe()

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false')
    })
    expect(screen.getByTestId('is-logged-in')).toHaveTextContent('false')

    await userEvent.click(screen.getByRole('button', { name: 'Login' }))

    await waitFor(() => {
      expect(screen.getByTestId('is-logged-in')).toHaveTextContent('true')
    })
    expect(screen.getByTestId('default-route')).toHaveTextContent('/provincial/review')
    expect(authMocks.startOidcLogin).not.toHaveBeenCalled()
  })

  it('starts the configured login flow when no OIDC session exists', async () => {
    authMocks.getOidcUser.mockResolvedValue(null)
    window.sessionStorage.setItem('lexis.login-destination', '/provincial/offers/123')

    renderProbe()

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false')
    })
    await userEvent.click(screen.getByRole('button', { name: 'Login' }))

    expect(authMocks.startOidcLogin).toHaveBeenCalledWith('idir')
    expect(mockedFetchSessionCapabilities).not.toHaveBeenCalled()
    expect(window.sessionStorage.getItem('lexis.login-destination')).toBe('/provincial/offers/123')
  })

  it('keeps the saved destination when a stored session can no longer be renewed', async () => {
    authMocks.getOidcUser.mockRejectedValue(new Error('refresh token expired'))

    renderProbe()

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false')
    })
    expect(screen.getByTestId('is-logged-in')).toHaveTextContent('false')
    window.sessionStorage.setItem('lexis.login-destination', '/provincial/offers/123')
    await userEvent.click(screen.getByRole('button', { name: 'Login' }))

    expect(authMocks.startOidcLogin).toHaveBeenCalledWith('idir')
    expect(mockedFetchSessionCapabilities).not.toHaveBeenCalled()
    expect(window.sessionStorage.getItem('lexis.login-destination')).toBe('/provincial/offers/123')
  })

  it('leaves callback processing and the saved destination to the callback route', async () => {
    window.history.replaceState({}, document.title, '/authCallback?code=valid&state=oauth-state')
    window.sessionStorage.setItem('lexis.login-destination', '/provincial/offers/123')
    renderProbe()
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))
    expect(authMocks.getOidcUser).not.toHaveBeenCalled()
    expect(mockedFetchSessionCapabilities).not.toHaveBeenCalled()
    expect(window.sessionStorage.getItem('lexis.login-destination')).toBe('/provincial/offers/123')
  })

  it('discards the return destination if session capabilities fail to load', async () => {
    window.sessionStorage.setItem('lexis.login-destination', '/provincial/offers/123')
    mockedFetchSessionCapabilities.mockRejectedValueOnce(new Error('session unavailable'))
    renderProbe()

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))
    expect(window.sessionStorage.getItem('lexis.login-destination')).toBeNull()
  })

  it('clears local auth state after OIDC signout fails', async () => {
    authMocks.endOidcSession.mockRejectedValue(new Error('OIDC unavailable'))
    renderProbe()

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false')
    })

    await userEvent.click(screen.getByRole('button', { name: 'Logout' }))

    await waitFor(() => {
      expect(authMocks.endOidcSession).toHaveBeenCalledTimes(1)
    })
    expect(authMocks.endOidcSession).toHaveBeenCalledWith()
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'Unable to complete OIDC sign-out. Clearing local auth state.',
      expect.any(Error),
    )
    expect(screen.getByTestId('is-logged-in')).toHaveTextContent('false')
  })

  it('expires authenticated sessions after 25 minutes of inactivity', async () => {
    window.history.replaceState({}, document.title, '/provincial/review')
    window.sessionStorage.setItem(
      'lexis.search-state.v1.provincial-review',
      'applicationNumber=43278',
    )
    let pathnameWhenSignOutStarted = ''
    authMocks.endOidcSession.mockImplementation(async () => {
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
    expect(authMocks.endOidcSession).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })

    expect(authMocks.endOidcSession).toHaveBeenCalledTimes(1)
    expect(pathnameWhenSignOutStarted).toBe('/')
    expect(screen.getByTestId('is-logged-in')).toHaveTextContent('false')
    expect(window.location.pathname).toBe('/')
    expect(hasSessionExpiredLoginNotice()).toBe(true)
    expect(window.sessionStorage.getItem('lexis.search-state.v1.provincial-review')).toBeNull()
  })

  it('resets the 25 minute inactivity timer when the user interacts with the page', async () => {
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
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(SESSION_IDLE_TIMEOUT_MS - 2)
    })
    expect(authMocks.endOidcSession).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })

    expect(authMocks.endOidcSession).toHaveBeenCalledTimes(1)
    expect(window.location.pathname).toBe('/')
  })

  it('keeps the OIDC token fresh while the user remains active', async () => {
    // Start the session on the same clock as its activity/keepalive timestamps.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    await act(async () => {
      renderProbe()
    })
    expect(screen.getByTestId('loading')).toHaveTextContent('false')
    authMocks.getOidcUser.mockClear()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
      window.dispatchEvent(new MouseEvent('mousemove'))
    })
    expect(authMocks.getOidcUser).toHaveBeenCalledOnce()
    expect(authMocks.getOidcUser).toHaveBeenLastCalledWith()

    window.dispatchEvent(new MouseEvent('mousemove'))
    expect(authMocks.getOidcUser).toHaveBeenCalledOnce()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(59_999)
    })
    window.dispatchEvent(new MouseEvent('mousemove'))
    expect(authMocks.getOidcUser).toHaveBeenCalledOnce()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
      window.dispatchEvent(new MouseEvent('mousemove'))
    })
    expect(authMocks.getOidcUser).toHaveBeenCalledTimes(2)
    expect(authMocks.getOidcUser).toHaveBeenLastCalledWith()
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
    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' })
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Stay logged in' }))
      await Promise.resolve()
    })
    expect(authMocks.getOidcUser).toHaveBeenCalledWith({ forceRefresh: true })
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
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
    authMocks.getOidcUser.mockRejectedValueOnce(new Error('refresh token expired'))

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Stay logged in' }))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(authMocks.getOidcUser).toHaveBeenCalledWith({ forceRefresh: true })
    expect(authMocks.endOidcSession).toHaveBeenCalledOnce()
    expect(hasSessionExpiredLoginNotice()).toBe(false)
  })

  it.each([
    ['the API reports session expiry', 'api-unauthorized'],
    ['the auth token cannot be resolved', 'token-unavailable'],
  ] as const)('returns authenticated users to the login shell when %s', async (_label, reason) => {
    window.history.replaceState({}, document.title, '/provincial/review')
    window.sessionStorage.setItem('lexis.login-destination', '/provincial/offers/123')
    let pathnameWhenSignOutStarted = ''
    authMocks.endOidcSession.mockImplementation(async () => {
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
      expect(authMocks.endOidcSession).toHaveBeenCalledTimes(1)
    })
    expect(pathnameWhenSignOutStarted).toBe('/')
    expect(screen.getByTestId('is-logged-in')).toHaveTextContent('false')
    expect(window.location.pathname).toBe('/')
    expect(hasSessionExpiredLoginNotice()).toBe(false)
    expect(window.sessionStorage.getItem('lexis.login-destination')).toBeNull()
  })
})
