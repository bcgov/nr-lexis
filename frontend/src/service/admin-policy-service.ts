import apiService from '@/service/api-service'

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

const FEE_POLICY_STORAGE_KEY = 'lexis.admin.feePolicies'
const FIL_POLICY_STORAGE_KEY = 'lexis.admin.filPolicies'
const DEFAULT_USER_ID = 'CURRENT_USER'
const FALLBACK_STATUSES = new Set([404, 405, 500, 501, 502, 503])

const createTimestamp = (): string => new Date().toISOString()
const createRowId = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

const parseStoredArray = <T>(value: string | null): T[] => {
  if (!value) {
    return []
  }

  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed as T[]
  } catch {
    return []
  }
}

const sortByEffectiveDateDesc = <TRow extends { effectiveDate: string }>(rows: TRow[]): TRow[] => {
  return [...rows].sort((a, b) => {
    if (a.effectiveDate === b.effectiveDate) {
      return 0
    }
    return a.effectiveDate > b.effectiveDate ? -1 : 1
  })
}

const asString = (value: unknown): string => {
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'number') {
    return String(value)
  }
  return ''
}

const shouldFallbackToLocal = (error: unknown): boolean => {
  const enabled = (import.meta.env.VITE_LEXIS_ENABLE_ADMIN_POLICY_LOCAL_FALLBACK ?? 'false')
    .toString()
    .trim()
    .toLowerCase()
  const localFallbackEnabled = enabled === '1' || enabled === 'true' || enabled === 'yes'
  if (!localFallbackEnabled) {
    return false
  }

  const status = (error as any)?.response?.status
  if (typeof status === 'number') {
    return FALLBACK_STATUSES.has(status)
  }
  return true
}

const parseArrayPayload = (payload: unknown): unknown[] | null => {
  if (Array.isArray(payload)) {
    return payload
  }

  if (!payload || typeof payload !== 'object') {
    return null
  }

  const objectPayload = payload as Record<string, unknown>
  if (Array.isArray(objectPayload.results)) {
    return objectPayload.results as unknown[]
  }
  if (Array.isArray(objectPayload.rows)) {
    return objectPayload.rows as unknown[]
  }
  if (Array.isArray(objectPayload.items)) {
    return objectPayload.items as unknown[]
  }
  if (Array.isArray(objectPayload.data)) {
    return objectPayload.data as unknown[]
  }

  return null
}

const normalizeFeePolicyRow = (row: unknown): FeePolicyRow => {
  const source = (row ?? {}) as Record<string, unknown>
  return {
    id: asString(source.id || source.policyId) || createRowId(),
    effectiveDate: asString(source.effectiveDate || source.policyEffectiveDate),
    orgUnitCode: asString(source.orgUnitCode || source.regionCode).toUpperCase(),
    orgUnitName: asString(source.orgUnitName || source.regionName),
    policyPercentage: asString(source.policyPercentage || source.feeIncreasePercentage),
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
    id: asString(source.id || source.policyId) || createRowId(),
    effectiveDate: asString(source.effectiveDate || source.policyEffectiveDate),
    filPercentage: asString(source.filPercentage || source.policyPercentage),
    entryUserId: asString(source.entryUserId || source.entryUser) || DEFAULT_USER_ID,
    entryTimestamp: asString(source.entryTimestamp || source.entryDateTime) || createTimestamp(),
    updateUserId: asString(source.updateUserId || source.updateUser) || DEFAULT_USER_ID,
    updateTimestamp:
      asString(source.updateTimestamp || source.updateDateTime || source.entryTimestamp) ||
      createTimestamp(),
  }
}

const loadLocalFeePolicies = (): FeePolicyRow[] => {
  return sortByEffectiveDateDesc(
    parseStoredArray<FeePolicyRow>(localStorage.getItem(FEE_POLICY_STORAGE_KEY)),
  )
}

const loadLocalFilPolicies = (): FilPolicyRow[] => {
  return sortByEffectiveDateDesc(
    parseStoredArray<FilPolicyRow>(localStorage.getItem(FIL_POLICY_STORAGE_KEY)),
  )
}

const persistLocalFeePolicies = (rows: FeePolicyRow[]): void => {
  localStorage.setItem(FEE_POLICY_STORAGE_KEY, JSON.stringify(rows))
}

const persistLocalFilPolicies = (rows: FilPolicyRow[]): void => {
  localStorage.setItem(FIL_POLICY_STORAGE_KEY, JSON.stringify(rows))
}

const upsertLocalFeePolicy = (request: UpsertFeePolicyRequest): FeePolicyRow[] => {
  const rows = loadLocalFeePolicies()
  const now = createTimestamp()

  if (request.id) {
    const updated = rows.map((row) =>
      row.id === request.id
        ? {
            ...row,
            effectiveDate: request.effectiveDate,
            orgUnitCode: request.orgUnitCode.trim().toUpperCase(),
            orgUnitName: request.orgUnitName.trim(),
            policyPercentage: request.policyPercentage.trim(),
            updateUserId: DEFAULT_USER_ID,
            updateTimestamp: now,
          }
        : row,
    )
    const sorted = sortByEffectiveDateDesc(updated)
    persistLocalFeePolicies(sorted)
    return sorted
  }

  const created: FeePolicyRow = {
    id: createRowId(),
    effectiveDate: request.effectiveDate,
    orgUnitCode: request.orgUnitCode.trim().toUpperCase(),
    orgUnitName: request.orgUnitName.trim(),
    policyPercentage: request.policyPercentage.trim(),
    entryUserId: DEFAULT_USER_ID,
    entryTimestamp: now,
    updateUserId: DEFAULT_USER_ID,
    updateTimestamp: now,
  }
  const sorted = sortByEffectiveDateDesc([...rows, created])
  persistLocalFeePolicies(sorted)
  return sorted
}

