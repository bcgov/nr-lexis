import apiService from '@/service/api-service'
import type {
  IndianReservePermitSearchItem,
  IndianReservePermitSearchRequest,
  IndianReservePermitSearchResponse,
} from '@/interfaces/IndianReservePermitSearch'

const MOCK_INDIAN_RESERVE_PERMITS: IndianReservePermitSearchItem[] = [
  {
    permitNumber: 'IR-P-90001',
    clientNumber: '00011234',
    issueDate: '2026-01-10',
    shippingDate: '2026-01-21',
    packageNumber: 'PKG-IR-1001',
  },
  {
    permitNumber: 'IR-P-90002',
    clientNumber: '00021234',
    issueDate: '2026-01-14',
    shippingDate: '2026-01-30',
    packageNumber: 'PKG-IR-1002',
  },
  {
    permitNumber: 'IR-P-90003',
    clientNumber: '00019876',
    issueDate: '2025-12-02',
    shippingDate: '2025-12-12',
    packageNumber: 'PKG-IR-1003',
  },
  {
    permitNumber: 'IR-P-90004',
    clientNumber: '00014567',
    issueDate: '2025-11-29',
    shippingDate: '2025-12-08',
    packageNumber: 'PKG-IR-1004',
  },
  {
    permitNumber: 'IR-P-90005',
    clientNumber: '00017654',
    issueDate: '2026-02-18',
    shippingDate: '2026-02-24',
    packageNumber: 'PKG-IR-1005',
  },
  {
    permitNumber: 'IR-P-90006',
    clientNumber: '00019876',
    issueDate: '2026-02-27',
    shippingDate: '2026-03-08',
    packageNumber: 'PKG-IR-1006',
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
  request: IndianReservePermitSearchRequest,
): IndianReservePermitSearchResponse => {
  const { filters, page, pageSize } = request
  const rows = MOCK_INDIAN_RESERVE_PERMITS.filter((item) => {
    return (
      includesText(item.permitNumber, filters.permitNumber) &&
      includesText(item.packageNumber, filters.packageNumber) &&
      isAfterOrEqual(item.issueDate, filters.fromPermitIssueDate) &&
      isBeforeOrEqual(item.issueDate, filters.toPermitIssueDate) &&
      isAfterOrEqual(item.shippingDate, filters.fromEstimatedShippingDate) &&
      isBeforeOrEqual(item.shippingDate, filters.toEstimatedShippingDate)
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

export const searchIndianReservePermits = async (
  request: IndianReservePermitSearchRequest,
): Promise<IndianReservePermitSearchResponse> => {
  try {
    const response = await apiService
      .getAxiosInstance()
      .post<IndianReservePermitSearchResponse>('/v1/indian-reserve/permits/search', request)
    return response.data
  } catch (error) {
    console.warn('Using mock indian reserve permit search data.', error)
    return applyMockSearch(request)
  }
}
