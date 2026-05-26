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

export const searchFederalApplications = async (
  request: FederalApplicationSearchRequest,
): Promise<FederalApplicationSearchResponse> => {
  try {
    const response = await apiService
      .getAxiosInstance()
      .post<FederalApplicationSearchResponse>('/v1/federal/applications/search', request)
    return response.data
  } catch (error) {
    console.warn('Using mock federal application search data.', error)
    return applyMockSearch(request)
  }
}
