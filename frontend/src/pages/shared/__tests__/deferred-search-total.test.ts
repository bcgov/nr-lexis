import { describe, expect, it, vi } from 'vitest'
import {
  loadSearchWithDeferredTotal,
  prefetchAdjacentSearchPages,
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
  it('waits for the exact count before resolving a full page', async () => {
    const search = vi.fn().mockResolvedValue(responseWith(100, 101))
    let resolveCount!: (total: number) => void
    const count = vi.fn(
      () =>
        new Promise<number>((resolve) => {
          resolveCount = resolve
        }),
    )

    const pendingResult = loadSearchWithDeferredTotal({
      request: { page: 0, pageSize: 100 },
      search,
      count,
    })

    await vi.waitFor(() => {
      expect(count).toHaveBeenCalledOnce()
    })

    const onResolved = vi.fn()
    void pendingResult.then(onResolved)
    await Promise.resolve()
    expect(onResolved).not.toHaveBeenCalled()

    resolveCount(490)
    const result = await pendingResult

    expect(search).toHaveBeenCalledWith({ page: 0, pageSize: 100 }, { knownTotal: 101 })
    expect(result.totalIsExact).toBe(true)
    expect(result.response.page.totalElements).toBe(490)
    expect(result.response.page.totalPages).toBe(5)
  })

  it('infers exact total without counting when the returned page is short', async () => {
    const search = vi.fn().mockResolvedValue(responseWith(12, 101))
    const count = vi.fn()

    const result = await loadSearchWithDeferredTotal({
      request: { page: 0, pageSize: 100 },
      search,
      count,
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
    })

    expect(search).toHaveBeenCalledWith({ page: 0, pageSize: 100 }, { knownTotal: 490 })
    expect(count).not.toHaveBeenCalled()
    expect(result.totalIsExact).toBe(true)
    expect(result.response.page.totalElements).toBe(490)
  })

  it('rejects when the authoritative count fails', async () => {
    const search = vi.fn().mockResolvedValue(responseWith(100, 101))
    const count = vi.fn().mockRejectedValue(new Error('count unavailable'))

    await expect(
      loadSearchWithDeferredTotal({
        request: { page: 0, pageSize: 100 },
        search,
        count,
      }),
    ).rejects.toThrow('count unavailable')
  })

  it('prefetches the next exact page into the page cache', async () => {
    clearAllPageDataCache()
    const currentResponse = responseWith(20, 45, 20, 0)
    const nextResponse = responseWith(20, 45, 20, 1)
    const search = vi.fn().mockResolvedValue(nextResponse)

    prefetchAdjacentSearchPages({
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

  it('prefetches both adjacent pages for middle-page navigation', async () => {
    clearAllPageDataCache()
    const currentResponse = responseWith(20, 45, 20, 1)
    const search = vi.fn((request: { page: number; pageSize: number }) =>
      Promise.resolve(responseWith(request.page === 2 ? 5 : 20, 45, 20, request.page)),
    )

    prefetchAdjacentSearchPages({
      pageId: 'test-search',
      principal: 'IDIR\\TEST',
      request: { page: 1, pageSize: 20 },
      response: currentResponse,
      search,
    })

    await vi.waitFor(() => {
      expect(search).toHaveBeenCalledTimes(2)
    })
    expect(search).toHaveBeenCalledWith({ page: 0, pageSize: 20 }, { knownTotal: 45 })
    expect(search).toHaveBeenCalledWith({ page: 2, pageSize: 20 }, { knownTotal: 45 })

    const previousCacheKey = buildPageDataCacheKey('test-search', 'IDIR\\TEST', {
      page: 0,
      pageSize: 20,
    })
    const nextCacheKey = buildPageDataCacheKey('test-search', 'IDIR\\TEST', {
      page: 2,
      pageSize: 20,
    })
    expect(getPageDataCache<TestResponse>(previousCacheKey)?.page.number).toBe(0)
    expect(getPageDataCache<TestResponse>(nextCacheKey)?.page.number).toBe(2)
  })

  it('does not duplicate in-flight page prefetches', async () => {
    clearAllPageDataCache()
    let resolveSearch: ((response: TestResponse) => void) | undefined
    const currentResponse = responseWith(20, 45, 20, 0)
    const nextResponse = responseWith(20, 45, 20, 1)
    const search = vi.fn(
      () =>
        new Promise<TestResponse>((resolve) => {
          resolveSearch = resolve
        }),
    )

    const config = {
      pageId: 'test-search',
      principal: 'IDIR\\TEST',
      request: { page: 0, pageSize: 20 },
      response: currentResponse,
      search,
    }
    prefetchAdjacentSearchPages(config)
    prefetchAdjacentSearchPages(config)

    expect(search).toHaveBeenCalledTimes(1)
    resolveSearch?.(nextResponse)

    const cacheKey = buildPageDataCacheKey('test-search', 'IDIR\\TEST', {
      page: 1,
      pageSize: 20,
    })
    await vi.waitFor(() => {
      expect(getPageDataCache<TestResponse>(cacheKey)).toEqual(nextResponse)
    })
  })

  it('does not cache an in-flight prefetch after page data is invalidated', async () => {
    clearAllPageDataCache()
    let resolveSearch: ((response: TestResponse) => void) | undefined
    const currentResponse = responseWith(20, 45, 20, 0)
    const nextResponse = responseWith(20, 45, 20, 1)
    const searchPromise = new Promise<TestResponse>((resolve) => {
      resolveSearch = resolve
    })
    const search = vi.fn(() => searchPromise)

    prefetchAdjacentSearchPages({
      pageId: 'test-search',
      principal: 'IDIR\\TEST',
      request: { page: 0, pageSize: 20 },
      response: currentResponse,
      search,
    })
    expect(search).toHaveBeenCalledTimes(1)

    clearAllPageDataCache()
    resolveSearch?.(nextResponse)
    await searchPromise

    const cacheKey = buildPageDataCacheKey('test-search', 'IDIR\\TEST', {
      page: 1,
      pageSize: 20,
    })
    expect(getPageDataCache<TestResponse>(cacheKey)).toBeNull()
  })
})
