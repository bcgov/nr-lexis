import { useMemo, useState, type FC } from 'react'
import { InlineNotification, TextArea } from '@carbon/react'
import {
  buildUploadResultMessage,
  buildUploadReviewDetails,
  extractUploadErrorDetails,
  validateDocumentUploadFile,
} from './uploadQueueHelpers'
import MultiFileDropZone from './MultiFileDropZone'
import UploadQueuePreview from './UploadQueuePreview'
import type {
  UploadQueueItem,
  UploadQueueReviewDetails,
  UploadQueueStatus,
} from './uploadQueueTypes'
import { submitAdminUpload } from '@/service/admin-upload-service'

type DetailDocumentUploadType = 'application' | 'exemption' | 'permit'

type DetailDocumentUploadPanelProps = {
  workflowType: DetailDocumentUploadType
  targetNumber: string
  inputId: string
  disabled?: boolean
  disabledReason?: string
  onUploadComplete?: () => Promise<void> | void
}

type UploadCopy = {
  title: string
  workflowLabel: string
  targetLabel: string
  defaultMessage: string
}

const UPLOAD_COPY: Record<DetailDocumentUploadType, UploadCopy> = {
  application: {
    title: 'Upload Application Documents',
    workflowLabel: 'Application Upload',
    targetLabel: 'Application',
    defaultMessage: 'Application document upload submitted.',
  },
  exemption: {
    title: 'Upload Exemption Documents',
    workflowLabel: 'Exemption Upload',
    targetLabel: 'Exemption',
    defaultMessage: 'Exemption document upload submitted.',
  },
  permit: {
    title: 'Upload Permit Documents',
    workflowLabel: 'Permit Upload',
    targetLabel: 'Permit',
    defaultMessage: 'Permit document upload submitted.',
  },
}

const uploadTargetSummary = (copy: UploadCopy, targetNumber: string): string =>
  targetNumber.trim() ? `${copy.targetLabel} ${targetNumber.trim()}` : `${copy.targetLabel} missing`

