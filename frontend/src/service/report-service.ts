import axios, { type AxiosRequestConfig } from 'axios'
import { env } from '@/env'
import apiService from '@/service/api-service'
import { extractResponseFilename, getResponseHeaderValue } from '@/service/http-response-utils'
import { getConfiguredBasePath } from '@/service/service-config-utils'

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

const DEFAULT_REPORT_ERROR_MESSAGE = 'Unable to generate report. Check values and try again.'

export class ReportRequestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ReportRequestError'
  }
}

const splitCsv = (value: string): string[] =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)

const normalizeClientNumber = (value: string): string => {
  const trimmed = value.trim()
  if (!trimmed || !/^[0-9.]+$/.test(trimmed)) {
    return trimmed
  }

  return trimmed.padStart(8, '0')
}

const shouldNormalizeLegacyClientNumber = (reportId: string): boolean =>
  ['offerReport', 'permitLedgerReport', 'tenureReport'].includes(reportId)

const normalizeUppercase = (value: string): string => value.trim().toUpperCase()

const shouldNormalizeLegacyUppercase = (reportId: string, key: string): boolean =>
  (reportId === 'speciesGradeReport' && (key === 'timberMark' || key === 'forestFileId')) ||
  (reportId === 'permitLedgerReport' && key === 'timberMark') ||
  (reportId === 'tenureReport' && key === 'forestFileId')

const LEGACY_TENURE_FIELD_LIMIT = 6
const PDF_ONLY_PROMPT_REPORT_IDS = new Set(['approvedExemptionReport', 'permitReport'])

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
  return getConfiguredBasePath(env.VITE_LEXIS_REPORT_API_BASE, '/lexis/reports')
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
  if (PDF_ONLY_PROMPT_REPORT_IDS.has(reportId)) {
    return 'PDF'
  }

  const normalizedActionMapping = actionMapping?.trim().toLowerCase() ?? ''
  if (normalizedActionMapping.includes('csv')) {
    return 'CSV'
  }
  if (normalizedActionMapping.includes('pdf')) {
    return 'PDF'
  }

  const outputFormat = values.outputFormat?.trim().toUpperCase()
  if (reportId === 'tenureReport' && outputFormat === 'CSV') {
    return 'XLSX'
  }
  if (outputFormat === 'CSV') {
    return 'CSV'
  }
  if (outputFormat === 'XLS' || outputFormat === 'XLSX') {
    return 'XLSX'
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
  return format.toLowerCase()
}

const buildReportPayload = (
  reportId: string,
  values: Record<string, string>,
  actionMapping?: string,
): ReportApiPayload => {
  const parameters: Record<string, string> = {}

  if (actionMapping && actionMapping.trim().length > 0) {
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

    if (shouldNormalizeLegacyUppercase(reportId, key)) {
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

const getDefaultFilename = (
  reportId: string,
  values: Record<string, string>,
  actionMapping?: string,
): string => {
  return `lexis-${reportId}.${resolveReportExtension(reportId, values, actionMapping)}`
}

const extractErrorMessage = (payload: unknown): string => {
  if (!payload || typeof payload !== 'object') {
    return ''
  }

  const problem = payload as Record<string, unknown>
  for (const field of ['detail', 'message', 'title']) {
    const value = problem[field]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }
  return ''
}

const isJsonContentType = (contentType: string | undefined): boolean => {
  const normalized = contentType?.split(';', 1)[0]?.trim().toLowerCase() ?? ''
  return normalized === 'application/json' || normalized.endsWith('+json')
}

const readErrorPayload = async (
  payload: unknown,
  responseContentType?: string,
): Promise<string> => {
  if (payload && typeof payload === 'object' && !(payload instanceof Blob)) {
    return extractErrorMessage(payload)
  }

  let text: string
  let blobContentType: string | undefined
  try {
    if (payload instanceof Blob) {
      text = (await payload.text()).trim()
      blobContentType = payload.type
    } else if (typeof payload === 'string') {
      text = payload.trim()
    } else {
      return ''
    }
  } catch {
    return ''
  }

  if (!text) {
    return ''
  }

  const looksLikeJson = text.startsWith('{') || text.startsWith('[')
  if (
    isJsonContentType(responseContentType) ||
    isJsonContentType(blobContentType) ||
    looksLikeJson
  ) {
    try {
      return extractErrorMessage(JSON.parse(text))
    } catch {
      return ''
    }
  }

  return text
}

export const runReport = async (request: RunReportRequest): Promise<RunReportResult> => {
  const requestConfig: AxiosRequestConfig<ReportApiPayload> = {
    responseType: 'blob',
    headers: {
      Accept: 'application/octet-stream',
      'Content-Type': 'application/json',
    },
  }

  let response
  try {
    response = await apiService
      .getAxiosInstance()
      .post<Blob>(
        buildModernReportEndpoint(request.reportId),
        buildReportPayload(request.reportId, request.values, request.actionMapping),
        requestConfig,
      )
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const responseContentType = error.response?.headers
        ? (getResponseHeaderValue(error.response.headers, 'content-type') ?? undefined)
        : undefined
      const message = await readErrorPayload(error.response?.data, responseContentType)
      throw new ReportRequestError(message || DEFAULT_REPORT_ERROR_MESSAGE)
    }
    throw error
  }

  if (response.status === 204 || response.data.size === 0) {
    throw new ReportRequestError('No report data matched the selected criteria.')
  }

  const contentType =
    getResponseHeaderValue(response.headers, 'content-type') ?? 'application/octet-stream'
  const filename = extractResponseFilename(
    response.headers,
    getDefaultFilename(request.reportId, request.values, request.actionMapping),
  )

  return {
    source: 'api',
    blob: response.data,
    filename,
    contentType,
  }
}
