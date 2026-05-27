import apiService from '@/service/api-service'
import type {
  IndianReservePermitSearchItem,
  IndianReservePermitSearchRequest,
  IndianReservePermitSearchResponse,
  IndianReservePermitSearchSortField,
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

const SORTERS: Record<
  IndianReservePermitSearchSortField,
  (row: IndianReservePermitSearchItem) => string | number
> = {
  permitNumber: (row) => row.permitNumber,
  clientNumber: (row) => row.clientNumber,
  issueDate: (row) => row.issueDate,
  shippingDate: (row) => row.shippingDate,
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
  request: IndianReservePermitSearchRequest,
): IndianReservePermitSearchResponse => {
  const { filters, sortField, sortDirection, page, pageSize } = request
  let rows = MOCK_INDIAN_RESERVE_PERMITS.filter((item) => {
    return (
      includesText(item.permitNumber, filters.permitNumber) &&
      includesText(item.packageNumber, filters.packageNumber) &&
      isAfterOrEqual(item.issueDate, filters.fromPermitIssueDate) &&
      isBeforeOrEqual(item.issueDate, filters.toPermitIssueDate) &&
      isAfterOrEqual(item.shippingDate, filters.fromEstimatedShippingDate) &&
      isBeforeOrEqual(item.shippingDate, filters.toEstimatedShippingDate)
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

type BackendIndianReservePermitSearchResult = {
  permitNumber: string
  clientNumber: string
  issueDate: string
  shippingDate: string
}

type BackendIndianReservePermitSearchResponse = {
  results: BackendIndianReservePermitSearchResult[]
  total: number
  page: number
  size: number
}

const buildBackendParams = (request: IndianReservePermitSearchRequest): URLSearchParams => {
  const params = new URLSearchParams()

  const appendIfPresent = (key: string, value: string) => {
    const trimmed = value.trim()
    if (trimmed.length > 0) {
      params.append(key, trimmed)
    }
  }

  const { filters } = request
  appendIfPresent('permitNumber', filters.permitNumber)
  appendIfPresent('packageNumber', filters.packageNumber)
  appendIfPresent('fromPermitIssueDate', filters.fromPermitIssueDate)
  appendIfPresent('toPermitIssueDate', filters.toPermitIssueDate)
  appendIfPresent('fromEstimatedShippingDate', filters.fromEstimatedShippingDate)
  appendIfPresent('toEstimatedShippingDate', filters.toEstimatedShippingDate)

  const backendSortField =
    request.sortDirection === 'desc' ? `${request.sortField} DESC` : request.sortField
  params.append('sortField', backendSortField)
  params.append('page', String(request.page))
  params.append('size', String(request.pageSize))

  return params
}

const parseBackendResponse = (payload: unknown): IndianReservePermitSearchResponse | null => {
  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as any).results)) {
    return null
  }

  const backendResponse = payload as BackendIndianReservePermitSearchResponse
  const totalElements = Number.isFinite(backendResponse.total) ? backendResponse.total : 0
  const pageSize = Number.isFinite(backendResponse.size) ? backendResponse.size : 10
  const pageNumber = Number.isFinite(backendResponse.page) ? backendResponse.page : 0
  const totalPages = Math.max(1, Math.ceil(totalElements / Math.max(pageSize, 1)))

  return {
    content: backendResponse.results.map((row) => ({
      permitNumber: row.permitNumber ?? '',
      clientNumber: row.clientNumber ?? '',
      issueDate: row.issueDate ?? '',
      shippingDate: row.shippingDate ?? '',
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

export const searchIndianReservePermits = async (
  request: IndianReservePermitSearchRequest,
): Promise<IndianReservePermitSearchResponse> => {
  try {
    const response = await apiService
      .getAxiosInstance()
      .get('/lexis/indian-reserve/permits/search', { params: buildBackendParams(request) })

    const parsed = parseBackendResponse(response.data)
    if (!parsed) {
      throw new Error('Backend indigenous reserve permit response did not include results.')
    }

    return parsed
  } catch (error) {
    console.warn('Using mock indigenous reserve permit search data.', error)
    return applyMockSearch(request)
  }
}
