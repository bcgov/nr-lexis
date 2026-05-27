import { useMemo, useState, type FC } from 'react'
import {
  Button,
  Column,
  Grid,
  InlineNotification,
  Select,
  SelectItem,
  Tag,
  TextArea,
  TextInput,
  Tile,
} from '@carbon/react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '@/context/auth/useAuth'
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

const isNumericWithOptionalDecimal = (value: string): boolean => /^\d+(\.\d+)?$/.test(value.trim())

const getWorkflowFromQuery = (value: string | null): UploadWorkflowType => {
  if (
    value === 'application' ||
    value === 'exemption' ||
    value === 'permit' ||
    value === 'invoice'
  ) {
    return value
  }

  return 'application'
}

const AdminUploadsPage: FC = () => {
  const { canPerform } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const initialWorkflow = getWorkflowFromQuery(searchParams.get('type'))
  const [selectedWorkflowType, setSelectedWorkflowType] =
    useState<UploadWorkflowType>(initialWorkflow)
  const [formState, setFormState] = useState<UploadFormState>(INITIAL_FORM_STATE)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const selectedWorkflow = useMemo(() => {
    return (
      UPLOAD_WORKFLOW_DEFINITIONS.find((workflow) => workflow.type === selectedWorkflowType) ??
      UPLOAD_WORKFLOW_DEFINITIONS[0]
    )
  }, [selectedWorkflowType])

  const hasUploadAccess = canPerform(selectedWorkflow.requiredAction)

  const validate = (): string[] => {
    const errors: string[] = []
    if (!selectedFile) {
      errors.push('Choose a file to upload.')
    }

    if (selectedWorkflowType === 'application' && !formState.applicationNumber.trim()) {
      errors.push('Application number is required.')
    }

    if (selectedWorkflowType === 'exemption' && !formState.exemptionNumber.trim()) {
      errors.push('Exemption number is required.')
    }

    if (
      (selectedWorkflowType === 'permit' || selectedWorkflowType === 'invoice') &&
      !formState.permitNumber.trim()
    ) {
      errors.push('Permit number is required.')
    }

    if (selectedWorkflowType === 'invoice') {
      if (!formState.salesInvoiceNumber.trim()) {
        errors.push('Invoice number is required.')
      }
      if (!formState.invoiceExportValue.trim()) {
        errors.push('Invoice export value is required.')
      }
      if (
        formState.invoiceExportValue.trim() &&
        !isNumericWithOptionalDecimal(formState.invoiceExportValue)
      ) {
        errors.push('Invoice export value must be numeric.')
      }
      if (!isNumericWithOptionalDecimal(formState.invoiceConversionRate)) {
        errors.push('Invoice conversion rate must be numeric.')
      }
      if (!isNumericWithOptionalDecimal(formState.invoiceFeeInLieu)) {
        errors.push('Invoice fee in lieu must be numeric.')
      }
    }

    return errors
  }

  const setWorkflowType = (workflowType: UploadWorkflowType): void => {
    setSelectedWorkflowType(workflowType)
    setErrorMessage('')
    setSuccessMessage('')
    setSearchParams({ type: workflowType }, { replace: true })
  }

  const onSubmitUpload = async (): Promise<void> => {
    setErrorMessage('')
    setSuccessMessage('')

    if (!hasUploadAccess) {
      setErrorMessage('Your session does not include the required upload action for this workflow.')
      return
    }

    const validationErrors = validate()
    if (validationErrors.length > 0) {
      setErrorMessage(validationErrors.join(' '))
      return
    }

    if (!selectedFile) {
      setErrorMessage('Choose a file to upload.')
      return
    }

    setIsSubmitting(true)

    try {
      if (selectedWorkflowType === 'application') {
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

      setSuccessMessage(
        'Upload request submitted. Verify document and invoice updates in the target details view.',
      )
      setSelectedFile(null)
    } catch (error) {
      const status = (error as any)?.response?.status
      if (status) {
        setErrorMessage(`Upload request failed with status ${status}.`)
      } else {
        setErrorMessage('Upload request failed. Confirm backend upload endpoints are available.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const onReset = (): void => {
    setFormState(INITIAL_FORM_STATE)
    setSelectedFile(null)
    setErrorMessage('')
    setSuccessMessage('')
  }

  return (
    <Grid fullWidth className="default-grid">
      <Column sm={4} md={8} lg={16}>
        <h1>Upload Center</h1>
        <p>
          Native React upload workflows for application, exemption, permit, and invoice documents.
        </p>
      </Column>

      <Column sm={4} md={8} lg={16}>
        <Tile>
          <p className="landing-help-text">
            Upload API calls are native-first and will use legacy endpoints only as fallback during
            backend transition.
          </p>
          <div className="legacy-search-grid">
            <Select
              id="uploadWorkflowType"
              labelText="Workflow"
              value={selectedWorkflowType}
              onChange={(event) => setWorkflowType(event.target.value as UploadWorkflowType)}
            >
              {UPLOAD_WORKFLOW_DEFINITIONS.map((workflow) => (
                <SelectItem key={workflow.type} value={workflow.type} text={workflow.label} />
              ))}
            </Select>

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
              labelText="Document File"
              onChange={(event) => {
                const target = event.target as HTMLInputElement
                setSelectedFile(target.files?.[0] ?? null)
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
