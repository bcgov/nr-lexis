import { describe, expect, it } from 'vitest'
import { formatBusinessDateTime, formatBusinessIsoDate, formatLocalIsoDate } from '@/utils/date'

describe('date utilities', () => {
  it('formats local dates as ISO calendar dates', () => {
    expect(formatLocalIsoDate(new Date(2026, 0, 5))).toBe('2026-01-05')
    expect(formatLocalIsoDate(new Date(2026, 10, 23))).toBe('2026-11-23')
  })

  it('uses the Vancouver business date at a UTC date boundary', () => {
    expect(formatBusinessIsoDate(new Date('2026-01-01T07:30:00Z'))).toBe('2025-12-31')
  })

  it('formats timestamps in the Vancouver business time zone', () => {
    expect(formatBusinessDateTime('2026-07-18T04:37:21Z')).toBe('2026-07-17 21:37:21')
    expect(formatBusinessDateTime('2026-01-01T07:30:05Z')).toBe('2025-12-31 23:30:05')
  })

  it('preserves invalid timestamp text and returns blank for absent values', () => {
    expect(formatBusinessDateTime('not-a-date')).toBe('not-a-date')
    expect(formatBusinessDateTime('')).toBe('')
    expect(formatBusinessDateTime(null)).toBe('')
  })
})
