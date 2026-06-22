import {
  appendNumericSearchParams,
  appendSearchParams,
  appendSearchSortAndPageParams,
  getCachedSearchResponse,
  parsePagedSearchResponse,
} from '@/service/cached-search-service'
import { getSearchCount } from '@/service/search-count-service'
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

const buildBackendParams = (request: ProvincialOfferSearchRequest): URLSearchParams => {
  const params = new URLSearchParams()

  const { filters } = request
  appendSearchParams(params, [
    ['applicationNumber', filters.applicationNumber],
    ['packageNumber', filters.packageNumber],
    ['clientNumber', filters.clientNumber],
    ['listingFromDate', filters.listingFromDate],
    ['listingToDate', filters.listingToDate],
    ['withdrawalFromDate', filters.withdrawalFromDate],
    ['withdrawalToDate', filters.withdrawalToDate],
  ])
  appendNumericSearchParams(params, 'region', filters.region)
  appendSearchSortAndPageParams(params, request)

  return params
}

const parseBackendResponse = (payload: unknown): ProvincialOfferSearchResponse | null => {
  return parsePagedSearchResponse<
    BackendProvincialOfferSearchResult,
    ProvincialOfferSearchResponse['content'][number]
  >(payload, (row) => ({
    offerNumber: String(row.offerNumber ?? ''),
    applicationNumber: String(row.applicationNumber ?? ''),
    packageNumber: row.packageNumber ?? '',
    listingDate: row.listingDate ?? '',
    region: row.region ?? '',
    offerWithdrawalDate: row.offerWithdrawalDate ?? '',
    clientNumber: '',
  }))
}

export const searchProvincialOffers = async (
  request: ProvincialOfferSearchRequest,
): Promise<ProvincialOfferSearchResponse> => {
  try {
    const response = await getCachedSearchResponse<unknown>(
      '/lexis/purchase-offers/search',
      buildBackendParams(request),
    )

    const parsed = parseBackendResponse(response.data)
    if (!parsed) {
      throw new Error('Backend provincial offer response did not include results.')
    }

    return parsed
  } catch (error) {
    throw toSearchServiceError('Unable to load provincial offer search results.', error)
  }
}

export const countProvincialOffers = async (
  request: ProvincialOfferSearchRequest,
): Promise<number> =>
  getSearchCount(
    '/lexis/purchase-offers/search/count',
    buildBackendParams(request),
    'Unable to count provincial offer search results.',
  )
