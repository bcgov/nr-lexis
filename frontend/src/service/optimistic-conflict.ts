export const OPTIMISTIC_CONFLICT_EVENT = 'lexis:optimistic-conflict'
export const RECORD_VERSION_HEADER = 'X-Lexis-Record-Version'

export type OptimisticRecordType =
  | 'application'
  | 'federal-application'
  | 'exemption'
  | 'permit'
  | 'offer'

export type OptimisticConflictProblem = {
  code: 'STALE_RECORD' | 'RECORD_VERSION_REQUIRED'
  detail?: string
  currentVersion?: string
  changedFields?: unknown
  savedAt?: string
  updatedBy?: string
}

export type OptimisticConflictRequest = {
  problem: OptimisticConflictProblem
  refresh: () => void
}

export type OptimisticConflictEvent = CustomEvent<OptimisticConflictRequest>

export const createOptimisticConflictEvent = (
  detail: OptimisticConflictRequest,
): OptimisticConflictEvent =>
  new CustomEvent<OptimisticConflictRequest>(OPTIMISTIC_CONFLICT_EVENT, {
    detail,
    cancelable: true,
  })
