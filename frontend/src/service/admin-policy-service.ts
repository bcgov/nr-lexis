import apiService from '@/service/api-service'
import { parsePayloadArray, payloadValueAsString as asString } from '@/service/payload-utils'
import { recordOrEmpty } from '@/utils/record'

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

export type AdminPolicyPage<TRow> = {
  rows: TRow[]
  total: number
  page: number
  size: number
}

const DEFAULT_USER_ID = 'CURRENT_USER'
const POLICY_CACHE_TTL_MS = 30_000
const DEFAULT_ADMIN_PAGE = 0
const DEFAULT_ADMIN_PAGE_SIZE = 100

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
  const source = recordOrEmpty(row)
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
  const source = recordOrEmpty(row)
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

const normalizePolicyPage = <TRow>(
  payload: unknown,
  normalizeRow: (row: unknown) => TRow,
  defaultPage: number,
  defaultSize: number,
): AdminPolicyPage<TRow> => {
  const source = recordOrEmpty(payload)
  const payloadRows = parsePayloadArray(payload)
  if (!payloadRows) {
    throw new Error('Policy response is not a list.')
  }

  const total = Number(source.total ?? payloadRows.length)
  const page = Number(source.page ?? defaultPage)
  const size = Number(source.size ?? defaultSize)
  return {
    rows: payloadRows.map(normalizeRow),
    total: Number.isFinite(total) ? total : payloadRows.length,
    page: Number.isFinite(page) ? page : defaultPage,
    size: Number.isFinite(size) ? size : defaultSize,
  }
}

export const fetchFeePolicyPage = async (
  page = DEFAULT_ADMIN_PAGE,
  size = DEFAULT_ADMIN_PAGE_SIZE,
): Promise<AdminPolicyPage<FeePolicyRow>> => {
  const response = await apiService.getCachedResponse<unknown>(
    '/lexis/admin/policies/fee',
    {
      params: {
        page,
        size,
      },
    },
    {
      cacheKey: `admin-policies:fee:${page}:${size}`,
      ttlMs: POLICY_CACHE_TTL_MS,
    },
  )
  const result = normalizePolicyPage(response.data, normalizeFeePolicyRow, page, size)
  return {
    ...result,
    rows: sortByEffectiveDateDesc(result.rows),
  }
}

export const fetchFeePolicies = async (): Promise<FeePolicyRow[]> => {
  return (await fetchFeePolicyPage()).rows
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

export const fetchFilPolicyPage = async (
  page = DEFAULT_ADMIN_PAGE,
  size = DEFAULT_ADMIN_PAGE_SIZE,
): Promise<AdminPolicyPage<FilPolicyRow>> => {
  const response = await apiService.getCachedResponse<unknown>(
    '/lexis/admin/policies/fil',
    {
      params: {
        page,
        size,
      },
    },
    {
      cacheKey: `admin-policies:fil:${page}:${size}`,
      ttlMs: POLICY_CACHE_TTL_MS,
    },
  )
  const result = normalizePolicyPage(response.data, normalizeFilPolicyRow, page, size)
  return {
    ...result,
    rows: sortByEffectiveDateDesc(result.rows),
  }
}

export const fetchFilPolicies = async (): Promise<FilPolicyRow[]> => {
  return (await fetchFilPolicyPage()).rows
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
