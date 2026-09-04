import { SkeletonText } from '@carbon/react'
import { createElement, type ReactNode } from 'react'
import {
  buildPageDataCacheKey,
  getPageDataCache,
  getPageDataCacheGeneration,
  setPageDataCache,
} from '@/pages/shared/page-data-cache'

type SearchPageRequest = {
  page: number
  pageSize: number
}

type PagedSearchResponse = {
  content: unknown[]
  page: {
    number: number
    size: number
    totalElements: number
    totalPages: number
  }
}

type KnownTotalSearchOptions = {
  knownTotal?: number
}

type DeferredSearchResult<TResponse extends PagedSearchResponse> = {
  response: TResponse
  totalIsExact: boolean
  deferredResponse?: Promise<TResponse>
}

export type DeferredSearchTotalStatus = 'exact' | 'pending' | 'unavailable'

type SearchPrefetchConfig<
  TRequest extends SearchPageRequest,
  TResponse extends PagedSearchResponse,
> = {
  pageId: string
  principal?: string | null
  request: TRequest
  response: TResponse
  search: (request: TRequest, options?: KnownTotalSearchOptions) => Promise<TResponse>
  onError?: (error: unknown) => void
}

const pendingPagePrefetches = new Set<string>()
const MAX_PREFETCH_PAGE_SIZE = 50
const PREFETCH_IDLE_TIMEOUT_MS = 1_000

const totalPagesFor = (totalElements: number, pageSize: number): number =>
  Math.max(1, Math.ceil(Math.max(0, totalElements) / Math.max(1, pageSize)))

const withTotal = <TResponse extends PagedSearchResponse>(
  response: TResponse,
  totalElements: number,
): TResponse => {
  const total = Math.max(0, totalElements)
  return {
    ...response,
    page: {
      ...response.page,
      totalElements: total,
      totalPages: totalPagesFor(total, response.page.size),
    },
  }
}

const optimisticTotalFor = (request: SearchPageRequest): number =>
  Math.max((request.page + 1) * request.pageSize + 1, request.pageSize + 1)

export const formatDeferredSearchTotalLabel = (
  totalElements: number,
  status: DeferredSearchTotalStatus,
  knownMinimum = totalElements,
): ReactNode | undefined => {
  if (status === 'exact') {
    return undefined
  }
  if (status === 'pending') {
    return createElement(
      'div',
      {
        className: 'legacy-search-result-count-skeleton',
        role: 'status',
        'aria-label': 'Counting search results',
      },
      createElement(SkeletonText, { width: '160px' }),
    )
  }
  const formattedTotal = new Intl.NumberFormat('en-CA').format(knownMinimum)
  return `At least ${formattedTotal} ${knownMinimum === 1 ? 'result' : 'results'} found — exact count unavailable`
}

const inferExactTotalFromShortPage = <TResponse extends PagedSearchResponse>(
  request: SearchPageRequest,
  response: TResponse,
): number | null => {
  if (response.content.length < request.pageSize) {
    return request.page * request.pageSize + response.content.length
  }
  return null
}

export const loadSearchWithDeferredTotal = async <
  TRequest extends SearchPageRequest,
  TResponse extends PagedSearchResponse,
>({
  request,
  cachedTotal,
  search,
  count,
  deferCount = false,
}: {
  request: TRequest
  cachedTotal?: number
  search: (request: TRequest, options?: KnownTotalSearchOptions) => Promise<TResponse>
  count: (request: TRequest) => Promise<number>
  deferCount?: boolean
}): Promise<DeferredSearchResult<TResponse>> => {
  if (cachedTotal !== undefined) {
    const response = await search(request, { knownTotal: cachedTotal })
    return {
      response: withTotal(response, cachedTotal),
      totalIsExact: true,
    }
  }

  const optimisticTotal = optimisticTotalFor(request)
  const response = await search(request, { knownTotal: optimisticTotal })
  if (response.page.totalElements !== optimisticTotal) {
    return {
      response,
      totalIsExact: true,
    }
  }

  const inferredTotal = inferExactTotalFromShortPage(request, response)
  if (inferredTotal !== null) {
    return {
      response: withTotal(response, inferredTotal),
      totalIsExact: true,
    }
  }

  if (deferCount) {
    return {
      response,
      totalIsExact: false,
      deferredResponse: count(request).then((total) => withTotal(response, total)),
    }
  }

  const total = await count(request)

  return {
    response: withTotal(response, total),
    totalIsExact: true,
  }
}

const scheduleIdlePrefetch = (prefetch: () => void): void => {
  if (typeof globalThis.requestIdleCallback === 'function') {
    globalThis.requestIdleCallback(prefetch, { timeout: PREFETCH_IDLE_TIMEOUT_MS })
    return
  }

  globalThis.setTimeout(prefetch, 0)
}

const scheduleNextSearchPagePrefetch = <
  TRequest extends SearchPageRequest,
  TResponse extends PagedSearchResponse,
>(
  config: SearchPrefetchConfig<TRequest, TResponse>,
): void => {
  const { pageId, principal, request, response, search, onError } = config
  const targetPage = request.page + 1
  if (
    request.pageSize > MAX_PREFETCH_PAGE_SIZE ||
    targetPage >= response.page.totalPages ||
    response.content.length < request.pageSize
  ) {
    return
  }

  const targetRequest = { ...request, page: targetPage }
  const targetPageCacheKey = buildPageDataCacheKey(pageId, principal, targetRequest)
  if (
    getPageDataCache<TResponse>(targetPageCacheKey) ||
    pendingPagePrefetches.has(targetPageCacheKey)
  ) {
    return
  }

  const pageCacheGeneration = getPageDataCacheGeneration()
  pendingPagePrefetches.add(targetPageCacheKey)
  scheduleIdlePrefetch(() => {
    if (
      getPageDataCacheGeneration() !== pageCacheGeneration ||
      getPageDataCache<TResponse>(targetPageCacheKey)
    ) {
      pendingPagePrefetches.delete(targetPageCacheKey)
      return
    }

    void search(targetRequest, { knownTotal: response.page.totalElements })
      .then((targetResponse) => {
        setPageDataCache(
          targetPageCacheKey,
          withTotal(targetResponse, response.page.totalElements),
          pageCacheGeneration,
        )
      })
      .catch((error) => onError?.(error))
      .finally(() => {
        pendingPagePrefetches.delete(targetPageCacheKey)
      })
  })
}

export const prefetchNextSearchPage = <
  TRequest extends SearchPageRequest,
  TResponse extends PagedSearchResponse,
>(
  config: SearchPrefetchConfig<TRequest, TResponse>,
): void => scheduleNextSearchPagePrefetch(config)

// Compatibility wrapper for existing consumers. Speculative work is intentionally next-page only.
export const prefetchAdjacentSearchPages = <
  TRequest extends SearchPageRequest,
  TResponse extends PagedSearchResponse,
>(
  config: SearchPrefetchConfig<TRequest, TResponse>,
): void => scheduleNextSearchPagePrefetch(config)
