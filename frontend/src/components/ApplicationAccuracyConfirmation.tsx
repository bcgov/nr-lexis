import { Checkbox } from '@carbon/react'
import { useId, useState } from 'react'

import ConfirmationModal from '@/components/ConfirmationModal'
import { AppNotification } from '@/components/AppNotification'
import { fieldErrorText } from '@/utils/field-error'
import { requiredLabel } from '@/utils/required-label'

const APPLICATION_ACCURACY_LABEL = 'I confirm the application details are accurate'
const APPLICATION_ACCURACY_ERROR = 'Confirm the application details are accurate to save.'
type ApplicationAccuracyConfirmationProps = {
  open: boolean
  confirmed: boolean
  busy: boolean
  confirmLabel: string
  pendingLabel: string
  onConfirmedChange: (confirmed: boolean) => void
  onConfirm: () => Promise<void> | void
  onClose: () => void
  errorTitle?: string
  errorMessage?: string
  warningMessage?: string
  onError?: (error: unknown) => void
}

const ApplicationAccuracyConfirmation = ({
  open,
  confirmed,
  busy,
  confirmLabel,
  pendingLabel,
  onConfirmedChange,
  onConfirm,
  onClose,
  onError,
  errorMessage,
  errorTitle,
  warningMessage,
}: ApplicationAccuracyConfirmationProps) => {
  const checkboxId = `application-accuracy-${useId().replaceAll(':', '')}`
  const [showConfirmationError, setShowConfirmationError] = useState(false)

  // Save stays enabled; without the tick it shows the error on the checkbox and keeps the dialog.
  const confirm = async (): Promise<boolean | void> => {
    if (busy) return false
    if (!confirmed) {
      setShowConfirmationError(true)
      document.getElementById(checkboxId)?.focus()
      return false
    }
    await onConfirm()
  }

  return (
    <ConfirmationModal
      open={open}
      title="Confirm application details"
      confirmLabel={confirmLabel}
      pendingLabel={pendingLabel}
      confirmDisabled={busy}
      initialFocusSelector={`#${checkboxId}`}
      onConfirm={confirm}
      onClose={onClose}
      onError={onError}
      errorMessage={errorMessage}
      errorTitle={errorTitle}
    >
      {warningMessage && (
        <AppNotification
          focusOnReveal
          revealKey={warningMessage}
          kind="warning"
          title="Review package volumes"
          subtitle={warningMessage}
        />
      )}
      <Checkbox
        id={checkboxId}
        labelText={requiredLabel(APPLICATION_ACCURACY_LABEL)}
        aria-required="true"
        checked={confirmed}
        disabled={busy}
        invalid={showConfirmationError && !confirmed}
        invalidText={fieldErrorText(APPLICATION_ACCURACY_ERROR)}
        onChange={(_, { checked }) => {
          setShowConfirmationError(false)
          onConfirmedChange(Boolean(checked))
        }}
      />
    </ConfirmationModal>
  )
}

export default ApplicationAccuracyConfirmation
