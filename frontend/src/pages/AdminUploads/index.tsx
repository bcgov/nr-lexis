import { useMemo, useState, type FC } from 'react'
import {
  Button,
  Column,
  Grid,
  InlineNotification,
  Select,
  SelectItem,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
  TextArea,
  TextInput,
  Tile,
} from '@carbon/react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '@/context/auth/useAuth'
import {
  previewScaleXmlUpload,
  submitAdminUpload,
  submitScaleXmlUpload,
  type ScaleUploadPreviewResponse,
  type UploadWorkflowType,
} from '@/service/admin-upload-service'

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
  {
    type: 'applicationScaleXml',
    label: 'Application Scale XML(s)',
    requiredAction: '/applicationDetails',
    numberFieldLabel: 'Application Number',
    numberFieldPlaceholder: 'Enter application number for scales',
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
  packageNumber: string
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
  packageNumber: '',
  fileDescription: '',
}

const isNumericWithOptionalDecimal = (value: string): boolean => /^\d+(\.\d+)?$/.test(value.trim())

const getWorkflowFromQuery = (value: string | null): UploadWorkflowType => {
  if (
    value === 'application' ||
    value === 'exemption' ||
    value === 'permit' ||
    value === 'invoice' ||
    value === 'applicationScaleXml'
  ) {
    return value
  }

  if (value === 'scaleXml') {
    return 'applicationScaleXml'
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
    packageNumber: normalizeQueryValue(query.get('packageNumber')),
    fileDescription: normalizeQueryValue(query.get('fileDescription')),
  }
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
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [scalePreview, setScalePreview] = useState<ScaleUploadPreviewResponse | null>(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const selectedWorkflow = useMemo(() => {
    return (
      UPLOAD_WORKFLOW_DEFINITIONS.find((workflow) => workflow.type === selectedWorkflowType) ??
      UPLOAD_WORKFLOW_DEFINITIONS[0]
    )
  }, [selectedWorkflowType])

  const hasUploadAccess = canPerform(selectedWorkflow.requiredAction)
  const isScaleXmlWorkflow = selectedWorkflowType === 'applicationScaleXml'
  const selectedFile = selectedFiles[0] ?? null
  const selectedFileNames = selectedFiles.map((file) => file.name).join(', ')

  const validate = (): string[] => {
    const errors: string[] = []
    if (selectedFiles.length === 0) {
      errors.push(
        isScaleXmlWorkflow ? 'Choose one or more XML files to preview.' : 'Choose a file to upload.',
      )
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

    if (isScaleXmlWorkflow && !formState.applicationNumber.trim()) {
      errors.push('Application number is required.')
    }

    if (
      isScaleXmlWorkflow &&
      selectedFiles.some((file) => !file.name.toLowerCase().endsWith('.xml'))
    ) {
      errors.push('Scale upload file(s) must be XML.')
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
    setSelectedFiles([])
    setScalePreview(null)
    setErrorMessage('')
    setSuccessMessage('')
    setSearchParams({ type: workflowType }, { replace: true })
  }

  const onPreviewScaleXml = async (): Promise<void> => {
    setErrorMessage('')
    setSuccessMessage('')
    setScalePreview(null)

    if (!hasUploadAccess) {
      setErrorMessage('Your session does not include the required upload action for this workflow.')
      return
    }

    const validationErrors = validate()
    if (validationErrors.length > 0) {
      setErrorMessage(validationErrors.join(' '))
      return
    }

    if (selectedFiles.length === 0) {
      setErrorMessage('Choose one or more XML files to preview.')
      return
    }

    setIsPreviewing(true)
    try {
      const preview = await previewScaleXmlUpload({
        applicationNumber: formState.applicationNumber.trim(),
        packageNumber: formState.packageNumber.trim(),
        files: selectedFiles,
      })
      setScalePreview(preview)
      if (preview.errors.length > 0) {
        setErrorMessage(preview.errors.join(' '))
      } else if (preview.validRows === 0) {
        setErrorMessage('No valid scale rows were found in the XML(s).')
      }
    } catch (error) {
      const status = (error as any)?.response?.status
      setErrorMessage(
        status
          ? `Scale XML preview failed with status ${status}.`
          : 'Scale XML preview failed. Confirm backend scale upload endpoints are available.',
      )
    } finally {
      setIsPreviewing(false)
    }
  }

  const onSubmitScaleXml = async (): Promise<void> => {
    setErrorMessage('')
    setSuccessMessage('')

    if (!scalePreview || scalePreview.validRows === 0) {
      setErrorMessage('Preview valid XML(s) before submitting scales.')
      return
    }

    if (scalePreview.errors.length > 0) {
      setErrorMessage('Resolve XML preview errors before submitting scales.')
      return
    }

    const invalidRows = scalePreview.rows.filter((row) => !row.valid)
    if (invalidRows.length > 0) {
      setErrorMessage('Fix or remove invalid XML rows before submitting scales.')
      return
    }

    setIsSubmitting(true)
    try {
      const response = await submitScaleXmlUpload({
        applicationNumber: formState.applicationNumber.trim(),
        rows: scalePreview.rows,
      })
      if (!response.success) {
        setErrorMessage(response.errors[0] || 'Scale XML submit failed.')
        return
      }
      setSuccessMessage(response.message || 'Scale rows saved successfully.')
      setScalePreview(null)
      setSelectedFiles([])
    } catch (error) {
      const status = (error as any)?.response?.status
      setErrorMessage(
        status
          ? `Scale XML submit failed with status ${status}.`
          : 'Scale XML submit failed. Confirm backend scale upload endpoints are available.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const onSubmitUpload = async (): Promise<void> => {
    setErrorMessage('')
    setSuccessMessage('')

    if (isScaleXmlWorkflow) {
      setErrorMessage('Preview the XML(s) before submitting scale rows.')
      return
    }

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
      } else if (selectedWorkflowType === 'invoice') {
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
      setSelectedFiles([])
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
    setSelectedFiles([])
    setScalePreview(null)
    setErrorMessage('')
    setSuccessMessage('')
  }

  return (
    <Grid fullWidth className="default-grid">
      <Column sm={4} md={8} lg={16}>
        <h1>{isScaleXmlWorkflow ? 'Application Scale XML(s)' : 'Upload Center'}</h1>
        <p>
          {isScaleXmlWorkflow
            ? 'Upload XML(s), review the parsed scale rows, then submit them to the application package.'
            : 'Native React upload workflows for application, exemption, permit, and invoice documents.'}
        </p>
      </Column>

      <Column sm={4} md={8} lg={16}>
        <Tile>
          <p className="landing-help-text">
            {isScaleXmlWorkflow
              ? 'Scale XML(s) are parsed for review before scale rows are saved.'
              : 'Upload workflows submit directly to the Spring backend upload APIs.'}
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

            {(selectedWorkflowType === 'application' || isScaleXmlWorkflow) && (
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

            {(selectedWorkflowType === 'permit' ||
              selectedWorkflowType === 'invoice') && (
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

            {isScaleXmlWorkflow && (
              <TextInput
                id="packageNumber"
                labelText="Package Number"
                value={formState.packageNumber}
                placeholder="Optional when XML rows include package numbers"
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    packageNumber: event.target.value,
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
              labelText={isScaleXmlWorkflow ? 'Scale XML(s)' : 'Document File'}
              accept={isScaleXmlWorkflow ? '.xml,text/xml,application/xml' : undefined}
              multiple={isScaleXmlWorkflow}
              onChange={(event) => {
                const target = event.target as HTMLInputElement
                setSelectedFiles(Array.from(target.files ?? []))
                setScalePreview(null)
              }}
            />
            {!isScaleXmlWorkflow && (
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
            )}
          </div>
          <div className="legacy-search-actions">
            {isScaleXmlWorkflow ? (
              <>
                <Button
                  kind="primary"
                  onClick={() => void onPreviewScaleXml()}
                  disabled={isPreviewing || isSubmitting || !hasUploadAccess}
                >
                  {isPreviewing ? 'Parsing XML(s)...' : 'Preview XML(s)'}
                </Button>
                <Button
                  kind="secondary"
                  onClick={() => void onSubmitScaleXml()}
                  disabled={
                    isSubmitting ||
                    !hasUploadAccess ||
                    !scalePreview ||
                    scalePreview.validRows === 0 ||
                    scalePreview.errors.length > 0 ||
                    scalePreview.rows.some((row) => !row.valid)
                  }
                >
                  {isSubmitting ? 'Submitting Scales...' : 'Submit Reviewed Scales'}
                </Button>
              </>
            ) : (
              <Button
                kind="primary"
                onClick={() => void onSubmitUpload()}
                disabled={isSubmitting || !hasUploadAccess}
              >
                {isSubmitting ? 'Submitting Upload...' : 'Submit Upload'}
              </Button>
            )}
            <Button kind="ghost" onClick={onReset} disabled={isSubmitting}>
              Reset
            </Button>
          </div>

          {selectedFiles.length > 0 && (
            <p className="landing-help-text">
              {isScaleXmlWorkflow ? 'Selected XML(s)' : 'Selected file'}:{' '}
              <strong>{selectedFileNames}</strong>
            </p>
          )}

          {isScaleXmlWorkflow && scalePreview && (
            <div>
              <p className="landing-help-text">
                Parsed {scalePreview.totalRows} scale row(s) from XML(s), {scalePreview.validRows}{' '}
                valid. Total: {scalePreview.totalPieces.toLocaleString()} pieces /{' '}
                {scalePreview.totalVolume.toLocaleString()} m3.
              </p>
              <Table useZebraStyles>
                <TableHead>
                  <TableRow>
                    <TableHeader>Row</TableHeader>
                    <TableHeader>Source XML</TableHeader>
                    <TableHeader>Package</TableHeader>
                    <TableHeader>Timber Mark</TableHeader>
                    <TableHeader>Species</TableHeader>
                    <TableHeader>Grade</TableHeader>
                    <TableHeader>Pieces</TableHeader>
                    <TableHeader>Volume (m3)</TableHeader>
                    <TableHeader>Status</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {scalePreview.rows.map((row) => (
                    <TableRow key={`${row.sourceFileName ?? 'xml'}-${row.lineNumber}`}>
                      <TableCell>{row.lineNumber}</TableCell>
                      <TableCell>{row.sourceFileName || '-'}</TableCell>
                      <TableCell>{row.packageNumber || '-'}</TableCell>
                      <TableCell>{row.timberMark || '-'}</TableCell>
                      <TableCell>{row.speciesDescription || row.speciesCode || '-'}</TableCell>
                      <TableCell>{row.gradeDescription || row.gradeCode || '-'}</TableCell>
                      <TableCell>{row.pieces?.toLocaleString() ?? '-'}</TableCell>
                      <TableCell>{row.volume?.toLocaleString() ?? '-'}</TableCell>
                      <TableCell>
                        <Tag type={row.valid ? 'green' : 'red'}>
                          {row.valid ? 'Valid' : row.errors.join(' ')}
                        </Tag>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
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
