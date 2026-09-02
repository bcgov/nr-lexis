import { useEffect, useRef } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'

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

const storageKey = (pageId: PersistedSearchPageId): string =>
  `${SEARCH_STATE_STORAGE_PREFIX}${pageId}`

const readPersistedSearch = (pageId: PersistedSearchPageId): string => {
  try {
    return window.sessionStorage.getItem(storageKey(pageId))?.trim() ?? ''
  } catch {
    return ''
  }
}

const persistSearch = (pageId: PersistedSearchPageId, search: string): void => {
  try {
    window.sessionStorage.setItem(storageKey(pageId), search)
  } catch {
    // Search remains URL-driven when browser storage is unavailable.
  }
}

const removePersistedSearch = (pageId: PersistedSearchPageId): void => {
  try {
    window.sessionStorage.removeItem(storageKey(pageId))
  } catch {
    // Search remains URL-driven when browser storage is unavailable.
  }
}

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

export const resetPersistedRegionSearchState = (): void => {
  REGION_SCOPED_SEARCH_PAGES.forEach((pageId) => {
    const persistedSearch = readPersistedSearch(pageId)
    if (!persistedSearch) {
      return
    }

    const params = new URLSearchParams(persistedSearch)
    params.delete('region')
    const nextSearch = params.toString()
    if (nextSearch) {
      persistSearch(pageId, nextSearch)
    } else {
      removePersistedSearch(pageId)
    }
  })

  window.dispatchEvent(new Event(DEFAULT_REGION_CHANGE_EVENT))
}

/**
 * INTENTIONAL_LEGACY_DIVERGENCE(SEARCH_STATE_PERSISTENCE):
 * Modern LEXIS restores each search page's last applied URL query during in-app navigation.
 * Authentication boundaries clear this user-scoped state.
 */
export const usePersistedSearchParams = (pageId: PersistedSearchPageId) => {
  const location = useLocation()
  const initializedRef = useRef(false)
  const initialPersistedParamsRef = useRef<URLSearchParams | undefined>(undefined)

  if (!initializedRef.current) {
    initializedRef.current = true
    if (location.search.length === 0) {
      const persistedSearch = readPersistedSearch(pageId)
      if (persistedSearch.length > 0) {
        initialPersistedParamsRef.current = new URLSearchParams(persistedSearch)
      }
    }
  }

  const [searchParams, setSearchParams] = useSearchParams(initialPersistedParamsRef.current)
  const restoredRef = useRef(false)

  useEffect(() => {
    if (restoredRef.current) {
      return
    }
    restoredRef.current = true

    if (
      location.search.length === 0 &&
      initialPersistedParamsRef.current &&
      initialPersistedParamsRef.current.size > 0
    ) {
      setSearchParams(initialPersistedParamsRef.current, { replace: true })
    }
  }, [location.search, setSearchParams])

  useEffect(() => {
    const appliedSearch = searchParams.toString()
    if (appliedSearch.length > 0) {
      persistSearch(pageId, appliedSearch)
    } else {
      removePersistedSearch(pageId)
    }
  }, [pageId, searchParams])

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
