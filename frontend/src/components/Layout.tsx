import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  AsleepFilled,
  Calendar,
  ChevronDown,
  Certificate,
  ChevronLeft,
  Close,
  DataBase,
  DocumentAdd,
  Finance,
  LightFilled,
  Logout,
  Report,
  Search,
  Settings,
  Tag,
  TaskComplete,
  Upload,
  UserAvatar,
  type CarbonIconType,
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
  icon: CarbonIconType
  requiredActions?: string[]
  requiredActionsMatch?: RouteActionMatch
  roleScope?: NavigationRoleScope
}

type NavigationSection = {
  label: string
  links: NavigationLink[]
}

const NAVIGATION_SECTIONS: NavigationSection[] = [
  {
    label: 'Provincial',
    links: [
      {
        to: '/provincial/review',
        label: 'Review',
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
        label: 'Applications Report',
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
        to: '/admin',
        label: 'Users & Access',
        icon: Settings,
        requiredActions: ['/lexisAgentAdmin'],
      },
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
        to: '/admin/rtm/emslogamv',
        label: 'Average Monthly Values',
        icon: DataBase,
        requiredActions: ['/lexisAgentAdmin'],
      },
    ],
  },
]

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

  if (hasRole(roles, 'ADMIN')) {
    return true
  }

  const hasFederalSubmitter = hasFederalSubmitterRole(roles)
  const hasProvincialSubmitter = hasProvincialSubmitterRole(roles)
  const hasProvincialStaffRole =
    hasRole(roles, 'APPLICATION_APPROVER') || hasRole(roles, 'EXEMPTION_APPROVER')

  return !hasFederalSubmitter || hasProvincialSubmitter || hasProvincialStaffRole
}

function Layout({ children }: LayoutProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const { capabilities, canPerform, defaultRoute, logout } = useAuth()
  const [isDarkTheme, setIsDarkTheme] = useState(false)
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [isSideNavCollapsed, setIsSideNavCollapsed] = useState(false)
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({})
  const profileInitials = useMemo(
    () => getProfileInitials(capabilities.principal),
    [capabilities.principal],
  )

  const visibleNavigationSections = useMemo(() => {
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

    return NAVIGATION_SECTIONS.map((section) => ({
      ...section,
      links: section.links.filter(canShowLink),
    })).filter((section) => section.links.length > 0)
  }, [canPerform, capabilities.roles])

  const toggleSection = (sectionLabel: string): void => {
    setCollapsedSections((current) => ({
      ...current,
      [sectionLabel]: !current[sectionLabel],
    }))
  }

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

  useEffect(() => {
    const activeSection = visibleNavigationSections.find((section) =>
      section.links.some((link) => link.to === location.pathname),
    )

    if (!activeSection) {
      return
    }

    setCollapsedSections((current) => {
      if (!current[activeSection.label]) {
        return current
      }

      const next = { ...current }
      delete next[activeSection.label]
      return next
    })
  }, [location.pathname, visibleNavigationSections])

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
              <ChevronLeft size={16} />
            </span>
            <span className="cds--side-nav__toggle-label csp-side-nav__toggle-text">
              {isSideNavCollapsed ? 'Expand' : 'Collapse'}
            </span>
          </button>

          <ul id="side-navigation-list" className="cds--side-nav__items csp-side-nav__items">
            {visibleNavigationSections.map((section) => {
              const sectionListId = getSectionListId(section.label)
              const isSectionCollapsed =
                Boolean(collapsedSections[section.label]) && !isSideNavCollapsed
              return (
                <li
                  key={section.label}
                  className={`csp-side-nav__section${isSectionCollapsed ? ' is-section-collapsed' : ''}`}
                >
                  {isSideNavCollapsed ? (
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
                      {section.links.map((link) => {
                        const LinkIcon = link.icon
                        return (
                          <li key={link.to}>
                            <NavLink
                              end
                              to={link.to}
                              className={({ isActive }) =>
                                isActive
                                  ? 'cds--side-nav__link cds--side-nav__link--nested csp-side-nav__link cds--side-nav__link--active'
                                  : 'cds--side-nav__link cds--side-nav__link--nested csp-side-nav__link'
                              }
                              aria-current={location.pathname === link.to ? 'page' : undefined}
                              aria-label={isSideNavCollapsed ? link.label : undefined}
                              title={isSideNavCollapsed ? link.label : undefined}
                              data-label={link.label}
                            >
                              <span
                                className="cds--side-nav__icon csp-side-nav__icon"
                                aria-hidden="true"
                              >
                                <LinkIcon size={16} />
                              </span>
                              <span className="cds--side-nav__link-text csp-side-nav__link-text">
                                {link.label}
                              </span>
                            </NavLink>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
        </nav>

        <main id="main-content" className="cds--content app-main">
          {children}
        </main>
      </div>
    </Theme>
  )
}

export default Layout
