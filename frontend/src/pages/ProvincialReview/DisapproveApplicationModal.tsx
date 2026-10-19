import { WarningFilled } from '@carbon/icons-react'
import {
  Button,
  Checkbox,
  ComposedModal,
  FeatureFlags,
  Loading,
  ModalBody,
  ModalFooter,
  ModalHeader,
  TextArea,
  TextInput,
} from '@carbon/react'
import { Fragment, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { AppNotification } from '@/components/AppNotification'
import { useModalCloseDisabled } from '@/components/Modal/useModalCloseDisabled'
import PendingIcon from '@/components/PendingIcon'
import RequiredFieldsLegend from '@/components/RequiredFieldsLegend'
import SearchableSelect from '@/components/SearchableSelect'
import { isAgentApplicant } from '@/pages/shared/application-form-utils'
import { fetchApplicationClientData } from '@/service/application-client-lookup-service'
import {
  sendApplicationReviewStatusEmail,
  updateApplicationReviewStatus,
  type ApplicationReviewStatusUpdateResult,
} from '@/service/application-review-search-service'
import { fetchApplicationSummarySnapshot } from '@/service/provincial-application-items-service'
import { fetchCurrentApplicationRecordVersion } from '@/service/record-version-service'
import type { SearchOption } from '@/service/search-options-service'
import { displayValue } from '@/utils/display-value'
import { fieldErrorText } from '@/utils/field-error'
import { focusFirstInvalidField, focusedElement } from '@/utils/focus'
import { isClientErrorResponse } from '@/utils/http-error'
import { requiredLabel } from '@/utils/required-label'
import { isValidEmail, normalizeTrimmedText } from '@/utils/text'
import '@/components/ConfirmationModal/ConfirmationModal.css'
import '@/components/ExemptionApprovalModal.css'

const DISAPPROVE_DEFAULT_STATUS = 'REJ'
const REMARK_MAX_LENGTH = 250

const STATUS_REQUIRED = 'Application status is required.'
const REMARK_REQUIRED = 'Remark is required.'
const EMAIL_REQUIRED =
  'Enter at least one email address, or clear Send disapproval email to notify the applicant another way.'
const EMAIL_FORMAT = 'Enter an email address in the correct format, like name@example.com.'
const RECIPIENTS_UNAVAILABLE =
  'Recipients could not be loaded. Close and try again, or clear Send disapproval email to disapprove without an email.'
const DISAPPROVE_FAILED = 'The application could not be disapproved. Try again.'

/** What happened to the disapproval email once the status was saved. */
export type DisapprovalEmailResult =
  | { status: 'sent'; ownerEmail: string; agentEmail: string }
  | { status: 'skipped' }
  | { status: 'notSent' }
  | { status: 'unknown' }

export type DisapprovalOutcome = {
  applicationNumber: string
  statusCode: string
  statusLabel: string
  email: DisapprovalEmailResult
}

type Props = {
  applicationNumber: string
  /** Rejected and Withdrawn. */
  statusOptions: SearchOption[]
  initialStatusCode?: string
  initialRemark?: string
  /** Update an open record as soon as its status commits, before the separate email request. */
  onStatusSaved?: (result: ApplicationReviewStatusUpdateResult, remark: string) => void
  /**
   * Opened on the record's own page: the save is checked against the version the page loaded, so
   * a change made since then ends in a conflict instead of being saved over.
   */
  checkLoadedRecordVersion?: boolean
  /** The status is saved; the dialog has closed. */
  onComplete: (outcome: DisapprovalOutcome) => void
  /** Closed without saving. */
  onClose: () => void
  onBusyChange?: (busy: boolean) => void
}

type ContactField = 'ownerEmail' | 'agentEmail'

type Recipients = {
  ownerEmail: string
  agentEmail: string
  agentApplicable: boolean
  ownerOnFile: boolean
  agentOnFile: boolean
}

// Legacy stores "none" or "Not on file" for a client with no email.
const emailOnFile = (value: string | null | undefined): string => {
  const email = normalizeTrimmedText(value ?? '')
  const lowered = email.toLowerCase()
  return lowered === 'none' || lowered === 'not on file' ? '' : email
}

const validAddress = (email: string) =>
  !email.trim() ||
  (email.trim().length <= 254 && !/[,:;\s]/.test(email.trim()) && isValidEmail(email.trim()))

const responseReason = (error: unknown): string => {
  const data =
    typeof error === 'object' && error !== null && 'response' in error
      ? (error as { response?: { data?: unknown } }).response?.data
      : undefined
  if (typeof data === 'object' && data !== null) {
    const { detail, message } = data as { detail?: unknown; message?: unknown }
    if (typeof detail === 'string' && detail.trim()) return detail.trim()
    if (typeof message === 'string' && message.trim()) return message.trim()
  }
  return ''
}

const DisapproveApplicationModal = ({
  applicationNumber,
  statusOptions,
  initialStatusCode = DISAPPROVE_DEFAULT_STATUS,
  initialRemark = '',
  onStatusSaved,
  checkLoadedRecordVersion = false,
  onComplete,
  onClose,
  onBusyChange,
}: Props) => {
  const modalRef = useRef<HTMLDivElement>(null)
  // The control that opened the dialog, captured before the dialog moves focus inside.
  const [opener] = useState(focusedElement)
  const id = useId().replaceAll(':', '')
  const [statusCode, setStatusCode] = useState(initialStatusCode)
  const [remark, setRemark] = useState(initialRemark)
  const [sendEmail, setSendEmail] = useState(true)
  const [recipients, setRecipients] = useState<Recipients | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [editing, setEditing] = useState(false)
  const [touched, setTouched] = useState<Partial<Record<ContactField, boolean>>>({})
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [pending, setPending] = useState(false)
  const pendingRef = useRef(false)
  // Escape that closes an open menu, such as the status list, leaves the dialog open.
  const menuEscapeRef = useRef(false)
  const [saveError, setSaveError] = useState('')
  const loading = !recipients && !loadError

  useModalCloseDisabled(modalRef, pending)
  useEffect(() => {
    onBusyChange?.(pending)
  }, [onBusyChange, pending])
  useEffect(() => () => onBusyChange?.(false), [onBusyChange])

  // INTENTIONAL_LEGACY_DIVERGENCE(APPLICATION_DISAPPROVAL_CONTACTS): the owner's email, and the
  // agent's when the applicant is an agent, each from their own client location.
  useEffect(() => {
    let active = true
    const load = async () => {
      const summary = await fetchApplicationSummarySnapshot(applicationNumber)
      if (!summary) throw new Error('Application summary unavailable')
      const agentApplicable = isAgentApplicant(summary.applicantTypeCode)
      const [owner, agent] = await Promise.all([
        fetchApplicationClientData(summary.ownerClientNumber, summary.ownerClientLocationCode),
        agentApplicable
          ? fetchApplicationClientData(summary.agentClientNumber, summary.agentClientLocationCode)
          : Promise.resolve(null),
      ])
      const ownerEmail = emailOnFile(owner?.email)
      const agentEmail = agentApplicable ? emailOnFile(agent?.email) : ''
      return {
        ownerEmail,
        agentEmail,
        agentApplicable,
        ownerOnFile: Boolean(ownerEmail),
        agentOnFile: Boolean(agentEmail),
      }
    }
    void load()
      .then((loaded) => {
        if (active) setRecipients(loaded)
      })
      .catch((error) => {
        console.error(error)
        if (active) setLoadError(true)
      })
    return () => {
      active = false
    }
  }, [applicationNumber])

  const statusLabel =
    statusOptions.find((option) => option.value === statusCode)?.label ?? statusCode
  const fields: ContactField[] = recipients?.agentApplicable
    ? ['ownerEmail', 'agentEmail']
    : ['ownerEmail']
  const onFile = (field: ContactField) =>
    field === 'ownerEmail' ? recipients?.ownerOnFile : recipients?.agentOnFile
  const isInput = (field: ContactField) => editing || !onFile(field)
  const missingEmail = Boolean(recipients) && fields.every((field) => !recipients?.[field].trim())
  const invalidEmail = fields.some((field) => !validAddress(recipients?.[field] ?? ''))

  const statusError = submitAttempted && !statusCode ? STATUS_REQUIRED : ''
  const remarkError = submitAttempted && !remark.trim() ? REMARK_REQUIRED : ''
  const showEmailRequired = submitAttempted && sendEmail && missingEmail

  const close = () => {
    if (pendingRef.current) return
    onClose()
    if (opener) window.setTimeout(() => opener.focus())
  }

  const save = async () => {
    if (pendingRef.current) return
    setSubmitAttempted(true)
    setSaveError('')
    const emailProblem = sendEmail && (loading || loadError || missingEmail || invalidEmail)
    if (!statusCode || !remark.trim() || emailProblem) {
      if (sendEmail && invalidEmail) setEditing(true)
      requestAnimationFrame(() => {
        if (focusFirstInvalidField(modalRef.current)) return
        const target = loadError
          ? `disapprove-send-${id}`
          : missingEmail
            ? `disapprove-${id}-${fields[0]}`
            : ''
        if (target) document.getElementById(target)?.focus()
      })
      return
    }

    const payload = { statusCode, remark: remark.trim(), clientEmailAddress: '' }
    pendingRef.current = true
    setPending(true)
    let email: DisapprovalEmailResult = { status: 'skipped' }
    try {
      const recordVersion = checkLoadedRecordVersion
        ? undefined
        : await fetchCurrentApplicationRecordVersion(applicationNumber)
      const saved = await updateApplicationReviewStatus(applicationNumber, payload, recordVersion)
      if (!saved.valid || !saved.updated) {
        setSaveError(saved.message || DISAPPROVE_FAILED)
        return
      }
      onStatusSaved?.(saved, payload.remark)
      // The status is saved; from here only the email can fail, and the dialog closes either way.
      if (sendEmail && recipients) {
        const ownerEmail = recipients.ownerEmail.trim()
        const agentEmail = recipients.agentApplicable ? recipients.agentEmail.trim() : ''
        try {
          const sent = await sendApplicationReviewStatusEmail(applicationNumber, {
            ...payload,
            ownerEmail,
            agentEmail,
          })
          email = sent.success ? { status: 'sent', ownerEmail, agentEmail } : { status: 'notSent' }
        } catch (error) {
          console.error(error)
          // After a 5xx or lost response the email may still have been queued.
          email = { status: isClientErrorResponse(error) ? 'notSent' : 'unknown' }
        }
      }
    } catch (error) {
      console.error(error)
      setSaveError(responseReason(error) || DISAPPROVE_FAILED)
      return
    } finally {
      pendingRef.current = false
      setPending(false)
    }
    onComplete({ applicationNumber, statusCode, statusLabel, email })
  }

  const updateRecipient = (field: ContactField, value: string) => {
    setTouched((current) => ({ ...current, [field]: true }))
    setRecipients((current) => (current ? { ...current, [field]: value } : current))
  }

  const title = `Disapprove application ${applicationNumber}`

  return (
    <FeatureFlags enableFocusWrapWithoutSentinels>
      <ComposedModal
        open
        ref={modalRef}
        size="md"
        aria-label={title}
        className="lexis-confirmation-modal exemption-approval-modal application-disapprove-modal"
        preventCloseOnClickOutside
        selectorPrimaryFocus={`#disapprove-status-${id}`}
        onClose={() => {
          if (pendingRef.current || menuEscapeRef.current) return false
          close()
          return true
        }}
        onKeyDownCapture={(event: KeyboardEvent<HTMLDivElement>) => {
          const target = event.target
          if (
            event.key === 'Escape' &&
            target instanceof Element &&
            target.getAttribute('aria-expanded') === 'true'
          ) {
            menuEscapeRef.current = true
            // Carbon closes the dialog from the same keydown, on the document.
            window.setTimeout(() => {
              menuEscapeRef.current = false
            })
          }
        }}
      >
        <ModalHeader title={title} />
        <ModalBody hasScrollingContent>
          <div className="lexis-confirmation-modal__body">
            <RequiredFieldsLegend />
            <SearchableSelect
              id={`disapprove-status-${id}`}
              labelText={requiredLabel('Application status')}
              required
              value={statusCode}
              placeholder="Select application status"
              options={statusOptions}
              disabled={pending}
              invalid={Boolean(statusError)}
              invalidText={statusError}
              onChange={(value) => setStatusCode(value.toUpperCase())}
            />
            <TextArea
              id={`disapprove-remark-${id}`}
              labelText={requiredLabel('Remark')}
              aria-required="true"
              helperText="Included in the email to the applicant."
              rows={4}
              enableCounter
              maxCount={REMARK_MAX_LENGTH}
              value={remark}
              disabled={pending}
              invalid={Boolean(remarkError)}
              invalidText={fieldErrorText(remarkError)}
              onChange={(event) => setRemark(event.target.value.slice(0, REMARK_MAX_LENGTH))}
            />
            <hr />
            <div className="exemption-approval-modal__send">
              <Checkbox
                id={`disapprove-send-${id}`}
                checked={sendEmail}
                disabled={pending}
                labelText="Send disapproval email"
                onChange={(_, { checked }) => setSendEmail(Boolean(checked))}
              />
              {showEmailRequired && (
                <p className="exemption-approval-modal__error" role="alert">
                  <WarningFilled aria-hidden="true" />
                  <span>{EMAIL_REQUIRED}</span>
                </p>
              )}
            </div>
            {sendEmail && (
              <>
                <p>
                  Disapproval emails go to the recipients below. At least one email address is
                  needed.
                </p>
                {loading && <Loading small withOverlay={false} description="Loading recipients…" />}
                {loadError && (
                  <AppNotification
                    kind="error"
                    title="Recipients unavailable"
                    subtitle={RECIPIENTS_UNAVAILABLE}
                  />
                )}
                {recipients && (
                  <section
                    className="exemption-approval-modal__recipient"
                    aria-label={`Recipients for application ${applicationNumber}`}
                  >
                    <div className="exemption-approval-modal__recipient-body">
                      {fields.some((field) => !isInput(field)) && (
                        <div className="exemption-approval-modal__recipient-summary">
                          <dl>
                            {fields
                              .filter((field) => !isInput(field))
                              .map((field) => (
                                <Fragment key={field}>
                                  <dt>{field === 'ownerEmail' ? 'Owner email' : 'Agent email'}</dt>
                                  <dd>{displayValue(recipients[field])}</dd>
                                </Fragment>
                              ))}
                          </dl>
                          <Button
                            kind="ghost"
                            size="md"
                            disabled={pending}
                            onClick={() => {
                              setEditing(true)
                              // The button leaves with the summary, so focus the first email.
                              requestAnimationFrame(() =>
                                document.getElementById(`disapprove-${id}-${fields[0]}`)?.focus(),
                              )
                            }}
                          >
                            Edit recipients
                          </Button>
                        </div>
                      )}
                      {fields.filter(isInput).map((field) => (
                        <TextInput
                          key={field}
                          id={`disapprove-${id}-${field}`}
                          type="email"
                          labelText={field === 'ownerEmail' ? 'Owner email' : 'Agent email'}
                          value={recipients[field]}
                          helperText={
                            onFile(field)
                              ? 'Changes apply to this email only.'
                              : 'No email on file. The email you enter applies to this email only.'
                          }
                          disabled={pending}
                          invalid={
                            (submitAttempted || Boolean(touched[field])) &&
                            !validAddress(recipients[field])
                          }
                          invalidText={EMAIL_FORMAT}
                          onChange={(event) => updateRecipient(field, event.currentTarget.value)}
                        />
                      ))}
                    </div>
                  </section>
                )}
              </>
            )}
          </div>
          {saveError && (
            <AppNotification
              focusOnReveal
              revealKey={saveError}
              kind="error"
              title="Disapproval failed"
              subtitle={saveError}
            />
          )}
        </ModalBody>
        <ModalFooter
          className="exemption-approval-modal__actions"
          loadingStatus={pending ? 'active' : 'inactive'}
        >
          <Button kind="tertiary" size="md" disabled={pending} onClick={close}>
            Cancel
          </Button>
          <Button
            kind="primary"
            size="md"
            disabled={pending}
            renderIcon={pending ? PendingIcon : undefined}
            onClick={() => void save()}
          >
            {pending
              ? 'Saving…'
              : sendEmail
                ? 'Disapprove and send email'
                : 'Disapprove application'}
          </Button>
        </ModalFooter>
      </ComposedModal>
    </FeatureFlags>
  )
}

export default DisapproveApplicationModal
