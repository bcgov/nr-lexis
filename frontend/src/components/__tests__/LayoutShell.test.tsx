import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Layout from '../Layout'
import { useAuth } from '@/context/auth/useAuth'
import ThemeProvider from '@/context/theme/ThemeProvider'
import type { LexisSessionCapabilities } from '@/interfaces/LexisSession'
import { fetchUserPreferences, updateUserPreferences } from '@/service/user-preference-service'
import type { LexisNotification } from '@/interfaces/LexisNotification'
import { fetchNotifications } from '@/service/notification-service'
import { createTestAuthContext, createTestCapabilities } from '@/test-utils/auth'

vi.mock('@/context/auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/service/user-preference-service', () => ({
  DEFAULT_ZONE_OPTIONS: [
    { value: 'RCO', label: 'Coast (RCO)' },
    { value: 'RNI', label: 'Northern Interior (RNI)' },
    { value: 'RSI', label: 'Southern Interior (RSI)' },
  ],
  DEFAULT_ZONE_HELPER_TEXT: {
    RCO: 'Preselects the South Coast and West Coast Natural Resource Regions in search tables.',
    RNI: 'Preselects the Northeast, Omineca, and Skeena Natural Resource Regions in search tables.',
    RSI: 'Preselects the Cariboo, Kootenay-Boundary, and Thompson-Okanagan Natural Resource Regions in search tables.',
  },
  fetchUserPreferences: vi.fn(),
  updateUserPreferences: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)
const mockedFetchUserPreferences = vi.mocked(fetchUserPreferences)
const mockedUpdateUserPreferences = vi.mocked(updateUserPreferences)

vi.mock('@/service/notification-service', () => ({
  fetchNotifications: vi.fn(),
}))

const mockedFetchNotifications = vi.mocked(fetchNotifications)
const THEME_PREFERENCE_KEY = 'lexis.ui.theme'
const SIDE_NAV_PREFERENCE_KEY = 'lexis.ui.sideNavCollapsed'
const COLLAPSED_SECTIONS_PREFERENCE_KEY = 'lexis.ui.collapsedSections'
const NOTIFICATION_REGION_ID = 'lexis-toast-notification-region'
const activeNotification: LexisNotification = {
  id: 1,
  title: 'System update',
  contentHtml: '<p>System update</p>',
  notificationLevel: 'INFORMATION',
  displayStartDate: '2026-07-21',
  displayEndDate: '2026-07-28',
  createUser: 'IDIR\\ADMIN',
  createTimestamp: '2026-07-21T00:00:00',
  updateUserId: 'IDIR\\ADMIN',
  updateTimestamp: '2026-07-21T00:00:00',
  audienceRoles: [],
}

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
    <ThemeProvider>
      <MemoryRouter initialEntries={[path]}>
        <Layout>
          <h1>Current page content</h1>
        </Layout>
        <LocationProbe />
      </MemoryRouter>
    </ThemeProvider>,
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
    mockedFetchUserPreferences.mockResolvedValue({ defaultRegion: null })
    mockedUpdateUserPreferences.mockImplementation(async (defaultRegion) => ({ defaultRegion }))
    mockedFetchNotifications.mockResolvedValue([])
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

  it('shows an active-updates indicator only when the visible notifications endpoint returns data', async () => {
    mockedFetchNotifications.mockResolvedValue([activeNotification])

    renderLayout('/provincial/application')

    const notificationsLink = await screen.findByRole('link', {
      name: 'Notifications, active updates available',
    })

    expect(mockedFetchNotifications).toHaveBeenCalledOnce()
    expect(notificationsLink).toHaveAttribute('href', '/notifications')
    expect(
      notificationsLink.querySelector('.csp-side-nav__notification-indicator'),
    ).toBeInTheDocument()
  })

  it('does not show an active-updates indicator when no visible notifications exist', async () => {
    renderLayout('/provincial/application')

    await waitFor(() => expect(mockedFetchNotifications).toHaveBeenCalledOnce())

    const notificationsLink = screen.getByRole('link', { name: 'Notifications' })
    expect(screen.getAllByText('Notifications')).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'Notifications' })).not.toBeInTheDocument()
    expect(notificationsLink).not.toHaveClass('cds--side-nav__link--nested')
    expect(
      notificationsLink.querySelector('.csp-side-nav__notification-indicator'),
    ).not.toBeInTheDocument()
  })

  it('labels the provincial review navigation as application review', () => {
    renderLayout('/provincial/review')

    expect(screen.getByRole('link', { name: 'Application review' })).toHaveAttribute(
      'href',
      '/provincial/review',
    )
    expect(screen.queryByRole('link', { name: 'Review' })).not.toBeInTheDocument()
  })

  it('shows Summary navigation only to provincial submitters', () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({
          principal: 'bceid\\submitter',
          roles: ['PROVINCIAL_SUBMITTER'],
          grantedActions: ['/summary'],
          forestClientNumber: '00012345',
        }),
        defaultRoute: '/provincial/summary',
        canPerform: (action: string) => action === '/summary',
      }),
    )

    const submitterView = renderLayout('/provincial/summary')
    expect(screen.getByRole('link', { name: 'Summary' })).toHaveAttribute(
      'href',
      '/provincial/summary',
    )

    submitterView.unmount()
    mockedUseAuth.mockReturnValue(createTestAuthContext({ canPerform: () => true }))
    renderLayout('/provincial/review')

    expect(screen.queryByRole('link', { name: 'Summary' })).not.toBeInTheDocument()
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

    await userEvent.click(screen.getByRole('button', { name: 'Open menu' }))

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
    await userEvent.click(screen.getByRole('button', { name: 'Close menu' }))

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
    await userEvent.click(screen.getByRole('button', { name: 'Close menu' }))

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
    renderLayout('/admin/rtm/emslogamv/upload')

    const averageMarketValuesLink = screen.getByRole('link', {
      name: /Average market values/i,
    })
    const activeLinks = document.querySelectorAll('.csp-side-nav__link.cds--side-nav__link--active')

    expect(document.querySelector('.page-header__eyebrow')).not.toBeInTheDocument()
    expect(activeLinks).toHaveLength(1)
    expect(averageMarketValuesLink).toHaveClass('cds--side-nav__link--active')
    expect(averageMarketValuesLink).toHaveAttribute('aria-current', 'page')
  })

  it('does not mark the upload navigation item active on the legacy AMV grid route', () => {
    renderLayout('/admin/rtm/emslogamv')

    const averageMarketValuesLink = screen.getByRole('link', {
      name: /Average market values/i,
    })

    expect(averageMarketValuesLink).not.toHaveClass('cds--side-nav__link--active')
    expect(averageMarketValuesLink).not.toHaveAttribute('aria-current')
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
    const averageMarketValuesLink = screen.getByRole('link', {
      name: /Average market values/i,
    })

    expect(feePolicyLink).toHaveAttribute('href', '/admin/policies/fee')
    expect(filPolicyLink).toHaveAttribute('href', '/admin/policies/fil')
    expect(scheduleLink).toHaveAttribute('href', '/admin/schedules')
    expect(averageMarketValuesLink).toHaveAttribute('href', '/admin/rtm/emslogamv/upload')
    expect(scheduleLink).toHaveClass('cds--side-nav__link--active')
    expect(scheduleLink).toHaveAttribute('aria-current', 'page')
    expect(feePolicyLink).not.toHaveClass('cds--side-nav__link--active')
    expect(filPolicyLink).not.toHaveClass('cds--side-nav__link--active')
    expect(averageMarketValuesLink).not.toHaveClass('cds--side-nav__link--active')
  })

  it('shows only the RTM navigation links when PROD RTM-only mode is enabled', () => {
    window.config = { VITE_LEXIS_PROD_RTM_ONLY: 'true' }
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        defaultRoute: '/admin/rtm/emslogamv/upload',
        canPerform: (action: string) => action === '/lexisAgentAdmin',
      }),
    )

    renderLayout('/admin/rtm/emslogamv/upload')

    expect(screen.getByRole('link', { name: /Average market values/i })).toHaveAttribute(
      'href',
      '/admin/rtm/emslogamv/upload',
    )
    expect(screen.queryByRole('link', { name: /Average Monthly Values/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Users & Access/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /^Uploads$/i })).not.toBeInTheDocument()
    expect(screen.queryByText('Provincial')).not.toBeInTheDocument()
    expect(screen.queryByText('Federal')).not.toBeInTheDocument()
    expect(screen.queryByText('Reports')).not.toBeInTheDocument()
  })

  it('preserves normal read-only navigation when PROD RTM-only mode is enabled', () => {
    window.config = { VITE_LEXIS_PROD_RTM_ONLY: 'true' }
    const grantedActions = [
      '/applicationSearch',
      '/exemptionSearch',
      '/offersSearch',
      '/permitSearch',
      '/federalApplicationSearch',
      'viewFederalApplication',
    ]
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({
          principal: 'idir\\readonly',
          roles: ['READ_ONLY'],
          grantedActions,
        }),
        defaultRoute: '/provincial/application',
        canPerform: (action: string) => grantedActions.includes(action),
      }),
    )

    renderLayout('/provincial/application')

    expect(screen.getByRole('link', { name: 'Applications' })).toHaveAttribute(
      'href',
      '/provincial/application',
    )
    expect(screen.getByRole('link', { name: 'Exemptions' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Offers' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Permits' })).toBeVisible()
    expect(screen.getByText('Federal')).toBeVisible()
    expect(
      screen.queryByRole('link', { name: /Create\/Edit Application/i }),
    ).not.toBeInTheDocument()
    expect(screen.queryByText('Reports')).not.toBeInTheDocument()
    expect(screen.queryByText('Admin')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Average Monthly Values/i })).not.toBeInTheDocument()
  })

  it('renders side-nav links with standard icons and collapsed labels', () => {
    renderLayout('/admin/rtm/emslogamv/upload')

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
    expect(screen.queryByRole('link', { name: /Users & Access/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /^Uploads$/i })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Average market values/i })).toBeVisible()
    const navLinks = sideNav.querySelectorAll('.csp-side-nav__link')
    const navIcons = sideNav.querySelectorAll('.csp-side-nav__link .csp-side-nav__icon svg')
    expect(navIcons).toHaveLength(navLinks.length)
    expect(screen.getByRole('link', { name: /Average market values/i })).toHaveAttribute(
      'data-label',
      'Average market values',
    )
  })

  it('navigates the app name to the resolved default route', async () => {
    renderLayout('/admin/rtm/emslogamv')

    expect(screen.queryByRole('link', { name: 'Dashboard' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Go to your landing page' }))

    expect(screen.getByTestId('current-path')).toHaveTextContent('/provincial/review')
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
    expect(screen.queryByRole('link', { name: /^Application Report$/i })).not.toBeInTheDocument()
  })

  it('shows read-only reports without exposing create or admin navigation', () => {
    const grantedActions = [
      '/applicationSearch',
      '/exemptionSearch',
      '/offersSearch',
      '/permitSearch',
      '/applicationReport',
      'mofrListing',
      '/offerReport',
    ]
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({
          principal: 'idir\\readonly',
          roles: ['READ_ONLY'],
          welcomeTarget: '/reports',
          grantedActions,
        }),
        defaultRoute: '/reports',
        canPerform: (action: string) => grantedActions.includes(action),
      }),
    )

    renderLayout('/reports')

    expect(screen.getByRole('link', { name: /^Application Report$/i })).toBeVisible()
    expect(screen.getByRole('link', { name: /Advertising List/i })).toBeVisible()
    expect(screen.getByRole('link', { name: /^Offers Report$/i })).toBeVisible()
    expect(
      screen.queryByRole('link', { name: /Create\/Edit Application/i }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Create\/Edit Exemption/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Create\/Edit Offer/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /^Fee Policy$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /^Fee in Lieu$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /^Export Schedule$/i })).not.toBeInTheDocument()
  })

  it('renders legacy report navigation when an auth mock omits roles', () => {
    const capabilitiesWithoutRoles = {
      authenticated: true,
      principal: 'idir\\partial',
      welcomeTarget: '/reports',
      legacyPath: null,
      grantedActions: ['/applicationReport', 'mofrListing'],
      forestClientNumber: null,
      availableForestClientNumbers: [],
      forestClientSelectionRequired: false,
    } as unknown as LexisSessionCapabilities

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
    expect(screen.getByRole('link', { name: /^Application Report$/i })).toHaveAttribute(
      'href',
      '/reports/applicationReport',
    )
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
    expect(screen.getByRole('link', { name: /Average market values/i })).toBeVisible()

    await userEvent.click(screen.getByRole('button', { name: 'Reports' }))

    expect(screen.getByRole('button', { name: 'Reports' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('link', { name: /Advertising List/i })).toBeVisible()
  })

  it('keeps section links available as icons when the full side nav is collapsed', async () => {
    renderLayout('/admin/rtm/emslogamv')

    await userEvent.click(screen.getByRole('button', { name: 'Reports' }))
    expect(screen.queryByRole('link', { name: /Advertising List/i })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Close menu' }))

    expect(screen.getByRole('link', { name: /Advertising List/i })).toBeVisible()
  })

  it('defaults the side nav open and supports collapsing it', async () => {
    renderLayout('/admin/rtm/emslogamv')

    const shell = document.querySelector('.app-shell')
    const sideNav = screen.getByRole('navigation', { name: 'Side navigation' })
    const collapseButton = screen.getByRole('button', { name: 'Close menu' })

    expect(shell).not.toHaveClass('is-side-nav-collapsed')
    expect(sideNav).not.toHaveClass('is-collapsed')
    expect(collapseButton).toHaveAttribute('aria-controls', 'side-navigation')
    expect(collapseButton).toHaveAttribute('aria-expanded', 'true')

    await userEvent.click(collapseButton)

    expect(shell).toHaveClass('is-side-nav-collapsed')
    expect(sideNav).toHaveClass('is-collapsed')
    expect(screen.getByRole('button', { name: 'Open menu' })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
  })

  it('dismisses the profile panel when clicking outside it', async () => {
    renderLayout('/admin/rtm/emslogamv')

    const profileToggle = screen.getByRole('button', { name: 'Open profile panel' })
    const profilePanel = document.getElementById('profile-panel')

    expect(profilePanel).toHaveAttribute('aria-hidden', 'true')
    expect(profilePanel).toHaveAttribute('inert')
    expect(screen.queryByRole('dialog', { name: 'My profile' })).not.toBeInTheDocument()

    await userEvent.click(profileToggle)

    expect(profileToggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('dialog', { name: 'My profile' })).toHaveClass('is-open')
    expect(profilePanel).not.toHaveAttribute('aria-hidden')
    expect(profilePanel).not.toHaveAttribute('inert')
    expect(
      within(screen.getByRole('dialog', { name: 'My profile' })).getByRole('button', {
        name: 'Close profile panel',
      }),
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'Log out' })).toBeVisible()
    expect(profileToggle).toHaveFocus()
    expect(profilePanel?.querySelector('.profile-panel__close')).not.toHaveFocus()

    await userEvent.click(screen.getByRole('heading', { name: 'Current page content' }))

    expect(profileToggle).toHaveAttribute('aria-expanded', 'false')
    expect(profilePanel).not.toHaveClass('is-open')
    expect(profilePanel).toHaveAttribute('aria-hidden', 'true')
    expect(profilePanel).toHaveAttribute('inert')
    expect(screen.queryByRole('dialog', { name: 'My profile' })).not.toBeInTheDocument()
  })

  it('shows the user role and available organization context in the profile panel', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({
          principal: 'idir\\analyst',
          roles: ['READ_ONLY'],
          orgUnitNo: '1903',
          forestClientNumber: '00012345',
          availableForestClientNumbers: ['00012345', '00067890'],
        }),
      }),
    )

    renderLayout('/admin/rtm/emslogamv')
    await userEvent.click(screen.getByRole('button', { name: 'Open profile panel' }))

    const profilePanel = screen.getByRole('dialog', { name: 'My profile' })
    expect(within(profilePanel).getByText('idir\\analyst (Read Only)')).toBeVisible()
    expect(within(profilePanel).getByText('Organization unit: 1903')).toBeVisible()
    expect(within(profilePanel).getByText('Forest client: 00012345')).toBeVisible()

    await userEvent.click(within(profilePanel).getByRole('button', { name: 'Switch organization' }))

    expect(screen.getByTestId('current-path')).toHaveTextContent('/select-organization')
    expect(document.getElementById('profile-panel')).toHaveAttribute('aria-hidden', 'true')
  })

  it('loads and saves the default region from the profile panel', async () => {
    mockedFetchUserPreferences.mockResolvedValue({ defaultRegion: 'RCO' })
    window.sessionStorage.setItem(
      'lexis.search-state.v1.provincial-review',
      'status=SUBMITTED&region=1903%2C1904&page=3',
    )
    renderLayout('/admin/rtm/emslogamv')

    await userEvent.click(screen.getByRole('button', { name: 'Open profile panel' }))

    const zoneSelect = await screen.findByRole('combobox', { name: 'Default zone' })
    await waitFor(() => expect(zoneSelect).toHaveValue('RCO'))
    expect(
      screen.getByText(
        'Preselects the South Coast and West Coast Natural Resource Regions in search tables.',
      ),
    ).toBeVisible()

    await userEvent.selectOptions(zoneSelect, 'RNI')
    expect(
      screen.getByText(
        'Preselects the Northeast, Omineca, and Skeena Natural Resource Regions in search tables.',
      ),
    ).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Save preference' }))

    expect(mockedUpdateUserPreferences).toHaveBeenCalledWith('RNI')
    expect(await screen.findByRole('status')).toHaveTextContent('Preference saved.')
    expect(window.sessionStorage.getItem('lexis.search-state.v1.provincial-review')).toBe(
      'status=SUBMITTED&page=3',
    )
  })

  it('locks the default zone controls while the preference is saving', async () => {
    mockedFetchUserPreferences.mockResolvedValue({ defaultRegion: 'RCO' })
    let resolveSave!: (preference: { defaultRegion: 'RNI' }) => void
    mockedUpdateUserPreferences.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSave = resolve
        }),
    )
    renderLayout('/admin/rtm/emslogamv')

    await userEvent.click(screen.getByRole('button', { name: 'Open profile panel' }))
    const zoneSelect = await screen.findByRole('combobox', { name: 'Default zone' })
    await waitFor(() => expect(zoneSelect).toHaveValue('RCO'))
    await userEvent.selectOptions(zoneSelect, 'RNI')
    await userEvent.click(screen.getByRole('button', { name: 'Save preference' }))

    const savingButton = screen.getByRole('button', { name: 'Saving…' })
    expect(savingButton).toBeDisabled()
    expect(savingButton.querySelector('.cds--loading')).toBeInTheDocument()
    expect(zoneSelect).toBeDisabled()

    await act(async () => resolveSave({ defaultRegion: 'RNI' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Preference saved.')
    expect(screen.getByRole('button', { name: 'Save preference' })).toBeDisabled()
  })

  it('does not offer region preferences to provincial submitters', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({
          principal: 'bceidbusiness\\submitter_00012345',
          roles: ['LEXIS_PROVINCIAL_SUBMITTER'],
          forestClientNumber: '00012345',
        }),
      }),
    )

    renderLayout('/provincial/application')
    await userEvent.click(screen.getByRole('button', { name: 'Open profile panel' }))

    expect(screen.queryByRole('combobox', { name: 'Default region' })).not.toBeInTheDocument()
    expect(mockedFetchUserPreferences).not.toHaveBeenCalled()
  })

  it('returns focus to the profile toggle when the panel is dismissed by keyboard', async () => {
    renderLayout('/admin/rtm/emslogamv')

    const profileToggle = screen.getByRole('button', { name: 'Open profile panel' })
    await userEvent.click(profileToggle)
    expect(profileToggle).toHaveFocus()
    expect(document.querySelector('#profile-panel .profile-panel__close')).not.toHaveFocus()

    await userEvent.keyboard('{Escape}')

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Open profile panel' })).toHaveFocus()
    })
    expect(document.getElementById('profile-panel')).toHaveAttribute('inert')
  })

  it('keeps the persisted desktop preference separate from the closed mobile drawer', async () => {
    mockMobileViewport()
    window.localStorage.setItem(SIDE_NAV_PREFERENCE_KEY, 'true')
    renderLayout('/admin/rtm/emslogamv')

    const sideNav = document.getElementById('side-navigation')
    const mainContent = document.getElementById('main-content')
    const openMenuButton = screen.getByRole('button', { name: 'Open menu' })

    expect(document.querySelector('.app-shell')).not.toHaveClass('is-side-nav-collapsed')
    expect(openMenuButton).toHaveAttribute('aria-expanded', 'false')
    expect(openMenuButton).toHaveAttribute('aria-controls', 'side-navigation')
    expect(sideNav).toHaveAttribute('aria-hidden', 'true')
    expect(sideNav).toHaveAttribute('inert')
    expect(window.localStorage.getItem(SIDE_NAV_PREFERENCE_KEY)).toBe('true')

    await userEvent.click(openMenuButton)

    expect(screen.getByRole('button', { name: 'Close menu' })).toHaveAttribute(
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

    await userEvent.click(screen.getByRole('button', { name: 'Close menu' }))

    expect(screen.getByRole('button', { name: 'Open menu' })).toHaveAttribute(
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

    await userEvent.click(screen.getByRole('button', { name: 'Open menu' }))
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /^Notifications$/i })).toHaveFocus()
    })

    await userEvent.keyboard('{Escape}')

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Open menu' })).toHaveFocus()
    })
    expect(document.getElementById('side-navigation')).not.toHaveClass('is-mobile-open')

    await userEvent.click(screen.getByRole('button', { name: 'Open menu' }))
    await userEvent.click(screen.getByRole('link', { name: /^Applications$/i }))

    expect(screen.getByTestId('current-path')).toHaveTextContent('/provincial/application')
    expect(screen.getByRole('button', { name: 'Open menu' })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
    expect(document.getElementById('side-navigation')).not.toHaveClass('is-mobile-open')
  })
})
