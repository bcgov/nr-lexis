import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Button, Column, ComboBox, Grid, TextArea } from '@carbon/react'
import { ArrowRight } from '@carbon/icons-react'
import { useSearchParams } from 'react-router-dom'
import { ActionResultNotifications } from '../../components/ActionResultNotification'
import PageHeader from '@/components/PageHeader'
import ApplicationNumberSelect from '../../components/ApplicationNumberSelect'
import { shouldFilterSearchableDropdownItem } from '../../components/dropdown-filtering'
import SearchableSelect from '../../components/SearchableSelect'
import MultiFileDropZone from '../../components/uploads/MultiFileDropZone'
import UploadQueuePreview from '../../components/uploads/UploadQueuePreview'
import UploadWorkflowProgress from '../../components/uploads/UploadWorkflowProgress'
import {
  buildUploadResultMessage,
  buildUploadReviewDetails,
  DOCUMENT_UPLOAD_ACCEPT,
  DOCUMENT_UPLOAD_GUIDANCE,
  DOCUMENT_UPLOAD_READY_MESSAGE,
  extractUploadErrorDetails,
  GENERIC_UPLOAD_FAILURE_MESSAGE,
  validateDocumentUploadDescription,
  validateDocumentUploadFile,
  validateUploadFileSize,
  uploadQueueFileKey,
} from '@/components/uploads/uploadQueueHelpers'
import type {
  UploadQueueItem,
  UploadQueueReviewDetails,
  UploadQueueStatus,
} from '@/components/uploads/uploadQueueTypes'
import { useAuth } from '@/context/auth/useAuth'
import {
  getVisibleFieldError,
  normalizeProvincialApplicationNumber,
  provincialApplicationNumberFieldError,
  requiredFieldError,
  type FieldErrors,
  type TouchedFields,
} from '@/pages/shared/create-form-utils'
import { submitAdminUpload, type UploadWorkflowType } from '@/service/admin-upload-service'
import { searchProvincialExemptionNumberOptions } from '@/service/provincial-exemption-search-service'
import { searchProvincialPermitNumberOptions } from '@/service/provincial-permit-search-service'
import type { ActionResult } from '@/utils/action-result'
import { fieldErrorText } from '@/utils/field-error'

type DataUploadWorkflowType = Exclude<UploadWorkflowType, 'invoice' | 'applicationSubmission'>

type UploadWorkflowDefinition = {
  type: DataUploadWorkflowType
  label: string
  requiredAction: string
  numberFieldLabel: string
  numberFieldPlaceholder: string
}

const UPLOAD_WORKFLOW_DEFINITIONS: UploadWorkflowDefinition[] = [
  {
    type: 'application',
    label: 'Application upload',
    requiredAction: '/fileApplicationUpload',
    numberFieldLabel: 'Application number',
    numberFieldPlaceholder: 'Enter application number',
  },
  {
    type: 'exemption',
    label: 'Exemption upload',
    requiredAction: '/fileExemptionUpload',
    numberFieldLabel: 'Exemption number',
    numberFieldPlaceholder: 'Enter exemption number',
  },
  {
    type: 'permit',
    label: 'Permit upload',
    requiredAction: '/filePermitUpload',
    numberFieldLabel: 'Permit number',
    numberFieldPlaceholder: 'Enter permit number',
  },
]

const DOCUMENT_UPLOAD_STEPS = [
  { id: 'upload', label: 'Upload' },
  { id: 'review', label: 'Review' },
]

type UploadFormState = {
  applicationNumber: string
  exemptionNumber: string
  permitNumber: string
}

type UploadField = keyof UploadFormState | 'uploadFile'
type UploadWizardStep = 'upload' | 'review'

type QueuedUploadResult = {
  message: string
  details?: UploadQueueReviewDetails
}

type UploadTargetNumberOption = {
  value: string
  label: string
}

