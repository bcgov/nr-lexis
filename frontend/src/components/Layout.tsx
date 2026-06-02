import type { FC, ReactNode } from 'react'
import { Email, Help, Home, Logout } from '@carbon/icons-react'
import { OverflowMenu, OverflowMenuItem, SkipToContent, Theme } from '@carbon/react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/auth/useAuth'
import bcGovLogo from '@/assets/BCID_H_rgb_pos.png'

type Props = {
  children: ReactNode
}

type NavigationLink = {
  to: string
  label: string
  requiredActions?: string[]
}

type NavigationSection = {
  label: string
  links: NavigationLink[]
}

type BreadcrumbRoute = {
  path: string
  section: string
  subsection: string
}

const NAVIGATION_SECTIONS: NavigationSection[] = [
  {
    label: 'Provincial',
    links: [
      { to: '/provincial/summary', label: 'Summary', requiredActions: ['/summary'] },
      {
        to: '/provincial/review',
        label: 'Application Review',
        requiredActions: ['/applicationsReview'],
      },
      {
        to: '/provincial/application/create',
        label: 'Create/Edit Application',
        requiredActions: ['/applicationSearch', 'createApplication'],
      },
      {
        to: '/provincial/application',
        label: 'Application Search',
        requiredActions: ['/applicationSearch'],
      },
      {
        to: '/provincial/exemption/create',
        label: 'Create/Edit Exemption',
        requiredActions: ['/exemptionSearch', '/createExemption'],
      },
      {
        to: '/provincial/exemption',
        label: 'Exemption Search',
        requiredActions: ['/exemptionSearch'],
      },
      {
        to: '/provincial/offers/create',
        label: 'Create/Edit Offer',
        requiredActions: ['/offersSearch', 'createOffer'],
      },
      {
        to: '/provincial/offers',
        label: 'Offer Search',
        requiredActions: ['/offersSearch'],
      },
      {
        to: '/provincial/permit',
        label: 'Permit Search',
        requiredActions: ['/permitSearch'],
      },
    ],
  },
  {
    label: 'Federal',
    links: [
      {
        to: '/federal',
        label: 'Application Search',
        requiredActions: ['/federalApplicationSearch', 'viewFederalApplication'],
      },
    ],
  },
  {
    label: 'Indian Reserve',
    links: [
      {
        to: '/indian-reserve/permit/create',
        label: 'Create/Edit Permit',
        requiredActions: ['/indianReservePermitSearch', 'viewOICApplication'],
      },
      {
        to: '/indian-reserve',
        label: 'Permit Search',
        requiredActions: ['/indianReservePermitSearch', 'viewOICApplication'],
      },
    ],
  },
  {
    label: 'Reports',
    links: [
      {
        to: '/reports',
        label: 'Reports Menu',
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
        label: 'LEXIS Administration',
        requiredActions: ['/lexisAgentAdmin'],
      },
      {
        to: '/admin/policies',
        label: 'Fee Policy Administration',
        requiredActions: ['/lexisAgentAdmin'],
      },
      {
        to: '/admin/uploads',
        label: 'Upload Center',
        requiredActions: [
          '/lexisAgentAdmin',
          '/fileApplicationUpload',
          '/fileExemptionUpload',
          '/filePermitUpload',
          '/fileInvoiceUpload',
        ],
      },
    ],
  },
]

const BREADCRUMB_ROUTES: BreadcrumbRoute[] = [
  { path: '/dashboard', section: 'LEXIS Menu', subsection: 'Dashboard' },
  { path: '/provincial/summary', section: 'Provincial', subsection: 'Summary' },
  { path: '/provincial/review', section: 'Provincial', subsection: 'Application Review' },
  {
    path: '/provincial/application/create',
    section: 'Provincial',
    subsection: 'Create/Edit Application',
  },
  { path: '/provincial/application', section: 'Provincial', subsection: 'Application Search' },
  {
    path: '/provincial/exemption/create',
    section: 'Provincial',
    subsection: 'Create/Edit Exemption',
  },
  { path: '/provincial/exemption', section: 'Provincial', subsection: 'Exemption Search' },
  { path: '/provincial/offers/create', section: 'Provincial', subsection: 'Create/Edit Offer' },
  { path: '/provincial/offers', section: 'Provincial', subsection: 'Offer Search' },
  { path: '/provincial/permit/create', section: 'Provincial', subsection: 'Create/Edit Permit' },
  { path: '/provincial/permit', section: 'Provincial', subsection: 'Permit Search' },
  { path: '/provincial', section: 'Provincial', subsection: 'Menu' },
  { path: '/federal', section: 'Federal', subsection: 'Application Search' },
  {
    path: '/indian-reserve/permit/create',
    section: 'Indian Reserve',
    subsection: 'Create/Edit Permit',
  },
  { path: '/indian-reserve', section: 'Indian Reserve', subsection: 'Permit Search' },
  { path: '/reports', section: 'Reports', subsection: 'Reports Menu' },
  { path: '/admin/uploads', section: 'Administration', subsection: 'Upload Center' },
  { path: '/admin/policies', section: 'Administration', subsection: 'Fee Policy Administration' },
  { path: '/admin', section: 'Administration', subsection: 'LEXIS Administration' },
  { path: '/unauthorized', section: 'LEXIS', subsection: 'Unauthorized' },
]

