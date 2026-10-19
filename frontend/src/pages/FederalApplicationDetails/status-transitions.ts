export type FederalStatusTransition = {
  code: 'REJ' | 'WDN'
  /** The status the application ends in. */
  label: string
  /** The header action that starts the change. */
  actionLabel: string
}

// New and pending federal applications are approved from Application Review, so the record only
// offers rejection or withdrawal of an approved application through its list date.
const REVIEW_OUTCOME_TRANSITIONS: FederalStatusTransition[] = [
  { code: 'WDN', label: 'Withdrawn', actionLabel: 'Withdraw' },
  { code: 'REJ', label: 'Rejected', actionLabel: 'Reject' },
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
  if (normalizedStatus !== 'APP') return []

  const normalizedListingDate = normalizedIsoDate(listingDate)
  const normalizedToday = normalizedIsoDate(businessToday)
  if (!normalizedListingDate || !normalizedToday || normalizedToday > normalizedListingDate) {
    return []
  }
  return REVIEW_OUTCOME_TRANSITIONS
}
