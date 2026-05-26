import type { FC, ReactNode } from 'react'
import { Home } from '@carbon/icons-react'
import {
  Content,
  Header,
  HeaderNavigation,
  HeaderGlobalAction,
  HeaderGlobalBar,
  HeaderName,
  SkipToContent,
  Theme,
} from '@carbon/react'
import { NavLink, useNavigate } from 'react-router-dom'

type Props = {
  children: ReactNode
}

const Layout: FC<Props> = ({ children }) => {
  const navigate = useNavigate()
  const navigationLinks = [
    { to: '/dashboard', label: 'Dashboard' },
    { to: '/provincial', label: 'Provincial' },
    { to: '/federal', label: 'Federal' },
    { to: '/indian-reserve', label: 'Indian Reserve' },
    { to: '/reports', label: 'Reports' },
    { to: '/admin', label: 'Admin' },
  ]

  return (
    <Theme theme="white">
      <div className="app-shell">
        <Header aria-label="NR LEXIS">
          <SkipToContent />
          <HeaderName
            href="/dashboard"
            prefix="NR"
            onClick={(event) => {
              event.preventDefault()
              navigate('/dashboard')
            }}
          >
            LEXIS
          </HeaderName>
          <HeaderNavigation aria-label="LEXIS modules">
            {navigationLinks.map((link) => (
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
            <HeaderGlobalAction aria-label="Home" onClick={() => navigate('/dashboard')}>
              <Home size={20} />
            </HeaderGlobalAction>
          </HeaderGlobalBar>
        </Header>
        <Content id="main-content" className="app-main">
          {children}
        </Content>
        <footer className="app-footer">NR LEXIS</footer>
      </div>
    </Theme>
  )
}

export default Layout
