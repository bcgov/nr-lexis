const SEARCH_TOTAL_CACHE_TTL_MS = 60_000

export type SearchTotalCacheEntry = {
  total: number
  expiresAt: number
}

export type SearchTotalCache = Map<string, SearchTotalCacheEntry>

const normalizeCacheValue = (value: unknown): unknown => {
  if (typeof value === 'string') {
    return value.trim()
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeCacheValue(item))
      .filter((item) => item !== '')
      .sort()
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, normalizeCacheValue(item)]),
    )
  }

  return value
}

export const buildSearchTotalCacheKey = (filters: unknown): string =>
  JSON.stringify(normalizeCacheValue(filters))

export const getCachedSearchTotal = (
  cache: SearchTotalCache,
  cacheKey: string,
  now = Date.now(),
): number | undefined => {
  const cachedEntry = cache.get(cacheKey)
  if (!cachedEntry) {
    return undefined
  }
  if (cachedEntry.expiresAt > now) {
    return cachedEntry.total
  }
  cache.delete(cacheKey)
  return undefined
}

export const setCachedSearchTotal = (
  cache: SearchTotalCache,
  cacheKey: string,
  total: number,
  now = Date.now(),
): void => {
  cache.set(cacheKey, {
    total,
    expiresAt: now + SEARCH_TOTAL_CACHE_TTL_MS,
  })
}
