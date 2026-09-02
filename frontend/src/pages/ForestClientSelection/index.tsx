import { useState, type FormEvent } from 'react'
import { Logout } from '@carbon/icons-react'
import {
  Button,
  Column,
  Grid,
  InlineNotification,
  RadioButton,
  RadioButtonGroup,
} from '@carbon/react'
import { useAuth } from '@/context/auth/useAuth'
import { useTheme } from '@/context/theme/useTheme'
import logo from '@/assets/BCID_H_rgb_pos.png'
import landingImage from '@/assets/landing.jpg'
import reverseLogo from '@/assets/gov-bc-logo-horiz.png'

type ForestClientSelectionPageProps = {
  onSelected?: () => void
}

const ForestClientSelectionPage = ({ onSelected }: ForestClientSelectionPageProps) => {
  const { capabilities, logout, selectForestClient } = useAuth()
  const { theme } = useTheme()
  const availableClientNumbers = capabilities.availableForestClientNumbers
  const currentClientNumber = capabilities.forestClientNumber ?? ''
  const [selectedClientNumber, setSelectedClientNumber] = useState(currentClientNumber)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const logoSource = theme === 'g100' ? reverseLogo : logo

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedClientNumber || selectedClientNumber === currentClientNumber) {
      if (currentClientNumber) {
        onSelected?.()
      }
      return
    }

    setErrorMessage('')
    setIsSubmitting(true)
    try {
      await selectForestClient(selectedClientNumber)
      onSelected?.()
    } catch (error) {
      console.warn('Unable to activate the selected organization.', error)
      setErrorMessage('LEXIS could not activate that organization. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main
      id="main-content"
      className="landing-grid-container forest-client-selection"
      aria-busy={isSubmitting}
    >
      <Grid fullWidth className="landing-grid">
        <Column
          className="landing-content-col forest-client-selection__content"
          sm={4}
          md={8}
          lg={8}
        >
          <section
            className="forest-client-selection__panel"
            aria-labelledby="organization-heading"
          >
            <img
              src={logoSource}
              alt="Government of British Columbia"
              className="forest-client-selection__logo"
            />

            <div className="forest-client-selection__heading">
              <h1 id="organization-heading">Select organization</h1>
              <p>
                Your Business BCeID account is registered with more than one forest-client
                organization. Pick which one you want to work under for this session. You can sign
                out and back in to switch later.
              </p>
            </div>

            <form
              className="forest-client-selection__form"
              onSubmit={(event) => void handleSubmit(event)}
            >
              <RadioButtonGroup
                legendText="Organization"
                name="forest-client-selection"
                valueSelected={selectedClientNumber}
                orientation="vertical"
                disabled={isSubmitting || availableClientNumbers.length === 0}
                onChange={(value) => setSelectedClientNumber(String(value))}
              >
                {availableClientNumbers.map((clientNumber) => (
                  <RadioButton
                    key={clientNumber}
                    id={`forest-client-selection-${clientNumber}`}
                    value={clientNumber}
                    labelText={`Forest client ${clientNumber}`}
                  />
                ))}
              </RadioButtonGroup>

              {errorMessage && (
                <InlineNotification
                  kind="error"
                  lowContrast
                  hideCloseButton
                  title="Organization not selected"
                  subtitle={errorMessage}
                />
              )}

              <div className="forest-client-selection__actions">
                <Button type="submit" size="md" disabled={!selectedClientNumber || isSubmitting}>
                  Continue
                </Button>
                <Button
                  type="button"
                  kind="ghost"
                  size="md"
                  renderIcon={Logout}
                  disabled={isSubmitting}
                  onClick={() => void logout()}
                >
                  Sign out
                </Button>
              </div>
            </form>
          </section>
        </Column>

        <Column className="landing-img-col" sm={4} md={8} lg={8}>
          <img src={landingImage} alt="BC forest landscape" className="landing-img" />
        </Column>
      </Grid>
    </main>
  )
}

export default ForestClientSelectionPage