const DetailDocumentUploadPanel: FC<DetailDocumentUploadPanelProps> = ({
  workflowType,
  targetNumber,
  inputId,
  disabled = false,
  disabledReason = 'Your session does not include the required upload permission.',
  onUploadComplete,
}) => {
  const copy = UPLOAD_COPY[workflowType]
  const [fileDescription, setFileDescription] = useState('')
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([])
  const [fileInputKey, setFileInputKey] = useState(0)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const invalidUploadCount = useMemo(
    () => uploadQueue.filter((item) => item.status === 'invalid').length,
    [uploadQueue],
  )
  const queuedUploadCount = useMemo(
    () => uploadQueue.filter((item) => item.status === 'queued' || item.status === 'failed').length,
    [uploadQueue],
  )
  const currentTargetSummary = uploadTargetSummary(copy, targetNumber)
  const canSubmit =
    !disabled && !!targetNumber.trim() && queuedUploadCount > 0 && invalidUploadCount === 0

  const addFilesToQueue = (files: FileList | null): void => {
    if (!files || files.length === 0) {
      return
    }

    const queuedAt = Date.now()
    const nextItems = Array.from(files).map((file, index) => {
      const validationMessage = validateDocumentUploadFile(file)

      return {
        id: `${queuedAt}-${index}-${file.name}-${file.size}`,
        file,
        workflowLabel: copy.workflowLabel,
        queuedAt,
        status: validationMessage ? ('invalid' as const) : ('queued' as const),
        message: validationMessage,
        details: validationMessage
          ? { summary: validationMessage, errors: [validationMessage] }
          : undefined,
      }
    })

    setUploadQueue((current) => [...current, ...nextItems])
    setErrorMessage('')
    setSuccessMessage('')
    setFileInputKey((current) => current + 1)
  }

  const removeQueuedFile = (id: string): void => {
    setUploadQueue((current) => current.filter((item) => item.id !== id))
  }

  const clearQueuedFiles = (): void => {
    setUploadQueue([])
    setFileInputKey((current) => current + 1)
  }

  const resetUpload = (): void => {
    clearQueuedFiles()
    setFileDescription('')
    setErrorMessage('')
    setSuccessMessage('')
  }

  const setQueueItemStatus = (
    id: string,
    status: UploadQueueStatus,
    message = '',
    targetSummary?: string,
    details?: UploadQueueReviewDetails,
  ): void => {
    setUploadQueue((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              status,
              message,
              details: details ?? item.details,
              targetSummary: targetSummary ?? item.targetSummary,
            }
          : item,
      ),
    )
  }

  const submitQueuedFile = async (
    file: File,
  ): Promise<{
    message: string
    details: UploadQueueReviewDetails
  }> => {
    const baseRequest = {
      file,
      fileDescription: fileDescription.trim(),
    }

    if (workflowType === 'application') {
      const result = await submitAdminUpload('application', {
        ...baseRequest,
        applicationNumber: targetNumber.trim(),
      })
      const message = buildUploadResultMessage('application', copy.defaultMessage, result)
      return { message, details: buildUploadReviewDetails(message, result) }
    }

    if (workflowType === 'exemption') {
      const result = await submitAdminUpload('exemption', {
        ...baseRequest,
        exemptionNumber: targetNumber.trim(),
      })
      const message = buildUploadResultMessage('exemption', copy.defaultMessage, result)
      return { message, details: buildUploadReviewDetails(message, result) }
    }

    const result = await submitAdminUpload('permit', {
      ...baseRequest,
      permitNumber: targetNumber.trim(),
    })
    const message = buildUploadResultMessage('permit', copy.defaultMessage, result)
    return { message, details: buildUploadReviewDetails(message, result) }
  }

  const onSubmitUpload = async (): Promise<void> => {
    setErrorMessage('')
    setSuccessMessage('')

    if (disabled) {
      setErrorMessage(disabledReason)
      return
    }

    if (!targetNumber.trim()) {
      setErrorMessage(`${copy.targetLabel} number is required before uploading documents.`)
      return
    }

    if (invalidUploadCount > 0) {
      setErrorMessage(
        `${invalidUploadCount} queued file${invalidUploadCount === 1 ? ' needs' : 's need'} attention before upload.`,
      )
      return
    }

    if (uploadQueue.length === 0) {
      setErrorMessage('Choose at least one file to upload.')
      return
    }

    setIsSubmitting(true)
    const lockedTargetSummary = currentTargetSummary
    let successCount = 0
    let failureCount = 0
    let lastSuccessMessage = ''

    for (const item of uploadQueue) {
      if (item.status === 'complete' || item.status === 'invalid') {
        continue
      }

      setQueueItemStatus(item.id, 'uploading', '', lockedTargetSummary)

      try {
        const result = await submitQueuedFile(item.file)
        successCount += 1
        lastSuccessMessage = result.message
        setQueueItemStatus(item.id, 'complete', result.message, lockedTargetSummary, result.details)
      } catch (error) {
        failureCount += 1
        const uploadError = extractUploadErrorDetails(error)
        setQueueItemStatus(
          item.id,
          'failed',
          uploadError.message,
          lockedTargetSummary,
          uploadError.details,
        )
      }
    }

    if (successCount > 0) {
      try {
        await onUploadComplete?.()
      } catch (error) {
        console.error(error)
        setErrorMessage('Documents uploaded, but the document list could not refresh.')
      }
      setSuccessMessage(
        successCount === 1
          ? lastSuccessMessage
          : `${successCount} files uploaded. Verify updates in the document list.`,
      )
    }

    if (failureCount > 0) {
      setErrorMessage(
        `${failureCount} file${failureCount === 1 ? '' : 's'} failed. Review the queue for details.`,
      )
    }

    setIsSubmitting(false)
  }

  return (
    <div className="detail-document-upload" id={inputId}>
      {successMessage && (
        <InlineNotification
          kind="success"
          title="Upload Submitted"
          subtitle={successMessage}
          lowContrast
          onCloseButtonClick={() => setSuccessMessage('')}
        />
      )}
      {errorMessage && (
        <InlineNotification
          kind="error"
          title="Upload Error"
          subtitle={errorMessage}
          lowContrast
          onCloseButtonClick={() => setErrorMessage('')}
        />
      )}

      <div className="admin-upload-workspace detail-document-upload__workspace">
        <section className="admin-upload-panel" aria-labelledby={`${inputId}-settings-title`}>
          <div className="admin-upload-panel__header">
            <div>
              <h2 id={`${inputId}-settings-title`}>{copy.title}</h2>
            </div>
          </div>
          <div className="admin-upload-summary-strip" aria-label="Upload batch summary">
            <div>
              <span>Target</span>
              <strong>{currentTargetSummary}</strong>
            </div>
            <div>
              <span>Queued Files</span>
              <strong>{uploadQueue.length}</strong>
            </div>
            <div>
              <span>Format</span>
              <strong>Document</strong>
            </div>
          </div>
          <TextArea
            id={`${inputId}Description`}
            labelText="Document Description"
            value={fileDescription}
            onChange={(event) => setFileDescription(event.target.value)}
            rows={3}
            disabled={disabled}
          />
        </section>

        <MultiFileDropZone
          title="Upload Documents"
          description="Supported files: any document with a file extension"
          inputId={`${inputId}File`}
          inputKey={fileInputKey}
          inputLabel="Document File"
          invalidText={
            invalidUploadCount > 0
              ? `${invalidUploadCount} queued file${invalidUploadCount === 1 ? ' needs' : 's need'} attention before upload.`
              : undefined
          }
          onFilesSelected={addFilesToQueue}
        />
      </div>

      <UploadQueuePreview
        items={uploadQueue}
        targetSummary={currentTargetSummary}
        canSubmit={canSubmit}
        isSubmitting={isSubmitting}
        onSubmit={() => void onSubmitUpload()}
        onReset={resetUpload}
        onClear={clearQueuedFiles}
        onRemove={removeQueuedFile}
      />
    </div>
  )
}

export default DetailDocumentUploadPanel
