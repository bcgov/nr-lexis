import { useEffect, useMemo, useState, type FC, type ReactNode } from 'react'
import { Column, ComboBox, Grid, InlineNotification, Tag, TextArea, TextInput } from '@carbon/react'
import { Link, useSearchParams } from 'react-router-dom'
import ApplicationNumberSelect from '@/components/ApplicationNumberSelect'
import SearchableSelect from '@/components/SearchableSelect'
import MultiFileDropZone from '@/components/uploads/MultiFileDropZone'
import UploadQueuePreview from '@/components/uploads/UploadQueuePreview'
import {
  buildUploadResultMessage,
  buildUploadReviewDetails,
  extractUploadErrorDetails,
  getFileExtension,
} from '@/components/uploads/uploadQueueHelpers'
import type {
  UploadQueueItem,
  UploadQueueReviewDetails,
  UploadQueueStatus,
} from '@/components/uploads/uploadQueueTypes'
import { useAuth } from '@/context/auth/useAuth'
import {
  firstValidationError,
  getVisibleFieldError,
  maxLengthFieldError,
  numericFieldError,
  positiveNumericFieldError,
  requiredFieldError,
  type FieldErrors,
  type TouchedFields,
} from '@/pages/shared/create-form-utils'
import { submitAdminUpload, type UploadWorkflowType } from '@/service/admin-upload-service'
import { searchProvincialExemptionNumberOptions } from '@/service/provincial-exemption-search-service'
import { searchProvincialPermitNumberOptions } from '@/service/provincial-permit-search-service'

type UploadWorkflowDefinition = {
  type: UploadWorkflowType
  label: string
  requiredAction: string
  numberFieldLabel: string
  numberFieldPlaceholder: string
}

const UPLOAD_WORKFLOW_DEFINITIONS: UploadWorkflowDefinition[] = [
  {
    type: 'lexisXml',
    label: 'LEXIS XML Upload',
    requiredAction: 'createApplication',
    numberFieldLabel: '',
    numberFieldPlaceholder: '',
  },
  {
    type: 'application',
    label: 'Application Upload',
    requiredAction: '/fileApplicationUpload',
    numberFieldLabel: 'Application Number',
    numberFieldPlaceholder: 'Enter application number',
  },
  {
    type: 'exemption',
    label: 'Exemption Upload',
    requiredAction: '/fileExemptionUpload',
    numberFieldLabel: 'Exemption Number',
    numberFieldPlaceholder: 'Enter exemption number',
  },
  {
    type: 'permit',
    label: 'Permit Upload',
    requiredAction: '/filePermitUpload',
    numberFieldLabel: 'Permit Number',
    numberFieldPlaceholder: 'Enter permit number',
  },
  {
    type: 'invoice',
    label: 'Invoice Upload',
    requiredAction: '/fileInvoiceUpload',
    numberFieldLabel: 'Permit Number',
    numberFieldPlaceholder: 'Enter permit number for invoice',
  },
]

const ESF_NAMESPACE = 'http://www.for.gov.bc.ca/schema/esf'
const LEXIS_NAMESPACE = 'http://www.for.gov.bc.ca/schema/lexis'
const XML_PREVIEW_UNAVAILABLE = 'XML preview unavailable; server validation will run on upload.'
const XML_QUALIFIED_NAME_PREFIX = String.raw`(?:[A-Za-z_][\w.-]*:)?`

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

