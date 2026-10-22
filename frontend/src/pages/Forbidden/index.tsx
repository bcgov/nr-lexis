import { useEffect } from 'react'
import { ArrowRight, Logout } from '@carbon/icons-react'
import { Button, Column, Grid } from '@carbon/react'
import { useNavigate } from 'react-router-dom'
import logo from '@/assets/BCID_H_rgb_pos.png'
import reverseLogo from '@/assets/gov-bc-logo-horiz.png'
import landingImage from '@/assets/landing.jpg'
import { useAuth } from '@/context/auth/useAuth'
import { useTheme } from '@/context/theme/useTheme'

const FORBIDDEN_TITLE = "You don't have access to view this page"

const ForbiddenPage = () => {
  const navigate = useNavigate()
  const { capabilities, defaultRoute, logout } = useAuth()
  const { theme } = useTheme()
  const logoSource = theme === 'g100' ? reverseLogo : logo
  const description = capabilities.principal
    ? `${capabilities.principal}, your account does not have permission to use this part of LEXIS.`
    : 'Your account does not have permission to use this part of LEXIS.'

  // The heading isn't a PageHeader, so the page names the browser tab itself and gives the
  // previous name back when it goes away.
  useEffect(() => {
    const previousTitle = document.title
    document.title = FORBIDDEN_TITLE
    return () => {
      document.title = previousTitle
    }
  }, [])

  return (
    <div className="landing-grid-container forbidden-landing" data-testid="forbidden-page">
      <Grid fullWidth className="landing-grid">
        <Column className="landing-content-col" sm={4} md={8} lg={8}>
          <div className="landing-content-wrapper">
            <div className="landing-logo-mark">
              <img src={logoSource} alt="Government of British Columbia" className="landing-logo" />
            </div>

            <div className="landing-title-group">
              <h1 className="landing-title">{FORBIDDEN_TITLE}</h1>
              <p className="landing-subtitle">{description}</p>
            </div>

            <div className="landing-actions">
              <Button
                kind="primary"
                size="md"
                renderIcon={ArrowRight}
                onClick={() => navigate(defaultRoute)}
              >
                Go to my landing page
              </Button>
              <Button
                kind="tertiary"
                size="md"
                renderIcon={Logout}
                onClick={() => {
                  void logout()
                }}
              >
                Log out
              </Button>
            </div>
          </div>
        </Column>

        <Column className="landing-img-col" sm={4} md={8} lg={8}>
          <img src={landingImage} alt="British Columbia forest landscape" className="landing-img" />
        </Column>
      </Grid>
    </div>
  )
}

export default ForbiddenPage
