import { Button, Column, Grid } from '@carbon/react'
import { Logout } from '@carbon/icons-react'
import { useAuth } from '@/context/auth/useAuth'
import { useTheme } from '@/context/theme/useTheme'
import logo from '@/assets/BCID_H_rgb_pos.png'
import reverseLogo from '@/assets/gov-bc-logo-horiz.png'
import landingImage from '@/assets/landing.jpg'

const UnauthorizedPage = () => {
  const { capabilities, logout } = useAuth()
  const { theme } = useTheme()
  const logoSource = theme === 'g100' ? reverseLogo : logo
  const signedInDescription = capabilities.principal
    ? `You’re signed in as ${capabilities.principal}, but your account is not authorized to use LEXIS.`
    : 'Your account is signed in, but it is not authorized to use LEXIS.'

  return (
    <main
      className="landing-grid-container unauthorized-landing"
      id="main-content"
      data-testid="unauthorized-page"
    >
      <Grid fullWidth className="landing-grid">
        <Column className="landing-content-col" sm={4} md={8} lg={8}>
          <div className="landing-content-wrapper">
            <div className="landing-logo-mark">
              <img src={logoSource} alt="Government of British Columbia" className="landing-logo" />
            </div>

            <div className="landing-title-group">
              <h1 className="landing-title">Access not granted</h1>
              <p className="landing-subtitle">{signedInDescription}</p>
            </div>

            <div className="landing-actions">
              <Button
                type="button"
                kind="secondary"
                renderIcon={Logout}
                size="md"
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
    </main>
  )
}

export default UnauthorizedPage
