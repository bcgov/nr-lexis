export type UploadQueueStatus = 'queued' | 'invalid' | 'uploading' | 'complete' | 'failed'

export type UploadQueueItem = {
  id: string
  file: File
  workflowLabel: string
  queuedAt: number
  status: UploadQueueStatus
  message: string
  resultApplicationNumber?: number
  targetSummary?: string
}
