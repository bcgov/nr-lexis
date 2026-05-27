import type { AxiosResponseHeaders, RawAxiosResponseHeaders } from 'axios'
import apiService from '@/service/api-service'

export type ProvincialApplicationDocumentRow = {
  id: string
  name: string
  description: string
  type: string
}

export type ProvincialApplicationDocumentSource = 'api' | 'legacy'

export type ProvincialApplicationDocumentsResult = {
  rows: ProvincialApplicationDocumentRow[]
  source: ProvincialApplicationDocumentSource
}

export type OpenApplicationDocumentResult =
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

export type RemoveApplicationDocumentResult = {
  success: boolean
  source: ProvincialApplicationDocumentSource
}

const FALLBACK_STATUSES = new Set([204, 404, 405, 500, 501, 502, 503])

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

const buildLegacyApplicationDetailsActionUrl = (
  actionMapping: string,
  values: Record<string, string | undefined>,
): string => {
  const basePath = getLegacyActionBasePath()
  const url = new URL(`${window.location.origin}${basePath}/lexis/applicationDetailsRPC`)
  url.searchParams.set('actionMapping', actionMapping)
  Object.entries(values).forEach(([key, value]) => {
    const normalized = (value ?? '').trim()
    if (normalized.length > 0) {
      url.searchParams.set(key, normalized)
    }
  })
  return url.toString()
}

const normalizeDocumentRow = (
  row: unknown,
  index: number,
): ProvincialApplicationDocumentRow => {
  const source = (row ?? {}) as Record<string, unknown>
  const fallbackId = `document-${index + 1}`
  return {
    id: asString(source.id || source.fileId || fallbackId) || fallbackId,
    name: asString(source.name || source.fileName) || `Document ${index + 1}`,
    description: asString(source.description || source.fileDescription),
    type: asString(source.type || source.attachmentTypeDescription),
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

const postLegacyForm = async (
  payload: Record<string, string>,
): Promise<unknown> => {
  const response = await apiService
    .getAxiosInstance()
    .post<unknown>('/lexis/applicationDetailsRPC', new URLSearchParams(payload), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    })
  return response.data
}

export const fetchApplicationDocuments = async (
  applicationNumber: string,
): Promise<ProvincialApplicationDocumentsResult> => {
  try {
    const response = await apiService
      .getAxiosInstance()
      .get<unknown>('/lexis/rpc/application-details/document-details', {
        params: {
          applicationNumber,
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
      throw new Error('Unexpected application document payload.')
    }

    return {
      rows: rows.map(normalizeDocumentRow),
      source: 'api',
    }
  } catch (error) {
    if (!shouldFallbackToLegacy(error)) {
      throw error
    }

    const legacyUrl = buildLegacyApplicationDetailsActionUrl('getDocumentDetails', {
      applicationNumber,
    })
    const legacyResponse = await apiService.getAxiosInstance().get<unknown>(legacyUrl)
    const rows = parseArrayPayload(legacyResponse.data) ?? []
    return {
      rows: rows.map(normalizeDocumentRow),
      source: 'legacy',
    }
  }
}

export const openApplicationDocument = async (
  fileId: string,
  fileName: string,
): Promise<OpenApplicationDocumentResult> => {
  const legacyUrl = buildLegacyApplicationDetailsActionUrl('getDocument', {
    fileID: fileId,
    fileName,
  })

  try {
    const response = await apiService.getAxiosInstance().get<Blob>(
      '/lexis/rpc/application-details/document',
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

export const removeApplicationDocument = async (
  documentId: string,
): Promise<RemoveApplicationDocumentResult> => {
  const normalizedDocumentId = documentId.trim()
  try {
    const response = await apiService.getAxiosInstance().delete<unknown>(
      '/lexis/rpc/application-details/document',
      {
        params: {
          documentId: normalizedDocumentId,
        },
      },
    )

    if (response.status === 204) {
      const payload = await postLegacyForm({
        actionMapping: 'removeDocument',
        documentId: normalizedDocumentId,
      })
      return {
        success: parseRemoveDocumentSuccess(payload),
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

    const payload = await postLegacyForm({
      actionMapping: 'removeDocument',
      documentId: normalizedDocumentId,
    })
    return {
      success: parseRemoveDocumentSuccess(payload),
      source: 'legacy',
    }
  }
}
