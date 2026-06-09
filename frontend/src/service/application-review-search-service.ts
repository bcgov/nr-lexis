import type {
  ApplicationReviewPreviewResponse,
  ApplicationReviewSearchRequest,
  ApplicationReviewSearchResponse,
  ApplicationReviewSearchItem,
} from '@/interfaces/ApplicationReviewSearch'
import apiService from '@/service/api-service'
import { getCachedSearchResponse } from '@/service/cached-search-service'
import { getSearchCount } from '@/service/search-count-service'
import { toSearchServiceError } from '@/service/search-service-fallback'

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

type BackendApplicationReviewPreviewResponse = {
  results: BackendApplicationReviewSearchResult[]
  hasNext: boolean
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

const mapBackendReviewRow = (
  row: BackendApplicationReviewSearchResult,
): ApplicationReviewSearchItem => ({
  applicationNumber: String(row.applicationNumber ?? ''),
  volume: row.volume ?? 0,
  speciesEndUse: row.speciesEndUse ?? '',
  listingDate: row.listingDate ?? '',
  status: row.status ?? '',
  region: row.region ?? '',
  showInfoIcon: Boolean(row.showInfoIcon),
})

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
    content: backendResponse.results.map(mapBackendReviewRow),
    page: {
      number: pageNumber,
      size: pageSize,
      totalElements,
      totalPages,
    },
  }
}

const parseBackendPreviewResponse = (payload: unknown): ApplicationReviewPreviewResponse | null => {
  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as any).results)) {
    return null
  }

  const backendResponse = payload as BackendApplicationReviewPreviewResponse
  const pageSize = Number.isFinite(backendResponse.size) ? backendResponse.size : 5
  const pageNumber = Number.isFinite(backendResponse.page) ? backendResponse.page : 0

  return {
    content: backendResponse.results.map(mapBackendReviewRow),
    page: {
      number: pageNumber,
      size: pageSize,
      hasNext: Boolean(backendResponse.hasNext),
    },
  }
}

export const searchApplicationReviews = async (
  request: ApplicationReviewSearchRequest,
): Promise<ApplicationReviewSearchResponse> => {
  try {
    const response = await getCachedSearchResponse<unknown>(
      '/lexis/application-reviews/search',
      buildBackendParams(request),
    )

    const parsed = parseBackendResponse(response.data)
    if (!parsed) {
      throw new Error('Backend application review response did not include results.')
    }

    return parsed
  } catch (error) {
    throw toSearchServiceError('Unable to load provincial review search results.', error)
  }
}

export const countApplicationReviews = async (
  request: ApplicationReviewSearchRequest,
): Promise<number> =>
  getSearchCount(
    '/lexis/application-reviews/search/count',
    buildBackendParams(request),
    'Unable to count provincial review search results.',
  )

export const previewApplicationReviews = async (
  request: ApplicationReviewSearchRequest,
): Promise<ApplicationReviewPreviewResponse> => {
  try {
    const response = await getCachedSearchResponse<unknown>(
      '/lexis/application-reviews/search/preview',
      buildBackendParams(request),
    )

    const parsed = parseBackendPreviewResponse(response.data)
    if (!parsed) {
      throw new Error('Backend application review preview response did not include results.')
    }

    return parsed
  } catch (error) {
    throw toSearchServiceError('Unable to load provincial review preview results.', error)
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
