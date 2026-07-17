import type {
  AdminUploadResult,
  LexisXmlSubmissionSummary,
  UploadWorkflowType,
} from '@/service/admin-upload-service'
import {
  sanitizeNotificationText,
  sanitizeNotificationTextList,
} from '@/utils/notification-messages'
import { getResponseStatus } from '@/utils/http-error'
import { payloadValueAsStringList as asStringArray } from '@/service/payload-utils'
import { isRecord, stringField } from '@/utils/record'
import type { UploadQueueReviewDetails, UploadQueueStatus } from './uploadQueueTypes'

export const GENERIC_UPLOAD_FAILURE_MESSAGE =
  'Upload failed. Please try again. If the problem persists, contact your administrator.'

export const GENERIC_SUBMISSION_FAILURE_MESSAGE =
  'Submission failed. Please try again. If the problem persists, contact your administrator.'

export const DOCUMENT_UPLOAD_READY_MESSAGE = 'File is queued for validation.'

const FILE_TOO_LARGE_UPLOAD_FAILURE_MESSAGE =
  'The selected file is too large. Choose a smaller file and try again.'

export const extractUploadErrorDetails = (
  error: unknown,
  fallbackMessage = GENERIC_UPLOAD_FAILURE_MESSAGE,
): { message: string; details: UploadQueueReviewDetails } => {
  const response = isRecord(error) && isRecord(error.response) ? error.response : undefined
  const data = response?.data
  const dataRecord = isRecord(data) ? data : undefined
  const status = getResponseStatus(error)
  const errors = asStringArray(dataRecord?.errors)
  const warnings = asStringArray(dataRecord?.warnings)
  const responseMessage = dataRecord ? stringField(dataRecord, 'message') : ''
  const textResponseMessage = typeof data === 'string' ? data.trim() : ''
  const sanitizedErrors = sanitizeNotificationTextList(errors, fallbackMessage)
  const sanitizedWarnings = sanitizeNotificationTextList(warnings, '')
  const sanitizedResponseMessage = responseMessage
    ? sanitizeNotificationText(responseMessage, fallbackMessage)
    : ''
  const sanitizedTextResponseMessage = textResponseMessage
    ? sanitizeNotificationText(textResponseMessage, fallbackMessage)
    : ''
  const statusFallbackMessage =
    status === 413 ? FILE_TOO_LARGE_UPLOAD_FAILURE_MESSAGE : fallbackMessage

  const message =
    sanitizedErrors.length > 0
      ? sanitizedErrors.join(' ')
      : sanitizedResponseMessage
        ? sanitizedResponseMessage
        : sanitizedTextResponseMessage || statusFallbackMessage

  return {
    message,
    details: {
      summary: sanitizedResponseMessage || message,
      errors: sanitizedErrors.length > 0 ? sanitizedErrors : message ? [message] : [],
      warnings: sanitizedWarnings,
      userReference: dataRecord ? stringField(dataRecord, 'userReference') : '',
      submissionSummary: isRecord(dataRecord?.submissionSummary)
        ? (dataRecord.submissionSummary as LexisXmlSubmissionSummary)
        : undefined,
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

export const uploadQueueFileKey = (file: File): string => file.name.trim().toLocaleLowerCase()

export const uploadQueueStatusLabel = (status: UploadQueueStatus): string => {
  if (status === 'invalid') {
    return 'Invalid'
  }
  if (status === 'uploading') {
    return 'Uploading'
  }
  if (status === 'validating') {
    return 'Validating'
  }
  if (status === 'validated') {
    return 'Validated'
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

export const formatUploadFileSize = (size: number): string => {
  if (size < 1024) {
    return `${size} B`
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

export const formatUploadQueuedAt = (timestamp: number): string => {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(timestamp)
}

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024

export const DOCUMENT_UPLOAD_EXTENSIONS = [
  '.bmp',
  '.csv',
  '.doc',
  '.docx',
  '.jpg',
  '.pdf',
  '.png',
  '.rtf',
  '.txt',
  '.xls',
  '.xlsx',
  '.xml',
  '.zip',
] as const

export const DOCUMENT_UPLOAD_ACCEPT = DOCUMENT_UPLOAD_EXTENSIONS.join(',')

export const DOCUMENT_UPLOAD_GUIDANCE =
  'BMP, CSV, DOC, DOCX, JPG, PDF, PNG, RTF, TXT, XLS, XLSX, XML, or ZIP; 20 MiB maximum. File names and descriptions must use US-ASCII and be 250 bytes or fewer'

const MAX_ATTACHMENT_METADATA_BYTES = 250
const PRINTABLE_US_ASCII_PATTERN = /^[\x20-\x7e]+$/
const DESCRIPTION_US_ASCII_PATTERN = /^[\x09\x0a\x0d\x20-\x7e]*$/
const DOCUMENT_UPLOAD_EXTENSION_SET = new Set<string>(DOCUMENT_UPLOAD_EXTENSIONS)

export const validateDocumentUploadDescription = (description: string): string => {
  const normalizedDescription = description.trim()
  if (!DESCRIPTION_US_ASCII_PATTERN.test(normalizedDescription)) {
    return 'Document description must use US-ASCII characters.'
  }
  if (normalizedDescription.length > MAX_ATTACHMENT_METADATA_BYTES) {
    return 'Document description must be 250 bytes or fewer.'
  }

  return ''
}

export const validateUploadFileSize = (file: File): string => {
  if (file.size > MAX_UPLOAD_BYTES) {
    return 'File must be 20 MiB or smaller.'
  }

  return ''
}

export const validateDocumentUploadFile = (file: File): string => {
  const fileName = file.name
  if (!fileName.trim()) {
    return 'File name is required.'
  }

  if (
    fileName !== fileName.trim() ||
    !PRINTABLE_US_ASCII_PATTERN.test(fileName) ||
    fileName.includes('/') ||
    fileName.includes('\\')
  ) {
    return 'File name must use printable US-ASCII characters without path separators.'
  }

  if (fileName.length > MAX_ATTACHMENT_METADATA_BYTES) {
    return 'File name must be 250 bytes or fewer.'
  }

  if (file.size === 0) {
    return 'File is empty.'
  }

  const sizeError = validateUploadFileSize(file)
  if (sizeError) {
    return sizeError
  }

  const extension = getFileExtension(fileName)
  if (!DOCUMENT_UPLOAD_EXTENSION_SET.has(extension)) {
    return 'File type is not supported. Choose BMP, CSV, DOC, DOCX, JPG, PDF, PNG, RTF, TXT, XLS, XLSX, XML, or ZIP.'
  }

  return ''
}

export const buildUploadResultMessage = (
  workflowType: UploadWorkflowType,
  resultMessage: string,
  result?: {
    status?: string
    message?: string
    applicationNumber?: number
    packageNumber?: string
    scaleRows?: number
    userReference?: string
    warnings?: string[]
  },
): string => {
  if (workflowType !== 'applicationSubmission') {
    return result?.message?.trim()
      ? sanitizeNotificationText(result.message, resultMessage)
      : resultMessage
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

  const isValidationResult =
    result?.status?.toLowerCase() === 'validated' ||
    resultMessage.toLowerCase().includes('validated')
  const summary =
    details.length > 0
      ? `${isValidationResult ? 'LEXIS application submission validated' : 'LEXIS application submission created'} ${details.join(', ')}.`
      : result?.message?.trim()
        ? sanitizeNotificationText(result.message, resultMessage)
        : resultMessage

  const sanitizedWarnings = Array.isArray(result?.warnings)
    ? sanitizeNotificationTextList(result.warnings, '')
    : []
  const warnings = sanitizedWarnings.length > 0 ? ` Warnings: ${sanitizedWarnings.join(' ')}` : ''

  return `${summary}${warnings}`
}

export const buildUploadReviewDetails = (
  message: string,
  result?: AdminUploadResult,
): UploadQueueReviewDetails => ({
  summary: message,
  errors: sanitizeNotificationTextList(
    asStringArray(result?.errors),
    GENERIC_UPLOAD_FAILURE_MESSAGE,
  ),
  warnings: sanitizeNotificationTextList(asStringArray(result?.warnings), ''),
  applicationNumber: result?.applicationNumber,
  packageNumber: result?.packageNumber,
  scaleRows: result?.scaleRows,
  userReference: result?.userReference,
  submissionSummary: result?.submissionSummary,
})
