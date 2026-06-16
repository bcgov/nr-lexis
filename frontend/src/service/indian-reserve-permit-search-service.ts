import {
  appendSearchParam,
  appendSearchSortAndPageParams,
  getCachedSearchResponse,
  parsePagedSearchResponse,
} from '@/service/cached-search-service'
import { getSearchCount } from '@/service/search-count-service'
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

const buildBackendParams = (request: IndianReservePermitSearchRequest): URLSearchParams => {
  const params = new URLSearchParams()

  const { filters } = request
  appendSearchParam(params, 'permitNumber', filters.permitNumber)
  appendSearchParam(params, 'packageNumber', filters.packageNumber)
  appendSearchParam(params, 'fromPermitIssueDate', filters.fromPermitIssueDate)
  appendSearchParam(params, 'toPermitIssueDate', filters.toPermitIssueDate)
  appendSearchParam(params, 'fromEstimatedShippingDate', filters.fromEstimatedShippingDate)
  appendSearchParam(params, 'toEstimatedShippingDate', filters.toEstimatedShippingDate)
  appendSearchSortAndPageParams(params, request)

  return params
}

const parseBackendResponse = (payload: unknown): IndianReservePermitSearchResponse | null => {
  return parsePagedSearchResponse<
    BackendIndianReservePermitSearchResult,
    IndianReservePermitSearchResponse['content'][number]
  >(payload, (row) => ({
    permitNumber: row.permitNumber ?? '',
    clientNumber: row.clientNumber ?? '',
    issueDate: row.issueDate ?? '',
    shippingDate: row.shippingDate ?? '',
    packageNumber: '',
  }))
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

export const countIndianReservePermits = async (
  request: IndianReservePermitSearchRequest,
): Promise<number> =>
  getSearchCount(
    '/lexis/indian-reserve/permits/search/count',
    buildBackendParams(request),
    'Unable to count indigenous reserve permit search results.',
  )
