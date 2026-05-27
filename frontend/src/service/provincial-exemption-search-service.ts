import apiService from '@/service/api-service'
import {
  isSearchServiceMockFallbackEnabled,
  toSearchServiceError,
} from '@/service/search-service-fallback'
import type {
  ProvincialExemptionSearchItem,
  ProvincialExemptionSearchRequest,
  ProvincialExemptionSearchResponse,
  ProvincialExemptionSearchSortField,
} from '@/interfaces/ProvincialExemptionSearch'

const MOCK_PROVINCIAL_EXEMPTIONS: ProvincialExemptionSearchItem[] = [
  {
    applicationNumber: 'A-10001',
    packageNumber: 'PKG-20001',
    exemptionNumber: 'E-50001',
    type: 'Section 1',
    typeCode: 'SECTION_1',
    status: 'New',
    statusCode: 'NEW',
    applicantClientNumber: '00011234',
    ownerClientNumber: '00021234',
    approvedVolume: 1200,
    balanceRemaining: 1000,
    listingDate: '2026-01-12',
    expiryDate: '2026-12-31',
    region: 'CAR',
    canApprove: true,
    canViewExemption: true,
    isLocked: false,
  },
  {
    applicationNumber: 'A-10002',
    packageNumber: 'PKG-20002',
    exemptionNumber: 'E-50002',
    type: 'Section 2',
    typeCode: 'SECTION_2',
    status: 'Approved',
    statusCode: 'APPROVED',
    applicantClientNumber: '00011234',
    ownerClientNumber: '00021234',
    approvedVolume: 890,
    balanceRemaining: 120,
    listingDate: '2026-01-15',
    expiryDate: '2027-01-15',
    region: 'SKE',
    canApprove: true,
    canViewExemption: true,
    isLocked: false,
  },
  {
    applicationNumber: 'A-10003',
    packageNumber: 'PKG-20003',
    exemptionNumber: 'E-50003',
    type: 'Section 1',
    typeCode: 'SECTION_1',
    status: 'New',
    statusCode: 'NEW',
    applicantClientNumber: '00019876',
    ownerClientNumber: '00029876',
    approvedVolume: 2300,
    balanceRemaining: 2300,
    listingDate: '2025-12-06',
    expiryDate: '2026-11-30',
    region: 'KAM',
    canApprove: true,
    canViewExemption: true,
    isLocked: true,
  },
  {
    applicationNumber: 'A-10004',
    packageNumber: 'PKG-20004',
    exemptionNumber: 'E-50004',
    type: 'Section 3',
    typeCode: 'SECTION_3',
    status: 'Expired',
    statusCode: 'EXPIRED',
    applicantClientNumber: '00014567',
    ownerClientNumber: '00024567',
    approvedVolume: 120,
    balanceRemaining: 0,
    listingDate: '2025-11-30',
    expiryDate: '2026-03-31',
    region: 'OMI',
    canApprove: false,
    canViewExemption: true,
    isLocked: false,
  },
  {
    applicationNumber: 'A-10005',
    packageNumber: 'PKG-20005',
    exemptionNumber: 'E-50005',
    type: 'Section 1',
    typeCode: 'SECTION_1',
    status: 'New',
    statusCode: 'NEW',
    applicantClientNumber: '00017654',
    ownerClientNumber: '00027654',
    approvedVolume: 4100,
    balanceRemaining: 4100,
    listingDate: '2026-02-20',
    expiryDate: '2027-02-20',
    region: 'NEL',
    canApprove: true,
    canViewExemption: true,
    isLocked: false,
  },
  {
    applicationNumber: 'A-10006',
    packageNumber: 'PKG-20006',
    exemptionNumber: 'E-50006',
    type: 'Section 2',
    typeCode: 'SECTION_2',
    status: 'Closed',
    statusCode: 'CLOSED',
    applicantClientNumber: '00019876',
    ownerClientNumber: '00029876',
    approvedVolume: 545,
    balanceRemaining: 0,
    listingDate: '2026-02-28',
    expiryDate: '2026-12-15',
    region: 'SKE',
    canApprove: false,
    canViewExemption: true,
    isLocked: false,
  },
  {
    applicationNumber: 'A-10007',
    packageNumber: 'PKG-20007',
    exemptionNumber: 'E-50007',
    type: 'Section 3',
    typeCode: 'SECTION_3',
    status: 'Approved',
    statusCode: 'APPROVED',
    applicantClientNumber: '00012345',
    ownerClientNumber: '00022345',
    approvedVolume: 1710,
    balanceRemaining: 610,
    listingDate: '2026-03-03',
    expiryDate: '2026-10-03',
    region: 'CAR',
    canApprove: true,
    canViewExemption: true,
    isLocked: false,
  },
  {
    applicationNumber: 'A-10008',
    packageNumber: 'PKG-20008',
    exemptionNumber: 'E-50008',
    type: 'Section 2',
    typeCode: 'SECTION_2',
    status: 'New',
    statusCode: 'NEW',
    applicantClientNumber: '00014321',
    ownerClientNumber: '00024321',
    approvedVolume: 223,
    balanceRemaining: 223,
    listingDate: '2026-03-10',
    expiryDate: '2026-09-10',
    region: 'KAM',
    canApprove: true,
    canViewExemption: true,
    isLocked: false,
  },
  {
    applicationNumber: 'A-10009',
    packageNumber: 'PKG-20009',
    exemptionNumber: 'E-50009',
    type: 'Section 1',
    typeCode: 'SECTION_1',
    status: 'Approved',
    statusCode: 'APPROVED',
    applicantClientNumber: '00015678',
    ownerClientNumber: '00025678',
    approvedVolume: 987,
    balanceRemaining: 250,
    listingDate: '2026-03-21',
    expiryDate: '2027-03-21',
    region: 'NEL',
    canApprove: true,
    canViewExemption: true,
    isLocked: false,
  },
  {
    applicationNumber: 'A-10010',
    packageNumber: 'PKG-20010',
    exemptionNumber: 'E-50010',
    type: 'Section 3',
    typeCode: 'SECTION_3',
    status: 'Cancelled',
    statusCode: 'CANCELLED',
    applicantClientNumber: '00016789',
    ownerClientNumber: '00026789',
    approvedVolume: 75,
    balanceRemaining: 0,
    listingDate: '2025-10-22',
    expiryDate: '2026-01-22',
    region: 'OMI',
    canApprove: false,
    canViewExemption: true,
    isLocked: false,
  },
]

