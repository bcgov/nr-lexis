import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  // Calendar,
  Certificate,
  Close,
  DataTable,
  Dashboard,
  DocumentAdd,
  Finance,
  Logout,
  Moon,
  Notification,
  Report,
  Search,
  Sun,
  Switcher,
  Tag,
  TaskComplete,
  Upload,
  UserAvatar,
  type CarbonIconType,
} from '@carbon/icons-react'
import {
  HeaderMenuButton,
  IconButton,
  SideNavItems,
  SideNavMenu,
  SkipToContent,
} from '@carbon/react'
import { Link, matchPath, useLocation, useNavigate } from 'react-router-dom'
import {
  hasProvincialStaffRole,
  hasProvincialSubmitterRole,
  hasRole,
} from '@/context/auth/role-utils'
import OptimisticConflictModal from '@/components/OptimisticConflictModal'
import UserRegionPreference from '@/components/UserRegionPreference'
import { isProdRtmOnlyPathAllowed } from '@/config/features'
import { useAuth } from '@/context/auth/useAuth'
import { useTheme } from '@/context/theme/useTheme'
import type { NavigationRoleScope, RouteActionMatch } from '@/routes/routeAccessTypes'
import { fetchNotifications } from '@/service/notification-service'

export type LayoutProps = {
  children: ReactNode
}

type NavigationLink = {
  to: string
  label: string
  icon: CarbonIconType
  activePathPatterns?: string[]
  requiredActions?: string[]
  requiredActionsMatch?: RouteActionMatch
  roleScope?: NavigationRoleScope
}

type NavigationSection = {
  label: string
  links: NavigationLink[]
  standalone?: boolean
}

const UI_PREFERENCE_KEYS = {
  sideNavCollapsed: 'lexis.ui.sideNavCollapsed',
} as const

// INTENTIONAL_LEGACY_DIVERGENCE(NAVIGATION_MENU_CONTRACT): The business-approved
// labels, initial section expansion, and role-scoped section visibility are intentional.
const DEFAULT_EXPANDED_SECTION = 'Provincial'

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Administrator',
  APPLICATION_APPROVER: 'Application Approver',
  EXEMPTION_APPROVER: 'Exemption Approver',
  READ_ONLY: 'Read Only',
  PROVINCIAL_SUBMITTER: 'Provincial Submitter',
}

const ROLE_DISPLAY_PRIORITY = [
  'ADMIN',
  'APPLICATION_APPROVER',
  'EXEMPTION_APPROVER',
  'READ_ONLY',
  'PROVINCIAL_SUBMITTER',
] as const

// INTENTIONAL_LEGACY_DIVERGENCE(RESPONSIVE_SIDE_NAVIGATION):
// Keep an accessible collapsed icon rail at narrow widths and treat its temporary expansion
// separately from the persisted desktop collapsed preference.
const NARROW_NAVIGATION_MEDIA_QUERY = '(max-width: 671px)'

const isNarrowNavigationViewport = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia(NARROW_NAVIGATION_MEDIA_QUERY).matches