type QueuedUploadResult = {
  message: string
  applicationNumber?: number
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

const getWorkflowFromQuery = (value: string | null): UploadWorkflowType => {
  if (
    value === 'application' ||
    value === 'exemption' ||
    value === 'permit' ||
    value === 'invoice' ||
    value === 'lexisXml'
  ) {
    return value
  }

  return 'application'
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

const targetNumberFromNumericInput = (input: string): string => input.match(/^\d+/)?.[0] ?? ''

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
        .catch((error) => {
          console.warn('Unable to load upload target number options.', error)
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

  if (workflowType === 'lexisXml') {
    return extension === '.xml' || extension === '.zip'
      ? ''
      : 'LEXIS XML uploads must use a .xml or .zip file.'
  }

  if (!extension) {
    return 'Document uploads need a file extension so LEXIS can resolve the file type.'
  }

  return ''
}

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const hasNamespaceDeclaration = (xml: string, namespace: string): boolean =>
  xml.includes(`"${namespace}"`) || xml.includes(`'${namespace}'`)

const hasXmlRootElement = (xml: string, localName: string): boolean =>
  new RegExp(
    String.raw`^\s*(?:<\?xml\b[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*<${XML_QUALIFIED_NAME_PREFIX}${escapeRegExp(localName)}\b`,
  ).test(xml)

const countXmlElements = (xml: string, localName: string): number => {
  const elementPattern = new RegExp(
    String.raw`<${XML_QUALIFIED_NAME_PREFIX}${escapeRegExp(localName)}(?:\s|>|/)`,
    'g',
  )
  return xml.match(elementPattern)?.length ?? 0
}

const firstXmlText = (xml: string, localName: string): string => {
  const elementPattern = new RegExp(
    String.raw`<${XML_QUALIFIED_NAME_PREFIX}${escapeRegExp(localName)}\b[^>]*>([\s\S]*?)</${XML_QUALIFIED_NAME_PREFIX}${escapeRegExp(localName)}>`,
  )
  const rawValue = elementPattern.exec(xml)?.[1]?.trim()
  return rawValue?.replace(/<[^>]*>/g, '').trim() ?? ''
}

const buildLexisXmlPreviewMessage = async (file: File): Promise<string> => {
  const extension = getFileExtension(file.name)
  if (extension === '.zip') {
    return 'ZIP archive will be unpacked and validated on upload.'
  }
  if (extension !== '.xml') {
    return ''
  }

  try {
    const xml = await file.text()
    if (
      !hasXmlRootElement(xml, 'ESFSubmission') ||
      !hasNamespaceDeclaration(xml, ESF_NAMESPACE) ||
      !hasNamespaceDeclaration(xml, LEXIS_NAMESPACE) ||
      countXmlElements(xml, 'LexisSubmission') === 0
    ) {
      return XML_PREVIEW_UNAVAILABLE
    }

    const packageNumber = firstXmlText(xml, 'boomNumber')
    const regionCode = firstXmlText(xml, 'bcForestRegionCode')
    const speciesEndUse = firstXmlText(xml, 'speciesEndUseSort')
    const clientNumber = firstXmlText(xml, 'clientNumber')
    const scaleRowCount = countXmlElements(xml, 'harvestedTimber')

    const details = [
      packageNumber ? `Package ${packageNumber}` : '',
      regionCode ? `Region ${regionCode}` : '',
      speciesEndUse ? `Species/end use ${speciesEndUse}` : '',
      clientNumber ? `Client ${clientNumber}` : '',
      scaleRowCount > 0 ? `${scaleRowCount} scale row${scaleRowCount === 1 ? '' : 's'}` : '',
    ].filter(Boolean)

    return details.length > 0 ? `Preview: ${details.join(', ')}.` : XML_PREVIEW_UNAVAILABLE
  } catch (error) {
    console.warn('Unable to build LEXIS XML upload preview.', error)
    return XML_PREVIEW_UNAVAILABLE
  }
}

const workflowDescription = (workflowType: UploadWorkflowType): string => {
  if (workflowType === 'lexisXml') {
    return 'Import ESF LEXIS XML submissions and create the application, package, species, and scale rows in LEXIS.'
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
  if (workflowType === 'lexisXml') {
    return 'Creates application, package, species, and scales'
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

const AdminUploadsPage: FC = () => {
  const { canPerform } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const initialWorkflow = getWorkflowFromQuery(searchParams.get('type'))
  const [selectedWorkflowType, setSelectedWorkflowType] =
    useState<UploadWorkflowType>(initialWorkflow)
  const [formState, setFormState] = useState<UploadFormState>(() =>
    buildInitialFormStateFromQuery(searchParams),
  )
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([])
  const [fileInputKey, setFileInputKey] = useState(0)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
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
    selectedWorkflowType === 'lexisXml' ? 'LEXIS XML or ZIP File' : 'Document File'
  const uploadAccept =
    selectedWorkflowType === 'lexisXml'
      ? '.xml,.zip,application/xml,text/xml,application/zip'
      : undefined
  const uploadFormatText =
    selectedWorkflowType === 'lexisXml'
      ? 'Supported formats: .xml and .zip'
      : 'Supported files: any document with a file extension'
  const currentUploadTargetSummary = uploadTargetSummary(selectedWorkflowType, formState)

  const fieldErrors = useMemo<FieldErrors<UploadField>>(
    () => ({
      uploadFile:
        invalidUploadCount > 0
          ? `${invalidUploadCount} queued file${invalidUploadCount === 1 ? ' needs' : 's need'} attention before upload.`
          : uploadQueue.length > 0
            ? undefined
            : selectedWorkflowType === 'lexisXml'
              ? 'Choose at least one LEXIS XML or ZIP file to import.'
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
          ? firstValidationError(
              () => requiredFieldError(formState.salesInvoiceNumber, 'Invoice number'),
              () => maxLengthFieldError(formState.salesInvoiceNumber, 9, 'Invoice number'),
            )
          : undefined,
      invoiceExportValue:
        selectedWorkflowType === 'invoice'
          ? firstValidationError(
              () => requiredFieldError(formState.invoiceExportValue, 'Invoice export value'),
              () => numericFieldError(formState.invoiceExportValue, 'Invoice export value'),
              () => positiveNumericFieldError(formState.invoiceExportValue),
            )
          : undefined,
      invoiceConversionRate:
        selectedWorkflowType === 'invoice'
          ? firstValidationError(
              () => requiredFieldError(formState.invoiceConversionRate, 'Invoice conversion rate'),
              () => numericFieldError(formState.invoiceConversionRate, 'Invoice conversion rate'),
              () => positiveNumericFieldError(formState.invoiceConversionRate),
            )
          : undefined,
      invoiceFeeInLieu:
        selectedWorkflowType === 'invoice'
          ? firstValidationError(
              () => requiredFieldError(formState.invoiceFeeInLieu, 'Invoice fee in lieu'),
              () => numericFieldError(formState.invoiceFeeInLieu, 'Invoice fee in lieu'),
              () => positiveNumericFieldError(formState.invoiceFeeInLieu),
            )
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
    setSelectedWorkflowType(workflowType)
    setUploadQueue([])
    setFileInputKey((current) => current + 1)
    setErrorMessage('')
    setSuccessMessage('')
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
    if (selectedWorkflowType === 'lexisXml') {
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
    markFieldTouched('uploadFile')
    setFileInputKey((current) => current + 1)
  }

  const removeQueuedFile = (id: string): void => {
    setUploadQueue((current) => current.filter((item) => item.id !== id))
  }

  const clearQueuedFiles = (): void => {
    setUploadQueue([])
    setFileInputKey((current) => current + 1)
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

  const submitQueuedFile = async (file: File): Promise<QueuedUploadResult> => {
    if (selectedWorkflowType === 'lexisXml') {
      const result = await submitAdminUpload('lexisXml', {
        file,
        fileDescription: formState.fileDescription.trim(),
      })
      const message = buildUploadResultMessage(
        'lexisXml',
        'LEXIS XML import submitted. Verify the created application and package details.',
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

      setQueueItemStatus(item.id, 'uploading', '', undefined, currentUploadTargetSummary)

      try {
        const result = await submitQueuedFile(item.file)
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
        const uploadError = extractUploadErrorDetails(error)
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
    setShowValidationErrors(false)
  }

  return (
    <Grid fullWidth className="default-grid admin-upload-page">
      <Column sm={4} md={8} lg={16}>
        <h1>Data Upload</h1>
      </Column>

      <Column sm={4} md={8} lg={16}>
        <div className="admin-upload-workflow">
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
                  <span>Queued Files</span>
                  <strong>{uploadQueue.length}</strong>
                </div>
                <div>
                  <span>Format</span>
                  <strong>{selectedWorkflowType === 'lexisXml' ? 'XML / ZIP' : 'Document'}</strong>
                </div>
              </div>

              <div className="legacy-search-grid admin-upload-settings-grid">
                <SearchableSelect
                  id="uploadWorkflowType"
                  labelText="Upload Type"
                  value={selectedWorkflowType}
                  options={UPLOAD_WORKFLOW_DEFINITIONS.map((workflow) => ({
                    value: workflow.type,
                    label: workflow.label,
                  }))}
                  onChange={(value) => setWorkflowType(getWorkflowFromQuery(value))}
                />

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
                    normalizeInput={targetNumberFromNumericInput}
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
                      labelText="Invoice Number"
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
                      labelText="Export Value (CAD)"
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
                      labelText="Conversion Rate"
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
                      labelText="Fee In Lieu"
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

                <TextArea
                  id="fileDescription"
                  labelText="Document Description"
                  value={formState.fileDescription}
                  onChange={(event) =>
                    setFormState((current) => ({
                      ...current,
                      fileDescription: event.target.value,
                    }))
                  }
                  rows={4}
                />
              </div>
            </section>

            <MultiFileDropZone
              title={
                selectedWorkflowType === 'lexisXml'
                  ? 'Upload LEXIS XML Submissions'
                  : 'Upload Documents'
              }
              description={uploadFormatText}
              inputId="uploadFile"
              inputKey={fileInputKey}
              inputLabel={uploadInputLabel}
              accept={uploadAccept}
              invalidText={fieldError('uploadFile')}
              onFilesSelected={addFilesToQueue}
            />
          </div>

          <UploadQueuePreview
            items={uploadQueue}
            targetSummary={currentUploadTargetSummary}
            canSubmit={hasUploadAccess}
            isSubmitting={isSubmitting}
            onSubmit={() => void onSubmitUpload()}
            onReset={onReset}
            onClear={clearQueuedFiles}
            onRemove={removeQueuedFile}
            renderCompleteAction={(item) =>
              item.status === 'complete' && item.resultApplicationNumber ? (
                <Link to={`/provincial/application/${item.resultApplicationNumber}`}>
                  Open Application
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
