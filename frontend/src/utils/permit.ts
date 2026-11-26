import { isValidIsoDate } from '@/pages/shared/create-form-utils'
import { formatIsoDateParts } from '@/utils/date'

export const formatPermitNumber = (
  permitNumber: string | number | null | undefined,
  status: string | null | undefined,
): string => {
  const number = String(permitNumber ?? '').trim()
  if (!number) return ''

  const normalizedStatus = status?.trim().toUpperCase() ?? ''
  return normalizedStatus === 'ACT' || normalizedStatus === 'ACTIVE'
    ? `${number} (Pending)`
    : number
}

export const formatPermitStatus = (
  statusCode: string | null | undefined,
  statusDescription?: string | null | undefined,
): string => {
  const code = statusCode?.trim() ?? ''
  const description = statusDescription?.trim() ?? ''
  const normalizedCode = code.toUpperCase()
  const normalizedDescription = description.toUpperCase()
  const isPaymentPending =
    normalizedCode === 'PPD' ||
    normalizedCode === 'PAYMENT PENDING' ||
    normalizedDescription === 'PPD' ||
    normalizedDescription === 'PAYMENT PENDING'

  return isPaymentPending ? 'Payment pending' : description || code
}

const PERMIT_TERM_DAYS = 180

const addDaysToIsoDate = (isoDate: string, days: number): string => {
  const [year, month, day] = isoDate.split('-').map(Number)
  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, day + days)
  return formatIsoDateParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate())
}

/**
 * Legacy's default for a blank permit expiry: 180 days after the issued date, or the exemption
 * expiry when that is sooner and still after the submit and issued dates. Null leaves it blank.
 */
export const defaultPermitExpiryDate = ({
  issueDate,
  submitDate,
  expiryDate,
  exemptionExpiryDate = '',
}: {
  issueDate: string
  submitDate: string
  expiryDate: string
  exemptionExpiryDate?: string
}): string | null => {
  if (expiryDate.trim() || !issueDate.trim() || !isValidIsoDate(issueDate)) return null

  const termExpiryDate = addDaysToIsoDate(issueDate, PERMIT_TERM_DAYS)
  if (termExpiryDate <= submitDate || termExpiryDate <= issueDate) return null

  const exemptionExpiresFirst =
    exemptionExpiryDate > submitDate &&
    exemptionExpiryDate > issueDate &&
    termExpiryDate > exemptionExpiryDate
  return exemptionExpiresFirst ? exemptionExpiryDate : termExpiryDate
}
