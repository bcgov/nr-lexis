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

const SCHEDULE_CACHE_TTL_MS = 30_000

const normalizeScheduleRow = (row: unknown): ExportScheduleRow => {
  const source = recordOrEmpty(row)
  const applicationCount = Number(asString(source.applicationCount)) || 0
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

export const fetchExportSchedules = async (): Promise<ExportScheduleRow[]> => {
  const response = await apiService.getCachedResponse<unknown>(
    '/lexis/admin/schedules',
    undefined,
    {
      cacheKey: 'admin-schedules:upcoming',
      ttlMs: SCHEDULE_CACHE_TTL_MS,
    },
  )
  const rows = parsePayloadArray(response.data)
  if (!rows) {
    throw new Error('Export schedule response is not a list.')
  }
  return rows.map(normalizeScheduleRow)
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
