import apiService from '@/service/api-service'
import {
  isSearchServiceMockFallbackEnabled,
  toSearchServiceError,
} from '@/service/search-service-fallback'
import type {
  ProvincialOfferSearchItem,
  ProvincialOfferSearchRequest,
  ProvincialOfferSearchResponse,
  ProvincialOfferSearchSortField,
} from '@/interfaces/ProvincialOfferSearch'

const MOCK_PROVINCIAL_OFFERS: ProvincialOfferSearchItem[] = [
  {
    offerNumber: 'O-70001',
    applicationNumber: 'A-10001',
    packageNumber: 'PKG-20001',
    listingDate: '2026-01-12',
    region: 'CAR',
    offerWithdrawalDate: '',
    clientNumber: '00011234',
  },
  {
    offerNumber: 'O-70002',
    applicationNumber: 'A-10002',
    packageNumber: 'PKG-20002',
    listingDate: '2026-01-15',
    region: 'SKE',
    offerWithdrawalDate: '2026-02-05',
    clientNumber: '00011234',
  },
  {
    offerNumber: 'O-70003',
    applicationNumber: 'A-10003',
    packageNumber: 'PKG-20003',
    listingDate: '2025-12-06',
    region: 'KAM',
    offerWithdrawalDate: '',
    clientNumber: '00019876',
  },
  {
    offerNumber: 'O-70004',
    applicationNumber: 'A-10004',
    packageNumber: 'PKG-20004',
    listingDate: '2025-11-30',
    region: 'OMI',
    offerWithdrawalDate: '2025-12-10',
    clientNumber: '00014567',
  },
  {
    offerNumber: 'O-70005',
    applicationNumber: 'A-10005',
    packageNumber: 'PKG-20005',
    listingDate: '2026-02-20',
    region: 'NEL',
    offerWithdrawalDate: '',
    clientNumber: '00017654',
  },
  {
    offerNumber: 'O-70006',
    applicationNumber: 'A-10006',
    packageNumber: 'PKG-20006',
    listingDate: '2026-02-28',
    region: 'SKE',
    offerWithdrawalDate: '',
    clientNumber: '00019876',
  },
  {
    offerNumber: 'O-70007',
    applicationNumber: 'A-10007',
    packageNumber: 'PKG-20007',
    listingDate: '2026-03-03',
    region: 'CAR',
    offerWithdrawalDate: '2026-03-20',
    clientNumber: '00012345',
  },
  {
    offerNumber: 'O-70008',
    applicationNumber: 'A-10008',
    packageNumber: 'PKG-20008',
    listingDate: '2026-03-10',
    region: 'KAM',
    offerWithdrawalDate: '',
    clientNumber: '00014321',
  },
  {
    offerNumber: 'O-70009',
    applicationNumber: 'A-10009',
    packageNumber: 'PKG-20009',
    listingDate: '2026-03-21',
    region: 'NEL',
    offerWithdrawalDate: '',
    clientNumber: '00015678',
  },
  {
    offerNumber: 'O-70010',
    applicationNumber: 'A-10010',
    packageNumber: 'PKG-20010',
    listingDate: '2025-10-22',
    region: 'OMI',
    offerWithdrawalDate: '2025-10-29',
    clientNumber: '00016789',
  },
]

const SORTERS: Record<
  ProvincialOfferSearchSortField,
  (row: ProvincialOfferSearchItem) => string | number
> = {
  offerNumber: (row) => row.offerNumber,
  applicationNumber: (row) => row.applicationNumber,
  packageNumber: (row) => row.packageNumber,
  listingDate: (row) => row.listingDate,
  region: (row) => row.region,
  offerWithdrawalDate: (row) => row.offerWithdrawalDate || '9999-12-31',
}

const normalizeText = (value: string): string => value.trim().toLowerCase()

const includesText = (source: string, filter: string): boolean => {
  if (!filter.trim()) return true
  return normalizeText(source).includes(normalizeText(filter))
}

const isAfterOrEqual = (value: string, from: string): boolean => {
  if (!from.trim()) return true
  return value >= from
}

const isBeforeOrEqual = (value: string, to: string): boolean => {
  if (!to.trim()) return true
  return value <= to
}

const applyMockSearch = (request: ProvincialOfferSearchRequest): ProvincialOfferSearchResponse => {
  const { filters, sortField, sortDirection, page, pageSize } = request

  let rows = MOCK_PROVINCIAL_OFFERS.filter((item) => {
    const withdrawalDate = item.offerWithdrawalDate || ''
    return (
      includesText(item.applicationNumber, filters.applicationNumber) &&
      includesText(item.packageNumber, filters.packageNumber) &&
      includesText(item.clientNumber, filters.clientNumber) &&
      (filters.region.length === 0 || filters.region.includes(item.region)) &&
      isAfterOrEqual(item.listingDate, filters.listingFromDate) &&
      isBeforeOrEqual(item.listingDate, filters.listingToDate) &&
      isAfterOrEqual(withdrawalDate, filters.withdrawalFromDate) &&
      isBeforeOrEqual(withdrawalDate, filters.withdrawalToDate)
    )
  })

  rows = rows.sort((a, b) => {
    const aValue = SORTERS[sortField](a)
    const bValue = SORTERS[sortField](b)
    if (aValue === bValue) return 0
    const result = aValue > bValue ? 1 : -1
    return sortDirection === 'asc' ? result : -result
  })

  const totalElements = rows.length
  const totalPages = Math.max(1, Math.ceil(totalElements / pageSize))
  const pageNumber = Math.min(page, totalPages - 1)
  const start = pageNumber * pageSize
  const end = start + pageSize

  return {
    content: rows.slice(start, end),
    page: {
      number: pageNumber,
      size: pageSize,
      totalElements,
      totalPages,
    },
  }
}

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
    if (isSearchServiceMockFallbackEnabled()) {
      console.warn('Using mock provincial offer search data.', error)
      return applyMockSearch(request)
    }
    throw toSearchServiceError('Unable to load provincial offer search results.', error)
  }
}
