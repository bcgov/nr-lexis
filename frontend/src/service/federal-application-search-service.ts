import {
  appendSearchParams,
  appendSearchSortAndPageParams,
  getCachedSearchResponse,
  parsePagedSearchResponse,
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

const buildBackendParams = (request: FederalApplicationSearchRequest): URLSearchParams => {
  const params = new URLSearchParams()

  const { filters } = request
  appendSearchParams(params, [
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
  appendSearchSortAndPageParams(params, request)

  return params
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
): Promise<FederalApplicationSearchResponse> => {
  try {
    const response = await getCachedSearchResponse<unknown>(
      '/lexis/federal/applications/search',
      buildBackendParams(request),
    )

    const parsed = parseBackendResponse(response.data)
    if (!parsed) {
      throw new Error('Backend federal application response did not include results.')
    }

    return parsed
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
