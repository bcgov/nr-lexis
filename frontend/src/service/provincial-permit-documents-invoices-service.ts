import type { AxiosResponseHeaders, RawAxiosResponseHeaders } from 'axios'
import apiService from '@/service/api-service'

export type PermitDocumentRow = {
  id: string
  name: string
  description: string
  type: string
  typeCode: string
}

export type PermitInvoiceRow = {
  id: string
  invoiceNumber: string
  exportValueCad: string
  conversionRate: string
  feeInLieu: string
  invoiceFound: boolean
}

export type PermitDocumentAndInvoiceSource = 'api' | 'legacy'

export type PermitDocumentsResult = {
  rows: PermitDocumentRow[]
  source: PermitDocumentAndInvoiceSource
}

export type PermitInvoicesResult = {
  rows: PermitInvoiceRow[]
  source: PermitDocumentAndInvoiceSource
}

export type OpenPermitDocumentResult =
  | {
      source: 'api'
      blob: Blob
      filename: string
      legacyUrl: string
    }
  | {
      source: 'legacy'
      legacyUrl: string
    }

export type PermitInvoiceConversionRateResult = {
  conversionRate: string
  source: PermitDocumentAndInvoiceSource
}

export type RemovePermitDocumentResult = {
  success: boolean
  source: PermitDocumentAndInvoiceSource
}

type PermitInvoiceDetailsPayload = {
  invoicefound?: boolean
  rate?: unknown
  fee?: unknown
  value?: unknown
}

const FALLBACK_STATUSES = new Set([204, 404, 405, 500, 501, 502, 503])
const DEFAULT_CONVERSION_RATE = '1.00'

const asString = (value: unknown): string => {
  if (typeof value === 'string') {
    return value.trim()
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }
  return ''
}

const asBoolean = (value: unknown): boolean => {
  if (typeof value === 'boolean') {
    return value
  }
  if (typeof value === 'string') {
    return value.trim().toLowerCase() === 'true'
  }
  return false
}

const parseRemoveDocumentSuccess = (payload: unknown): boolean => {
  if (typeof payload === 'boolean') {
    return payload
  }

  if (!payload || typeof payload !== 'object') {
    return false
  }

  const objectPayload = payload as Record<string, unknown>
  if ('success' in objectPayload) {
    return asBoolean(objectPayload.success)
  }
  if ('removed' in objectPayload) {
    return asBoolean(objectPayload.removed)
  }
  if ('valid' in objectPayload) {
    return asBoolean(objectPayload.valid)
  }

  return false
}

const parseArrayPayload = (payload: unknown): unknown[] | null => {
  if (Array.isArray(payload)) {
    return payload
  }

  if (!payload || typeof payload !== 'object') {
    return null
  }

  const objectPayload = payload as Record<string, unknown>
  if (Array.isArray(objectPayload.results)) {
    return objectPayload.results
  }
  if (Array.isArray(objectPayload.rows)) {
    return objectPayload.rows
  }
  if (Array.isArray(objectPayload.items)) {
    return objectPayload.items
  }
  if (Array.isArray(objectPayload.data)) {
    return objectPayload.data
  }
  if (Array.isArray(objectPayload.invoiceList)) {
    return objectPayload.invoiceList
  }

  return null
}

const shouldFallbackToLegacy = (error: unknown): boolean => {
  const status = (error as any)?.response?.status
  if (typeof status === 'number') {
    return FALLBACK_STATUSES.has(status)
  }
  return true
}

const getLegacyActionBasePath = (): string => {
  const configured = (import.meta.env.VITE_LEXIS_LEGACY_ENDPOINT_BASE ?? '/api').trim()
  if (!configured) {
    return '/api'
  }
  return configured.endsWith('/') ? configured.slice(0, -1) : configured
}

const buildLegacyPermitDetailsActionUrl = (
  actionMapping: string,
  values: Record<string, string | undefined>,
): string => {
  const basePath = getLegacyActionBasePath()
  const url = new URL(`${window.location.origin}${basePath}/lexis/permitDetailsRPC`)
  url.searchParams.set('actionMapping', actionMapping)
  Object.entries(values).forEach(([key, value]) => {
    const normalized = (value ?? '').trim()
    if (normalized.length > 0) {
      url.searchParams.set(key, normalized)
    }
  })
  return url.toString()
}

const normalizeDocumentRow = (row: unknown, index: number): PermitDocumentRow => {
  const source = (row ?? {}) as Record<string, unknown>
  const fallbackId = `document-${index + 1}`
  return {
    id: asString(source.id || source.fileId || fallbackId) || fallbackId,
    name: asString(source.name || source.fileName) || `Document ${index + 1}`,
    description: asString(source.description || source.fileDescription),
    type: asString(source.type || source.attachmentTypeDescription),
    typeCode: asString(source.typeCode || source.attachmentType || source.type_code),
  }
}

