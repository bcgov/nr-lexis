import {
  appendNumericSearchParams,
  appendSearchParam,
  appendSearchSortAndPageParams,
  getCachedSearchResponse,
  parsePagedSearchResponse,
} from '@/service/cached-search-service'
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

type ProvincialPermitSearchOptions = {
  knownTotal?: number
}

export type ProvincialPermitNumberOption = {
  value: string
  label: string
  status: ProvincialPermitStatus
  applicantClientNumber: string
  ownerClientNumber: string
  totalVolume: number
  issueDate: string
  region: string
}

const DEFAULT_PERMIT_SEARCH_FILTERS = {
  applicationNumber: '',
  packageNumber: '',
  region: [],
  issuedFromDate: '',
  issuedToDate: '',
  permitStatus: '',
  permitNumber: '',
  ownerClientNumber: '',
  applicantClientNumber: '',
}

const buildBackendParams = (request: ProvincialPermitSearchRequest): URLSearchParams => {
  const params = new URLSearchParams()

  const { filters } = request
  appendSearchParam(params, 'applicationNumber', filters.applicationNumber)
  appendSearchParam(params, 'packageNumber', filters.packageNumber)
  appendSearchParam(params, 'permitNumber', filters.permitNumber)
  appendSearchParam(params, 'issuedFromDate', filters.issuedFromDate)
  appendSearchParam(params, 'issuedToDate', filters.issuedToDate)
  appendSearchParam(params, 'permitStatus', filters.permitStatus)
  appendSearchParam(params, 'applicantClientNumber', filters.applicantClientNumber)
  appendSearchParam(params, 'ownerClientNumber', filters.ownerClientNumber)
  appendNumericSearchParams(params, 'region', filters.region)
  appendSearchSortAndPageParams(params, request)

  return params
}

const parseBackendResponse = (payload: unknown): ProvincialPermitSearchResponse | null => {
  return parsePagedSearchResponse<
    BackendProvincialPermitSearchResult,
    ProvincialPermitSearchResponse['content'][number]
  >(payload, (row) => ({
    applicationNumber: '',
    packageNumber: '',
    permitNumber: String(row.permitNumber ?? ''),
    status: (row.statusDescription ?? 'Active') as ProvincialPermitStatus,
    applicantClientNumber: row.applicantClientNumber ?? '',
    ownerClientNumber: row.ownerClientNumber ?? '',
    totalVolume: row.totalVolume ?? 0,
    issueDate: row.issueDate ?? '',
    region: row.region ?? '',
  }))
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

const permitNumberOptionLabel = (item: ProvincialPermitSearchResponse['content'][number]): string =>
  [
    item.permitNumber,
    item.status,
    item.ownerClientNumber ? `Owner ${item.ownerClientNumber}` : '',
    item.region ? `Region ${item.region}` : '',
    item.issueDate,
  ]
    .filter((value) => value.trim().length > 0)
    .join(' - ')

export const searchProvincialPermitNumberOptions = async (
  query: string,
): Promise<ProvincialPermitNumberOption[]> => {
  const response = await searchProvincialPermits({
    filters: {
      ...DEFAULT_PERMIT_SEARCH_FILTERS,
      permitNumber: query,
    },
    page: 0,
    pageSize: 20,
    sortField: 'permitNumber',
    sortDirection: 'desc',
  })

  const seen = new Set<string>()
  return response.content
    .filter((item) => {
      if (!item.permitNumber || seen.has(item.permitNumber)) {
        return false
      }
      seen.add(item.permitNumber)
      return true
    })
    .map((item) => ({
      value: item.permitNumber,
      label: permitNumberOptionLabel(item),
      status: item.status,
      applicantClientNumber: item.applicantClientNumber,
      ownerClientNumber: item.ownerClientNumber,
      totalVolume: item.totalVolume,
      issueDate: item.issueDate,
      region: item.region,
    }))
}
