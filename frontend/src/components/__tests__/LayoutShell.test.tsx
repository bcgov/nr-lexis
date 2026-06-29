import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Layout from '../Layout'
import { useAuth } from '@/context/auth/useAuth'
import type { LexisSessionCapabilities } from '@/interfaces/LexisSession'
import { createTestAuthContext, createTestCapabilities } from '@/test-utils/auth'

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

    mockedUseAuth.mockReturnValue(createTestAuthContext())
  })

  it('marks only the exact side-nav route as active', () => {
    renderLayout('/admin/uploads')

    const adminLink = screen.getByRole('link', { name: /LEXIS administration/i })
    const uploadsLink = screen.getByRole('link', { name: /Data upload/i })
    const activeLinks = document.querySelectorAll('.csp-side-nav__link.cds--side-nav__link--active')

    expect(document.querySelector('.page-header__eyebrow')).toHaveTextContent('Administration')
    expect(activeLinks).toHaveLength(1)
    expect(uploadsLink).toHaveClass('cds--side-nav__link--active')
    expect(uploadsLink).toHaveAttribute('aria-current', 'page')
    expect(adminLink).not.toHaveClass('cds--side-nav__link--active')
    expect(adminLink).not.toHaveAttribute('aria-current')
  })

  it('renders split admin side-nav areas with distinct active routes', () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({
          grantedActions: ['/lexisAgentAdmin', '/lexisPolicyAdmin', '/lexisFILAdmin'],
        }),
        canPerform: (action: string) =>
          ['/lexisAgentAdmin', '/lexisPolicyAdmin', '/lexisFILAdmin'].includes(action),
      }),
    )

    renderLayout('/admin/schedules')

    const feePolicyLink = screen.getByRole('link', { name: /Fee policy administration/i })
    const filPolicyLink = screen.getByRole('link', {
      name: /Fee in lieu percent administration/i,
    })
    const scheduleLink = screen.getByRole('link', {
      name: /Export schedule administration/i,
    })
    const averageMonthlyValuesLink = screen.getByRole('link', {
      name: /Average Monthly Values/i,
    })

    expect(feePolicyLink).toHaveAttribute('href', '/admin/policies/fee')
    expect(filPolicyLink).toHaveAttribute('href', '/admin/policies/fil')
    expect(scheduleLink).toHaveAttribute('href', '/admin/schedules')
    expect(averageMonthlyValuesLink).toHaveAttribute('href', '/admin/rtm/emslogamv')
    expect(scheduleLink).toHaveClass('cds--side-nav__link--active')
    expect(scheduleLink).toHaveAttribute('aria-current', 'page')
    expect(feePolicyLink).not.toHaveClass('cds--side-nav__link--active')
    expect(filPolicyLink).not.toHaveClass('cds--side-nav__link--active')
    expect(averageMonthlyValuesLink).not.toHaveClass('cds--side-nav__link--active')
  })

  it('renders side-nav links with standard icons and collapsed labels', () => {
    renderLayout('/admin/uploads')

    const sideNav = screen.getByRole('navigation', { name: 'Side navigation' })

    expect(screen.queryByRole('link', { name: 'Dashboard' })).not.toBeInTheDocument()
    expect(screen.queryByText('Indian reserve')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Create\/edit permit/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Advertising List (PDF)' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Advertising List (CSV)' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Help/i })).not.toBeInTheDocument()
    const uploadLinks = screen.getAllByRole('link', { name: /Upload application submission/i })
    expect(uploadLinks.map((link) => link.getAttribute('href'))).toEqual([
      '/provincial/application/upload',
      '/federal/application/upload',
    ])
    expect(screen.getByRole('link', { name: /LEXIS administration/i })).toBeVisible()
    expect(screen.getByRole('link', { name: /Data upload/i })).toBeVisible()
    const navLinks = sideNav.querySelectorAll('.csp-side-nav__link')
    const navIcons = sideNav.querySelectorAll('.csp-side-nav__link .csp-side-nav__icon svg')
    expect(navIcons).toHaveLength(navLinks.length)
    expect(screen.getByRole('link', { name: /Data upload/i })).toHaveAttribute(
      'data-label',
      'Data upload',
    )
  })

  it('navigates the app name to the resolved default route', async () => {
    renderLayout('/admin/uploads')

    expect(screen.queryByRole('link', { name: 'Dashboard' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Go to your landing page' }))

    expect(screen.getByTestId('current-path')).toHaveTextContent('/admin')
  })

  it('lets pages own the only visible page title', () => {
    renderLayout('/admin/uploads')

    expect(document.querySelector('.page-header__title')).not.toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { name: 'Current page content', level: 1 })).toBeVisible()
  })

  it('hides create links when the role only has search access', () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({
          principal: 'idir\\readonly',
          roles: ['READ_ONLY'],
          welcomeTarget: '/provincial/application',
          grantedActions: [],
        }),
        defaultRoute: '/provincial/application',
        canPerform: (action: string) =>
          ['/applicationSearch', '/exemptionSearch', '/offersSearch'].includes(action),
      }),
    )

    renderLayout('/provincial/application')

    expect(screen.getByRole('link', { name: /Application search/i })).toBeVisible()
    expect(screen.getByRole('link', { name: /Exemption search/i })).toBeVisible()
    expect(screen.getByRole('link', { name: /Offer search/i })).toBeVisible()
    expect(
      screen.queryByRole('link', { name: /Create\/edit application/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: /Upload application submission/i }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Create\/edit exemption/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Create\/edit offer/i })).not.toBeInTheDocument()
  })

  it('renders navigation when an auth mock omits roles', () => {
    const capabilitiesWithoutRoles = {
      authenticated: true,
      principal: 'idir\\partial',
      welcomeTarget: '/reports',
      legacyPath: null,
      grantedActions: ['/applicationReport'],
    } as LexisSessionCapabilities

    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: capabilitiesWithoutRoles,
        defaultRoute: '/reports',
        canPerform: (action: string) => action === '/applicationReport',
      }),
    )

    renderLayout('/reports')

    expect(screen.getByRole('navigation', { name: 'Side navigation' })).toBeVisible()
    expect(screen.getByRole('link', { name: /Reports menu/i })).toBeVisible()
  })

  it('shows application submission upload without exposing generic data upload', () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({
          principal: 'bceid\\submitter',
          roles: ['PROVINCIAL_SUBMITTER'],
          welcomeTarget: '/provincial/application/upload',
          grantedActions: ['uploadApplicationSubmission'],
        }),
        defaultRoute: '/provincial/application/upload',
        canPerform: (action: string) => action === 'uploadApplicationSubmission',
      }),
    )

    renderLayout('/provincial/application/upload')

    expect(screen.getByRole('link', { name: /Upload application submission/i })).toBeVisible()
    expect(
      screen.queryByRole('link', { name: /Create\/edit application/i }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Data upload/i })).not.toBeInTheDocument()
  })

  it('shows federal application submission upload in the federal nav for federal-only users', () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({
          principal: 'bceid\\federal',
          roles: ['FEDERAL_SUBMITTER'],
          welcomeTarget: '/federal/application/upload',
          grantedActions: [
            '/federalApplicationSearch',
            'viewFederalApplication',
            'uploadApplicationSubmission',
          ],
        }),
        defaultRoute: '/federal/application/upload',
        canPerform: (action: string) =>
          [
            '/federalApplicationSearch',
            'viewFederalApplication',
            'uploadApplicationSubmission',
          ].includes(action),
      }),
    )

    renderLayout('/federal/application/upload')

    expect(document.querySelector('.page-header__eyebrow')).toHaveTextContent('Federal')
    expect(screen.getByRole('link', { name: /Application search/i })).toBeVisible()
    expect(screen.getByRole('link', { name: /Upload application submission/i })).toHaveAttribute(
      'href',
      '/federal/application/upload',
    )
    expect(screen.queryByText('Provincial')).not.toBeInTheDocument()
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
