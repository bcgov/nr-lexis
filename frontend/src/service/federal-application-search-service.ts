import { getCachedSearchResponse, parsePagedSearchResponse } from '@/service/cached-search-service'
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

  const appendIfPresent = (key: string, value: string) => {
    const trimmed = value.trim()
    if (trimmed.length > 0) {
      params.append(key, trimmed)
    }
  }

  const { filters } = request
  appendIfPresent('applicationNumber', filters.applicationNumber)
  appendIfPresent('packageNumber', filters.packageNumber)
  appendIfPresent('applicationStatus', filters.applicationStatus)
  appendIfPresent('receivedFromDate', filters.receivedFromDate)
  appendIfPresent('receivedToDate', filters.receivedToDate)
  appendIfPresent('listingFromDate', filters.listingFromDate)
  appendIfPresent('listingToDate', filters.listingToDate)

  // Legacy UI uses one client filter; backend currently supports owner and agent.
  appendIfPresent('ownerClientNumber', filters.clientNumber)
  appendIfPresent('agentClientNumber', filters.clientNumber)

  const backendSortField =
    request.sortDirection === 'desc' ? `${request.sortField} DESC` : request.sortField
  params.append('sortField', backendSortField)
  params.append('page', String(request.page))
  params.append('size', String(request.pageSize))

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
