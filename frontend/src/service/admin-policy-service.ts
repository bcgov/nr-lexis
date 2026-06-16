import apiService from '@/service/api-service'
import { parsePayloadArray, payloadValueAsString as asString } from '@/service/payload-utils'

export type FeePolicyRow = {
  id: string
  effectiveDate: string
  orgUnitCode: string
  orgUnitName: string
  policyPercentage: string
  entryUserId: string
  entryTimestamp: string
  updateUserId: string
  updateTimestamp: string
}

export type FilPolicyRow = {
  id: string
  effectiveDate: string
  filPercentage: string
  entryUserId: string
  entryTimestamp: string
  updateUserId: string
  updateTimestamp: string
}

export type UpsertFeePolicyRequest = {
  id?: string | null
  effectiveDate: string
  orgUnitCode: string
  orgUnitName: string
  policyPercentage: string
}

export type UpsertFilPolicyRequest = {
  id?: string | null
  effectiveDate: string
  filPercentage: string
}

const DEFAULT_USER_ID = 'CURRENT_USER'
const POLICY_CACHE_TTL_MS = 30_000

const createTimestamp = (): string => new Date().toISOString()
const createRowId = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

const sortByEffectiveDateDesc = <TRow extends { effectiveDate: string }>(rows: TRow[]): TRow[] => {
  return [...rows].sort((a, b) => {
    if (a.effectiveDate === b.effectiveDate) {
      return 0
    }
    return a.effectiveDate > b.effectiveDate ? -1 : 1
  })
}

const normalizeFeePolicyRow = (row: unknown): FeePolicyRow => {
  const source = (row ?? {}) as Record<string, unknown>
  return {
    id: asString(source.id || source.policyId || source.lexisFeePolicyId) || createRowId(),
    effectiveDate: asString(source.effectiveDate || source.policyEffectiveDate),
    orgUnitCode: asString(
      source.orgUnitCode || source.regionCode || source.orgUnitNo,
    ).toUpperCase(),
    orgUnitName: asString(source.orgUnitName || source.regionName),
    policyPercentage: asString(
      source.policyPercentage || source.feeIncreasePercentage || source.percentIncrease,
    ),
    entryUserId: asString(source.entryUserId || source.entryUser) || DEFAULT_USER_ID,
    entryTimestamp: asString(source.entryTimestamp || source.entryDateTime) || createTimestamp(),
    updateUserId: asString(source.updateUserId || source.updateUser) || DEFAULT_USER_ID,
    updateTimestamp:
      asString(source.updateTimestamp || source.updateDateTime || source.entryTimestamp) ||
      createTimestamp(),
  }
}

const normalizeFilPolicyRow = (row: unknown): FilPolicyRow => {
  const source = (row ?? {}) as Record<string, unknown>
  return {
    id:
      asString(
        source.id || source.policyId || source.lexisFILPolicyId || source.lexisFeePolicyId,
      ) || createRowId(),
    effectiveDate: asString(source.effectiveDate || source.policyEffectiveDate),
    filPercentage: asString(source.filPercentage || source.policyPercentage || source.filPercent),
    entryUserId: asString(source.entryUserId || source.entryUser) || DEFAULT_USER_ID,
    entryTimestamp: asString(source.entryTimestamp || source.entryDateTime) || createTimestamp(),
    updateUserId: asString(source.updateUserId || source.updateUser) || DEFAULT_USER_ID,
    updateTimestamp:
      asString(source.updateTimestamp || source.updateDateTime || source.entryTimestamp) ||
      createTimestamp(),
  }
}

export const fetchFeePolicies = async (): Promise<FeePolicyRow[]> => {
  const response = await apiService.getCachedResponse<unknown>(
    '/lexis/admin/policies/fee',
    undefined,
    {
      cacheKey: 'admin-policies:fee',
      ttlMs: POLICY_CACHE_TTL_MS,
    },
  )
  const payloadRows = parsePayloadArray(response.data)
  if (!payloadRows) {
    throw new Error('Fee policy response is not a list.')
  }
  return sortByEffectiveDateDesc(payloadRows.map(normalizeFeePolicyRow))
}

export const upsertFeePolicy = async (request: UpsertFeePolicyRequest): Promise<FeePolicyRow[]> => {
  const payload = {
    effectiveDate: request.effectiveDate,
    orgUnitCode: request.orgUnitCode.trim().toUpperCase(),
    orgUnitName: request.orgUnitName.trim(),
    policyPercentage: request.policyPercentage.trim(),
  }

  if (request.id) {
    await apiService.getAxiosInstance().put(`/lexis/admin/policies/fee/${request.id}`, payload)
  } else {
    await apiService.getAxiosInstance().post('/lexis/admin/policies/fee', payload)
  }

  return fetchFeePolicies()
}

export const deleteFeePolicy = async (rowId: string): Promise<FeePolicyRow[]> => {
  await apiService.getAxiosInstance().delete(`/lexis/admin/policies/fee/${rowId}`)
  return fetchFeePolicies()
}

export const fetchFilPolicies = async (): Promise<FilPolicyRow[]> => {
  const response = await apiService.getCachedResponse<unknown>(
    '/lexis/admin/policies/fil',
    undefined,
    {
      cacheKey: 'admin-policies:fil',
      ttlMs: POLICY_CACHE_TTL_MS,
    },
  )
  const payloadRows = parsePayloadArray(response.data)
  if (!payloadRows) {
    throw new Error('FIL policy response is not a list.')
  }
  return sortByEffectiveDateDesc(payloadRows.map(normalizeFilPolicyRow))
}

export const upsertFilPolicy = async (request: UpsertFilPolicyRequest): Promise<FilPolicyRow[]> => {
  const payload = {
    effectiveDate: request.effectiveDate,
    filPercentage: request.filPercentage.trim(),
  }

  if (request.id) {
    await apiService.getAxiosInstance().put(`/lexis/admin/policies/fil/${request.id}`, payload)
  } else {
    await apiService.getAxiosInstance().post('/lexis/admin/policies/fil', payload)
  }

  return fetchFilPolicies()
}

export const deleteFilPolicy = async (rowId: string): Promise<FilPolicyRow[]> => {
  await apiService.getAxiosInstance().delete(`/lexis/admin/policies/fil/${rowId}`)
  return fetchFilPolicies()
}
