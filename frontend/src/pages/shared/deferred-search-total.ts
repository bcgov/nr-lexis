import {
  buildPageDataCacheKey,
  getPageDataCache,
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
}

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
  isLatestRequest,
  onExactTotal,
  onCountError,
}: {
  request: TRequest
  cachedTotal?: number
  search: (request: TRequest, options?: KnownTotalSearchOptions) => Promise<TResponse>
  count: (request: TRequest) => Promise<number>
  isLatestRequest: () => boolean
  onExactTotal: (response: TResponse) => void
  onCountError?: (error: unknown) => void
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

  void count(request)
    .then((total) => {
      if (isLatestRequest()) {
        onExactTotal(withTotal(response, total))
      }
    })
    .catch((error) => {
      if (isLatestRequest()) {
        onCountError?.(error)
      }
    })

  return {
    response: withTotal(response, optimisticTotal),
    totalIsExact: false,
  }
}

const prefetchSearchPage = <
  TRequest extends SearchPageRequest,
  TResponse extends PagedSearchResponse,
>({
  pageId,
  principal,
  request,
  response,
  search,
  onError,
  targetPage,
}: SearchPrefetchConfig<TRequest, TResponse> & { targetPage: number }): void => {
  if (targetPage < 0 || targetPage >= response.page.totalPages) {
    return
  }

  if (targetPage > request.page && response.content.length < request.pageSize) {
    return
  }

  const targetRequest = {
    ...request,
    page: targetPage,
  }
  const targetPageCacheKey = buildPageDataCacheKey(pageId, principal, targetRequest)
  if (
    getPageDataCache<TResponse>(targetPageCacheKey) ||
    pendingPagePrefetches.has(targetPageCacheKey)
  ) {
    return
  }

  pendingPagePrefetches.add(targetPageCacheKey)
  void search(targetRequest, { knownTotal: response.page.totalElements })
    .then((targetResponse) => {
      setPageDataCache(targetPageCacheKey, withTotal(targetResponse, response.page.totalElements))
    })
    .catch((error) => onError?.(error))
    .finally(() => {
      pendingPagePrefetches.delete(targetPageCacheKey)
    })
}

export const prefetchAdjacentSearchPages = <
  TRequest extends SearchPageRequest,
  TResponse extends PagedSearchResponse,
>(
  config: SearchPrefetchConfig<TRequest, TResponse>,
): void => {
  prefetchSearchPage({ ...config, targetPage: config.request.page + 1 })
  prefetchSearchPage({ ...config, targetPage: config.request.page - 1 })
}
