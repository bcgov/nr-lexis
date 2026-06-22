import { describe, expect, it } from 'vitest'
import {
  greaterThanFieldError,
  greaterThanOrEqualFieldError,
  integerFieldError,
  joinCreateSubmitMessages,
  lessThanOrEqualFieldError,
  mergeCreateDraftPayload,
  parseNonNegativeDecimalFieldValue,
  requiredMaxLengthFieldError,
  requiredNumericFieldError,
  requiredPositiveNumericFieldError,
} from '@/pages/shared/create-form-utils'

describe('create-form-utils', () => {
  it('merges draft payloads over the provided initial form', () => {
    const initialForm = {
      applicationNumber: '',
      comments: '',
      speciesCodes: [] as string[],
    }

    expect(
      mergeCreateDraftPayload(
        {
          applicationNumber: '45963',
          speciesCodes: ['HE'],
        },
        initialForm,
      ),
    ).toEqual({
      applicationNumber: '45963',
      comments: '',
      speciesCodes: ['HE'],
    })
  })

  it('returns the provided initial form for invalid draft payloads', () => {
    const initialForm = {
      applicationNumber: 'prefilled',
      comments: 'keep me',
    }

    expect(mergeCreateDraftPayload(null, initialForm)).toBe(initialForm)
    expect(mergeCreateDraftPayload('invalid', initialForm)).toBe(initialForm)
  })

  it('joins submit response messages while ignoring blanks', () => {
    expect(
      joinCreateSubmitMessages({
        message: 'Created',
        errors: [' ', 'Invalid location'],
        warnings: ['Check scale rows'],
      }),
    ).toBe('Created Invalid location Check scale rows')
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
})
