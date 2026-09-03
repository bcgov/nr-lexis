import { Button, Loading, TextInput } from '@carbon/react'
import { useId } from 'react'
import Modal from '@/components/Modal'
import { isValidEmail, normalizeTrimmedText } from '@/utils/text'
import { requiredLabel } from '@/utils/required-label'

import './ConfirmationModal/ConfirmationModal.css'

export type ExemptionApprovalRecipient = [string, string]

type ExemptionApprovalEmailModalProps = {
  recipients: ExemptionApprovalRecipient[]
  sending: boolean
  onRecipientsChange: (recipients: ExemptionApprovalRecipient[]) => void
  onSend: (recipients: ExemptionApprovalRecipient[]) => void
  onSkip: () => void
}

const isValidApprovalEmail = (value: string): boolean => {
  const normalized = normalizeTrimmedText(value)
  return normalized.length <= 254 && !/[,:;]/.test(normalized) && isValidEmail(normalized)
}

const SendingIcon = () => <Loading small withOverlay={false} description="" />

const ExemptionApprovalEmailModal = ({
  recipients,
  sending,
  onRecipientsChange,
  onSend,
  onSkip,
}: ExemptionApprovalEmailModalProps) => {
  const generatedId = useId().replaceAll(':', '')
  const skipButtonId = `exemption-approval-email-skip-${generatedId}`
  const normalizedRecipients = recipients.map(
    ([exemptionNumber, email]): ExemptionApprovalRecipient => [
      exemptionNumber,
      normalizeTrimmedText(email),
    ],
  )
  const recipientsValid =
    normalizedRecipients.length > 0 &&
    normalizedRecipients.every(([, email]) => isValidApprovalEmail(email))

  return (
    <Modal
      open
      passiveModal
      modalHeading={recipients.length === 1 ? 'Send approval notification' : 'Send notifications'}
      aria-label={recipients.length === 1 ? 'Send approval notification' : 'Send notifications'}
      className="lexis-confirmation-modal exemption-approval-email-modal"
      selectorPrimaryFocus={`#${skipButtonId}`}
      preventCloseOnClickOutside={sending}
      onRequestClose={() => {
        if (!sending) {
          onSkip()
        }
      }}
    >
      <div className="lexis-confirmation-modal__body">
        <p className="lexis-confirmation-modal__description">
          Approval is complete. Review the applicant{' '}
          {recipients.length === 1 ? 'recipient' : 'recipients'} before sending{' '}
          {recipients.length === 1 ? 'this notification' : 'these notifications'}.
        </p>
        {recipients.map(([exemptionNumber, email], index) => {
          const valid = isValidApprovalEmail(email)
          return (
            <TextInput
              key={exemptionNumber}
              id={`exemption-approval-recipient-${index}`}
              type="email"
              labelText={requiredLabel(`Recipient for exemption ${exemptionNumber}`)}
              value={email}
              invalid={!valid}
              invalidText="Enter one valid email address."
              disabled={sending}
              onChange={(event) => {
                const nextRecipients = recipients.map(
                  (recipient, recipientIndex): ExemptionApprovalRecipient =>
                    recipientIndex === index
                      ? [recipient[0], event.currentTarget.value]
                      : recipient,
                )
                onRecipientsChange(nextRecipients)
              }}
            />
          )
        })}
      </div>
      <div className="lexis-confirmation-modal__actions">
        <Button id={skipButtonId} kind="tertiary" disabled={sending} onClick={onSkip}>
          {recipients.length === 1 ? 'Skip notification' : 'Skip notifications'}
        </Button>
        <Button
          kind="primary"
          disabled={sending || !recipientsValid}
          renderIcon={sending ? SendingIcon : undefined}
          onClick={() => {
            if (!sending && recipientsValid) {
              onSend(normalizedRecipients)
            }
          }}
        >
          {sending ? 'Sending…' : recipients.length === 1 ? 'Send' : 'Send all'}
        </Button>
      </div>
    </Modal>
  )
}

export default ExemptionApprovalEmailModal
