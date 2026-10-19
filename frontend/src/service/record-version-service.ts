import apiService from '@/service/api-service'
import { RECORD_VERSION_HEADER, type OptimisticRecordType } from '@/service/optimistic-conflict'

/**
 * The server time (milliseconds since the epoch) at which this record's current version was
 * loaded, or undefined when the server did not report it. A conflict message names the user and
 * time of a save only when it came after this moment, so both sides are the server's clock.
 */
export const recordVersionLoadedAt = (
  recordType: OptimisticRecordType,
  recordId: string,
): number | undefined => apiService.recordVersionLoadedAt(recordType, recordId)

const requireRecordVersion = (headers: Record<string, unknown>): string => {
  const headerValue = headers[RECORD_VERSION_HEADER] ?? headers[RECORD_VERSION_HEADER.toLowerCase()]
  const recordVersion = typeof headerValue === 'string' ? headerValue.trim() : ''
  if (!recordVersion) {
    throw new Error('The current record version could not be loaded.')
  }
  return recordVersion
}

const fetchCurrentRecordVersion = async (
  recordType: OptimisticRecordType,
  recordId: string,
  path: string,
  params: Record<string, string>,
): Promise<string> => {
  const response = await apiService.getAxiosInstance().get<unknown>(path, {
    headers: { 'Cache-Control': 'no-cache' },
    params,
  })
  const recordVersion = requireRecordVersion(response.headers)
  apiService.markRecordVersionLoaded(recordType, recordId, response.headers)
  return recordVersion
}

export const fetchCurrentApplicationRecordVersion = async (
  applicationNumber: string,
): Promise<string> => {
  const recordId = applicationNumber.trim()
  return fetchCurrentRecordVersion('application', recordId, '/lexis/record-versions/application', {
    applicationNumber: recordId,
  })
}

export const fetchCurrentExemptionRecordVersion = async (
  exemptionNumber: string,
): Promise<string> => {
  const recordId = exemptionNumber.trim()
  return fetchCurrentRecordVersion('exemption', recordId, '/lexis/record-versions/exemption', {
    exemptionNumber: recordId,
  })
}
