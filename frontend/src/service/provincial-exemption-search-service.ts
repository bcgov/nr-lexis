import {
  createPagedSearchParams,
  getCachedSearchResponse,
  parsePagedSearchResponse,
  requireParsedSearchResponse,
  uniqueSearchItemsByKey,
} from '@/service/cached-search-service'
import { getSearchCount } from '@/service/search-count-service'
import { toSearchServiceError } from '@/service/search-service-fallback'
import { searchResultOptionLabel } from '@/utils/text'
import type {
  ProvincialExemptionSearchRequest,
  ProvincialExemptionSearchResponse,
} from '@/interfaces/ProvincialExemptionSearch'

type BackendProvincialExemptionSearchResult = {
  applicationNumber: number
  exemptionNumber: string
  exemptionType: string
  status: string
  ownerClientNumber: string
  listingDate: string
  region: string
  approvedVolume: number
  locked: boolean
}

type ProvincialExemptionSearchOptions = {
  knownTotal?: number
}

export type ProvincialExemptionNumberOption = {
  value: string
  label: string
  status: string
  type: string
  ownerClientNumber: string
  region: string
  listingDate: string
  applicationNumber: string
}

const DEFAULT_EXEMPTION_SEARCH_FILTERS = {
  applicationNumber: '',
  packageNumber: '',
  exemptionNumber: '',
  region: [],
  listFromDate: '',
  listToDate: '',
  exemptionTypeCode: '',
  exemptionStatusCode: '',
  applicantClientNumber: '',
  ownerClientNumber: '',
}

const normalizeStatusCode = (status: string): string => {
  return status.trim().replaceAll(/\s+/g, '_').toUpperCase()
}

const buildBackendParams = (request: ProvincialExemptionSearchRequest): URLSearchParams => {
  const { filters } = request
  return createPagedSearchParams(
    request,
    [
      ['applicationNumber', filters.applicationNumber],
      ['packageNumber', filters.packageNumber],
      ['exemptionNumber', filters.exemptionNumber],
      ['listingFromDate', filters.listFromDate],
      ['listingToDate', filters.listToDate],
      ['exemptionTypeCode', filters.exemptionTypeCode],
      ['exemptionStatusCode', filters.exemptionStatusCode],
      ['applicantClientNumber', filters.applicantClientNumber],
      ['ownerClientNumber', filters.ownerClientNumber],
    ],
    [['region', filters.region]],
  )
}

const parseBackendResponse = (payload: unknown): ProvincialExemptionSearchResponse | null => {
  return parsePagedSearchResponse<
    BackendProvincialExemptionSearchResult,
    ProvincialExemptionSearchResponse['content'][number]
  >(payload, (row) => {
    const statusCode = normalizeStatusCode(row.status ?? '')
    return {
      applicationNumber: String(row.applicationNumber ?? ''),
      packageNumber: '',
      exemptionNumber: row.exemptionNumber ?? '',
      type: row.exemptionType ?? '',
      typeCode: row.exemptionType ?? '',
      status: row.status ?? '',
      statusCode,
      applicantClientNumber: '',
      ownerClientNumber: row.ownerClientNumber ?? '',
      approvedVolume: row.approvedVolume ?? 0,
      balanceRemaining: 0,
      listingDate: row.listingDate ?? '',
      expiryDate: '',
      region: row.region ?? '',
      canApprove: statusCode === 'NEW',
      canViewExemption: true,
      isLocked: Boolean(row.locked),
    }
  })
}

export const searchProvincialExemptions = async (
  request: ProvincialExemptionSearchRequest,
  options: ProvincialExemptionSearchOptions = {},
): Promise<ProvincialExemptionSearchResponse> => {
  try {
    const params = buildBackendParams(request)
    const knownTotal = options.knownTotal
    if (Number.isInteger(knownTotal) && knownTotal !== undefined && knownTotal >= 0) {
      params.append('knownTotal', String(knownTotal))
    }

    const response = await getCachedSearchResponse<unknown>('/lexis/exemptions/search', params)

    return requireParsedSearchResponse(
      parseBackendResponse(response.data),
      'Backend provincial exemption response did not include results.',
    )
  } catch (error) {
    throw toSearchServiceError('Unable to load provincial exemption search results.', error)
  }
}

export const countProvincialExemptions = async (
  request: ProvincialExemptionSearchRequest,
): Promise<number> =>
  getSearchCount(
    '/lexis/exemptions/search/count',
    buildBackendParams(request),
    'Unable to count provincial exemption search results.',
  )

const exemptionNumberOptionLabel = (
  item: ProvincialExemptionSearchResponse['content'][number],
): string =>
  searchResultOptionLabel({
    primary: item.exemptionNumber,
    status: item.status,
    ownerClientNumber: item.ownerClientNumber,
    region: item.region,
    date: item.listingDate,
  })

export const searchProvincialExemptionNumberOptions = async (
  query: string,
): Promise<ProvincialExemptionNumberOption[]> => {
  const response = await searchProvincialExemptions({
    filters: {
      ...DEFAULT_EXEMPTION_SEARCH_FILTERS,
      exemptionNumber: query,
    },
    page: 0,
    pageSize: 20,
    sortField: 'exemptionNumber',
    sortDirection: 'desc',
  })

  return uniqueSearchItemsByKey(response.content, (item) => item.exemptionNumber).map((item) => ({
    value: item.exemptionNumber,
    label: exemptionNumberOptionLabel(item),
    status: item.status,
    type: item.type,
    ownerClientNumber: item.ownerClientNumber,
    region: item.region,
    listingDate: item.listingDate,
    applicationNumber: item.applicationNumber,
  }))
}
