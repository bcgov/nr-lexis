import apiService from '@/service/api-service'
import type {
  FederalApplicationSearchItem,
  FederalApplicationSearchRequest,
  FederalApplicationSearchResponse,
} from '@/interfaces/FederalApplicationSearch'

const MOCK_FEDERAL_APPLICATIONS: FederalApplicationSearchItem[] = [
  {
    applicationNumber: 'F-A-10001',
    federalApplicationNumber: 'FED-0001',
    status: 'Submitted',
    clientNumber: '00011234',
    reason: 'Export lumber',
    receivedDate: '2026-01-10',
    listingDate: '2026-01-12',
    packageNumber: 'PKG-20001',
  },
  {
    applicationNumber: 'F-A-10002',
    federalApplicationNumber: 'FED-0002',
    status: 'Draft',
    clientNumber: '00021234',
    reason: 'Export pulp',
    receivedDate: '2026-01-13',
    listingDate: '2026-01-15',
    packageNumber: 'PKG-20002',
  },
  {
    applicationNumber: 'F-A-10003',
    federalApplicationNumber: 'FED-0003',
    status: 'Approved',
    clientNumber: '00019876',
    reason: 'Cross-border shipment',
    receivedDate: '2025-12-02',
    listingDate: '2025-12-06',
    packageNumber: 'PKG-20003',
  },
  {
    applicationNumber: 'F-A-10004',
    federalApplicationNumber: 'FED-0004',
    status: 'Returned',
    clientNumber: '00014567',
    reason: 'Missing transport docs',
    receivedDate: '2025-11-28',
    listingDate: '2025-11-30',
    packageNumber: 'PKG-20004',
  },
  {
    applicationNumber: 'F-A-10005',
    federalApplicationNumber: 'FED-0005',
    status: 'Submitted',
    clientNumber: '00017654',
    reason: 'Export timber',
    receivedDate: '2026-02-18',
    listingDate: '2026-02-20',
    packageNumber: 'PKG-20005',
  },
  {
    applicationNumber: 'F-A-10006',
    federalApplicationNumber: 'FED-0006',
    status: 'Submitted',
    clientNumber: '00019876',
    reason: 'Contract shipment',
    receivedDate: '2026-02-27',
    listingDate: '2026-02-28',
    packageNumber: 'PKG-20006',
  },
  {
    applicationNumber: 'F-A-10007',
    federalApplicationNumber: 'FED-0007',
    status: 'Draft',
    clientNumber: '00012345',
    reason: 'New application',
    receivedDate: '2026-03-01',
    listingDate: '2026-03-03',
    packageNumber: 'PKG-20007',
  },
  {
    applicationNumber: 'F-A-10008',
    federalApplicationNumber: 'FED-0008',
    status: 'Approved',
    clientNumber: '00014321',
    reason: 'Special permit',
    receivedDate: '2026-03-08',
    listingDate: '2026-03-10',
    packageNumber: 'PKG-20008',
  },
]

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
  request: FederalApplicationSearchRequest,
): FederalApplicationSearchResponse => {
  const { filters, page, pageSize } = request

  const rows = MOCK_FEDERAL_APPLICATIONS.filter((item) => {
    return (
      includesText(item.federalApplicationNumber, filters.applicationNumber) &&
      includesText(item.packageNumber, filters.packageNumber) &&
      includesText(item.clientNumber, filters.clientNumber) &&
      (!filters.applicationStatus || item.status === filters.applicationStatus) &&
      isAfterOrEqual(item.receivedDate, filters.receivedFromDate) &&
      isBeforeOrEqual(item.receivedDate, filters.receivedToDate) &&
      isAfterOrEqual(item.listingDate, filters.listingFromDate) &&
      isBeforeOrEqual(item.listingDate, filters.listingToDate)
    )
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

type BackendFederalApplicationSearchResult = {
  applicationNumber: number
  federalApplicationNumber: string
  status: string
  client: string
  reason: string
  receivedDate: string
  listingDate: string
}

type BackendFederalApplicationSearchResponse = {
  results: BackendFederalApplicationSearchResult[]
  total: number
  page: number
  size: number
}

const buildBackendParams = (request: FederalApplicationSearchRequest): URLSearchParams => {
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
  appendIfPresent('applicationStatus', filters.applicationStatus)
  appendIfPresent('receivedFromDate', filters.receivedFromDate)
  appendIfPresent('receivedToDate', filters.receivedToDate)
  appendIfPresent('listingFromDate', filters.listingFromDate)
  appendIfPresent('listingToDate', filters.listingToDate)

  // Legacy UI uses one client filter; backend currently supports owner and agent.
  appendIfPresent('ownerClientNumber', filters.clientNumber)
  appendIfPresent('agentClientNumber', filters.clientNumber)

  params.append('page', String(request.page))
  params.append('size', String(request.pageSize))

  return params
}

const parseBackendResponse = (payload: unknown): FederalApplicationSearchResponse | null => {
  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as any).results)) {
    return null
  }

  const backendResponse = payload as BackendFederalApplicationSearchResponse
  const totalElements = Number.isFinite(backendResponse.total) ? backendResponse.total : 0
  const pageSize = Number.isFinite(backendResponse.size) ? backendResponse.size : 10
  const pageNumber = Number.isFinite(backendResponse.page) ? backendResponse.page : 0
  const totalPages = Math.max(1, Math.ceil(totalElements / Math.max(pageSize, 1)))

  return {
    content: backendResponse.results.map((row) => ({
      applicationNumber: String(row.applicationNumber ?? ''),
      federalApplicationNumber: row.federalApplicationNumber ?? '',
      status: row.status ?? '',
      clientNumber: row.client ?? '',
      reason: row.reason ?? '',
      receivedDate: row.receivedDate ?? '',
      listingDate: row.listingDate ?? '',
      packageNumber: '',
    })),
    page: {
      number: pageNumber,
      size: pageSize,
      totalElements,
      totalPages,
    },
  }
}

export const searchFederalApplications = async (
  request: FederalApplicationSearchRequest,
): Promise<FederalApplicationSearchResponse> => {
  try {
    const response = await apiService
      .getAxiosInstance()
      .get('/lexis/federal/applications/search', { params: buildBackendParams(request) })

    const parsed = parseBackendResponse(response.data)
    if (!parsed) {
      throw new Error('Backend federal application response did not include results.')
    }

    return parsed
  } catch (error) {
    console.warn('Using mock federal application search data.', error)
    return applyMockSearch(request)
  }
}
