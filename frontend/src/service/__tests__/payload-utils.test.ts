import { describe, expect, it } from 'vitest'
import {
  parsePayloadArray,
  parsePayloadArrayOrEmpty,
  payloadValueAsBoolean,
  payloadValueAsNumber,
  payloadValueAsOptionalString,
  payloadValueAsString,
  payloadValueAsStringArray,
  payloadValueAsStringList,
  payloadValueAsTrimmedString,
} from '@/service/payload-utils'

describe('payload-utils', () => {
  it('coerces raw string-like payload values without trimming', () => {
    expect(payloadValueAsString(' raw value ')).toBe(' raw value ')
    expect(payloadValueAsString(123)).toBe('123')
    expect(payloadValueAsString(null)).toBe('')
  })

  it('coerces trimmed string-like payload values', () => {
    expect(payloadValueAsTrimmedString(' raw value ')).toBe('raw value')
    expect(payloadValueAsTrimmedString(123)).toBe('123')
    expect(payloadValueAsTrimmedString(null)).toBe('')
  })

  it('coerces optional string-like payload values', () => {
    expect(payloadValueAsOptionalString(' raw value ')).toBe('raw value')
    expect(payloadValueAsOptionalString(123)).toBe('123')
    expect(payloadValueAsOptionalString('   ')).toBeUndefined()
  })

  it('coerces numeric payload values with optional string normalization', () => {
    expect(payloadValueAsNumber(12.5)).toBe(12.5)
    expect(payloadValueAsNumber('$ 1,234.50', (value) => value.replace(/[$,\s]/g, ''))).toBe(1234.5)
    expect(payloadValueAsNumber('not numeric')).toBe(0)
  })

  it('coerces boolean payload values', () => {
    expect(payloadValueAsBoolean(true)).toBe(true)
    expect(payloadValueAsBoolean(' TRUE ')).toBe(true)
    expect(payloadValueAsBoolean('false')).toBe(false)
    expect(payloadValueAsBoolean(1)).toBe(false)
  })

  it('coerces string arrays with trimmed nonblank entries', () => {
    expect(payloadValueAsStringArray([' FI ', '', 12, null])).toEqual(['FI', '12'])
    expect(payloadValueAsStringArray('FI')).toEqual([])
  })

  it('coerces string lists from arrays or single values', () => {
    expect(payloadValueAsStringList([' FI ', '', 12, null])).toEqual(['FI', '12'])
    expect(payloadValueAsStringList(' FI ')).toEqual(['FI'])
    expect(payloadValueAsStringList('   ')).toEqual([])
  })

  it('extracts arrays from response envelopes using ordered keys', () => {
    const rows = [{ id: 'rows' }]
    const scaleList = [{ id: 'scaleList' }]
    expect(parsePayloadArray(rows)).toBe(rows)
    expect(parsePayloadArray({ rows })).toBe(rows)
    expect(parsePayloadArray({ data: rows, scaleList }, ['scaleList', 'data'])).toBe(scaleList)
    expect(parsePayloadArray({ scaleList })).toBeNull()
    expect(parsePayloadArrayOrEmpty({ scaleList })).toEqual([])
  })
})
