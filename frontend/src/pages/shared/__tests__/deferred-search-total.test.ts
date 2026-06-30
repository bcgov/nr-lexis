import { describe, expect, it, vi } from 'vitest'
import {
  loadSearchWithDeferredTotal,
  prefetchNextSearchPage,
} from '@/pages/shared/deferred-search-total'
import {
  buildPageDataCacheKey,
  clearAllPageDataCache,
  getPageDataCache,
} from '@/pages/shared/page-data-cache'

type TestResponse = {
  content: { id: string }[]
  page: {
    number: number
    size: number
    totalElements: number
    totalPages: number
  }
}

const responseWith = (
  rowCount: number,
  totalElements: number,
  pageSize = 100,
  pageNumber = 0,
): TestResponse => ({
  content: Array.from({ length: rowCount }, (_, index) => ({ id: String(index + 1) })),
  page: {
    number: pageNumber,
    size: pageSize,
    totalElements,
    totalPages: Math.max(1, Math.ceil(totalElements / pageSize)),
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

  it('prefetches the next exact page into the page cache', async () => {
    clearAllPageDataCache()
    const currentResponse = responseWith(20, 45, 20, 0)
    const nextResponse = responseWith(20, 45, 20, 1)
    const search = vi.fn().mockResolvedValue(nextResponse)

    prefetchNextSearchPage({
      pageId: 'test-search',
      principal: 'IDIR\\TEST',
      request: { page: 0, pageSize: 20 },
      response: currentResponse,
      search,
    })

    await vi.waitFor(() => {
      expect(search).toHaveBeenCalledWith({ page: 1, pageSize: 20 }, { knownTotal: 45 })
    })

    const cacheKey = buildPageDataCacheKey('test-search', 'IDIR\\TEST', {
      page: 1,
      pageSize: 20,
    })
    expect(getPageDataCache<TestResponse>(cacheKey)).toEqual(nextResponse)
  })
})
