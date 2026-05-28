import apiService from '@/service/api-service'
import { toSearchServiceError } from '@/service/search-service-fallback'
import type {
  ProvincialOfferSearchRequest,
  ProvincialOfferSearchResponse,
} from '@/interfaces/ProvincialOfferSearch'

type BackendProvincialOfferSearchResult = {
  offerNumber: number
  applicationNumber: number
  packageNumber: string
  listingDate: string
  region: string
  offerWithdrawalDate: string | null
}

type BackendProvincialOfferSearchResponse = {
  results: BackendProvincialOfferSearchResult[]
  total: number
  page: number
  size: number
}

const buildBackendParams = (request: ProvincialOfferSearchRequest): URLSearchParams => {
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
  appendIfPresent('clientNumber', filters.clientNumber)
  appendIfPresent('listingFromDate', filters.listingFromDate)
  appendIfPresent('listingToDate', filters.listingToDate)
  appendIfPresent('withdrawalFromDate', filters.withdrawalFromDate)
  appendIfPresent('withdrawalToDate', filters.withdrawalToDate)

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

const parseBackendResponse = (payload: unknown): ProvincialOfferSearchResponse | null => {
  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as any).results)) {
    return null
  }

  const backendResponse = payload as BackendProvincialOfferSearchResponse
  const totalElements = Number.isFinite(backendResponse.total) ? backendResponse.total : 0
  const pageSize = Number.isFinite(backendResponse.size) ? backendResponse.size : 10
  const pageNumber = Number.isFinite(backendResponse.page) ? backendResponse.page : 0
  const totalPages = Math.max(1, Math.ceil(totalElements / Math.max(pageSize, 1)))

  return {
    content: backendResponse.results.map((row) => ({
      offerNumber: String(row.offerNumber ?? ''),
      applicationNumber: String(row.applicationNumber ?? ''),
      packageNumber: row.packageNumber ?? '',
      listingDate: row.listingDate ?? '',
      region: row.region ?? '',
      offerWithdrawalDate: row.offerWithdrawalDate ?? '',
      clientNumber: '',
    })),
    page: {
      number: pageNumber,
      size: pageSize,
      totalElements,
      totalPages,
    },
  }
}

export const searchProvincialOffers = async (
  request: ProvincialOfferSearchRequest,
): Promise<ProvincialOfferSearchResponse> => {
  try {
    const response = await apiService
      .getAxiosInstance()
      .get('/lexis/purchase-offers/search', { params: buildBackendParams(request) })

    const parsed = parseBackendResponse(response.data)
    if (!parsed) {
      throw new Error('Backend provincial offer response did not include results.')
    }

    return parsed
  } catch (error) {
    throw toSearchServiceError('Unable to load provincial offer search results.', error)
  }
}
