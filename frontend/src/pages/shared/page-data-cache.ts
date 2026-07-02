const pageDataCache = new Map<string, unknown>()
const MAX_PAGE_DATA_CACHE_ENTRIES = 200

const normalizePrincipal = (principal?: string | null): string =>
  principal && principal.trim().length > 0 ? principal.trim() : 'anonymous'

export const buildPageDataCacheKey = (
  pageId: string,
  principal: string | null | undefined,
  request: unknown,
): string => `${pageId}|${normalizePrincipal(principal)}|${JSON.stringify(request)}`

export const getPageDataCache = <T>(key: string): T | null => {
  return pageDataCache.has(key) ? (pageDataCache.get(key) as T) : null
}

export const setPageDataCache = <T>(key: string, value: T): void => {
  if (pageDataCache.has(key)) {
    pageDataCache.delete(key)
  }
  pageDataCache.set(key, value)
  while (pageDataCache.size > MAX_PAGE_DATA_CACHE_ENTRIES) {
    const oldestKey = pageDataCache.keys().next().value
    if (!oldestKey) {
      return
    }
    pageDataCache.delete(oldestKey)
  }
}

export const clearPageDataCache = (key: string): void => {
  pageDataCache.delete(key)
}

export const clearAllPageDataCache = (): void => {
  pageDataCache.clear()
}
