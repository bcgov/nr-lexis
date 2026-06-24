import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  AsleepFilled,
  Close,
  LightFilled,
  Logout,
  SidePanelClose,
  SidePanelOpen,
  UserAvatar,
} from '@carbon/icons-react'
import { IconButton, SkipToContent, Theme } from '@carbon/react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  hasFederalSubmitterRole,
  hasProvincialSubmitterRole,
  hasRole,
} from '@/context/auth/role-utils'
import { useAuth } from '@/context/auth/useAuth'
import type { NavigationRoleScope, RouteActionMatch } from '@/routes/routeAccessTypes'

export type LayoutProps = {
  children: ReactNode
}

type NavigationLink = {
  to: string
  label: string
  requiredActions?: string[]
  requiredActionsMatch?: RouteActionMatch
  roleScope?: NavigationRoleScope
}

type NavigationSection = {
  label: string
  links: NavigationLink[]
}

type BreadcrumbRoute = {
  path: string
  section: string
}

const NAVIGATION_SECTIONS: NavigationSection[] = [
  {
    label: 'Provincial',
    links: [
      {
        to: '/provincial/review',
        label: 'Application review',
        requiredActions: ['/applicationsReview'],
      },
      { to: '/provincial/summary', label: 'Summary', requiredActions: ['/summary'] },
      {
        to: '/provincial/application/create',
        label: 'Create/edit application',
        requiredActions: ['/applicationSearch', 'createApplication'],
        requiredActionsMatch: 'all',
      },
      {
        to: '/provincial/application/upload',
        label: 'Upload application submission',
        requiredActions: ['uploadApplicationSubmission'],
        roleScope: 'provincialApplicationSubmission',
      },
      {
        to: '/provincial/application',
        label: 'Application search',
        requiredActions: ['/applicationSearch'],
      },
      {
        to: '/provincial/exemption/create',
        label: 'Create/edit exemption',
        requiredActions: ['/exemptionSearch', '/createExemption'],
        requiredActionsMatch: 'all',
      },
      {
        to: '/provincial/exemption',
        label: 'Exemption search',
        requiredActions: ['/exemptionSearch'],
      },
      {
        to: '/provincial/offers/create',
        label: 'Create/edit offer',
        requiredActions: ['/offersSearch', 'createOffer'],
        requiredActionsMatch: 'all',
      },
      {
        to: '/provincial/offers',
        label: 'Offer search',
        requiredActions: ['/offersSearch'],
      },
      {
        to: '/provincial/permit',
        label: 'Permit search',
        requiredActions: ['/permitSearch'],
      },
    ],
  },
  {
    label: 'Federal',
    links: [
      {
        to: '/federal',
        label: 'Application search',
        requiredActions: ['/federalApplicationSearch', 'viewFederalApplication'],
      },
      {
        to: '/federal/application/upload',
        label: 'Upload application submission',
        requiredActions: ['uploadApplicationSubmission'],
        roleScope: 'federalApplicationSubmission',
      },
    ],
  },
  {
    label: 'Reports',
    links: [
      {
        to: '/reports',
        label: 'Reports menu',
        requiredActions: [
          '/applicationReport',
          '/offerReport',
          '/teacReport',
          '/exemptionReport',
          '/permitLedgerReport',
          '/transportReport',
          '/speciesGradeReport',
          '/feeReport',
          '/tenureReport',
          'mofrListing',
        ],
      },
    ],
  },
  {
    label: 'Administration',
    links: [
      {
        to: '/admin',
        label: 'LEXIS administration',
        requiredActions: ['/lexisAgentAdmin'],
      },
      {
        to: '/admin/policies',
        label: 'Fee policy administration',
        requiredActions: ['/lexisAgentAdmin'],
      },
      {
        to: '/admin/uploads',
        label: 'Data upload',
        requiredActions: [
          '/lexisAgentAdmin',
          '/fileApplicationUpload',
          '/fileExemptionUpload',
          '/filePermitUpload',
          '/fileInvoiceUpload',
        ],
      },
      {
        to: '/admin/rtm/emslogamv',
        label: 'EMS AMV',
        requiredActions: ['/lexisAgentAdmin'],
      },
    ],
  },
]

