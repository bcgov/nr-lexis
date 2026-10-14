import type { LexisXmlSubmissionSummary } from '@/service/admin-upload-service'

export type UploadQueueStatus =
  | 'queued'
  | 'invalid'
  | 'validating'
  | 'validated'
  | 'uploading'
  | 'complete'
  | 'failed'

/** Reference descriptions for submission summary codes; a code without one is shown as is. */
export type LexisXmlSubmissionSummaryLabels = Partial<
  Record<
    | 'orgUnitNumber'
    | 'jurisdictionCode'
    | 'exemptionReasonCode'
    | 'applicantTypeCode'
    | 'productTypeCode'
    | 'ageClass'
    | 'endUseCode',
    string
  >
>

export type UploadQueueReviewDetails = {
  summary?: string
  errors?: string[]
  warnings?: string[]
  applicationNumber?: number
  packageNumber?: string
  scaleRows?: number
  userReference?: string
  submissionSummary?: LexisXmlSubmissionSummary
  submissionSummaryLabels?: LexisXmlSubmissionSummaryLabels
}

export type UploadQueueItem = {
  id: string
  file: File
  fileDescription?: string
  workflowLabel: string
  queuedAt: number
  status: UploadQueueStatus
  message: string
  details?: UploadQueueReviewDetails
  resultApplicationNumber?: number
  targetSummary?: string
  submitted?: boolean
}
