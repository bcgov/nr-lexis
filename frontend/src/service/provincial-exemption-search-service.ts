import apiService from '@/service/api-service'
import { toSearchServiceError } from '@/service/search-service-fallback'
import type {
  ProvincialExemptionSearchRequest,
  ProvincialExemptionSearchResponse,
} from '@/interfaces/ProvincialExemptionSearch'

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
    throw toSearchServiceError('Unable to load provincial exemption search results.', error)
  }
}
