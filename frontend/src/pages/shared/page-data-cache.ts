type PageDataCacheEntry = {
  expiresAt: number
  value: unknown
}

const pageDataCache = new Map<string, PageDataCacheEntry>()
const MAX_PAGE_DATA_CACHE_ENTRIES = 200
const PAGE_DATA_CACHE_TTL_MS = 30_000
let pageDataCacheGeneration = 0

const normalizePrincipal = (principal?: string | null): string =>
  principal && principal.trim().length > 0 ? principal.trim() : 'anonymous'

export const buildPageDataCacheKey = (
  pageId: string,
  principal: string | null | undefined,
  request: unknown,
): string => `${pageId}|${normalizePrincipal(principal)}|${JSON.stringify(request)}`

export const getPageDataCacheGeneration = (): number => pageDataCacheGeneration

export const getPageDataCache = <T>(key: string, currentTime = Date.now()): T | null => {
  const entry = pageDataCache.get(key)
  if (!entry) {
    return null
  }
  if (entry.expiresAt <= currentTime) {
    pageDataCache.delete(key)
    return null
  }
  return entry.value as T
}

export const setPageDataCache = <T>(
  key: string,
  value: T,
  expectedGeneration: number,
  currentTime = Date.now(),
): boolean => {
  if (expectedGeneration !== pageDataCacheGeneration) {
    return false
  }
  for (const [cachedKey, entry] of pageDataCache.entries()) {
    if (entry.expiresAt <= currentTime) {
      pageDataCache.delete(cachedKey)
    }
  }
  if (pageDataCache.has(key)) {
    pageDataCache.delete(key)
  }
  pageDataCache.set(key, {
    expiresAt: currentTime + PAGE_DATA_CACHE_TTL_MS,
    value,
  })
  while (pageDataCache.size > MAX_PAGE_DATA_CACHE_ENTRIES) {
    const oldestKey = pageDataCache.keys().next().value
    if (oldestKey === undefined) {
      break
    }
    pageDataCache.delete(oldestKey)
  }
  return true
}

export const clearPageDataCache = (key: string): void => {
  pageDataCache.delete(key)
  pageDataCacheGeneration += 1
}

export const clearAllPageDataCache = (): void => {
  pageDataCache.clear()
  pageDataCacheGeneration += 1
}
