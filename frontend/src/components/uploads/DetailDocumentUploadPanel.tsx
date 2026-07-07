import { useMemo, useState } from 'react'
import { TextArea, TextInput } from '@carbon/react'
import { AppNotification } from '../AppNotification'
import {
  buildUploadResultMessage,
  buildUploadReviewDetails,
  DOCUMENT_UPLOAD_READY_MESSAGE,
  extractUploadErrorDetails,
  GENERIC_UPLOAD_FAILURE_MESSAGE,
  uploadQueueFileKey,
  validateDocumentUploadFile,
} from './uploadQueueHelpers'
import MultiFileDropZone from './MultiFileDropZone'
import UploadQueuePreview from './UploadQueuePreview'
import type {
  UploadQueueItem,
  UploadQueueReviewDetails,
  UploadQueueStatus,
} from './uploadQueueTypes'
import {
  requiredMaxLengthFieldError,
  requiredPositiveNumericFieldError,
} from '@/pages/shared/create-form-utils'
import { submitAdminUpload } from '@/service/admin-upload-service'

type DetailDocumentUploadType = 'application' | 'exemption' | 'permit' | 'invoice'

export type DetailDocumentUploadPanelProps = {
  workflowType: DetailDocumentUploadType
  targetNumber: string
  inputId: string
  disabled?: boolean
  disabledReason?: string
  initialInvoiceConversionRate?: string
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
    title: 'Upload application documents',
    workflowLabel: 'Application upload',
    targetLabel: 'Application',
    defaultMessage: 'Application document upload submitted.',
  },
  exemption: {
    title: 'Upload exemption documents',
    workflowLabel: 'Exemption upload',
    targetLabel: 'Exemption',
    defaultMessage: 'Exemption document upload submitted.',
  },
  permit: {
    title: 'Upload permit documents',
    workflowLabel: 'Permit upload',
    targetLabel: 'Permit',
    defaultMessage: 'Permit document upload submitted.',
  },
  invoice: {
    title: 'Upload invoices',
    workflowLabel: 'Invoice upload',
    targetLabel: 'Permit',
    defaultMessage: 'Invoice upload submitted.',
  },
}

const uploadTargetSummary = (copy: UploadCopy, targetNumber: string): string =>
  targetNumber.trim() ? `${copy.targetLabel} ${targetNumber.trim()}` : `${copy.targetLabel} missing`

