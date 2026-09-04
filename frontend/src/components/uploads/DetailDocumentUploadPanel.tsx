import { useEffect, useMemo, useState } from 'react'
import { Button, TextArea, TextInput } from '@carbon/react'
import { Add, ArrowRight } from '@carbon/icons-react'
import { AppNotification } from '../AppNotification'
import Modal from '@/components/Modal'
import {
  buildUploadResultMessage,
  buildUploadReviewDetails,
  DOCUMENT_UPLOAD_ACCEPT,
  DOCUMENT_UPLOAD_GUIDANCE,
  DOCUMENT_UPLOAD_READY_MESSAGE,
  extractUploadErrorDetails,
  GENERIC_UPLOAD_FAILURE_MESSAGE,
  uploadQueueFileKey,
  validateDocumentUploadFile,
  validateDocumentUploadDescription,
} from './uploadQueueHelpers'
import MultiFileDropZone from './MultiFileDropZone'
import UploadQueuePreview from './UploadQueuePreview'
import type {
  UploadQueueItem,
  UploadQueueReviewDetails,
  UploadQueueStatus,
} from './uploadQueueTypes'
import {
  INVOICE_AMOUNT_DECIMAL_PLACES,
  INVOICE_AMOUNT_MAX,
  INVOICE_CONVERSION_RATE_DECIMAL_PLACES,
  INVOICE_CONVERSION_RATE_MAX,
  invoiceDecimalStorageFieldError,
  invoiceNumberStorageFieldError,
} from '@/pages/shared/invoice-storage-validation'
import { submitAdminUpload, validateAdminUpload } from '@/service/admin-upload-service'

type DetailDocumentUploadType = 'application' | 'exemption' | 'permit' | 'invoice'
type DetailDocumentUploadStep = 'upload' | 'review'

type DetailDocumentUploadPanelProps = {
  workflowType: DetailDocumentUploadType
  targetNumber: string
  inputId: string
  disabled?: boolean
  disabledReason?: string
  initialInvoiceConversionRate?: string
  onBusyChange?: (isBusy: boolean) => void
  onDirtyChange?: (isDirty: boolean) => void
  onUploadComplete?: () => Promise<void> | void
}

type UploadCopy = {
  workflowLabel: string
  targetLabel: string
  defaultMessage: string
}

const UPLOAD_COPY: Record<DetailDocumentUploadType, UploadCopy> = {
  application: {
    workflowLabel: 'Application upload',
    targetLabel: 'Application',
    defaultMessage: 'Application document upload submitted.',
  },
  exemption: {
    workflowLabel: 'Exemption upload',
    targetLabel: 'Exemption',
    defaultMessage: 'Exemption document upload submitted.',
  },
  permit: {
    workflowLabel: 'Permit upload',
    targetLabel: 'Permit',
    defaultMessage: 'Permit document upload submitted.',
  },
  invoice: {
    workflowLabel: 'Invoice upload',
    targetLabel: 'Permit',
    defaultMessage: 'Invoice upload submitted.',
  },
}

const uploadTargetSummary = (copy: UploadCopy, targetNumber: string): string =>
  targetNumber.trim() ? `${copy.targetLabel} ${targetNumber.trim()}` : `${copy.targetLabel} missing`

const DOCUMENT_UPLOAD_VALIDATED_MESSAGE = 'File passed validation and virus scanning.'

