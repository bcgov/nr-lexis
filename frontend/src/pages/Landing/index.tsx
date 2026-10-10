import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, InlineNotification, Link } from '@carbon/react'
import { Login } from '@carbon/icons-react'
import { AppNotification } from '../../components/AppNotification'
import Modal from '@/components/Modal'
import type { LoginProvider } from '@/context/auth/types'
import {
  clearSessionExpiredLoginNotice,
  hasSessionExpiredLoginNotice,
} from '@/context/auth/session-expiry'
import { useAuth } from '@/context/auth/useAuth'
import { clearLoginDestination, setLoginDestination } from '@/context/auth/login-destination'
import { useTheme } from '@/context/theme/useTheme'
import logo from '@/assets/BCID_H_rgb_pos.png'
import reverseLogo from '@/assets/gov-bc-logo-horiz.png'
import landingImage from '@/assets/landing.jpg'

const EXPORT_OFFICE_CONTACTS = [
  { region: 'Coast', email: 'Provincial.Log.Export.Analyst@gov.bc.ca' },
  { region: 'North', email: 'NorthAreaExportScaling@gov.bc.ca' },
  { region: 'South', email: 'Export.Applications@gov.bc.ca' },
] as const

const ACCESS_REQUEST_DETAILS = [
  'Name',
  'Email address',
  'Phone number',
  'Business BCeID username',
  'Company you represent as an employee or agent (include authorization)',
  'Ministry of Forests client number',
] as const

const LandingPage = ({ loginDestination }: { loginDestination?: string }) => {
  const navigate = useNavigate()
  const { defaultRoute, isLoading, isLoggedIn, login, usesExternalLogin } = useAuth()
  const { theme } = useTheme()
  const logoSource = theme === 'g100' ? reverseLogo : logo

  const [errorMessage, setErrorMessage] = useState('')
  const [isRequestAccessOpen, setIsRequestAccessOpen] = useState(false)
  const requestAccessLinkRef = useRef<HTMLButtonElement>(null)
  const [showSessionExpiredMessage, setShowSessionExpiredMessage] = useState(
    hasSessionExpiredLoginNotice,
  )

  useEffect(() => {
    if (showSessionExpiredMessage) {
      clearSessionExpiredLoginNotice()
    }
  }, [showSessionExpiredMessage])

  useEffect(() => {
    if (!isLoading && isLoggedIn) {
      navigate(loginDestination ?? defaultRoute, { replace: true })
    }
  }, [defaultRoute, isLoading, isLoggedIn, loginDestination, navigate])

  const onLogin = async (provider: LoginProvider) => {
    setErrorMessage('')
    setLoginDestination(loginDestination)
    try {
      await login(provider)
    } catch (error) {
      clearLoginDestination()
      console.error(error)
      setErrorMessage('Unable to start the login flow.')
    }
  }

  return (
    <main className="landing-grid-container login-landing" id="main-content" aria-busy={isLoading}>
      <div className="landing-grid">
        <div className="landing-content-col">
          <div className="landing-content-wrapper">
            <div className="landing-logo-mark">
              {/* Both logo assets include transparent padding around the artwork. */}
              <svg
                role="img"
                aria-label="Government of British Columbia"
                className="landing-logo"
                viewBox="70 70 710 188"
              >
                <image href={logoSource} width="848" height="327" />
              </svg>
            </div>

            <div className="landing-text-content">
              <div className="landing-title-group">
                <h1 className="landing-title">LEXIS</h1>
                <h2 className="landing-subtitle">Log Exemption Information System</h2>
              </div>

              <p className="landing-description">
                Manage provincial log applications for exemptions, offers and permits.
              </p>

              {showSessionExpiredMessage && (
                <InlineNotification
                  className="landing-session-expired-notification"
                  kind="warning"
                  lowContrast
                  title="You've been logged out"
                  subtitle="Your session expired for security reasons and any unsaved changes were lost. Log in again to continue."
                  onCloseButtonClick={() => setShowSessionExpiredMessage(false)}
                />
              )}

              <div className="landing-actions">
                {!isLoggedIn && (
                  <>
                    <Button
                      kind="primary"
                      size="lg"
                      isExpressive
                      renderIcon={Login}
                      onClick={() => void onLogin('idir')}
                      disabled={isLoading || !usesExternalLogin}
                      data-testid="landing-button__idir"
                    >
                      Log in with IDIR
                    </Button>
                    <Button
                      kind="tertiary"
                      size="lg"
                      isExpressive
                      renderIcon={Login}
                      onClick={() => void onLogin('business-bceid')}
                      disabled={isLoading || !usesExternalLogin}
                      data-testid="landing-button__bceid"
                    >
                      Log in with Business BCeID
                    </Button>
                  </>
                )}

                {!usesExternalLogin && !isLoggedIn && (
                  <p className="landing-help-text">
                    LEXIS login is not configured for this environment. Contact the system
                    administrator.
                  </p>
                )}
              </div>

              {!isLoggedIn && (
                <div className="landing-request-access">
                  <Link
                    as="button"
                    type="button"
                    ref={requestAccessLinkRef}
                    size="lg"
                    className="landing-request-access__link"
                    aria-haspopup="dialog"
                    onClick={() => setIsRequestAccessOpen(true)}
                  >
                    Request access to LEXIS
                  </Link>
                  <p className="landing-request-access__note">
                    An active Business BCeID account is required.
                  </p>
                </div>
              )}

              {errorMessage && (
                <AppNotification
                  kind="error"
                  title="Session error"
                  subtitle={errorMessage}
                  lowContrast
                  onCloseButtonClick={() => setErrorMessage('')}
                />
              )}
            </div>
          </div>
        </div>

        <div className="landing-img-col">
          <img src={landingImage} alt="" className="landing-img" aria-hidden="true" />
        </div>
      </div>

      <Modal
        open={isRequestAccessOpen}
        passiveModal
        size="sm"
        className="landing-request-access-dialog"
        modalHeading="Request access to LEXIS"
        launcherButtonRef={requestAccessLinkRef}
        selectorPrimaryFocus=".landing-request-access-modal a"
        onRequestClose={() => setIsRequestAccessOpen(false)}
      >
        <div className="landing-request-access-modal">
          <section>
            <h3>Where to send your request</h3>
            <p>Email the export office for the region where the logs are harvested:</p>
            <ul>
              {EXPORT_OFFICE_CONTACTS.map(({ region, email }) => (
                <li key={region}>
                  {region}:{' '}
                  <Link inline size="lg" href={`mailto:${email}`}>
                    {email}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h3>What to include</h3>
            <ul>
              {ACCESS_REQUEST_DETAILS.map((detail) => (
                <li key={detail}>{detail}</li>
              ))}
            </ul>
          </section>
        </div>
      </Modal>
    </main>
  )
}

export default LandingPage
