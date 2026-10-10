import {
  createPagedSearchParams,
  getCachedSearchResponse,
  parsePagedSearchResponse,
  requireParsedSearchResponse,
} from '@/service/cached-search-service'
import { getSearchCount } from '@/service/search-count-service'
import { toSearchServiceError } from '@/service/search-service-fallback'
import type {
  FederalApplicationSearchRequest,
  FederalApplicationSearchResponse,
} from '@/interfaces/FederalApplicationSearch'

type BackendFederalApplicationSearchResult = {
  applicationNumber: number
  federalApplicationNumber: string
  status: string
  client: string
  reason: string
  receivedDate: string
  listingDate: string
}

type FederalApplicationSearchOptions = {
  knownTotal?: number
}

const buildBackendParams = (request: FederalApplicationSearchRequest): URLSearchParams => {
  const { filters } = request
  return createPagedSearchParams(request, [
    ['applicationNumber', filters.applicationNumber],
    ['packageNumber', filters.packageNumber],
    ['applicationStatus', filters.applicationStatus],
    ['receivedFromDate', filters.receivedFromDate],
    ['receivedToDate', filters.receivedToDate],
    ['listingFromDate', filters.listingFromDate],
    ['listingToDate', filters.listingToDate],
    // The backend owner filter implements the legacy owner-or-agent match.
    ['ownerClientNumber', filters.clientNumber],
  ])
}

const parseBackendResponse = (payload: unknown): FederalApplicationSearchResponse | null => {
  return parsePagedSearchResponse<
    BackendFederalApplicationSearchResult,
    FederalApplicationSearchResponse['content'][number]
  >(payload, (row) => ({
    applicationNumber: String(row.applicationNumber ?? ''),
    federalApplicationNumber: row.federalApplicationNumber ?? '',
    status: row.status ?? '',
    clientNumber: row.client ?? '',
    reason: row.reason ?? '',
    receivedDate: row.receivedDate ?? '',
    listingDate: row.listingDate ?? '',
  }))
}

export const searchFederalApplications = async (
  request: FederalApplicationSearchRequest,
  options: FederalApplicationSearchOptions = {},
): Promise<FederalApplicationSearchResponse> => {
  try {
    const params = buildBackendParams(request)
    const knownTotal = options.knownTotal
    if (Number.isInteger(knownTotal) && knownTotal !== undefined && knownTotal >= 0) {
      params.append('knownTotal', String(knownTotal))
    }

    const response = await getCachedSearchResponse<unknown>(
      '/lexis/federal/applications/search',
      params,
    )

    return requireParsedSearchResponse(
      parseBackendResponse(response.data),
      'Backend federal application response did not include results.',
    )
  } catch (error) {
    throw toSearchServiceError('Unable to load federal application search results.', error)
  }
}

export const countFederalApplications = async (
  request: FederalApplicationSearchRequest,
): Promise<number> =>
  getSearchCount(
    '/lexis/federal/applications/search/count',
    buildBackendParams(request),
    'Unable to count federal application search results.',
  )