const NAVIGATION_SECTIONS: NavigationSection[] = [
  {
    label: 'Notifications',
    standalone: true,
    links: [
      {
        to: '/notifications',
        label: 'Notifications',
        icon: Notification,
      },
    ],
  },
  {
    label: 'Provincial',
    links: [
      {
        to: '/provincial/summary',
        label: 'Summary',
        icon: Dashboard,
        requiredActions: ['/summary'],
        roleScope: 'provincialSubmitter',
      },
      {
        to: '/provincial/review',
        label: 'Application review',
        icon: TaskComplete,
        requiredActions: ['/applicationsReview'],
      },
      {
        to: '/provincial/application/create',
        label: 'Create/Edit Application',
        icon: DocumentAdd,
        requiredActions: ['/applicationSearch', 'createApplication'],
        requiredActionsMatch: 'all',
      },
      {
        to: '/provincial/application/upload',
        label: 'Upload',
        icon: Upload,
        requiredActions: ['uploadApplicationSubmission'],
        roleScope: 'provincialApplicationSubmission',
      },
      {
        to: '/provincial/application',
        label: 'Application search',
        icon: Search,
        activePathPatterns: ['/provincial/application/:applicationNumber'],
        requiredActions: ['/applicationSearch'],
      },
      {
        to: '/provincial/exemption/create',
        label: 'Create/Edit Exemption',
        icon: DocumentAdd,
        requiredActions: ['/exemptionSearch', '/createExemption'],
        requiredActionsMatch: 'all',
      },
      {
        to: '/provincial/exemption',
        label: 'Exemption search',
        icon: Search,
        activePathPatterns: ['/provincial/exemption/:exemptionNumber'],
        requiredActions: ['/exemptionSearch'],
      },
      {
        to: '/provincial/offers/create',
        label: 'Create/Edit Offer',
        icon: Tag,
        requiredActions: ['/offersSearch', 'createOffer'],
        requiredActionsMatch: 'all',
      },
      {
        to: '/provincial/offers',
        label: 'Offer search',
        icon: Search,
        activePathPatterns: ['/provincial/offers/:offerNumber'],
        requiredActions: ['/offersSearch'],
      },
      {
        to: '/provincial/permit',
        label: 'Permit search',
        icon: Certificate,
        activePathPatterns: ['/provincial/permit/:permitNumber'],
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
        icon: Search,
        activePathPatterns: ['/federal/application/:applicationNumber'],
        requiredActions: ['/federalApplicationSearch', 'viewFederalApplication'],
      },
    ],
  },
  {
    label: 'Reports',
    links: [
      {
        to: '/reports/biweeklyListing',
        label: 'Advertising List',
        icon: Report,
        requiredActions: ['mofrListing'],
      },
      {
        to: '/reports/offerReport',
        label: 'Offers Report',
        icon: Report,
        requiredActions: ['/offerReport'],
      },
      {
        to: '/reports/permitLedgerReport',
        label: 'Permits Report',
        icon: Report,
        requiredActions: ['/permitLedgerReport'],
      },
      {
        to: '/reports/transportReport',
        label: 'Transport Report',
        icon: Report,
        requiredActions: ['/transportReport'],
      },
      {
        to: '/reports/speciesGradeReport',
        label: 'Species and Grade Report',
        icon: Report,
        requiredActions: ['/speciesGradeReport'],
      },
      {
        to: '/reports/tenureReport',
        label: 'Tenure Analysis',
        icon: Report,
        requiredActions: ['/tenureReport'],
      },
    ],
  },
  {
    label: 'Admin',
    links: [
      {
        to: '/admin/policies/fee',
        label: 'Multiplication Factor',
        icon: Finance,
        requiredActions: ['/lexisPolicyAdmin'],
      },
      {
        to: '/admin/policies/fil',
        label: 'Non-appraised Sec.3 FIL%',
        icon: Finance,
        requiredActions: ['/lexisFILAdmin'],
      },
      // Export Schedule administration is disabled pending business approval. Restore this
      // navigation item together with its route and backend mutation authorization.
      // {
      //   to: '/admin/schedules',
      //   label: 'Export Schedule',
      //   icon: Calendar,
      //   requiredActions: ['/lexisPolicyAdmin'],
      // },
      {
        to: '/admin/rtm/emslogamv/upload',
        label: 'Average market values',
        icon: DataTable,
        requiredActions: ['/lexisAgentAdmin'],
      },
    ],
  },
]

const readUiPreference = (key: string): string | null => {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

const writeUiPreference = (key: string, value: string): void => {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(key, value)
  } catch {
    // UI preferences are optional when storage is unavailable.
  }
}

