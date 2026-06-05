import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Layout from '@/components/Layout'
import { useAuth } from '@/context/auth/useAuth'

vi.mock('@/context/auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)

const renderLayout = (path: string) => {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Layout>
        <h1>Current page content</h1>
      </Layout>
    </MemoryRouter>,
  )
}

describe('Layout shell', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockedUseAuth.mockReturnValue({
      capabilities: {
        authenticated: true,
        principal: 'idir\\admin',
        roles: ['ADMIN'],
        welcomeTarget: '/admin',
        legacyPath: null,
        grantedActions: [],
      },
      defaultRoute: '/admin',
      canPerform: vi.fn().mockReturnValue(true),
      logout: vi.fn().mockResolvedValue(undefined),
    } as any)
  })

  it('marks only the exact side-nav route as active', () => {
    renderLayout('/admin/uploads')

    const adminLink = screen.getByRole('link', { name: 'LEXIS Administration' })
    const uploadsLink = screen.getByRole('link', { name: 'Upload Center' })
    const activeLinks = document.querySelectorAll('.csp-side-nav__link.cds--side-nav__link--active')

    expect(activeLinks).toHaveLength(1)
    expect(uploadsLink).toHaveClass('cds--side-nav__link--active')
    expect(uploadsLink).toHaveAttribute('aria-current', 'page')
    expect(adminLink).not.toHaveClass('cds--side-nav__link--active')
    expect(adminLink).not.toHaveAttribute('aria-current')
  })
})
