import { describe, expect, it } from 'vitest'
import {
  averageLogVolumeFieldError,
  clientLocationLabel,
  codeOptionLabel,
  isAgentApplicant,
  isSelectableClientContact,
  isSelectableClientLocation,
  productTypeRequiresGrowthType,
  productTypeRequiresLogDetails,
  resolveClientContactName,
  resolveClientLocationCode,
  toApplicationCodeOption,
  toSearchOption,
} from '@/pages/shared/application-form-utils'

describe('application-form-utils', () => {
  it('resolves selectable client locations from current, selected, or first selectable values', () => {
    const locations = [
      { locationCode: '0', locationName: 'Placeholder', selected: false },
      { locationCode: '01', locationName: 'One', selected: false },
      { locationCode: '02', locationName: 'Two', selected: true },
    ]

    expect(
      locations.filter(isSelectableClientLocation).map((location) => location.locationCode),
    ).toEqual(['01', '02'])
    expect(resolveClientLocationCode(locations, '01')).toBe('01')
    expect(resolveClientLocationCode(locations, '99')).toBe('02')
    expect(resolveClientLocationCode([{ ...locations[0] }], '')).toBe('')
  })

  it('resolves selectable contacts while preserving unknown typed names', () => {
    const contacts = [
      { contactId: '0', contactName: 'Placeholder' },
      { contactId: '12', contactName: 'Alex Tester' },
    ]

    expect(
      contacts.filter(isSelectableClientContact).map((contact) => contact.contactName),
    ).toEqual(['Alex Tester'])
    expect(resolveClientContactName(contacts, 'Alex Tester')).toBe('Alex Tester')
    expect(resolveClientContactName(contacts, 'Typed Name')).toBe('Alex Tester')
    expect(resolveClientContactName([{ ...contacts[0] }], 'Typed Name')).toBe('Typed Name')
  })

  it.each([
    ['03', 'WOODLANDS SERVICES', '03 - WOODLANDS SERVICES'],
    ['03', '03 - WOODLANDS SERVICES', '03 - WOODLANDS SERVICES'],
    ['00', '00', '00'],
    ['00', '', '00'],
  ])(
    'formats client location %j and %j without repeating the code',
    (locationCode, locationName, expectedLabel) => {
      expect(clientLocationLabel(locationCode, locationName)).toBe(expectedLabel)
    },
  )

  it('maps common application option state consistently', () => {
    expect(productTypeRequiresGrowthType('H')).toBe(true)
    expect(productTypeRequiresGrowthType('S')).toBe(true)
    expect(productTypeRequiresGrowthType('T')).toBe(false)
    expect(productTypeRequiresLogDetails('H')).toBe(true)
    expect(productTypeRequiresLogDetails('S')).toBe(false)
    expect(productTypeRequiresLogDetails('T')).toBe(false)
    expect(isAgentApplicant('A')).toBe(true)
    expect(isAgentApplicant('O')).toBe(false)

    expect(codeOptionLabel({ code: 'HE', description: 'Hemlock' })).toBe('HE - Hemlock')
    expect(codeOptionLabel({ code: 'HE', description: 'HE' })).toBe('HE')
    expect(toSearchOption({ code: 'HE', description: 'Hemlock' })).toEqual({
      value: 'HE',
      label: 'HE - Hemlock',
    })
    expect(toApplicationCodeOption({ value: 'H', label: 'Harvested Timber' })).toEqual({
      code: 'H',
      description: 'Harvested Timber',
    })
  })

  it.each([
    ['', 'Average log volume is required.'],
    ['0', undefined],
    ['99.9', undefined],
    ['-0.1', 'Average log volume must be greater than or equal to 0.'],
    ['not-a-number', 'Average log volume must be numeric.'],
    ['100', 'Average log volume must be 99.9 or less.'],
    ['1.23', 'Average log volume must have no more than one decimal place.'],
  ])('validates average log volume %j', (value, expectedError) => {
    expect(averageLogVolumeFieldError(value)).toBe(expectedError)
  })
})
