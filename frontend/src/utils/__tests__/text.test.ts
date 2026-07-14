import { describe, expect, it } from 'vitest'
import {
  displayAuditIdentity,
  displayValue,
  isValidEmail,
  joinNonBlankText,
  leadingDigits,
  normalizeFilterText,
  normalizeTrimmedText,
  normalizeUpperText,
  ownerClientLabel,
  regionLabel,
  searchResultOptionLabel,
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

  it('formats display fallback values', () => {
    expect(displayValue(null)).toBe('Not provided')
    expect(displayValue(undefined)).toBe('Not provided')
    expect(displayValue('')).toBe('Not provided')
    expect(displayValue(0)).toBe('0')
    expect(displayValue('DAR')).toBe('DAR')
  })

  it('does not expose opaque audit identifiers as authors', () => {
    expect(displayAuditIdentity('IDIR\\JSMITH')).toBe('IDIR\\JSMITH')
    expect(displayAuditIdentity('8c5df5b8-c041-7016-0f61-92b0d0000000')).toBe('Not available')
    expect(displayAuditIdentity('BCSC\\8c5df5b8-c041-4016-8f61-92b0d0000000')).toBe('BCSC user')
    expect(displayAuditIdentity(null)).toBe('Not provided')
  })

  it('formats optional owner client and region labels', () => {
    expect(ownerClientLabel('00001012')).toBe('Owner 00001012')
    expect(ownerClientLabel('')).toBe('')
    expect(regionLabel('RSI')).toBe('Region RSI')
    expect(regionLabel(undefined)).toBe('')
  })

  it('formats search result option labels', () => {
    expect(
      searchResultOptionLabel({
        primary: '45964',
        status: 'New',
        ownerClientNumber: '00001012',
        region: 'RSI',
        date: '2026-06-17',
      }),
    ).toBe('45964 - New - Owner 00001012 - Region RSI - 2026-06-17')

    expect(
      searchResultOptionLabel({
        primary: '45964',
        status: '',
        ownerClientNumber: '',
        region: '',
        date: '',
      }),
    ).toBe('45964')
  })

  it('extracts only leading digits', () => {
    expect(leadingDigits('123 - Approved')).toBe('123')
    expect(leadingDigits('abc123')).toBe('')
    expect(leadingDigits('')).toBe('')
  })

  it('validates trimmed email addresses', () => {
    expect(isValidEmail(' user@example.ca ')).toBe(true)
    expect(isValidEmail('user')).toBe(false)
  })
})
