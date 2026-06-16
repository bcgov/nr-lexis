import type { LexisXmlSubmissionSummary } from '@/service/admin-upload-service'

export type UploadQueueStatus =
  | 'queued'
  | 'invalid'
  | 'validating'
  | 'validated'
  | 'uploading'
  | 'complete'
  | 'failed'

export type UploadQueueReviewDetails = {
  summary?: string
  errors?: string[]
  warnings?: string[]
  applicationNumber?: number
  packageNumber?: string
  scaleRows?: number
  userReference?: string
  submissionSummary?: LexisXmlSubmissionSummary
}

export type UploadQueueItem = {
  id: string
  file: File
  workflowLabel: string
  queuedAt: number
  status: UploadQueueStatus
  message: string
  details?: UploadQueueReviewDetails
  resultApplicationNumber?: number
  targetSummary?: string
}
