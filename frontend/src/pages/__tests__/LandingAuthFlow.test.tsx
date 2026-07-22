import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import {
  clearSessionExpiredLoginNotice,
  markSessionExpiredLoginNotice,
} from '@/context/auth/session-expiry'
import LandingPage from '@/pages/Landing'
import {
  createLoggedOutTestAuthContext,
  createTestAuthContext,
  createTestCapabilities,
} from '@/test-utils/auth'

const mockNavigate = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...(actual as object),
    useNavigate: () => mockNavigate,
  }
})

vi.mock('@/context/auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)

const renderPage = () => {
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Landing auth flow smoke', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearSessionExpiredLoginNotice()

    mockedUseAuth.mockReturnValue(
      createLoggedOutTestAuthContext({
        defaultRoute: '/provincial/application',
      }),
    )
  })

  it('runs IDIR login action from the landing entry button', async () => {
    const login = vi.fn().mockResolvedValue(undefined)
    mockedUseAuth.mockReturnValue(
      createLoggedOutTestAuthContext({
        defaultRoute: '/provincial/application',
        login,
      }),
    )

    renderPage()

    expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'false')
    expect(screen.getByRole('heading', { name: 'Welcome to LEXIS' })).toBeInTheDocument()
    expect(
      screen.getByText('Create and manage applications, view offers and permits'),
    ).toBeInTheDocument()

    const loginButton = screen.getByRole('button', { name: 'Log in with IDIR' })
    await userEvent.click(loginButton)

    expect(login).toHaveBeenCalledWith('idir')
    expect(
      screen.queryByRole('button', { name: 'Continue to Application' }),
    ).not.toBeInTheDocument()
  })

  it('shows the signed-out notice after an automatic session expiry', () => {
    markSessionExpiredLoginNotice()

    renderPage()

    expect(screen.getByText('You’ve been logged out')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Your session expired for security reasons and any unsaved changes were lost. Log in again to continue.',
      ),
    ).toBeInTheDocument()
  })

  it('runs Business BCeID login action from the landing entry button', async () => {
    const login = vi.fn().mockResolvedValue(undefined)
    mockedUseAuth.mockReturnValue(
      createLoggedOutTestAuthContext({
        defaultRoute: '/provincial/application',
        login,
      }),
    )

    renderPage()

    const loginButton = screen.getByRole('button', { name: 'Log in with Business BCeID' })
    expect(loginButton).toHaveClass('cds--btn--tertiary')
    await userEvent.click(loginButton)

    expect(login).toHaveBeenCalledWith('business-bceid')
  })

  it('redirects logged in users to the default route without exposing session details', async () => {
    const login = vi.fn().mockResolvedValue(undefined)
    const refresh = vi.fn().mockResolvedValue(undefined)

    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({
          authenticated: true,
          principal: 'idir\\analyst',
          roles: ['PROVINCIAL_SUBMITTER_00012345'],
          welcomeTarget: '/applicationSearch',
          legacyPath: null,
          grantedActions: ['/applicationSearch'],
        }),
        defaultRoute: '/provincial/application',
        isLoggedIn: true,
        hasAnyRole: true,
        login,
        refresh,
        canPerform: vi.fn().mockReturnValue(true),
      }),
    )

    renderPage()

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/provincial/application', { replace: true })
    })

    expect(screen.queryByText('idir\\analyst')).not.toBeInTheDocument()
    expect(screen.queryByText('PROVINCIAL_SUBMITTER_00012345')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Refresh Session' })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Continue to Application' }),
    ).not.toBeInTheDocument()
    expect(refresh).not.toHaveBeenCalled()
  })

  it('surfaces inline error when login initiation fails', async () => {
    mockedUseAuth.mockReturnValue(
      createLoggedOutTestAuthContext({
        defaultRoute: '/provincial/application',
        login: vi.fn().mockRejectedValue(new Error('boom')),
      }),
    )

    renderPage()

    await userEvent.click(screen.getByRole('button', { name: 'Log in with IDIR' }))

    await waitFor(() => {
      expect(screen.getByText('Session error')).toBeInTheDocument()
      expect(screen.getByText('Unable to start the login flow.')).toBeInTheDocument()
    })
  })
})
