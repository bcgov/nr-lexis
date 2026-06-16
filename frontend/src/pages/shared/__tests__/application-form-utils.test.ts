import { describe, expect, it } from 'vitest'
import {
  codeOptionLabel,
  isAgentApplicant,
  isSelectableClientContact,
  isSelectableClientLocation,
  productTypeRequiresGrowthType,
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

  it('maps common application option state consistently', () => {
    expect(productTypeRequiresGrowthType('H')).toBe(true)
    expect(productTypeRequiresGrowthType('S')).toBe(true)
    expect(productTypeRequiresGrowthType('L')).toBe(false)
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
})
