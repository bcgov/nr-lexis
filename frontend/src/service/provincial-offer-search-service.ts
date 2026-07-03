import {
  createSortedPagedSearchParams,
  getCachedSearchResponse,
  parsePagedSearchResponse,
  requireParsedSearchResponse,
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

type ProvincialOfferSearchOptions = {
  knownTotal?: number
}

const buildBackendParams = (request: ProvincialOfferSearchRequest): URLSearchParams => {
  const { filters } = request
  return createSortedPagedSearchParams(
    request,
    [
      ['applicationNumber', filters.applicationNumber],
      ['packageNumber', filters.packageNumber],
      ['clientNumber', filters.clientNumber],
      ['listingFromDate', filters.listingFromDate],
      ['listingToDate', filters.listingToDate],
      ['withdrawalFromDate', filters.withdrawalFromDate],
      ['withdrawalToDate', filters.withdrawalToDate],
    ],
    [['region', filters.region]],
  )
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
  options: ProvincialOfferSearchOptions = {},
): Promise<ProvincialOfferSearchResponse> => {
  try {
    const params = buildBackendParams(request)
    const knownTotal = options.knownTotal
    if (Number.isInteger(knownTotal) && knownTotal !== undefined && knownTotal >= 0) {
      params.append('knownTotal', String(knownTotal))
    }

    const response = await getCachedSearchResponse<unknown>('/lexis/purchase-offers/search', params)

    return requireParsedSearchResponse(
      parseBackendResponse(response.data),
      'Backend provincial offer response did not include results.',
    )
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
