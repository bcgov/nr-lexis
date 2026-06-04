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

type ReportApiPayload = {
  parameters: Record<string, string>
  format: string
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

const shouldNormalizeLegacyClientNumber = (reportId: string): boolean =>
  ['offerReport', 'permitLedgerReport', 'tenureReport'].includes(reportId)

const normalizeUppercase = (value: string): string => value.trim().toUpperCase()

const LEGACY_TENURE_FIELD_LIMIT = 6

const compactLegacyIndexedValues = (
  values: Record<string, string>,
  prefix: 'tenureType' | 'timberMark',
  csvFallbackKey: 'tenureTypes' | 'timberMarks',
): string[] => {
  const indexedValues = Array.from(
    { length: LEGACY_TENURE_FIELD_LIMIT },
    (_, index) => values[`${prefix}${index + 1}`] ?? '',
  )
  const compactedIndexedValues = indexedValues
    .map((value) => value.trim())
    .filter((value) => value.length > 0)

  if (compactedIndexedValues.length > 0) {
    return compactedIndexedValues.slice(0, LEGACY_TENURE_FIELD_LIMIT).map(normalizeUppercase)
  }

  return splitCsv(values[csvFallbackKey] ?? '')
    .slice(0, LEGACY_TENURE_FIELD_LIMIT)
    .map(normalizeUppercase)
}

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

const resolveReportFormat = (
  reportId: string,
  values: Record<string, string>,
  actionMapping?: string,
): string => {
  const normalizedActionMapping = actionMapping?.trim().toLowerCase() ?? ''
  if (normalizedActionMapping.includes('csv')) {
    return 'CSV'
  }
  if (normalizedActionMapping.includes('pdf')) {
    return 'PDF'
  }

  const outputFormat = values.outputFormat?.trim().toUpperCase()
  if (reportId === 'tenureReport' && outputFormat === 'CSV') {
    return 'XLS'
  }
  if (outputFormat === 'CSV') {
    return 'CSV'
  }
  if (outputFormat === 'XLS' || outputFormat === 'XLSX') {
    return 'XLS'
  }
  if (outputFormat === 'PDF') {
    return 'PDF'
  }
  return 'PDF'
}

const resolveReportExtension = (
  reportId: string,
  values: Record<string, string>,
  actionMapping?: string,
): string => {
  const format = resolveReportFormat(reportId, values, actionMapping)
  return format === 'XLS' ? 'xlsx' : format.toLowerCase()
}

const buildReportPayload = (
  reportId: string,
  values: Record<string, string>,
  actionMapping?: string,
): ReportApiPayload => {
  const parameters: Record<string, string> = {}

  if (shouldIncludeActionMapping() && actionMapping && actionMapping.trim().length > 0) {
    parameters.legacyActionMapping = actionMapping.trim()
  }

  Object.entries(values).forEach(([key, rawValue]) => {
    const value = rawValue.trim()
    if (
      !value ||
      key === 'outputFormat' ||
      key === 'tenureTypes' ||
      key === 'timberMarks' ||
      /^tenureType[1-6]$/.test(key) ||
      /^timberMark[1-6]$/.test(key)
    ) {
      return
    }

    if (key === 'clientNumber' && shouldNormalizeLegacyClientNumber(reportId)) {
      parameters[key] = normalizeClientNumber(value)
      return
    }

    if (key === 'forestFileId' || key === 'timberMark') {
      parameters[key] = normalizeUppercase(value)
      return
    }

    if (key === 'region' || key === 'orgUnitNumber') {
      parameters[key] = splitCsv(value).join(',')
      return
    }

    parameters[key] = value
  })

  const tenureTypes = compactLegacyIndexedValues(values, 'tenureType', 'tenureTypes')
  const timberMarks = compactLegacyIndexedValues(values, 'timberMark', 'timberMarks')

  tenureTypes.forEach((value, index) => {
    parameters[`tenureType${index + 1}`] = value
  })

  timberMarks.forEach((value, index) => {
    parameters[`timberMark${index + 1}`] = value
  })

  return {
    parameters,
    format: resolveReportFormat(reportId, values, actionMapping),
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

const getDefaultFilename = (
  reportId: string,
  values: Record<string, string>,
  actionMapping?: string,
): string => {
  return `lexis-${reportId}.${resolveReportExtension(reportId, values, actionMapping)}`
}

const extractFilename = (
  headers: RawAxiosResponseHeaders | AxiosResponseHeaders,
  reportId: string,
  values: Record<string, string>,
  actionMapping?: string,
): string => {
  const contentDisposition = getResponseHeaderValue(headers, 'content-disposition')
  if (!contentDisposition) {
    return getDefaultFilename(reportId, values, actionMapping)
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

  return getDefaultFilename(reportId, values, actionMapping)
}

export const runReport = async (request: RunReportRequest): Promise<RunReportResult> => {
  const requestConfig: AxiosRequestConfig<ReportApiPayload> = {
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
      buildReportPayload(request.reportId, request.values, request.actionMapping),
      requestConfig,
    )

  const contentType =
    getResponseHeaderValue(response.headers, 'content-type') ?? 'application/octet-stream'
  const filename = extractFilename(
    response.headers,
    request.reportId,
    request.values,
    request.actionMapping,
  )

  return {
    source: 'api',
    blob: response.data,
    filename,
    contentType,
  }
}
