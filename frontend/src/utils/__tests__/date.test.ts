import { describe, expect, it } from 'vitest'
import { formatBusinessIsoDate, formatLocalIsoDate } from '@/utils/date'

describe('date utilities', () => {
  it('formats local dates as ISO calendar dates', () => {
    expect(formatLocalIsoDate(new Date(2026, 0, 5))).toBe('2026-01-05')
    expect(formatLocalIsoDate(new Date(2026, 10, 23))).toBe('2026-11-23')
  })

  it('uses the Vancouver business date at a UTC date boundary', () => {
    expect(formatBusinessIsoDate(new Date('2026-01-01T07:30:00Z'))).toBe('2025-12-31')
  })
})
