import { describe, expect, it } from 'vitest'
import {
  greaterThanFieldError,
  greaterThanOrEqualFieldError,
  hasInvalidIsoDateValue,
  integerFieldError,
  isValidIsoDate,
  joinCreateSubmitMessages,
  lessThanOrEqualFieldError,
  normalizeProvincialApplicationNumber,
  parseNonNegativeDecimalFieldValue,
  provincialApplicationNumberFieldError,
  requiredMaxLengthFieldError,
  requiredNumericFieldError,
  requiredPositiveNumericFieldError,
} from '@/pages/shared/create-form-utils'

describe('create-form-utils', () => {
  it('joins submit response messages while ignoring blanks', () => {
    expect(
      joinCreateSubmitMessages({
        message: 'Created',
        errors: [' ', 'Invalid location'],
        warnings: ['Check scale rows'],
      }),
    ).toBe('Created Invalid location Check scale rows')
  })

  it('detects invalid ISO date values', () => {
    expect(hasInvalidIsoDateValue('', '2026-06-23')).toBe(false)
    expect(hasInvalidIsoDateValue('2026-06-23', '2026-13-23')).toBe(true)
    expect(hasInvalidIsoDateValue('not-a-date')).toBe(true)
  })

  it('rejects impossible calendar dates while accepting leap days', () => {
    expect(isValidIsoDate('2025-02-29')).toBe(false)
    expect(isValidIsoDate('2026-04-31')).toBe(false)
    expect(isValidIsoDate('0000-01-01')).toBe(false)
    expect(isValidIsoDate('2024-02-29')).toBe(true)
    expect(isValidIsoDate('2000-02-29')).toBe(true)
    expect(isValidIsoDate('2100-02-29')).toBe(false)
  })

  it('parses non-negative decimal field values', () => {
    expect(parseNonNegativeDecimalFieldValue('12')).toBe(12)
    expect(parseNonNegativeDecimalFieldValue(' 12.5 ')).toBe(12.5)
    expect(parseNonNegativeDecimalFieldValue('')).toBeNull()
    expect(parseNonNegativeDecimalFieldValue('-1')).toBeNull()
    expect(parseNonNegativeDecimalFieldValue('1e2')).toBeNull()
    expect(parseNonNegativeDecimalFieldValue('abc')).toBeNull()
  })

  it('validates required numeric fields', () => {
    expect(requiredNumericFieldError('', 'Package volume')).toBe('Package volume is required.')
    expect(requiredNumericFieldError('abc', 'Package volume')).toBe(
      'Package volume must be numeric.',
    )
    expect(requiredNumericFieldError('0', 'Package volume')).toBeNull()
    expect(requiredNumericFieldError('12.5', 'Package volume')).toBeNull()
  })

  it('validates required max length fields', () => {
    expect(requiredMaxLengthFieldError('', 9, 'Invoice number')).toBe('Invoice number is required.')
    expect(requiredMaxLengthFieldError('1234567890', 9, 'Invoice number')).toBe(
      'Invoice number must be 9 characters or fewer.',
    )
    expect(requiredMaxLengthFieldError('', 1, 'Exemption reason code', 'Exemption reason')).toBe(
      'Exemption reason is required.',
    )
    expect(requiredMaxLengthFieldError('123456789', 9, 'Invoice number')).toBeNull()
  })

  it('validates required positive numeric fields', () => {
    expect(requiredPositiveNumericFieldError('', 'Invoice export value')).toBe(
      'Invoice export value is required.',
    )
    expect(requiredPositiveNumericFieldError('abc', 'Invoice export value')).toBe(
      'Invoice export value must be numeric.',
    )
    expect(requiredPositiveNumericFieldError('0', 'Invoice export value')).toBe(
      'Use a positive numeric value.',
    )
    expect(requiredPositiveNumericFieldError('10.25', 'Invoice export value')).toBeNull()
  })

  it('validates numeric bounds only when a decimal value is present', () => {
    expect(greaterThanFieldError('', 'Average length', 0)).toBeNull()
    expect(greaterThanFieldError('abc', 'Average length', 0)).toBeNull()
    expect(greaterThanFieldError('0', 'Average length', 0)).toBe(
      'Average length must be greater than 0.',
    )
    expect(greaterThanFieldError('0.1', 'Average length', 0)).toBeNull()

    expect(greaterThanOrEqualFieldError('4.9', 'Pieces', 5)).toBe(
      'Pieces must be greater than or equal to 5.',
    )
    expect(greaterThanOrEqualFieldError('5', 'Pieces', 5)).toBeNull()

    expect(lessThanOrEqualFieldError('100', 'Average diameter', 99.99)).toBe(
      'Average diameter must be 99.99 or less.',
    )
    expect(lessThanOrEqualFieldError('99.99', 'Average diameter', 99.99)).toBeNull()
  })

  it('validates whole number fields', () => {
    expect(integerFieldError('', 'Pieces')).toBe('Pieces must be a whole number.')
    expect(integerFieldError('1.2', 'Pieces')).toBe('Pieces must be a whole number.')
    expect(integerFieldError('12', 'Pieces')).toBeNull()
  })

  it('validates and canonicalizes provincial application numbers', () => {
    expect(provincialApplicationNumberFieldError('', 'Application number', true)).toBe(
      'Application number is required.',
    )
    expect(provincialApplicationNumberFieldError('')).toBeNull()
    expect(provincialApplicationNumberFieldError('1e3')).toBe(
      'Application number must be a positive whole number.',
    )
    expect(provincialApplicationNumberFieldError('0')).toBe(
      'Application number must be a positive whole number.',
    )
    expect(provincialApplicationNumberFieldError('12345678901')).toBe(
      'Application number must be 10 digits or fewer.',
    )
    expect(provincialApplicationNumberFieldError('0000046275')).toBeNull()
    expect(normalizeProvincialApplicationNumber(' 0000046275 ')).toBe('46275')
    expect(normalizeProvincialApplicationNumber('1e3')).toBe('1e3')
  })
})
