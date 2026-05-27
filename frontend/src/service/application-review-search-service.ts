import type {
  ApplicationReviewSearchItem,
  ApplicationReviewSearchRequest,
  ApplicationReviewSearchResponse,
  ApplicationReviewSearchSortField,
} from '@/interfaces/ApplicationReviewSearch'
import apiService from '@/service/api-service'
import {
  isSearchServiceMockFallbackEnabled,
  toSearchServiceError,
} from '@/service/search-service-fallback'

const MOCK_APPLICATION_REVIEWS: ApplicationReviewSearchItem[] = [
  {
    applicationNumber: '1000123',
    volume: 210.5,
    speciesEndUse: 'LOG',
    listingDate: '2026-02-01',
    status: 'NEW',
    region: '11',
    showInfoIcon: true,
  },
  {
    applicationNumber: '1000456',
    volume: 95,
    speciesEndUse: 'LUM',
    listingDate: '2026-02-26',
    status: 'REV',
    region: '12',
    showInfoIcon: false,
  },
  {
    applicationNumber: '1000999',
    volume: 325.75,
    speciesEndUse: 'LOG',
    listingDate: '2025-11-30',
    status: 'PER',
    region: '24',
    showInfoIcon: false,
  },
]

const SORTERS: Record<
  ApplicationReviewSearchSortField,
  (row: ApplicationReviewSearchItem) => string | number
> = {
  applicationNumber: (row) => row.applicationNumber,
  volume: (row) => row.volume,
  speciesEndUse: (row) => row.speciesEndUse,
  listingDate: (row) => row.listingDate,
  status: (row) => row.status,
  region: (row) => row.region,
}

const normalizeText = (value: string): string => value.trim().toLowerCase()

const includesText = (source: string, filter: string): boolean => {
  if (!filter.trim()) return true
  return normalizeText(source).includes(normalizeText(filter))
}

const isAfterOrEqual = (value: string, from: string): boolean => {
  if (!from.trim()) return true
  return value >= from
}

const isBeforeOrEqual = (value: string, to: string): boolean => {
  if (!to.trim()) return true
  return value <= to
}

const applyMockSearch = (
  request: ApplicationReviewSearchRequest,
): ApplicationReviewSearchResponse => {
  const { filters, sortField, sortDirection, page, pageSize } = request

  let rows = MOCK_APPLICATION_REVIEWS.filter((item) => {
    return (
      includesText(item.applicationNumber, filters.applicationNumber) &&
      (!filters.productTypeCode || item.speciesEndUse === filters.productTypeCode) &&
      (filters.region.length === 0 || filters.region.includes(item.region)) &&
      isAfterOrEqual(item.listingDate, filters.listingFromDate) &&
      isBeforeOrEqual(item.listingDate, filters.listingToDate)
    )
  })

  rows = rows.sort((a, b) => {
    const aValue = SORTERS[sortField](a)
    const bValue = SORTERS[sortField](b)
    if (aValue === bValue) return 0
    const result = aValue > bValue ? 1 : -1
    return sortDirection === 'asc' ? result : -result
  })

  const totalElements = rows.length
  const totalPages = Math.max(1, Math.ceil(totalElements / pageSize))
  const pageNumber = Math.min(page, totalPages - 1)
  const start = pageNumber * pageSize
  const end = start + pageSize

  return {
    content: rows.slice(start, end),
    page: {
      number: pageNumber,
      size: pageSize,
      totalElements,
      totalPages,
    },
  }
}

type BackendApplicationReviewSearchResult = {
  applicationNumber: number
  volume: number
  speciesEndUse: string
  listingDate: string
  status: string
  region: string
  showInfoIcon: boolean
}

type BackendApplicationReviewSearchResponse = {
  results: BackendApplicationReviewSearchResult[]
  total: number
  page: number
  size: number
}

export type ApplicationReviewStatusUpdateResult = {
  updated: boolean
  valid: boolean
  statusCode: string
  clientEmail: string
  remark: string
  message: string
}

export type ApplicationReviewStatusUpdateRequest = {
  statusCode: string
  remark: string
  clientEmailAddress: string
}

