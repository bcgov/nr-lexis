import { describe, expect, it } from 'vitest'
import { displayValue, normalizeFilterText } from '@/pages/shared/detail-page-utils'

describe('detail-page-utils', () => {
  it('formats missing detail values consistently', () => {
    expect(displayValue(null)).toBe('Not provided')
    expect(displayValue(undefined)).toBe('Not provided')
    expect(displayValue('')).toBe('Not provided')
    expect(displayValue(0)).toBe('0')
    expect(displayValue('DAR')).toBe('DAR')
  })

  it('normalizes text for table filters', () => {
    expect(normalizeFilterText('  Test Value  ')).toBe('test value')
  })
})