const STATUS_ORDER = ['NEW', 'APPROVED', 'CLOSED', 'EXPIRED', 'CANCELLED']

const SORTERS: Record<
  ProvincialExemptionSearchSortField,
  (row: ProvincialExemptionSearchItem) => string | number
> = {
  exemptionNumber: (row) => row.exemptionNumber,
  type: (row) => row.type,
  status: (row) => STATUS_ORDER.indexOf(row.statusCode),
  applicantClientNumber: (row) => row.applicantClientNumber,
  ownerClientNumber: (row) => row.ownerClientNumber,
  approvedVolume: (row) => row.approvedVolume,
  balanceRemaining: (row) => row.balanceRemaining,
  listingDate: (row) => row.listingDate,
  expiryDate: (row) => row.expiryDate,
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
  request: ProvincialExemptionSearchRequest,
): ProvincialExemptionSearchResponse => {
  const { filters, sortField, sortDirection, page, pageSize } = request

  let rows = MOCK_PROVINCIAL_EXEMPTIONS.filter((item) => {
    return (
      includesText(item.applicationNumber, filters.applicationNumber) &&
      includesText(item.packageNumber, filters.packageNumber) &&
      includesText(item.exemptionNumber, filters.exemptionNumber) &&
      includesText(item.applicantClientNumber, filters.applicantClientNumber) &&
      includesText(item.ownerClientNumber, filters.ownerClientNumber) &&
      (filters.region.length === 0 || filters.region.includes(item.region)) &&
      (!filters.exemptionTypeCode || item.typeCode === filters.exemptionTypeCode) &&
      (!filters.exemptionStatusCode || item.statusCode === filters.exemptionStatusCode) &&
      isAfterOrEqual(item.listingDate, filters.listFromDate) &&
      isBeforeOrEqual(item.listingDate, filters.listToDate)
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

type BackendProvincialExemptionSearchResponse = {
  results: BackendProvincialExemptionSearchResult[]
  total: number
  page: number
  size: number
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
  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as any).results)) {
    return null
  }

  const backendResponse = payload as BackendProvincialExemptionSearchResponse
  const totalElements = Number.isFinite(backendResponse.total) ? backendResponse.total : 0
  const pageSize = Number.isFinite(backendResponse.size) ? backendResponse.size : 10
  const pageNumber = Number.isFinite(backendResponse.page) ? backendResponse.page : 0
  const totalPages = Math.max(1, Math.ceil(totalElements / Math.max(pageSize, 1)))

  return {
    content: backendResponse.results.map((row) => {
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
    }),
    page: {
      number: pageNumber,
      size: pageSize,
      totalElements,
      totalPages,
    },
  }
}

export const searchProvincialExemptions = async (
  request: ProvincialExemptionSearchRequest,
): Promise<ProvincialExemptionSearchResponse> => {
  try {
    const response = await apiService
      .getAxiosInstance()
      .get('/lexis/exemptions/search', { params: buildBackendParams(request) })

    const parsed = parseBackendResponse(response.data)
    if (!parsed) {
      throw new Error('Backend provincial exemption response did not include results.')
    }

    return parsed
  } catch (error) {
    if (isSearchServiceMockFallbackEnabled()) {
      console.warn('Using mock provincial exemption search data.', error)
      return applyMockSearch(request)
    }
    throw toSearchServiceError('Unable to load provincial exemption search results.', error)
  }
}