type UploadTargetNumberSelectProps = {
  id: string
  labelText: ReactNode
  value: string
  invalid?: boolean
  invalidText?: ReactNode
  required?: boolean
  disabled?: boolean
  searchOptions: (query: string) => Promise<UploadTargetNumberOption[]>
  normalizeInput?: (input: string) => string
  onBlur?: () => void
  onChange: (value: string) => void
}

const INITIAL_FORM_STATE: UploadFormState = {
  applicationNumber: '',
  exemptionNumber: '',
  permitNumber: '',
}

const getWorkflowFromQuery = (
  value: string | null,
  fallback: DataUploadWorkflowType = 'application',
): DataUploadWorkflowType => {
  if (value === 'application' || value === 'exemption' || value === 'permit') {
    return value
  }

  return fallback
}

const normalizeQueryValue = (value: string | null): string => {
  return (value ?? '').trim()
}

const buildInitialFormStateFromQuery = (query: URLSearchParams): UploadFormState => ({
  applicationNumber: normalizeQueryValue(query.get('applicationNumber')),
  exemptionNumber: normalizeQueryValue(query.get('exemptionNumber')),
  permitNumber: normalizeQueryValue(query.get('permitNumber')),
})

const trimTargetNumberInput = (input: string): string => input.trim()

// INTENTIONAL_LEGACY_DIVERGENCE(SEARCHABLE_UPLOAD_TARGET_WORKFLOW): Modern consolidates record-bound
// legacy upload pop-ups into searchable labelled inputs; both workflows persist the numeric target.
const trimLabeledTargetNumberInput = (input: string): string =>
  trimTargetNumberInput(input).split(' - ', 1)[0] ?? ''

const uploadTargetItemToString = (
  item: UploadTargetNumberOption | string | null | undefined,
): string => {
  if (typeof item === 'string') {
    return item
  }
  return item?.label ?? ''
}

function UploadTargetNumberSelect({
  id,
  labelText,
  value,
  invalid = false,
  invalidText,
  required = false,
  disabled = false,
  searchOptions,
  normalizeInput = trimTargetNumberInput,
  onBlur,
  onChange,
}: UploadTargetNumberSelectProps) {
  const [options, setOptions] = useState<UploadTargetNumberOption[]>([])
  const [inputText, setInputText] = useState(value)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    let ignore = false
    const timeout = window.setTimeout(() => {
      setIsLoading(true)
      void searchOptions(normalizeInput(inputText))
        .then((items) => {
          if (!ignore) {
            setOptions(items)
          }
        })
        .catch(() => {
          if (!ignore) {
            setOptions([])
          }
        })
        .finally(() => {
          if (!ignore) {
            setIsLoading(false)
          }
        })
    }, 250)

    return () => {
      ignore = true
      window.clearTimeout(timeout)
    }
  }, [inputText, normalizeInput, searchOptions])

  const selectedItem = useMemo<UploadTargetNumberOption | null>(() => {
    const matchingOption = options.find((option) => option.value === value)
    if (matchingOption) {
      return matchingOption
    }
    return value ? { value, label: value } : null
  }, [options, value])

  return (
    <ComboBox
      id={id}
      titleText={labelText}
      items={options}
      selectedItem={selectedItem}
      itemToString={uploadTargetItemToString}
      shouldFilterItem={({ item, inputValue }) =>
        shouldFilterSearchableDropdownItem({ item, inputValue, optionCount: options.length })
      }
      placeholder={isLoading ? 'Loading matches…' : 'Search by number'}
      allowCustomValue
      aria-required={required || undefined}
      invalid={invalid}
      invalidText={fieldErrorText(invalidText)}
      disabled={disabled}
      onBlur={onBlur}
      onInputChange={(inputValue) => {
        setInputText(inputValue)
        const nextValue = normalizeInput(inputValue)
        if (nextValue !== value) {
          onChange(nextValue)
        }
      }}
      onChange={({ selectedItem, inputValue }) => {
        const nextValue =
          typeof selectedItem === 'string'
            ? normalizeInput(selectedItem)
            : (selectedItem?.value ?? normalizeInput(inputValue ?? ''))
        if (nextValue === value) {
          return
        }
        onChange(nextValue)
      }}
    />
  )
}

