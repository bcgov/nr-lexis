import type { AxiosResponse } from 'axios'
import apiService from '@/service/api-service'
import { booleanField, isRecord, type UnknownRecord } from '@/utils/record'

const SEARCH_CACHE_TTL_MS = 10_000

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