const BREADCRUMB_ROUTES: BreadcrumbRoute[] = [
  { path: '/provincial/summary', section: 'Provincial' },
  { path: '/provincial/review', section: 'Provincial' },
  { path: '/provincial/application/create', section: 'Provincial' },
  { path: '/provincial/application/upload', section: 'Provincial' },
  { path: '/provincial/application', section: 'Provincial' },
  { path: '/provincial/exemption/create', section: 'Provincial' },
  { path: '/provincial/exemption', section: 'Provincial' },
  { path: '/provincial/offers/create', section: 'Provincial' },
  { path: '/provincial/offers', section: 'Provincial' },
  { path: '/provincial/permit', section: 'Provincial' },
  { path: '/provincial', section: 'Provincial' },
  { path: '/federal/application/upload', section: 'Federal' },
  { path: '/federal', section: 'Federal' },
  { path: '/reports', section: 'Reports' },
  { path: '/admin/uploads', section: 'Administration' },
  { path: '/admin/policies', section: 'Administration' },
  { path: '/admin', section: 'Administration' },
  { path: '/admin/rtm/emslogamv', section: 'Administration' },
  { path: '/unauthorized', section: 'LEXIS' },
]

const getBreadcrumbRoute = (pathname: string): BreadcrumbRoute => {
  const matchedRoute = BREADCRUMB_ROUTES.find((route) => {
    return pathname === route.path || pathname.startsWith(`${route.path}/`)
  })

  return matchedRoute ?? { path: pathname, section: 'LEXIS' }
}

const getProfileInitials = (principal: string | null): string => {
  if (!principal) {
    return 'LX'
  }

  const normalized = principal.replace(/[^a-zA-Z0-9\s._-]/g, ' ').trim()
  const parts = normalized.split(/[\s._-]+/).filter(Boolean)
  const initials = parts
    .slice(0, 2)
    .map((part) => part[0])
    .join('')

  return (initials || principal.slice(0, 2)).toUpperCase()
}

const canShowRoleScopedLink = (
  link: NavigationLink,
  roles: string[] | null | undefined,
): boolean => {
  if (!link.roleScope) {
    return true
  }

  if (hasRole(roles, 'ADMIN')) {
    return true
  }

  const hasFederalSubmitter = hasFederalSubmitterRole(roles)
  const hasProvincialSubmitter = hasProvincialSubmitterRole(roles)
  const hasProvincialStaffRole =
    hasRole(roles, 'APPLICATION_APPROVER') || hasRole(roles, 'EXEMPTION_APPROVER')

  if (link.roleScope === 'federalApplicationSubmission') {
    return hasFederalSubmitter && !hasProvincialSubmitter && !hasProvincialStaffRole
  }

  return !hasFederalSubmitter || hasProvincialSubmitter || hasProvincialStaffRole
}

