import apiService from '@/service/api-service'
import { RECORD_VERSION_HEADER } from '@/service/optimistic-conflict'

const requireRecordVersion = (headers: Record<string, unknown>): string => {
  const headerValue = headers[RECORD_VERSION_HEADER] ?? headers[RECORD_VERSION_HEADER.toLowerCase()]
  const recordVersion = typeof headerValue === 'string' ? headerValue.trim() : ''
  if (!recordVersion) {
    throw new Error('The current record version could not be loaded.')
  }
  return recordVersion
}

const fetchCurrentRecordVersion = async (
  path: string,
  params: Record<string, string>,
): Promise<string> => {
  const response = await apiService.getAxiosInstance().get<unknown>(path, {
    headers: { 'Cache-Control': 'no-cache' },
    params,
  })
  return requireRecordVersion(response.headers)
}

export const fetchCurrentApplicationRecordVersion = async (
  applicationNumber: string,
): Promise<string> =>
  fetchCurrentRecordVersion('/lexis/record-versions/application', {
    applicationNumber: applicationNumber.trim(),
  })

export const fetchCurrentExemptionRecordVersion = async (
  exemptionNumber: string,
): Promise<string> =>
  fetchCurrentRecordVersion('/lexis/record-versions/exemption', {
    exemptionNumber: exemptionNumber.trim(),
  })
