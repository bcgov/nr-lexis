import type {
  ApplicationReviewPreviewResponse,
  ApplicationReviewSearchRequest,
  ApplicationReviewSearchResponse,
  ApplicationReviewSearchItem,
} from '@/interfaces/ApplicationReviewSearch'
import apiService from '@/service/api-service'
import {
  createSortedPagedSearchParams,
  getCachedSearchResponse,
  parsePagedSearchResponse,
  parsePreviewSearchResponse,
  requireParsedSearchResponse,
} from '@/service/cached-search-service'
import { getSearchCount } from '@/service/search-count-service'
import { toSearchServiceError } from '@/service/search-service-fallback'
import { RECORD_VERSION_HEADER } from '@/service/optimistic-conflict'

type BackendApplicationReviewSearchResult = {
  applicationNumber: number
  volume: number
  speciesEndUse: string
  listingDate: string
  status: string
  region: string
  showInfoIcon: boolean
}

type ApplicationReviewSearchOptions = {
  knownTotal?: number
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

type ApplicationReviewStatusUpdateRequest = {
  statusCode: string
  remark: string
  clientEmailAddress: string
}

type ApplicationReviewStatusEmailResult = {
  success: boolean
  message: string
}

const buildBackendParams = (request: ApplicationReviewSearchRequest): URLSearchParams => {
  const { filters } = request
  return createSortedPagedSearchParams(
    request,
    [
      ['applicationNumber', filters.applicationNumber],
      ['productTypeCode', filters.productTypeCode],
      ['receivedFromDate', filters.receivedFromDate],
      ['receivedToDate', filters.receivedToDate],
      ['listingFromDate', filters.listingFromDate],
      ['listingToDate', filters.listingToDate],
    ],
    [['region', filters.region]],
  )
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
  options: ApplicationReviewSearchOptions = {},
): Promise<ApplicationReviewSearchResponse> => {
  try {
    const params = buildBackendParams(request)
    const knownTotal = options.knownTotal
    if (Number.isInteger(knownTotal) && knownTotal !== undefined && knownTotal >= 0) {
      params.append('knownTotal', String(knownTotal))
    }

    const response = await getCachedSearchResponse<unknown>(
      '/lexis/application-reviews/search',
      params,
    )

    return requireParsedSearchResponse(
      parseBackendResponse(response.data),
      'Backend application review response did not include results.',
    )
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

    return requireParsedSearchResponse(
      parseBackendPreviewResponse(response.data),
      'Backend application review preview response did not include results.',
    )
  } catch (error) {
    throw toSearchServiceError('Unable to load provincial review preview results.', error)
  }
}

export const approveApplicationReview = async (
  applicationNumber: string,
  recordVersion?: string,
): Promise<ApplicationReviewStatusUpdateResult> => {
  const response = await apiService
    .getAxiosInstance()
    .post<ApplicationReviewStatusUpdateResult>(
      `/lexis/application-reviews/${applicationNumber}/approve`,
      undefined,
      recordVersion ? { headers: { [RECORD_VERSION_HEADER]: recordVersion } } : undefined,
    )

  return response.data
}

export const updateApplicationReviewStatus = async (
  applicationNumber: string,
  payload: ApplicationReviewStatusUpdateRequest,
  recordVersion?: string,
): Promise<ApplicationReviewStatusUpdateResult> => {
  const response = await apiService
    .getAxiosInstance()
    .post<ApplicationReviewStatusUpdateResult>(
      `/lexis/application-reviews/${applicationNumber}/status`,
      payload,
      recordVersion ? { headers: { [RECORD_VERSION_HEADER]: recordVersion } } : undefined,
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
