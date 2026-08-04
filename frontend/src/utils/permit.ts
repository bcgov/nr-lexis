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
