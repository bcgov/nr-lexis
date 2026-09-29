import { WarningFilled } from '@carbon/icons-react'
import { Button, Checkbox, Loading, TextInput } from '@carbon/react'
import { useEffect, useId, useRef, useState } from 'react'
import Modal from '@/components/Modal'
import { AppNotification } from '@/components/AppNotification'
import { ActionResultNotification } from '@/components/ActionResultNotification'
import {
  exemptionApprovalResults,
  type ApprovalEmailResult,
  type ExemptionApprovalFailure,
  type ExemptionApprovalReport,
} from '@/components/exemption-approval-results'
import {
  fetchExemptionApprovalRecipients,
  sendExemptionApprovalNotifications,
  type ExemptionApprovalContacts,
  type ExemptionApprovalRecipientPreview,
} from '@/service/provincial-exemption-detail-service'
import { formatBusinessIsoDate } from '@/utils/date'
import { isValidEmail } from '@/utils/text'
import { isClientErrorResponse } from '@/utils/http-error'
import { sanitizeNotificationText } from '@/utils/notification-messages'
import { firstStringField, isRecord } from '@/utils/record'
import { requiredLabel } from '@/utils/required-label'
import type { ActionResult } from '@/utils/action-result'
import './ConfirmationModal/ConfirmationModal.css'
import './ExemptionApprovalModal.css'

export type ExemptionApprovalOutcome = {
  approvedNumbers: string[]
  message: string
  warning: boolean
  unconfirmed?: boolean
  /** Per-exemption results, reported when approving several exemptions at once. */
  failures?: ExemptionApprovalFailure[]
  unconfirmedNumbers?: string[]
  /** Server warnings and follow-up advice for the approvals that went through. */
  notes?: string[]
}

type Props = {
  exemptionNumbers: string[]
  onApprove: () => Promise<ExemptionApprovalOutcome>
  onComplete: (report: ExemptionApprovalReport) => void
  onClose: () => void
  /** Reports whether an approval or notification request is in flight. */
  onBusyChange?: (busy: boolean) => void
}

type RecipientRow = ExemptionApprovalRecipientPreview & {
  ownerOnFile: boolean
  agentOnFile: boolean
}

type ContactField = 'ownerEmail' | 'agentEmail'

const validAddress = (email: string) =>
  !email.trim() ||
  (email.trim().length <= 254 && !/[,:;]/.test(email) && isValidEmail(email.trim()))

const contactFields = (row: RecipientRow): ContactField[] =>
  row.agentApplicable ? ['ownerEmail', 'agentEmail'] : ['ownerEmail']

const missingAddress = (row: RecipientRow) =>
  contactFields(row).every((field) => !row[field].trim())

const needsRecipientInput = (row: RecipientRow) =>
  row.sendable &&
  (missingAddress(row) || contactFields(row).some((field) => !validAddress(row[field])))

const toContacts = (row: RecipientRow): ExemptionApprovalContacts => ({
  exemptionNumber: row.exemptionNumber,
  ownerEmail: row.ownerEmail.trim(),
  agentEmail: row.agentApplicable ? row.agentEmail.trim() : '',
})

const withReason = (exemptionNumber: string, message: string | undefined) => {
  const reason = message?.trim().replace(/\.$/, '')
  return reason ? `${exemptionNumber} (${reason})` : exemptionNumber
}

/** The server's reason for rejecting a request, or blank when it gave none that can be shown. */
const responseReason = (error: unknown) => {
  const data = isRecord(error) && isRecord(error.response) ? error.response.data : undefined
  return sanitizeNotificationText(
    isRecord(data) ? firstStringField(data, ['detail', 'message']) : '',
    '',
  )
}

const sentTo = (row: RecipientRow): ApprovalEmailResult => {
  const { ownerEmail, agentEmail } = toContacts(row)
  return { status: 'sent', ownerEmail, agentEmail }
}

