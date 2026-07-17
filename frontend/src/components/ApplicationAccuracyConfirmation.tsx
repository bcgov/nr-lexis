import { Checkbox } from '@carbon/react'
import { useId } from 'react'

import ConfirmationModal from '@/components/ConfirmationModal'

export const APPLICATION_ACCURACY_DESCRIPTION =
  'Checking "I Agree" confirms that I have submitted accurate application details'
export const APPLICATION_ACCURACY_LABEL = 'I Agree'
export const APPLICATION_ACCURACY_ACKNOWLEDGEMENT = {
  description: APPLICATION_ACCURACY_DESCRIPTION,
  label: APPLICATION_ACCURACY_LABEL,
} as const

type ApplicationAccuracyConfirmationProps = {
  open: boolean
  confirmed: boolean
  busy: boolean
  confirmLabel: string
  pendingLabel: string
  onConfirmedChange: (confirmed: boolean) => void
  onConfirm: () => Promise<void> | void
  onClose: () => void
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
}: ApplicationAccuracyConfirmationProps) => {
  const checkboxId = `application-accuracy-${useId().replaceAll(':', '')}`

  const confirm = async () => {
    if (!confirmed || busy) return
    await onConfirm()
  }

  return (
    <ConfirmationModal
      open={open}
      title="Confirm application accuracy"
      description={APPLICATION_ACCURACY_DESCRIPTION}
      confirmLabel={confirmLabel}
      pendingLabel={pendingLabel}
      confirmDisabled={!confirmed || busy}
      onConfirm={confirm}
      onClose={onClose}
    >
      <Checkbox
        id={checkboxId}
        labelText={APPLICATION_ACCURACY_LABEL}
        checked={confirmed}
        disabled={busy}
        onChange={(_, { checked }) => onConfirmedChange(Boolean(checked))}
      />
    </ConfirmationModal>
  )
}

export default ApplicationAccuracyConfirmation
