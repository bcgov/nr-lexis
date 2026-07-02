import {
  createSortedPagedSearchParams,
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
  exemptionType?: string | null
  exemptionNumber?: string | null
  showCheckbox?: boolean | null
  locked?: boolean | null
  receivedDate: string
  listingDate: string
}

type FederalApplicationSearchOptions = {
  knownTotal?: number
}

const buildBackendParams = (request: FederalApplicationSearchRequest): URLSearchParams => {
  const { filters } = request
  return createSortedPagedSearchParams(request, [
    ['applicationNumber', filters.applicationNumber],
    ['packageNumber', filters.packageNumber],
    ['applicationStatus', filters.applicationStatus],
    ['receivedFromDate', filters.receivedFromDate],
    ['receivedToDate', filters.receivedToDate],
    ['listingFromDate', filters.listingFromDate],
    ['listingToDate', filters.listingToDate],
    // The single client filter fans out to both backend owner and agent fields.
    ['ownerClientNumber', filters.clientNumber],
    ['agentClientNumber', filters.clientNumber],
  ])
}

const parseBackendResponse = (payload: unknown): FederalApplicationSearchResponse | null => {
  return parsePagedSearchResponse<
    BackendFederalApplicationSearchResult,
    FederalApplicationSearchResponse['content'][number]
  >(payload, (row) => {
    const hasExemptionNumber =
      typeof row.exemptionNumber === 'string' && row.exemptionNumber.trim().length > 0

    return {
      applicationNumber: String(row.applicationNumber ?? ''),
      federalApplicationNumber: row.federalApplicationNumber ?? '',
      status: row.status ?? '',
      clientNumber: row.client ?? '',
      reason: row.reason ?? '',
      exemptionType: row.exemptionType ?? '',
      exemptionNumber: row.exemptionNumber ?? '',
      receivedDate: row.receivedDate ?? '',
      listingDate: row.listingDate ?? '',
      packageNumber: '',
      allowCreateExemption:
        Boolean(row.showCheckbox ?? !hasExemptionNumber) && !Boolean(row.locked),
    }
  })
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
