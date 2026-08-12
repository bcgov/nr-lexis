export type FederalStatusTransition = {
  code: 'APP' | 'REJ' | 'WDN'
  label: string
}

// INTENTIONAL_LEGACY_DIVERGENCE(FEDERAL_DETAIL_APPROVAL_TRANSITION): The detail page exposes
// approval, with the backend enforcing the shared Application Review readiness validation.
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
