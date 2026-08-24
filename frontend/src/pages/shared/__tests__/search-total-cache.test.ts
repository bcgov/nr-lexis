import { describe, expect, it } from 'vitest'
import { setCachedSearchTotal, type SearchTotalCache } from '@/pages/shared/search-total-cache'

describe('search total cache', () => {
  it('bounds unique filter totals for a long-lived browser session', () => {
    const cache: SearchTotalCache = new Map()

    for (let index = 0; index <= 200; index += 1) {
      setCachedSearchTotal(cache, `filter-${index}`, index, 1_000)
    }

    expect(cache).toHaveLength(200)
    expect(cache.has('filter-0')).toBe(false)
    expect(cache.get('filter-200')?.total).toBe(200)
  })

  it('purges expired totals before applying the entry bound', () => {
    const cache: SearchTotalCache = new Map([
      ['expired', { total: 12, expiresAt: 999 }],
      ['current', { total: 24, expiresAt: 2_000 }],
    ])

    setCachedSearchTotal(cache, 'new', 36, 1_000)

    expect(cache.has('expired')).toBe(false)
    expect(cache.has('current')).toBe(true)
    expect(cache.get('new')?.total).toBe(36)
  })
})
