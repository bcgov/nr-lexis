import type { AdminUploadResult, UploadWorkflowType } from '@/service/admin-upload-service'
import { getResponseStatus } from '@/utils/http-error'
import { isRecord, stringField } from '@/utils/record'
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
  const response = isRecord(error) && isRecord(error.response) ? error.response : undefined
  const data = response?.data
  const dataRecord = isRecord(data) ? data : undefined
  const status = getResponseStatus(error)
  const errors = asStringArray(dataRecord?.errors)
  const warnings = asStringArray(dataRecord?.warnings)
  const responseMessage = dataRecord ? stringField(dataRecord, 'message') : ''
  const textResponseMessage = typeof data === 'string' ? data.trim() : ''

  const message =
    errors.length > 0
      ? errors.join(' ')
      : responseMessage
        ? responseMessage
        : textResponseMessage
          ? textResponseMessage
          : status
            ? 'Upload request failed. Verify the file format and retry. If the issue continues, contact support.'
            : 'Upload request failed. Please try again or contact support.'

  return {
    message,
    details: {
      summary: responseMessage || message,
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
      ? `LEXIS import created ${details.join(', ')}.`
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
