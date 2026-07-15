import type { AxiosResponse } from 'axios'

export const OPTIMISTIC_CONFLICT_EVENT = 'lexis:optimistic-conflict'
export const RECORD_VERSION_HEADER = 'X-Lexis-Record-Version'

export type OptimisticRecordType =
  | 'application'
  | 'federal-application'
  | 'exemption'
  | 'permit'
  | 'offer'

export type OptimisticConflictProblem = {
  code: 'STALE_RECORD'
  detail?: string
  currentVersion?: string
  changedFields?: unknown
  savedAt?: string
  updatedBy?: string
}

export type OptimisticConflictRequest = {
  problem: OptimisticConflictProblem
  overwrite: (currentVersion?: string) => Promise<AxiosResponse<unknown>>
  refresh: () => void
}

export class OptimisticOverwriteConflictError extends Error {
  public readonly problem: OptimisticConflictProblem

  constructor(problem: OptimisticConflictProblem) {
    super('The record changed again before the overwrite completed.')
    this.name = 'OptimisticOverwriteConflictError'
    this.problem = problem
  }
}

export type OptimisticConflictEvent = CustomEvent<OptimisticConflictRequest>

export const createOptimisticConflictEvent = (
  detail: OptimisticConflictRequest,
): OptimisticConflictEvent =>
  new CustomEvent<OptimisticConflictRequest>(OPTIMISTIC_CONFLICT_EVENT, {
    detail,
    cancelable: true,
  })