const ExemptionApprovalModal = ({
  exemptionNumbers,
  onApprove,
  onComplete,
  onClose,
  onBusyChange,
}: Props) => {
  const [numbers] = useState(exemptionNumbers)
  const [approvalDate] = useState(formatBusinessIsoDate)
  const [recipients, setRecipients] = useState<RecipientRow[]>([])
  const [editing, setEditing] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [certified, setCertified] = useState(false)
  const [sendEmail, setSendEmail] = useState(true)
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [pending, setPending] = useState(false)
  const pendingRef = useRef(false)
  const [error, setError] = useState('')
  const [approvalUnconfirmed, setApprovalUnconfirmed] = useState(false)
  const [approved, setApproved] = useState<ExemptionApprovalOutcome | null>(null)
  // Exemptions that were not approved, listed the way the page lists them.
  const [outcomeResults, setOutcomeResults] = useState<ActionResult[]>([])
  // The approval email outcome of each approved exemption, reported when the dialog finishes.
  const emailResultsRef = useRef(new Map<string, ApprovalEmailResult>())
  // Retry wording applies only once a notification send has finished without queueing them all.
  const [notificationAttempted, setNotificationAttempted] = useState(false)
  const [queueStatusUnknown, setQueueStatusUnknown] = useState(false)
  // A send that ended without a definite answer (5xx or no response) may already have emailed
  // the applicant. It gets one retry, accepting a possible duplicate, and after that the status
  // can only be verified.
  const [sendUncertain, setSendUncertain] = useState(false)
  const id = useId().replaceAll(':', '')
  const plural = numbers.length > 1
  const retrying = Boolean(approved) && notificationAttempted
  const title = retrying
    ? queueStatusUnknown
      ? 'Approval notification status unknown'
      : 'Retry approval notifications'
    : plural
      ? `Approve ${numbers.length} exemptions`
      : `Approve exemption ${numbers[0]}`

  useEffect(() => {
    onBusyChange?.(pending)
  }, [onBusyChange, pending])
  useEffect(() => () => onBusyChange?.(false), [onBusyChange])

  useEffect(() => {
    let active = true
    void fetchExemptionApprovalRecipients(numbers)
      .then((previews) => {
        if (!active) return
        const rows = numbers.map((number) => previews.find((row) => row.exemptionNumber === number))
        if (rows.some((row) => !row)) {
          throw new Error('Missing approval recipients')
        }
        const loaded = rows
          .filter((row): row is ExemptionApprovalRecipientPreview => Boolean(row))
          .map((row) => ({
            ...row,
            ownerOnFile: Boolean(row.ownerEmail.trim()),
            agentOnFile: Boolean(row.agentEmail.trim()),
          }))
        setRecipients(loaded)
        setEditing(
          loaded
            .filter((row) => row.sendable && (missingAddress(row) || row.message))
            .map((row) => row.exemptionNumber),
        )
      })
      .catch(() => {
        if (active)
          setLoadError(
            'Approval recipients could not be loaded. Close and try again, or clear Send approval email to approve without a notification.',
          )
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [numbers])

  const rowsNeedingInput = recipients.filter(needsRecipientInput)
  const recordEmail = (rows: RecipientRow[], result: (row: RecipientRow) => ApprovalEmailResult) =>
    rows.forEach((row) => emailResultsRef.current.set(row.exemptionNumber, result(row)))
  const finish = (outcome: ExemptionApprovalOutcome) => {
    onComplete({
      approved: outcome.approvedNumbers.map((exemptionNumber) => ({
        exemptionNumber,
        email: emailResultsRef.current.get(exemptionNumber) ?? { status: 'unknown' },
      })),
      failures: outcome.failures ?? [],
      unconfirmedNumbers: outcome.unconfirmedNumbers ?? [],
      notes: outcome.notes ?? [],
    })
    onClose()
  }
  const close = () => {
    if (pendingRef.current) return
    if (approved) finish(approved)
    else onClose()
  }
  const confirm = async () => {
    if (pendingRef.current || queueStatusUnknown || (sendEmail && (loading || loadError))) return
    if ((!approved && !certified) || (sendEmail && rowsNeedingInput.length)) {
      setSubmitAttempted(true)
      setEditing((current) => [
        ...new Set([...current, ...rowsNeedingInput.map((row) => row.exemptionNumber)]),
      ])
      return
    }
    pendingRef.current = true
    setPending(true)
    setError('')
    setOutcomeResults([])
    setApprovalUnconfirmed(false)
    let sendingNotifications = false
    let sentRows: RecipientRow[] = []
    const retryingUncertainSend = sendUncertain
    const stopAfterUncertainRetry = (rows: RecipientRow[]) => {
      recordEmail(rows, () => ({ status: 'unknown' }))
      setRecipients(rows)
      setQueueStatusUnknown(true)
      setError(
        'Approval is complete, but notification queue status could not be confirmed. Verify whether notifications were queued before resending.',
      )
    }
    try {
      const outcome = approved ?? (await onApprove())
      if (!outcome.approvedNumbers.length) {
        setApprovalUnconfirmed(Boolean(outcome.unconfirmed))
        setError(outcome.message)
        if (outcome.failures?.length || outcome.unconfirmedNumbers?.length) {
          setOutcomeResults(
            exemptionApprovalResults({
              approved: [],
              failures: outcome.failures ?? [],
              unconfirmedNumbers: outcome.unconfirmedNumbers ?? [],
              notes: [],
            }),
          )
        }
        return
      }
      if (!sendEmail) {
        outcome.approvedNumbers.forEach((exemptionNumber) =>
          emailResultsRef.current.set(exemptionNumber, { status: 'skipped' }),
        )
        finish(outcome)
        return
      }
      const approvedRows = recipients.filter((row) =>
        outcome.approvedNumbers.includes(row.exemptionNumber),
      )
      if (!approved) {
        recordEmail(
          approvedRows.filter((row) => !row.sendable),
          (row) => ({ status: 'notSent', reason: row.message }),
        )
      }
      const toSend = approvedRows.filter((row) => row.sendable)
      // Once approval succeeds, retries must only send outstanding notifications.
      setApproved(outcome)
      setRecipients(toSend)
      if (!toSend.length) {
        finish(outcome)
        return
      }
      sendingNotifications = true
      sentRows = toSend
      const response = await sendExemptionApprovalNotifications(toSend.map(toContacts))
      const outcomes = new Map(response.outcomes.map((row) => [row.exemptionNumber, row]))
      const remaining = toSend.filter((row) => outcomes.get(row.exemptionNumber)?.queued !== true)
      recordEmail(toSend, (row) => {
        const rowOutcome = outcomes.get(row.exemptionNumber)
        return rowOutcome?.queued === true
          ? sentTo(row)
          : { status: 'notSent', reason: rowOutcome?.message ?? '' }
      })
      if (!remaining.length) {
        finish(outcome)
      } else if (retryingUncertainSend) {
        // The earlier uncertain send may have queued these, so there is no second retry.
        setNotificationAttempted(true)
        stopAfterUncertainRetry(remaining)
      } else {
        setNotificationAttempted(true)
        setRecipients(remaining)
        setError(
          `Approval is complete. Notifications were not queued for ${remaining
            .map((row) =>
              withReason(row.exemptionNumber, outcomes.get(row.exemptionNumber)?.message),
            )
            .join(', ')}. Review the recipients and retry.`,
        )
      }
    } catch (requestError) {
      if (sendingNotifications) {
        setNotificationAttempted(true)
        if (retryingUncertainSend) {
          stopAfterUncertainRetry(sentRows)
          return
        }
        // Only a rejected request (4xx) means nothing was queued.
        if (isClientErrorResponse(requestError)) {
          const reason = responseReason(requestError)
          recordEmail(sentRows, () => ({ status: 'notSent', reason }))
          setError(
            `Approval is complete. Notifications were not queued for ${sentRows
              .map((row) => withReason(row.exemptionNumber, reason))
              .join(', ')}. Review the recipients and retry.`,
          )
          return
        }
        recordEmail(sentRows, () => ({ status: 'unknown' }))
        setSendUncertain(true)
        setError(
          `Approval is complete, but notification queue status could not be confirmed for ${sentRows
            .map((row) => row.exemptionNumber)
            .join(
              ', ',
            )}. You can retry once; if the first send went through, the applicant may receive the email twice.`,
        )
      } else {
        setError('The request could not be completed. Check the current status before retrying.')
      }
    } finally {
      pendingRef.current = false
      setPending(false)
    }
  }

  const showEmailErrorUnderCheckbox =
    submitAttempted && sendEmail && !plural && !retrying && rowsNeedingInput.some(missingAddress)

  return (
    <Modal
      open
      passiveModal
      size="md"
      modalHeading={title}
      aria-label={title}
      className="lexis-confirmation-modal exemption-approval-modal"
      preventCloseOnClickOutside
      selectorPrimaryFocus={`#approval-cancel-${id}`}
      onRequestClose={close}
    >
      <div className="lexis-confirmation-modal__body">
        {!retrying && (
          <>
            {plural && (
              <p>
                You are about to approve these exemptions: <strong>{numbers.join(', ')}.</strong>
              </p>
            )}
            <p>
              By checking the box below you certify that{' '}
              {plural ? 'these exemptions have' : 'this exemption has'} been approved.{' '}
              {plural ? 'They' : 'It'} will be marked with an approval date of {approvalDate}.
            </p>
            <div>
              <p>{requiredLabel('Certification')}</p>
              <Checkbox
                id={`approval-certified-${id}`}
                checked={certified}
                disabled={pending}
                labelText={`I certify that ${plural ? 'these exemptions have' : 'this exemption has'} been approved`}
                invalid={submitAttempted && !certified}
                invalidText="Certification is required"
                onChange={(_, { checked }) => setCertified(Boolean(checked))}
              />
            </div>
            <hr />
            <div className="exemption-approval-modal__send">
              <Checkbox
                id={`approval-send-${id}`}
                checked={sendEmail}
                disabled={pending}
                labelText={plural ? 'Send approval emails' : 'Send approval email'}
                onChange={(_, { checked }) => setSendEmail(Boolean(checked))}
              />
              {showEmailErrorUnderCheckbox && (
                <p className="exemption-approval-modal__error" role="alert">
                  <WarningFilled aria-hidden="true" />
                  <span>
                    Enter at least one email, or clear “Send approval email” to notify the applicant
                    another way.
                  </span>
                </p>
              )}
            </div>
          </>
        )}
        {sendEmail && (
          <>
            <p>
              {retrying
                ? queueStatusUnknown
                  ? 'Approval is complete. Notification status must be checked before sending again.'
                  : 'Approval is complete. Retry only the notifications that were not queued.'
                : 'Approval emails go to the recipients below. At least one email address is needed.'}
            </p>
            {loading && (
              <Loading small withOverlay={false} description="Loading approval recipients…" />
            )}
            {loadError && (
              <AppNotification kind="error" title="Recipients unavailable" subtitle={loadError} />
            )}
            {recipients.map((row) => {
              const isEditing = editing.includes(row.exemptionNumber)
              const showRowError =
                submitAttempted && (plural || retrying) && row.sendable && missingAddress(row)
              const update = (field: ContactField, value: string) =>
                setRecipients((current) =>
                  current.map((item) =>
                    item.exemptionNumber === row.exemptionNumber
                      ? { ...item, [field]: value }
                      : item,
                  ),
                )
              return (
                <section
                  className={`exemption-approval-modal__recipient${plural ? ' exemption-approval-modal__recipient--batch' : ''}`}
                  key={row.exemptionNumber}
                  aria-label={`Recipients for exemption ${row.exemptionNumber}`}
                >
                  {plural && <h3>{row.exemptionNumber}</h3>}
                  <div className="exemption-approval-modal__recipient-body">
                    {!row.sendable ? (
                      <p className="exemption-approval-modal__error">
                        {row.message || 'An approval email can’t be sent for this exemption.'}
                      </p>
                    ) : (
                      <>
                        {row.message && (
                          <p className="exemption-approval-modal__note">{row.message}</p>
                        )}
                        {showRowError && (
                          <p className="exemption-approval-modal__error" role="alert">
                            {retrying
                              ? 'Enter at least one email to retry, or close to notify the applicant another way.'
                              : 'Enter at least one email address, or clear “Send approval emails”.'}
                          </p>
                        )}
                        {isEditing ? (
                          contactFields(row).map((field) => {
                            const onFile =
                              field === 'ownerEmail' ? row.ownerOnFile : row.agentOnFile
                            return (
                              <TextInput
                                key={field}
                                id={`approval-${id}-${row.exemptionNumber}-${field}`}
                                type="email"
                                labelText={field === 'ownerEmail' ? 'Owner email' : 'Agent email'}
                                value={row[field]}
                                helperText={
                                  onFile
                                    ? 'Changes apply to this approval only.'
                                    : 'No email on file. The email you enter applies to this approval only.'
                                }
                                disabled={pending || queueStatusUnknown}
                                invalid={!validAddress(row[field])}
                                invalidText="Enter one valid email address."
                                onChange={(event) => update(field, event.currentTarget.value)}
                              />
                            )
                          })
                        ) : (
                          <div className="exemption-approval-modal__recipient-summary">
                            <dl>
                              <dt>Owner email</dt>
                              <dd>{row.ownerEmail || '—'}</dd>
                              {row.agentApplicable && (
                                <>
                                  <dt>Agent email</dt>
                                  <dd>{row.agentEmail || '—'}</dd>
                                </>
                              )}
                            </dl>
                            <Button
                              kind="ghost"
                              size="sm"
                              disabled={pending || queueStatusUnknown}
                              onClick={() =>
                                setEditing((current) => [...current, row.exemptionNumber])
                              }
                            >
                              Edit recipients
                            </Button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </section>
              )
            })}
          </>
        )}
      </div>
      {outcomeResults.length > 0
        ? outcomeResults.map((result) => (
            <ActionResultNotification key={result.kind} result={result} />
          ))
        : error && (
            <AppNotification
              kind={approvalUnconfirmed && !retrying ? 'warning' : 'error'}
              title={
                retrying
                  ? 'Notification incomplete'
                  : approvalUnconfirmed
                    ? 'Approval status unconfirmed'
                    : 'Approval failed'
              }
              subtitle={error}
            />
          )}
      <div className="lexis-confirmation-modal__actions">
        <Button id={`approval-cancel-${id}`} kind="tertiary" disabled={pending} onClick={close}>
          {retrying ? 'Close' : 'Cancel'}
        </Button>
        <Button
          kind="primary"
          disabled={pending || queueStatusUnknown || (sendEmail && (loading || Boolean(loadError)))}
          onClick={() => void confirm()}
        >
          {pending
            ? approved
              ? 'Sending…'
              : 'Approving…'
            : retrying
              ? queueStatusUnknown
                ? 'Queue status unknown'
                : 'Retry notifications'
              : sendEmail
                ? plural
                  ? 'Approve and send emails'
                  : 'Approve and send email'
                : plural
                  ? 'Approve exemptions'
                  : 'Approve exemption'}
        </Button>
      </div>
    </Modal>
  )
}

export default ExemptionApprovalModal
