import { useState, type FormEvent } from 'react'
import { ArrowRight, Logout } from '@carbon/icons-react'
import { Button, InlineNotification, Select, SelectItem } from '@carbon/react'
import { useAuth } from '@/context/auth/useAuth'
import { useTheme } from '@/context/theme/useTheme'
import logo from '@/assets/BCID_H_rgb_pos.png'
import reverseLogo from '@/assets/gov-bc-logo-horiz.png'

export type ForestClientSelectionPageProps = {
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
    <main id="main-content" className="forest-client-selection" aria-busy={isSubmitting}>
      <section className="forest-client-selection__card" aria-labelledby="organization-heading">
        <img
          src={logoSource}
          alt="Government of British Columbia"
          className="forest-client-selection__logo"
        />

        <div className="forest-client-selection__heading">
          <p className="forest-client-selection__eyebrow">LEXIS</p>
          <h1 id="organization-heading">Select an organization</h1>
          <p>
            Your Business BCeID account has access to more than one forest client. Choose the
            organization you want to work with for this session.
          </p>
        </div>

        <form
          className="forest-client-selection__form"
          onSubmit={(event) => void handleSubmit(event)}
        >
          <Select
            id="forest-client-selection"
            labelText="Organization"
            value={selectedClientNumber}
            disabled={isSubmitting || availableClientNumbers.length === 0}
            onChange={(event) => setSelectedClientNumber(event.target.value)}
          >
            <SelectItem value="" text="Choose an organization" disabled />
            {availableClientNumbers.map((clientNumber) => (
              <SelectItem
                key={clientNumber}
                value={clientNumber}
                text={`Forest client ${clientNumber}`}
              />
            ))}
          </Select>

          <p className="forest-client-selection__help">
            LEXIS will validate this choice against your FAM permissions and use it to scope all
            client data.
          </p>

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
            <Button
              type="submit"
              renderIcon={ArrowRight}
              disabled={!selectedClientNumber || isSubmitting}
            >
              {currentClientNumber ? 'Continue' : 'Open LEXIS'}
            </Button>
            <Button
              type="button"
              kind="ghost"
              renderIcon={Logout}
              disabled={isSubmitting}
              onClick={() => void logout()}
            >
              Sign out
            </Button>
          </div>
        </form>
      </section>
    </main>
  )
}

export default ForestClientSelectionPage
