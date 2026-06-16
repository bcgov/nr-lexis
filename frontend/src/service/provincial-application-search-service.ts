import {
  appendNumericSearchParams,
  appendSearchParam,
  appendSearchSortAndPageParams,
  getCachedSearchResponse,
  parsePagedSearchResponse,
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
  appendSearchParam(params, 'applicationNumber', filters.applicationNumber)
  appendSearchParam(params, 'packageNumber', filters.packageNumber)
  appendSearchParam(params, 'exemptionNumber', filters.exemptionNumber)
  appendSearchParam(params, 'exemptionType', filters.exemptionType)
  appendSearchParam(params, 'applicationStatus', filters.applicationStatus)
  appendSearchParam(params, 'productTypeCode', filters.productTypeCode)
  appendSearchParam(params, 'listingFromDate', filters.listingFromDate)
  appendSearchParam(params, 'listingToDate', filters.listingToDate)
  appendSearchParam(params, 'agentClientNumber', filters.applicantClientNumber)
  appendSearchParam(params, 'ownerClientNumber', filters.ownerClientNumber)
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

  const seen = new Set<string>()
  return response.content
    .filter((item) => {
      if (!item.applicationNumber || seen.has(item.applicationNumber)) {
        return false
      }
      seen.add(item.applicationNumber)
      return true
    })
    .map((item) => ({
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
