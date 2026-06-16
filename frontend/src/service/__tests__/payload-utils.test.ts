import { describe, expect, it } from 'vitest'
import {
  parsePayloadArray,
  payloadValueAsNumber,
  payloadValueAsString,
} from '@/service/payload-utils'

describe('payload-utils', () => {
  it('coerces raw string-like payload values without trimming', () => {
    expect(payloadValueAsString(' raw value ')).toBe(' raw value ')
    expect(payloadValueAsString(123)).toBe('123')
    expect(payloadValueAsString(null)).toBe('')
  })

  it('coerces numeric payload values with optional string normalization', () => {
    expect(payloadValueAsNumber(12.5)).toBe(12.5)
    expect(payloadValueAsNumber('$ 1,234.50', (value) => value.replace(/[$,\s]/g, ''))).toBe(1234.5)
    expect(payloadValueAsNumber('not numeric')).toBe(0)
  })

  it('extracts arrays from response envelopes using ordered keys', () => {
    const rows = [{ id: 'rows' }]
    const scaleList = [{ id: 'scaleList' }]
    expect(parsePayloadArray(rows)).toBe(rows)
    expect(parsePayloadArray({ rows })).toBe(rows)
    expect(parsePayloadArray({ data: rows, scaleList }, ['scaleList', 'data'])).toBe(scaleList)
    expect(parsePayloadArray({ scaleList })).toBeNull()
  })
})
