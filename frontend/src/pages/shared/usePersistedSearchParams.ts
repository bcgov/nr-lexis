import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'

type PersistedSearchPageId =
  | 'federal-applications'
  | 'provincial-applications'
  | 'provincial-exemptions'
  | 'provincial-offers'
  | 'provincial-permits'
  | 'provincial-review'

const SEARCH_STATE_STORAGE_PREFIX = 'lexis.search-state.v1.'
const DEFAULT_REGION_CHANGE_EVENT = 'lexis:default-region-change'

const REGION_SCOPED_SEARCH_PAGES = new Set<PersistedSearchPageId>([
  'provincial-applications',
  'provincial-exemptions',
  'provincial-offers',
  'provincial-permits',
  'provincial-review',
])

/** Removes any LEXIS search state saved in this browser session. */
export const clearPersistedSearchState = (): void => {
  try {
    const matchingKeys: string[] = []
    for (let index = 0; index < window.sessionStorage.length; index += 1) {
      const key = window.sessionStorage.key(index)
      if (key?.startsWith(SEARCH_STATE_STORAGE_PREFIX)) {
        matchingKeys.push(key)
      }
    }
    matchingKeys.forEach((key) => window.sessionStorage.removeItem(key))
  } catch {
    // Authentication cleanup still proceeds when browser storage is unavailable.
  }
}

/** Drops the region filter from the open search so it starts again from the new default zone. */
export const resetPersistedRegionSearchState = (): void => {
  window.dispatchEvent(new Event(DEFAULT_REGION_CHANGE_EVENT))
}

/**
 * INTENTIONAL_LEGACY_DIVERGENCE(SEARCH_STATE_PERSISTENCE):
 * Each search page keeps its applied search in the URL query, so Back links, browser history and
 * reloads return to the same results. A search page opened without a query, as from the menu,
 * starts with filters only.
 */
export const usePersistedSearchParams = (pageId: PersistedSearchPageId) => {
  const [searchParams, setSearchParams] = useSearchParams()

  useEffect(() => {
    if (!REGION_SCOPED_SEARCH_PAGES.has(pageId)) {
      return undefined
    }

    const resetCurrentRegion = () => {
      setSearchParams(
        (currentParams) => {
          if (!currentParams.has('region')) {
            return currentParams
          }
          const nextParams = new URLSearchParams(currentParams)
          nextParams.delete('region')
          return nextParams
        },
        { replace: true },
      )
    }

    window.addEventListener(DEFAULT_REGION_CHANGE_EVENT, resetCurrentRegion)
    return () => window.removeEventListener(DEFAULT_REGION_CHANGE_EVENT, resetCurrentRegion)
  }, [pageId, setSearchParams])

  return [searchParams, setSearchParams] as const
}