const validateQueuedFile = (file: File): string => {
  if (!file.name.trim()) {
    return 'File name is required.'
  }

  if (file.size === 0) {
    return 'File is empty.'
  }

  const sizeError = validateUploadFileSize(file)
  if (sizeError) {
    return sizeError
  }

  return validateDocumentUploadFile(file)
}

const workflowDescription = (workflowType: DataUploadWorkflowType): string => {
  if (workflowType === 'application') {
    return 'Attach one or more documents to an existing provincial application.'
  }
  if (workflowType === 'exemption') {
    return 'Attach one or more documents to an existing exemption.'
  }
  return 'Attach one or more documents to an existing permit.'
}

const uploadTargetSummary = (
  workflowType: DataUploadWorkflowType,
  formState: UploadFormState,
): string => {
  if (workflowType === 'application') {
    return formState.applicationNumber
      ? `Application ${formState.applicationNumber}`
      : 'Application not selected'
  }
  if (workflowType === 'exemption') {
    return formState.exemptionNumber
      ? `Exemption ${formState.exemptionNumber}`
      : 'Exemption not selected'
  }
  return formState.permitNumber ? `Permit ${formState.permitNumber}` : 'Permit not selected'
}

const SUCCESS_TITLE = 'Upload submitted'

function UploadStepReviewButton({
  label,
  disabled,
  onReview,
}: {
  label: string
  disabled: boolean
  onReview: () => void
}) {
  return (
    <div className="admin-upload-fspts-button-row admin-upload-fspts-button-row--upload-step">
      <Button
        kind="primary"
        size="md"
        className="admin-upload-fspts-action-button"
        onClick={onReview}
        disabled={disabled}
        renderIcon={ArrowRight}
      >
        {label}
      </Button>
    </div>
  )
}

