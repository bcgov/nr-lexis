import { describe, expect, it } from 'vitest'
import { normalizeFilterText } from '@/utils/text'

describe('text utilities', () => {
  it('normalizes user-entered filter text', () => {
    expect(normalizeFilterText('  Test Value  ')).toBe('test value')
  })
})
