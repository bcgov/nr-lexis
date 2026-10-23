import type { OfferSubmissionResult } from '@/service/create-submit-service'

export type OfferSaveNotice = {
  kind: 'success' | 'warning'
  title: string
  message: string
}

/**
 * INTENTIONAL_LEGACY_DIVERGENCE(OFFER_CREATE_AND_RECORD): the result of a saved offer, whether it
 * was withdrawn, and who its email reached. The offering client is another company, so the notice
 * never names email addresses.
 */
export const offerSaveNotice = (
  result: Pick<OfferSubmissionResult, 'emailRequired' | 'applicantEmailFound' | 'warnings'>,
  withdrawn = false,
): OfferSaveNotice => {
  const title = withdrawn ? 'Offer withdrawn.' : 'Offer saved.'
  if (!result.emailRequired) {
    return { kind: 'success', title, message: '' }
  }
  if (!result.applicantEmailFound) {
    return {
      kind: 'warning',
      title,
      message: `No email was sent. Let the applicant and the regional office know about your ${
        withdrawn ? 'withdrawal' : 'offer'
      } another way.`,
    }
  }
  if (result.warnings.length > 0) {
    return {
      kind: 'warning',
      title,
      message: 'Email notification sent to the applicant. Notify the regional office another way.',
    }
  }
  return {
    kind: 'success',
    title,
    message: 'Email notification sent to the applicant and the regional office.',
  }
}
