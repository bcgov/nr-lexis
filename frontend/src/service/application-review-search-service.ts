import type {
  ApplicationReviewPreviewResponse,
  ApplicationReviewSearchRequest,
  ApplicationReviewSearchResponse,
  ApplicationReviewSearchItem,
} from '@/interfaces/ApplicationReviewSearch'
import apiService from '@/service/api-service'
import {
  appendNumericSearchParams,
  appendSearchParams,
  appendSearchSortAndPageParams,
  getCachedSearchResponse,
  parsePagedSearchResponse,
  parsePreviewSearchResponse,
} from '@/service/cached-search-service'
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

export type ApplicationReviewStatusUpdateResult = {
  updated: boolean
  valid: boolean
  statusCode: string | null
  clientEmail: string | null
  remark: string | null
  remarkId?: number | null
  remarkUser?: string | null
  remarkDate?: string | null
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

  const { filters } = request
  appendSearchParams(params, [
    ['applicationNumber', filters.applicationNumber],
    ['productTypeCode', filters.productTypeCode],
    ['receivedFromDate', filters.receivedFromDate],
    ['receivedToDate', filters.receivedToDate],
    ['listingFromDate', filters.listingFromDate],
    ['listingToDate', filters.listingToDate],
  ])
  appendNumericSearchParams(params, 'region', filters.region)
  appendSearchSortAndPageParams(params, request)

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
  return parsePagedSearchResponse<
    BackendApplicationReviewSearchResult,
    ApplicationReviewSearchItem
  >(payload, mapBackendReviewRow)
}

const parseBackendPreviewResponse = (payload: unknown): ApplicationReviewPreviewResponse | null => {
  return parsePreviewSearchResponse<
    BackendApplicationReviewSearchResult,
    ApplicationReviewSearchItem
  >(payload, mapBackendReviewRow)
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
