import type { ActionResult, ActionResultItem } from '@/utils/action-result'
import { sanitizeNotificationText } from '@/utils/notification-messages'

/** What happened to the approval email of an exemption that was approved. */
export type ApprovalEmailResult =
  | { status: 'sent'; ownerEmail: string; agentEmail: string }
  | { status: 'skipped' }
  | { status: 'notSent'; reason: string }
  | { status: 'unknown' }

export type ExemptionApprovalFailure = {
  exemptionNumber: string
  message: string
}

/** The outcome of one approval dialog, for every exemption it was opened with. */
export type ExemptionApprovalReport = {
  approved: { exemptionNumber: string; email: ApprovalEmailResult }[]
  failures: ExemptionApprovalFailure[]
  unconfirmedNumbers: string[]
  /** Server warnings and follow-up advice for the approvals that went through. */
  notes: string[]
}

type ItemLink = (exemptionNumber: string) => Pick<ActionResultItem, 'to' | 'state'>

const EMAIL_NOT_SENT_REASON = 'An approval email can’t be sent for this exemption.'
const APPROVAL_FAILED_REASON = 'The exemption could not be approved.'

const exemptionCount = (count: number) => `${count} ${count === 1 ? 'exemption' : 'exemptions'}`

const sentence = (text: string) => {
  const trimmed = text.trim()
  return !trimmed || /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`
}

const reason = (text: string, fallback: string) =>
  sentence(sanitizeNotificationText(text, fallback) || fallback)

const recipients = ({ ownerEmail, agentEmail }: { ownerEmail: string; agentEmail: string }) =>
  [ownerEmail && `the owner (${ownerEmail})`, agentEmail && `the agent (${agentEmail})`]
    .filter(Boolean)
    .join(' and ')

const emailNotice = (email: ApprovalEmailResult): string => {
  switch (email.status) {
    case 'sent':
      return `Approval email sent to ${recipients(email)}.`
    case 'skipped':
      return 'No approval email was sent.'
    case 'notSent':
      return `The approval email was not sent. ${reason(email.reason, EMAIL_NOT_SENT_REASON)}`
    case 'unknown':
      return 'The approval email status could not be confirmed. Check whether it was sent before sending it again.'
  }
}

const joined = (parts: string[]) => parts.filter(Boolean).join(' ')

/**
 * Page notifications for an approval: approved exemptions, those that need attention, and those
 * that were not approved, each listed by exemption. A single exemption gets one notification.
 */
export const exemptionApprovalResults = (
  { approved, failures, unconfirmedNumbers, notes }: ExemptionApprovalReport,
  itemLink: ItemLink = () => ({}),
): ActionResult[] => {
  const item = (exemptionNumber: string, text: string): ActionResultItem => ({
    id: exemptionNumber,
    text,
    ...itemLink(exemptionNumber),
  })

  if (approved.length === 1 && failures.length === 0 && unconfirmedNumbers.length === 0) {
    const [{ email }] = approved
    return [
      {
        kind:
          notes.length || email.status === 'notSent' || email.status === 'unknown'
            ? 'warning'
            : 'success',
        title: 'Exemption approved and now Active.',
        message: joined([emailNotice(email), ...notes]),
      },
    ]
  }

  const results: ActionResult[] = []
  if (approved.length) {
    const sent = approved.filter(({ email }) => email.status === 'sent')
    const skipped = approved.every(({ email }) => email.status === 'skipped')
    results.push({
      kind: notes.length ? 'warning' : 'success',
      title: joined([
        `${exemptionCount(approved.length)} approved and now Active.`,
        sent.length ? `Approval ${sent.length === 1 ? 'email' : 'emails'} sent:` : '',
      ]),
      message: joined([skipped ? 'Approval emails were not sent.' : '', ...notes]),
      items: (skipped ? approved : sent).map(({ exemptionNumber, email }) =>
        item(exemptionNumber, email.status === 'sent' ? ` to ${recipients(email)}.` : ''),
      ),
    })
  }

  const emailAttention = approved.flatMap(({ exemptionNumber, email }) =>
    email.status === 'notSent' || email.status === 'unknown'
      ? [item(exemptionNumber, `: ${emailNotice(email)}`)]
      : [],
  )
  const unconfirmedAttention = unconfirmedNumbers.map((exemptionNumber) =>
    item(
      exemptionNumber,
      ': The approval could not be confirmed and no email was sent. Check its current status before approving again.',
    ),
  )
  const attention = [...emailAttention, ...unconfirmedAttention]
  if (attention.length) {
    const count = attention.length
    results.push({
      kind: 'warning',
      title: !emailAttention.length
        ? `${count} ${count === 1 ? 'approval' : 'approvals'} could not be confirmed`
        : !unconfirmedAttention.length
          ? `${count} approval ${count === 1 ? 'email needs' : 'emails need'} attention`
          : `${exemptionCount(count)} need attention`,
      message: '',
      items: attention,
    })
  }

  if (failures.length) {
    const single = failures.length === 1
    results.push({
      kind: 'error',
      title: `${exemptionCount(failures.length)} ${single ? 'was' : 'were'} not approved`,
      message: `${single ? 'It stays' : 'They stay'} in New status and no ${single ? 'email was' : 'emails were'} sent. Correct the details below, then approve again.`,
      items: failures.map(({ exemptionNumber, message }) =>
        item(exemptionNumber, `: ${reason(message, APPROVAL_FAILED_REASON)}`),
      ),
    })
  }
  return results
}
