import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  Calendar,
  ChevronDown,
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
import { HeaderMenuButton, IconButton, SkipToContent } from '@carbon/react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
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
  collapsedSections: 'lexis.ui.collapsedSections',
} as const

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

const MOBILE_NAVIGATION_MEDIA_QUERY = '(max-width: 671px)'

const isMobileNavigationViewport = (): boolean => {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(MOBILE_NAVIGATION_MEDIA_QUERY).matches
  )
}

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
        label: 'Applications',
        icon: Search,
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
        label: 'Exemptions',
        icon: Search,
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
        label: 'Offers',
        icon: Search,
        requiredActions: ['/offersSearch'],
      },
      {
        to: '/provincial/permit',
        label: 'Permits',
        icon: Certificate,
        requiredActions: ['/permitSearch'],
      },
    ],
  },
  {
    label: 'Federal',
    links: [
      {
        to: '/federal',
        label: 'Search',
        icon: Search,
        requiredActions: ['/federalApplicationSearch', 'viewFederalApplication'],
      },
    ],
  },
  {
    label: 'Reports',
    links: [
      {
        to: '/reports/applicationReport',
        label: 'Application Report',
        icon: Report,
        requiredActions: ['/applicationReport'],
      },
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
        to: '/reports/teacReport',
        label: 'TEAC Package',
        icon: Report,
        requiredActions: ['/teacReport'],
      },
      {
        to: '/reports/exemptionReport',
        label: 'Exemptions Report',
        icon: Report,
        requiredActions: ['/exemptionReport'],
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
        to: '/reports/feeReport',
        label: 'Fees Report',
        icon: Report,
        requiredActions: ['/feeReport'],
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
        label: 'Fee Policy',
        icon: Finance,
        requiredActions: ['/lexisPolicyAdmin'],
      },
      {
        to: '/admin/policies/fil',
        label: 'Fee in Lieu',
        icon: Finance,
        requiredActions: ['/lexisFILAdmin'],
      },
      {
        to: '/admin/schedules',
        label: 'Export Schedule',
        icon: Calendar,
        requiredActions: ['/lexisPolicyAdmin'],
      },
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

const readCollapsedSectionsPreference = (): Record<string, boolean> => {
  const storedValue = readUiPreference(UI_PREFERENCE_KEYS.collapsedSections)
  if (!storedValue) {
    return {}
  }

  try {
    const parsedValue: unknown = JSON.parse(storedValue)
    if (typeof parsedValue !== 'object' || parsedValue === null || Array.isArray(parsedValue)) {
      return {}
    }

    const parsedRecord = parsedValue as Record<string, unknown>
    const restoredSections: Record<string, boolean> = {}
    NAVIGATION_SECTIONS.forEach(({ label }) => {
      if (typeof parsedRecord[label] === 'boolean') {
        restoredSections[label] = parsedRecord[label]
      }
    })
    return restoredSections
  } catch {
    return {}
  }
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

const getSectionListId = (sectionLabel: string): string => {
  return `side-navigation-section-${sectionLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
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
  const [isSideNavCollapsed, setIsSideNavCollapsed] = useState(readSideNavCollapsedPreference)
  const [isMobileViewport, setIsMobileViewport] = useState(isMobileNavigationViewport)
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)
  const [hasActiveNotifications, setHasActiveNotifications] = useState(false)
  const previousPathRef = useRef(location.pathname)
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>(
    readCollapsedSectionsPreference,
  )
  const isDarkTheme = theme === 'g100'
  const isDesktopSideNavCollapsed = isSideNavCollapsed && !isMobileViewport
  const isNavigationOpen = isMobileViewport ? isMobileNavOpen : !isDesktopSideNavCollapsed
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

    return NAVIGATION_SECTIONS.map((section) => ({
      ...section,
      links: section.links.filter(canShowLink),
    })).filter((section) => section.links.length > 0)
  }, [canPerform, capabilities.roles])
  const activeSectionLabel = useMemo(() => {
    return visibleNavigationSections.find((section) =>
      section.links.some((link) => link.to === location.pathname),
    )?.label
  }, [location.pathname, visibleNavigationSections])

  const toggleSection = (sectionLabel: string): void => {
    setCollapsedSections((current) => ({
      ...current,
      [sectionLabel]: !current[sectionLabel],
    }))
  }

  const handleLogout = () => {
    void logout()
  }

  const focusMobileNavigationToggle = (): void => {
    window.requestAnimationFrame(() => {
      document.getElementById('navigation-toggle')?.focus()
    })
  }

  const closeMobileNavigation = (returnFocus = false): void => {
    setIsMobileNavOpen(false)
    if (returnFocus) {
      focusMobileNavigationToggle()
    }
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
    if (isMobileViewport) {
      setIsMobileNavOpen((current) => !current)
      return
    }

    setIsSideNavCollapsed((current) => !current)
  }

  const toggleProfile = (): void => {
    setIsMobileNavOpen(false)
    setIsProfileOpen((current) => !current)
  }

  useEffect(() => {
    const mediaQuery = window.matchMedia(MOBILE_NAVIGATION_MEDIA_QUERY)
    const handleViewportChange = (event: MediaQueryListEvent): void => {
      setIsMobileViewport(event.matches)
      if (!event.matches) {
        setIsMobileNavOpen(false)
      }
    }

    mediaQuery.addEventListener('change', handleViewportChange)
    return () => mediaQuery.removeEventListener('change', handleViewportChange)
  }, [])

  useEffect(() => {
    if (previousPathRef.current === location.pathname) {
      return undefined
    }

    previousPathRef.current = location.pathname
    const closeFrame = window.requestAnimationFrame(() => setIsMobileNavOpen(false))
    return () => window.cancelAnimationFrame(closeFrame)
  }, [location.pathname])

  useEffect(() => {
    if (!isMobileViewport || !isMobileNavOpen) {
      return undefined
    }

    const focusFrame = window.requestAnimationFrame(() => {
      document
        .querySelector<HTMLAnchorElement>('#side-navigation-list .csp-side-nav__link')
        ?.focus()
    })

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setIsMobileNavOpen(false)
        window.requestAnimationFrame(() => {
          document.getElementById('navigation-toggle')?.focus()
        })
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      window.cancelAnimationFrame(focusFrame)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isMobileNavOpen, isMobileViewport])

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
    writeUiPreference(UI_PREFERENCE_KEYS.sideNavCollapsed, String(isSideNavCollapsed))
  }, [isSideNavCollapsed])

  useEffect(() => {
    writeUiPreference(UI_PREFERENCE_KEYS.collapsedSections, JSON.stringify(collapsedSections))
  }, [collapsedSections])

  const renderNavigationLink = (link: NavigationLink, nested = true) => {
    const LinkIcon = link.icon
    const showNotificationIndicator = link.to === '/notifications' && hasActiveNotifications
    const accessibleLabel = showNotificationIndicator
      ? 'Notifications, active updates available'
      : isDesktopSideNavCollapsed
        ? link.label
        : undefined
    const nestedClassName = nested ? ' cds--side-nav__link--nested' : ''

    return (
      <li key={link.to}>
        <NavLink
          end
          to={link.to}
          className={({ isActive }) =>
            `cds--side-nav__link${nestedClassName} csp-side-nav__link${
              isActive ? ' cds--side-nav__link--active' : ''
            }`
          }
          aria-current={location.pathname === link.to ? 'page' : undefined}
          aria-label={accessibleLabel}
          title={isDesktopSideNavCollapsed ? link.label : undefined}
          data-label={link.label}
          onClick={() => closeMobileNavigation()}
        >
          <span className="cds--side-nav__icon csp-side-nav__icon" aria-hidden="true">
            <LinkIcon size={20} />
            {showNotificationIndicator && (
              <span className="csp-side-nav__notification-indicator" aria-hidden="true" />
            )}
          </span>
          <span className="cds--side-nav__link-text csp-side-nav__link-text">{link.label}</span>
        </NavLink>
      </li>
    )
  }

  return (
    <>
      <OptimisticConflictModal />
      <div
        className={`app-shell${isDesktopSideNavCollapsed ? ' is-side-nav-collapsed' : ''}${isMobileNavOpen ? ' is-mobile-nav-open' : ''}`}
      >
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

          <button
            type="button"
            className="cds--header__name csp-header-name"
            onClick={() => navigate(defaultRoute)}
            aria-label="Go to your landing page"
          >
            <span className="csp-header-prefix">LEXIS</span>
            <span className="csp-header-title">Log Exemption Information System</span>
          </button>

          <div className="cds--header__global csp-header-global">
            <div className="csp-header-theme-toggle">
              <button
                type="button"
                className="csp-theme-switch"
                role="switch"
                aria-checked={isDarkTheme}
                aria-label="Toggle dark mode"
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
          className={`cds--side-nav csp-side-nav${isDesktopSideNavCollapsed ? ' is-collapsed' : ''}${isMobileNavOpen ? ' is-mobile-open' : ''}`}
          aria-label="Side navigation"
          aria-hidden={isMobileViewport && !isMobileNavOpen ? true : undefined}
          inert={isMobileViewport && !isMobileNavOpen ? true : undefined}
        >
          <ul id="side-navigation-list" className="cds--side-nav__items csp-side-nav__items">
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

              const sectionListId = getSectionListId(section.label)
              const isSectionCollapsed =
                section.label !== activeSectionLabel &&
                Boolean(collapsedSections[section.label]) &&
                !isDesktopSideNavCollapsed
              return (
                <li
                  key={section.label}
                  className={`csp-side-nav__section${isSectionCollapsed ? ' is-section-collapsed' : ''}`}
                >
                  {isDesktopSideNavCollapsed ? (
                    <span className="cds--side-nav__category csp-side-nav__category">
                      {section.label}
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="cds--side-nav__category csp-side-nav__category csp-side-nav__section-toggle"
                      aria-expanded={!isSectionCollapsed}
                      aria-controls={sectionListId}
                      onClick={() => toggleSection(section.label)}
                    >
                      <span className="csp-side-nav__category-text">{section.label}</span>
                      <span className="csp-side-nav__section-chevron" aria-hidden="true">
                        <ChevronDown size={14} />
                      </span>
                    </button>
                  )}
                  {!isSectionCollapsed && (
                    <ul id={sectionListId} className="csp-side-nav__section-list">
                      {section.links.map((link) => renderNavigationLink(link))}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
        </nav>

        {isMobileViewport && isMobileNavOpen && (
          <button
            type="button"
            className="csp-mobile-nav-overlay"
            aria-label="Dismiss navigation menu"
            onClick={() => closeMobileNavigation(true)}
          />
        )}

        <main
          id="main-content"
          className="cds--content app-main"
          aria-hidden={isMobileViewport && isMobileNavOpen ? true : undefined}
          inert={isMobileViewport && isMobileNavOpen ? true : undefined}
        >
          {children}
        </main>
      </div>
    </>
  )
}

export default Layout
