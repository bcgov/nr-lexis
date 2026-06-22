import { useEffect, useMemo, useState, type FC, type ReactNode } from 'react'
import { Column, ComboBox, Grid, Tag, TextArea, TextInput } from '@carbon/react'
import { Link, useSearchParams } from 'react-router-dom'
import { AppNotification } from '@/components/AppNotification'
import ApplicationNumberSelect from '@/components/ApplicationNumberSelect'
import SearchableSelect from '@/components/SearchableSelect'
import MultiFileDropZone from '@/components/uploads/MultiFileDropZone'
import UploadQueuePreview from '@/components/uploads/UploadQueuePreview'
import { buildLexisXmlPreviewMessage } from '@/components/uploads/lexisXmlPreview'
import {
  buildUploadResultMessage,
  buildUploadReviewDetails,
  extractUploadErrorDetails,
  GENERIC_SUBMISSION_FAILURE_MESSAGE,
  GENERIC_UPLOAD_FAILURE_MESSAGE,
  getFileExtension,
} from '@/components/uploads/uploadQueueHelpers'
import type {
  UploadQueueItem,
  UploadQueueReviewDetails,
  UploadQueueStatus,
} from '@/components/uploads/uploadQueueTypes'
import { useAuth } from '@/context/auth/useAuth'
import {
  getVisibleFieldError,
  maxLengthFieldError,
  requiredFieldError,
  requiredMaxLengthFieldError,
  requiredPositiveNumericFieldError,
  type FieldErrors,
  type TouchedFields,
} from '@/pages/shared/create-form-utils'
import {
  submitAdminUpload,
  validateApplicationSubmissionUpload,
  type AdminUploadResult,
  type UploadWorkflowType,
} from '@/service/admin-upload-service'
import { searchProvincialExemptionNumberOptions } from '@/service/provincial-exemption-search-service'
import { searchProvincialPermitNumberOptions } from '@/service/provincial-permit-search-service'
import { leadingDigits } from '@/utils/text'

type UploadWorkflowDefinition = {
  type: UploadWorkflowType
  label: string
  requiredAction: string
  numberFieldLabel: string
  numberFieldPlaceholder: string
}

type AdminUploadsPageProps = {
  lockedWorkflowType?: UploadWorkflowType
  pageTitle?: string
}

const UPLOAD_WORKFLOW_DEFINITIONS: UploadWorkflowDefinition[] = [
  {
    type: 'applicationSubmission',
    label: 'Application submission upload',
    requiredAction: 'uploadApplicationSubmission',
    numberFieldLabel: '',
    numberFieldPlaceholder: '',
  },
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
  {
    type: 'invoice',
    label: 'Invoice upload',
    requiredAction: '/fileInvoiceUpload',
    numberFieldLabel: 'Permit number',
    numberFieldPlaceholder: 'Enter permit number for invoice',
  },
]

const DOCUMENT_UPLOAD_WORKFLOW_DEFINITIONS = UPLOAD_WORKFLOW_DEFINITIONS.filter(
  (workflow) => workflow.type !== 'applicationSubmission',
)

type UploadFormState = {
  applicationNumber: string
  exemptionNumber: string
  permitNumber: string
  salesInvoiceNumber: string
  invoiceExportValue: string
  invoiceConversionRate: string
  invoiceFeeInLieu: string
  fileDescription: string
  userReference: string
}

type UploadField = keyof UploadFormState | 'uploadFile'

type QueuedUploadResult = {
  message: string
  applicationNumber?: number
  details?: UploadQueueReviewDetails
  failed?: boolean
}

const isApplicationSubmissionValidationFailure = (result: AdminUploadResult): boolean => {
  const status = result.status?.trim().toLowerCase()
  if (status === 'rejected' || status === 'failed' || status === 'invalid') {
    return true
  }
  if (status && status !== 'validated') {
    return true
  }
  return Array.isArray(result.errors) && result.errors.length > 0
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
  searchOptions: (query: string) => Promise<UploadTargetNumberOption[]>
  normalizeInput?: (input: string) => string
  onBlur?: () => void
  onChange: (value: string) => void
}

const INITIAL_FORM_STATE: UploadFormState = {
  applicationNumber: '',
  exemptionNumber: '',
  permitNumber: '',
  salesInvoiceNumber: '',
  invoiceExportValue: '',
  invoiceConversionRate: '1.00',
  invoiceFeeInLieu: '1.00',
  fileDescription: '',
  userReference: '',
}