function Layout({ children }: LayoutProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const { capabilities, canPerform, defaultRoute, logout } = useAuth()
  const breadcrumbRoute = getBreadcrumbRoute(location.pathname)
  const [isDarkTheme, setIsDarkTheme] = useState(false)
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [isSideNavCollapsed, setIsSideNavCollapsed] = useState(false)
  const profileInitials = useMemo(
    () => getProfileInitials(capabilities.principal),
    [capabilities.principal],
  )

  const canShowLink = (link: NavigationLink): boolean => {
    if (!canShowRoleScopedLink(link, capabilities.roles)) {
      return false
    }

    if (!link.requiredActions || link.requiredActions.length === 0) {
      return true
    }

    if (link.requiredActionsMatch === 'all') {
      return link.requiredActions.every((action) => canPerform(action))
    }

    return link.requiredActions.some((action) => canPerform(action))
  }

  const visibleNavigationSections = NAVIGATION_SECTIONS.map((section) => ({
    ...section,
    links: section.links.filter(canShowLink),
  })).filter((section) => section.links.length > 0)

  const handleLogout = () => {
    void logout()
  }

  useEffect(() => {
    if (!isProfileOpen) {
      return undefined
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsProfileOpen(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isProfileOpen])

  return (
    <Theme theme={isDarkTheme ? 'g100' : 'white'}>
      <div className={`app-shell${isSideNavCollapsed ? ' is-side-nav-collapsed' : ''}`}>
        <SkipToContent />
        <header className="cds--header csp-app-header" aria-label="NR LEXIS">
          <button
            type="button"
            className="cds--header__name csp-header-name"
            onClick={() => navigate(defaultRoute)}
            aria-label="Go to your landing page"
          >
            Log Exemption Information System
          </button>

          <div className="cds--header__global csp-header-global">
            <div className="csp-header-theme-toggle">
              <span aria-hidden="true">Light</span>
              <button
                type="button"
                className="csp-theme-switch"
                role="switch"
                aria-checked={isDarkTheme}
                aria-label="Toggle dark mode"
                onClick={() => setIsDarkTheme((current) => !current)}
              >
                {isDarkTheme ? <AsleepFilled size={12} /> : <LightFilled size={12} />}
              </button>
              <span aria-hidden="true">Dark</span>
            </div>

            <IconButton
              align="bottom-right"
              className="csp-header-action"
              kind="ghost"
              label={isProfileOpen ? 'Close profile panel' : 'Open profile panel'}
              aria-expanded={isProfileOpen}
              aria-controls="profile-panel"
              onClick={() => setIsProfileOpen((current) => !current)}
            >
              <UserAvatar size={20} />
            </IconButton>
          </div>
        </header>

        <aside
          id="profile-panel"
          className={`profile-panel${isProfileOpen ? ' is-open' : ''}`}
          role="dialog"
          aria-label="Profile"
          aria-modal="false"
        >
          <div className="profile-panel__header">
            <h2 className="profile-panel__title">Profile</h2>
            <IconButton
              align="bottom-right"
              className="profile-panel__close"
              kind="ghost"
              label="Close profile panel"
              onClick={() => setIsProfileOpen(false)}
            >
              <Close size={20} />
            </IconButton>
          </div>

          <div className="profile-panel__body">
            <div className="profile-panel__identity">
              <div className="profile-avatar" aria-hidden="true">
                {profileInitials}
              </div>
              <div className="profile-panel__info">
                <p className="profile-panel__name">{capabilities.principal ?? 'LEXIS user'}</p>
                <p className="profile-panel__meta">Application: NR LEXIS</p>
              </div>
            </div>
          </div>

          <hr className="profile-panel__divider" role="separator" />

          <button className="profile-panel__signout" type="button" onClick={handleLogout}>
            <Logout size={16} />
            Sign out
          </button>
        </aside>

        <nav
          className={`cds--side-nav csp-side-nav${isSideNavCollapsed ? ' is-collapsed' : ''}`}
          aria-label="Side navigation"
        >
          <button
            type="button"
            className="csp-side-nav__toggle"
            aria-controls="side-navigation-list"
            aria-expanded={!isSideNavCollapsed}
            aria-label={isSideNavCollapsed ? 'Expand side navigation' : 'Collapse side navigation'}
            onClick={() => setIsSideNavCollapsed((current) => !current)}
          >
            <span className="csp-side-nav__toggle-icon" aria-hidden="true">
              {isSideNavCollapsed ? <SidePanelOpen size={18} /> : <SidePanelClose size={18} />}
            </span>
            <span className="csp-side-nav__toggle-text">LEXIS Menu</span>
          </button>

          <ul id="side-navigation-list" className="cds--side-nav__items csp-side-nav__items">
            {visibleNavigationSections.map((section) => (
              <li key={section.label} className="csp-side-nav__section">
                <span className="cds--side-nav__category csp-side-nav__category">
                  {section.label}
                </span>
                <ul className="csp-side-nav__section-list">
                  {section.links.map((link) => (
                    <li key={link.to}>
                      <NavLink
                        end
                        to={link.to}
                        className={({ isActive }) =>
                          isActive
                            ? 'cds--side-nav__link csp-side-nav__link cds--side-nav__link--active'
                            : 'cds--side-nav__link csp-side-nav__link'
                        }
                        aria-current={location.pathname === link.to ? 'page' : undefined}
                        aria-label={isSideNavCollapsed ? link.label : undefined}
                        title={isSideNavCollapsed ? link.label : undefined}
                      >
                        <span className="cds--side-nav__link-text csp-side-nav__link-text">
                          {link.label}
                        </span>
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </nav>

        <main id="main-content" className="cds--content app-main">
          <header className="page-header">
            <p className="page-header__eyebrow" aria-label="Current section">
              {breadcrumbRoute.section}
            </p>
          </header>
          {children}
        </main>
      </div>
    </Theme>
  )
}

export default Layout
