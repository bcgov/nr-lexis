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

  return isPaymentPending ? 'Payment Pending' : description || code
}
