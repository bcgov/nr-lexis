import {
  appendNumericSearchParams,
  appendSearchPageParams,
  appendSearchParam,
  getCachedSearchResponse,
  parsePagedSearchResponse,
} from '@/service/cached-search-service'
import { getSearchCount } from '@/service/search-count-service'
import { toSearchServiceError } from '@/service/search-service-fallback'
import { joinNonBlankText } from '@/utils/text'
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
  const params = new URLSearchParams()

  const { filters } = request
  appendSearchParam(params, 'applicationNumber', filters.applicationNumber)
  appendSearchParam(params, 'packageNumber', filters.packageNumber)
  appendSearchParam(params, 'exemptionNumber', filters.exemptionNumber)
  appendSearchParam(params, 'listingFromDate', filters.listFromDate)
  appendSearchParam(params, 'listingToDate', filters.listToDate)
  appendSearchParam(params, 'exemptionTypeCode', filters.exemptionTypeCode)
  appendSearchParam(params, 'exemptionStatusCode', filters.exemptionStatusCode)
  appendSearchParam(params, 'applicantClientNumber', filters.applicantClientNumber)
  appendSearchParam(params, 'ownerClientNumber', filters.ownerClientNumber)
  appendNumericSearchParams(params, 'region', filters.region)
  appendSearchPageParams(params, request)
  return params
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
): Promise<ProvincialExemptionSearchResponse> => {
  try {
    const response = await getCachedSearchResponse<unknown>(
      '/lexis/exemptions/search',
      buildBackendParams(request),
    )

    const parsed = parseBackendResponse(response.data)
    if (!parsed) {
      throw new Error('Backend provincial exemption response did not include results.')
    }

    return parsed
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
  joinNonBlankText(
    [
      item.exemptionNumber,
      item.status,
      item.ownerClientNumber ? `Owner ${item.ownerClientNumber}` : '',
      item.region ? `Region ${item.region}` : '',
      item.listingDate,
    ],
    ' - ',
  )

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

  const seen = new Set<string>()
  return response.content
    .filter((item) => {
      if (!item.exemptionNumber || seen.has(item.exemptionNumber)) {
        return false
      }
      seen.add(item.exemptionNumber)
      return true
    })
    .map((item) => ({
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
