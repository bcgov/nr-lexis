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

export type PermitDocumentAndInvoiceSource = 'api'

export type PermitDocumentsResult = {
  rows: PermitDocumentRow[]
  source: PermitDocumentAndInvoiceSource
}

export type PermitInvoicesResult = {
  rows: PermitInvoiceRow[]
  source: PermitDocumentAndInvoiceSource
}

export type OpenPermitDocumentResult = {
  source: 'api'
  blob: Blob
  filename: string
}

export type PermitInvoiceConversionRateResult = {
  conversionRate: string
  source: PermitDocumentAndInvoiceSource
}

export type AddPermitInvoiceRequest = {
  permitNumber: string
  salesInvoiceNumber: string
  invoiceExportValue: string
  invoiceConversionRate: string
  invoiceFeeInLieu: string
}

export type AddPermitInvoiceResult = {
  success: boolean
  message: string
  errors: string[]
  warnings: string[]
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

const DEFAULT_CONVERSION_RATE = '1.00'
const PERMIT_DOCUMENT_INVOICE_CACHE_TTL_MS = 30_000

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

const parseStringArrayPayload = (payload: unknown): string[] => {
  if (!Array.isArray(payload)) {
    return []
  }

  return payload
    .map((entry) => asString(entry))
    .filter((entry): entry is string => entry.length > 0)
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

const fetchInvoiceDetails = async (
  permitNumber: string,
  invoiceNumber: string,
): Promise<PermitInvoiceDetailsPayload> => {
  const response = await apiService.getCachedResponse<PermitInvoiceDetailsPayload>(
    '/lexis/rpc/permit-details/invoice-details',
    {
      params: {
        permitNumber,
        salesInvoiceNumber: invoiceNumber,
      },
    },
    { ttlMs: PERMIT_DOCUMENT_INVOICE_CACHE_TTL_MS },
  )

  if (response.status === 204) {
    return {
      invoicefound: false,
      rate: '',
      fee: '',
      value: '',
    }
  }

  return (
    response.data ?? {
      invoicefound: false,
      rate: '',
      fee: '',
      value: '',
    }
  )
}

export const fetchPermitDocuments = async (
  permitNumber: string,
): Promise<PermitDocumentsResult> => {
  const response = await apiService.getCachedResponse<unknown>(
    '/lexis/rpc/permit-details/document-details',
    {
      params: {
        permitNumber,
      },
    },
    { ttlMs: PERMIT_DOCUMENT_INVOICE_CACHE_TTL_MS },
  )

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
}

export const openPermitDocument = async (
  fileId: string,
  fileName: string,
): Promise<OpenPermitDocumentResult> => {
  const response = await apiService
    .getAxiosInstance()
    .get<Blob>('/lexis/rpc/permit-details/document', {
      params: {
        fileId,
        fileName,
      },
      responseType: 'blob',
      headers: {
        Accept: 'application/octet-stream',
      },
    })

  if (response.status === 204) {
    throw new Error('Permit document payload was empty.')
  }

  return {
    source: 'api',
    blob: response.data,
    filename: extractFilename(response.headers, fileName),
  }
}

export const fetchPermitInvoices = async (permitNumber: string): Promise<PermitInvoicesResult> => {
  const response = await apiService.getCachedResponse<{ invoiceList?: unknown }>(
    '/lexis/rpc/permit-details/invoices-for-permit',
    {
      params: {
        permitNumber,
      },
    },
    { ttlMs: PERMIT_DOCUMENT_INVOICE_CACHE_TTL_MS },
  )

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

  const invoiceNumbers = listRaw.map((entry) => asString(entry)).filter((entry) => entry.length > 0)

  const detailsResults: PermitInvoiceDetailsPayload[] = []
  for (const invoiceNumber of invoiceNumbers) {
    detailsResults.push(await fetchInvoiceDetails(permitNumber, invoiceNumber))
  }

  return {
    rows: detailsResults.map((result, index) => ({
      id: `${invoiceNumbers[index]}-${index + 1}`,
      invoiceNumber: invoiceNumbers[index],
      exportValueCad: asString(result.value),
      conversionRate: asString(result.rate),
      feeInLieu: asString(result.fee),
      invoiceFound: asBoolean(result.invoicefound),
    })),
    source: 'api',
  }
}

export const fetchPermitInvoiceConversionRate =
  async (): Promise<PermitInvoiceConversionRateResult> => {
    const response = await apiService.getCachedResponse<{
      success?: boolean
      conversionRate?: unknown
    }>('/lexis/rpc/permit-details/conversion-rate', undefined, {
      ttlMs: PERMIT_DOCUMENT_INVOICE_CACHE_TTL_MS,
    })

    const conversionRate = asString(response.data?.conversionRate) || DEFAULT_CONVERSION_RATE
    return {
      conversionRate,
      source: 'api',
    }
  }

const postFormData = async (path: string, payload: Record<string, string>): Promise<unknown> => {
  const response = await apiService
    .getAxiosInstance()
    .post<unknown>(path, new URLSearchParams(payload), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    })

  return response.data
}

const parseAddPermitInvoiceResponse = (
  payload: unknown,
  source: PermitDocumentAndInvoiceSource,
): AddPermitInvoiceResult => {
  const objectPayload = (payload ?? {}) as Record<string, unknown>
  const success = asBoolean(objectPayload.success ?? objectPayload.valid)
  const message = asString(objectPayload.message)
  const errors = parseStringArrayPayload(objectPayload.errors)
  const warnings = parseStringArrayPayload(objectPayload.warnings)

  return {
    success,
    message: message || (success ? 'Invoice saved successfully.' : 'Unable to save invoice.'),
    errors,
    warnings,
    source,
  }
}

export const addPermitInvoice = async (
  request: AddPermitInvoiceRequest,
): Promise<AddPermitInvoiceResult> => {
  const normalizedPayload = {
    permitNumber: request.permitNumber.trim(),
    salesInvoiceNumber: request.salesInvoiceNumber.trim(),
    invoiceExportValue: request.invoiceExportValue.trim(),
    invoiceConversionRate: request.invoiceConversionRate.trim(),
    invoiceFeeInLieu: request.invoiceFeeInLieu.trim(),
  }

  const payload = await postFormData('/lexis/rpc/permit-details/add-invoice', normalizedPayload)
  return parseAddPermitInvoiceResponse(payload, 'api')
}

const removeDocument = async (
  apiPath: string,
  documentId: string,
): Promise<RemovePermitDocumentResult> => {
  const normalizedDocumentId = documentId.trim()
  const response = await apiService.getAxiosInstance().delete<unknown>(apiPath, {
    params: {
      documentId: normalizedDocumentId,
    },
  })

  if (response.status === 204) {
    return {
      success: true,
      source: 'api',
    }
  }

  return {
    success: parseRemoveDocumentSuccess(response.data),
    source: 'api',
  }
}

export const removePermitDocument = async (
  documentId: string,
): Promise<RemovePermitDocumentResult> => {
  return removeDocument('/lexis/rpc/permit-details/document/permit', documentId)
}

export const removePermitInvoiceDocument = async (
  documentId: string,
): Promise<RemovePermitDocumentResult> => {
  return removeDocument('/lexis/rpc/permit-details/document/invoice', documentId)
}

export const removePermitApplicationDocument = async (
  documentId: string,
): Promise<RemovePermitDocumentResult> => {
  return removeDocument('/lexis/rpc/permit-details/document/application', documentId)
}
