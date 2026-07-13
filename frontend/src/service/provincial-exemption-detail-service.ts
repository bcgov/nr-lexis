import apiService from '@/service/api-service'
import {
  documentValueAsBoolean as asBoolean,
  documentValueAsString as asString,
  documentValueAsStringArray as asStringArray,
} from '@/service/document-service-utils'
import { LEGACY_FORM_CONTENT_TYPE, toUrlEncodedParams } from '@/service/legacy-form-utils'
import { isRecord, recordOrEmpty } from '@/utils/record'

export type ExemptionApplicationRow = {
  applicationNumber: string
  requestedVolume: string
  scaleVolume: string
  locked: boolean
  jurisdiction: string
}

export type ExemptionApplicationsResult = {
  applications: ExemptionApplicationRow[]
  containsUnmanu: boolean
  ownerNumber: string
}

export type ExemptionPermitRow = {
  permitNumber: string
  permitVolume: string
  permitStatus: string
  permitIssueDate: string
  canViewPermit: boolean
}

export type ExemptionBlanketOicTotals = {
  requestedVolume: string
  completedVolume: string
}

export type ExemptionEditContext = {
  rateOverrideEnabled: boolean
  fixedFeeRate: string
  regionNumbers: string[]
  locked: boolean
  lockMessage: string
}

export type ExemptionMutationResult = {
  success: boolean
  message: string
  exemptionNumber: string
  errors: string[]
  warnings: string[]
}

export type ExemptionApprovalResult = {
  success: boolean
  valid: boolean
  sendGrid: [string, string][]
  errorMessage: string
  errors: string[]
  warnings: string[]
}

export type ExemptionEmailResult = {
  success: boolean
  message: string
}

export type UpdateExemptionRequest = {
  exemptionNumber: string
  approvedVolume: string
  approvalDate: string
  expiryDate: string
  otherConditions: string
  exemptionTypeCode: string
  exemptionStatusCode: string
  manageFeeRate: boolean
  enableRateOverride: boolean
  feeRate: string
  regionNumbers: string[]
}

const postForm = async (path: string, values: Record<string, string>): Promise<unknown> => {
  const response = await apiService.getAxiosInstance().post(path, toUrlEncodedParams(values), {
    headers: { 'Content-Type': LEGACY_FORM_CONTENT_TYPE },
  })
  return response.data
}

export const fetchExemptionApplications = async (
  exemptionNumber: string,
): Promise<ExemptionApplicationsResult> => {
  const response = await apiService
    .getAxiosInstance()
    .get<unknown>('/lexis/rpc/exemption-details/applications', {
      params: { exemptionNumber: exemptionNumber.trim() },
    })
  const payload = recordOrEmpty(response.data)
  const rawApplications = Array.isArray(payload.applications) ? payload.applications : []
  return {
    applications: rawApplications.map((item) => {
      const row = recordOrEmpty(item)
      return {
        applicationNumber: asString(row.applicationNumber),
        requestedVolume: asString(row.requestedVolume),
        scaleVolume: asString(row.scaleVolume),
        locked: asBoolean(row.locked),
        jurisdiction: asString(row.jurisdiction),
      }
    }),
    containsUnmanu: asBoolean(payload.containsUnmanu),
    ownerNumber: asString(payload.ownerNumber),
  }
}

export const fetchExemptionPermits = async (
  exemptionNumber: string,
): Promise<ExemptionPermitRow[]> => {
  const response = await apiService
    .getAxiosInstance()
    .get<unknown>('/lexis/rpc/exemption-details/permits', {
      params: { exemptionNumber: exemptionNumber.trim() },
    })
  if (!Array.isArray(response.data)) {
    throw new Error('Unexpected exemption permit payload.')
  }

  return response.data.map((item) => {
    if (
      !isRecord(item) ||
      !asString(item.permitNumber) ||
      typeof item.canViewPermit !== 'boolean'
    ) {
      throw new Error('Unexpected exemption permit payload.')
    }

    return {
      permitNumber: asString(item.permitNumber),
      permitVolume: asString(item.permitVolume),
      permitStatus: asString(item.permitStatus),
      permitIssueDate: asString(item.permitIssueDate),
      canViewPermit: item.canViewPermit,
    }
  })
}

export const fetchExemptionBlanketOicTotals = async (
  exemptionNumber: string,
): Promise<ExemptionBlanketOicTotals> => {
  const response = await apiService
    .getAxiosInstance()
    .get<unknown>('/lexis/rpc/exemption-details/blanket-oic-totals', {
      params: { exemptionNumber: exemptionNumber.trim() },
    })
  if (
    !isRecord(response.data) ||
    !Object.hasOwn(response.data, 'requestedVolume') ||
    !Object.hasOwn(response.data, 'completedVolume')
  ) {
    throw new Error('Unexpected Blanket OIC totals payload.')
  }

  return {
    requestedVolume: asString(response.data.requestedVolume),
    completedVolume: asString(response.data.completedVolume),
  }
}

