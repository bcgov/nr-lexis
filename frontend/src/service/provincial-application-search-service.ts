import apiService from '@/service/api-service'
import type {
  ProvincialApplicationSearchItem,
  ProvincialApplicationSearchRequest,
  ProvincialApplicationSearchResponse,
  ProvincialApplicationSearchSortField,
} from '@/interfaces/ProvincialApplicationSearch'

const MOCK_PROVINCIAL_APPLICATIONS: ProvincialApplicationSearchItem[] = [
  {
    applicationNumber: 'A-10001',
    status: 'Submitted',
    applicantClientNumber: '00011234',
    ownerClientNumber: '00021234',
    region: 'CAR',
    applicationVolume: 1560,
    exemptionNumber: 'E-50001',
    listingDate: '2026-01-12',
    packageNumber: 'PKG-20001',
    exemptionType: 'Section 1',
    productTypeCode: 'Lumber',
    allowCreateExemption: true,
  },
  {
    applicationNumber: 'A-10002',
    status: 'Draft',
    applicantClientNumber: '00011234',
    ownerClientNumber: '00021234',
    region: 'SKE',
    applicationVolume: 890,
    exemptionNumber: '',
    listingDate: '2026-01-15',
    packageNumber: 'PKG-20002',
    exemptionType: '',
    productTypeCode: 'Logs',
    allowCreateExemption: true,
  },
  {
    applicationNumber: 'A-10003',
    status: 'Approved',
    applicantClientNumber: '00019876',
    ownerClientNumber: '00029876',
    region: 'KAM',
    applicationVolume: 2300,
    exemptionNumber: 'E-50002',
    listingDate: '2025-12-06',
    packageNumber: 'PKG-20003',
    exemptionType: 'Section 2',
    productTypeCode: 'Pulp',
    allowCreateExemption: false,
  },
  {
    applicationNumber: 'A-10004',
    status: 'Returned',
    applicantClientNumber: '00014567',
    ownerClientNumber: '00024567',
    region: 'OMI',
    applicationVolume: 120,
    exemptionNumber: '',
    listingDate: '2025-11-30',
    packageNumber: 'PKG-20004',
    exemptionType: '',
    productTypeCode: 'Logs',
    allowCreateExemption: true,
  },
  {
    applicationNumber: 'A-10005',
    status: 'Submitted',
    applicantClientNumber: '00017654',
    ownerClientNumber: '00027654',
    region: 'NEL',
    applicationVolume: 4100,
    exemptionNumber: 'E-50003',
    listingDate: '2026-02-20',
    packageNumber: 'PKG-20005',
    exemptionType: 'Section 1',
    productTypeCode: 'Lumber',
    allowCreateExemption: true,
  },
  {
    applicationNumber: 'A-10006',
    status: 'Submitted',
    applicantClientNumber: '00019876',
    ownerClientNumber: '00029876',
    region: 'SKE',
    applicationVolume: 545,
    exemptionNumber: '',
    listingDate: '2026-02-28',
    packageNumber: 'PKG-20006',
    exemptionType: '',
    productTypeCode: 'Chips',
    allowCreateExemption: true,
  },
  {
    applicationNumber: 'A-10007',
    status: 'Draft',
    applicantClientNumber: '00012345',
    ownerClientNumber: '00022345',
    region: 'CAR',
    applicationVolume: 1710,
    exemptionNumber: '',
    listingDate: '2026-03-03',
    packageNumber: 'PKG-20007',
    exemptionType: '',
    productTypeCode: 'Lumber',
    allowCreateExemption: true,
  },
  {
    applicationNumber: 'A-10008',
    status: 'Approved',
    applicantClientNumber: '00014321',
    ownerClientNumber: '00024321',
    region: 'KAM',
    applicationVolume: 223,
    exemptionNumber: 'E-50004',
    listingDate: '2026-03-10',
    packageNumber: 'PKG-20008',
    exemptionType: 'Section 2',
    productTypeCode: 'Pulp',
    allowCreateExemption: false,
  },
  {
    applicationNumber: 'A-10009',
    status: 'Submitted',
    applicantClientNumber: '00015678',
    ownerClientNumber: '00025678',
    region: 'NEL',
    applicationVolume: 987,
    exemptionNumber: '',
    listingDate: '2026-03-21',
    packageNumber: 'PKG-20009',
    exemptionType: '',
    productTypeCode: 'Logs',
    allowCreateExemption: true,
  },
  {
    applicationNumber: 'A-10010',
    status: 'Closed',
    applicantClientNumber: '00016789',
    ownerClientNumber: '00026789',
    region: 'OMI',
    applicationVolume: 75,
    exemptionNumber: 'E-50005',
    listingDate: '2025-10-22',
    packageNumber: 'PKG-20010',
    exemptionType: 'Section 3',
    productTypeCode: 'Lumber',
    allowCreateExemption: false,
  },
  {
    applicationNumber: 'A-10011',
    status: 'Submitted',
    applicantClientNumber: '00011001',
    ownerClientNumber: '00021001',
    region: 'CAR',
    applicationVolume: 680,
    exemptionNumber: '',
    listingDate: '2026-04-11',
    packageNumber: 'PKG-20011',
    exemptionType: '',
    productTypeCode: 'Logs',
    allowCreateExemption: true,
  },
  {
    applicationNumber: 'A-10012',
    status: 'Draft',
    applicantClientNumber: '00011002',
    ownerClientNumber: '00021002',
    region: 'SKE',
    applicationVolume: 2490,
    exemptionNumber: '',
    listingDate: '2026-04-12',
    packageNumber: 'PKG-20012',
    exemptionType: '',
    productTypeCode: 'Chips',
    allowCreateExemption: true,
  },
]

