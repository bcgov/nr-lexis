import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import {
  Button,
  Column,
  Grid,
  Select,
  SelectItem,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
  TextInput,
  Tile,
} from '@carbon/react'
import { AppNotification } from '../../components/AppNotification'
import IsoDatePicker from '../../components/IsoDatePicker'
import { useAuth } from '@/context/auth/useAuth'
import {
  isValidIsoDate,
  parseNonNegativeDecimalFieldValue,
  requiredFieldError,
  requiredNumericFieldError,
} from '@/pages/shared/create-form-utils'
import {
  previewRtmEmsLogAmvUpload,
  uploadRtmEmsLogAmv,
  saveRtmEmsLogAmv,
  searchRtmEmsLogAmv,
  type RtmEmsLogAmvFilters,
  type RtmEmsLogAmvMutationResult,
  type RtmEmsLogAmvRow,
  type RtmEmsLogAmvSaveRequest,
  type RtmEmsLogAmvUploadPreview,
  type RtmEmsLogAmvUploadResult,
} from '@/service/rtm-emslogamv-service'

const INITIAL_FILTERS: RtmEmsLogAmvFilters = {
  species: '',
  growthIndicator: '',
  retrievalDate: '',
  updateDate: '',
}

type ManualFormState = {
  species: string
  grade: string
  growthIndicator: string
  retrievalDate: string
  updateDate: string
  newValue: string
  saveMode: 'create' | 'update'
}

const INITIAL_FORM: ManualFormState = {
  species: '',
  grade: '',
  growthIndicator: '',
  retrievalDate: '',
  updateDate: '',
  newValue: '',
  saveMode: 'create',
}

type PendingUploadValidation = {
  fileName: string
  fileSize: number
}

