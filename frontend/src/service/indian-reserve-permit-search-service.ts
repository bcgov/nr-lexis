import { getCachedSearchResponse } from '@/service/cached-search-service'
import { toSearchServiceError } from '@/service/search-service-fallback'
import type {
  IndianReservePermitSearchRequest,
  IndianReservePermitSearchResponse,
} from '@/interfaces/IndianReservePermitSearch'

type BackendIndianReservePermitSearchResult = {
  permitNumber: string
  clientNumber: string
  issueDate: string
  shippingDate: string
}

type BackendIndianReservePermitSearchResponse = {
  results: BackendIndianReservePermitSearchResult[]
  total: number
  page: number
  size: number
}

const buildBackendParams = (request: IndianReservePermitSearchRequest): URLSearchParams => {
  const params = new URLSearchParams()

  const appendIfPresent = (key: string, value: string) => {
    const trimmed = value.trim()
    if (trimmed.length > 0) {
      params.append(key, trimmed)
    }
  }

  const { filters } = request
  appendIfPresent('permitNumber', filters.permitNumber)
  appendIfPresent('packageNumber', filters.packageNumber)
  appendIfPresent('fromPermitIssueDate', filters.fromPermitIssueDate)
  appendIfPresent('toPermitIssueDate', filters.toPermitIssueDate)
  appendIfPresent('fromEstimatedShippingDate', filters.fromEstimatedShippingDate)
  appendIfPresent('toEstimatedShippingDate', filters.toEstimatedShippingDate)

  const backendSortField =
    request.sortDirection === 'desc' ? `${request.sortField} DESC` : request.sortField
  params.append('sortField', backendSortField)
  params.append('page', String(request.page))
  params.append('size', String(request.pageSize))

  return params
}

const parseBackendResponse = (payload: unknown): IndianReservePermitSearchResponse | null => {
  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as any).results)) {
    return null
  }

  const backendResponse = payload as BackendIndianReservePermitSearchResponse
  const totalElements = Number.isFinite(backendResponse.total) ? backendResponse.total : 0
  const pageSize = Number.isFinite(backendResponse.size) ? backendResponse.size : 10
  const pageNumber = Number.isFinite(backendResponse.page) ? backendResponse.page : 0
  const totalPages = Math.max(1, Math.ceil(totalElements / Math.max(pageSize, 1)))

  return {
    content: backendResponse.results.map((row) => ({
      permitNumber: row.permitNumber ?? '',
      clientNumber: row.clientNumber ?? '',
      issueDate: row.issueDate ?? '',
      shippingDate: row.shippingDate ?? '',
      packageNumber: '',
    })),
    page: {
      number: pageNumber,
      size: pageSize,
      totalElements,
      totalPages,
    },
  }
}

export const searchIndianReservePermits = async (
  request: IndianReservePermitSearchRequest,
): Promise<IndianReservePermitSearchResponse> => {
  try {
    const response = await getCachedSearchResponse<unknown>(
      '/lexis/indian-reserve/permits/search',
      buildBackendParams(request),
    )

    const parsed = parseBackendResponse(response.data)
    if (!parsed) {
      throw new Error('Backend indigenous reserve permit response did not include results.')
    }

    return parsed
  } catch (error) {
    throw toSearchServiceError('Unable to load indigenous reserve permit search results.', error)
  }
}
