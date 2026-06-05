import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

    expect(document.querySelector('.page-header__title')).toHaveTextContent('Upload Center')
    expect(activeLinks).toHaveLength(1)
    expect(uploadsLink).toHaveClass('cds--side-nav__link--active')
    expect(uploadsLink).toHaveAttribute('aria-current', 'page')
    expect(adminLink).not.toHaveClass('cds--side-nav__link--active')
    expect(adminLink).not.toHaveAttribute('aria-current')
  })

  it('defaults the side nav open and supports collapsing it', async () => {
    renderLayout('/admin/uploads')

    const shell = document.querySelector('.app-shell')
    const sideNav = screen.getByRole('navigation', { name: 'Side navigation' })
    const collapseButton = screen.getByRole('button', { name: 'Collapse side navigation' })

    expect(shell).not.toHaveClass('is-side-nav-collapsed')
    expect(sideNav).not.toHaveClass('is-collapsed')
    expect(collapseButton).toHaveAttribute('aria-expanded', 'true')

    await userEvent.click(collapseButton)

    expect(shell).toHaveClass('is-side-nav-collapsed')
    expect(sideNav).toHaveClass('is-collapsed')
    expect(screen.getByRole('button', { name: 'Expand side navigation' })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
  })
})
