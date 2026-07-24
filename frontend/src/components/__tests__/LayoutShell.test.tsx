import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Layout from '../Layout'
import { useAuth } from '@/context/auth/useAuth'
import type { LexisSessionCapabilities } from '@/interfaces/LexisSession'
import { createTestAuthContext, createTestCapabilities } from '@/test-utils/auth'

vi.mock('@/context/auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)
const THEME_PREFERENCE_KEY = 'lexis.ui.theme'
const SIDE_NAV_PREFERENCE_KEY = 'lexis.ui.sideNavCollapsed'
const COLLAPSED_SECTIONS_PREFERENCE_KEY = 'lexis.ui.collapsedSections'
const NOTIFICATION_REGION_ID = 'lexis-toast-notification-region'

const mockMobileViewport = (): void => {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string): MediaQueryList => ({
      matches: query === '(max-width: 671px)',
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
    }),
  )
}

const LocationProbe = () => {
  const location = useLocation()

  return <span data-testid="current-path">{location.pathname}</span>
}

const renderLayout = (path: string) => {
  return render(
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
    vi.restoreAllMocks()
    vi.clearAllMocks()
    window.localStorage.clear()
    window.config = {}
    document.documentElement.removeAttribute('data-carbon-theme')
    document.getElementById(NOTIFICATION_REGION_ID)?.remove()

    mockedUseAuth.mockReturnValue(createTestAuthContext())
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    window.localStorage.clear()
    document.documentElement.removeAttribute('data-carbon-theme')
    document.getElementById(NOTIFICATION_REGION_ID)?.remove()
  })

  it('uses and persists public-safe defaults when no preferences exist', () => {
    renderLayout('/admin/rtm/emslogamv')

    const themeSwitch = screen.getByRole('switch', { name: 'Toggle dark mode' })
    expect(themeSwitch).toHaveAttribute('aria-checked', 'false')
    expect(document.querySelector('.csp-header-theme-toggle')).toHaveTextContent('')
    expect(themeSwitch.querySelector('.csp-theme-switch__thumb svg')).toBeInTheDocument()
    expect(document.documentElement).toHaveAttribute('data-carbon-theme', 'white')
    expect(document.querySelector('.app-shell')).not.toHaveClass('is-side-nav-collapsed')
    expect(screen.getByRole('button', { name: 'Reports' })).toHaveAttribute('aria-expanded', 'true')
    expect(window.localStorage.getItem(THEME_PREFERENCE_KEY)).toBe('white')
    expect(window.localStorage.getItem(SIDE_NAV_PREFERENCE_KEY)).toBe('false')
    expect(window.localStorage.getItem(COLLAPSED_SECTIONS_PREFERENCE_KEY)).toBe('{}')
  })

  it('restores persisted theme, side-nav, and collapsed sections', async () => {
    window.localStorage.setItem(THEME_PREFERENCE_KEY, 'g100')
    window.localStorage.setItem(SIDE_NAV_PREFERENCE_KEY, 'true')
    window.localStorage.setItem(
      COLLAPSED_SECTIONS_PREFERENCE_KEY,
      JSON.stringify({ Reports: true }),
    )

    renderLayout('/admin/rtm/emslogamv')

    expect(screen.getByRole('switch', { name: 'Toggle dark mode' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(document.documentElement).toHaveAttribute('data-carbon-theme', 'g100')
    expect(document.querySelector('.app-shell')).toHaveClass('is-side-nav-collapsed')
    expect(document.getElementById(NOTIFICATION_REGION_ID)).toHaveClass('cds--g100')

    await userEvent.click(screen.getByRole('button', { name: 'Expand side navigation' }))

    expect(screen.getByRole('button', { name: 'Reports' })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
    expect(screen.queryByRole('link', { name: /Advertising List/i })).not.toBeInTheDocument()
  })

  it('persists preference updates without storing auth or user data', async () => {
    renderLayout('/admin/rtm/emslogamv')

    await userEvent.click(screen.getByRole('button', { name: 'Reports' }))
    await userEvent.click(screen.getByRole('switch', { name: 'Toggle dark mode' }))
    await userEvent.click(screen.getByRole('button', { name: 'Collapse side navigation' }))

    expect(window.localStorage.getItem(THEME_PREFERENCE_KEY)).toBe('g100')
    expect(window.localStorage.getItem(SIDE_NAV_PREFERENCE_KEY)).toBe('true')
    expect(
      JSON.parse(window.localStorage.getItem(COLLAPSED_SECTIONS_PREFERENCE_KEY) ?? '{}'),
    ).toEqual({ Reports: true })
    const storedKeys = Array.from({ length: window.localStorage.length }, (_, index) =>
      window.localStorage.key(index),
    ).sort()
    expect(storedKeys).toEqual(
      [THEME_PREFERENCE_KEY, SIDE_NAV_PREFERENCE_KEY, COLLAPSED_SECTIONS_PREFERENCE_KEY].sort(),
    )
  })

  it('falls back to defaults for malformed preference values', () => {
    window.localStorage.setItem(THEME_PREFERENCE_KEY, 'dark')
    window.localStorage.setItem(SIDE_NAV_PREFERENCE_KEY, 'collapsed')
    window.localStorage.setItem(COLLAPSED_SECTIONS_PREFERENCE_KEY, '{not-json')

    expect(() => renderLayout('/admin/rtm/emslogamv')).not.toThrow()

    expect(screen.getByRole('switch', { name: 'Toggle dark mode' })).toHaveAttribute(
      'aria-checked',
      'false',
    )
    expect(document.documentElement).toHaveAttribute('data-carbon-theme', 'white')
    expect(document.querySelector('.app-shell')).not.toHaveClass('is-side-nav-collapsed')
    expect(screen.getByRole('button', { name: 'Reports' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('continues with in-memory preferences when local storage fails', async () => {
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('Storage unavailable')
    })
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('Storage unavailable')
    })

    expect(() => renderLayout('/admin/rtm/emslogamv')).not.toThrow()

    await userEvent.click(screen.getByRole('switch', { name: 'Toggle dark mode' }))
    await userEvent.click(screen.getByRole('button', { name: 'Reports' }))
    await userEvent.click(screen.getByRole('button', { name: 'Collapse side navigation' }))

    expect(screen.getByRole('switch', { name: 'Toggle dark mode' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(document.documentElement).toHaveAttribute('data-carbon-theme', 'g100')
    expect(document.querySelector('.app-shell')).toHaveClass('is-side-nav-collapsed')
  })

  it('restores the root theme on unmount and does not leak cleared preferences', async () => {
    document.documentElement.setAttribute('data-carbon-theme', 'g90')
    const firstRender = renderLayout('/admin/rtm/emslogamv')

    await userEvent.click(screen.getByRole('switch', { name: 'Toggle dark mode' }))
    expect(document.documentElement).toHaveAttribute('data-carbon-theme', 'g100')

    firstRender.unmount()

    expect(document.documentElement).toHaveAttribute('data-carbon-theme', 'g90')

    window.localStorage.clear()
    const secondRender = renderLayout('/admin/rtm/emslogamv')

    expect(screen.getByRole('switch', { name: 'Toggle dark mode' })).toHaveAttribute(
      'aria-checked',
      'false',
    )
    expect(document.documentElement).toHaveAttribute('data-carbon-theme', 'white')

    secondRender.unmount()
    expect(document.documentElement).toHaveAttribute('data-carbon-theme', 'g90')
  })

  it('marks only the exact side-nav route as active', () => {
    renderLayout('/admin/rtm/emslogamv')

    const adminLink = screen.getByRole('link', { name: /Users & Access/i })
    const averageMonthlyValuesLink = screen.getByRole('link', {
      name: /Average Monthly Values/i,
    })
    const activeLinks = document.querySelectorAll('.csp-side-nav__link.cds--side-nav__link--active')

    expect(document.querySelector('.page-header__eyebrow')).not.toBeInTheDocument()
    expect(activeLinks).toHaveLength(1)
    expect(averageMonthlyValuesLink).toHaveClass('cds--side-nav__link--active')
    expect(averageMonthlyValuesLink).toHaveAttribute('aria-current', 'page')
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

    const feePolicyLink = screen.getByRole('link', { name: /Fee Policy/i })
    const filPolicyLink = screen.getByRole('link', {
      name: /Fee in Lieu/i,
    })
    const scheduleLink = screen.getByRole('link', {
      name: /Export Schedule/i,
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

  it('shows only the RTM navigation link when PROD RTM-only mode is enabled', () => {
    window.config = { VITE_LEXIS_PROD_RTM_ONLY: 'true' }
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        defaultRoute: '/admin/rtm/emslogamv',
        canPerform: (action: string) => action === '/lexisAgentAdmin',
      }),
    )

    renderLayout('/admin/rtm/emslogamv')

    expect(screen.getByRole('link', { name: /Average Monthly Values/i })).toHaveAttribute(
      'href',
      '/admin/rtm/emslogamv',
    )
    expect(screen.queryByRole('link', { name: /Users & Access/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /^Uploads$/i })).not.toBeInTheDocument()
    expect(screen.queryByText('Provincial')).not.toBeInTheDocument()
    expect(screen.queryByText('Federal')).not.toBeInTheDocument()
    expect(screen.queryByText('Reports')).not.toBeInTheDocument()
  })

  it('renders side-nav links with standard icons and collapsed labels', () => {
    renderLayout('/admin/rtm/emslogamv')

    const sideNav = screen.getByRole('navigation', { name: 'Side navigation' })

    expect(screen.queryByRole('link', { name: 'Dashboard' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Create\/edit permit/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Advertising List (PDF)' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Advertising List (CSV)' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Help/i })).not.toBeInTheDocument()
    const uploadLinks = screen.getAllByRole('link', { name: /^Upload$/i })
    expect(uploadLinks.map((link) => link.getAttribute('href'))).toEqual([
      '/provincial/application/upload',
    ])
    expect(screen.getByRole('link', { name: /Users & Access/i })).toBeVisible()
    expect(screen.queryByRole('link', { name: /^Uploads$/i })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Average Monthly Values/i })).toBeVisible()
    const navLinks = sideNav.querySelectorAll('.csp-side-nav__link')
    const navIcons = sideNav.querySelectorAll('.csp-side-nav__link .csp-side-nav__icon svg')
    expect(navIcons).toHaveLength(navLinks.length)
    expect(screen.getByRole('link', { name: /Average Monthly Values/i })).toHaveAttribute(
      'data-label',
      'Average Monthly Values',
    )
  })

  it('navigates the app name to the resolved default route', async () => {
    renderLayout('/admin/rtm/emslogamv')

    expect(screen.queryByRole('link', { name: 'Dashboard' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Go to your landing page' }))

    expect(screen.getByTestId('current-path')).toHaveTextContent('/admin')
  })

  it('lets pages own the only visible page title', () => {
    renderLayout('/admin/rtm/emslogamv')

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

    expect(screen.getByRole('link', { name: /Applications/i })).toBeVisible()
    expect(screen.getByRole('link', { name: /Exemptions/i })).toBeVisible()
    expect(screen.getByRole('link', { name: /^Offers$/i })).toBeVisible()
    expect(
      screen.queryByRole('link', { name: /Create\/Edit Application/i }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /^Upload$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Create\/Edit Exemption/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Create\/Edit Offer/i })).not.toBeInTheDocument()
  })

  it('renders legacy report navigation when an auth mock omits roles', () => {
    const capabilitiesWithoutRoles = {
      authenticated: true,
      principal: 'idir\\partial',
      welcomeTarget: '/reports',
      legacyPath: null,
      grantedActions: ['/applicationReport', 'mofrListing'],
      forestClientNumber: null,
    } as LexisSessionCapabilities

    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: capabilitiesWithoutRoles,
        defaultRoute: '/reports',
        canPerform: (action: string) => ['/applicationReport', 'mofrListing'].includes(action),
      }),
    )

    renderLayout('/reports')

    expect(screen.getByRole('navigation', { name: 'Side navigation' })).toBeVisible()
    expect(screen.getByRole('link', { name: /Advertising List/i })).toHaveAttribute(
      'href',
      '/reports/biweeklyListing',
    )
    expect(screen.queryByRole('link', { name: /Applications Report/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /^Menu$/i })).not.toBeInTheDocument()
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

    expect(screen.getByRole('link', { name: /^Upload$/i })).toBeVisible()
    expect(
      screen.queryByRole('link', { name: /Create\/Edit Application/i }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /^Uploads$/i })).not.toBeInTheDocument()
  })

  it('shows federal search when federal read actions are granted', () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({
          principal: 'idir\\federal-reader',
          roles: ['LEXIS_ADMIN'],
          welcomeTarget: '/federal',
          grantedActions: ['/federalApplicationSearch', 'viewFederalApplication'],
        }),
        defaultRoute: '/federal',
        canPerform: (action: string) =>
          ['/federalApplicationSearch', 'viewFederalApplication'].includes(action),
      }),
    )

    renderLayout('/federal')

    expect(document.querySelector('.page-header__eyebrow')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /^Search$/i })).toBeVisible()
    expect(screen.queryByRole('link', { name: /^Upload$/i })).not.toBeInTheDocument()
  })

  it('supports collapsing and expanding side-nav sections', async () => {
    renderLayout('/admin/rtm/emslogamv')

    expect(screen.getByRole('link', { name: /Advertising List/i })).toBeVisible()

    await userEvent.click(screen.getByRole('button', { name: 'Reports' }))

    expect(screen.getByRole('button', { name: 'Reports' })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
    expect(screen.queryByRole('link', { name: /Advertising List/i })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Average Monthly Values/i })).toBeVisible()

    await userEvent.click(screen.getByRole('button', { name: 'Reports' }))

    expect(screen.getByRole('button', { name: 'Reports' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('link', { name: /Advertising List/i })).toBeVisible()
  })

  it('keeps section links available as icons when the full side nav is collapsed', async () => {
    renderLayout('/admin/rtm/emslogamv')

    await userEvent.click(screen.getByRole('button', { name: 'Reports' }))
    expect(screen.queryByRole('link', { name: /Advertising List/i })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Collapse side navigation' }))

    expect(screen.getByRole('link', { name: /Advertising List/i })).toBeVisible()
  })

  it('defaults the side nav open and supports collapsing it', async () => {
    renderLayout('/admin/rtm/emslogamv')

    const shell = document.querySelector('.app-shell')
    const sideNav = screen.getByRole('navigation', { name: 'Side navigation' })
    const collapseButton = screen.getByRole('button', { name: 'Collapse side navigation' })

    expect(shell).not.toHaveClass('is-side-nav-collapsed')
    expect(sideNav).not.toHaveClass('is-collapsed')
    expect(collapseButton).toHaveAttribute('aria-controls', 'side-navigation-list')
    expect(collapseButton).not.toHaveAttribute('aria-expanded')

    await userEvent.click(collapseButton)

    expect(shell).toHaveClass('is-side-nav-collapsed')
    expect(sideNav).toHaveClass('is-collapsed')
    expect(screen.getByRole('button', { name: 'Expand side navigation' })).not.toHaveAttribute(
      'aria-expanded',
    )
  })

  it('dismisses the profile panel when clicking outside it', async () => {
    renderLayout('/admin/rtm/emslogamv')

    const profileToggle = screen.getByRole('button', { name: 'Open profile panel' })
    await userEvent.click(profileToggle)

    expect(profileToggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('dialog', { name: 'Profile' })).toHaveClass('is-open')

    await userEvent.click(screen.getByRole('heading', { name: 'Current page content' }))

    expect(profileToggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('dialog', { name: 'Profile' })).not.toHaveClass('is-open')
  })

  it('keeps the persisted desktop preference separate from the closed mobile drawer', async () => {
    mockMobileViewport()
    window.localStorage.setItem(SIDE_NAV_PREFERENCE_KEY, 'true')
    renderLayout('/admin/rtm/emslogamv')

    const sideNav = document.getElementById('side-navigation')
    const mainContent = document.getElementById('main-content')
    const openMenuButton = screen.getByRole('button', { name: 'Open navigation menu' })

    expect(document.querySelector('.app-shell')).not.toHaveClass('is-side-nav-collapsed')
    expect(openMenuButton).toHaveAttribute('aria-expanded', 'false')
    expect(openMenuButton).toHaveAttribute('aria-controls', 'side-navigation')
    expect(sideNav).toHaveAttribute('aria-hidden', 'true')
    expect(sideNav).toHaveAttribute('inert')
    expect(window.localStorage.getItem(SIDE_NAV_PREFERENCE_KEY)).toBe('true')

    await userEvent.click(openMenuButton)

    expect(screen.getByRole('button', { name: 'Close navigation menu' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    expect(sideNav).toHaveClass('is-mobile-open')
    expect(sideNav).not.toHaveAttribute('aria-hidden')
    expect(sideNav).not.toHaveAttribute('inert')
    expect(mainContent).toHaveAttribute('aria-hidden', 'true')
    expect(mainContent).toHaveAttribute('inert')
    expect(screen.getByRole('button', { name: 'Dismiss navigation menu' })).toBeInTheDocument()
    expect(window.localStorage.getItem(SIDE_NAV_PREFERENCE_KEY)).toBe('true')

    await userEvent.click(screen.getByRole('button', { name: 'Close navigation menu' }))

    expect(screen.getByRole('button', { name: 'Open navigation menu' })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
    expect(sideNav).not.toHaveClass('is-mobile-open')
    expect(mainContent).not.toHaveAttribute('aria-hidden')
    expect(mainContent).not.toHaveAttribute('inert')
    expect(
      screen.queryByRole('button', { name: 'Dismiss navigation menu' }),
    ).not.toBeInTheDocument()
  })

  it('supports Escape and navigation-link dismissal for the mobile drawer', async () => {
    mockMobileViewport()
    renderLayout('/admin/rtm/emslogamv')

    await userEvent.click(screen.getByRole('button', { name: 'Open navigation menu' }))
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /^Review$/i })).toHaveFocus()
    })

    await userEvent.keyboard('{Escape}')

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Open navigation menu' })).toHaveFocus()
    })
    expect(document.getElementById('side-navigation')).not.toHaveClass('is-mobile-open')

    await userEvent.click(screen.getByRole('button', { name: 'Open navigation menu' }))
    await userEvent.click(screen.getByRole('link', { name: /^Applications$/i }))

    expect(screen.getByTestId('current-path')).toHaveTextContent('/provincial/application')
    expect(screen.getByRole('button', { name: 'Open navigation menu' })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
    expect(document.getElementById('side-navigation')).not.toHaveClass('is-mobile-open')
  })
})