export type ApplicationReviewStatusEmailResult = {
  success: boolean
  message: string
}

const buildBackendParams = (request: ApplicationReviewSearchRequest): URLSearchParams => {
  const params = new URLSearchParams()

  const appendIfPresent = (key: string, value: string) => {
    const trimmed = value.trim()
    if (trimmed.length > 0) {
      params.append(key, trimmed)
    }
  }

  const { filters } = request
  appendIfPresent('applicationNumber', filters.applicationNumber)
  appendIfPresent('productTypeCode', filters.productTypeCode)
  appendIfPresent('receivedFromDate', filters.receivedFromDate)
  appendIfPresent('receivedToDate', filters.receivedToDate)
  appendIfPresent('listingFromDate', filters.listingFromDate)
  appendIfPresent('listingToDate', filters.listingToDate)

  filters.region
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0)
    .forEach((value) => {
      params.append('region', String(value))
    })

  const backendSortField =
    request.sortDirection === 'desc' ? `${request.sortField} DESC` : request.sortField
  params.append('sortField', backendSortField)
  params.append('page', String(request.page))
  params.append('size', String(request.pageSize))

  return params
}

const parseBackendResponse = (payload: unknown): ApplicationReviewSearchResponse | null => {
  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as any).results)) {
    return null
  }

  const backendResponse = payload as BackendApplicationReviewSearchResponse
  const totalElements = Number.isFinite(backendResponse.total) ? backendResponse.total : 0
  const pageSize = Number.isFinite(backendResponse.size) ? backendResponse.size : 10
  const pageNumber = Number.isFinite(backendResponse.page) ? backendResponse.page : 0
  const totalPages = Math.max(1, Math.ceil(totalElements / Math.max(pageSize, 1)))

  return {
    content: backendResponse.results.map((row) => ({
      applicationNumber: String(row.applicationNumber ?? ''),
      volume: row.volume ?? 0,
      speciesEndUse: row.speciesEndUse ?? '',
      listingDate: row.listingDate ?? '',
      status: row.status ?? '',
      region: row.region ?? '',
      showInfoIcon: Boolean(row.showInfoIcon),
    })),
    page: {
      number: pageNumber,
      size: pageSize,
      totalElements,
      totalPages,
    },
  }
}

export const searchApplicationReviews = async (
  request: ApplicationReviewSearchRequest,
): Promise<ApplicationReviewSearchResponse> => {
  try {
    const response = await apiService
      .getAxiosInstance()
      .get('/lexis/application-reviews/search', { params: buildBackendParams(request) })

    const parsed = parseBackendResponse(response.data)
    if (!parsed) {
      throw new Error('Backend application review response did not include results.')
    }

    return parsed
  } catch (error) {
    if (isSearchServiceMockFallbackEnabled()) {
      console.warn('Using mock application review search data.', error)
      return applyMockSearch(request)
    }
    throw toSearchServiceError('Unable to load provincial review search results.', error)
  }
}

export const approveApplicationReview = async (
  applicationNumber: string,
): Promise<ApplicationReviewStatusUpdateResult> => {
  const response = await apiService
    .getAxiosInstance()
    .post<ApplicationReviewStatusUpdateResult>(
      `/lexis/application-reviews/${applicationNumber}/approve`,
    )

  return response.data
}

export const updateApplicationReviewStatus = async (
  applicationNumber: string,
  payload: ApplicationReviewStatusUpdateRequest,
): Promise<ApplicationReviewStatusUpdateResult> => {
  const response = await apiService
    .getAxiosInstance()
    .post<ApplicationReviewStatusUpdateResult>(
      `/lexis/application-reviews/${applicationNumber}/status`,
      payload,
    )

  return response.data
}

export const sendApplicationReviewStatusEmail = async (
  applicationNumber: string,
  payload: ApplicationReviewStatusUpdateRequest,
): Promise<ApplicationReviewStatusEmailResult> => {
  const response = await apiService
    .getAxiosInstance()
    .post<ApplicationReviewStatusEmailResult>(
      `/lexis/application-reviews/${applicationNumber}/status-email`,
      payload,
    )

  return response.data
}
