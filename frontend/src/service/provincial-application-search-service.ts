import { getCachedSearchResponse } from '@/service/cached-search-service'
import { toSearchServiceError } from '@/service/search-service-fallback'
import type {
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

type BackendProvincialApplicationSearchResponse = {
  results: BackendProvincialApplicationSearchResult[]
  total: number
  page: number
  size: number
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
  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as any).results)) {
    return null
  }

  const backendResponse = payload as BackendProvincialApplicationSearchResponse
  const totalElements = Number.isFinite(backendResponse.total) ? backendResponse.total : 0
  const pageSize = Number.isFinite(backendResponse.size) ? backendResponse.size : 10
  const pageNumber = Number.isFinite(backendResponse.page) ? backendResponse.page : 0
  const totalPages = Math.max(1, Math.ceil(totalElements / Math.max(pageSize, 1)))

  return {
    content: backendResponse.results.map((row) => ({
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
    })),
    page: {
      number: pageNumber,
      size: pageSize,
      totalElements,
      totalPages,
    },
  }
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
