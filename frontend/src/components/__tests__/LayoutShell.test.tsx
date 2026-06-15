import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Layout from '@/components/Layout'
import { useAuth } from '@/context/auth/useAuth'

vi.mock('@/context/auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)

const LocationProbe = () => {
  const location = useLocation()

  return <span data-testid="current-path">{location.pathname}</span>
}

const renderLayout = (path: string) => {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Layout>
        <h1>Current page content</h1>
      </Layout>
      <LocationProbe />
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
    const uploadsLink = screen.getByRole('link', { name: 'Data Upload' })
    const activeLinks = document.querySelectorAll('.csp-side-nav__link.cds--side-nav__link--active')

    expect(document.querySelector('.page-header__eyebrow')).toHaveTextContent('Administration')
    expect(activeLinks).toHaveLength(1)
    expect(uploadsLink).toHaveClass('cds--side-nav__link--active')
    expect(uploadsLink).toHaveAttribute('aria-current', 'page')
    expect(adminLink).not.toHaveClass('cds--side-nav__link--active')
    expect(adminLink).not.toHaveAttribute('aria-current')
  })

  it('renders side-nav links as text without repeated search icons', () => {
    renderLayout('/admin/uploads')

    const sideNav = screen.getByRole('navigation', { name: 'Side navigation' })

    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'LEXIS Administration' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Data Upload' })).toBeVisible()
    expect(document.querySelector('.csp-side-nav__icon')).not.toBeInTheDocument()
    expect(sideNav.querySelector('.csp-side-nav__link svg')).not.toBeInTheDocument()
  })

  it('navigates the app name to the dashboard', async () => {
    renderLayout('/admin/uploads')

    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/dashboard')

    await userEvent.click(screen.getByRole('button', { name: 'Go to LEXIS dashboard' }))

    expect(screen.getByTestId('current-path')).toHaveTextContent('/dashboard')
  })

  it('lets pages own the only visible page title', () => {
    renderLayout('/admin/uploads')

    expect(document.querySelector('.page-header__title')).not.toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { name: 'Current page content', level: 1 })).toBeVisible()
  })

  it('hides create links when the role only has search access', () => {
    mockedUseAuth.mockReturnValue({
      capabilities: {
        authenticated: true,
        principal: 'idir\\readonly',
        roles: ['READ_ONLY'],
        welcomeTarget: '/provincial/application',
        legacyPath: null,
        grantedActions: [],
      },
      defaultRoute: '/provincial/application',
      canPerform: (action: string) =>
        ['/applicationSearch', '/exemptionSearch', '/offersSearch'].includes(action),
      logout: vi.fn().mockResolvedValue(undefined),
    } as any)

    renderLayout('/provincial/application')

    expect(screen.getByRole('link', { name: 'Application Search' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Exemption Search' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Offer Search' })).toBeVisible()
    expect(screen.queryByRole('link', { name: 'Create/Edit Application' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Create/Edit Exemption' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Create/Edit Offer' })).not.toBeInTheDocument()
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
