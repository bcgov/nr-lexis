import { describe, expect, it, vi } from 'vitest'
import { loadSearchWithDeferredTotal } from '@/pages/shared/deferred-search-total'

type TestResponse = {
  content: { id: string }[]
  page: {
    number: number
    size: number
    totalElements: number
    totalPages: number
  }
}

const responseWith = (rowCount: number, totalElements: number): TestResponse => ({
  content: Array.from({ length: rowCount }, (_, index) => ({ id: String(index + 1) })),
  page: {
    number: 0,
    size: 100,
    totalElements,
    totalPages: Math.max(1, Math.ceil(totalElements / 100)),
  },
})

describe('loadSearchWithDeferredTotal', () => {
  it('loads rows with an optimistic total before resolving exact count', async () => {
    const search = vi.fn().mockResolvedValue(responseWith(100, 101))
    const count = vi.fn().mockResolvedValue(490)
    const onExactTotal = vi.fn()

    const result = await loadSearchWithDeferredTotal({
      request: { page: 0, pageSize: 100 },
      search,
      count,
      isLatestRequest: () => true,
      onExactTotal,
    })

    expect(search).toHaveBeenCalledWith({ page: 0, pageSize: 100 }, { knownTotal: 101 })
    expect(result.totalIsExact).toBe(false)
    expect(result.response.page.totalElements).toBe(101)

    await vi.waitFor(() => {
      expect(onExactTotal).toHaveBeenCalledWith(
        expect.objectContaining({
          page: expect.objectContaining({
            totalElements: 490,
            totalPages: 5,
          }),
        }),
      )
    })
  })

  it('infers exact total without counting when the returned page is short', async () => {
    const search = vi.fn().mockResolvedValue(responseWith(12, 101))
    const count = vi.fn()

    const result = await loadSearchWithDeferredTotal({
      request: { page: 0, pageSize: 100 },
      search,
      count,
      isLatestRequest: () => true,
      onExactTotal: vi.fn(),
    })

    expect(count).not.toHaveBeenCalled()
    expect(result.totalIsExact).toBe(true)
    expect(result.response.page.totalElements).toBe(12)
    expect(result.response.page.totalPages).toBe(1)
  })

  it('uses a cached exact total without making a count request', async () => {
    const search = vi.fn().mockResolvedValue(responseWith(100, 490))
    const count = vi.fn()

    const result = await loadSearchWithDeferredTotal({
      request: { page: 0, pageSize: 100 },
      cachedTotal: 490,
      search,
      count,
      isLatestRequest: () => true,
      onExactTotal: vi.fn(),
    })

    expect(search).toHaveBeenCalledWith({ page: 0, pageSize: 100 }, { knownTotal: 490 })
    expect(count).not.toHaveBeenCalled()
    expect(result.totalIsExact).toBe(true)
    expect(result.response.page.totalElements).toBe(490)
  })
})
