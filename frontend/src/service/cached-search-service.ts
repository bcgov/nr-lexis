import type { AxiosResponse } from 'axios'
import apiService from '@/service/api-service'
import { booleanField, isRecord, type UnknownRecord } from '@/utils/record'

const SEARCH_CACHE_TTL_MS = 10_000

export type SearchPageRequest = {
  page: number
  pageSize: number
}

export type SearchSortRequest = SearchPageRequest & {
  sortField: string
  sortDirection: 'asc' | 'desc'
}

export type SearchTextParamEntry = readonly [key: string, value: string]
export type SearchNumericParamEntry = readonly [key: string, values: string[]]

export type PagedSearchResponse<T> = {
  content: T[]
  page: {
    number: number
    size: number
    totalElements: number
    totalPages: number
  }
}

export type PreviewSearchResponse<T> = {
  content: T[]
  page: {
    number: number
    size: number
    hasNext: boolean
  }
}

type BackendResultsRecord<T> = UnknownRecord & {
  results: T[]
}

const numberField = (record: UnknownRecord, field: string, fallback: number): number => {
  const value = record[field]
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

const backendResultsRecord = <T>(payload: unknown): BackendResultsRecord<T> | null => {
  if (!isRecord(payload) || !Array.isArray(payload.results)) {
    return null
  }

  return payload as BackendResultsRecord<T>
}

export const getCachedSearchResponse = async <T>(
  path: string,
  params: URLSearchParams,
): Promise<AxiosResponse<T>> => {
  return apiService.getCachedResponse<T>(
    path,
    {
      params,
    },
    {
      ttlMs: SEARCH_CACHE_TTL_MS,
    },
  )
}

export const appendSearchParam = (params: URLSearchParams, key: string, value: string): void => {
  const trimmed = value.trim()
  if (trimmed.length > 0) {
    params.append(key, trimmed)
  }
}

export const appendSearchParams = (
  params: URLSearchParams,
  entries: SearchTextParamEntry[],
): void => {
  entries.forEach(([key, value]) => {
    appendSearchParam(params, key, value)
  })
}

export const appendNumericSearchParams = (
  params: URLSearchParams,
  key: string,
  values: string[],
): void => {
  values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0)
    .forEach((value) => {
      params.append(key, String(value))
    })
}

export const uniqueSearchItemsByKey = <T>(items: T[], getKey: (item: T) => string): T[] => {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = getKey(item)
    if (!key || seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}

export const requireParsedSearchResponse = <T>(response: T | null, message: string): T => {
  if (!response) {
    throw new Error(message)
  }

  return response
}

export const appendSearchPageParams = (
  params: URLSearchParams,
  request: SearchPageRequest,
): void => {
  params.append('page', String(request.page))
  params.append('size', String(request.pageSize))
}

export const appendSearchSortAndPageParams = (
  params: URLSearchParams,
  request: SearchSortRequest,
): void => {
  const backendSortField =
    request.sortDirection === 'desc' ? `${request.sortField} DESC` : request.sortField
  params.append('sortField', backendSortField)
  appendSearchPageParams(params, request)
}

const appendNumericSearchParamEntries = (
  params: URLSearchParams,
  entries: SearchNumericParamEntry[],
): void => {
  entries.forEach(([key, values]) => {
    appendNumericSearchParams(params, key, values)
  })
}

export const createPagedSearchParams = (
  request: SearchPageRequest,
  textEntries: SearchTextParamEntry[],
  numericEntries: SearchNumericParamEntry[] = [],
): URLSearchParams => {
  const params = new URLSearchParams()
  appendSearchParams(params, textEntries)
  appendNumericSearchParamEntries(params, numericEntries)
  appendSearchPageParams(params, request)
  return params
}

export const createSortedPagedSearchParams = (
  request: SearchSortRequest,
  textEntries: SearchTextParamEntry[],
  numericEntries: SearchNumericParamEntry[] = [],
): URLSearchParams => {
  const params = new URLSearchParams()
  appendSearchParams(params, textEntries)
  appendNumericSearchParamEntries(params, numericEntries)
  appendSearchSortAndPageParams(params, request)
  return params
}

export const parsePagedSearchResponse = <BackendRow, SearchItem>(
  payload: unknown,
  mapRow: (row: BackendRow) => SearchItem,
  defaultPageSize = 10,
): PagedSearchResponse<SearchItem> | null => {
  const backendResponse = backendResultsRecord<BackendRow>(payload)
  if (!backendResponse) {
    return null
  }

  const totalElements = numberField(backendResponse, 'total', 0)
  const pageSize = numberField(backendResponse, 'size', defaultPageSize)
  const pageNumber = numberField(backendResponse, 'page', 0)
  const totalPages = Math.max(1, Math.ceil(totalElements / Math.max(pageSize, 1)))

  return {
    content: backendResponse.results.map(mapRow),
    page: {
      number: pageNumber,
      size: pageSize,
      totalElements,
      totalPages,
    },
  }
}

export const parsePreviewSearchResponse = <BackendRow, SearchItem>(
  payload: unknown,
  mapRow: (row: BackendRow) => SearchItem,
  defaultPageSize = 5,
): PreviewSearchResponse<SearchItem> | null => {
  const backendResponse = backendResultsRecord<BackendRow>(payload)
  if (!backendResponse) {
    return null
  }

  return {
    content: backendResponse.results.map(mapRow),
    page: {
      number: numberField(backendResponse, 'page', 0),
      size: numberField(backendResponse, 'size', defaultPageSize),
      hasNext: booleanField(backendResponse, 'hasNext'),
    },
  }
}