const getResponseHeaderValue = (
  headers: RawAxiosResponseHeaders | AxiosResponseHeaders,
  name: string,
): string | null => {
  const headerValue = headers[name] ?? headers[name.toLowerCase()] ?? headers[name.toUpperCase()]
  if (typeof headerValue === 'string') {
    return headerValue
  }
  if (Array.isArray(headerValue)) {
    return headerValue[0] ?? null
  }
  return null
}

const extractFilename = (
  headers: RawAxiosResponseHeaders | AxiosResponseHeaders,
  requestedFileName: string,
): string => {
  const contentDisposition = getResponseHeaderValue(headers, 'content-disposition')
  if (!contentDisposition) {
    return requestedFileName
  }

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i)
  if (utf8Match && utf8Match[1]) {
    try {
      return decodeURIComponent(utf8Match[1])
    } catch {
      // ignored - fallback parser below
    }
  }

  const regularMatch = contentDisposition.match(/filename="?([^";]+)"?/i)
  if (regularMatch && regularMatch[1]) {
    return regularMatch[1]
  }

  return requestedFileName
}

type PermitInvoiceDetailsResult = {
  details: PermitInvoiceDetailsPayload
  source: PermitDocumentAndInvoiceSource
}

const fetchInvoiceDetails = async (
  permitNumber: string,
  invoiceNumber: string,
): Promise<PermitInvoiceDetailsResult> => {
  try {
    const response = await apiService
      .getAxiosInstance()
      .get<PermitInvoiceDetailsPayload>('/lexis/rpc/permit-details/invoice-details', {
        params: {
          permitNumber,
          salesInvoiceNumber: invoiceNumber,
        },
      })

    if (response.status === 204) {
      return {
        details: {
          invoicefound: false,
          rate: '',
          fee: '',
          value: '',
        },
        source: 'api',
      }
    }

    return {
      details: response.data ?? {
        invoicefound: false,
        rate: '',
        fee: '',
        value: '',
      },
      source: 'api',
    }
  } catch (error) {
    if (!shouldFallbackToLegacy(error)) {
      throw error
    }

    const legacyUrl = buildLegacyPermitDetailsActionUrl('getInvoiceDetails', {
      permitNumber,
      salesInvoiceNumber: invoiceNumber,
    })
    const legacyResponse = await apiService.getAxiosInstance().get<PermitInvoiceDetailsPayload>(legacyUrl)

    return {
      details: legacyResponse.data ?? {
        invoicefound: false,
        rate: '',
        fee: '',
        value: '',
      },
      source: 'legacy',
    }
  }
}

export const fetchPermitDocuments = async (permitNumber: string): Promise<PermitDocumentsResult> => {
  try {
    const response = await apiService
      .getAxiosInstance()
      .get<unknown>('/lexis/rpc/permit-details/document-details', {
        params: {
          permitNumber,
        },
      })

    if (response.status === 204) {
      return {
        rows: [],
        source: 'api',
      }
    }

    const rows = parseArrayPayload(response.data)
    if (!rows) {
      throw new Error('Unexpected document list payload.')
    }

    return {
      rows: rows.map(normalizeDocumentRow),
      source: 'api',
    }
  } catch (error) {
    if (!shouldFallbackToLegacy(error)) {
      throw error
    }

    const legacyUrl = buildLegacyPermitDetailsActionUrl('getDocumentDetails', {
      permitNumber,
    })
    const legacyResponse = await apiService.getAxiosInstance().get<unknown>(legacyUrl)
    const rows = parseArrayPayload(legacyResponse.data) ?? []

    return {
      rows: rows.map(normalizeDocumentRow),
      source: 'legacy',
    }
  }
}

export const openPermitDocument = async (
  fileId: string,
  fileName: string,
): Promise<OpenPermitDocumentResult> => {
  const legacyUrl = buildLegacyPermitDetailsActionUrl('getDocument', {
    fileID: fileId,
    fileName,
  })

  try {
    const response = await apiService.getAxiosInstance().get<Blob>(
      '/lexis/rpc/permit-details/document',
      {
        params: {
          fileId,
          fileName,
        },
        responseType: 'blob',
        headers: {
          Accept: 'application/octet-stream',
        },
      },
    )

    if (response.status === 204) {
      return {
        source: 'legacy',
        legacyUrl,
      }
    }

    return {
      source: 'api',
      blob: response.data,
      filename: extractFilename(response.headers, fileName),
      legacyUrl,
    }
  } catch (error) {
    if (!shouldFallbackToLegacy(error)) {
      throw error
    }

    return {
      source: 'legacy',
      legacyUrl,
    }
  }
}

