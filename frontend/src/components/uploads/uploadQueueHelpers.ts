import type { AdminUploadResult, UploadWorkflowType } from '@/service/admin-upload-service'
import type { UploadQueueReviewDetails, UploadQueueStatus } from './uploadQueueTypes'

export const asStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .map((item) => item.trim())
  }

  if (typeof value === 'string' && value.trim()) {
    return [value.trim()]
  }

  return []
}

export const extractUploadErrorDetails = (
  error: unknown,
): { message: string; details: UploadQueueReviewDetails } => {
  const response = (error as any)?.response
  const data = response?.data
  const status = response?.status
  const errors = asStringArray(data?.errors)
  const warnings = asStringArray(data?.warnings)

  const message =
    errors.length > 0
      ? errors.join(' ')
      : typeof data?.message === 'string' && data.message.trim()
        ? data.message.trim()
        : typeof data === 'string' && data.trim()
          ? data.trim()
          : status
            ? `Upload request failed with status ${status}.`
            : 'Upload request failed. Please try again or contact support.'

  return {
    message,
    details: {
      summary:
        typeof data?.message === 'string' && data.message.trim() ? data.message.trim() : message,
      errors,
      warnings,
    },
  }
}

export const getFileExtension = (fileName: string): string => {
  const normalizedName = fileName.trim().toLowerCase()
  const extensionStart = normalizedName.lastIndexOf('.')

  if (extensionStart <= 0 || extensionStart === normalizedName.length - 1) {
    return ''
  }

  return normalizedName.slice(extensionStart)
}

export const uploadQueueStatusTagType = (
  status: UploadQueueStatus,
): 'gray' | 'blue' | 'green' | 'red' => {
  if (status === 'invalid' || status === 'failed') {
    return 'red'
  }
  if (status === 'uploading') {
    return 'blue'
  }
  if (status === 'complete') {
    return 'green'
  }
  return 'gray'
}

export const uploadQueueStatusLabel = (status: UploadQueueStatus): string => {
  if (status === 'invalid') {
    return 'Invalid'
  }
  if (status === 'uploading') {
    return 'Uploading'
  }
  if (status === 'complete') {
    return 'Complete'
  }
  if (status === 'failed') {
    return 'Failed'
  }
  return 'Queued'
}

export const formatScaleRows = (scaleRows: number): string =>
  `${scaleRows} scale row${scaleRows === 1 ? '' : 's'}`

export const validateDocumentUploadFile = (file: File): string => {
  if (!file.name.trim()) {
    return 'File name is required.'
  }

  if (file.size === 0) {
    return 'File is empty.'
  }

  if (!getFileExtension(file.name)) {
    return 'Document uploads need a file extension so LEXIS can resolve the file type.'
  }

  return ''
}

export const buildUploadResultMessage = (
  workflowType: UploadWorkflowType,
  resultMessage: string,
  result?: {
    message?: string
    applicationNumber?: number
    packageNumber?: string
    scaleRows?: number
    warnings?: string[]
  },
): string => {
  if (workflowType !== 'lexisXml') {
    return result?.message?.trim() || resultMessage
  }

  const details: string[] = []
  if (result?.applicationNumber) {
    details.push(`Application ${result.applicationNumber}`)
  }
  if (result?.packageNumber) {
    details.push(`Package ${result.packageNumber}`)
  }
  if (typeof result?.scaleRows === 'number') {
    details.push(formatScaleRows(result.scaleRows))
  }

  const summary =
    details.length > 0
      ? `LEXIS XML import created ${details.join(', ')}.`
      : result?.message?.trim() || resultMessage

  const warnings =
    Array.isArray(result?.warnings) && result.warnings.length > 0
      ? ` Warnings: ${result.warnings.join(' ')}`
      : ''

  return `${summary}${warnings}`
}

export const buildUploadReviewDetails = (
  message: string,
  result?: AdminUploadResult,
): UploadQueueReviewDetails => ({
  summary: message,
  errors: asStringArray(result?.errors),
  warnings: asStringArray(result?.warnings),
  applicationNumber: result?.applicationNumber,
  packageNumber: result?.packageNumber,
  scaleRows: result?.scaleRows,
})
