import { describe, expect, it } from 'vitest'
import { joinNonBlankText, normalizeFilterText } from '@/utils/text'

describe('text utilities', () => {
  it('normalizes user-entered filter text', () => {
    expect(normalizeFilterText('  Test Value  ')).toBe('test value')
  })

  it('joins non-blank label parts', () => {
    expect(joinNonBlankText(['123', '', ' Owner 00001012 ', '   ', 'RSI'], ' - ')).toBe(
      '123 -  Owner 00001012  - RSI',
    )
  })
})