function AdminUploadsPage() {
  const { canPerform } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const initialWorkflow = getWorkflowFromQuery(searchParams.get('type'), 'application')
  const [selectedWorkflowType, setSelectedWorkflowType] =
    useState<DataUploadWorkflowType>(initialWorkflow)
  const [formState, setFormState] = useState<UploadFormState>(() =>
    buildInitialFormStateFromQuery(searchParams),
  )
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([])
  const [fileInputKey, setFileInputKey] = useState(0)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const uploadResultsRef = useRef<HTMLDivElement>(null)
  const [uploadResultsFocusRequest, setUploadResultsFocusRequest] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [touchedFields, setTouchedFields] = useState<TouchedFields<UploadField>>({})
  const [showValidationErrors, setShowValidationErrors] = useState(false)
  const [documentUploadStep, setDocumentUploadStep] = useState<UploadWizardStep>('upload')

  const selectedWorkflow = useMemo(() => {
    return (
      UPLOAD_WORKFLOW_DEFINITIONS.find((workflow) => workflow.type === selectedWorkflowType) ??
      UPLOAD_WORKFLOW_DEFINITIONS[0]
    )
  }, [selectedWorkflowType])

  const hasUploadAccess = canPerform(selectedWorkflow.requiredAction)

  const invalidUploadCount = useMemo(
    () => uploadQueue.filter((item) => item.status === 'invalid').length,
    [uploadQueue],
  )
  const invalidDescriptionCount = useMemo(
    () =>
      uploadQueue.filter(
        (item) =>
          item.status !== 'complete' &&
          !!validateDocumentUploadDescription(item.fileDescription ?? ''),
      ).length,
    [uploadQueue],
  )
  const currentUploadTargetSummary = uploadTargetSummary(selectedWorkflowType, formState)
  const isUploadInputLocked = !hasUploadAccess || isSubmitting

  const fieldErrors = useMemo<FieldErrors<UploadField>>(
    () => ({
      uploadFile:
        invalidUploadCount > 0
          ? `${invalidUploadCount} queued file${invalidUploadCount === 1 ? ' needs' : 's need'} attention before upload.`
          : invalidDescriptionCount > 0
            ? invalidDescriptionCount === 1
              ? '1 queued file has an invalid document description.'
              : `${invalidDescriptionCount} queued files have invalid document descriptions.`
            : uploadQueue.length > 0
              ? undefined
              : 'Choose at least one file to upload.',
      applicationNumber:
        selectedWorkflowType === 'application'
          ? (provincialApplicationNumberFieldError(
              formState.applicationNumber,
              'Application number',
              true,
            ) ?? undefined)
          : undefined,
      exemptionNumber:
        selectedWorkflowType === 'exemption'
          ? (requiredFieldError(formState.exemptionNumber, 'Exemption number') ?? undefined)
          : undefined,
      permitNumber:
        selectedWorkflowType === 'permit'
          ? (provincialApplicationNumberFieldError(formState.permitNumber, 'Permit number', true) ??
            undefined)
          : undefined,
    }),
    [
      formState,
      invalidDescriptionCount,
      invalidUploadCount,
      uploadQueue.length,
      selectedWorkflowType,
    ],
  )

  const validationErrors = useMemo(
    () => Object.values(fieldErrors).filter((error): error is string => !!error),
    [fieldErrors],
  )

  const markFieldTouched = (field: UploadField): void => {
    setTouchedFields((current) => ({ ...current, [field]: true }))
  }

  const fieldError = (field: UploadField): string | undefined =>
    getVisibleFieldError(field, fieldErrors, touchedFields, showValidationErrors)

  const setWorkflowType = (workflowType: DataUploadWorkflowType): void => {
    if (isSubmitting) {
      return
    }
    setSelectedWorkflowType(workflowType)
    setUploadQueue([])
    setFileInputKey((current) => current + 1)
    setErrorMessage('')
    setSuccessMessage('')
    setTouchedFields({})
    setShowValidationErrors(false)
    setDocumentUploadStep('upload')
    setSearchParams({ type: workflowType }, { replace: true })
  }

  const addFilesToQueue = (files: FileList | null): void => {
    if (isSubmitting || !files || files.length === 0) {
      return
    }
    setDocumentUploadStep('upload')
    setShowValidationErrors(true)

    const queuedAt = Date.now()
    const nextItemsByFileName = new Map<string, UploadQueueItem>()
    Array.from(files).forEach((file, index) => {
      const validationMessage = validateQueuedFile(file)

      nextItemsByFileName.set(uploadQueueFileKey(file), {
        id: `${queuedAt}-${index}-${file.name}-${file.size}`,
        file,
        fileDescription: '',
        workflowLabel: selectedWorkflow.label,
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
    markFieldTouched('uploadFile')
    setFileInputKey((current) => current + 1)
  }

  const clearUploadFeedback = (): void => {
    setErrorMessage('')
    setSuccessMessage('')
  }

  const removeQueuedFile = (id: string): void => {
    if (isSubmitting) return
    const nextLength = uploadQueue.filter((item) => item.id !== id).length
    setUploadQueue((current) => current.filter((item) => item.id !== id))
    if (nextLength === 0) {
      setDocumentUploadStep('upload')
    }
    clearUploadFeedback()
  }

  const updateFileDescription = (id: string, fileDescription: string): void => {
    if (!hasUploadAccess || isSubmitting) {
      return
    }
    setUploadQueue((current) =>
      current.map((item) =>
        item.id === id && !item.submitted && item.status !== 'complete'
          ? { ...item, fileDescription }
          : item,
      ),
    )
  }

  const clearQueuedFiles = (): void => {
    setUploadQueue([])
    setFileInputKey((current) => current + 1)
    setDocumentUploadStep('upload')
    clearUploadFeedback()
  }

  const resetUploadQueueAfterSuccess = (): void => {
    setUploadQueue([])
    setFileInputKey((current) => current + 1)
    setTouchedFields({})
    setShowValidationErrors(false)
    setDocumentUploadStep('upload')
  }

  const setQueueItemStatus = useCallback(
    (
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
    },
    [],
  )

  const submitQueuedFile = async (item: UploadQueueItem): Promise<QueuedUploadResult> => {
    const file = item.file
    if (selectedWorkflowType === 'application') {
      const result = await submitAdminUpload('application', {
        applicationNumber: normalizeProvincialApplicationNumber(formState.applicationNumber),
        file,
        fileDescription: (item.fileDescription ?? '').trim(),
      })
      const message = buildUploadResultMessage(
        'application',
        'Application document upload submitted.',
        result,
      )
      return {
        message,
        details: buildUploadReviewDetails(message, result),
      }
    }

    if (selectedWorkflowType === 'exemption') {
      const result = await submitAdminUpload('exemption', {
        exemptionNumber: formState.exemptionNumber.trim(),
        file,
        fileDescription: (item.fileDescription ?? '').trim(),
      })
      const message = buildUploadResultMessage(
        'exemption',
        'Exemption document upload submitted.',
        result,
      )
      return {
        message,
        details: buildUploadReviewDetails(message, result),
      }
    }

    const result = await submitAdminUpload('permit', {
      permitNumber: formState.permitNumber.trim(),
      file,
      fileDescription: (item.fileDescription ?? '').trim(),
    })
    const message = buildUploadResultMessage('permit', 'Permit document upload submitted.', result)
    return {
      message,
      details: buildUploadReviewDetails(message, result),
    }
  }

  // Focus follows a submit to its result; a fully submitted queue no longer has a Submit button.
  useEffect(() => {
    if (uploadResultsFocusRequest === 0) {
      return
    }
    const frame = requestAnimationFrame(() =>
      uploadResultsRef.current?.focus({ preventScroll: true }),
    )
    return () => cancelAnimationFrame(frame)
  }, [uploadResultsFocusRequest])

  const onSubmitUpload = async (): Promise<void> => {
    setErrorMessage('')
    setSuccessMessage('')

    if (!hasUploadAccess) {
      setErrorMessage('Your session does not include the required upload permission.')
      return
    }

    if (validationErrors.length > 0) {
      setShowValidationErrors(true)
      setErrorMessage(validationErrors.join(' '))
      return
    }

    if (uploadQueue.length === 0) {
      setErrorMessage('Choose at least one file to upload.')
      return
    }

    setIsSubmitting(true)

    let successCount = 0
    let failureCount = 0
    let lastSuccessMessage = ''

    for (const item of uploadQueue) {
      if (item.status === 'complete' || item.status === 'invalid') {
        continue
      }

      setQueueItemStatus(item.id, 'uploading', '', currentUploadTargetSummary)

      try {
        const result = await submitQueuedFile(item)
        successCount += 1
        lastSuccessMessage = result.message
        setQueueItemStatus(
          item.id,
          'complete',
          result.message,
          currentUploadTargetSummary,
          result.details,
        )
      } catch (error) {
        failureCount += 1
        const uploadError = extractUploadErrorDetails(error, GENERIC_UPLOAD_FAILURE_MESSAGE)
        setQueueItemStatus(
          item.id,
          'failed',
          uploadError.message,
          currentUploadTargetSummary,
          uploadError.details,
        )
      }
    }

    if (successCount > 0) {
      setSuccessMessage(
        successCount === 1
          ? lastSuccessMessage
          : `${successCount} files uploaded. Verify updates in the target details view.`,
      )
      setUploadResultsFocusRequest((current) => current + 1)
      if (failureCount === 0) {
        resetUploadQueueAfterSuccess()
      }
    }

    if (failureCount > 0) {
      setErrorMessage(
        `${failureCount} file${failureCount === 1 ? '' : 's'} failed. Review the queue for details.`,
      )
    }

    setIsSubmitting(false)
  }

  const onReset = (): void => {
    setFormState(INITIAL_FORM_STATE)
    clearQueuedFiles()
    setErrorMessage('')
    setSuccessMessage('')
    setTouchedFields({})
    setShowValidationErrors(false)
    setDocumentUploadStep('upload')
  }

  const activeCompletedSteps = documentUploadStep === 'review' ? ['upload'] : []
  const uploadActionResults: ActionResult[] = [
    ...(successMessage
      ? [{ kind: 'success' as const, title: SUCCESS_TITLE, message: successMessage }]
      : []),
    ...(errorMessage
      ? [{ kind: 'error' as const, title: 'Upload error', message: errorMessage }]
      : []),
  ]
  const dismissUploadResult = ({ kind }: ActionResult) =>
    kind === 'error' ? setErrorMessage('') : setSuccessMessage('')
  const canSubmitDocumentUpload = hasUploadAccess && validationErrors.length === 0
  const renderQueuedFileDescription = (item: UploadQueueItem): ReactNode => {
    const description = item.fileDescription ?? ''
    const error = validateDocumentUploadDescription(description)

    return (
      <TextArea
        id={`adminUploadDescription-${encodeURIComponent(item.id)}`}
        labelText={`Document description for ${item.file.name} (optional)`}
        value={description}
        onChange={(event) => updateFileDescription(item.id, event.target.value)}
        invalid={!!error}
        invalidText={fieldErrorText(error)}
        enableCounter
        maxCount={250}
        rows={2}
        disabled={
          !hasUploadAccess || isSubmitting || !!item.submitted || item.status === 'complete'
        }
      />
    )
  }
  const uploadSettingsPanel = (
    <section className="admin-upload-panel" aria-labelledby="admin-upload-settings-title">
      <div className="admin-upload-panel__header">
        <div>
          <h2 id="admin-upload-settings-title">{selectedWorkflow.label}</h2>
          <p>{workflowDescription(selectedWorkflowType)}</p>
        </div>
      </div>

      <div className="legacy-search-grid admin-upload-settings-grid">
        <SearchableSelect
          id="uploadWorkflowType"
          labelText="Upload type"
          disabled={isSubmitting}
          value={selectedWorkflowType}
          options={UPLOAD_WORKFLOW_DEFINITIONS.map((workflow) => ({
            value: workflow.type,
            label: workflow.label,
          }))}
          onChange={(value) => setWorkflowType(getWorkflowFromQuery(value, 'application'))}
        />

        {selectedWorkflowType === 'application' && (
          <ApplicationNumberSelect
            id="applicationNumber"
            labelText={selectedWorkflow.numberFieldLabel}
            disabled={isSubmitting}
            required
            value={formState.applicationNumber}
            invalid={!!fieldError('applicationNumber')}
            invalidText={fieldError('applicationNumber')}
            onBlur={() => markFieldTouched('applicationNumber')}
            onChange={(value) =>
              setFormState((current) => ({
                ...current,
                applicationNumber: value,
              }))
            }
          />
        )}

        {selectedWorkflowType === 'exemption' && (
          <UploadTargetNumberSelect
            id="exemptionNumber"
            labelText={selectedWorkflow.numberFieldLabel}
            disabled={isSubmitting}
            required
            value={formState.exemptionNumber}
            invalid={!!fieldError('exemptionNumber')}
            invalidText={fieldError('exemptionNumber')}
            searchOptions={searchProvincialExemptionNumberOptions}
            normalizeInput={trimLabeledTargetNumberInput}
            onBlur={() => markFieldTouched('exemptionNumber')}
            onChange={(value) =>
              setFormState((current) => ({
                ...current,
                exemptionNumber: value,
              }))
            }
          />
        )}

        {selectedWorkflowType === 'permit' && (
          <UploadTargetNumberSelect
            id="permitNumber"
            labelText={selectedWorkflow.numberFieldLabel}
            disabled={isSubmitting}
            required
            value={formState.permitNumber}
            invalid={!!fieldError('permitNumber')}
            invalidText={fieldError('permitNumber')}
            searchOptions={searchProvincialPermitNumberOptions}
            normalizeInput={trimLabeledTargetNumberInput}
            onBlur={() => markFieldTouched('permitNumber')}
            onChange={(value) =>
              setFormState((current) => ({
                ...current,
                permitNumber: value,
              }))
            }
          />
        )}
      </div>

      <MultiFileDropZone
        title="Upload documents"
        description={DOCUMENT_UPLOAD_GUIDANCE}
        inputId="uploadFile"
        inputKey={fileInputKey}
        inputLabel="Document File"
        required
        accept={DOCUMENT_UPLOAD_ACCEPT}
        invalidText={fieldError('uploadFile')}
        disabled={isUploadInputLocked}
        disabledDescription={
          isSubmitting
            ? 'Upload is submitting.'
            : 'Your session does not include the required upload permission.'
        }
        renderAsPanel={false}
        variant="fspts"
        onFilesSelected={addFilesToQueue}
      />
    </section>
  )

  return (
    <Grid fullWidth className="default-grid admin-upload-fspts-page">
      <Column sm={4} md={8} lg={16} className="admin-upload-fspts-header">
        <PageHeader
          title="Data Upload"
          subtitle="Upload documents and review selected files before submitting."
          style={{ marginBlockEnd: '1.5rem' }}
        />
        <UploadWorkflowProgress
          steps={DOCUMENT_UPLOAD_STEPS}
          currentStepId={documentUploadStep}
          completedStepIds={activeCompletedSteps}
          ariaLabel="Upload queue workflow progress"
        />
      </Column>

      <Column sm={4} md={8} lg={16} className="admin-upload-fspts-content">
        <div className="admin-upload-workflow">
          <div ref={uploadResultsRef} tabIndex={-1}>
            <ActionResultNotifications
              results={uploadActionResults}
              onClose={dismissUploadResult}
            />
          </div>

          {documentUploadStep === 'upload' ? (
            <>
              <div className="admin-upload-section-heading">
                <h2 id="admin-upload-step-title">Upload</h2>
                <p>Select documents to prepare before reviewing and submitting the upload.</p>
              </div>

              {uploadSettingsPanel}

              {uploadQueue.length > 0 ? (
                <UploadQueuePreview
                  items={uploadQueue}
                  targetSummary={currentUploadTargetSummary}
                  canSubmit={canSubmitDocumentUpload}
                  canReview={canSubmitDocumentUpload}
                  isSubmitting={isSubmitting}
                  currentStepId={documentUploadStep}
                  actionsPlacement="footer"
                  emptyDescription="Upload files to validate before review."
                  onReview={() => setDocumentUploadStep('review')}
                  onSubmit={() => void onSubmitUpload()}
                  onReset={onReset}
                  onClear={clearQueuedFiles}
                  onRemove={removeQueuedFile}
                  renderFileDescription={renderQueuedFileDescription}
                  showWorkflowProgress={false}
                />
              ) : (
                <UploadStepReviewButton
                  label="Review upload"
                  disabled
                  onReview={() => setDocumentUploadStep('review')}
                />
              )}
            </>
          ) : (
            <>
              <div className="admin-upload-section-heading">
                <h2 id="admin-upload-review-title">Review</h2>
                <p>Review selected files and target details before submitting.</p>
              </div>

              {uploadSettingsPanel}

              <UploadQueuePreview
                items={uploadQueue}
                targetSummary={currentUploadTargetSummary}
                canSubmit={canSubmitDocumentUpload}
                isSubmitting={isSubmitting}
                currentStepId="review"
                actionsPlacement="footer"
                previewTitle="Data preview"
                onBack={() => setDocumentUploadStep('upload')}
                onSubmit={() => void onSubmitUpload()}
                onReset={onReset}
                onClear={clearQueuedFiles}
                onRemove={removeQueuedFile}
                renderFileDescription={renderQueuedFileDescription}
                showWorkflowProgress={false}
              />
            </>
          )}
        </div>
      </Column>
    </Grid>
  )
}

export default AdminUploadsPage