const getBreadcrumbRoute = (pathname: string): BreadcrumbRoute => {
  const matchedRoute = BREADCRUMB_ROUTES.find((route) => {
    return pathname === route.path || pathname.startsWith(`${route.path}/`)
  })

  return matchedRoute ?? { path: pathname, section: 'LEXIS', subsection: 'Page' }
}

const Layout: FC<Props> = ({ children }) => {
  const location = useLocation()
  const navigate = useNavigate()
  const { capabilities, canPerform, defaultRoute, logout } = useAuth()
  const breadcrumbRoute = getBreadcrumbRoute(location.pathname)

  const canShowLink = (link: NavigationLink): boolean => {
    if (!link.requiredActions || link.requiredActions.length === 0) {
      return true
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

  const openContact = () => {
    window.location.href = 'mailto:?subject=LEXIS Web Feedback'
  }

  const openHelp = () => {
    window.open(
      '/help/LEXIS_Help.htm',
      'Help',
      'target=_blank,width=800,height=600,toolbar=no,location=no,directories=no,status=no,menubar=no,scrollbars=yes,resizable=yes',
    )
  }

  return (
    <Theme theme="white">
      <div className="app-shell">
        <SkipToContent />
        <header className="legacy-app-header" aria-label="NR LEXIS">
          <button
            type="button"
            className="legacy-header-logo-button"
            onClick={() => navigate(defaultRoute)}
            aria-label="Go to LEXIS menu"
          >
            <img
              src={bcGovLogo}
              className="legacy-header-logo"
              alt="British Columbia Government Logo"
            />
          </button>
          <div className="legacy-header-title">
            <span className="legacy-program-heading">Log Exemption Information System</span>
            <span className="legacy-program-ministry">
              Ministry of Forests, Lands, and Natural Resource Operations
            </span>
          </div>
          <div className="legacy-header-utility">
            {capabilities.principal && (
              <span className="legacy-header-principal">{capabilities.principal}</span>
            )}
            <OverflowMenu
              aria-label="LEXIS utilities"
              flipped
              size="sm"
              className="legacy-utility-menu"
            >
              <OverflowMenuItem
                itemText={
                  <span className="legacy-utility-item">
                    <Home size={16} /> Main
                  </span>
                }
                onClick={() => navigate(defaultRoute)}
                requireTitle
              />
              <OverflowMenuItem
                itemText={
                  <span className="legacy-utility-item">
                    <Email size={16} /> Contact Us
                  </span>
                }
                onClick={openContact}
                requireTitle
              />
              <OverflowMenuItem
                itemText={
                  <span className="legacy-utility-item">
                    <Help size={16} /> Help
                  </span>
                }
                onClick={openHelp}
                requireTitle
              />
              <OverflowMenuItem
                hasDivider
                itemText={
                  <span className="legacy-utility-item">
                    <Logout size={16} /> Logout
                  </span>
                }
                onClick={handleLogout}
                requireTitle
              />
            </OverflowMenu>
          </div>
        </header>

        <div className="legacy-layout-frame">
          <nav className="legacy-side-nav" aria-label="LEXIS Menu">
            <button
              type="button"
              className="legacy-menu-home"
              onClick={() => navigate(defaultRoute)}
            >
              LEXIS Menu
            </button>
            {visibleNavigationSections.map((section) => (
              <section key={section.label} className="legacy-menu-section">
                <h2 className="legacy-menu-heading">{section.label}</h2>
                <ul className="legacy-menu-list">
                  {section.links.map((link) => (
                    <li key={link.to}>
                      <NavLink
                        to={link.to}
                        className={({ isActive }) =>
                          isActive ? 'legacy-menu-link active' : 'legacy-menu-link'
                        }
                      >
                        {link.label}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            <button type="button" className="legacy-menu-home" onClick={handleLogout}>
              Logout
            </button>
          </nav>

          <main id="main-content" className="app-main">
            <div className="legacy-breadcrumb" aria-label="Current page">
              <span className="legacy-breadcrumb-text">
                {breadcrumbRoute.section} &gt; {breadcrumbRoute.subsection}
              </span>
            </div>
            {children}
          </main>
        </div>
        <footer className="app-footer">
          <span>NR LEXIS {capabilities.principal ? `- ${capabilities.principal}` : ''}</span>
          <nav className="legacy-footer-links" aria-label="Footer links">
            <a href="https://www2.gov.bc.ca/gov/content/home/copyright">Copyright</a>
            <a href="https://www2.gov.bc.ca/gov/content/home/disclaimer">Disclaimer</a>
            <a href="https://www2.gov.bc.ca/gov/content/home/privacy">Privacy</a>
            <a href="https://www2.gov.bc.ca/gov/content/home/accessibility">Accessibility</a>
          </nav>
        </footer>
      </div>
    </Theme>
  )
}

export default Layout
