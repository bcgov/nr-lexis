import { render, screen } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import ThemeProvider from '@/context/theme/ThemeProvider'
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

    render(
      <ThemeProvider>
        <RouterProvider router={router} />
      </ThemeProvider>,
    )

    expect(await screen.findByRole('heading', { name: 'Access not granted' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/unauthorized')
    expect(document.querySelector('.app-shell')).not.toBeInTheDocument()
  })
})
