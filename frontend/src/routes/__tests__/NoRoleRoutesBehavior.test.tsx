import { render, screen } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import { getNoRoleRoutes } from '@/routes/routePaths'
import { createTestAuthContext, createTestCapabilities } from '@/test-utils/auth'

vi.mock('@/context/auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)

describe('No-role route behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({
          principal: 'idir\\norole',
          roles: [],
          welcomeTarget: '/unauthorized',
        }),
        hasAnyRole: false,
        defaultRoute: '/unauthorized',
        canPerform: vi.fn().mockReturnValue(false),
      }),
    )
  })

  it('redirects unknown routes to unauthorized page when no-role routes are active', async () => {
    const router = createMemoryRouter(getNoRoleRoutes(), {
      initialEntries: ['/provincial/application'],
    })

    render(<RouterProvider router={router} />)

    expect(await screen.findByRole('heading', { name: 'Unauthorized' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/unauthorized')
  })
})