const deleteLocalFeePolicy = (rowId: string): FeePolicyRow[] => {
  const rows = loadLocalFeePolicies().filter((row) => row.id !== rowId)
  persistLocalFeePolicies(rows)
  return rows
}

const upsertLocalFilPolicy = (request: UpsertFilPolicyRequest): FilPolicyRow[] => {
  const rows = loadLocalFilPolicies()
  const now = createTimestamp()

  if (request.id) {
    const updated = rows.map((row) =>
      row.id === request.id
        ? {
            ...row,
            effectiveDate: request.effectiveDate,
            filPercentage: request.filPercentage.trim(),
            updateUserId: DEFAULT_USER_ID,
            updateTimestamp: now,
          }
        : row,
    )
    const sorted = sortByEffectiveDateDesc(updated)
    persistLocalFilPolicies(sorted)
    return sorted
  }

  const created: FilPolicyRow = {
    id: createRowId(),
    effectiveDate: request.effectiveDate,
    filPercentage: request.filPercentage.trim(),
    entryUserId: DEFAULT_USER_ID,
    entryTimestamp: now,
    updateUserId: DEFAULT_USER_ID,
    updateTimestamp: now,
  }
  const sorted = sortByEffectiveDateDesc([...rows, created])
  persistLocalFilPolicies(sorted)
  return sorted
}

const deleteLocalFilPolicy = (rowId: string): FilPolicyRow[] => {
  const rows = loadLocalFilPolicies().filter((row) => row.id !== rowId)
  persistLocalFilPolicies(rows)
  return rows
}

export const fetchFeePolicies = async (): Promise<FeePolicyRow[]> => {
  try {
    const response = await apiService.getAxiosInstance().get('/lexis/admin/policies/fee')
    const payloadRows = parseArrayPayload(response.data)
    if (!payloadRows) {
      throw new Error('Fee policy response is not a list.')
    }
    return sortByEffectiveDateDesc(payloadRows.map(normalizeFeePolicyRow))
  } catch (error) {
    if (!shouldFallbackToLocal(error)) {
      throw error
    }
    return loadLocalFeePolicies()
  }
}

export const upsertFeePolicy = async (request: UpsertFeePolicyRequest): Promise<FeePolicyRow[]> => {
  const payload = {
    effectiveDate: request.effectiveDate,
    orgUnitCode: request.orgUnitCode.trim().toUpperCase(),
    orgUnitName: request.orgUnitName.trim(),
    policyPercentage: request.policyPercentage.trim(),
  }

  try {
    if (request.id) {
      await apiService.getAxiosInstance().put(`/lexis/admin/policies/fee/${request.id}`, payload)
    } else {
      await apiService.getAxiosInstance().post('/lexis/admin/policies/fee', payload)
    }
    return fetchFeePolicies()
  } catch (error) {
    if (!shouldFallbackToLocal(error)) {
      throw error
    }
    return upsertLocalFeePolicy(request)
  }
}

export const deleteFeePolicy = async (rowId: string): Promise<FeePolicyRow[]> => {
  try {
    await apiService.getAxiosInstance().delete(`/lexis/admin/policies/fee/${rowId}`)
    return fetchFeePolicies()
  } catch (error) {
    if (!shouldFallbackToLocal(error)) {
      throw error
    }
    return deleteLocalFeePolicy(rowId)
  }
}

export const fetchFilPolicies = async (): Promise<FilPolicyRow[]> => {
  try {
    const response = await apiService.getAxiosInstance().get('/lexis/admin/policies/fil')
    const payloadRows = parseArrayPayload(response.data)
    if (!payloadRows) {
      throw new Error('FIL policy response is not a list.')
    }
    return sortByEffectiveDateDesc(payloadRows.map(normalizeFilPolicyRow))
  } catch (error) {
    if (!shouldFallbackToLocal(error)) {
      throw error
    }
    return loadLocalFilPolicies()
  }
}

export const upsertFilPolicy = async (request: UpsertFilPolicyRequest): Promise<FilPolicyRow[]> => {
  const payload = {
    effectiveDate: request.effectiveDate,
    filPercentage: request.filPercentage.trim(),
  }

  try {
    if (request.id) {
      await apiService.getAxiosInstance().put(`/lexis/admin/policies/fil/${request.id}`, payload)
    } else {
      await apiService.getAxiosInstance().post('/lexis/admin/policies/fil', payload)
    }
    return fetchFilPolicies()
  } catch (error) {
    if (!shouldFallbackToLocal(error)) {
      throw error
    }
    return upsertLocalFilPolicy(request)
  }
}

export const deleteFilPolicy = async (rowId: string): Promise<FilPolicyRow[]> => {
  try {
    await apiService.getAxiosInstance().delete(`/lexis/admin/policies/fil/${rowId}`)
    return fetchFilPolicies()
  } catch (error) {
    if (!shouldFallbackToLocal(error)) {
      throw error
    }
    return deleteLocalFilPolicy(rowId)
  }
}