const DetailDocumentUploadPanel = ({
  workflowType,
  targetNumber,
  inputId,
  disabled = false,
  disabledReason: disabledReasonProp,
  initialInvoiceConversionRate = '1.00',
  onBusyChange,
  onDirtyChange,
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
  const [showFileValidationError, setShowFileValidationError] = useState(false)
  const [showInvoiceValidationErrors, setShowInvoiceValidationErrors] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false)
  const [uploadStep, setUploadStep] = useState<DetailDocumentUploadStep>('upload')
  const invoiceConversionRateBaseline = initialInvoiceConversionRate || '1.00'
  const invoiceConversionRate = invoiceConversionRateOverride ?? invoiceConversionRateBaseline

  const invalidUploadCount = useMemo(
    () =>
      uploadQueue.filter((item) => item.status === 'invalid' || item.status === 'failed').length,
    [uploadQueue],
  )
  const pendingValidationCount = useMemo(
    () =>
      uploadQueue.filter((item) => item.status === 'queued' || item.status === 'validating').length,
    [uploadQueue],
  )
  const validatedUploadCount = useMemo(
    () => uploadQueue.filter((item) => item.status === 'validated').length,
    [uploadQueue],
  )
  const reviewUploadItems = useMemo(
    () =>
      uploadQueue.filter(
        (item) =>
          item.status === 'validating' ||
          item.status === 'validated' ||
          item.status === 'uploading' ||
          item.status === 'complete' ||
          item.submitted,
      ),
    [uploadQueue],
  )
  const invoiceValidationErrors = useMemo(() => {
    if (workflowType !== 'invoice') {
      return []
    }

    return [
      invoiceNumberStorageFieldError(salesInvoiceNumber),
      invoiceDecimalStorageFieldError(
        invoiceExportValue,
        'Invoice export value',
        INVOICE_AMOUNT_MAX,
        INVOICE_AMOUNT_DECIMAL_PLACES,
      ),
      invoiceDecimalStorageFieldError(
        invoiceConversionRate,
        'Invoice conversion rate',
        INVOICE_CONVERSION_RATE_MAX,
        INVOICE_CONVERSION_RATE_DECIMAL_PLACES,
      ),
      invoiceDecimalStorageFieldError(
        invoiceFeeInLieu,
        'Invoice fee in lieu',
        INVOICE_AMOUNT_MAX,
        INVOICE_AMOUNT_DECIMAL_PLACES,
      ),
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
  const invoiceNumberError = invoiceNumberStorageFieldError(salesInvoiceNumber)
  const invoiceExportValueError = invoiceDecimalStorageFieldError(
    invoiceExportValue,
    'Invoice export value',
    INVOICE_AMOUNT_MAX,
    INVOICE_AMOUNT_DECIMAL_PLACES,
  )
  const invoiceConversionRateError = invoiceDecimalStorageFieldError(
    invoiceConversionRate,
    'Invoice conversion rate',
    INVOICE_CONVERSION_RATE_MAX,
    INVOICE_CONVERSION_RATE_DECIMAL_PLACES,
  )
  const invoiceFeeInLieuError = invoiceDecimalStorageFieldError(
    invoiceFeeInLieu,
    'Invoice fee in lieu',
    INVOICE_AMOUNT_MAX,
    INVOICE_AMOUNT_DECIMAL_PLACES,
  )
  const showInvoiceFieldErrors = workflowType === 'invoice' && showInvoiceValidationErrors
  const descriptionError = validateDocumentUploadDescription(fileDescription)
  const uploadInvalidText =
    invalidUploadCount > 0
      ? `${invalidUploadCount} queued file${invalidUploadCount === 1 ? ' needs' : 's need'} attention and will be excluded from review.`
      : showFileValidationError && uploadQueue.length === 0
        ? 'Choose at least one file to upload.'
        : undefined
  const canReviewUpload =
    !disabled &&
    !!targetNumber.trim() &&
    validatedUploadCount > 0 &&
    pendingValidationCount === 0 &&
    !descriptionError &&
    invoiceValidationErrors.length === 0
  const canSubmit = canReviewUpload
  const isDirty =
    uploadQueue.some((item) => item.status !== 'complete') ||
    fileDescription.trim().length > 0 ||
    (workflowType === 'invoice' &&
      (salesInvoiceNumber.trim().length > 0 ||
        invoiceExportValue.trim().length > 0 ||
        invoiceConversionRate.trim() !== invoiceConversionRateBaseline.trim() ||
        invoiceFeeInLieu !== '1.00'))

  useEffect(() => {
    onDirtyChange?.(isDirty)
  }, [isDirty, onDirtyChange])

  useEffect(
    () => () => {
      onDirtyChange?.(false)
    },
    [onDirtyChange],
  )

  useEffect(() => {
    onBusyChange?.(isSubmitting)
  }, [isSubmitting, onBusyChange])

  useEffect(
    () => () => {
      onBusyChange?.(false)
    },
    [onBusyChange],
  )

  function setQueueItemStatus(
    id: string,
    status: UploadQueueStatus,
    message = '',
    targetSummary?: string,
    details?: UploadQueueReviewDetails,
    submitted?: boolean,
  ): void {
    setUploadQueue((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              status,
              message,
              details: details ?? item.details,
              targetSummary: targetSummary ?? item.targetSummary,
              submitted: submitted ?? item.submitted,
            }
          : item,
      ),
    )
  }

  const validateQueuedUploadFile = async (
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
      const result = await validateAdminUpload('application', {
        ...baseRequest,
        applicationNumber: targetNumber.trim(),
      })
      const message = buildUploadResultMessage(
        'application',
        DOCUMENT_UPLOAD_VALIDATED_MESSAGE,
        result,
      )
      return { message, details: buildUploadReviewDetails(message, result) }
    }

    if (workflowType === 'exemption') {
      const result = await validateAdminUpload('exemption', {
        ...baseRequest,
        exemptionNumber: targetNumber.trim(),
      })
      const message = buildUploadResultMessage(
        'exemption',
        DOCUMENT_UPLOAD_VALIDATED_MESSAGE,
        result,
      )
      return { message, details: buildUploadReviewDetails(message, result) }
    }

    if (workflowType === 'invoice') {
      const result = await validateAdminUpload('invoice', {
        ...baseRequest,
        permitNumber: targetNumber.trim(),
        salesInvoiceNumber: salesInvoiceNumber.trim(),
        invoiceExportValue: invoiceExportValue.trim(),
        invoiceConversionRate: invoiceConversionRate.trim(),
        invoiceFeeInLieu: invoiceFeeInLieu.trim(),
      })
      const message = buildUploadResultMessage('invoice', DOCUMENT_UPLOAD_VALIDATED_MESSAGE, result)
      return { message, details: buildUploadReviewDetails(message, result) }
    }

    const result = await validateAdminUpload('permit', {
      ...baseRequest,
      permitNumber: targetNumber.trim(),
    })
    const message = buildUploadResultMessage('permit', DOCUMENT_UPLOAD_VALIDATED_MESSAGE, result)
    return { message, details: buildUploadReviewDetails(message, result) }
  }

  const validateQueueItem = async (
    id: string,
    file: File,
    targetSummary: string,
  ): Promise<void> => {
    try {
      const result = await validateQueuedUploadFile(file)
      setQueueItemStatus(id, 'validated', result.message, targetSummary, result.details)
    } catch (error) {
      const uploadError = extractUploadErrorDetails(error, GENERIC_UPLOAD_FAILURE_MESSAGE)
      setQueueItemStatus(id, 'failed', uploadError.message, targetSummary, uploadError.details)
      setErrorMessage('1 file failed validation. Review the queue for details.')
    }
  }

  const addFilesToQueue = (files: FileList | null): void => {
    if (!files || files.length === 0) {
      return
    }

    const queuedAt = Date.now()
    const lockedTargetSummary = currentTargetSummary
    const nextItemsByFileName = new Map<string, UploadQueueItem>()
    Array.from(files).forEach((file, index) => {
      const validationMessages = [
        validateDocumentUploadFile(file),
        descriptionError,
        !targetNumber.trim()
          ? `${copy.targetLabel} number is required before validating documents.`
          : '',
        ...(workflowType === 'invoice' ? invoiceValidationErrors : []),
      ].filter(Boolean)
      const validationMessage = validationMessages.join(' ')

      nextItemsByFileName.set(uploadQueueFileKey(file), {
        id: `${queuedAt}-${index}-${file.name}-${file.size}`,
        file,
        workflowLabel: copy.workflowLabel,
        queuedAt,
        status: validationMessage ? ('invalid' as const) : ('validating' as const),
        message: validationMessage || 'Validating file…',
        targetSummary: lockedTargetSummary,
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
    setShowFileValidationError(false)
    setErrorMessage('')
    setSuccessMessage('')
    setUploadStep((current) => (current === 'review' ? 'review' : 'upload'))
    if (workflowType === 'invoice' && invoiceValidationErrors.length > 0) {
      setShowInvoiceValidationErrors(true)
    }
    setFileInputKey((current) => current + 1)
    nextItems
      .filter((item) => item.status === 'validating')
      .forEach((item) => void validateQueueItem(item.id, item.file, lockedTargetSummary))
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
    setShowFileValidationError(false)
    setShowInvoiceValidationErrors(false)
    setUploadStep('upload')
  }

  const resetUploadAfterSuccess = (): void => {
    clearQueuedFiles()
    setFileDescription('')
    setSalesInvoiceNumber('')
    setInvoiceExportValue('')
    setInvoiceConversionRateOverride(null)
    setInvoiceFeeInLieu('1.00')
    setShowFileValidationError(false)
    setShowInvoiceValidationErrors(false)
    setUploadStep('upload')
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

    if (pendingValidationCount > 0) {
      setErrorMessage('Wait for file validation to finish before reviewing the upload.')
      return
    }

    if (validatedUploadCount === 0) {
      setErrorMessage(
        invalidUploadCount > 0
          ? `${invalidUploadCount} queued file${invalidUploadCount === 1 ? ' needs' : 's need'} attention before review.`
          : 'Choose at least one file to upload.',
      )
      return
    }

    setIsSubmitting(true)
    const lockedTargetSummary = currentTargetSummary
    let successCount = 0
    let failureCount = 0
    let lastSuccessMessage = ''

    for (const item of uploadQueue) {
      if (item.status !== 'validated') {
        continue
      }

      setQueueItemStatus(item.id, 'uploading', '', lockedTargetSummary, undefined, true)

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
      if (failureCount === 0 && invalidUploadCount === 0) {
        resetUploadAfterSuccess()
        setIsUploadModalOpen(false)
      }
    }

    if (failureCount > 0) {
      setErrorMessage(
        `${failureCount} file${failureCount === 1 ? '' : 's'} failed. Review the queue for details.`,
      )
    }

    setIsSubmitting(false)
  }

  const onReviewUpload = (): void => {
    setErrorMessage('')
    setSuccessMessage('')
    setShowFileValidationError(uploadQueue.length === 0)

    if (disabled) {
      setErrorMessage(disabledReason)
      return
    }

    if (!targetNumber.trim()) {
      setErrorMessage(`${copy.targetLabel} number is required before uploading documents.`)
      return
    }

    if (descriptionError) {
      setErrorMessage(descriptionError)
      return
    }

    if (invoiceValidationErrors.length > 0) {
      setShowInvoiceValidationErrors(true)
      setErrorMessage(invoiceValidationErrors.join(' '))
      return
    }

    if (pendingValidationCount > 0) {
      setErrorMessage('Wait for file validation to finish before reviewing the upload.')
      return
    }

    if (validatedUploadCount === 0) {
      setErrorMessage(
        invalidUploadCount > 0
          ? `${invalidUploadCount} queued file${invalidUploadCount === 1 ? ' needs' : 's need'} attention before review.`
          : 'Choose at least one file to upload.',
      )
      return
    }

    setUploadStep('review')
  }

  const openUploadModal = (): void => {
    if (disabled) {
      return
    }

    setErrorMessage('')
    setSuccessMessage('')
    setIsUploadModalOpen(true)
  }

  const closeUploadModal = (): void => {
    if (isSubmitting) {
      return
    }

    resetUpload()
    setIsUploadModalOpen(false)
  }

  const documentNoun = workflowType === 'invoice' ? 'invoice' : 'document'
  const modalHeading = `Add ${documentNoun}`
  const modalInitialFocusId = `${inputId}UploadModalContent`

  return (
    <div className="detail-document-upload" id={inputId}>
      {!isUploadModalOpen && successMessage && (
        <AppNotification
          kind="success"
          title="Upload submitted"
          subtitle={successMessage}
          lowContrast
          autoDismissMs={6000}
          onCloseButtonClick={() => setSuccessMessage('')}
        />
      )}
      {!isUploadModalOpen && errorMessage && (
        <AppNotification
          kind="error"
          title="Upload error"
          subtitle={errorMessage}
          lowContrast
          onCloseButtonClick={() => setErrorMessage('')}
        />
      )}
      <div className="detail-document-upload__trigger">
        <Button
          kind="tertiary"
          size="sm"
          renderIcon={Add}
          disabled={disabled}
          title={disabled ? disabledReason : undefined}
          onClick={openUploadModal}
        >
          {modalHeading}
        </Button>
      </div>
      {isUploadModalOpen && (
        <Modal
          open
          passiveModal
          size="sm"
          modalHeading={modalHeading}
          aria-label={modalHeading}
          className="detail-document-upload-modal"
          selectorPrimaryFocus={`#${modalInitialFocusId}`}
          onRequestClose={closeUploadModal}
          preventCloseOnClickOutside
        >
          {successMessage && (
            <AppNotification
              kind="success"
              title="Upload submitted"
              subtitle={successMessage}
              lowContrast
              autoDismissMs={6000}
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

          {uploadStep === 'upload' && (
            <div
              id={modalInitialFocusId}
              tabIndex={-1}
              className="detail-document-upload-modal__form"
            >
              <p className="detail-document-upload-modal__subtitle">
                All fields are required unless marked optional.
              </p>
              {workflowType === 'invoice' && (
                <div className="legacy-search-grid detail-document-upload__invoice-fields">
                  <TextInput
                    id={`${inputId}SalesInvoiceNumber`}
                    labelText="Upload invoice number"
                    aria-required="true"
                    value={salesInvoiceNumber}
                    invalid={showInvoiceFieldErrors && !!invoiceNumberError}
                    invalidText={showInvoiceFieldErrors ? invoiceNumberError : undefined}
                    onChange={(event) => setSalesInvoiceNumber(event.target.value)}
                    disabled={disabled}
                  />
                  <TextInput
                    id={`${inputId}InvoiceExportValue`}
                    labelText="Upload invoice export value"
                    aria-required="true"
                    value={invoiceExportValue}
                    invalid={showInvoiceFieldErrors && !!invoiceExportValueError}
                    invalidText={showInvoiceFieldErrors ? invoiceExportValueError : undefined}
                    onChange={(event) => setInvoiceExportValue(event.target.value)}
                    disabled={disabled}
                  />
                  <TextInput
                    id={`${inputId}InvoiceConversionRate`}
                    labelText="Upload invoice conversion rate"
                    aria-required="true"
                    value={invoiceConversionRate}
                    invalid={showInvoiceFieldErrors && !!invoiceConversionRateError}
                    invalidText={showInvoiceFieldErrors ? invoiceConversionRateError : undefined}
                    onChange={(event) => setInvoiceConversionRateOverride(event.target.value)}
                    disabled={disabled}
                  />
                  <TextInput
                    id={`${inputId}InvoiceFeeInLieu`}
                    labelText="Upload invoice fee in lieu"
                    aria-required="true"
                    value={invoiceFeeInLieu}
                    invalid={showInvoiceFieldErrors && !!invoiceFeeInLieuError}
                    invalidText={showInvoiceFieldErrors ? invoiceFeeInLieuError : undefined}
                    onChange={(event) => setInvoiceFeeInLieu(event.target.value)}
                    disabled={disabled}
                  />
                </div>
              )}
              <MultiFileDropZone
                title="File"
                description={DOCUMENT_UPLOAD_GUIDANCE}
                inputId={`${inputId}File`}
                inputKey={fileInputKey}
                inputLabel="Document File"
                required
                accept={DOCUMENT_UPLOAD_ACCEPT}
                invalidText={uploadInvalidText}
                disabled={disabled}
                disabledDescription={disabledReason}
                renderAsPanel={false}
                variant="fspts"
                onFilesSelected={addFilesToQueue}
              />
              <TextArea
                id={`${inputId}Description`}
                labelText="Document description (optional)"
                value={fileDescription}
                onChange={(event) => setFileDescription(event.target.value)}
                invalid={!!descriptionError}
                invalidText={descriptionError}
                maxCount={250}
                rows={3}
                disabled={disabled}
              />
            </div>
          )}

          {uploadQueue.length > 0 && (
            <UploadQueuePreview
              items={uploadQueue}
              targetSummary={currentTargetSummary}
              canSubmit={canSubmit}
              canReview={canReviewUpload}
              isSubmitting={isSubmitting}
              idPrefix={`${inputId}Queue`}
              currentStepId={uploadStep}
              previewTitle={uploadStep === 'review' ? 'File review' : 'Selected files'}
              reviewItems={reviewUploadItems}
              showWorkflowProgress={false}
              showReviewQueueTable={false}
              showReviewAccordionHeader={false}
              hideActions
              onSubmit={() => void onSubmitUpload()}
              onReset={resetUpload}
              onClear={clearQueuedFiles}
              onRemove={removeQueuedFile}
              reviewSupplementalContent={
                <MultiFileDropZone
                  title="Add more documents"
                  description={DOCUMENT_UPLOAD_GUIDANCE}
                  inputId={`${inputId}ReviewFile`}
                  inputKey={fileInputKey}
                  inputLabel="Document File"
                  accept={DOCUMENT_UPLOAD_ACCEPT}
                  invalidText={uploadInvalidText}
                  disabled={disabled || isSubmitting}
                  disabledDescription={isSubmitting ? 'Upload is submitting.' : disabledReason}
                  renderAsPanel={false}
                  variant="fspts"
                  onFilesSelected={addFilesToQueue}
                />
              }
            />
          )}

          <div className="detail-document-upload-modal__actions">
            <Button kind="tertiary" disabled={isSubmitting} onClick={closeUploadModal}>
              Cancel
            </Button>
            {uploadStep === 'review' && (
              <Button kind="ghost" disabled={isSubmitting} onClick={() => setUploadStep('upload')}>
                Back
              </Button>
            )}
            <Button
              kind="primary"
              disabled={
                isSubmitting ||
                (uploadStep === 'review' ? !canSubmit : disabled || pendingValidationCount > 0)
              }
              renderIcon={ArrowRight}
              onClick={() => {
                if (uploadStep === 'review') {
                  void onSubmitUpload()
                  return
                }

                onReviewUpload()
              }}
            >
              {isSubmitting
                ? 'Submitting upload…'
                : uploadStep === 'review'
                  ? 'Submit upload'
                  : 'Review upload'}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}

export default DetailDocumentUploadPanel
