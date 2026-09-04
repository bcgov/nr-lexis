import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Button, Column, ComboBox, Grid, TextArea, TextInput } from '@carbon/react'
import {
  ArrowRight,
  CheckmarkFilled,
  Close,
  Document,
  Download,
  ErrorFilled,
  InformationFilled,
} from '@carbon/icons-react'
import { Link, useSearchParams } from 'react-router-dom'
import { AppNotification } from '../../components/AppNotification'
import PageHeader from '@/components/PageHeader'
import ApplicationNumberSelect from '../../components/ApplicationNumberSelect'
import { shouldFilterSearchableDropdownItem } from '../../components/dropdown-filtering'
import SearchableSelect from '../../components/SearchableSelect'
import MultiFileDropZone from '../../components/uploads/MultiFileDropZone'
import UploadQueuePreview from '../../components/uploads/UploadQueuePreview'
import UploadWorkflowProgress from '../../components/uploads/UploadWorkflowProgress'
import { buildLexisXmlPreviewMessage } from '@/components/uploads/lexisXmlPreview'
import {
  buildUploadResultMessage,
  buildUploadReviewDetails,
  DOCUMENT_UPLOAD_ACCEPT,
  DOCUMENT_UPLOAD_GUIDANCE,
  DOCUMENT_UPLOAD_READY_MESSAGE,
  extractUploadErrorDetails,
  GENERIC_SUBMISSION_FAILURE_MESSAGE,
  GENERIC_UPLOAD_FAILURE_MESSAGE,
  validateDocumentUploadDescription,
  validateDocumentUploadFile,
  validateUploadFileSize,
  uploadQueueFileKey,
  uploadQueueStatusLabel,
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
import {
  INVOICE_AMOUNT_DECIMAL_PLACES,
  INVOICE_AMOUNT_MAX,
  INVOICE_CONVERSION_RATE_DECIMAL_PLACES,
  INVOICE_CONVERSION_RATE_MAX,
  invoiceDecimalStorageFieldError,
  invoiceNumberStorageFieldError,
} from '@/pages/shared/invoice-storage-validation'
import {
  submitAdminUpload,
  validateApplicationSubmissionUpload,
  type AdminUploadResult,
  type UploadWorkflowType,
} from '@/service/admin-upload-service'
import { searchProvincialExemptionNumberOptions } from '@/service/provincial-exemption-search-service'
import { searchProvincialPermitNumberOptions } from '@/service/provincial-permit-search-service'
import { requiredLabel } from '@/utils/required-label'

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

const APPLICATION_SUBMISSION_UPLOAD_STEPS = [
  { id: 'upload', label: 'Upload' },
  { id: 'review', label: 'Review' },
]

const DOCUMENT_UPLOAD_STEPS = [
  { id: 'upload', label: 'Upload' },
  { id: 'review', label: 'Review' },
]

type UploadFormState = {
  applicationNumber: string
  exemptionNumber: string
  permitNumber: string
  salesInvoiceNumber: string
  invoiceExportValue: string
  invoiceConversionRate: string
  invoiceFeeInLieu: string
  fileDescription: string
}

type UploadField = keyof UploadFormState | 'uploadFile'
type UploadWizardStep = 'upload' | 'review'

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
  required?: boolean
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
  }
}

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
      invalidText={invalidText}
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

