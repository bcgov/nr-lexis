import type { AxiosResponseHeaders, RawAxiosResponseHeaders } from 'axios'

export type DocumentRowBase = {
  id: string
  name: string
  description: string
  type: string
}

const DEFAULT_ARRAY_KEYS = ['results', 'rows', 'items', 'data']

export const documentValueAsString = (value: unknown): string => {
  if (typeof value === 'string') {
    return value.trim()
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }
  return ''
}

export const documentValueAsBoolean = (value: unknown): boolean => {
  if (typeof value === 'boolean') {
    return value
  }
  if (typeof value === 'string') {
    return value.trim().toLowerCase() === 'true'
  }
  return false
}

export const parseDocumentArrayPayload = (
  payload: unknown,
  extraKeys: string[] = [],
): unknown[] | null => {
  if (Array.isArray(payload)) {
    return payload
  }

  if (!payload || typeof payload !== 'object') {
    return null
  }

  const objectPayload = payload as Record<string, unknown>
  for (const key of [...DEFAULT_ARRAY_KEYS, ...extraKeys]) {
    if (Array.isArray(objectPayload[key])) {
      return objectPayload[key]
    }
  }

  return null
}

export const normalizeDocumentRowBase = (row: unknown, index: number): DocumentRowBase => {
  const source = (row ?? {}) as Record<string, unknown>
  const fallbackId = `document-${index + 1}`
  return {
    id: documentValueAsString(source.id || source.fileId || fallbackId) || fallbackId,
    name: documentValueAsString(source.name || source.fileName) || `Document ${index + 1}`,
    description: documentValueAsString(source.description || source.fileDescription),
    type: documentValueAsString(source.type || source.attachmentTypeDescription),
  }
}

export const parseRemoveDocumentSuccess = (payload: unknown): boolean => {
  if (typeof payload === 'boolean') {
    return payload
  }

  if (!payload || typeof payload !== 'object') {
    return false
  }

  const objectPayload = payload as Record<string, unknown>
  if ('success' in objectPayload) {
    return documentValueAsBoolean(objectPayload.success)
  }
  if ('removed' in objectPayload) {
    return documentValueAsBoolean(objectPayload.removed)
  }
  if ('valid' in objectPayload) {
    return documentValueAsBoolean(objectPayload.valid)
  }

  return false
}

export const getResponseHeaderValue = (
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

export const extractResponseFilename = (
  headers: RawAxiosResponseHeaders | AxiosResponseHeaders,
  fallbackFileName: string,
): string => {
  const contentDisposition = getResponseHeaderValue(headers, 'content-disposition')
  if (!contentDisposition) {
    return fallbackFileName
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

  return fallbackFileName
}
