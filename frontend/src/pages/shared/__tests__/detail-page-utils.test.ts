import { describe, expect, it } from 'vitest'
import { displayValue, normalizeFilterText } from '@/pages/shared/detail-page-utils'
import { displayValue as sharedDisplayValue } from '@/utils/display-value'

describe('detail-page-utils', () => {
  it('re-exports the shared read-only value formatter', () => {
    expect(displayValue).toBe(sharedDisplayValue)
    expect(displayValue(0)).toBe('0')
    expect(displayValue('DAR')).toBe('DAR')
  })

  it('normalizes text for table filters', () => {
    expect(normalizeFilterText('  Test Value  ')).toBe('test value')
  })
})
