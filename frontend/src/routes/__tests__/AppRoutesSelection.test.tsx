import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AppRoutes from '@/routes/AppRoutes'

const mockUseAuth = vi.fn()

vi.mock('@/context/auth/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}))

vi.mock('@/pages/ForestClientSelection', () => ({
  default: () => <div>forest-client-selection</div>,
}))

vi.mock('@/routes/routePaths', () => ({
  getPublicRoutes: () => [
    {
      path: '*',
      element: <div>public-routes</div>,
    },
  ],
  getNoRoleRoutes: () => [
    {
      path: '*',
      element: <div>no-role-routes</div>,
    },
  ],
  getProtectedRoutes: () => [
    {
      path: '*',
      element: <div>protected-routes</div>,
    },
  ],
}))

describe('AppRoutes selection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses public routes when not logged in', async () => {
    mockUseAuth.mockReturnValue({
      isLoading: false,
      isLoggedIn: false,
      hasAnyRole: false,
      capabilities: {
        forestClientNumber: null,
        forestClientSelectionRequired: false,
      },
    })

    render(<AppRoutes />)

    expect(await screen.findByText('public-routes')).toBeInTheDocument()
  })

  it('uses no-role routes when logged in without roles', async () => {
    mockUseAuth.mockReturnValue({
      isLoading: false,
      isLoggedIn: true,
      hasAnyRole: false,
      capabilities: {
        forestClientNumber: null,
        forestClientSelectionRequired: false,
      },
    })

    render(<AppRoutes />)

    expect(await screen.findByText('no-role-routes')).toBeInTheDocument()
  })

  it('uses protected routes when logged in with role access', async () => {
    mockUseAuth.mockReturnValue({
      isLoading: false,
      isLoggedIn: true,
      hasAnyRole: true,
      capabilities: {
        forestClientNumber: null,
        forestClientSelectionRequired: false,
      },
    })

    render(<AppRoutes />)

    expect(await screen.findByText('protected-routes')).toBeInTheDocument()
  })

  it('renders only the session loader while authentication is loading', () => {
    mockUseAuth.mockReturnValue({
      isLoading: true,
      isLoggedIn: true,
      hasAnyRole: true,
      capabilities: {
        forestClientNumber: null,
        forestClientSelectionRequired: false,
      },
    })

    render(<AppRoutes />)

    expect(screen.getByRole('img', { name: 'Loading session…' })).toBeInTheDocument()
    expect(screen.queryByText('protected-routes')).not.toBeInTheDocument()
  })

  it('blocks protected routes until a multi-client user selects an organization', () => {
    mockUseAuth.mockReturnValue({
      isLoading: false,
      isLoggedIn: true,
      hasAnyRole: true,
      capabilities: {
        forestClientNumber: null,
        forestClientSelectionRequired: true,
      },
    })

    render(<AppRoutes />)

    expect(screen.getByText('forest-client-selection')).toBeInTheDocument()
    expect(screen.queryByText('protected-routes')).not.toBeInTheDocument()
  })
})
