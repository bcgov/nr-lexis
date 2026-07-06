import { useState, type ChangeEvent, type DragEvent } from 'react'
import { Upload } from '@carbon/icons-react'
import {
  Button,
  Column,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
} from '@carbon/react'
import { AppNotification } from '../../components/AppNotification'
import { useAuth } from '@/context/auth/useAuth'
import {
  previewRtmEmsLogAmvUpload,
  uploadRtmEmsLogAmv,
  type RtmEmsLogAmvUploadPreview,
  type RtmEmsLogAmvUploadResult,
} from '@/service/rtm-emslogamv-service'

type PendingUploadValidation = {
  fileName: string
  fileSize: number
}

const parseStatusTag = (status: string | undefined) => {
  if (!status) {
    return 'gray'
  }

  if (status === 'accepted') {
    return 'green'
  }

  if (status === 'validation_failed') {
    return 'blue'
  }

  return 'red'
}

const formatMoney = (value: number | null) => {
  if (value === null || Number.isNaN(value)) {
    return ''
  }

  return value.toLocaleString('en-CA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  })
}

const createResultMessage = (status: string, message: string, errors: string[]): string => {
  return [message, ...errors].filter(Boolean).join(' ')
}

const RTM_UPLOAD_ACCEPT = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
const RTM_TEMPLATE_DOWNLOAD_PATH = '/templates/rtm-ems-log-amv-template.xlsx'
const RTM_TEMPLATE_DOWNLOAD_NAME = 'rtm-ems-log-amv-template.xlsx'

const RTM_UPLOAD_ONLY_DESCRIPTION =
  'Generate an upload preview from XLSX files and apply validated average monthly value changes.'

const RTMEmsLogAmvPage = () => {
  const { canPerform } = useAuth()
  const canManage = canPerform('/lexisAgentAdmin')
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [notification, setNotification] = useState('')
  const [notificationKind, setNotificationKind] = useState<
    'success' | 'error' | 'warning' | 'info'
  >('info')
  const [previewResult, setPreviewResult] = useState<RtmEmsLogAmvUploadPreview | null>(null)
  const [selectedUploadFile, setSelectedUploadFile] = useState<File | null>(null)
  const [pendingUploadValidation, setPendingUploadValidation] =
    useState<PendingUploadValidation | null>(null)
  const [uploadResult, setUploadResult] = useState<RtmEmsLogAmvUploadResult | null>(null)
  const [uploadInputKey, setUploadInputKey] = useState(0)
  const [isDraggingUpload, setIsDraggingUpload] = useState(false)

  const selectUploadFile = (nextFile: File | null) => {
    setSelectedUploadFile(nextFile)
    setUploadError('')
    setPreviewResult(null)
    setUploadResult(null)
    setPendingUploadValidation(null)
  }

  const updateUploadFile = (event: ChangeEvent<HTMLInputElement>) => {
    selectUploadFile(event.currentTarget.files?.[0] ?? null)
  }

  const onDropUploadFile = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDraggingUpload(false)
    if (!canManage) {
      return
    }
    selectUploadFile(event.dataTransfer.files?.[0] ?? null)
  }

  const clearUploadState = () => {
    setSelectedUploadFile(null)
    setUploadError('')
    setPreviewResult(null)
    setUploadResult(null)
    setPendingUploadValidation(null)
    setUploadInputKey((current) => current + 1)
    setIsDraggingUpload(false)
  }

  const submitPreview = async () => {
    if (!selectedUploadFile) {
      setUploadError('Select an XLSX file before generating a preview.')
      return
    }

    setUploadError('')
    setIsPreviewing(true)
    try {
      const response = await previewRtmEmsLogAmvUpload(selectedUploadFile)
      setPreviewResult(response)
      if (!/\.(xlsx)$/i.test(selectedUploadFile.name)) {
        setUploadError('The selected file may not be XLSX. Rename with .xlsx and try again.')
      } else if (response.status === 'accepted') {
        setPendingUploadValidation({
          fileName: selectedUploadFile.name,
          fileSize: selectedUploadFile.size,
        })
      } else {
        setPendingUploadValidation(null)
      }
    } catch (error) {
      console.error(error)
      setUploadError('Unable to generate preview for this upload.')
      setPreviewResult(null)
      setPendingUploadValidation(null)
    } finally {
      setIsPreviewing(false)
    }
  }

  const submitUpload = async () => {
    if (!canManage) {
      setUploadError('You do not have permission to upload average monthly value rows.')
      return
    }

    if (!selectedUploadFile) {
      setUploadError('Select an XLSX file before applying upload.')
      return
    }

    if (
      !pendingUploadValidation ||
      pendingUploadValidation.fileName !== selectedUploadFile.name ||
      pendingUploadValidation.fileSize !== selectedUploadFile.size
    ) {
      setUploadError('Run a successful preview with this file before applying the upload.')
      return
    }

    setUploadError('')
    setUploadResult(null)
    setIsUploading(true)

    try {
      const response = await uploadRtmEmsLogAmv({
        file: selectedUploadFile,
      })

      setUploadResult(response)
      setNotificationKind(
        response.status === 'accepted'
          ? 'success'
          : response.status === 'validation_failed'
            ? 'warning'
            : 'error',
      )
      setNotification(createResultMessage(response.status, response.message, response.errors))
    } catch (error) {
      console.error(error)
      const message = 'Unable to apply average monthly value upload.'
      setNotificationKind('error')
      setNotification(message)
      setUploadResult({
        status: 'rejected',
        message,
        attemptedRowCount: 0,
        uploadedRowCount: 0,
        errors: [message],
        warnings: [],
        rows: [],
      })
    } finally {
      setPendingUploadValidation(null)
      setIsUploading(false)
    }
  }

  const isPreviewDisabled =
    isPreviewing ||
    !selectedUploadFile ||
    selectedUploadFile.size <= 0 ||
    !RTM_UPLOAD_ACCEPT.some(
      (type) =>
        selectedUploadFile.type === type || selectedUploadFile.name.toLowerCase().endsWith('.xlsx'),
    )

  const isUploadDisabled =
    isUploading ||
    !canManage ||
    !selectedUploadFile ||
    selectedUploadFile.size <= 0 ||
    !pendingUploadValidation ||
    pendingUploadValidation.fileName !== selectedUploadFile.name ||
    pendingUploadValidation.fileSize !== selectedUploadFile.size ||
    !RTM_UPLOAD_ACCEPT.some(
      (type) =>
        selectedUploadFile.type === type || selectedUploadFile.name.toLowerCase().endsWith('.xlsx'),
    )

  const uploadDropZoneClassName = [
    'admin-upload-drop-zone',
    isDraggingUpload ? 'is-dragging' : '',
    !canManage ? 'is-disabled' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <Grid fullWidth className="default-grid">
      <Column sm={4} md={8} lg={16}>
        <h1>Average Monthly Values</h1>
        <p>{RTM_UPLOAD_ONLY_DESCRIPTION}</p>
      </Column>

      <Column sm={4} md={8} lg={16}>
        <section className="admin-upload-panel" aria-labelledby="rtm-upload-title">
          <div className="admin-upload-panel__header">
            <div>
              <h2 id="rtm-upload-title">Upload Excel Spreadsheet</h2>
              <p>
                Select or drag and drop an XLSX spreadsheet to validate average monthly value rows
                before applying changes.
              </p>
            </div>
            <a
              className="cds--btn cds--btn--ghost"
              href={RTM_TEMPLATE_DOWNLOAD_PATH}
              download={RTM_TEMPLATE_DOWNLOAD_NAME}
            >
              Download template
            </a>
          </div>

          <div
            className={uploadDropZoneClassName}
            onDragEnter={(event) => {
              event.preventDefault()
              if (canManage) {
                setIsDraggingUpload(true)
              }
            }}
            onDragOver={(event) => {
              event.preventDefault()
              if (canManage) {
                setIsDraggingUpload(true)
              }
            }}
            onDragLeave={() => setIsDraggingUpload(false)}
            onDrop={onDropUploadFile}
          >
            <div className="admin-upload-drop-zone__icon" aria-hidden="true">
              <Upload size={32} />
            </div>
            <div className="admin-upload-drop-zone__copy">
              <p>Drag and drop your Excel file here, or browse for files.</p>
              <p>
                Supported format: .xlsx. Enter the update date and AMV values in the template;
                values apply to old and second growth.
              </p>
            </div>
            <input
              key={uploadInputKey}
              id="rtm-upload-file"
              className="admin-upload-native-input"
              type="file"
              aria-label="Average monthly values upload spreadsheet"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              disabled={!canManage}
              onChange={updateUploadFile}
            />
            <label
              className={`cds--btn cds--btn--primary admin-upload-browse-button${
                !canManage ? ' cds--btn--disabled' : ''
              }`}
              htmlFor={canManage ? 'rtm-upload-file' : undefined}
              aria-disabled={!canManage}
              onClick={(event) => {
                if (!canManage) {
                  event.preventDefault()
                }
              }}
            >
              Browse files
            </label>
          </div>

          {selectedUploadFile && (
            <div
              className="admin-upload-queue-summary"
              aria-label="Selected average monthly values upload file"
            >
              <div>
                <span>Selected file</span>
                <strong>{selectedUploadFile.name}</strong>
              </div>
              <div>
                <span>Size</span>
                <strong>{selectedUploadFile.size.toLocaleString()} bytes</strong>
              </div>
            </div>
          )}

          <div className="admin-upload-preview-footer">
            <Button
              kind="secondary"
              onClick={() => {
                void submitPreview()
              }}
              disabled={isPreviewDisabled}
            >
              Preview data
            </Button>
          </div>
        </section>
      </Column>

      <Column sm={4} md={8} lg={16}>
        <section className="admin-upload-panel" aria-labelledby="rtm-preview-title">
          <div className="admin-upload-panel__header">
            <div>
              <h2 id="rtm-preview-title">Data Preview</h2>
              <p>Review validation results before applying the spreadsheet upload.</p>
            </div>
            <div className="admin-upload-preview-actions">
              <Button kind="secondary" size="sm" onClick={clearUploadState}>
                Clear
              </Button>
              <Button
                kind="primary"
                size="sm"
                onClick={() => {
                  void submitUpload()
                }}
                disabled={isUploadDisabled}
              >
                Apply upload
              </Button>
            </div>
          </div>
          {uploadError && (
            <p className="landing-page-help-text landing-page-help-text--error">{uploadError}</p>
          )}
          {!uploadError && selectedUploadFile && !isUploadDisabled && (
            <p style={{ marginTop: '0.5rem' }}>
              Upload has passed validation for the selected file and metadata.
            </p>
          )}
          {!uploadError &&
            selectedUploadFile &&
            (pendingUploadValidation === null ||
              pendingUploadValidation.fileName !== selectedUploadFile.name ||
              pendingUploadValidation.fileSize !== selectedUploadFile.size) && (
              <p className="landing-page-help-text landing-page-help-text--error">
                Generate a valid preview before applying the upload.
              </p>
            )}

          {!previewResult && (
            <div style={{ marginTop: '0.75rem', padding: '2rem 1rem', textAlign: 'center' }}>
              <p>No preview data yet.</p>
              <p className="landing-page-help-text">
                Upload an XLSX file above and select Preview data to validate it.
              </p>
            </div>
          )}

          {previewResult && (
            <div style={{ marginTop: '0.75rem' }}>
              <Tag type={parseStatusTag(previewResult.status)}>{previewResult.status}</Tag>
              <p>{previewResult.message}</p>
              {previewResult.fileName && <p>File: {previewResult.fileName}</p>}
              {previewResult.updateDate && <p>Update date: {previewResult.updateDate}</p>}
              <p>Rows to apply: {previewResult.rowCount}</p>

              {previewResult.errors.length > 0 && (
                <div>
                  <h3>Errors</h3>
                  <ul>
                    {previewResult.errors.map((error) => (
                      <li key={error}>{error}</li>
                    ))}
                  </ul>
                </div>
              )}

              {previewResult.warnings.length > 0 && (
                <div>
                  <h3>Warnings</h3>
                  <ul>
                    {previewResult.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}

              {previewResult.rows.length > 0 && (
                <Table useZebraStyles>
                  <TableHead>
                    <TableRow>
                      <TableHeader>Species code</TableHeader>
                      <TableHeader>Grade</TableHeader>
                      <TableHeader>Growth</TableHeader>
                      <TableHeader>New value</TableHeader>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {previewResult.rows.map((row) => (
                      <TableRow
                        key={`${row.species ?? ''}-${row.grade ?? ''}-${
                          row.growthIndicator ?? ''
                        }-${row.newValue ?? ''}`}
                      >
                        <TableCell>{row.species ?? ''}</TableCell>
                        <TableCell>{row.grade ?? ''}</TableCell>
                        <TableCell>{row.growthIndicator ?? ''}</TableCell>
                        <TableCell>{formatMoney(row.newValue)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          )}

          {uploadResult && (
            <div style={{ marginTop: '0.75rem' }}>
              <Tag type={parseStatusTag(uploadResult.status)}>{uploadResult.status}</Tag>
              <p>
                {createResultMessage(
                  uploadResult.status,
                  uploadResult.message,
                  uploadResult.errors,
                )}
              </p>
              {uploadResult.fileName && <p>File: {uploadResult.fileName}</p>}
              <p>
                Attempted rows: {uploadResult.attemptedRowCount} | Uploaded rows:{' '}
                {uploadResult.uploadedRowCount}
              </p>

              {uploadResult.warnings.length > 0 && (
                <div>
                  <h3>Warnings</h3>
                  <ul>
                    {uploadResult.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </section>
      </Column>

      {notification && (
        <Column sm={4} md={8} lg={16}>
          <AppNotification
            kind={notificationKind}
            role="status"
            title="Average monthly values"
            subtitle={notification}
            onCloseButtonClick={() => {
              setNotification('')
            }}
          />
        </Column>
      )}
    </Grid>
  )
}

export default RTMEmsLogAmvPage