const STATUS_ORDER = ['Draft', 'Submitted', 'Returned', 'Approved', 'Closed']

const SORTERS: Record<
  ProvincialApplicationSearchSortField,
  (row: ProvincialApplicationSearchItem) => string | number
> = {
  applicationNumber: (row) => row.applicationNumber,
  status: (row) => STATUS_ORDER.indexOf(row.status),
  applicantClientNumber: (row) => row.applicantClientNumber,
  ownerClientNumber: (row) => row.ownerClientNumber,
  region: (row) => row.region,
  applicationVolume: (row) => row.applicationVolume,
  exemptionNumber: (row) => row.exemptionNumber,
  listingDate: (row) => row.listingDate,
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
  request: ProvincialApplicationSearchRequest,
): ProvincialApplicationSearchResponse => {
  const { filters, sortField, sortDirection, page, pageSize } = request

  let rows = MOCK_PROVINCIAL_APPLICATIONS.filter((item) => {
    return (
      includesText(item.applicationNumber, filters.applicationNumber) &&
      includesText(item.packageNumber, filters.packageNumber) &&
      includesText(item.exemptionNumber, filters.exemptionNumber) &&
      includesText(item.applicantClientNumber, filters.applicantClientNumber) &&
      includesText(item.ownerClientNumber, filters.ownerClientNumber) &&
      (filters.region.length === 0 || filters.region.includes(item.region)) &&
      (!filters.exemptionType || item.exemptionType === filters.exemptionType) &&
      (!filters.applicationStatus || item.status === filters.applicationStatus) &&
      (!filters.productTypeCode || item.productTypeCode === filters.productTypeCode) &&
      isAfterOrEqual(item.listingDate, filters.listingFromDate) &&
      isBeforeOrEqual(item.listingDate, filters.listingToDate)
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

export const searchProvincialApplications = async (
  request: ProvincialApplicationSearchRequest,
): Promise<ProvincialApplicationSearchResponse> => {
  try {
    const response = await apiService
      .getAxiosInstance()
      .post<ProvincialApplicationSearchResponse>('/v1/provincial/applications/search', request)
    return response.data
  } catch (error) {
    console.warn('Using mock provincial application search data.', error)
    return applyMockSearch(request)
  }
}
