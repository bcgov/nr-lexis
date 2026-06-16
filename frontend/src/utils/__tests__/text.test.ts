import { describe, expect, it } from 'vitest'
import {
  isValidEmail,
  joinNonBlankText,
  normalizeFilterText,
  normalizeTrimmedText,
  normalizeUpperText,
} from '@/utils/text'

describe('text utilities', () => {
  it('normalizes user-entered filter text', () => {
    expect(normalizeFilterText('  Test Value  ')).toBe('test value')
  })

  it('normalizes trimmed text without changing case', () => {
    expect(normalizeTrimmedText('  User@Example.ca  ')).toBe('User@Example.ca')
  })

  it('normalizes text to uppercase', () => {
    expect(normalizeUpperText('  new  ')).toBe('NEW')
  })

  it('joins non-blank label parts', () => {
    expect(joinNonBlankText(['123', '', ' Owner 00001012 ', '   ', 'RSI'], ' - ')).toBe(
      '123 -  Owner 00001012  - RSI',
    )
  })

  it('validates trimmed email addresses', () => {
    expect(isValidEmail(' user@example.ca ')).toBe(true)
    expect(isValidEmail('user')).toBe(false)
  })
})
