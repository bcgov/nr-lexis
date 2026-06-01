import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import LandingPage from '@/pages/Landing'

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

    mockedUseAuth.mockReturnValue({
      capabilities: {
        authenticated: false,
        principal: null,
        roles: [],
        welcomeTarget: null,
        legacyPath: null,
        grantedActions: [],
      },
      defaultRoute: '/provincial/summary',
      isLoading: false,
      isLoggedIn: false,
      hasAnyRole: false,
      usesExternalLogin: true,
      login: vi.fn().mockResolvedValue(undefined),
      refresh: vi.fn().mockResolvedValue(undefined),
      logout: vi.fn().mockResolvedValue(undefined),
      canPerform: vi.fn().mockReturnValue(false),
    })
  })

  it('runs login action from the landing entry button', async () => {
    const login = vi.fn().mockResolvedValue(undefined)
    mockedUseAuth.mockReturnValue({
      capabilities: {
        authenticated: false,
        principal: null,
        roles: [],
        welcomeTarget: null,
        legacyPath: null,
        grantedActions: [],
      },
      defaultRoute: '/provincial/summary',
      isLoading: false,
      isLoggedIn: false,
      hasAnyRole: false,
      usesExternalLogin: true,
      login,
      refresh: vi.fn().mockResolvedValue(undefined),
      logout: vi.fn().mockResolvedValue(undefined),
      canPerform: vi.fn().mockReturnValue(false),
    })

    renderPage()

    const loginButton = screen.getByRole('button', { name: 'Log in with IDIR' })
    await userEvent.click(loginButton)

    expect(login).toHaveBeenCalledTimes(1)
    expect(
      screen.queryByRole('button', { name: 'Continue to Application' }),
    ).not.toBeInTheDocument()
  })

  it('shows session claims and navigates to default route when logged in', async () => {
    const login = vi.fn().mockResolvedValue(undefined)
    const refresh = vi.fn().mockResolvedValue(undefined)

    mockedUseAuth.mockReturnValue({
      capabilities: {
        authenticated: true,
        principal: 'idir\\analyst',
        roles: ['PROVINCIAL_SUBMITTER_00012345'],
        welcomeTarget: '/summary',
        legacyPath: null,
        grantedActions: ['/summary', '/applicationSearch'],
      },
      defaultRoute: '/provincial/summary',
      isLoading: false,
      isLoggedIn: true,
      hasAnyRole: true,
      usesExternalLogin: true,
      login,
      refresh,
      logout: vi.fn().mockResolvedValue(undefined),
      canPerform: vi.fn().mockReturnValue(true),
    })

    renderPage()

    expect(screen.getByText('idir\\analyst')).toBeInTheDocument()
    expect(screen.getByText('PROVINCIAL_SUBMITTER_00012345')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Continue to Application' }))
    expect(mockNavigate).toHaveBeenCalledWith('/provincial/summary')

    await userEvent.click(screen.getByRole('button', { name: 'Refresh Session' }))
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('surfaces inline error when login initiation fails', async () => {
    mockedUseAuth.mockReturnValue({
      capabilities: {
        authenticated: false,
        principal: null,
        roles: [],
        welcomeTarget: null,
        legacyPath: null,
        grantedActions: [],
      },
      defaultRoute: '/provincial/summary',
      isLoading: false,
      isLoggedIn: false,
      hasAnyRole: false,
      usesExternalLogin: true,
      login: vi.fn().mockRejectedValue(new Error('boom')),
      refresh: vi.fn().mockResolvedValue(undefined),
      logout: vi.fn().mockResolvedValue(undefined),
      canPerform: vi.fn().mockReturnValue(false),
    })

    renderPage()

    await userEvent.click(screen.getByRole('button', { name: 'Log in with IDIR' }))

    await waitFor(() => {
      expect(screen.getByText('Session Error')).toBeInTheDocument()
      expect(screen.getByText('Unable to start the login flow.')).toBeInTheDocument()
    })
  })
})
