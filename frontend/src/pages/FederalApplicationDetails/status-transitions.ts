export type FederalStatusTransition = {
  code: 'APP' | 'REJ' | 'WDN'
  label: string
}

const APPROVE_TRANSITION: FederalStatusTransition = { code: 'APP', label: 'Approved' }
const REVIEW_OUTCOME_TRANSITIONS: FederalStatusTransition[] = [
  { code: 'REJ', label: 'Rejected' },
  { code: 'WDN', label: 'Withdrawn' },
]

const normalizedIsoDate = (value: string | null | undefined): string | null => {
  const normalized = value?.trim() ?? ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null

  const parsed = new Date(`${normalized}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === normalized
    ? normalized
    : null
}

export const allowedFederalStatusTransitions = (
  currentStatus: string | null | undefined,
  listingDate: string | null | undefined,
  businessToday: string,
): FederalStatusTransition[] => {
  const normalizedStatus = currentStatus?.trim().toUpperCase() ?? ''
  if (normalizedStatus === 'NEW' || normalizedStatus === 'PND') {
    return [APPROVE_TRANSITION]
  }
  if (normalizedStatus !== 'APP') return []

  const normalizedListingDate = normalizedIsoDate(listingDate)
  const normalizedToday = normalizedIsoDate(businessToday)
  if (!normalizedListingDate || !normalizedToday || normalizedToday > normalizedListingDate) {
    return []
  }
  return REVIEW_OUTCOME_TRANSITIONS
}

export const federalStatusReadOnlyMessage = (
  currentStatus: string | null | undefined,
  listingDate: string | null | undefined,
  businessToday: string,
): string => {
  const normalizedStatus = currentStatus?.trim().toUpperCase() ?? 'UNKNOWN'
  if (normalizedStatus === 'APP') {
    const normalizedListingDate = normalizedIsoDate(listingDate)
    const normalizedToday = normalizedIsoDate(businessToday)
    if (!normalizedListingDate) {
      return 'Status changes are read only because a valid listing date is unavailable.'
    }
    if (!normalizedToday) {
      return 'Status changes are read only because the Vancouver business date is unavailable.'
    }
    if (normalizedToday > normalizedListingDate) {
      return 'Status changes are read only because the listing day has passed.'
    }
  }
  return `No status changes are available from ${normalizedStatus}.`
}