const getWorkflowFromQuery = (
  value: string | null,
  fallback: UploadWorkflowType = 'application',
  allowApplicationSubmission = true,
): UploadWorkflowType => {
  if (
    value === 'application' ||
    value === 'exemption' ||
    value === 'permit' ||
    value === 'invoice'
  ) {
    return value
  }

  if (allowApplicationSubmission && value === 'applicationSubmission') {
    return value
  }

  return fallback
}

const normalizeQueryValue = (value: string | null): string => {
  return (value ?? '').trim()
}

const buildInitialFormStateFromQuery = (query: URLSearchParams): UploadFormState => {
  const invoiceConversionRate = normalizeQueryValue(query.get('invoiceConversionRate'))
  const invoiceFeeInLieu = normalizeQueryValue(query.get('invoiceFeeInLieu'))

  return {
    ...INITIAL_FORM_STATE,
    applicationNumber: normalizeQueryValue(query.get('applicationNumber')),
    exemptionNumber: normalizeQueryValue(query.get('exemptionNumber')),
    permitNumber: normalizeQueryValue(query.get('permitNumber')),
    salesInvoiceNumber: normalizeQueryValue(query.get('salesInvoiceNumber')),
    invoiceExportValue: normalizeQueryValue(query.get('invoiceExportValue')),
    invoiceConversionRate: invoiceConversionRate || INITIAL_FORM_STATE.invoiceConversionRate,
    invoiceFeeInLieu: invoiceFeeInLieu || INITIAL_FORM_STATE.invoiceFeeInLieu,
    fileDescription: normalizeQueryValue(query.get('fileDescription')),
    userReference: normalizeQueryValue(query.get('userReference')),
  }
}

const trimTargetNumberInput = (input: string): string => input.trim()

const uploadTargetItemToString = (
  item: UploadTargetNumberOption | string | null | undefined,
): string => {
  if (typeof item === 'string') {
    return item
  }
  return item?.label ?? ''
}

const shouldFilterUploadTargetItem = ({
  item,
  inputValue,
}: {
  item: UploadTargetNumberOption
  inputValue: string | null
}): boolean => {
  const query = inputValue?.trim().toLowerCase()
  if (!query) {
    return true
  }

  return item.label.toLowerCase().includes(query) || item.value.toLowerCase().includes(query)
}

const UploadTargetNumberSelect: FC<UploadTargetNumberSelectProps> = ({
  id,
  labelText,
  value,
  invalid = false,
  invalidText,
  searchOptions,
  normalizeInput = trimTargetNumberInput,
  onBlur,
  onChange,
}) => {
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
      shouldFilterItem={shouldFilterUploadTargetItem}
      placeholder={isLoading ? 'Loading matches...' : 'Search by number'}
      allowCustomValue
      invalid={invalid}
      invalidText={invalidText}
      onBlur={onBlur}
      onInputChange={(inputValue) => {
        setInputText(inputValue)
        onChange(normalizeInput(inputValue))
      }}
      onChange={({ selectedItem, inputValue }) => {
        if (typeof selectedItem === 'string') {
          onChange(normalizeInput(selectedItem))
          return
        }
        onChange(selectedItem?.value ?? normalizeInput(inputValue ?? ''))
      }}
    />
  )
}

const validateQueuedFile = (file: File, workflowType: UploadWorkflowType): string => {
  if (!file.name.trim()) {
    return 'File name is required.'
  }

  if (file.size === 0) {
    return 'File is empty.'
  }

  const extension = getFileExtension(file.name)

  if (workflowType === 'applicationSubmission') {
    return ''
  }

  if (!extension) {
    return 'Document uploads need a file extension so LEXIS can resolve the file type.'
  }

  return ''
}

const workflowDescription = (workflowType: UploadWorkflowType): string => {
  if (workflowType === 'applicationSubmission') {
    return 'Upload ESF LEXIS XML or GeoJSON application submissions, including package, species, and scale rows.'
  }
  if (workflowType === 'invoice') {
    return 'Attach an invoice file and invoice values to an existing permit.'
  }
  if (workflowType === 'application') {
    return 'Attach one or more documents to an existing provincial application.'
  }
  if (workflowType === 'exemption') {
    return 'Attach one or more documents to an existing exemption.'
  }
  return 'Attach one or more documents to an existing permit.'
}

