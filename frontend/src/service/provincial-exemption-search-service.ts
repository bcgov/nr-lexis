import { getCachedSearchResponse, parsePagedSearchResponse } from '@/service/cached-search-service'
import { getSearchCount } from '@/service/search-count-service'
import { toSearchServiceError } from '@/service/search-service-fallback'
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
  appendIfPresent('listingFromDate', filters.listFromDate)
  appendIfPresent('listingToDate', filters.listToDate)
  appendIfPresent('exemptionTypeCode', filters.exemptionTypeCode)
  appendIfPresent('exemptionStatusCode', filters.exemptionStatusCode)
  appendIfPresent('applicantClientNumber', filters.applicantClientNumber)
  appendIfPresent('ownerClientNumber', filters.ownerClientNumber)

  filters.region
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0)
    .forEach((value) => {
      params.append('region', String(value))
    })

  params.append('page', String(request.page))
  params.append('size', String(request.pageSize))
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
  [
    item.exemptionNumber,
    item.status,
    item.ownerClientNumber ? `Owner ${item.ownerClientNumber}` : '',
    item.region ? `Region ${item.region}` : '',
    item.listingDate,
  ]
    .filter((value) => value.trim().length > 0)
    .join(' - ')

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
