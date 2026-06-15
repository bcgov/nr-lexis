import { useMemo, useState, type FC } from 'react'
import {
  Button,
  Column,
  Grid,
  InlineNotification,
  Tag,
  TextArea,
  TextInput,
  Tile,
} from '@carbon/react'
import { useSearchParams } from 'react-router-dom'
import SearchableSelect from '@/components/SearchableSelect'
import { useAuth } from '@/context/auth/useAuth'
import {
  firstValidationError,
  getVisibleFieldError,
  numericFieldError,
  requiredFieldError,
  type FieldErrors,
  type TouchedFields,
} from '@/pages/shared/create-form-utils'
import { submitAdminUpload, type UploadWorkflowType } from '@/service/admin-upload-service'

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

type UploadQueueStatus = 'queued' | 'uploading' | 'complete' | 'failed'

type UploadQueueItem = {
  id: string
  file: File
  status: UploadQueueStatus
  message: string
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

const extractUploadErrorMessage = (error: unknown): string => {
  const response = (error as any)?.response
  const data = response?.data
  const status = response?.status

  if (Array.isArray(data?.errors) && data.errors.length > 0) {
    return data.errors.join(' ')
  }
  if (typeof data?.errors === 'string' && data.errors.trim()) {
    return data.errors
  }
  if (typeof data?.message === 'string' && data.message.trim()) {
    return data.message
  }
  if (typeof data === 'string' && data.trim()) {
    return data
  }
  if (status) {
    return `Upload request failed with status ${status}.`
  }
  return 'Upload request failed. Please try again or contact support.'
}

const formatFileSize = (size: number): string => {
  if (size < 1024) {
    return `${size} B`
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

const statusTagType = (status: UploadQueueStatus): 'gray' | 'blue' | 'green' | 'red' => {
  if (status === 'uploading') {
    return 'blue'
  }
  if (status === 'complete') {
    return 'green'
  }
  if (status === 'failed') {
    return 'red'
  }
  return 'gray'
}

const statusLabel = (status: UploadQueueStatus): string => {
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

  const fieldErrors = useMemo<FieldErrors<UploadField>>(
    () => ({
      uploadFile:
        uploadQueue.length > 0
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
          ? (requiredFieldError(formState.salesInvoiceNumber, 'Invoice number') ?? undefined)
          : undefined,
      invoiceExportValue:
        selectedWorkflowType === 'invoice'
          ? firstValidationError(
              () => requiredFieldError(formState.invoiceExportValue, 'Invoice export value'),
              () => numericFieldError(formState.invoiceExportValue, 'Invoice export value'),
            )
          : undefined,
      invoiceConversionRate:
        selectedWorkflowType === 'invoice'
          ? (numericFieldError(formState.invoiceConversionRate, 'Invoice conversion rate') ??
            undefined)
          : undefined,
      invoiceFeeInLieu:
        selectedWorkflowType === 'invoice'
          ? (numericFieldError(formState.invoiceFeeInLieu, 'Invoice fee in lieu') ?? undefined)
          : undefined,
    }),
    [formState, uploadQueue.length, selectedWorkflowType],
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
    const nextItems = Array.from(files).map((file, index) => ({
      id: `${queuedAt}-${index}-${file.name}-${file.size}`,
      file,
      status: 'queued' as const,
      message: '',
    }))

    setUploadQueue((current) => [...current, ...nextItems])
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

  const setQueueItemStatus = (id: string, status: UploadQueueStatus, message = ''): void => {
    setUploadQueue((current) =>
      current.map((item) => (item.id === id ? { ...item, status, message } : item)),
    )
  }

  const submitQueuedFile = async (file: File): Promise<string> => {
    if (selectedWorkflowType === 'lexisXml') {
      const result = await submitAdminUpload('lexisXml', {
        file,
        fileDescription: formState.fileDescription.trim(),
      })
      return (
        result.message ??
        'LEXIS XML import submitted. Verify the created application and package details.'
      )
    }

    if (selectedWorkflowType === 'application') {
      await submitAdminUpload('application', {
        applicationNumber: formState.applicationNumber.trim(),
        file,
        fileDescription: formState.fileDescription.trim(),
      })
      return 'Application document upload submitted.'
    }

    if (selectedWorkflowType === 'exemption') {
      await submitAdminUpload('exemption', {
        exemptionNumber: formState.exemptionNumber.trim(),
        file,
        fileDescription: formState.fileDescription.trim(),
      })
      return 'Exemption document upload submitted.'
    }

    if (selectedWorkflowType === 'permit') {
      await submitAdminUpload('permit', {
        permitNumber: formState.permitNumber.trim(),
        file,
        fileDescription: formState.fileDescription.trim(),
      })
      return 'Permit document upload submitted.'
    }

    await submitAdminUpload('invoice', {
      permitNumber: formState.permitNumber.trim(),
      salesInvoiceNumber: formState.salesInvoiceNumber.trim(),
      invoiceExportValue: formState.invoiceExportValue.trim(),
      invoiceConversionRate: formState.invoiceConversionRate.trim(),
      invoiceFeeInLieu: formState.invoiceFeeInLieu.trim(),
      file,
      fileDescription: formState.fileDescription.trim(),
    })
    return 'Invoice upload submitted.'
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
      if (item.status === 'complete') {
        continue
      }

      setQueueItemStatus(item.id, 'uploading')

      try {
        const message = await submitQueuedFile(item.file)
        successCount += 1
        lastSuccessMessage = message
        setQueueItemStatus(item.id, 'complete', message)
      } catch (error) {
        failureCount += 1
        setQueueItemStatus(item.id, 'failed', extractUploadErrorMessage(error))
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
        <h1>Upload Center</h1>
      </Column>

      <Column sm={4} md={8} lg={16}>
        <Tile className="admin-upload-workflow">
          <div className="admin-upload-workflow__header">
            <div>
              <h2>{selectedWorkflow.label}</h2>
              <p>
                Add one or more files, review the queue, then submit them to the selected upload
                workflow.
              </p>
            </div>
            <Tag type={hasUploadAccess ? 'green' : 'red'}>
              {hasUploadAccess ? 'Allowed' : 'Not Granted'}
            </Tag>
          </div>

          <div className="legacy-search-grid">
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

            <div>
              <p>
                Required action: <code>{selectedWorkflow.requiredAction}</code>
              </p>
            </div>

            {selectedWorkflowType === 'application' && (
              <TextInput
                id="applicationNumber"
                labelText={selectedWorkflow.numberFieldLabel}
                value={formState.applicationNumber}
                placeholder={selectedWorkflow.numberFieldPlaceholder}
                invalid={!!fieldError('applicationNumber')}
                invalidText={fieldError('applicationNumber')}
                onBlur={() => markFieldTouched('applicationNumber')}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    applicationNumber: event.target.value,
                  }))
                }
              />
            )}

            {selectedWorkflowType === 'exemption' && (
              <TextInput
                id="exemptionNumber"
                labelText={selectedWorkflow.numberFieldLabel}
                value={formState.exemptionNumber}
                placeholder={selectedWorkflow.numberFieldPlaceholder}
                invalid={!!fieldError('exemptionNumber')}
                invalidText={fieldError('exemptionNumber')}
                onBlur={() => markFieldTouched('exemptionNumber')}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    exemptionNumber: event.target.value,
                  }))
                }
              />
            )}

            {(selectedWorkflowType === 'permit' || selectedWorkflowType === 'invoice') && (
              <TextInput
                id="permitNumber"
                labelText={selectedWorkflow.numberFieldLabel}
                value={formState.permitNumber}
                placeholder={selectedWorkflow.numberFieldPlaceholder}
                invalid={!!fieldError('permitNumber')}
                invalidText={fieldError('permitNumber')}
                onBlur={() => markFieldTouched('permitNumber')}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    permitNumber: event.target.value,
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

          <div className="admin-upload-drop-zone">
            <div>
              <h2>
                {selectedWorkflowType === 'lexisXml'
                  ? 'Upload LEXIS XML or ZIP Files'
                  : 'Upload Document Files'}
              </h2>
              <p>
                {selectedWorkflowType === 'lexisXml'
                  ? 'Supported formats: .xml and .zip. Each file is submitted as its own import.'
                  : 'Each selected file is uploaded to the target record using the fields above.'}
              </p>
            </div>
            <TextInput
              key={fileInputKey}
              id="uploadFile"
              type="file"
              labelText={
                selectedWorkflowType === 'lexisXml' ? 'LEXIS XML or ZIP File' : 'Document File'
              }
              accept={
                selectedWorkflowType === 'lexisXml'
                  ? '.xml,.zip,application/xml,text/xml,application/zip'
                  : undefined
              }
              multiple
              invalid={!!fieldError('uploadFile')}
              invalidText={fieldError('uploadFile')}
              onChange={(event) => {
                const target = event.target as HTMLInputElement
                addFilesToQueue(target.files)
              }}
            />
          </div>

          <div className="admin-upload-queue">
            <div className="admin-upload-queue__header">
              <div>
                <h2>Upload Queue</h2>
                <p>
                  {uploadQueue.length === 0
                    ? 'No files selected.'
                    : `${uploadQueue.length} file${uploadQueue.length === 1 ? '' : 's'} ready.`}
                </p>
              </div>
              {uploadQueue.length > 0 && (
                <Button kind="ghost" size="sm" onClick={clearQueuedFiles} disabled={isSubmitting}>
                  Clear Queue
                </Button>
              )}
            </div>

            <table className="cds--data-table admin-upload-queue__table">
              <thead>
                <tr>
                  <th>File</th>
                  <th>Size</th>
                  <th>Status</th>
                  <th>Message</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {uploadQueue.length === 0 ? (
                  <tr>
                    <td colSpan={5}>Choose files to populate the upload queue.</td>
                  </tr>
                ) : (
                  uploadQueue.map((item) => (
                    <tr key={item.id}>
                      <td>{item.file.name}</td>
                      <td>{formatFileSize(item.file.size)}</td>
                      <td>
                        <Tag type={statusTagType(item.status)}>{statusLabel(item.status)}</Tag>
                      </td>
                      <td>{item.message || 'Not submitted yet.'}</td>
                      <td>
                        <Button
                          kind="ghost"
                          size="sm"
                          onClick={() => removeQueuedFile(item.id)}
                          disabled={isSubmitting && item.status === 'uploading'}
                        >
                          Remove
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="legacy-search-actions">
            <Button
              kind="primary"
              onClick={() => void onSubmitUpload()}
              disabled={isSubmitting || !hasUploadAccess}
            >
              {isSubmitting ? 'Submitting Upload...' : 'Submit Upload'}
            </Button>
            <Button kind="ghost" onClick={onReset} disabled={isSubmitting}>
              Reset
            </Button>
          </div>

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
        </Tile>
      </Column>
    </Grid>
  )
}

export default AdminUploadsPage
