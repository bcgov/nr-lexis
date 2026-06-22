import { describe, expect, it } from 'vitest'
import {
  booleanField,
  firstStringField,
  isRecord,
  mapRecordArray,
  recordOrEmpty,
  stringField,
} from '@/utils/record'

describe('record utilities', () => {
  it('accepts plain records and rejects arrays or nulls', () => {
    expect(isRecord({ code: 'DAR' })).toBe(true)
    expect(isRecord([])).toBe(false)
    expect(isRecord(null)).toBe(false)
  })

  it('returns an empty record fallback for non-record values', () => {
    const record = { code: 'DAR' }

    expect(recordOrEmpty(record)).toBe(record)
    expect(recordOrEmpty([])).toEqual({})
    expect(recordOrEmpty(null)).toEqual({})
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

  it('maps only valid records from unknown arrays', () => {
    const result = mapRecordArray([{ code: 'A' }, null, ['B'], { code: ' ' }], (record) => {
      const code = stringField(record, 'code')
      return code ? code : null
    })

    expect(result).toEqual(['A'])
    expect(mapRecordArray('not an array', () => 'unused')).toEqual([])
  })
})
