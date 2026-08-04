import { describe, expect, it } from 'vitest'
import { formatPermitNumber } from '@/utils/permit'

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
})
