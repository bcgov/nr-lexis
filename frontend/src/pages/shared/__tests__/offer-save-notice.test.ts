import { describe, expect, it } from 'vitest'
import { offerSaveNotice } from '@/pages/shared/offer-save-notice'

const emailed = { emailRequired: true, applicantEmailFound: true, warnings: [] }

describe('offerSaveNotice', () => {
  it('says the email reached the applicant and the regional office', () => {
    expect(offerSaveNotice(emailed)).toEqual({
      kind: 'success',
      title: 'Offer saved.',
      message: 'Email notification sent to the applicant and the regional office.',
    })
  })

  it('says only that the offer saved when the save sends no email', () => {
    expect(offerSaveNotice({ ...emailed, emailRequired: false })).toEqual({
      kind: 'success',
      title: 'Offer saved.',
      message: '',
    })
  })

  it('warns that no email was sent when the applicant has no address', () => {
    expect(offerSaveNotice({ ...emailed, applicantEmailFound: false })).toEqual({
      kind: 'warning',
      title: 'Offer saved.',
      message:
        'No email was sent. Let the applicant and the regional office know about your offer another way.',
    })
  })

  it('warns that the regional office needs another notice when it has no mailbox', () => {
    expect(offerSaveNotice({ ...emailed, warnings: ['No regional recipient.'] })).toEqual({
      kind: 'warning',
      title: 'Offer saved.',
      message: 'Email notification sent to the applicant. Notify the regional office another way.',
    })
  })

  it('names a withdrawal on the save that adds it', () => {
    expect(offerSaveNotice(emailed, true)).toEqual({
      kind: 'success',
      title: 'Offer withdrawn.',
      message: 'Email notification sent to the applicant and the regional office.',
    })
    expect(offerSaveNotice({ ...emailed, applicantEmailFound: false }, true).message).toBe(
      'No email was sent. Let the applicant and the regional office know about your withdrawal another way.',
    )
  })
})
