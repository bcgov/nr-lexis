import { describe, expect, it } from 'vitest'
import { formatLocalIsoDate } from '@/utils/date'

describe('date utilities', () => {
  it('formats local dates as ISO calendar dates', () => {
    expect(formatLocalIsoDate(new Date(2026, 0, 5))).toBe('2026-01-05')
    expect(formatLocalIsoDate(new Date(2026, 10, 23))).toBe('2026-11-23')
  })
})
