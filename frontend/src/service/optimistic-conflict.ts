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
  /** The record open on the page, when the page is a record. */
  recordType?: OptimisticRecordType
  /** What the rejected save was for, such as "scale"; otherwise the user's changes. */
  saveSubject?: string
  refresh: () => void
}

// Saves that add or change one part of a record name that part; other saves are "changes".
const SAVE_SUBJECT_PATTERNS: ReadonlyArray<[RegExp, string]> = [
  [/\/(add-boic-scale|scale|package-scale)$/, 'scale'],
  [/\/(boic-package|boic-package\/update|package|package-update)$/, 'package'],
  [/\/remark$/, 'remark'],
]

export const conflictSaveSubject = (
  method: string | undefined,
  url: string | undefined,
): string | undefined => {
  if (method?.toLowerCase() === 'delete') return undefined
  const path = url?.split('?')[0] ?? ''
  return SAVE_SUBJECT_PATTERNS.find(([pattern]) => pattern.test(path))?.[1]
}

export type OptimisticConflictEvent = CustomEvent<OptimisticConflictRequest>

export const createOptimisticConflictEvent = (
  detail: OptimisticConflictRequest,
): OptimisticConflictEvent =>
  new CustomEvent<OptimisticConflictRequest>(OPTIMISTIC_CONFLICT_EVENT, {
    detail,
    cancelable: true,
  })
