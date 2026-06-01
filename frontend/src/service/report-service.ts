import type { AxiosRequestConfig, AxiosResponseHeaders, RawAxiosResponseHeaders } from 'axios'
import { env } from '@/env'
import apiService from '@/service/api-service'

export type RunReportRequest = {
  reportId: string
  actionMapping?: string
  values: Record<string, string>
}

export type RunReportResult = {
  source: 'api'
  blob: Blob
  filename: string
  contentType: string
}

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

const getModernReportApiBasePath = (): string => {
  const configured = (env.VITE_LEXIS_REPORT_API_BASE ?? '/lexis/reports').trim()
  if (!configured) {
    return '/lexis/reports'
  }
  return configured.endsWith('/') ? configured.slice(0, -1) : configured
}

const shouldIncludeActionMapping = (): boolean => {
  const configured = (env.VITE_LEXIS_REPORT_INCLUDE_ACTION_MAPPING ?? 'true')
    .toString()
    .trim()
    .toLowerCase()
  return configured !== '0' && configured !== 'false' && configured !== 'no'
}

const buildModernReportEndpoint = (reportId: string): string => {
  const basePath = getModernReportApiBasePath()
  return `${basePath}/${encodeURIComponent(reportId)}`
}

const buildReportPayload = (
  values: Record<string, string>,
  actionMapping?: string,
): Record<string, unknown> => {
  const payload: Record<string, unknown> = {}

  if (shouldIncludeActionMapping() && actionMapping && actionMapping.trim().length > 0) {
    payload.actionMapping = actionMapping.trim()
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
  }
}
