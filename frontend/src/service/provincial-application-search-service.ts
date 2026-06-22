import {
  appendNumericSearchParams,
  appendSearchParams,
  appendSearchSortAndPageParams,
  getCachedSearchResponse,
  parsePagedSearchResponse,
  uniqueSearchItemsByKey,
} from '@/service/cached-search-service'
import { getSearchCount } from '@/service/search-count-service'
import { toSearchServiceError } from '@/service/search-service-fallback'
import { joinNonBlankText } from '@/utils/text'
import type {
  ProvincialApplicationSearchFilters,
  ProvincialApplicationSearchItem,
  ProvincialApplicationSearchRequest,
  ProvincialApplicationSearchResponse,
} from '@/interfaces/ProvincialApplicationSearch'

type BackendProvincialApplicationSearchResult = {
  application: number
  status: string
  client: string
  ownerClientNumber: string
  exemptionNumber: string
  listingDate: string
  region: string
  applicationVolume: number
  showCheckbox: boolean
  locked: boolean
}

export type ProvincialApplicationNumberOption = {
  value: string
  label: string
  status: string
  applicantClientNumber: string
  ownerClientNumber: string
  region: string
  listingDate: string
  exemptionNumber: string
}

const DEFAULT_APPLICATION_SEARCH_FILTERS: ProvincialApplicationSearchFilters = {
  applicationNumber: '',
  packageNumber: '',
  exemptionType: '',
  exemptionNumber: '',
  applicationStatus: '',
  productTypeCode: '',
  region: [],
  listingFromDate: '',
  listingToDate: '',
  applicantClientNumber: '',
  ownerClientNumber: '',
}

const buildBackendParams = (request: ProvincialApplicationSearchRequest): URLSearchParams => {
  const params = new URLSearchParams()

  const { filters } = request
  appendSearchParams(params, [
    ['applicationNumber', filters.applicationNumber],
    ['packageNumber', filters.packageNumber],
    ['exemptionNumber', filters.exemptionNumber],
    ['exemptionType', filters.exemptionType],
    ['applicationStatus', filters.applicationStatus],
    ['productTypeCode', filters.productTypeCode],
    ['listingFromDate', filters.listingFromDate],
    ['listingToDate', filters.listingToDate],
    ['agentClientNumber', filters.applicantClientNumber],
    ['ownerClientNumber', filters.ownerClientNumber],
  ])
  appendNumericSearchParams(params, 'region', filters.region)
  appendSearchSortAndPageParams(params, request)

  return params
}

const parseBackendResponse = (payload: unknown): ProvincialApplicationSearchResponse | null => {
  return parsePagedSearchResponse<
    BackendProvincialApplicationSearchResult,
    ProvincialApplicationSearchResponse['content'][number]
  >(payload, (row) => ({
    applicationNumber: String(row.application),
    status: row.status,
    applicantClientNumber: row.client ?? '',
    ownerClientNumber: row.ownerClientNumber ?? '',
    region: row.region ?? '',
    applicationVolume: row.applicationVolume ?? 0,
    exemptionNumber: row.exemptionNumber ?? '',
    listingDate: row.listingDate ?? '',
    packageNumber: '',
    exemptionType: '',
    productTypeCode: '',
    allowCreateExemption: Boolean(row.showCheckbox) && !Boolean(row.locked),
  }))
}

export const searchProvincialApplications = async (
  request: ProvincialApplicationSearchRequest,
): Promise<ProvincialApplicationSearchResponse> => {
  try {
    const response = await getCachedSearchResponse<unknown>(
      '/lexis/applications/search',
      buildBackendParams(request),
    )

    const parsed = parseBackendResponse(response.data)
    if (!parsed) {
      throw new Error('Backend provincial application response did not include results.')
    }

    return parsed
  } catch (error) {
    throw toSearchServiceError('Unable to load provincial application search results.', error)
  }
}

export const countProvincialApplications = async (
  request: ProvincialApplicationSearchRequest,
): Promise<number> =>
  getSearchCount(
    '/lexis/applications/search/count',
    buildBackendParams(request),
    'Unable to count provincial application search results.',
  )

const applicationNumberOptionLabel = (item: ProvincialApplicationSearchItem): string =>
  joinNonBlankText(
    [
      item.applicationNumber,
      item.status,
      item.ownerClientNumber ? `Owner ${item.ownerClientNumber}` : '',
      item.region ? `Region ${item.region}` : '',
      item.listingDate,
    ],
    ' - ',
  )

export const searchProvincialApplicationNumberOptions = async (
  query: string,
): Promise<ProvincialApplicationNumberOption[]> => {
  const response = await searchProvincialApplications({
    filters: {
      ...DEFAULT_APPLICATION_SEARCH_FILTERS,
      applicationNumber: query,
    },
    page: 0,
    pageSize: 20,
    sortField: 'applicationNumber',
    sortDirection: 'desc',
  })

  return uniqueSearchItemsByKey(response.content, (item) => item.applicationNumber).map((item) => ({
    value: item.applicationNumber,
    label: applicationNumberOptionLabel(item),
    status: item.status,
    applicantClientNumber: item.applicantClientNumber,
    ownerClientNumber: item.ownerClientNumber,
    region: item.region,
    listingDate: item.listingDate,
    exemptionNumber: item.exemptionNumber,
  }))
}