const uploadTargetSummary = (
  workflowType: UploadWorkflowType,
  formState: UploadFormState,
): string => {
  if (workflowType === 'applicationSubmission') {
    return 'Creates a new application'
  }
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
  if (workflowType === 'permit') {
    return formState.permitNumber ? `Permit ${formState.permitNumber}` : 'Permit not selected'
  }

  const permitTarget = formState.permitNumber
    ? `Permit ${formState.permitNumber}`
    : 'Permit not selected'
  const invoiceTarget = formState.salesInvoiceNumber
    ? `invoice ${formState.salesInvoiceNumber}`
    : 'invoice not selected'
  return `${permitTarget}; ${invoiceTarget}`
}

const defaultSuccessTitle = (workflowType: UploadWorkflowType): string =>
  workflowType === 'applicationSubmission' ? 'Application submission complete' : 'Upload submitted'

const AdminUploadsPage: FC<AdminUploadsPageProps> = ({ lockedWorkflowType, pageTitle }) => {
  const { canPerform } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const initialWorkflow =
    lockedWorkflowType ?? getWorkflowFromQuery(searchParams.get('type'), 'application', false)
  const [selectedWorkflowType, setSelectedWorkflowType] =
    useState<UploadWorkflowType>(initialWorkflow)
  const [formState, setFormState] = useState<UploadFormState>(() =>
    buildInitialFormStateFromQuery(searchParams),
  )
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([])
  const [fileInputKey, setFileInputKey] = useState(0)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [successTitle, setSuccessTitle] = useState(() => defaultSuccessTitle(initialWorkflow))
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [touchedFields, setTouchedFields] = useState<TouchedFields<UploadField>>({})
  const [showValidationErrors, setShowValidationErrors] = useState(false)

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
  const uploadInputLabel =
    selectedWorkflowType === 'applicationSubmission'
      ? 'Application submission file'
      : 'Document File'
  const uploadAccept =
    selectedWorkflowType === 'applicationSubmission'
      ? '.xml,.zip,.geojson,.json,application/xml,text/xml,application/zip,application/json,application/geo+json'
      : undefined
  const uploadFormatText =
    selectedWorkflowType === 'applicationSubmission'
      ? 'Supported application submission formats: .xml, .zip, .geojson, and .json'
      : 'Supported files: any document with a file extension'
  const currentUploadTargetSummary = uploadTargetSummary(selectedWorkflowType, formState)
  const resolvedPageTitle =
    pageTitle ??
    (selectedWorkflowType === 'applicationSubmission'
      ? 'Upload Application Submission'
      : 'Data Upload')
  const hasQueuedLexisSubmissions =
    selectedWorkflowType === 'applicationSubmission' &&
    uploadQueue.some((item) => item.status === 'queued')
  const hasValidatedLexisSubmissions =
    selectedWorkflowType === 'applicationSubmission' &&
    uploadQueue.some((item) => item.status === 'validated')
  const hasLockedLexisSubmissions =
    selectedWorkflowType === 'applicationSubmission' &&
    uploadQueue.some(
      (item) =>
        item.status === 'validated' || item.status === 'uploading' || item.status === 'complete',
    )
  const applicationSubmissionActionNoun =
    selectedWorkflowType === 'applicationSubmission' && uploadQueue.length === 1
      ? 'submission'
      : 'submissions'
  const isUploadInputLocked =
    !hasUploadAccess ||
    (selectedWorkflowType === 'applicationSubmission' && hasLockedLexisSubmissions)
  const submitButtonLabel =
    selectedWorkflowType === 'applicationSubmission'
      ? hasQueuedLexisSubmissions || !hasValidatedLexisSubmissions
        ? `Validate ${applicationSubmissionActionNoun}`
        : `Finalize ${applicationSubmissionActionNoun}`
      : 'Submit Upload'
  const submittingButtonLabel =
    selectedWorkflowType === 'applicationSubmission' && hasQueuedLexisSubmissions
      ? `Validating ${applicationSubmissionActionNoun}...`
      : selectedWorkflowType === 'applicationSubmission'
        ? `Finalizing ${applicationSubmissionActionNoun}...`
        : 'Submitting...'

  const fieldErrors = useMemo<FieldErrors<UploadField>>(
    () => ({
      uploadFile:
        invalidUploadCount > 0
          ? `${invalidUploadCount} queued file${invalidUploadCount === 1 ? ' needs' : 's need'} attention before upload.`
          : uploadQueue.length > 0
            ? undefined
            : selectedWorkflowType === 'applicationSubmission'
              ? 'Choose at least one application submission file.'
              : 'Choose at least one file to upload.',
      applicationNumber:
        selectedWorkflowType === 'application'
          ? (requiredFieldError(formState.applicationNumber, 'Application number') ?? undefined)
          : undefined,
      exemptionNumber:
        selectedWorkflowType === 'exemption'
          ? (requiredFieldError(formState.exemptionNumber, 'Exemption number') ?? undefined)
          : undefined,
      permitNumber:
        selectedWorkflowType === 'permit' || selectedWorkflowType === 'invoice'
          ? (requiredFieldError(formState.permitNumber, 'Permit number') ?? undefined)
          : undefined,
      salesInvoiceNumber:
        selectedWorkflowType === 'invoice'
          ? requiredMaxLengthFieldError(formState.salesInvoiceNumber, 9, 'Invoice number')
          : undefined,
      invoiceExportValue:
        selectedWorkflowType === 'invoice'
          ? requiredPositiveNumericFieldError(formState.invoiceExportValue, 'Invoice export value')
          : undefined,
      invoiceConversionRate:
        selectedWorkflowType === 'invoice'
          ? requiredPositiveNumericFieldError(
              formState.invoiceConversionRate,
              'Invoice conversion rate',
            )
          : undefined,
      invoiceFeeInLieu:
        selectedWorkflowType === 'invoice'
          ? requiredPositiveNumericFieldError(formState.invoiceFeeInLieu, 'Invoice fee in lieu')
          : undefined,
      userReference:
        selectedWorkflowType === 'applicationSubmission'
          ? maxLengthFieldError(formState.userReference, 50, 'User reference')
          : undefined,
    }),
    [formState, invalidUploadCount, uploadQueue.length, selectedWorkflowType],
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

  const setWorkflowType = (workflowType: UploadWorkflowType): void => {
    if (lockedWorkflowType) {
      return
    }
    setSelectedWorkflowType(workflowType)
    setUploadQueue([])
    setFileInputKey((current) => current + 1)
    setErrorMessage('')
    setSuccessMessage('')
    setSuccessTitle(defaultSuccessTitle(workflowType))
    setShowValidationErrors(false)
    setSearchParams({ type: workflowType }, { replace: true })
  }

  const addFilesToQueue = (files: FileList | null): void => {
    if (!files || files.length === 0) {
      return
    }

    const queuedAt = Date.now()
    const nextItems = Array.from(files).map((file, index) => {
      const validationMessage = validateQueuedFile(file, selectedWorkflowType)

      return {
        id: `${queuedAt}-${index}-${file.name}-${file.size}`,
        file,
        workflowLabel: selectedWorkflow.label,
        queuedAt,
        status: validationMessage ? ('invalid' as const) : ('queued' as const),
        message: validationMessage,
        details: validationMessage
          ? { summary: validationMessage, errors: [validationMessage] }
          : undefined,
      }
    })

    setUploadQueue((current) => [...current, ...nextItems])
    if (selectedWorkflowType === 'applicationSubmission') {
      nextItems
        .filter((item) => item.status === 'queued')
        .forEach((item) => {
          void buildLexisXmlPreviewMessage(item.file).then((message) => {
            if (!message) {
              return
            }
            setUploadQueue((current) =>
              current.map((currentItem) =>
                currentItem.id === item.id &&
                currentItem.status === 'queued' &&
                !currentItem.message
                  ? {
                      ...currentItem,
                      message,
                      details: { ...currentItem.details, summary: message },
                    }
                  : currentItem,
              ),
            )
          })
        })
    }
    setErrorMessage('')
    setSuccessMessage('')
    setSuccessTitle(defaultSuccessTitle(selectedWorkflowType))
    markFieldTouched('uploadFile')
    setFileInputKey((current) => current + 1)
  }

  const clearUploadFeedback = (): void => {
    setErrorMessage('')
    setSuccessMessage('')
    setSuccessTitle(defaultSuccessTitle(selectedWorkflowType))
  }

  const removeQueuedFile = (id: string): void => {
    setUploadQueue((current) => current.filter((item) => item.id !== id))
    clearUploadFeedback()
  }

  const clearQueuedFiles = (): void => {
    setUploadQueue([])
    setFileInputKey((current) => current + 1)
    clearUploadFeedback()
  }

  const setQueueItemStatus = (
    id: string,
    status: UploadQueueStatus,
    message = '',
    resultApplicationNumber?: number,
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
              resultApplicationNumber,
              targetSummary: targetSummary ?? item.targetSummary,
            }
          : item,
      ),
    )
  }

  const submitQueuedFile = async (item: UploadQueueItem): Promise<QueuedUploadResult> => {
    const file = item.file
    if (selectedWorkflowType === 'applicationSubmission') {
      const result = await submitAdminUpload('applicationSubmission', {
        file,
        userReference: item.details?.userReference?.trim() ?? formState.userReference.trim(),
      })
      const message = buildUploadResultMessage(
        'applicationSubmission',
        'LEXIS application submission created. Verify the created application and package details.',
        result,
      )
      return {
        message,
        applicationNumber: result.applicationNumber,
        details: buildUploadReviewDetails(message, result),
      }
    }

    if (selectedWorkflowType === 'application') {
      const result = await submitAdminUpload('application', {
        applicationNumber: formState.applicationNumber.trim(),
        file,
        fileDescription: formState.fileDescription.trim(),
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
        fileDescription: formState.fileDescription.trim(),
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

    if (selectedWorkflowType === 'permit') {
      const result = await submitAdminUpload('permit', {
        permitNumber: formState.permitNumber.trim(),
        file,
        fileDescription: formState.fileDescription.trim(),
      })
      const message = buildUploadResultMessage(
        'permit',
        'Permit document upload submitted.',
        result,
      )
      return {
        message,
        details: buildUploadReviewDetails(message, result),
      }
    }

    const result = await submitAdminUpload('invoice', {
      permitNumber: formState.permitNumber.trim(),
      salesInvoiceNumber: formState.salesInvoiceNumber.trim(),
      invoiceExportValue: formState.invoiceExportValue.trim(),
      invoiceConversionRate: formState.invoiceConversionRate.trim(),
      invoiceFeeInLieu: formState.invoiceFeeInLieu.trim(),
      file,
      fileDescription: formState.fileDescription.trim(),
    })
    const message = buildUploadResultMessage('invoice', 'Invoice upload submitted.', result)
    return {
      message,
      details: buildUploadReviewDetails(message, result),
    }
  }

  const validateQueuedLexisFile = async (file: File): Promise<QueuedUploadResult> => {
    const result = await validateApplicationSubmissionUpload({
      file,
      userReference: formState.userReference.trim(),
    })
    if (isApplicationSubmissionValidationFailure(result)) {
      const uploadError = extractUploadErrorDetails(
        { response: { data: result } },
        'Submission validation failed. Please try again. If the problem persists, contact your administrator.',
      )
      return {
        message: uploadError.message,
        details: uploadError.details,
        failed: true,
      }
    }

    const message = buildUploadResultMessage(
      'applicationSubmission',
      'LEXIS application submission validated. Review the summary before finalizing application submissions.',
      result,
    )
    return {
      message,
      details: buildUploadReviewDetails(message, result),
    }
  }

  const validateLexisQueue = async (): Promise<void> => {
    let successCount = 0
    let failureCount = 0
    let lastSuccessMessage = ''

    for (const item of uploadQueue) {
      if (item.status !== 'queued') {
        continue
      }

      setQueueItemStatus(item.id, 'validating', '', undefined, currentUploadTargetSummary)

      try {
        const result = await validateQueuedLexisFile(item.file)
        if (result.failed) {
          failureCount += 1
          setQueueItemStatus(
            item.id,
            'failed',
            result.message,
            undefined,
            currentUploadTargetSummary,
            result.details,
          )
          continue
        }

        successCount += 1
        lastSuccessMessage = result.message
        setQueueItemStatus(
          item.id,
          'validated',
          result.message,
          undefined,
          currentUploadTargetSummary,
          result.details,
        )
      } catch (error) {
        failureCount += 1
        const uploadError = extractUploadErrorDetails(
          error,
          'Submission validation failed. Please try again. If the problem persists, contact your administrator.',
        )
        setQueueItemStatus(
          item.id,
          'failed',
          uploadError.message,
          undefined,
          currentUploadTargetSummary,
          uploadError.details,
        )
      }
    }

    if (successCount > 0) {
      setSuccessTitle(successCount === 1 ? 'Submission validated' : 'Submissions validated')
      setSuccessMessage(
        successCount === 1
          ? lastSuccessMessage
          : `${successCount} application submissions validated. Review the submission summary and finalize submissions.`,
      )
    }

    if (failureCount > 0) {
      setErrorMessage(
        `${failureCount} submission${failureCount === 1 ? '' : 's'} failed validation. Review the queue for details.`,
      )
    }
  }

  const submitValidatedLexisQueue = async (): Promise<void> => {
    let successCount = 0
    let failureCount = 0
    let lastSuccessMessage = ''

    for (const item of uploadQueue) {
      if (item.status !== 'validated') {
        continue
      }

      setQueueItemStatus(item.id, 'uploading', '', undefined, currentUploadTargetSummary)

      try {
        const result = await submitQueuedFile(item)
        successCount += 1
        lastSuccessMessage = result.message
        setQueueItemStatus(
          item.id,
          'complete',
          result.message,
          result.applicationNumber,
          currentUploadTargetSummary,
          result.details,
        )
      } catch (error) {
        failureCount += 1
        const uploadError = extractUploadErrorDetails(error, GENERIC_SUBMISSION_FAILURE_MESSAGE)
        setQueueItemStatus(
          item.id,
          'failed',
          uploadError.message,
          undefined,
          currentUploadTargetSummary,
          uploadError.details,
        )
      }
    }

    if (successCount > 0) {
      setSuccessTitle(
        successCount === 1 ? 'Application submission complete' : 'Application submissions complete',
      )
      setSuccessMessage(
        successCount === 1
          ? lastSuccessMessage
          : `${successCount} application submissions created. Verify the created application and package details.`,
      )
    }

    if (failureCount > 0) {
      setErrorMessage(
        `${failureCount} submission${failureCount === 1 ? '' : 's'} failed. Review the queue for details.`,
      )
    }
  }

  const onSubmitUpload = async (): Promise<void> => {
    setErrorMessage('')
    setSuccessMessage('')
    setSuccessTitle(defaultSuccessTitle(selectedWorkflowType))

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
      setErrorMessage(
        selectedWorkflowType === 'applicationSubmission'
          ? 'Choose at least one application submission file.'
          : 'Choose at least one file to upload.',
      )
      return
    }

    setIsSubmitting(true)

    if (selectedWorkflowType === 'applicationSubmission') {
      if (uploadQueue.some((item) => item.status === 'queued')) {
        await validateLexisQueue()
      } else if (uploadQueue.some((item) => item.status === 'validated')) {
        await submitValidatedLexisQueue()
      } else {
        setErrorMessage('No application submissions are ready to validate or submit.')
      }
      setIsSubmitting(false)
      return
    }

    let successCount = 0
    let failureCount = 0
    let lastSuccessMessage = ''

    for (const item of uploadQueue) {
      if (item.status === 'complete' || item.status === 'invalid') {
        continue
      }

      setQueueItemStatus(item.id, 'uploading', '', undefined, currentUploadTargetSummary)

      try {
        const result = await submitQueuedFile(item)
        successCount += 1
        lastSuccessMessage = result.message
        setQueueItemStatus(
          item.id,
          'complete',
          result.message,
          result.applicationNumber,
          currentUploadTargetSummary,
          result.details,
        )
      } catch (error) {
        failureCount += 1
        const uploadError = extractUploadErrorDetails(
          error,
          selectedWorkflowType === 'applicationSubmission'
            ? GENERIC_SUBMISSION_FAILURE_MESSAGE
            : GENERIC_UPLOAD_FAILURE_MESSAGE,
        )
        setQueueItemStatus(
          item.id,
          'failed',
          uploadError.message,
          undefined,
          currentUploadTargetSummary,
          uploadError.details,
        )
      }
    }

    if (successCount > 0) {
      setSuccessMessage(
        successCount === 1
          ? lastSuccessMessage
          : selectedWorkflowType === 'applicationSubmission'
            ? `${successCount} application submissions created. Verify the created application and package details.`
            : `${successCount} files uploaded. Verify updates in the target details view.`,
      )
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
    setSuccessTitle(defaultSuccessTitle(selectedWorkflowType))
    setShowValidationErrors(false)
  }

  return (
    <Grid fullWidth className="default-grid admin-upload-page">
      <Column sm={4} md={8} lg={16}>
        <h1>{resolvedPageTitle}</h1>
      </Column>

      <Column sm={4} md={8} lg={16}>
        <div className="admin-upload-workflow">
          {successMessage && (
            <AppNotification
              kind="success"
              title={successTitle}
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

          <div className="admin-upload-workspace">
            <section className="admin-upload-panel" aria-labelledby="admin-upload-settings-title">
              <div className="admin-upload-panel__header">
                <div>
                  <h2 id="admin-upload-settings-title">{selectedWorkflow.label}</h2>
                  <p>{workflowDescription(selectedWorkflowType)}</p>
                </div>
                <Tag type={hasUploadAccess ? 'green' : 'red'}>
                  {hasUploadAccess ? 'Allowed' : 'Not Granted'}
                </Tag>
              </div>

              <div className="admin-upload-summary-strip" aria-label="Upload batch summary">
                <div>
                  <span>Target</span>
                  <strong>{currentUploadTargetSummary}</strong>
                </div>
                <div>
                  <span>
                    {selectedWorkflowType === 'applicationSubmission'
                      ? 'Queued submissions'
                      : 'Queued files'}
                  </span>
                  <strong>{uploadQueue.length}</strong>
                </div>
                <div>
                  <span>Format</span>
                  <strong>
                    {selectedWorkflowType === 'applicationSubmission' ? 'LEXIS' : 'Document'}
                  </strong>
                </div>
              </div>

              <div className="legacy-search-grid admin-upload-settings-grid">
                {!lockedWorkflowType && (
                  <SearchableSelect
                    id="uploadWorkflowType"
                    labelText="Upload type"
                    value={selectedWorkflowType}
                    options={DOCUMENT_UPLOAD_WORKFLOW_DEFINITIONS.map((workflow) => ({
                      value: workflow.type,
                      label: workflow.label,
                    }))}
                    onChange={(value) =>
                      setWorkflowType(getWorkflowFromQuery(value, 'application', false))
                    }
                  />
                )}

                {selectedWorkflowType === 'application' && (
                  <ApplicationNumberSelect
                    id="applicationNumber"
                    labelText={selectedWorkflow.numberFieldLabel}
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
                    value={formState.exemptionNumber}
                    invalid={!!fieldError('exemptionNumber')}
                    invalidText={fieldError('exemptionNumber')}
                    searchOptions={searchProvincialExemptionNumberOptions}
                    onBlur={() => markFieldTouched('exemptionNumber')}
                    onChange={(value) =>
                      setFormState((current) => ({
                        ...current,
                        exemptionNumber: value,
                      }))
                    }
                  />
                )}

                {(selectedWorkflowType === 'permit' || selectedWorkflowType === 'invoice') && (
                  <UploadTargetNumberSelect
                    id="permitNumber"
                    labelText={selectedWorkflow.numberFieldLabel}
                    value={formState.permitNumber}
                    invalid={!!fieldError('permitNumber')}
                    invalidText={fieldError('permitNumber')}
                    searchOptions={searchProvincialPermitNumberOptions}
                    normalizeInput={leadingDigits}
                    onBlur={() => markFieldTouched('permitNumber')}
                    onChange={(value) =>
                      setFormState((current) => ({
                        ...current,
                        permitNumber: value,
                      }))
                    }
                  />
                )}

                {selectedWorkflowType === 'invoice' && (
                  <>
                    <TextInput
                      id="salesInvoiceNumber"
                      labelText="Invoice number"
                      value={formState.salesInvoiceNumber}
                      invalid={!!fieldError('salesInvoiceNumber')}
                      invalidText={fieldError('salesInvoiceNumber')}
                      onBlur={() => markFieldTouched('salesInvoiceNumber')}
                      onChange={(event) =>
                        setFormState((current) => ({
                          ...current,
                          salesInvoiceNumber: event.target.value,
                        }))
                      }
                    />
                    <TextInput
                      id="invoiceExportValue"
                      labelText="Export value (CAD)"
                      value={formState.invoiceExportValue}
                      invalid={!!fieldError('invoiceExportValue')}
                      invalidText={fieldError('invoiceExportValue')}
                      onBlur={() => markFieldTouched('invoiceExportValue')}
                      onChange={(event) =>
                        setFormState((current) => ({
                          ...current,
                          invoiceExportValue: event.target.value,
                        }))
                      }
                    />
                    <TextInput
                      id="invoiceConversionRate"
                      labelText="Conversion rate"
                      value={formState.invoiceConversionRate}
                      invalid={!!fieldError('invoiceConversionRate')}
                      invalidText={fieldError('invoiceConversionRate')}
                      onBlur={() => markFieldTouched('invoiceConversionRate')}
                      onChange={(event) =>
                        setFormState((current) => ({
                          ...current,
                          invoiceConversionRate: event.target.value,
                        }))
                      }
                    />
                    <TextInput
                      id="invoiceFeeInLieu"
                      labelText="Fee in lieu"
                      value={formState.invoiceFeeInLieu}
                      invalid={!!fieldError('invoiceFeeInLieu')}
                      invalidText={fieldError('invoiceFeeInLieu')}
                      onBlur={() => markFieldTouched('invoiceFeeInLieu')}
                      onChange={(event) =>
                        setFormState((current) => ({
                          ...current,
                          invoiceFeeInLieu: event.target.value,
                        }))
                      }
                    />
                  </>
                )}

                {selectedWorkflowType === 'applicationSubmission' && (
                  <TextInput
                    id="userReference"
                    labelText="User reference"
                    value={formState.userReference}
                    maxLength={50}
                    disabled={hasLockedLexisSubmissions}
                    invalid={!!fieldError('userReference')}
                    invalidText={fieldError('userReference')}
                    onBlur={() => markFieldTouched('userReference')}
                    onChange={(event) =>
                      setFormState((current) => ({
                        ...current,
                        userReference: event.target.value,
                      }))
                    }
                  />
                )}

                {selectedWorkflowType !== 'applicationSubmission' && (
                  <TextArea
                    id="fileDescription"
                    labelText="Document description"
                    value={formState.fileDescription}
                    onChange={(event) =>
                      setFormState((current) => ({
                        ...current,
                        fileDescription: event.target.value,
                      }))
                    }
                    rows={4}
                  />
                )}
              </div>
            </section>

            <MultiFileDropZone
              title={
                selectedWorkflowType === 'applicationSubmission'
                  ? 'Upload application submissions'
                  : 'Upload Documents'
              }
              description={uploadFormatText}
              inputId="uploadFile"
              inputKey={fileInputKey}
              inputLabel={uploadInputLabel}
              accept={uploadAccept}
              invalidText={fieldError('uploadFile')}
              disabled={isUploadInputLocked}
              disabledDescription={
                !hasUploadAccess
                  ? 'Your session does not include the required upload permission.'
                  : 'Current application submissions are locked for review. Finalize, cancel, or reset before choosing more files.'
              }
              onFilesSelected={addFilesToQueue}
            />
          </div>

          <UploadQueuePreview
            items={uploadQueue}
            targetSummary={currentUploadTargetSummary}
            canSubmit={hasUploadAccess}
            isSubmitting={isSubmitting}
            previewTitle={
              selectedWorkflowType === 'applicationSubmission' ? 'Submission summary' : undefined
            }
            emptyDescription={
              selectedWorkflowType === 'applicationSubmission'
                ? 'Choose application submission files to validate.'
                : undefined
            }
            emptyStateTitle={
              selectedWorkflowType === 'applicationSubmission'
                ? 'No application submissions selected'
                : undefined
            }
            emptyStateDescription={
              selectedWorkflowType === 'applicationSubmission'
                ? 'Application submission files will appear here after selection.'
                : undefined
            }
            itemNoun={selectedWorkflowType === 'applicationSubmission' ? 'submission' : undefined}
            submitLabel={submitButtonLabel}
            submittingLabel={submittingButtonLabel}
            removeLabel={
              selectedWorkflowType === 'applicationSubmission' ? 'Cancel submission' : undefined
            }
            pendingMessage={
              selectedWorkflowType === 'applicationSubmission' ? 'Not validated yet.' : undefined
            }
            canRemoveItem={(item) =>
              selectedWorkflowType !== 'applicationSubmission' || item.status !== 'complete'
            }
            onSubmit={() => void onSubmitUpload()}
            onReset={onReset}
            onClear={clearQueuedFiles}
            onRemove={removeQueuedFile}
            renderCompleteAction={(item) =>
              item.status === 'complete' && item.resultApplicationNumber ? (
                <Link to={`/provincial/application/${item.resultApplicationNumber}`}>
                  Open Application {item.resultApplicationNumber}
                </Link>
              ) : null
            }
          />
        </div>
      </Column>
    </Grid>
  )
}

export default AdminUploadsPage
