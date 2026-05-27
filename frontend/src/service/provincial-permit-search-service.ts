import apiService from '@/service/api-service'
import {
  isSearchServiceMockFallbackEnabled,
  toSearchServiceError,
} from '@/service/search-service-fallback'
import type {
  ProvincialPermitSearchItem,
  ProvincialPermitSearchRequest,
  ProvincialPermitSearchResponse,
  ProvincialPermitSearchSortField,
  ProvincialPermitStatus,
} from '@/interfaces/ProvincialPermitSearch'

const MOCK_PROVINCIAL_PERMITS: ProvincialPermitSearchItem[] = [
  {
    applicationNumber: 'A-10001',
    packageNumber: 'PKG-20001',
    permitNumber: 'P-30001',
    status: 'Issued',
    applicantClientNumber: '00011234',
    ownerClientNumber: '00021234',
    totalVolume: 1560,
    issueDate: '2026-01-10',
    region: 'CAR',
  },
  {
    applicationNumber: 'A-10002',
    packageNumber: 'PKG-20002',
    permitNumber: 'P-30002',
    status: 'Active',
    applicantClientNumber: '00011234',
    ownerClientNumber: '00021234',
    totalVolume: 890,
    issueDate: '2026-01-12',
    region: 'SKE',
  },
  {
    applicationNumber: 'A-10003',
    packageNumber: 'PKG-20003',
    permitNumber: 'P-30003',
    status: 'Expired',
    applicantClientNumber: '00019876',
    ownerClientNumber: '00029876',
    totalVolume: 2300,
    issueDate: '2025-12-03',
    region: 'KAM',
  },
  {
    applicationNumber: 'A-10004',
    packageNumber: 'PKG-20004',
    permitNumber: 'P-30004',
    status: 'Cancelled',
    applicantClientNumber: '00014567',
    ownerClientNumber: '00024567',
    totalVolume: 120,
    issueDate: '2025-11-30',
    region: 'OMI',
  },
  {
    applicationNumber: 'A-10005',
    packageNumber: 'PKG-20005',
    permitNumber: 'P-30005',
    status: 'Issued',
    applicantClientNumber: '00017654',
    ownerClientNumber: '00027654',
    totalVolume: 4100,
    issueDate: '2026-02-17',
    region: 'NEL',
  },
  {
    applicationNumber: 'A-10006',
    packageNumber: 'PKG-20006',
    permitNumber: 'P-30006',
    status: 'Issued',
    applicantClientNumber: '00019876',
    ownerClientNumber: '00029876',
    totalVolume: 545,
    issueDate: '2026-02-28',
    region: 'SKE',
  },
  {
    applicationNumber: 'A-10007',
    packageNumber: 'PKG-20007',
    permitNumber: 'P-30007',
    status: 'Active',
    applicantClientNumber: '00012345',
    ownerClientNumber: '00022345',
    totalVolume: 1710,
    issueDate: '2026-03-02',
    region: 'CAR',
  },
  {
    applicationNumber: 'A-10008',
    packageNumber: 'PKG-20008',
    permitNumber: 'P-30008',
    status: 'Issued',
    applicantClientNumber: '00014321',
    ownerClientNumber: '00024321',
    totalVolume: 223,
    issueDate: '2026-03-10',
    region: 'KAM',
  },
  {
    applicationNumber: 'A-10009',
    packageNumber: 'PKG-20009',
    permitNumber: 'P-30009',
    status: 'Issued',
    applicantClientNumber: '00015678',
    ownerClientNumber: '00025678',
    totalVolume: 987,
    issueDate: '2026-03-21',
    region: 'NEL',
  },
  {
    applicationNumber: 'A-10010',
    packageNumber: 'PKG-20010',
    permitNumber: 'P-30010',
    status: 'Expired',
    applicantClientNumber: '00016789',
    ownerClientNumber: '00026789',
    totalVolume: 75,
    issueDate: '2025-10-22',
    region: 'OMI',
  },
  {
    applicationNumber: 'A-10011',
    packageNumber: 'PKG-20011',
    permitNumber: 'P-30011',
    status: 'Issued',
    applicantClientNumber: '00011001',
    ownerClientNumber: '00021001',
    totalVolume: 680,
    issueDate: '2026-04-11',
    region: 'CAR',
  },
  {
    applicationNumber: 'A-10012',
    packageNumber: 'PKG-20012',
    permitNumber: 'P-30012',
    status: 'Active',
    applicantClientNumber: '00011002',
    ownerClientNumber: '00021002',
    totalVolume: 2490,
    issueDate: '2026-04-12',
    region: 'SKE',
  },
]

