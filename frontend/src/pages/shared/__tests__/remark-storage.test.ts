import { describe, expect, it } from 'vitest'
import { storedRemarkLength, storedRemarkLengthError } from '@/pages/shared/remark-storage'

describe('remark storage', () => {
  it('counts &, < and > at their escaped length', () => {
    expect(storedRemarkLength('plain text')).toBe(10)
    expect(storedRemarkLength('a & b')).toBe(9)
    expect(storedRemarkLength('<x>')).toBe(9)
    expect(storedRemarkLength('&amp;')).toBe(9)
  })

  it('refuses a remark only when its stored length is over 250', () => {
    expect(storedRemarkLengthError('R'.repeat(250))).toBeNull()
    expect(storedRemarkLengthError(`${'R'.repeat(245)}&`)).toBeNull()
    expect(storedRemarkLengthError(`${'R'.repeat(246)}&`)).toBe(
      'Remark must not exceed 250 characters once saved. Each & counts as 5 characters, and each < or > as 4.',
    )
    expect(storedRemarkLengthError(`${'R'.repeat(247)}>`)).toBe(
      'Remark must not exceed 250 characters once saved. Each & counts as 5 characters, and each < or > as 4.',
    )
  })
})
