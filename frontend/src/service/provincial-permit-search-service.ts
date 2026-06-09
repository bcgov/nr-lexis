import { getCachedSearchResponse } from '@/service/cached-search-service'
import { getSearchCount } from '@/service/search-count-service'
import { toSearchServiceError } from '@/service/search-service-fallback'
import type {
  ProvincialPermitSearchRequest,
  ProvincialPermitSearchResponse,
  ProvincialPermitStatus,
} from '@/interfaces/ProvincialPermitSearch'

type BackendProvincialPermitSearchResult = {
  permitNumber: number
  statusDescription: string
  applicantClientNumber: string
  ownerClientNumber: string
  totalVolume: number
  issueDate: string
  region: string
}

type BackendProvincialPermitSearchResponse = {
  results: BackendProvincialPermitSearchResult[]
  total: number
  page: number
  size: number
}

type ProvincialPermitSearchOptions = {
  knownTotal?: number
}

const buildBackendParams = (request: ProvincialPermitSearchRequest): URLSearchParams => {
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
  appendIfPresent('permitNumber', filters.permitNumber)
  appendIfPresent('issuedFromDate', filters.issuedFromDate)
  appendIfPresent('issuedToDate', filters.issuedToDate)
  appendIfPresent('permitStatus', filters.permitStatus)
  appendIfPresent('applicantClientNumber', filters.applicantClientNumber)
  appendIfPresent('ownerClientNumber', filters.ownerClientNumber)

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

const parseBackendResponse = (payload: unknown): ProvincialPermitSearchResponse | null => {
  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as any).results)) {
    return null
  }

  const backendResponse = payload as BackendProvincialPermitSearchResponse
  const totalElements = Number.isFinite(backendResponse.total) ? backendResponse.total : 0
  const pageSize = Number.isFinite(backendResponse.size) ? backendResponse.size : 10
  const pageNumber = Number.isFinite(backendResponse.page) ? backendResponse.page : 0
  const totalPages = Math.max(1, Math.ceil(totalElements / Math.max(pageSize, 1)))

  return {
    content: backendResponse.results.map((row) => ({
      applicationNumber: '',
      packageNumber: '',
      permitNumber: String(row.permitNumber ?? ''),
      status: (row.statusDescription ?? 'Active') as ProvincialPermitStatus,
      applicantClientNumber: row.applicantClientNumber ?? '',
      ownerClientNumber: row.ownerClientNumber ?? '',
      totalVolume: row.totalVolume ?? 0,
      issueDate: row.issueDate ?? '',
      region: row.region ?? '',
    })),
    page: {
      number: pageNumber,
      size: pageSize,
      totalElements,
      totalPages,
    },
  }
}

export const searchProvincialPermits = async (
  request: ProvincialPermitSearchRequest,
  options: ProvincialPermitSearchOptions = {},
): Promise<ProvincialPermitSearchResponse> => {
  try {
    const params = buildBackendParams(request)
    if (Number.isInteger(options.knownTotal) && options.knownTotal >= 0) {
      params.append('knownTotal', String(options.knownTotal))
    }

    const response = await getCachedSearchResponse<unknown>('/lexis/permits/search', params)

    const parsed = parseBackendResponse(response.data)
    if (!parsed) {
      throw new Error('Backend provincial permit response did not include results.')
    }

    return parsed
  } catch (error) {
    throw toSearchServiceError('Unable to load provincial permit search results.', error)
  }
}

export const countProvincialPermits = async (
  request: ProvincialPermitSearchRequest,
): Promise<number> =>
  getSearchCount(
    '/lexis/permits/search/count',
    buildBackendParams(request),
    'Unable to count provincial permit search results.',
  )
