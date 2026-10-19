import type { ActionResult, ActionResultRecord } from '@/utils/action-result'
import type { DisapprovalOutcome } from './DisapproveApplicationModal'

export type ApplicationApprovalFailure = {
  applicationNumber: string
  message: string
}

type RecordLink = (applicationNumber: string) => Omit<ActionResultRecord, 'id'>

const applicationCount = (count: number) =>
  `${count} ${count === 1 ? 'application' : 'applications'}`

const sentence = (text: string) => {
  const trimmed = text.trim()
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`
}

/**
 * Page notifications for an approval: one for the approved applications and one for those that
 * were not approved. Approve on a row names its application in the title; a batch lists the
 * approved numbers after the title.
 */
export const approvalResults = (
  approvedNumbers: string[],
  failures: ApplicationApprovalFailure[],
  fromRow: boolean,
  link: RecordLink,
): ActionResult[] => {
  const record = (applicationNumber: string): ActionResultRecord => ({
    id: applicationNumber,
    ...link(applicationNumber),
  })
  const results: ActionResult[] = []
  if (approvedNumbers.length) {
    results.push(
      fromRow && approvedNumbers.length === 1
        ? {
            kind: 'success',
            title: `Application ${approvedNumbers[0]} approved.`,
            titleRecord: record(approvedNumbers[0]),
            message: '',
          }
        : {
            kind: 'success',
            title: `${applicationCount(approvedNumbers.length)} approved.`,
            message: '',
            records: approvedNumbers.map(record),
          },
    )
  }
  if (failures.length) {
    const single = failures.length === 1
    results.push({
      kind: 'error',
      title: `${applicationCount(failures.length)} ${single ? 'was' : 'were'} not approved`,
      message: `${single ? 'It stays in its' : 'They stay in their'} current status. Correct the details below, then approve again.`,
      items: failures.map(({ applicationNumber, message }) => ({
        ...record(applicationNumber),
        text: `: ${sentence(message)}`,
      })),
    })
  }
  return results
}

const emailRecipients = (ownerEmail: string, agentEmail: string) =>
  [ownerEmail && `the owner (${ownerEmail})`, agentEmail && `the agent (${agentEmail})`]
    .filter(Boolean)
    .join(' and ')

/**
 * The page notification for a disapproval: the status saved, and what happened to the email. The
 * number in the title links to its record unless the notice is shown on that record.
 */
export const disapprovalResult = (
  { applicationNumber, statusLabel, email }: DisapprovalOutcome,
  link?: RecordLink,
): ActionResult => {
  const base = {
    title: `Application ${applicationNumber} ${statusLabel.toLowerCase()}.`,
    ...(link && { titleRecord: { id: applicationNumber, ...link(applicationNumber) } }),
  }
  switch (email.status) {
    case 'sent':
      return {
        ...base,
        kind: 'success',
        message: `Disapproval email sent to ${emailRecipients(email.ownerEmail, email.agentEmail)}.`,
      }
    case 'skipped':
      return { ...base, kind: 'success', message: 'No disapproval email was sent.' }
    case 'notSent':
      return { ...base, kind: 'warning', message: 'The disapproval email could not be sent.' }
    case 'unknown':
      return {
        ...base,
        kind: 'warning',
        message:
          'The disapproval email status could not be confirmed. Check whether it was sent before sending it again.',
      }
  }
}

/** The text a screen reader hears for results shown without moving focus. */
export const resultAnnouncement = (results: ActionResult[]): string =>
  results.map(({ title, message }) => [title, message].filter(Boolean).join(' ')).join(' ')