const hasInvalidIsoDateValue = (retrievalDate: string, updateDate: string): boolean => {
  const normalizedRetrievalDate = retrievalDate.trim()
  const normalizedUpdateDate = updateDate.trim()

  return (
    (normalizedRetrievalDate.length > 0 && !isValidIsoDate(normalizedRetrievalDate)) ||
    (normalizedUpdateDate.length > 0 && !isValidIsoDate(normalizedUpdateDate))
  )
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

const formatDecimalField = (value: number | null): string => {
  if (value === null || Number.isNaN(value)) {
    return ''
  }

  return String(value)
}

const createResultMessage = (status: string, message: string, errors: string[]): string => {
  return [message, ...errors].filter(Boolean).join(' ')
}

const RTM_UPLOAD_ACCEPT = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
const RTM_TEMPLATE_DOWNLOAD_PATH = '/templates/rtm-ems-log-amv-template.xlsx'
const RTM_TEMPLATE_DOWNLOAD_NAME = 'rtm-ems-log-amv-template.xlsx'

const RTM_MODULE_DESCRIPTION =
  'Query current and historical RTM AMV rows, make manual create/update entries, and generate an upload preview from XLSX files.'

const RTMEmsLogAmvPage = () => {
  const { canPerform } = useAuth()
  const canManage = canPerform('/lexisAgentAdmin')
  const [filters, setFilters] = useState<RtmEmsLogAmvFilters>(INITIAL_FILTERS)
  const [rows, setRows] = useState<RtmEmsLogAmvRow[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [manualError, setManualError] = useState('')
  const [uploadError, setUploadError] = useState('')
  const [notification, setNotification] = useState('')
  const [notificationKind, setNotificationKind] = useState<
    'success' | 'error' | 'warning' | 'info'
  >('info')
  const [previewResult, setPreviewResult] = useState<RtmEmsLogAmvUploadPreview | null>(null)
  const [manualForm, setManualForm] = useState<typeof INITIAL_FORM>(INITIAL_FORM)
  const [manualResult, setManualResult] = useState<RtmEmsLogAmvMutationResult | null>(null)
  const [selectedUploadFile, setSelectedUploadFile] = useState<File | null>(null)
  const [pendingUploadValidation, setPendingUploadValidation] =
    useState<PendingUploadValidation | null>(null)
  const [uploadResult, setUploadResult] = useState<RtmEmsLogAmvUploadResult | null>(null)

  const hasSearchDateError = useMemo(
    () => hasInvalidIsoDateValue(filters.retrievalDate, filters.updateDate),
    [filters],
  )

  const pageSummary = useMemo(
    () => ({
      resultCount: rows.length,
      hasFilter: Object.values(filters).some((value) => value.trim().length > 0),
    }),
    [rows.length, filters],
  )

  const runSearch = useCallback(async (nextFilters: RtmEmsLogAmvFilters) => {
    setSearchError('')

    if (hasInvalidIsoDateValue(nextFilters.retrievalDate, nextFilters.updateDate)) {
      setSearchError('Date filters must be valid YYYY-MM-DD values.')
      return
    }

    setIsLoading(true)
    try {
      const response = await searchRtmEmsLogAmv(nextFilters)
      setRows(response)
    } catch (error) {
      console.error(error)
      setSearchError('Failed to load RTM AMV rows.')
      setRows([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  const updateFilter = (field: keyof RtmEmsLogAmvFilters, value: string) => {
    setFilters((current) => ({ ...current, [field]: value }))
  }

  const updateManualField = (field: keyof typeof INITIAL_FORM, value: string) => {
    setManualForm((current) => ({ ...current, [field]: value }))
  }

  const loadManualFormFromRow = (row: RtmEmsLogAmvRow) => {
    setManualForm({
      species: row.species ?? '',
      grade: row.grade ?? '',
      growthIndicator: row.growthIndicator ?? '',
      retrievalDate: row.retrievalDate ?? '',
      updateDate: row.updateDate ?? '',
      newValue: formatDecimalField(row.newValue ?? row.currentValue),
      saveMode: 'update',
    })
    setManualError('')
    setManualResult(null)
  }

  const updateUploadFile = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.currentTarget.files?.[0] ?? null
    setSelectedUploadFile(nextFile)
    setUploadError('')
    setPreviewResult(null)
    setUploadResult(null)
    setPendingUploadValidation(null)
  }

  const runInitialSearch = useCallback(() => {
    void runSearch(INITIAL_FILTERS)
  }, [runSearch])

  const submitSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canManage) {
      setManualError('You do not have permission to save RTM rows.')
      return
    }

    setManualResult(null)
    setManualError('')

    const nextError =
      requiredFieldError(manualForm.species, 'Species') ||
      requiredFieldError(manualForm.grade, 'Grade') ||
      requiredFieldError(manualForm.growthIndicator, 'Growth indicator') ||
      requiredFieldError(manualForm.retrievalDate, 'Retrieval date') ||
      (manualForm.saveMode === 'update'
        ? requiredFieldError(manualForm.updateDate, 'Update date')
        : null) ||
      (manualForm.retrievalDate && !isValidIsoDate(manualForm.retrievalDate)
        ? 'Retrieval date must be YYYY-MM-DD.'
        : null) ||
      (manualForm.updateDate && !isValidIsoDate(manualForm.updateDate)
        ? 'Update date must be YYYY-MM-DD.'
        : null) ||
      requiredNumericFieldError(manualForm.newValue, 'New value')

    if (nextError) {
      setManualError(nextError)
      return
    }

    const parsedNewValue = parseNonNegativeDecimalFieldValue(manualForm.newValue)
    if (parsedNewValue === null) {
      setManualError('New value must be a valid numeric amount.')
      return
    }

    const request: RtmEmsLogAmvSaveRequest = {
      species: manualForm.species.trim(),
      grade: manualForm.grade.trim(),
      growthIndicator: manualForm.growthIndicator.trim(),
      retrievalDate: manualForm.retrievalDate.trim(),
      updateDate: manualForm.updateDate.trim(),
      newValue: parsedNewValue,
      saveMode: manualForm.saveMode,
    }

    setIsSaving(true)
    try {
      const response = await saveRtmEmsLogAmv(request)
      setManualResult(response)
      setNotificationKind(response.status === 'accepted' ? 'success' : 'error')
      setNotification(createResultMessage(response.status, response.message, response.errors))
      if (response.status === 'accepted') {
        await runSearch(filters)
      }
    } catch (error) {
      console.error(error)
      const message = 'Unable to save RTM AMV row.'
      setNotificationKind('error')
      setNotification(message)
      setManualResult({
        status: 'rejected',
        message,
        errors: [message],
        rows: [],
      })
    } finally {
      setIsSaving(false)
    }
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
      setUploadError('You do not have permission to upload RTM rows.')
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
      if (response.status === 'accepted' || response.status === 'validation_failed') {
        await runSearch({
          ...filters,
          retrievalDate: previewResult?.retrievalDate ?? filters.retrievalDate,
          growthIndicator: '',
        })
      }
    } catch (error) {
      console.error(error)
      const message = 'Unable to apply RTM AMV upload.'
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

  useEffect(() => {
    runInitialSearch()
  }, [runInitialSearch])

  return (
    <Grid fullWidth className="default-grid">
      <Column sm={4} md={8} lg={16}>
        <h1>RTM EMS Log AMV</h1>
        <p>{RTM_MODULE_DESCRIPTION}</p>
      </Column>

      <Column sm={4} md={8} lg={16}>
        <Tile>
          <h2 className="dashboard-title">Query rows</h2>

          <div className="legacy-search-grid">
            <TextInput
              id="rtm-species"
              labelText="Species"
              value={filters.species}
              onChange={(event) => updateFilter('species', event.target.value)}
            />

            <TextInput
              id="rtm-growth-indicator"
              labelText="Growth indicator"
              value={filters.growthIndicator}
              onChange={(event) => updateFilter('growthIndicator', event.target.value)}
            />

            <IsoDatePicker
              id="rtm-retrieval-date"
              labelText="Retrieval date"
              value={filters.retrievalDate}
              onChange={(value) => updateFilter('retrievalDate', value)}
            />

            <IsoDatePicker
              id="rtm-update-date"
              labelText="Update date"
              value={filters.updateDate}
              onChange={(value) => updateFilter('updateDate', value)}
            />

            <Button
              size="sm"
              onClick={() => {
                void runSearch(filters)
              }}
              disabled={isLoading || hasSearchDateError}
            >
              Search
            </Button>

            <Button
              kind="secondary"
              size="sm"
              onClick={() => {
                const nextFilters = { ...INITIAL_FILTERS }
                setFilters(nextFilters)
                void runSearch(nextFilters)
              }}
            >
              Clear
            </Button>
          </div>

          {searchError && (
            <p className="landing-page-help-text landing-page-help-text--error">{searchError}</p>
          )}

          <div className="legacy-search-grid" style={{ marginTop: '0.75rem' }}>
            <strong>Rows returned:</strong>
            <span>{pageSummary.resultCount}</span>
            <span>Filtered:</span>
            <span>{pageSummary.hasFilter ? 'Yes' : 'No'}</span>
          </div>

          <Table useZebraStyles>
            <TableHead>
              <TableRow>
                <TableHeader>Species</TableHeader>
                <TableHeader>Grade</TableHeader>
                <TableHeader>Growth</TableHeader>
                <TableHeader>Retrieval date</TableHeader>
                <TableHeader>Update date</TableHeader>
                <TableHeader>Current value</TableHeader>
                <TableHeader>New value</TableHeader>
                <TableHeader>Actions</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => {
                const key = `${row.species ?? ''}-${row.grade ?? ''}-${row.growthIndicator ?? ''}-${
                  row.retrievalDate ?? ''
                }-${row.updateDate ?? ''}`
                return (
                  <TableRow key={key}>
                    <TableCell>{row.species ?? ''}</TableCell>
                    <TableCell>{row.grade ?? ''}</TableCell>
                    <TableCell>{row.growthIndicator ?? ''}</TableCell>
                    <TableCell>{row.retrievalDate ?? ''}</TableCell>
                    <TableCell>{row.updateDate ?? ''}</TableCell>
                    <TableCell>{formatMoney(row.currentValue)}</TableCell>
                    <TableCell>{formatMoney(row.newValue)}</TableCell>
                    <TableCell>
                      <Button
                        kind="ghost"
                        size="sm"
                        onClick={() => {
                          loadManualFormFromRow(row)
                        }}
                        disabled={!canManage}
                      >
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}

              {rows.length === 0 && !isLoading && !searchError && (
                <TableRow>
                  <TableCell colSpan={8}>No rows match your current search.</TableCell>
                </TableRow>
              )}

              {isLoading && (
                <TableRow>
                  <TableCell colSpan={8}>Loading rows…</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Tile>
      </Column>

      <Column sm={4} md={8} lg={16}>
        <Tile>
          <h2 className="dashboard-title">Manual entry</h2>
          <form onSubmit={submitSave}>
            <div className="legacy-search-grid">
              <TextInput
                id="rtm-manual-species"
                labelText="Species"
                value={manualForm.species}
                onChange={(event) => updateManualField('species', event.target.value)}
                disabled={!canManage}
              />
              <TextInput
                id="rtm-manual-grade"
                labelText="Grade"
                value={manualForm.grade}
                onChange={(event) => updateManualField('grade', event.target.value)}
                disabled={!canManage}
              />
              <TextInput
                id="rtm-manual-growth"
                labelText="Growth indicator"
                value={manualForm.growthIndicator}
                onChange={(event) => updateManualField('growthIndicator', event.target.value)}
                disabled={!canManage}
              />
              <IsoDatePicker
                id="rtm-manual-retrieval-date"
                labelText="Retrieval date"
                value={manualForm.retrievalDate}
                onChange={(value) => updateManualField('retrievalDate', value)}
                disabled={!canManage}
              />
              <Select
                id="rtm-save-mode"
                labelText="Save mode"
                value={manualForm.saveMode}
                onChange={(event) =>
                  updateManualField('saveMode', event.target.value as 'create' | 'update')
                }
                disabled={!canManage}
              >
                <SelectItem value="create" text="Create" />
                <SelectItem value="update" text="Update" />
              </Select>
              {manualForm.saveMode === 'update' && (
                <IsoDatePicker
                  id="rtm-manual-update-date"
                  labelText="Update date"
                  value={manualForm.updateDate}
                  onChange={(value) => updateManualField('updateDate', value)}
                  disabled={!canManage}
                />
              )}
              <TextInput
                id="rtm-manual-new-value"
                labelText="New value"
                value={manualForm.newValue}
                onChange={(event) => updateManualField('newValue', event.target.value)}
                disabled={!canManage}
              />
            </div>

            {manualError && (
              <p className="landing-page-help-text landing-page-help-text--error">{manualError}</p>
            )}

            <Button kind="primary" type="submit" disabled={isSaving || !canManage}>
              Save row
            </Button>

            {manualResult && (
              <div style={{ marginTop: '0.75rem' }}>
                <Tag type={parseStatusTag(manualResult.status)}>{manualResult.status}</Tag>
                <p>
                  {createResultMessage(
                    manualResult.status,
                    manualResult.message,
                    manualResult.errors,
                  )}
                </p>
              </div>
            )}
          </form>
        </Tile>
      </Column>

      <Column sm={4} md={8} lg={16}>
        <Tile>
          <div className="legacy-search-section-header">
            <div>
              <h2 className="dashboard-title">Upload Log Spreadsheet</h2>
              <p className="landing-page-help-text">
                Upload an XLSX spreadsheet to validate RTM EMS AMV rows before applying changes. The
                first row supplies the update date; retrieval date is calculated as the previous
                month and values are applied to both old and second growth.
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

          <div className="legacy-search-grid">
            <div>
              <label htmlFor="rtm-upload-file">Choose an XLSX file to preview and apply</label>
              <input
                id="rtm-upload-file"
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={updateUploadFile}
              />
              {selectedUploadFile && <p>Selected: {selectedUploadFile.name}</p>}
            </div>
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
        </Tile>
      </Column>

      <Column sm={4} md={8} lg={16}>
        <Tile>
          <h2 className="dashboard-title">Data Preview</h2>
          <p className="landing-page-help-text">
            Review validation results before applying the spreadsheet upload.
          </p>
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
              {previewResult.retrievalDate && <p>Retrieval date: {previewResult.retrievalDate}</p>}
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
                      <TableHeader>Retrieval date</TableHeader>
                      <TableHeader>Update date</TableHeader>
                      <TableHeader>New value</TableHeader>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {previewResult.rows.map((row) => (
                      <TableRow
                        key={`${row.species ?? ''}-${row.grade ?? ''}-${
                          row.growthIndicator ?? ''
                        }-${row.retrievalDate ?? ''}-${row.updateDate ?? ''}-${row.newValue ?? ''}`}
                      >
                        <TableCell>{row.species ?? ''}</TableCell>
                        <TableCell>{row.grade ?? ''}</TableCell>
                        <TableCell>{row.growthIndicator ?? ''}</TableCell>
                        <TableCell>{row.retrievalDate ?? ''}</TableCell>
                        <TableCell>{row.updateDate ?? ''}</TableCell>
                        <TableCell>{formatMoney(row.newValue)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          )}

          <Button
            kind="primary"
            onClick={() => {
              void submitUpload()
            }}
            disabled={isUploadDisabled}
          >
            Apply upload
          </Button>

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
        </Tile>
      </Column>

      {notification && (
        <Column sm={4} md={8} lg={16}>
          <AppNotification
            kind={notificationKind}
            role="status"
            title="RTM AMV"
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
