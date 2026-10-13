import { describe, expect, it } from 'vitest'
import {
  formatBusinessDateTimeLabel,
  formatBusinessIsoDate,
  formatIsoDateLabel,
  formatLocalIsoDate,
} from '@/utils/date'

describe('date utilities', () => {
  it('formats local dates as ISO calendar dates', () => {
    expect(formatLocalIsoDate(new Date(2026, 0, 5))).toBe('2026-01-05')
    expect(formatLocalIsoDate(new Date(2026, 10, 23))).toBe('2026-11-23')
  })

  it('uses the Vancouver business date at a UTC date boundary', () => {
    expect(formatBusinessIsoDate(new Date('2026-01-01T07:30:00Z'))).toBe('2025-12-31')
  })

  it('shows calendar dates without shifting them into the preceding B.C. day', () => {
    expect(formatIsoDateLabel('2026-01-01')).toBe('Jan 1, 2026')
    expect(formatIsoDateLabel('2026-09-17')).toBe('Sep 17, 2026')
    expect(formatIsoDateLabel(null)).toBe('')
    expect(formatIsoDateLabel('not-a-date')).toBe('not-a-date')
  })

  it('shows signed-off table labels with B.C. dates and 12-hour times', () => {
    expect(formatBusinessDateTimeLabel('2026-06-22T22:37:24Z')).toBe('Jun 22, 2026 · 03:37:24 PM')
    expect(formatBusinessDateTimeLabel('2026-01-01T07:30:05Z')).toBe('Dec 31, 2025 · 11:30:05 PM')
    expect(formatBusinessDateTimeLabel(null)).toBe('')
    expect(formatBusinessDateTimeLabel('not-a-date')).toBe('not-a-date')
  })
})