const readSideNavCollapsedPreference = (): boolean => {
  const storedValue = readUiPreference(UI_PREFERENCE_KEYS.sideNavCollapsed)
  return storedValue === 'true'
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

const getPrimaryRoleLabel = (roles: string[] | null | undefined): string | null => {
  const normalizedRoles = (roles ?? []).map((role) => role.trim().toUpperCase())
  const exactRole = ROLE_DISPLAY_PRIORITY.find((role) => normalizedRoles.includes(role))
  if (exactRole) {
    return ROLE_LABELS[exactRole]
  }
  if (normalizedRoles.some((role) => role.startsWith('PROVINCIAL_SUBMITTER_'))) {
    return ROLE_LABELS.PROVINCIAL_SUBMITTER
  }
  return normalizedRoles[0]?.replaceAll('_', ' ') ?? null
}

const canShowRoleScopedLink = (
  link: NavigationLink,
  roles: string[] | null | undefined,
): boolean => {
  if (!link.roleScope) {
    return true
  }

  if (link.roleScope === 'provincialSubmitter') {
    return hasProvincialSubmitterRole(roles) && !hasRole(roles, 'ADMIN')
  }

  if (hasRole(roles, 'ADMIN')) {
    return true
  }

  const hasProvincialSubmitter = hasProvincialSubmitterRole(roles)
  const hasProvincialStaffRole =
    hasRole(roles, 'READ_ONLY') ||
    hasRole(roles, 'APPLICATION_APPROVER') ||
    hasRole(roles, 'EXEMPTION_APPROVER')

  return hasProvincialSubmitter || hasProvincialStaffRole
}

function Layout({ children }: LayoutProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const { capabilities, canPerform, defaultRoute, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [isSideNavCollapsedPreference, setIsSideNavCollapsedPreference] = useState(
    readSideNavCollapsedPreference,
  )
  const [isNarrowViewport, setIsNarrowViewport] = useState(isNarrowNavigationViewport)
  const [isNarrowNavExpanded, setIsNarrowNavExpanded] = useState(false)
  const [hasActiveNotifications, setHasActiveNotifications] = useState(false)
  const isDarkTheme = theme === 'g100'
  const isSideNavCollapsed = isNarrowViewport ? !isNarrowNavExpanded : isSideNavCollapsedPreference
  const isNavigationOpen = !isSideNavCollapsed
  const notificationAudienceKey = `${capabilities.principal ?? ''}:${capabilities.roles?.join('|') ?? ''}`
  const profileInitials = useMemo(
    () => getProfileInitials(capabilities.principal),
    [capabilities.principal],
  )
  const profileRoleLabel = useMemo(
    () => getPrimaryRoleLabel(capabilities.roles),
    [capabilities.roles],
  )

  const visibleNavigationSections = useMemo(() => {
    const isProvincialSubmitter =
      hasProvincialSubmitterRole(capabilities.roles) && !hasRole(capabilities.roles, 'ADMIN')
    const canShowLink = (link: NavigationLink): boolean => {
      if (!isProdRtmOnlyPathAllowed(link.to, capabilities.roles)) {
        return false
      }

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

    return NAVIGATION_SECTIONS.filter(
      (section) =>
        !isProvincialSubmitter ||
        section.label === 'Notifications' ||
        section.label === 'Provincial',
    )
      .map((section) => ({
        ...section,
        links: section.links.filter(canShowLink),
      }))
      .filter((section) => section.links.length > 0)
  }, [canPerform, capabilities.roles])
  const activeNavigationLink = useMemo(() => {
    const visibleLinks = visibleNavigationSections.flatMap((section) => section.links)
    return (
      visibleLinks.find((link) => link.to === location.pathname) ??
      visibleLinks.find((link) =>
        link.activePathPatterns?.some((pattern) =>
          matchPath({ path: pattern, end: true }, location.pathname),
        ),
      )
    )
  }, [location.pathname, visibleNavigationSections])
  const activeSectionLabel = useMemo(
    () =>
      visibleNavigationSections.find((section) =>
        section.links.some((link) => link.to === activeNavigationLink?.to),
      )?.label,
    [activeNavigationLink?.to, visibleNavigationSections],
  )

  const handleLogout = () => {
    void logout()
  }

  const focusProfileToggle = useCallback((): void => {
    window.requestAnimationFrame(() => {
      document.getElementById('profile-panel-toggle')?.focus()
    })
  }, [])

  const closeProfile = useCallback(
    (returnFocus = false): void => {
      setIsProfileOpen(false)
      if (returnFocus) {
        focusProfileToggle()
      }
    },
    [focusProfileToggle],
  )

  const handleOrganizationSelection = () => {
    closeProfile()
    navigate('/select-organization')
  }

  const toggleNavigation = (): void => {
    setIsProfileOpen(false)
    if (isNarrowViewport) {
      setIsNarrowNavExpanded((current) => !current)
      return
    }

    setIsSideNavCollapsedPreference((current) => !current)
  }

  const toggleProfile = (): void => {
    setIsProfileOpen((current) => !current)
  }

  useEffect(() => {
    const mediaQuery = window.matchMedia(NARROW_NAVIGATION_MEDIA_QUERY)
    const handleViewportChange = (event: MediaQueryListEvent): void => {
      setIsNarrowViewport(event.matches)
      setIsNarrowNavExpanded(false)
    }

    mediaQuery.addEventListener('change', handleViewportChange)
    return () => mediaQuery.removeEventListener('change', handleViewportChange)
  }, [])

  useEffect(() => {
    if (!isProfileOpen) {
      return undefined
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeProfile(true)
      }
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) {
        return
      }

      const profilePanel = document.getElementById('profile-panel')
      const profileToggle = document.getElementById('profile-panel-toggle')
      if (!profilePanel?.contains(event.target) && !profileToggle?.contains(event.target)) {
        closeProfile()
      }
    }

    document.addEventListener('keydown', handleKeyDown, true)
    document.addEventListener('pointerdown', handlePointerDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [closeProfile, isProfileOpen])

  useEffect(() => {
    let isCurrent = true

    const loadNotificationIndicator = async (): Promise<void> => {
      if (!capabilities.authenticated || !capabilities.principal) {
        if (isCurrent) {
          setHasActiveNotifications(false)
        }
        return
      }

      try {
        const notifications = await fetchNotifications()
        if (isCurrent) {
          setHasActiveNotifications(notifications.length > 0)
        }
      } catch {
        if (isCurrent) {
          setHasActiveNotifications(false)
        }
      }
    }

    void loadNotificationIndicator()
    return () => {
      isCurrent = false
    }
  }, [capabilities.authenticated, capabilities.principal, notificationAudienceKey])

  useEffect(() => {
    writeUiPreference(UI_PREFERENCE_KEYS.sideNavCollapsed, String(isSideNavCollapsedPreference))
  }, [isSideNavCollapsedPreference])

  const renderNavigationLink = (link: NavigationLink, nested = true) => {
    const LinkIcon = link.icon
    const isActive = link.to === activeNavigationLink?.to
    const showNotificationIndicator = link.to === '/notifications' && hasActiveNotifications
    const accessibleLabel = showNotificationIndicator
      ? 'Notifications, active updates available'
      : isSideNavCollapsed
        ? link.label
        : undefined
    const nestedClassName = nested ? ' cds--side-nav__link--nested' : ''

    return (
      <li key={link.to}>
        <Link
          to={link.to}
          className={`cds--side-nav__link${nestedClassName} csp-side-nav__link${
            isActive ? ' cds--side-nav__link--active' : ''
          }`}
          aria-current={isActive ? 'page' : undefined}
          aria-label={accessibleLabel}
          title={isSideNavCollapsed ? link.label : undefined}
          data-label={link.label}
        >
          <span className="cds--side-nav__icon csp-side-nav__icon" aria-hidden="true">
            <LinkIcon size={20} />
            {showNotificationIndicator && (
              <span className="csp-side-nav__notification-indicator" aria-hidden="true" />
            )}
          </span>
          <span className="cds--side-nav__link-text csp-side-nav__link-text">{link.label}</span>
        </Link>
      </li>
    )
  }

  return (
    <>
      <OptimisticConflictModal />
      <div className={`app-shell${isSideNavCollapsed ? ' is-side-nav-collapsed' : ''}`}>
        <SkipToContent />
        <header className="cds--header csp-app-header" aria-label="NR LEXIS">
          <HeaderMenuButton
            id="navigation-toggle"
            className="csp-navigation-toggle"
            aria-label={isNavigationOpen ? 'Close menu' : 'Open menu'}
            aria-controls="side-navigation"
            aria-expanded={isNavigationOpen}
            isActive={isNavigationOpen}
            onClick={toggleNavigation}
          />

          <Link
            to={defaultRoute}
            className="cds--header__name csp-header-name"
            aria-label="LEXIS Log Exemption Information System"
          >
            <span className="csp-header-prefix">LEXIS</span>
            <span className="csp-header-title">Log Exemption Information System</span>
          </Link>

          <div className="cds--header__global csp-header-global">
            <div className="csp-header-theme-toggle">
              <button
                type="button"
                className="csp-theme-switch"
                role="switch"
                aria-checked={isDarkTheme}
                aria-label={isDarkTheme ? 'Switch to light theme' : 'Switch to dark theme'}
                onClick={toggleTheme}
              >
                <span className="csp-theme-switch__thumb" aria-hidden="true">
                  {isDarkTheme ? <Moon size={14} /> : <Sun size={14} />}
                </span>
              </button>
            </div>

            <IconButton
              id="profile-panel-toggle"
              align="bottom-right"
              className="csp-header-action"
              kind="ghost"
              label={isProfileOpen ? 'Close profile panel' : 'Open profile panel'}
              aria-label={isProfileOpen ? 'Close profile panel' : 'Open profile panel'}
              aria-expanded={isProfileOpen}
              aria-controls="profile-panel"
              onClick={toggleProfile}
            >
              <UserAvatar size={20} />
            </IconButton>
          </div>
        </header>

        <aside
          id="profile-panel"
          className={`profile-panel${isProfileOpen ? ' is-open' : ''}`}
          role="dialog"
          aria-label="My profile"
          aria-modal="false"
          aria-hidden={isProfileOpen ? undefined : true}
          inert={isProfileOpen ? undefined : true}
        >
          <div className="profile-panel__header">
            <h2 className="profile-panel__title">My profile</h2>
            <IconButton
              align="bottom-right"
              className="profile-panel__close"
              kind="ghost"
              label="Close profile panel"
              aria-label="Close profile panel"
              onClick={() => closeProfile(true)}
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
                <p className="profile-panel__name">
                  {capabilities.principal ?? 'LEXIS user'}
                  {profileRoleLabel ? ` (${profileRoleLabel})` : ''}
                </p>
                {capabilities.orgUnitNo && (
                  <p className="profile-panel__meta">Organization unit: {capabilities.orgUnitNo}</p>
                )}
                {capabilities.forestClientNumber && (
                  <p className="profile-panel__meta">
                    Forest client: {capabilities.forestClientNumber}
                  </p>
                )}
              </div>
            </div>
            {hasProvincialStaffRole(capabilities.roles) && (
              <UserRegionPreference active={isProfileOpen} />
            )}
          </div>

          <hr className="profile-panel__divider" role="separator" />

          {capabilities.availableForestClientNumbers.length > 1 && (
            <button
              className="profile-panel__action"
              type="button"
              onClick={handleOrganizationSelection}
            >
              <Switcher size={16} />
              Switch organization
            </button>
          )}

          <button className="profile-panel__signout" type="button" onClick={handleLogout}>
            <Logout size={16} />
            Log out
          </button>
        </aside>

        <nav
          id="side-navigation"
          className={`cds--side-nav csp-side-nav${isSideNavCollapsed ? ' is-collapsed' : ''}`}
          aria-label="Side navigation"
        >
          <SideNavItems className="csp-side-nav__items" isSideNavExpanded={!isSideNavCollapsed}>
            {visibleNavigationSections.map((section) => {
              if (section.standalone) {
                return (
                  <li
                    key={section.label}
                    className="csp-side-nav__section csp-side-nav__section--standalone"
                  >
                    <ul className="csp-side-nav__section-list">
                      {section.links.map((link) => renderNavigationLink(link, false))}
                    </ul>
                  </li>
                )
              }

              if (isSideNavCollapsed) {
                return (
                  <li key={section.label} className="csp-side-nav__section">
                    <span className="csp-side-nav__collapsed-section-label">{section.label}</span>
                    <ul className="csp-side-nav__section-list">
                      {section.links.map((link) => renderNavigationLink(link))}
                    </ul>
                  </li>
                )
              }

              return (
                <SideNavMenu
                  key={section.label}
                  className="csp-side-nav__section"
                  defaultExpanded={
                    section.label === DEFAULT_EXPANDED_SECTION ||
                    section.label === activeSectionLabel
                  }
                  isActive={section.label === activeSectionLabel}
                  title={section.label}
                >
                  {section.links.map((link) => renderNavigationLink(link))}
                </SideNavMenu>
              )
            })}
          </SideNavItems>
        </nav>

        <main id="main-content" className="cds--content app-main">
          {children}
        </main>
      </div>
    </>
  )
}

export default Layout
