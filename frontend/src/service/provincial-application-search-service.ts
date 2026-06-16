import { getCachedSearchResponse, parsePagedSearchResponse } from '@/service/cached-search-service'
import { getSearchCount } from '@/service/search-count-service'
import { toSearchServiceError } from '@/service/search-service-fallback'
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

  const appendIfPresent = (key: string, value: string) => {
    const trimmed = value.trim()
    if (trimmed.length > 0) {
      params.append(key, trimmed)
    }
  }

  const { filters } = request
  appendIfPresent('applicationNumber', filters.applicationNumber)
  appendIfPresent('packageNumber', filters.packageNumber)
  appendIfPresent('exemptionNumber', filters.exemptionNumber)
  appendIfPresent('exemptionType', filters.exemptionType)
  appendIfPresent('applicationStatus', filters.applicationStatus)
  appendIfPresent('productTypeCode', filters.productTypeCode)
  appendIfPresent('listingFromDate', filters.listingFromDate)
  appendIfPresent('listingToDate', filters.listingToDate)
  appendIfPresent('agentClientNumber', filters.applicantClientNumber)
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
  [
    item.applicationNumber,
    item.status,
    item.ownerClientNumber ? `Owner ${item.ownerClientNumber}` : '',
    item.region ? `Region ${item.region}` : '',
    item.listingDate,
  ]
    .filter((value) => value.trim().length > 0)
    .join(' - ')

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
