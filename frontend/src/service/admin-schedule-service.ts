import apiService from '@/service/api-service'
import { parsePayloadArray, payloadValueAsString as asString } from '@/service/payload-utils'
import { recordOrEmpty } from '@/utils/record'

export type ExportScheduleRow = {
  exportScheduleId: string
  advertisingDate: string
  applicationReceiptDate: string
  offerReceiptDate: string
  offerEndDate: string
  offerWithdrawalDate: string
  teacMeetingDate: string
  applicationCount: number
  mutable: boolean
  provincialApplicationCount?: number
}

export type ExportScheduleCreateRequest = {
  advertisingDate: string
  applicationReceiptDate: string
  offerReceiptDate: string
  offerEndDate: string
  offerWithdrawalDate: string
  teacMeetingDate: string
}

export type ExportScheduleMutationResult = {
  success: boolean
  message: string
  schedule: ExportScheduleRow | null
}

export type ExportSchedulePage = {
  rows: ExportScheduleRow[]
  total: number
  page: number
  size: number
}

export type ExportScheduleSortField =
  | 'exportScheduleId'
  | 'advertisingDate'
  | 'applicationReceiptDate'
  | 'offerReceiptDate'
  | 'offerEndDate'
  | 'offerWithdrawalDate'
  | 'teacMeetingDate'
  | 'applicationCount'

export type ExportScheduleSortDirection = 'asc' | 'desc'

const SCHEDULE_CACHE_TTL_MS = 30_000
const DEFAULT_ADMIN_PAGE = 0
const DEFAULT_ADMIN_PAGE_SIZE = 100

const normalizeScheduleRow = (row: unknown): ExportScheduleRow => {
  const source = recordOrEmpty(row)
  const applicationCount = Number(asString(source.applicationCount)) || 0
  const provincialApplicationCount =
    source.provincialApplicationCount === undefined
      ? applicationCount
      : Number(asString(source.provincialApplicationCount)) || 0
  return {
    exportScheduleId: asString(source.exportScheduleId || source.id),
    advertisingDate: asString(source.advertisingDate),
    applicationReceiptDate: asString(source.applicationReceiptDate),
    offerReceiptDate: asString(source.offerReceiptDate),
    offerEndDate: asString(source.offerEndDate),
    offerWithdrawalDate: asString(source.offerWithdrawalDate),
    teacMeetingDate: asString(source.teacMeetingDate),
    applicationCount,
    mutable: source.mutable === undefined ? applicationCount === 0 : source.mutable === true,
    provincialApplicationCount,
  }
}

const normalizeMutationResult = (payload: unknown): ExportScheduleMutationResult => {
  const source = recordOrEmpty(payload)
  const scheduleSource = source.schedule
  return {
    success: source.success === true,
    message: asString(source.message),
    schedule: scheduleSource ? normalizeScheduleRow(scheduleSource) : null,
  }
}

const normalizeSchedulePage = (
  payload: unknown,
  defaultPage: number,
  defaultSize: number,
): ExportSchedulePage => {
  const source = recordOrEmpty(payload)
  const rows = parsePayloadArray(payload)
  if (!rows) {
    throw new Error('Export schedule response is not a list.')
  }
  const total = Number(source.total ?? rows.length)
  const page = Number(source.page ?? defaultPage)
  const size = Number(source.size ?? defaultSize)
  return {
    rows: rows.map(normalizeScheduleRow),
    total: Number.isFinite(total) ? total : rows.length,
    page: Number.isFinite(page) ? page : defaultPage,
    size: Number.isFinite(size) ? size : defaultSize,
  }
}

export const fetchExportSchedulePage = async (
  page = DEFAULT_ADMIN_PAGE,
  size = DEFAULT_ADMIN_PAGE_SIZE,
  sortField: ExportScheduleSortField = 'advertisingDate',
  sortDirection: ExportScheduleSortDirection = 'desc',
): Promise<ExportSchedulePage> => {
  const response = await apiService.getCachedResponse<unknown>(
    '/lexis/admin/schedules',
    {
      params: {
        page,
        size,
        sortField,
        sortDirection,
      },
    },
    {
      cacheKey: `admin-schedules:${sortField}:${sortDirection}:${page}:${size}`,
      ttlMs: SCHEDULE_CACHE_TTL_MS,
    },
  )
  return normalizeSchedulePage(response.data, page, size)
}

export const fetchExportSchedules = async (): Promise<ExportScheduleRow[]> => {
  return (await fetchExportSchedulePage()).rows
}

export const createExportSchedule = async (
  request: ExportScheduleCreateRequest,
): Promise<ExportScheduleMutationResult> => {
  const response = await apiService.getAxiosInstance().post('/lexis/admin/schedules', {
    advertisingDate: request.advertisingDate,
    applicationReceiptDate: request.applicationReceiptDate,
    offerReceiptDate: request.offerReceiptDate,
    offerEndDate: request.offerEndDate,
    offerWithdrawalDate: request.offerWithdrawalDate,
    teacMeetingDate: request.teacMeetingDate,
  })
  return normalizeMutationResult(response.data)
}

export const updateExportSchedule = async (
  exportScheduleId: string,
  request: ExportScheduleCreateRequest,
): Promise<ExportScheduleMutationResult> => {
  const response = await apiService
    .getAxiosInstance()
    .put(`/lexis/admin/schedules/${encodeURIComponent(exportScheduleId)}`, {
      advertisingDate: request.advertisingDate,
      applicationReceiptDate: request.applicationReceiptDate,
      offerReceiptDate: request.offerReceiptDate,
      offerEndDate: request.offerEndDate,
      offerWithdrawalDate: request.offerWithdrawalDate,
      teacMeetingDate: request.teacMeetingDate,
    })
  return normalizeMutationResult(response.data)
}

export const deleteExportSchedule = async (
  exportScheduleId: string,
): Promise<ExportScheduleMutationResult> => {
  const response = await apiService
    .getAxiosInstance()
    .delete(`/lexis/admin/schedules/${encodeURIComponent(exportScheduleId)}`)
  return normalizeMutationResult(response.data)
}
