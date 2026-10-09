import { describe, expect, it } from 'vitest'
import { fieldErrorText, fieldErrorTexts } from '@/utils/field-error'

describe('fieldErrorText', () => {
  it('drops the closing period of a one-sentence message', () => {
    expect(fieldErrorText('Permit request pieces is required.')).toBe(
      'Permit request pieces is required',
    )
    expect(fieldErrorText('Enter a volume greater than 0.')).toBe('Enter a volume greater than 0')
    expect(fieldErrorText('Enter a diameter greater than 0 and no more than 99.99.')).toBe(
      'Enter a diameter greater than 0 and no more than 99.99',
    )
  })

  it('keeps the closing period of a message with more than one sentence', () => {
    expect(fieldErrorText('Purchaser is required. Enter company name.')).toBe(
      'Purchaser is required. Enter company name.',
    )
    expect(
      fieldErrorText(
        'Client is required. Enter name, acronym, or client number (min. 3 characters).',
      ),
    ).toBe('Client is required. Enter name, acronym, or client number (min. 3 characters).')
    expect(fieldErrorText('Is this right? Check the number.')).toBe(
      'Is this right? Check the number.',
    )
  })

  it('keeps text without a closing period', () => {
    expect(fieldErrorText('Transport name is required')).toBe('Transport name is required')
  })

  it('keeps a closing ellipsis', () => {
    expect(fieldErrorText('Checking...')).toBe('Checking...')
    expect(fieldErrorText('Checking…')).toBe('Checking…')
  })

  it('passes empty values through', () => {
    expect(fieldErrorText('')).toBe('')
    expect(fieldErrorText(undefined)).toBeUndefined()
    expect(fieldErrorText(null)).toBeNull()
  })
})

describe('fieldErrorTexts', () => {
  it('applies fieldErrorText to each field error', () => {
    expect(
      fieldErrorTexts({
        volume: 'Enter a volume greater than 0.',
        comments: 'Comments contain unsupported characters. Use standard punctuation.',
        packageNumber: undefined,
      }),
    ).toEqual({
      volume: 'Enter a volume greater than 0',
      comments: 'Comments contain unsupported characters. Use standard punctuation.',
      packageNumber: undefined,
    })
  })
})