const STATUS_ORDER: ProvincialPermitStatus[] = ['Active', 'Issued', 'Expired', 'Cancelled']

const SORTERS: Record<
  ProvincialPermitSearchSortField,
  (row: ProvincialPermitSearchItem) => string | number
> = {
  permitNumber: (row) => row.permitNumber,
  status: (row) => STATUS_ORDER.indexOf(row.status),
  applicantClientNumber: (row) => row.applicantClientNumber,
  ownerClientNumber: (row) => row.ownerClientNumber,
  totalVolume: (row) => row.totalVolume,
  issueDate: (row) => row.issueDate,
  region: (row) => row.region,
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

const applyMockSearch = (
  request: ProvincialPermitSearchRequest,
): ProvincialPermitSearchResponse => {
  const { filters, sortField, sortDirection, page, pageSize } = request

  let rows = MOCK_PROVINCIAL_PERMITS.filter((item) => {
    return (
      includesText(item.applicationNumber, filters.applicationNumber) &&
      includesText(item.packageNumber, filters.packageNumber) &&
      includesText(item.permitNumber, filters.permitNumber) &&
      includesText(item.applicantClientNumber, filters.applicantClientNumber) &&
      includesText(item.ownerClientNumber, filters.ownerClientNumber) &&
      (filters.region.length === 0 || filters.region.includes(item.region)) &&
      (!filters.permitStatus || item.status === filters.permitStatus) &&
      isAfterOrEqual(item.issueDate, filters.issuedFromDate) &&
      isBeforeOrEqual(item.issueDate, filters.issuedToDate)
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

type BackendProvincialPermitSearchResult = {
  permitNumber: number
  statusDescription: string
  applicantClientNumber: string
  ownerClientNumber: string
  totalVolume: number
  issueDate: string
  region: string
}

type BackendProvincialPermitSearchResponse = {
  results: BackendProvincialPermitSearchResult[]
  total: number
  page: number
  size: number
}

const buildBackendParams = (request: ProvincialPermitSearchRequest): URLSearchParams => {
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
  appendIfPresent('permitNumber', filters.permitNumber)
  appendIfPresent('issuedFromDate', filters.issuedFromDate)
  appendIfPresent('issuedToDate', filters.issuedToDate)
  appendIfPresent('permitStatus', filters.permitStatus)
  appendIfPresent('applicantClientNumber', filters.applicantClientNumber)
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

const parseBackendResponse = (payload: unknown): ProvincialPermitSearchResponse | null => {
  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as any).results)) {
    return null
  }

  const backendResponse = payload as BackendProvincialPermitSearchResponse
  const totalElements = Number.isFinite(backendResponse.total) ? backendResponse.total : 0
  const pageSize = Number.isFinite(backendResponse.size) ? backendResponse.size : 10
  const pageNumber = Number.isFinite(backendResponse.page) ? backendResponse.page : 0
  const totalPages = Math.max(1, Math.ceil(totalElements / Math.max(pageSize, 1)))

  return {
    content: backendResponse.results.map((row) => ({
      applicationNumber: '',
      packageNumber: '',
      permitNumber: String(row.permitNumber ?? ''),
      status: (row.statusDescription ?? 'Active') as ProvincialPermitStatus,
      applicantClientNumber: row.applicantClientNumber ?? '',
      ownerClientNumber: row.ownerClientNumber ?? '',
      totalVolume: row.totalVolume ?? 0,
      issueDate: row.issueDate ?? '',
      region: row.region ?? '',
    })),
    page: {
      number: pageNumber,
      size: pageSize,
      totalElements,
      totalPages,
    },
  }
}

export const searchProvincialPermits = async (
  request: ProvincialPermitSearchRequest,
): Promise<ProvincialPermitSearchResponse> => {
  try {
    const response = await apiService
      .getAxiosInstance()
      .get('/lexis/permits/search', { params: buildBackendParams(request) })

    const parsed = parseBackendResponse(response.data)
    if (!parsed) {
      throw new Error('Backend provincial permit response did not include results.')
    }

    return parsed
  } catch (error) {
    if (isSearchServiceMockFallbackEnabled()) {
      console.warn('Using mock provincial permit search data.', error)
      return applyMockSearch(request)
    }
    throw toSearchServiceError('Unable to load provincial permit search results.', error)
  }
}
