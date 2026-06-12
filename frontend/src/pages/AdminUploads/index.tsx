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

const AdminUploadsPage: FC = () => {
  const { canPerform } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const initialWorkflow = getWorkflowFromQuery(searchParams.get('type'))
  const [selectedWorkflowType, setSelectedWorkflowType] =
    useState<UploadWorkflowType>(initialWorkflow)
  const [formState, setFormState] = useState<UploadFormState>(() =>
    buildInitialFormStateFromQuery(searchParams),
  )
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
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
      uploadFile: selectedFile
        ? undefined
        : selectedWorkflowType === 'lexisXml'
          ? 'Choose a LEXIS XML or ZIP file to import.'
          : 'Choose a file to upload.',
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
    [formState, selectedFile, selectedWorkflowType],
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
    setErrorMessage('')
    setSuccessMessage('')
    setShowValidationErrors(false)
    setSearchParams({ type: workflowType }, { replace: true })
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

    if (!selectedFile) {
      setErrorMessage('Choose a file to upload.')
      return
    }

    setIsSubmitting(true)

    try {
      if (selectedWorkflowType === 'lexisXml') {
        const result = await submitAdminUpload('lexisXml', {
          file: selectedFile,
          fileDescription: formState.fileDescription.trim(),
        })
        setSuccessMessage(
          result.message ??
            'LEXIS XML import submitted. Verify the created application and package details.',
        )
      } else if (selectedWorkflowType === 'application') {
        await submitAdminUpload('application', {
          applicationNumber: formState.applicationNumber.trim(),
          file: selectedFile,
          fileDescription: formState.fileDescription.trim(),
        })
      } else if (selectedWorkflowType === 'exemption') {
        await submitAdminUpload('exemption', {
          exemptionNumber: formState.exemptionNumber.trim(),
          file: selectedFile,
          fileDescription: formState.fileDescription.trim(),
        })
      } else if (selectedWorkflowType === 'permit') {
        await submitAdminUpload('permit', {
          permitNumber: formState.permitNumber.trim(),
          file: selectedFile,
          fileDescription: formState.fileDescription.trim(),
        })
      } else {
        await submitAdminUpload('invoice', {
          permitNumber: formState.permitNumber.trim(),
          salesInvoiceNumber: formState.salesInvoiceNumber.trim(),
          invoiceExportValue: formState.invoiceExportValue.trim(),
          invoiceConversionRate: formState.invoiceConversionRate.trim(),
          invoiceFeeInLieu: formState.invoiceFeeInLieu.trim(),
          file: selectedFile,
          fileDescription: formState.fileDescription.trim(),
        })
      }

      if (selectedWorkflowType !== 'lexisXml') {
        setSuccessMessage(
          'Upload request submitted. Verify document and invoice updates in the target details view.',
        )
      }
      setSelectedFile(null)
    } catch (error) {
      setErrorMessage(extractUploadErrorMessage(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  const onReset = (): void => {
    setFormState(INITIAL_FORM_STATE)
    setSelectedFile(null)
    setErrorMessage('')
    setSuccessMessage('')
    setShowValidationErrors(false)
  }

  return (
    <Grid fullWidth className="default-grid">
      <Column sm={4} md={8} lg={16}>
        <h1>Upload Center</h1>
      </Column>

      <Column sm={4} md={8} lg={16}>
        <Tile>
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
              <Tag type={hasUploadAccess ? 'green' : 'red'}>
                {hasUploadAccess ? 'Allowed' : 'Not Granted'}
              </Tag>
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

            <TextInput
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
              invalid={!!fieldError('uploadFile')}
              invalidText={fieldError('uploadFile')}
              onChange={(event) => {
                const target = event.target as HTMLInputElement
                setSelectedFile(target.files?.[0] ?? null)
                markFieldTouched('uploadFile')
              }}
            />
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

          {selectedFile && (
            <p className="landing-help-text">
              Selected file: <strong>{selectedFile.name}</strong>
            </p>
          )}

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
