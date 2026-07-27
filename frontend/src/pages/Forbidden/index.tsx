import { ArrowRight, Logout } from '@carbon/icons-react'
import { Button, Column, Grid } from '@carbon/react'
import { useNavigate } from 'react-router-dom'
import logo from '@/assets/BCID_H_rgb_pos.png'
import reverseLogo from '@/assets/gov-bc-logo-horiz.png'
import landingImage from '@/assets/landing.jpg'
import { useAuth } from '@/context/auth/useAuth'
import { useTheme } from '@/context/theme/useTheme'

const ForbiddenPage = () => {
  const navigate = useNavigate()
  const { capabilities, defaultRoute, logout } = useAuth()
  const { theme } = useTheme()
  const logoSource = theme === 'g100' ? reverseLogo : logo
  const description = capabilities.principal
    ? `${capabilities.principal}, your account does not have permission to use this part of LEXIS.`
    : 'Your account does not have permission to use this part of LEXIS.'

  return (
    <div className="landing-grid-container forbidden-landing" data-testid="forbidden-page">
      <Grid fullWidth className="landing-grid">
        <Column className="landing-content-col" sm={4} md={8} lg={8}>
          <div className="landing-content-wrapper">
            <div className="landing-logo-mark">
              <img src={logoSource} alt="Government of British Columbia" className="landing-logo" />
            </div>

            <div className="landing-title-group">
              <h1 className="landing-title">You don't have access to view this page</h1>
              <p className="landing-subtitle">{description}</p>
            </div>

            <div className="landing-actions">
              <Button kind="primary" renderIcon={ArrowRight} onClick={() => navigate(defaultRoute)}>
                Go to my landing page
              </Button>
              <Button
                kind="tertiary"
                renderIcon={Logout}
                onClick={() => {
                  void logout()
                }}
              >
                Sign out
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
