import { describe, expect, it } from 'vitest'
import { defaultPermitExpiryDate, formatPermitNumber, formatPermitStatus } from '@/utils/permit'

describe('permit utilities', () => {
  it.each(['ACT', 'Active', ' active '])('marks active permit status %s as pending', (status) => {
    expect(formatPermitNumber('9020935', status)).toBe('9020935 (Pending)')
  })

  it.each(['COM', 'Completed', 'PPD', 'Payment Pending'])(
    'does not alter non-active permit status %s',
    (status) => {
      expect(formatPermitNumber('9020935', status)).toBe('9020935')
    },
  )

  it('returns blank when the permit number is absent', () => {
    expect(formatPermitNumber(null, 'ACT')).toBe('')
    expect(formatPermitNumber(' ', 'Active')).toBe('')
  })

  it.each([
    ['PPD', undefined, 'Payment pending'],
    [' ppd ', 'Payment Pending', 'Payment pending'],
    ['COM', 'Completed', 'Completed'],
    [null, null, ''],
  ])('formats %s as %s', (statusCode, statusDescription, expected) => {
    expect(formatPermitStatus(statusCode, statusDescription)).toBe(expected)
  })
})

describe('defaultPermitExpiryDate', () => {
  const blankExpiry = { issueDate: '2026-11-26', submitDate: '2026-11-25', expiryDate: '' }

  it('sets a blank expiry to 180 days after the issued date', () => {
    expect(defaultPermitExpiryDate(blankExpiry)).toBe('2027-05-25')
  })

  it('uses the exemption expiry when it comes first', () => {
    expect(defaultPermitExpiryDate({ ...blankExpiry, exemptionExpiryDate: '2027-01-31' })).toBe(
      '2027-01-31',
    )
  })

  it('ignores an exemption expiry on or before the issued date', () => {
    expect(defaultPermitExpiryDate({ ...blankExpiry, exemptionExpiryDate: '2026-11-26' })).toBe(
      '2027-05-25',
    )
  })

  it.each([
    ['an expiry is already entered', { ...blankExpiry, expiryDate: '2027-01-01' }],
    ['the issued date is blank', { ...blankExpiry, issueDate: '' }],
    ['the issued date is partial', { ...blankExpiry, issueDate: '2026-11-2' }],
    ['180 days is not after the submit date', { ...blankExpiry, submitDate: '2027-06-01' }],
  ])('leaves the expiry blank when %s', (_case, dates) => {
    expect(defaultPermitExpiryDate(dates)).toBeNull()
  })
})
