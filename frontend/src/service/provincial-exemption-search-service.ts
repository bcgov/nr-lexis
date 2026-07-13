import {
  createSortedPagedSearchParams,
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
import { isRecord } from '@/utils/record'

type BackendProvincialExemptionSearchResult = {
  exemptionNumber: string
  exemptionType: string | null
  status: string | null
  applicantClientNumber: string | null
  ownerClientNumber: string | null
  listingDate: string | null
  expiryDate: string | null
  region: string | null
  approvedVolume: number
  balanceRemaining: number
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
  return createSortedPagedSearchParams(
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

const REQUIRED_RESULT_FIELDS: (keyof BackendProvincialExemptionSearchResult)[] = [
  'exemptionNumber',
  'exemptionType',
  'status',
  'applicantClientNumber',
  'ownerClientNumber',
  'listingDate',
  'expiryDate',
  'region',
  'approvedVolume',
  'balanceRemaining',
  'locked',
]

const isNullableString = (value: unknown): value is string | null =>
  value === null || typeof value === 'string'

const isBackendSearchResult = (value: unknown): value is BackendProvincialExemptionSearchResult => {
  if (!isRecord(value) || !REQUIRED_RESULT_FIELDS.every((field) => Object.hasOwn(value, field))) {
    return false
  }

  return (
    typeof value.exemptionNumber === 'string' &&
    isNullableString(value.exemptionType) &&
    isNullableString(value.status) &&
    isNullableString(value.applicantClientNumber) &&
    isNullableString(value.ownerClientNumber) &&
    isNullableString(value.listingDate) &&
    isNullableString(value.expiryDate) &&
    isNullableString(value.region) &&
    typeof value.approvedVolume === 'number' &&
    Number.isFinite(value.approvedVolume) &&
    typeof value.balanceRemaining === 'number' &&
    Number.isFinite(value.balanceRemaining) &&
    typeof value.locked === 'boolean'
  )
}

const parseBackendResponse = (payload: unknown): ProvincialExemptionSearchResponse | null => {
  if (
    !isRecord(payload) ||
    !Array.isArray(payload.results) ||
    !payload.results.every(isBackendSearchResult)
  ) {
    return null
  }

  return parsePagedSearchResponse<
    BackendProvincialExemptionSearchResult,
    ProvincialExemptionSearchResponse['content'][number]
  >(payload, (row) => {
    const statusCode = normalizeStatusCode(row.status ?? '')
    return {
      exemptionNumber: row.exemptionNumber ?? '',
      type: row.exemptionType ?? '',
      typeCode: row.exemptionType ?? '',
      status: row.status ?? '',
      statusCode,
      applicantClientNumber: row.applicantClientNumber ?? '',
      ownerClientNumber: row.ownerClientNumber ?? '',
      approvedVolume: row.approvedVolume,
      balanceRemaining: row.balanceRemaining,
      listingDate: row.listingDate ?? '',
      expiryDate: row.expiryDate ?? '',
      region: row.region ?? '',
      canApprove: statusCode === 'NEW',
      canViewExemption: true,
      isLocked: row.locked,
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
  }))
}
