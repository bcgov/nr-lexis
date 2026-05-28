import apiService from '@/service/api-service'
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

type BackendFederalApplicationSearchResponse = {
  results: BackendFederalApplicationSearchResult[]
  total: number
  page: number
  size: number
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
  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as any).results)) {
    return null
  }

  const backendResponse = payload as BackendFederalApplicationSearchResponse
  const totalElements = Number.isFinite(backendResponse.total) ? backendResponse.total : 0
  const pageSize = Number.isFinite(backendResponse.size) ? backendResponse.size : 10
  const pageNumber = Number.isFinite(backendResponse.page) ? backendResponse.page : 0
  const totalPages = Math.max(1, Math.ceil(totalElements / Math.max(pageSize, 1)))

  return {
    content: backendResponse.results.map((row) => {
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
    }),
    page: {
      number: pageNumber,
      size: pageSize,
      totalElements,
      totalPages,
    },
  }
}

export const searchFederalApplications = async (
  request: FederalApplicationSearchRequest,
): Promise<FederalApplicationSearchResponse> => {
  try {
    const response = await apiService
      .getAxiosInstance()
      .get('/lexis/federal/applications/search', { params: buildBackendParams(request) })

    const parsed = parseBackendResponse(response.data)
    if (!parsed) {
      throw new Error('Backend federal application response did not include results.')
    }

    return parsed
  } catch (error) {
    throw toSearchServiceError('Unable to load federal application search results.', error)
  }
}
