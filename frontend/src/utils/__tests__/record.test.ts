import { describe, expect, it } from 'vitest'
import { booleanField, firstStringField, isRecord, stringField } from '@/utils/record'

describe('record utilities', () => {
  it('accepts plain records and rejects arrays or nulls', () => {
    expect(isRecord({ code: 'DAR' })).toBe(true)
    expect(isRecord([])).toBe(false)
    expect(isRecord(null)).toBe(false)
  })

  it('trims string fields and ignores non-string values', () => {
    expect(stringField({ code: ' DAR ' }, 'code')).toBe('DAR')
    expect(stringField({ code: 12 }, 'code')).toBe('')
  })

  it('returns the first non-blank string field', () => {
    expect(firstStringField({ code: ' ', name: '  District  ' }, ['code', 'name'])).toBe('District')
  })

  it('reads strict boolean fields', () => {
    expect(booleanField({ selected: true }, 'selected')).toBe(true)
    expect(booleanField({ selected: 'true' }, 'selected')).toBe(false)
  })
})
