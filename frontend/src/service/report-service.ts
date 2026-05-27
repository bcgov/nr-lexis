import type { AxiosRequestConfig, AxiosResponseHeaders, RawAxiosResponseHeaders } from 'axios'
import apiService from '@/service/api-service'

export type RunReportRequest = {
  reportId: string
  legacyPath: string
  actionMapping: string
  values: Record<string, string>
}

export type RunReportResult =
  | {
      source: 'api'
      blob: Blob
      filename: string
      contentType: string
      legacyUrl: string
    }
  | {
      source: 'legacy'
      legacyUrl: string
    }

const FALLBACK_STATUSES = new Set([404, 405, 500, 501, 502, 503])

const splitCsv = (value: string): string[] =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)

const normalizeClientNumber = (value: string): string => {
  const trimmed = value.trim()
  if (!trimmed || !/^[0-9]+$/.test(trimmed)) {
    return trimmed
  }

  return trimmed.padStart(8, '0')
}

const normalizeUppercase = (value: string): string => value.trim().toUpperCase()

const getLegacyReportBasePath = (): string => {
  const configured = (import.meta.env.VITE_LEXIS_REPORT_ENDPOINT_BASE ?? '/api').trim()
  if (!configured) {
    return '/api'
  }
  return configured.endsWith('/') ? configured.slice(0, -1) : configured
}

const getModernReportApiBasePath = (): string => {
  const configured = (import.meta.env.VITE_LEXIS_REPORT_API_BASE ?? '/lexis/reports').trim()
  if (!configured) {
    return '/lexis/reports'
  }
  return configured.endsWith('/') ? configured.slice(0, -1) : configured
}

const buildModernReportEndpoint = (reportId: string): string => {
  const basePath = getModernReportApiBasePath()
  return `${basePath}/${encodeURIComponent(reportId)}`
}

export const buildLegacyReportUrl = (
  legacyPath: string,
  values: Record<string, string>,
  actionMapping: string,
): string => {
  const basePath = getLegacyReportBasePath()
  const url = new URL(`${window.location.origin}${basePath}${legacyPath}`)

  url.searchParams.set('actionMapping', actionMapping)

  Object.entries(values).forEach(([key, rawValue]) => {
    const value = rawValue.trim()
    if (!value || key === 'tenureTypes' || key === 'timberMarks') {
      return
    }

    if (key === 'clientNumber') {
      url.searchParams.set(key, normalizeClientNumber(value))
      return
    }

    if (key === 'forestFileId' || key === 'timberMark') {
      url.searchParams.set(key, normalizeUppercase(value))
      return
    }

    if (key === 'region' || key === 'orgUnitNumber') {
      splitCsv(value).forEach((entry) => url.searchParams.append(key, entry))
      return
    }

    url.searchParams.set(key, value)
  })

  const tenureTypes = splitCsv(values.tenureTypes ?? '').slice(0, 6)
  const timberMarks = splitCsv(values.timberMarks ?? '').slice(0, 6)

  tenureTypes.forEach((value, index) => {
    url.searchParams.set(`tenureType${index + 1}`, normalizeUppercase(value))
  })

  timberMarks.forEach((value, index) => {
    url.searchParams.set(`timberMark${index + 1}`, normalizeUppercase(value))
  })

  return url.toString()
}

const buildReportPayload = (
  values: Record<string, string>,
  actionMapping: string,
): Record<string, unknown> => {
  const payload: Record<string, unknown> = {
    actionMapping,
  }

  Object.entries(values).forEach(([key, rawValue]) => {
    const value = rawValue.trim()
    if (!value || key === 'tenureTypes' || key === 'timberMarks') {
      return
    }

    if (key === 'clientNumber') {
      payload[key] = normalizeClientNumber(value)
      return
    }

    if (key === 'forestFileId' || key === 'timberMark') {
      payload[key] = normalizeUppercase(value)
      return
    }

    if (key === 'region' || key === 'orgUnitNumber') {
      payload[key] = splitCsv(value)
      return
    }

    payload[key] = value
  })

  const tenureTypes = splitCsv(values.tenureTypes ?? '')
    .slice(0, 6)
    .map(normalizeUppercase)
  const timberMarks = splitCsv(values.timberMarks ?? '')
    .slice(0, 6)
    .map(normalizeUppercase)

  if (tenureTypes.length > 0) {
    payload.tenureTypes = tenureTypes
  }
  if (timberMarks.length > 0) {
    payload.timberMarks = timberMarks
  }

  tenureTypes.forEach((value, index) => {
    payload[`tenureType${index + 1}`] = value
  })

  timberMarks.forEach((value, index) => {
    payload[`timberMark${index + 1}`] = value
  })

  return payload
}

const shouldFallbackToLegacy = (error: unknown): boolean => {
  const status = (error as any)?.response?.status
  if (typeof status === 'number') {
    return FALLBACK_STATUSES.has(status)
  }
  return true
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

const getDefaultFilename = (reportId: string, values: Record<string, string>): string => {
  const outputFormat = values.outputFormat?.trim().toLowerCase() === 'csv' ? 'csv' : 'pdf'
  return `lexis-${reportId}.${outputFormat}`
}

const extractFilename = (
  headers: RawAxiosResponseHeaders | AxiosResponseHeaders,
  reportId: string,
  values: Record<string, string>,
): string => {
  const contentDisposition = getResponseHeaderValue(headers, 'content-disposition')
  if (!contentDisposition) {
    return getDefaultFilename(reportId, values)
  }

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i)
  if (utf8Match && utf8Match[1]) {
    try {
      return decodeURIComponent(utf8Match[1])
    } catch {
      // ignore and continue to fallback parser
    }
  }

  const regularMatch = contentDisposition.match(/filename="?([^";]+)"?/i)
  if (regularMatch && regularMatch[1]) {
    return regularMatch[1]
  }

  return getDefaultFilename(reportId, values)
}

export const runReport = async (request: RunReportRequest): Promise<RunReportResult> => {
  const legacyUrl = buildLegacyReportUrl(request.legacyPath, request.values, request.actionMapping)

  try {
    const requestConfig: AxiosRequestConfig<Record<string, unknown>> = {
      responseType: 'blob',
      headers: {
        Accept: 'application/octet-stream',
        'Content-Type': 'application/json',
      },
    }

    const response = await apiService
      .getAxiosInstance()
      .post<Blob>(
        buildModernReportEndpoint(request.reportId),
        buildReportPayload(request.values, request.actionMapping),
        requestConfig,
      )

    const contentType =
      getResponseHeaderValue(response.headers, 'content-type') ?? 'application/octet-stream'
    const filename = extractFilename(response.headers, request.reportId, request.values)

    return {
      source: 'api',
      blob: response.data,
      filename,
      contentType,
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