export const fetchExemptionEditContext = async (
  exemptionNumber: string,
): Promise<ExemptionEditContext> => {
  const response = await apiService
    .getAxiosInstance()
    .get<unknown>('/lexis/rpc/exemption-details/edit-context', {
      params: { exemptionNumber: exemptionNumber.trim() },
    })
  if (
    !isRecord(response.data) ||
    !Object.hasOwn(response.data, 'rateOverrideEnabled') ||
    !Array.isArray(response.data.regionNumbers) ||
    !Object.hasOwn(response.data, 'locked')
  ) {
    throw new Error('Unexpected exemption edit context payload.')
  }
  const payload = response.data
  return {
    rateOverrideEnabled: asBoolean(payload.rateOverrideEnabled),
    fixedFeeRate: asString(payload.fixedFeeRate),
    regionNumbers: asStringArray(payload.regionNumbers),
    locked: asBoolean(payload.locked),
    lockMessage: asString(payload.lockMessage),
  }
}

export const releaseExemptionEditLock = async (exemptionNumber: string): Promise<void> => {
  try {
    await apiService.getAxiosInstance().post('/lexis/rpc/exemption-details/release-lock', null, {
      params: { exemptionNumber: exemptionNumber.trim() },
    })
  } catch {
    // Best-effort cleanup only; the server expires abandoned locks.
  }
}

const parseLinkResult = (payload: unknown): ExemptionMutationResult => {
  const value = recordOrEmpty(payload)
  const success = asBoolean(value.success)
  const errors = asStringArray(value.errors)
  return {
    success,
    message: success ? 'Application association updated.' : errors.join(' '),
    exemptionNumber: '',
    errors,
    warnings: [],
  }
}

export const addApplicationToExemption = async (
  exemptionNumber: string,
  applicationNumber: string,
): Promise<ExemptionMutationResult> => {
  const payload = await postForm('/lexis/rpc/exemption-details/application', {
    exemptionNumber: exemptionNumber.trim(),
    applicationNumber: applicationNumber.trim(),
  })
  return parseLinkResult(payload)
}

export const removeApplicationFromExemption = async (
  exemptionNumber: string,
  applicationNumber: string,
): Promise<ExemptionMutationResult> => {
  const response = await apiService
    .getAxiosInstance()
    .delete<unknown>('/lexis/rpc/exemption-details/application', {
      params: {
        exemptionNumber: exemptionNumber.trim(),
        applicationNumber: applicationNumber.trim(),
      },
    })
  return parseLinkResult(response.data)
}

export const updateExemption = async (
  request: UpdateExemptionRequest,
): Promise<ExemptionMutationResult> => {
  const params = new URLSearchParams()
  params.append('exemptionNumber', request.exemptionNumber.trim())
  params.append('legacyExemptionNumber', request.exemptionNumber.trim())
  params.append('approvedVolume', request.approvedVolume.trim())
  params.append('approvalDate', request.approvalDate.trim())
  params.append('exemptionExpiryDate', request.expiryDate.trim())
  params.append('otherConditions', request.otherConditions.trim())
  params.append('exemptionTypeCode', request.exemptionTypeCode.trim())
  params.append('exemptionStatusCode', request.exemptionStatusCode.trim())
  if (request.manageFeeRate) {
    params.append('feeRate', request.feeRate.trim())
    if (request.enableRateOverride) {
      params.append('enableRateOverride', 'true')
    }
  }
  request.regionNumbers.forEach((region) => params.append('region', region.trim()))

  const response = await apiService
    .getAxiosInstance()
    .post<unknown>('/lexis/rpc/exemption-details/exemption/update', params, {
      headers: { 'Content-Type': LEGACY_FORM_CONTENT_TYPE },
    })
  const payload = recordOrEmpty(response.data)
  const success = asBoolean(payload.success)
  const errors = asStringArray(payload.errors)
  return {
    success,
    message:
      asString(payload.message) || (success ? 'Exemption updated.' : 'Unable to update exemption.'),
    exemptionNumber: asString(payload.exemptionNumber),
    errors,
    warnings: asStringArray(payload.warnings),
  }
}

export const approveExemptions = async (
  exemptionNumbers: string[],
): Promise<ExemptionApprovalResult> => {
  const payload = await postForm('/lexis/rpc/exemption-details/approve-exemptions', {
    exemptionNumbers: exemptionNumbers
      .map((value) => value.trim())
      .filter(Boolean)
      .join(','),
  })
  const value = recordOrEmpty(payload)
  const rawSendGrid = Array.isArray(value.sendGrid) ? value.sendGrid : []
  const sendGrid = rawSendGrid
    .filter((entry): entry is unknown[] => Array.isArray(entry) && entry.length >= 2)
    .map((entry) => [asString(entry[0]), asString(entry[1])] as [string, string])
    .filter(([number]) => number.length > 0)
  return {
    success: asBoolean(value.success),
    valid: asBoolean(value.valid),
    sendGrid,
    errorMessage: asString(value.errorMessage),
    errors: asStringArray(value.errors),
    warnings: asStringArray(value.warnings),
  }
}

export const sendExemptionApprovalEmails = async (
  sendGrid: [string, string][],
): Promise<ExemptionEmailResult> => {
  const serialized = sendGrid
    .filter(([exemptionNumber, email]) => exemptionNumber.trim() && email.trim())
    .map(([exemptionNumber, email]) => `${exemptionNumber.trim()}:${email.trim()}`)
    .join(',')
  if (!serialized) {
    return { success: false, message: 'No client email address was available.' }
  }

  const payload = await postForm('/lexis/rpc/exemption-details/approval-emails', {
    sendGrid: serialized,
  })
  const value = recordOrEmpty(payload)
  return { success: asBoolean(value.success), message: asString(value.message) }
}