const DetailDocumentUploadPanel = ({
  workflowType,
  targetNumber,
  inputId,
  disabled = false,
  disabledReason: disabledReasonProp,
  initialInvoiceConversionRate = '1.00',
  onUploadComplete,
}: DetailDocumentUploadPanelProps) => {
  const copy = UPLOAD_COPY[workflowType]
  const disabledReason =
    disabledReasonProp ?? 'Your session does not include the required upload permission.'
  const [fileDescription, setFileDescription] = useState('')
  const [salesInvoiceNumber, setSalesInvoiceNumber] = useState('')
  const [invoiceExportValue, setInvoiceExportValue] = useState('')
  const [invoiceConversionRateOverride, setInvoiceConversionRateOverride] = useState<string | null>(
    null,
  )
  const [invoiceFeeInLieu, setInvoiceFeeInLieu] = useState('1.00')
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([])
  const [fileInputKey, setFileInputKey] = useState(0)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [showInvoiceValidationErrors, setShowInvoiceValidationErrors] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const invoiceConversionRate =
    (invoiceConversionRateOverride ?? initialInvoiceConversionRate) || '1.00'

  const invalidUploadCount = useMemo(
    () => uploadQueue.filter((item) => item.status === 'invalid').length,
    [uploadQueue],
  )
  const uploadableCount = useMemo(
    () =>
      uploadQueue.filter(
        (item) =>
          item.status === 'queued' || item.status === 'validated' || item.status === 'failed',
      ).length,
    [uploadQueue],
  )
  const invoiceValidationErrors = useMemo(() => {
    if (workflowType !== 'invoice') {
      return []
    }

    return [
      requiredMaxLengthFieldError(salesInvoiceNumber, 9, 'Invoice number'),
      requiredPositiveNumericFieldError(invoiceExportValue, 'Invoice export value'),
      requiredPositiveNumericFieldError(invoiceConversionRate, 'Invoice conversion rate'),
      requiredPositiveNumericFieldError(invoiceFeeInLieu, 'Invoice fee in lieu'),
    ].filter((error): error is string => !!error)
  }, [
    invoiceConversionRate,
    invoiceExportValue,
    invoiceFeeInLieu,
    salesInvoiceNumber,
    workflowType,
  ])
  const baseTargetSummary = uploadTargetSummary(copy, targetNumber)
  const currentTargetSummary =
    workflowType === 'invoice' && salesInvoiceNumber.trim()
      ? `${baseTargetSummary}; invoice ${salesInvoiceNumber.trim()}`
      : baseTargetSummary
  const invoiceNumberError = requiredMaxLengthFieldError(salesInvoiceNumber, 9, 'Invoice number')
  const invoiceExportValueError = requiredPositiveNumericFieldError(
    invoiceExportValue,
    'Invoice export value',
  )
  const invoiceConversionRateError = requiredPositiveNumericFieldError(
    invoiceConversionRate,
    'Invoice conversion rate',
  )
  const invoiceFeeInLieuError = requiredPositiveNumericFieldError(
    invoiceFeeInLieu,
    'Invoice fee in lieu',
  )
  const showInvoiceFieldErrors = workflowType === 'invoice' && showInvoiceValidationErrors
  const canSubmit =
    !disabled && !!targetNumber.trim() && uploadableCount > 0 && invalidUploadCount === 0

  const addFilesToQueue = (files: FileList | null): void => {
    if (!files || files.length === 0) {
      return
    }

    const queuedAt = Date.now()
    const nextItemsByFileName = new Map<string, UploadQueueItem>()
    Array.from(files).forEach((file, index) => {
      const validationMessage = validateDocumentUploadFile(file)

      nextItemsByFileName.set(uploadQueueFileKey(file), {
        id: `${queuedAt}-${index}-${file.name}-${file.size}`,
        file,
        workflowLabel: copy.workflowLabel,
        queuedAt,
        status: validationMessage ? ('invalid' as const) : ('queued' as const),
        message: validationMessage || DOCUMENT_UPLOAD_READY_MESSAGE,
        details: validationMessage
          ? { summary: validationMessage, errors: [validationMessage] }
          : { summary: DOCUMENT_UPLOAD_READY_MESSAGE },
      })
    })
    const nextItems = Array.from(nextItemsByFileName.values())
    const replacementFileNames = new Set(nextItems.map((item) => uploadQueueFileKey(item.file)))

    setUploadQueue((current) => [
      ...current.filter((item) => !replacementFileNames.has(uploadQueueFileKey(item.file))),
      ...nextItems,
    ])
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
    setSalesInvoiceNumber('')
    setInvoiceExportValue('')
    setInvoiceConversionRateOverride(null)
    setInvoiceFeeInLieu('1.00')
    setErrorMessage('')
    setSuccessMessage('')
    setShowInvoiceValidationErrors(false)
  }

  const resetUploadAfterSuccess = (): void => {
    clearQueuedFiles()
    setFileDescription('')
    setSalesInvoiceNumber('')
    setInvoiceExportValue('')
    setInvoiceConversionRateOverride(null)
    setInvoiceFeeInLieu('1.00')
    setShowInvoiceValidationErrors(false)
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

    if (workflowType === 'invoice') {
      const result = await submitAdminUpload('invoice', {
        ...baseRequest,
        permitNumber: targetNumber.trim(),
        salesInvoiceNumber: salesInvoiceNumber.trim(),
        invoiceExportValue: invoiceExportValue.trim(),
        invoiceConversionRate: invoiceConversionRate.trim(),
        invoiceFeeInLieu: invoiceFeeInLieu.trim(),
      })
      const message = buildUploadResultMessage('invoice', copy.defaultMessage, result)
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

    if (invoiceValidationErrors.length > 0) {
      setShowInvoiceValidationErrors(true)
      setErrorMessage(invoiceValidationErrors.join(' '))
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
        const uploadError = extractUploadErrorDetails(error, GENERIC_UPLOAD_FAILURE_MESSAGE)
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
      } catch {
        setErrorMessage('Documents uploaded, but the document list could not refresh.')
      }
      setSuccessMessage(
        successCount === 1
          ? lastSuccessMessage
          : `${successCount} files uploaded. Verify updates in the document list.`,
      )
      if (failureCount === 0) {
        resetUploadAfterSuccess()
      }
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
        <AppNotification
          kind="success"
          title="Upload submitted"
          subtitle={successMessage}
          lowContrast
          autoDismissMs={8000}
          onCloseButtonClick={() => setSuccessMessage('')}
        />
      )}
      {errorMessage && (
        <AppNotification
          kind="error"
          title="Upload error"
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
              <span>Queued files</span>
              <strong>{uploadQueue.length}</strong>
            </div>
            <div>
              <span>Format</span>
              <strong>{workflowType === 'invoice' ? 'Invoice' : 'Document'}</strong>
            </div>
          </div>
          {workflowType === 'invoice' && (
            <div className="legacy-search-grid detail-document-upload__invoice-fields">
              <TextInput
                id={`${inputId}SalesInvoiceNumber`}
                labelText="Upload invoice number"
                value={salesInvoiceNumber}
                invalid={showInvoiceFieldErrors && !!invoiceNumberError}
                invalidText={showInvoiceFieldErrors ? invoiceNumberError : undefined}
                onChange={(event) => setSalesInvoiceNumber(event.target.value)}
                disabled={disabled}
              />
              <TextInput
                id={`${inputId}InvoiceExportValue`}
                labelText="Upload invoice export value"
                value={invoiceExportValue}
                invalid={showInvoiceFieldErrors && !!invoiceExportValueError}
                invalidText={showInvoiceFieldErrors ? invoiceExportValueError : undefined}
                onChange={(event) => setInvoiceExportValue(event.target.value)}
                disabled={disabled}
              />
              <TextInput
                id={`${inputId}InvoiceConversionRate`}
                labelText="Upload invoice conversion rate"
                value={invoiceConversionRate}
                invalid={showInvoiceFieldErrors && !!invoiceConversionRateError}
                invalidText={showInvoiceFieldErrors ? invoiceConversionRateError : undefined}
                onChange={(event) => setInvoiceConversionRateOverride(event.target.value)}
                disabled={disabled}
              />
              <TextInput
                id={`${inputId}InvoiceFeeInLieu`}
                labelText="Upload invoice fee in lieu"
                value={invoiceFeeInLieu}
                invalid={showInvoiceFieldErrors && !!invoiceFeeInLieuError}
                invalidText={showInvoiceFieldErrors ? invoiceFeeInLieuError : undefined}
                onChange={(event) => setInvoiceFeeInLieu(event.target.value)}
                disabled={disabled}
              />
            </div>
          )}
          <TextArea
            id={`${inputId}Description`}
            labelText="Document description"
            value={fileDescription}
            onChange={(event) => setFileDescription(event.target.value)}
            rows={3}
            disabled={disabled}
          />

          <MultiFileDropZone
            title="Upload documents"
            description="Supported files: any document with a file extension"
            inputId={`${inputId}File`}
            inputKey={fileInputKey}
            inputLabel="Document File"
            invalidText={
              invalidUploadCount > 0
                ? `${invalidUploadCount} queued file${invalidUploadCount === 1 ? ' needs' : 's need'} attention before upload.`
                : undefined
            }
            disabled={disabled}
            disabledDescription={disabledReason}
            renderAsPanel={false}
            variant="fspts"
            onFilesSelected={addFilesToQueue}
          />
        </section>
      </div>

      <UploadQueuePreview
        items={uploadQueue}
        targetSummary={currentTargetSummary}
        canSubmit={canSubmit}
        isSubmitting={isSubmitting}
        idPrefix={`${inputId}Queue`}
        actionsPlacement="footer"
        onSubmit={() => void onSubmitUpload()}
        submitLabel="Submit upload"
        submittingLabel="Submitting upload..."
        onReset={resetUpload}
        onClear={clearQueuedFiles}
        onRemove={removeQueuedFile}
      />
    </div>
  )
}

export default DetailDocumentUploadPanel