const validateQueuedFile = (file: File, workflowType: UploadWorkflowType): string => {
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

  if (workflowType === 'applicationSubmission') {
    return ''
  }

  return validateDocumentUploadFile(file)
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

type ApplicationSubmissionValidationContentProps = {
  items: UploadQueueItem[]
  isSubmitting: boolean
  onRemove: (id: string) => void
}

type ApplicationSubmissionValidationIssue = {
  key: string
  issue: 'Error' | 'Warning'
  fileName: string
  detail: string
}

const applicationSubmissionValidationIssues = (
  items: UploadQueueItem[],
): ApplicationSubmissionValidationIssue[] =>
  items.flatMap((item) => {
    const errors = item.details?.errors?.filter(Boolean) ?? []
    const warnings = item.details?.warnings?.filter(Boolean) ?? []
    const resolvedErrors =
      errors.length === 0 && (item.status === 'failed' || item.status === 'invalid') && item.message
        ? [item.message]
        : errors

    return [
      ...resolvedErrors.map((detail, index) => ({
        key: `${item.id}-error-${index}`,
        issue: 'Error' as const,
        fileName: item.file.name,
        detail,
      })),
      ...warnings.map((detail, index) => ({
        key: `${item.id}-warning-${index}`,
        issue: 'Warning' as const,
        fileName: item.file.name,
        detail,
      })),
    ]
  })

const buildApplicationSubmissionIssuesCsv = (
  issues: ApplicationSubmissionValidationIssue[],
): string => {
  const escape = (value: string): string => `"${value.replace(/"/g, '""')}"`
  const rows = [
    ['Issue', 'Submission file', 'Detail'],
    ...issues.map((issue) => [issue.issue, issue.fileName, issue.detail]),
  ]
  const csv = rows.map((row) => row.map(escape).join(',')).join('\r\n')
  return `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`
}

function ApplicationSubmissionValidationContent({
  items,
  isSubmitting,
  onRemove,
}: ApplicationSubmissionValidationContentProps) {
  const validatingCount = items.filter((item) => item.status === 'validating').length
  const queuedCount = items.filter((item) => item.status === 'queued').length
  const validatedCount = items.filter((item) => item.status === 'validated').length
  const validationIssues = applicationSubmissionValidationIssues(items)
  const errorCount = validationIssues.filter((issue) => issue.issue === 'Error').length
  const warningCount = validationIssues.length - errorCount
  const isValidating = validatingCount > 0 || queuedCount > 0

  return (
    <div className="admin-upload-application-validation-content">
      <div className="admin-upload-application-file-list" aria-label="Selected submission files">
        {items.map((item) => (
          <div className="admin-upload-application-file-list__item" key={item.id}>
            <div className="admin-upload-file-chip">
              <Document size={16} aria-hidden="true" />
              <span className="admin-upload-file-chip__name">{item.file.name}</span>
              <span className={`admin-upload-status-text admin-upload-status-text--${item.status}`}>
                {uploadQueueStatusLabel(item.status)}
              </span>
              <button
                type="button"
                className="admin-upload-file-chip__remove"
                aria-label={`Remove ${item.file.name}`}
                onClick={() => onRemove(item.id)}
                disabled={isSubmitting}
              >
                <Close size={16} aria-hidden="true" />
              </button>
            </div>
            {item.message && (
              <p className="admin-upload-application-file-list__message">{item.message}</p>
            )}
          </div>
        ))}
      </div>

      {items.length > 0 &&
        (isValidating ? (
          <div className="admin-upload-validation admin-upload-validation--info" role="status">
            <InformationFilled
              className="admin-upload-validation__icon"
              size={20}
              aria-hidden="true"
            />
            <div className="admin-upload-validation__content">
              <h3>{items.length === 1 ? 'Validating file' : 'Validating files'}</h3>
              <p>Running application submission checks.</p>
            </div>
          </div>
        ) : errorCount > 0 ? (
          <div
            className="admin-upload-validation admin-upload-validation--error"
            role="alert"
            aria-live="assertive"
          >
            <ErrorFilled className="admin-upload-validation__icon" size={20} aria-hidden="true" />
            <div className="admin-upload-validation__content">
              <h3>
                {validationIssues.length} issue{validationIssues.length === 1 ? '' : 's'} found in
                application {items.length === 1 ? 'submission' : 'submissions'}
              </h3>
              <p>Correct or replace the failed source files. Validated submissions can continue.</p>
            </div>
          </div>
        ) : warningCount > 0 ? (
          <div className="admin-upload-validation admin-upload-validation--info" role="status">
            <InformationFilled
              className="admin-upload-validation__icon"
              size={20}
              aria-hidden="true"
            />
            <div className="admin-upload-validation__content">
              <h3>
                {items.length === 1 ? 'Submission validated' : 'Submissions validated'} with
                warnings
              </h3>
              <p>Review the validation warnings before continuing.</p>
            </div>
          </div>
        ) : validatedCount > 0 ? (
          <div className="admin-upload-validation admin-upload-validation--success" role="status">
            <CheckmarkFilled
              className="admin-upload-validation__icon"
              size={20}
              aria-hidden="true"
            />
            <div className="admin-upload-validation__content">
              <h3>{items.length === 1 ? 'Submission validated' : 'Submissions validated'}</h3>
              <p>
                {items.length === 1
                  ? `"${items[0].file.name}" was uploaded with no issues found.`
                  : `${validatedCount} application submissions were uploaded with no issues found.`}
              </p>
            </div>
          </div>
        ) : null)}

      {validationIssues.length > 0 && (
        <div className="admin-upload-validation-table-wrap">
          <div className="admin-upload-validation-table-header">
            <span>Validation issues ({validationIssues.length})</span>
            <a
              className="admin-upload-validation-table-download"
              href={buildApplicationSubmissionIssuesCsv(validationIssues)}
              download="lexis-validation-issues.csv"
              aria-label="Download issues as CSV"
            >
              Download issues (.csv)
              <Download size={16} aria-hidden="true" />
            </a>
          </div>
          <div className="admin-upload-validation-table-scroll">
            <table className="admin-upload-validation-table" aria-label="Validation issues">
              <thead>
                <tr>
                  <th scope="col" className="admin-upload-validation-table__issue">
                    Issue
                  </th>
                  <th scope="col" className="admin-upload-validation-table__location">
                    Submission file
                  </th>
                  <th scope="col">Detail</th>
                </tr>
              </thead>
              <tbody>
                {validationIssues.map((issue) => (
                  <tr key={issue.key}>
                    <td className="admin-upload-validation-table__issue">{issue.issue}</td>
                    <td className="admin-upload-validation-table__location">{issue.fileName}</td>
                    <td>{issue.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

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

function AdminUploadsPage({ lockedWorkflowType, pageTitle }: AdminUploadsPageProps) {
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
  const [applicationSubmissionStep, setApplicationSubmissionStep] =
    useState<UploadWizardStep>('upload')
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
  const uploadInputLabel =
    selectedWorkflowType === 'applicationSubmission'
      ? 'Application submission file'
      : 'Document File'
  const uploadAccept =
    selectedWorkflowType === 'applicationSubmission'
      ? '.xml,.zip,.geojson,.json,application/xml,text/xml,application/zip,application/json,application/geo+json'
      : DOCUMENT_UPLOAD_ACCEPT
  const uploadFormatText =
    selectedWorkflowType === 'applicationSubmission'
      ? 'Accepted file types: XML, ZIP, GeoJSON, and JSON. Maximum file size: 20 MB.'
      : DOCUMENT_UPLOAD_GUIDANCE
  const currentUploadTargetSummary = uploadTargetSummary(selectedWorkflowType, formState)
  const resolvedPageTitle =
    pageTitle ??
    (selectedWorkflowType === 'applicationSubmission'
      ? 'Upload application submission'
      : 'Data Upload')
  const hasQueuedLexisSubmissions =
    selectedWorkflowType === 'applicationSubmission' &&
    uploadQueue.some((item) => item.status === 'queued')
  const hasValidatingLexisSubmissions =
    selectedWorkflowType === 'applicationSubmission' &&
    uploadQueue.some((item) => item.status === 'validating')
  const hasValidatedLexisSubmissions =
    selectedWorkflowType === 'applicationSubmission' &&
    uploadQueue.some((item) => item.status === 'validated')
  const hasSubmittedLexisSubmissions =
    selectedWorkflowType === 'applicationSubmission' &&
    uploadQueue.some((item) => item.status === 'uploading' || item.status === 'complete')
  const canReviewLexisSubmissions =
    selectedWorkflowType === 'applicationSubmission' &&
    hasValidatedLexisSubmissions &&
    !hasValidatingLexisSubmissions
  const applicationSubmissionActionNoun =
    selectedWorkflowType === 'applicationSubmission' && uploadQueue.length === 1
      ? 'submission'
      : 'submissions'
  const isUploadInputLocked =
    !hasUploadAccess ||
    (selectedWorkflowType === 'applicationSubmission' && hasSubmittedLexisSubmissions)
  const submitButtonLabel =
    selectedWorkflowType === 'applicationSubmission'
      ? hasValidatingLexisSubmissions
        ? `Validating ${applicationSubmissionActionNoun}…`
        : hasQueuedLexisSubmissions || !hasValidatedLexisSubmissions
          ? `Validate ${applicationSubmissionActionNoun}`
          : `Submit ${applicationSubmissionActionNoun}`
      : 'Submit upload'
  const submittingButtonLabel =
    selectedWorkflowType === 'applicationSubmission' && hasQueuedLexisSubmissions
      ? `Validating ${applicationSubmissionActionNoun}…`
      : selectedWorkflowType === 'applicationSubmission'
        ? `Submitting ${applicationSubmissionActionNoun}…`
        : 'Submitting upload…'

  const fieldErrors = useMemo<FieldErrors<UploadField>>(
    () => ({
      uploadFile:
        invalidUploadCount > 0
          ? `${invalidUploadCount} queued file${invalidUploadCount === 1 ? ' needs' : 's need'} attention before upload.`
          : uploadQueue.length > 0
            ? undefined
            : selectedWorkflowType === 'applicationSubmission'
              ? 'Please upload a file before continuing.'
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
        selectedWorkflowType === 'permit' || selectedWorkflowType === 'invoice'
          ? (provincialApplicationNumberFieldError(formState.permitNumber, 'Permit number', true) ??
            undefined)
          : undefined,
      salesInvoiceNumber:
        selectedWorkflowType === 'invoice'
          ? invoiceNumberStorageFieldError(formState.salesInvoiceNumber)
          : undefined,
      invoiceExportValue:
        selectedWorkflowType === 'invoice'
          ? invoiceDecimalStorageFieldError(
              formState.invoiceExportValue,
              'Invoice export value',
              INVOICE_AMOUNT_MAX,
              INVOICE_AMOUNT_DECIMAL_PLACES,
            )
          : undefined,
      invoiceConversionRate:
        selectedWorkflowType === 'invoice'
          ? invoiceDecimalStorageFieldError(
              formState.invoiceConversionRate,
              'Invoice conversion rate',
              INVOICE_CONVERSION_RATE_MAX,
              INVOICE_CONVERSION_RATE_DECIMAL_PLACES,
            )
          : undefined,
      invoiceFeeInLieu:
        selectedWorkflowType === 'invoice'
          ? invoiceDecimalStorageFieldError(
              formState.invoiceFeeInLieu,
              'Invoice fee in lieu',
              INVOICE_AMOUNT_MAX,
              INVOICE_AMOUNT_DECIMAL_PLACES,
            )
          : undefined,
      fileDescription:
        selectedWorkflowType === 'applicationSubmission'
          ? undefined
          : validateDocumentUploadDescription(formState.fileDescription) || undefined,
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
    setTouchedFields({})
    setShowValidationErrors(false)
    setApplicationSubmissionStep('upload')
    setDocumentUploadStep('upload')
    setSearchParams({ type: workflowType }, { replace: true })
  }

  const addFilesToQueue = (files: FileList | null): void => {
    if (!files || files.length === 0) {
      return
    }
    if (selectedWorkflowType === 'applicationSubmission') {
      setApplicationSubmissionStep('upload')
    } else {
      setDocumentUploadStep('upload')
    }

    const queuedAt = Date.now()
    const nextItemsByFileName = new Map<string, UploadQueueItem>()
    Array.from(files).forEach((file, index) => {
      const validationMessage = validateQueuedFile(file, selectedWorkflowType)
      const isApplicationSubmission = selectedWorkflowType === 'applicationSubmission'
      const validDocumentMessage = isApplicationSubmission ? '' : DOCUMENT_UPLOAD_READY_MESSAGE

      nextItemsByFileName.set(uploadQueueFileKey(file), {
        id: `${queuedAt}-${index}-${file.name}-${file.size}`,
        file,
        workflowLabel: selectedWorkflow.label,
        queuedAt,
        status: validationMessage
          ? ('invalid' as const)
          : isApplicationSubmission
            ? ('queued' as const)
            : ('queued' as const),
        message: validationMessage || validDocumentMessage,
        details: validationMessage
          ? { summary: validationMessage, errors: [validationMessage] }
          : validDocumentMessage
            ? { summary: validDocumentMessage }
            : undefined,
      })
    })
    const nextItems = Array.from(nextItemsByFileName.values())
    const replacementFileNames = new Set(nextItems.map((item) => uploadQueueFileKey(item.file)))

    setUploadQueue((current) => [
      ...current.filter((item) => !replacementFileNames.has(uploadQueueFileKey(item.file))),
      ...nextItems,
    ])
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
                (currentItem.status === 'queued' || currentItem.status === 'validating') &&
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
    const nextLength = uploadQueue.filter((item) => item.id !== id).length
    setUploadQueue((current) => current.filter((item) => item.id !== id))
    if (selectedWorkflowType === 'applicationSubmission' && nextLength === 0) {
      setApplicationSubmissionStep('upload')
    }
    if (selectedWorkflowType !== 'applicationSubmission' && nextLength === 0) {
      setDocumentUploadStep('upload')
    }
    clearUploadFeedback()
  }

  const clearQueuedFiles = (): void => {
    setUploadQueue([])
    setFileInputKey((current) => current + 1)
    setApplicationSubmissionStep('upload')
    setDocumentUploadStep('upload')
    clearUploadFeedback()
  }

  const resetUploadQueueAfterSuccess = (): void => {
    setUploadQueue([])
    setFileInputKey((current) => current + 1)
    setTouchedFields({})
    setShowValidationErrors(false)
    setApplicationSubmissionStep('upload')
    setDocumentUploadStep('upload')
  }

  const setQueueItemStatus = useCallback(
    (
      id: string,
      status: UploadQueueStatus,
      message = '',
      resultApplicationNumber?: number,
      targetSummary?: string,
      details?: UploadQueueReviewDetails,
      submitted?: boolean,
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
                submitted: submitted ?? item.submitted,
              }
            : item,
        ),
      )
    },
    [],
  )

  const submitQueuedFile = async (item: UploadQueueItem): Promise<QueuedUploadResult> => {
    const file = item.file
    if (selectedWorkflowType === 'applicationSubmission') {
      const result = await submitAdminUpload('applicationSubmission', {
        file,
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
        applicationNumber: normalizeProvincialApplicationNumber(formState.applicationNumber),
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

  const validateQueuedLexisFile = useCallback(async (file: File): Promise<QueuedUploadResult> => {
    const result = await validateApplicationSubmissionUpload({ file })
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
      'LEXIS application submission validated. Review the summary before submitting application submissions.',
      result,
    )
    return {
      message,
      details: buildUploadReviewDetails(message, result),
    }
  }, [])

  const validateLexisQueue = useCallback(async (): Promise<void> => {
    const queuedItems = uploadQueue.filter((item) => item.status === 'queued')
    if (queuedItems.length === 0) {
      return
    }

    const queuedItemIds = new Set(queuedItems.map((item) => item.id))
    let successCount = 0
    let failureCount = 0
    let lastSuccessMessage = ''

    setUploadQueue((current) =>
      current.map((item) =>
        queuedItemIds.has(item.id)
          ? {
              ...item,
              status: 'validating',
              message: '',
              targetSummary: currentUploadTargetSummary,
            }
          : item,
      ),
    )

    for (const item of queuedItems) {
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
          : `${successCount} application submissions validated. Review the submission summary and submit submissions.`,
      )
    }

    if (failureCount > 0) {
      setErrorMessage(
        `${failureCount} submission${failureCount === 1 ? '' : 's'} failed validation. Review the queue for details.`,
      )
    }
  }, [currentUploadTargetSummary, setQueueItemStatus, uploadQueue, validateQueuedLexisFile])

  useEffect(() => {
    if (
      selectedWorkflowType !== 'applicationSubmission' ||
      !hasUploadAccess ||
      isSubmitting ||
      !hasQueuedLexisSubmissions
    ) {
      return
    }

    void validateLexisQueue()
  }, [
    hasQueuedLexisSubmissions,
    hasUploadAccess,
    isSubmitting,
    selectedWorkflowType,
    validateLexisQueue,
  ])

  const submitValidatedLexisQueue = async (): Promise<void> => {
    let successCount = 0
    let failureCount = 0
    let lastSuccessMessage = ''

    for (const item of uploadQueue) {
      if (item.status !== 'validated') {
        continue
      }

      setQueueItemStatus(
        item.id,
        'uploading',
        '',
        undefined,
        currentUploadTargetSummary,
        undefined,
        true,
      )

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
      if (failureCount === 0) {
        resetUploadQueueAfterSuccess()
      }
    }

    if (failureCount > 0) {
      setErrorMessage(
        `${failureCount} submission${failureCount === 1 ? '' : 's'} failed. Review the queue for details.`,
      )
    }
  }

  const onReviewApplicationSubmissions = (): void => {
    setErrorMessage('')

    if (validationErrors.length > 0) {
      setShowValidationErrors(true)
      if (selectedWorkflowType !== 'applicationSubmission') {
        setErrorMessage(validationErrors.join(' '))
      }
      return
    }

    if (hasValidatingLexisSubmissions) {
      setErrorMessage('Wait for validation to finish before reviewing submissions.')
      return
    }

    if (!hasValidatedLexisSubmissions) {
      setErrorMessage('No validated application submissions are ready for review.')
      return
    }

    setSuccessMessage('')
    setApplicationSubmissionStep('review')
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
      if (uploadQueue.some((item) => item.status === 'validating')) {
        setErrorMessage('Wait for validation to finish before submitting.')
      } else if (uploadQueue.some((item) => item.status === 'queued')) {
        await validateLexisQueue()
      } else if (applicationSubmissionStep !== 'review') {
        onReviewApplicationSubmissions()
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
        const uploadError = extractUploadErrorDetails(error, GENERIC_UPLOAD_FAILURE_MESSAGE)
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
          : `${successCount} files uploaded. Verify updates in the target details view.`,
      )
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
    setSuccessTitle(defaultSuccessTitle(selectedWorkflowType))
    setTouchedFields({})
    setShowValidationErrors(false)
    setApplicationSubmissionStep('upload')
    setDocumentUploadStep('upload')
  }

  const activeUploadStep =
    selectedWorkflowType === 'applicationSubmission'
      ? applicationSubmissionStep
      : documentUploadStep
  const activeUploadSteps =
    selectedWorkflowType === 'applicationSubmission'
      ? APPLICATION_SUBMISSION_UPLOAD_STEPS
      : DOCUMENT_UPLOAD_STEPS
  const activeCompletedSteps = activeUploadStep === 'review' ? ['upload'] : []
  const showGlobalUploadFeedback =
    selectedWorkflowType !== 'applicationSubmission' ||
    activeUploadStep !== 'upload' ||
    uploadQueue.length === 0
  const applicationSubmissionReviewItems = useMemo(
    () =>
      uploadQueue.filter(
        (item) =>
          item.status === 'validated' ||
          item.status === 'uploading' ||
          item.status === 'complete' ||
          item.submitted,
      ),
    [uploadQueue],
  )
  const workflowProgressLabel =
    selectedWorkflowType === 'applicationSubmission'
      ? 'Application submission upload workflow progress'
      : 'Upload queue workflow progress'
  const pageSubtitle =
    selectedWorkflowType === 'applicationSubmission'
      ? 'Upload an XML, ZIP, GeoJSON, or JSON file to create a LEXIS application.'
      : 'Upload documents and review selected files before submitting.'
  const uploadStepDescription =
    selectedWorkflowType === 'applicationSubmission'
      ? 'The submission type will be detected automatically from your file.'
      : 'Select documents to prepare before reviewing and submitting the upload.'
  const uploadSettingsPanel = (
    <section
      className={`admin-upload-panel${
        selectedWorkflowType === 'applicationSubmission'
          ? ' admin-upload-panel--application-submission'
          : ''
      }`}
      aria-labelledby={
        selectedWorkflowType === 'applicationSubmission'
          ? 'uploadFile-panel-title'
          : 'admin-upload-settings-title'
      }
    >
      {selectedWorkflowType !== 'applicationSubmission' && (
        <div className="admin-upload-panel__header">
          <div>
            <h2 id="admin-upload-settings-title">{selectedWorkflow.label}</h2>
            <p>{workflowDescription(selectedWorkflowType)}</p>
          </div>
        </div>
      )}

      <div
        className="legacy-search-grid admin-upload-settings-grid"
        hidden={selectedWorkflowType === 'applicationSubmission'}
      >
        {!lockedWorkflowType && (
          <SearchableSelect
            id="uploadWorkflowType"
            labelText="Upload type"
            value={selectedWorkflowType}
            options={DOCUMENT_UPLOAD_WORKFLOW_DEFINITIONS.map((workflow) => ({
              value: workflow.type,
              label: workflow.label,
            }))}
            onChange={(value) => setWorkflowType(getWorkflowFromQuery(value, 'application', false))}
          />
        )}

        {selectedWorkflowType === 'application' && (
          <ApplicationNumberSelect
            id="applicationNumber"
            labelText={requiredLabel(selectedWorkflow.numberFieldLabel)}
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
            labelText={requiredLabel(selectedWorkflow.numberFieldLabel)}
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

        {(selectedWorkflowType === 'permit' || selectedWorkflowType === 'invoice') && (
          <UploadTargetNumberSelect
            id="permitNumber"
            labelText={requiredLabel(selectedWorkflow.numberFieldLabel)}
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

        {selectedWorkflowType === 'invoice' && (
          <>
            <TextInput
              id="salesInvoiceNumber"
              labelText={requiredLabel('Invoice number')}
              aria-required="true"
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
              labelText={requiredLabel('Export value (CAD)')}
              aria-required="true"
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
              labelText={requiredLabel('Conversion rate')}
              aria-required="true"
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
              labelText={requiredLabel('Fee in lieu')}
              aria-required="true"
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

        {selectedWorkflowType !== 'applicationSubmission' && (
          <TextArea
            id="fileDescription"
            labelText="Document description"
            value={formState.fileDescription}
            invalid={!!fieldError('fileDescription')}
            invalidText={fieldError('fileDescription')}
            maxCount={250}
            onBlur={() => markFieldTouched('fileDescription')}
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

      <MultiFileDropZone
        title={
          selectedWorkflowType === 'applicationSubmission' ? 'Submission file' : 'Upload documents'
        }
        description={uploadFormatText}
        inputId="uploadFile"
        inputKey={fileInputKey}
        inputLabel={uploadInputLabel}
        required
        accept={uploadAccept}
        invalidText={fieldError('uploadFile')}
        disabled={isUploadInputLocked}
        disabledDescription={
          !hasUploadAccess
            ? 'Your session does not include the required upload permission.'
            : 'Current application submissions are submitting or complete. Wait for the upload to finish before choosing more files.'
        }
        renderAsPanel={false}
        variant="fspts"
        showMultipleFileGuidance={selectedWorkflowType !== 'applicationSubmission'}
        onFilesSelected={addFilesToQueue}
      />

      {selectedWorkflowType === 'applicationSubmission' && uploadQueue.length > 0 && (
        <ApplicationSubmissionValidationContent
          items={uploadQueue}
          isSubmitting={isSubmitting}
          onRemove={removeQueuedFile}
        />
      )}
    </section>
  )

  return (
    <Grid fullWidth className="default-grid admin-upload-fspts-page">
      <Column sm={4} md={8} lg={16} className="admin-upload-fspts-header">
        <PageHeader
          title={resolvedPageTitle}
          subtitle={pageSubtitle}
          style={{ marginBlockEnd: '1.5rem' }}
        />
        <UploadWorkflowProgress
          steps={activeUploadSteps}
          currentStepId={activeUploadStep}
          completedStepIds={activeCompletedSteps}
          ariaLabel={workflowProgressLabel}
        />
      </Column>

      <Column sm={4} md={8} lg={16} className="admin-upload-fspts-content">
        <div className="admin-upload-workflow">
          {successMessage && showGlobalUploadFeedback && (
            <AppNotification
              kind="success"
              title={successTitle}
              subtitle={successMessage}
              lowContrast
              autoDismissMs={6000}
              onCloseButtonClick={() => setSuccessMessage('')}
            />
          )}
          {errorMessage && showGlobalUploadFeedback && (
            <AppNotification
              kind="error"
              title="Upload error"
              subtitle={errorMessage}
              lowContrast
              onCloseButtonClick={() => setErrorMessage('')}
            />
          )}

          {activeUploadStep === 'upload' ? (
            <>
              <div className="admin-upload-section-heading">
                <h2 id="admin-upload-step-title">Upload</h2>
                <p>{uploadStepDescription}</p>
              </div>

              {uploadSettingsPanel}

              {selectedWorkflowType === 'applicationSubmission' ? (
                <UploadStepReviewButton
                  label="Review"
                  disabled={
                    !hasUploadAccess ||
                    isSubmitting ||
                    (uploadQueue.length > 0 && !canReviewLexisSubmissions)
                  }
                  onReview={onReviewApplicationSubmissions}
                />
              ) : uploadQueue.length > 0 ? (
                <UploadQueuePreview
                  items={uploadQueue}
                  targetSummary={currentUploadTargetSummary}
                  canSubmit={hasUploadAccess}
                  isSubmitting={isSubmitting}
                  currentStepId={documentUploadStep}
                  actionsPlacement="footer"
                  emptyDescription="Upload files to validate before review."
                  onReview={() => setDocumentUploadStep('review')}
                  onSubmit={() => void onSubmitUpload()}
                  onReset={onReset}
                  onClear={clearQueuedFiles}
                  onRemove={removeQueuedFile}
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
                <p>
                  {selectedWorkflowType === 'applicationSubmission'
                    ? 'Review validated submission data before submitting.'
                    : 'Review selected files and target details before submitting.'}
                </p>
              </div>

              {selectedWorkflowType !== 'applicationSubmission' && uploadSettingsPanel}

              <UploadQueuePreview
                items={
                  selectedWorkflowType === 'applicationSubmission'
                    ? applicationSubmissionReviewItems
                    : uploadQueue
                }
                targetSummary={currentUploadTargetSummary}
                canSubmit={
                  hasUploadAccess &&
                  (selectedWorkflowType !== 'applicationSubmission' || hasValidatedLexisSubmissions)
                }
                isSubmitting={isSubmitting}
                currentStepId="review"
                actionsPlacement="footer"
                previewTitle={
                  selectedWorkflowType === 'applicationSubmission'
                    ? 'Submission review'
                    : 'Data preview'
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
                itemNoun={
                  selectedWorkflowType === 'applicationSubmission' ? 'submission' : undefined
                }
                submitLabel={submitButtonLabel}
                submittingLabel={submittingButtonLabel}
                removeLabel={
                  selectedWorkflowType === 'applicationSubmission' ? 'Cancel submission' : undefined
                }
                pendingMessage={
                  selectedWorkflowType === 'applicationSubmission'
                    ? 'Not validated yet.'
                    : undefined
                }
                canRemoveItem={(item) =>
                  selectedWorkflowType !== 'applicationSubmission' || item.status !== 'complete'
                }
                onBack={() => {
                  if (selectedWorkflowType === 'applicationSubmission') {
                    setApplicationSubmissionStep('upload')
                  } else {
                    setDocumentUploadStep('upload')
                  }
                }}
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
                showWorkflowProgress={false}
                showReviewQueueTable={selectedWorkflowType !== 'applicationSubmission'}
                showReviewAccordionHeader={selectedWorkflowType !== 'applicationSubmission'}
              />
            </>
          )}
        </div>
      </Column>
    </Grid>
  )
}

export default AdminUploadsPage
