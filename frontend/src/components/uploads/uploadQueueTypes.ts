export type UploadQueueStatus = 'queued' | 'invalid' | 'uploading' | 'complete' | 'failed'

export type UploadQueueReviewDetails = {
  summary?: string
  errors?: string[]
  warnings?: string[]
  applicationNumber?: number
  packageNumber?: string
  scaleRows?: number
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
