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
  blob?: Blob
  filename: string
  contentType: string
  downloaded?: boolean
  cancelled?: boolean
}

type ReportApiPayload = {
  parameters: Record<string, string>
  format: string
}

type ReportFileHandle = {
  createWritable: () => Promise<WritableStream<Uint8Array>>
}

type ReportSavePickerWindow = Window & {
  showSaveFilePicker?: (options?: { suggestedName?: string }) => Promise<ReportFileHandle>
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
const REPORT_FILENAME_BASES: Readonly<Record<string, string>> = {
  applicationReport: 'application-report',
  approvedExemptionReport: 'approved-exemption',
  biweeklyListing: 'advertising-list',
  exemptionReport: 'exemption-report',
  feeReport: 'fee-report',
  offerReport: 'offer-report',
  permitLedgerReport: 'permit-ledger-report',
  permitReport: 'permit',
  speciesGradeReport: 'species-and-grade-report',
  teacReport: 'teac-package-report',
  tenureReport: 'tenure-analysis-report',
  transportReport: 'transport-report',
}
const LEGACY_CSV_FILENAME_BASES: Readonly<Record<string, string>> = {
  applicationReport: 'applicationLedger',
  biweeklyListing: 'biweeklyListing',
  exemptionReport: 'exemptionLedger',
  feeReport: 'feeReport',
  offerReport: 'offerReport',
  permitLedgerReport: 'permitLedger',
  speciesGradeReport: 'speciesGradeReport',
  teacReport: 'TeacReport',
  transportReport: 'transportReport',
}

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
    return 'XLS'
  }
  if (outputFormat === 'CSV') {
    return 'CSV'
  }
  if (outputFormat === 'XLS' || outputFormat === 'XLSX') {
    return outputFormat
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
  const filenameBase = REPORT_FILENAME_BASES[reportId] ?? `lexis-${reportId}`
  return `${filenameBase}.${resolveReportExtension(reportId, values, actionMapping)}`
}

const getVancouverDate = (): string => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Vancouver',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

const getSuggestedFilename = (
  reportId: string,
  values: Record<string, string>,
  actionMapping?: string,
): string => {
  const format = resolveReportFormat(reportId, values, actionMapping)
  const legacyCsvBase = LEGACY_CSV_FILENAME_BASES[reportId]
  if (format === 'CSV' && legacyCsvBase) {
    return `${legacyCsvBase}${getVancouverDate()}.csv`
  }
  return getDefaultFilename(reportId, values, actionMapping)
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

const isReadableStream = (payload: unknown): payload is ReadableStream<Uint8Array> =>
  Boolean(
    payload &&
    typeof payload === 'object' &&
    typeof (payload as ReadableStream<Uint8Array>).getReader === 'function',
  )

const getReportSavePicker = ():
  | ((options?: { suggestedName?: string }) => Promise<ReportFileHandle>)
  | undefined => {
  const picker = (window as ReportSavePickerWindow).showSaveFilePicker
  return typeof picker === 'function' ? picker.bind(window) : undefined
}

const isPickerCancellation = (error: unknown): boolean =>
  Boolean(error && typeof error === 'object' && (error as { name?: unknown }).name === 'AbortError')

const readErrorPayload = async (
  payload: unknown,
  responseContentType?: string,
): Promise<string> => {
  if (
    payload &&
    typeof payload === 'object' &&
    !(payload instanceof Blob) &&
    !isReadableStream(payload)
  ) {
    return extractErrorMessage(payload)
  }

  let text: string
  let blobContentType: string | undefined
  try {
    if (payload instanceof Blob) {
      text = (await payload.text()).trim()
      blobContentType = payload.type
    } else if (isReadableStream(payload)) {
      text = (await new Response(payload).text()).trim()
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
  const defaultFilename = getDefaultFilename(
    request.reportId,
    request.values,
    request.actionMapping,
  )
  const savePicker = getReportSavePicker()
  let fileHandle: ReportFileHandle | undefined
  if (savePicker) {
    try {
      fileHandle = await savePicker({
        suggestedName: getSuggestedFilename(
          request.reportId,
          request.values,
          request.actionMapping,
        ),
      })
    } catch (error) {
      if (isPickerCancellation(error)) {
        return {
          source: 'api',
          filename: defaultFilename,
          contentType: 'application/octet-stream',
          downloaded: false,
          cancelled: true,
        }
      }
      throw error
    }
  }

  const requestConfig: AxiosRequestConfig<ReportApiPayload> = {
    ...(fileHandle ? { adapter: 'fetch', responseType: 'stream' } : { responseType: 'blob' }),
    headers: {
      Accept: 'application/octet-stream',
      'Content-Type': 'application/json',
    },
  }

  let response
  try {
    response = await apiService
      .getAxiosInstance()
      .post<
        Blob | ReadableStream<Uint8Array>
      >(buildModernReportEndpoint(request.reportId), buildReportPayload(request.reportId, request.values, request.actionMapping), requestConfig)
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

  if (response.status === 204 || (response.data instanceof Blob && response.data.size === 0)) {
    throw new ReportRequestError('No report data matched the selected criteria.')
  }

  const contentType =
    getResponseHeaderValue(response.headers, 'content-type') ?? 'application/octet-stream'
  const filename = extractResponseFilename(response.headers, defaultFilename)

  if (fileHandle) {
    const writable = await fileHandle.createWritable()
    if (isReadableStream(response.data)) {
      await response.data.pipeTo(writable)
    } else if (response.data instanceof Blob) {
      await response.data.stream().pipeTo(writable)
    } else {
      await writable.abort('Report response was not streamable.')
      throw new ReportRequestError(DEFAULT_REPORT_ERROR_MESSAGE)
    }
    return {
      source: 'api',
      filename,
      contentType,
      downloaded: true,
    }
  }

  return {
    source: 'api',
    blob: response.data as Blob,
    filename,
    contentType,
    downloaded: false,
  }
}