export const fetchPermitInvoices = async (permitNumber: string): Promise<PermitInvoicesResult> => {
  let invoiceNumbers: string[] = []
  let listSource: PermitDocumentAndInvoiceSource = 'api'

  try {
    const response = await apiService
      .getAxiosInstance()
      .get<{ invoiceList?: unknown }>('/lexis/rpc/permit-details/invoices-for-permit', {
        params: {
          permitNumber,
        },
      })

    if (response.status === 204) {
      return {
        rows: [],
        source: 'api',
      }
    }

    const listRaw = Array.isArray(response.data?.invoiceList)
      ? response.data.invoiceList
      : parseArrayPayload(response.data)
    if (!listRaw) {
      throw new Error('Unexpected invoice list payload.')
    }
    invoiceNumbers = listRaw.map((entry) => asString(entry)).filter((entry) => entry.length > 0)
  } catch (error) {
    if (!shouldFallbackToLegacy(error)) {
      throw error
    }

    listSource = 'legacy'
    const legacyUrl = buildLegacyPermitDetailsActionUrl('getInvoicesForPermit', {
      permitNumber,
    })
    const legacyResponse = await apiService.getAxiosInstance().get<{ invoiceList?: unknown }>(legacyUrl)
    const listRaw = Array.isArray(legacyResponse.data?.invoiceList)
      ? legacyResponse.data.invoiceList
      : parseArrayPayload(legacyResponse.data)
    invoiceNumbers = (listRaw ?? []).map((entry) => asString(entry)).filter((entry) => entry.length > 0)
  }

  const detailsResults = await Promise.all(
    invoiceNumbers.map((invoiceNumber) => fetchInvoiceDetails(permitNumber, invoiceNumber)),
  )

  const detailsSource = detailsResults.some((result) => result.source === 'legacy') ? 'legacy' : 'api'

  return {
    rows: detailsResults.map((result, index) => ({
      id: `${invoiceNumbers[index]}-${index + 1}`,
      invoiceNumber: invoiceNumbers[index],
      exportValueCad: asString(result.details.value),
      conversionRate: asString(result.details.rate),
      feeInLieu: asString(result.details.fee),
      invoiceFound: asBoolean(result.details.invoicefound),
    })),
    source: listSource === 'legacy' || detailsSource === 'legacy' ? 'legacy' : 'api',
  }
}

export const fetchPermitInvoiceConversionRate =
  async (): Promise<PermitInvoiceConversionRateResult> => {
    try {
      const response = await apiService
        .getAxiosInstance()
        .get<{ success?: boolean; conversionRate?: unknown }>(
          '/lexis/rpc/permit-details/conversion-rate',
        )

      const conversionRate = asString(response.data?.conversionRate) || DEFAULT_CONVERSION_RATE
      return {
        conversionRate,
        source: 'api',
      }
    } catch (error) {
      if (!shouldFallbackToLegacy(error)) {
        throw error
      }

      const legacyUrl = buildLegacyPermitDetailsActionUrl('getConversionRate', {})
      const legacyResponse = await apiService
        .getAxiosInstance()
        .get<{ success?: boolean; conversionRate?: unknown }>(legacyUrl)
      const conversionRate = asString(legacyResponse.data?.conversionRate) || DEFAULT_CONVERSION_RATE
      return {
        conversionRate,
        source: 'legacy',
      }
    }
  }

const removeDocumentWithFallback = async (
  apiPath: string,
  legacyActionMapping: string,
  documentId: string,
): Promise<RemovePermitDocumentResult> => {
  const normalizedDocumentId = documentId.trim()
  const legacyUrl = buildLegacyPermitDetailsActionUrl(legacyActionMapping, {
    documentId: normalizedDocumentId,
  })

  try {
    const response = await apiService.getAxiosInstance().delete<unknown>(apiPath, {
      params: {
        documentId: normalizedDocumentId,
      },
    })

    if (response.status === 204) {
      const fallbackResponse = await apiService.getAxiosInstance().get<unknown>(legacyUrl)
      return {
        success: parseRemoveDocumentSuccess(fallbackResponse.data),
        source: 'legacy',
      }
    }

    return {
      success: parseRemoveDocumentSuccess(response.data),
      source: 'api',
    }
  } catch (error) {
    if (!shouldFallbackToLegacy(error)) {
      throw error
    }

    const fallbackResponse = await apiService.getAxiosInstance().get<unknown>(legacyUrl)
    return {
      success: parseRemoveDocumentSuccess(fallbackResponse.data),
      source: 'legacy',
    }
  }
}

export const removePermitDocument = async (
  documentId: string,
): Promise<RemovePermitDocumentResult> => {
  return removeDocumentWithFallback(
    '/lexis/rpc/permit-details/document/permit',
    'removePermitDocument',
    documentId,
  )
}

export const removePermitInvoiceDocument = async (
  documentId: string,
): Promise<RemovePermitDocumentResult> => {
  return removeDocumentWithFallback(
    '/lexis/rpc/permit-details/document/invoice',
    'removeInvoiceDocument',
    documentId,
  )
}
