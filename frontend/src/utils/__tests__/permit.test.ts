import { describe, expect, it } from 'vitest'
import { formatPermitNumber, formatPermitStatus } from '@/utils/permit'

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
    ['PPD', undefined, 'Payment Pending'],
    [' ppd ', 'payment pending', 'Payment Pending'],
    ['COM', 'Completed', 'Completed'],
    [null, null, ''],
  ])('formats %s as %s', (statusCode, statusDescription, expected) => {
    expect(formatPermitStatus(statusCode, statusDescription)).toBe(expected)
  })
})
