import type { FC, ReactNode } from 'react'
import { Home, Logout } from '@carbon/icons-react'
import {
  Content,
  Header,
  HeaderGlobalAction,
  HeaderGlobalBar,
  HeaderName,
  HeaderNavigation,
  SkipToContent,
  Theme,
} from '@carbon/react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/auth/useAuth'

type Props = {
  children: ReactNode
}

type NavigationLink = {
  to: string
  label: string
  requiredActions?: string[]
}

const NAVIGATION_LINKS: NavigationLink[] = [
  { to: '/dashboard', label: 'Dashboard' },
  {
    to: '/provincial',
    label: 'Provincial',
    requiredActions: [
      '/summary',
      '/applicationsReview',
      '/applicationSearch',
      '/exemptionSearch',
      '/offersSearch',
      '/permitSearch',
    ],
  },
  {
    to: '/federal',
    label: 'Federal',
    requiredActions: ['/federalApplicationSearch', 'viewFederalApplication'],
  },
  {
    to: '/indian-reserve',
    label: 'Indian Reserve',
    requiredActions: ['/indianReservePermitSearch', 'viewOICApplication'],
  },
  {
    to: '/reports',
    label: 'Reports',
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
  { to: '/admin', label: 'Admin', requiredActions: ['/lexisAgentAdmin'] },
]

const Layout: FC<Props> = ({ children }) => {
  const navigate = useNavigate()
  const { capabilities, canPerform, defaultRoute, logout } = useAuth()

  const visibleNavigationLinks = NAVIGATION_LINKS.filter((link) => {
    if (!link.requiredActions || link.requiredActions.length === 0) {
      return true
    }

    return link.requiredActions.some((action) => canPerform(action))
  })

  return (
    <Theme theme="white">
      <div className="app-shell">
        <Header aria-label="NR LEXIS">
          <SkipToContent />
          <HeaderName
            href="/"
            prefix="NR"
            onClick={(event) => {
              event.preventDefault()
              navigate(defaultRoute)
            }}
          >
            LEXIS
          </HeaderName>
          <HeaderNavigation aria-label="LEXIS modules">
            {visibleNavigationLinks.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  isActive
                    ? 'cds--header__menu-item cds--header__menu-item--current app-header-nav-link'
                    : 'cds--header__menu-item app-header-nav-link'
                }
              >
                {link.label}
              </NavLink>
            ))}
          </HeaderNavigation>
          <HeaderGlobalBar>
            <HeaderGlobalAction aria-label="Home" onClick={() => navigate(defaultRoute)}>
              <Home size={20} />
            </HeaderGlobalAction>
            <HeaderGlobalAction
              aria-label="Log out"
              onClick={() => {
                void logout()
                navigate('/')
              }}
            >
              <Logout size={20} />
            </HeaderGlobalAction>
          </HeaderGlobalBar>
        </Header>
        <Content id="main-content" className="app-main">
          {children}
        </Content>
        <footer className="app-footer">
          NR LEXIS {capabilities.principal ? `- ${capabilities.principal}` : ''}
        </footer>
      </div>
    </Theme>
  )
}

export default Layout
