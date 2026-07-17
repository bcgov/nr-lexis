/**
 * Retained AMV workbook upload and review workflow.
 *
 * The table workflow in index.tsx is the active route. This module is deliberately
 * not routed. Reactivation requires restoring server-side authorization and an
 * atomic-save review before it can be exposed again.
 */

import {
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import {
  ArrowRight,
  CheckmarkFilled,
  Close,
  Document,
  Download,
  ErrorFilled,
  InformationFilled,
} from '@carbon/icons-react'
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
} from '@carbon/react'
import { AppNotification } from '../../components/AppNotification'
import { useAuth } from '@/context/auth/useAuth'
import {
  previewRtmEmsLogAmvUpload,
  uploadRtmEmsLogAmv,
  type RtmEmsLogAmvRow,
  type RtmEmsLogAmvUploadPreview,
  type RtmEmsLogAmvUploadResult,
} from '@/service/rtm-emslogamv-service'
import UploadWorkflowProgress from '@/components/uploads/UploadWorkflowProgress'
import { validateUploadFileSize } from '@/components/uploads/uploadQueueHelpers'

type PendingUploadValidation = {
  fileName: string
  fileSize: number
}

type RtmUploadStep = 'upload' | 'review'

type RtmReviewSpeciesColumn = {
  key: string
  label: string
  speciesCodes: string[]
}

type RtmReviewMatrixRow = {
  key: string
  grade: string
  values: Record<string, RtmReviewCellValues>
}

type RtmReviewCellValues = Record<string, number | null>

const uploadResultStatusClass = (status: string | undefined) => {
  if (!status) {
    return 'queued'
  }

  if (status === 'accepted') {
    return 'complete'
  }

  if (status === 'validation_failed') {
    return 'invalid'
  }

  return 'failed'
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

const formatUploadMonth = (dateValue: string | null | undefined): string | null => {
  const match = /^(\d{4})-(\d{2})-\d{2}/.exec(dateValue ?? '')
  if (!match) {
    return null
  }

  const year = Number(match[1])
  const monthIndex = Number(match[2]) - 1
  if (!Number.isInteger(year) || monthIndex < 0 || monthIndex > 11) {
    return null
  }

  return new Intl.DateTimeFormat('en-CA', {
    month: 'long',
    timeZone: 'UTC',
    year: 'numeric',
  }).format(new Date(Date.UTC(year, monthIndex, 1)))
}

const createAcceptedUploadMessage = (previewResult: RtmEmsLogAmvUploadPreview | null): string => {
  const monthLabel = formatUploadMonth(previewResult?.updateDate ?? previewResult?.retrievalDate)
  return monthLabel ? `New values applied for ${monthLabel}.` : 'New values applied.'
}

const normalizeIsoDate = (dateValue: string | null | undefined): string | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateValue ?? '')
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null
}

const isUpdateBeforeRetrieval = (previewResult: RtmEmsLogAmvUploadPreview): boolean => {
  const retrievalDate = normalizeIsoDate(previewResult.retrievalDate)
  const updateDate = normalizeIsoDate(previewResult.updateDate)
  return !!retrievalDate && !!updateDate && updateDate < retrievalDate
}

const validateAcceptedPreview = (
  previewResult: RtmEmsLogAmvUploadPreview,
): RtmEmsLogAmvUploadPreview => {
  if (previewResult.status !== 'accepted' || !isUpdateBeforeRetrieval(previewResult)) {
    return previewResult
  }

  return {
    ...previewResult,
    status: 'validation_failed',
    message: 'Upload template validation failed.',
    errors: [...previewResult.errors, 'Update date must be on or after the retrieval date.'],
  }
}

const RTM_UPLOAD_ACCEPT = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
const RTM_TEMPLATE_DOWNLOAD_PATH = '/templates/rtm-ems-log-amv-template.xlsx'
const RTM_TEMPLATE_DOWNLOAD_NAME = 'rtm-ems-log-amv-template.xlsx'

const RTM_UPLOAD_ONLY_DESCRIPTION = 'Update average monthly values by uploading an XLSX file.'
const RTM_UPLOAD_STEP_DESCRIPTION =
  'Add your completed template to check for errors before the new values take effect.'
const RTM_UPLOAD_FIELD_HELPER = 'Accepted formats: .xlsx. Maximum file size: 20 MiB.'

const RTM_UPLOAD_REVIEW_STEPS = [
  { id: 'upload', label: 'Upload' },
  { id: 'review', label: 'Review' },
]

const RTM_REVIEW_SPECIES_COLUMNS: RtmReviewSpeciesColumn[] = [
  { key: 'BA', label: 'Balsam', speciesCodes: ['BA'] },
  { key: 'HE', label: 'Hemlock', speciesCodes: ['HE'] },
  { key: 'CE', label: 'Cedar', speciesCodes: ['CE'] },
  { key: 'CY', label: 'Cypress', speciesCodes: ['CY'] },
  { key: 'FI', label: 'Fir', speciesCodes: ['FI'] },
  { key: 'SP', label: 'Spruce', speciesCodes: ['SP'] },
  { key: 'WH', label: 'Western white pine', speciesCodes: ['WH'] },
  { key: 'LO', label: 'Lodgepole pine', speciesCodes: ['LO'] },
  { key: 'YE', label: 'Yellow pine', speciesCodes: ['YE'] },
]

const RTM_REVIEW_GRADE_ORDER = [
  'A',
  'B',
  'C',
  'D',
  'E',
  'F',
  'G',
  'H',
  'I',
  'J',
  'K',
  'L',
  'M',
  'U',
  'W',
  'X',
  'Y',
  'Z',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  'BLANK',
]

const RTM_REVIEW_GROWTH_ORDER = ['O', 'S']

const normalizeKey = (value: string | null | undefined) => (value ?? '').trim().toUpperCase()

const normalizeGrade = (value: string | null | undefined) => {
  if (value === ' ') {
    return 'BLANK'
  }

  const normalized = normalizeKey(value)
  return normalized === 'BLANK' ? 'BLANK' : normalized
}

const isAcceptedUploadFile = (file: File) => {
  return (
    file.size > 0 &&
    RTM_UPLOAD_ACCEPT.some(
      (type) => file.type === type || file.name.toLowerCase().endsWith('.xlsx'),
    )
  )
}

const resolveSpeciesColumnKey = (species: string | null | undefined) => {
  const normalizedSpecies = normalizeKey(species)
  if (!normalizedSpecies) {
    return ''
  }

  const matchedColumn = RTM_REVIEW_SPECIES_COLUMNS.find((column) =>
    column.speciesCodes.includes(normalizedSpecies),
  )

  return matchedColumn?.key ?? normalizedSpecies
}

const buildReviewSpeciesColumns = (rows: RtmEmsLogAmvRow[]): RtmReviewSpeciesColumn[] => {
  const knownColumnKeys = new Set(RTM_REVIEW_SPECIES_COLUMNS.map((column) => column.key))
  const extraColumns = new Set<string>()

  rows.forEach((row) => {
    const columnKey = resolveSpeciesColumnKey(row.species)
    if (columnKey && !knownColumnKeys.has(columnKey)) {
      extraColumns.add(columnKey)
    }
  })

  return [
    ...RTM_REVIEW_SPECIES_COLUMNS,
    ...Array.from(extraColumns)
      .sort()
      .map((columnKey) => ({
        key: columnKey,
        label: columnKey,
        speciesCodes: [columnKey],
      })),
  ]
}

const formatGrowthIndicator = (growthIndicator: string) => {
  if (growthIndicator === 'O') {
    return 'Old growth'
  }

  if (growthIndicator === 'S') {
    return 'Second growth'
  }

  return growthIndicator
}

const compareMatrixRows = (left: RtmReviewMatrixRow, right: RtmReviewMatrixRow) => {
  const leftGradeIndex = RTM_REVIEW_GRADE_ORDER.indexOf(left.grade)
  const rightGradeIndex = RTM_REVIEW_GRADE_ORDER.indexOf(right.grade)
  const normalizedLeftGradeIndex =
    leftGradeIndex === -1 ? RTM_REVIEW_GRADE_ORDER.length : leftGradeIndex
  const normalizedRightGradeIndex =
    rightGradeIndex === -1 ? RTM_REVIEW_GRADE_ORDER.length : rightGradeIndex

  if (normalizedLeftGradeIndex !== normalizedRightGradeIndex) {
    return normalizedLeftGradeIndex - normalizedRightGradeIndex
  }

  return left.grade.localeCompare(right.grade)
}

const buildReviewMatrixRows = (rows: RtmEmsLogAmvRow[]): RtmReviewMatrixRow[] => {
  const matrixRows = new Map<string, RtmReviewMatrixRow>()

  RTM_REVIEW_GRADE_ORDER.forEach((grade) => {
    matrixRows.set(grade, {
      key: grade,
      grade,
      values: {},
    })
  })

  rows.forEach((row) => {
    const grade = normalizeGrade(row.grade)
    const growthIndicator = normalizeKey(row.growthIndicator)
    const speciesColumnKey = resolveSpeciesColumnKey(row.species)

    if (!grade || !speciesColumnKey) {
      return
    }

    const matrixRowKey = grade
    const matrixRow =
      matrixRows.get(matrixRowKey) ??
      ({
        key: matrixRowKey,
        grade,
        values: {},
      } satisfies RtmReviewMatrixRow)

    const columnValues = matrixRow.values[speciesColumnKey] ?? {}
    if (!(growthIndicator in columnValues)) {
      columnValues[growthIndicator] = row.newValue
    }
    matrixRow.values[speciesColumnKey] = columnValues
    matrixRows.set(matrixRowKey, matrixRow)
  })

  return Array.from(matrixRows.values()).sort(compareMatrixRows)
}

const growthSortIndex = (growthIndicator: string) => {
  const index = RTM_REVIEW_GROWTH_ORDER.indexOf(growthIndicator)
  return index === -1 ? RTM_REVIEW_GROWTH_ORDER.length : index
}

const formatReviewCell = (values: RtmReviewCellValues | undefined) => {
  if (!values || Object.keys(values).length === 0) {
    return ''
  }

  const entries = Object.entries(values)
    .filter(([, value]) => formatMoney(value))
    .sort(([leftGrowth], [rightGrowth]) => {
      const indexComparison = growthSortIndex(leftGrowth) - growthSortIndex(rightGrowth)
      return indexComparison === 0 ? leftGrowth.localeCompare(rightGrowth) : indexComparison
    })

  const uniqueValues = Array.from(new Set(entries.map(([, value]) => formatMoney(value))))
  if (uniqueValues.length <= 1) {
    return uniqueValues[0] ?? ''
  }

  return (
    <span className="rtm-review-cell-values">
      {entries.map(([growthIndicator, value]) => (
        <span key={growthIndicator}>
          <span>{formatGrowthIndicator(growthIndicator)}</span>
          <strong>{formatMoney(value)}</strong>
        </span>
      ))}
    </span>
  )
}

const UploadValidationMessage = ({
  kind,
  title,
  children,
}: {
  kind: 'info' | 'success' | 'error'
  title: string
  children: ReactNode
}) => {
  const Icon =
    kind === 'success' ? CheckmarkFilled : kind === 'error' ? ErrorFilled : InformationFilled

  return (
    <div
      className={`admin-upload-validation admin-upload-validation--${kind}`}
      role={kind === 'error' ? 'alert' : 'status'}
      aria-live={kind === 'error' ? 'assertive' : 'polite'}
    >
      <Icon size={20} className="admin-upload-validation__icon" aria-hidden="true" />
      <div className="admin-upload-validation__content">
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  )
}

const buildValidationIssueRows = (
  details: string[],
): Array<{ detail: string; key: string; severity: 'Error' }> => {
  const occurrences = new Map<string, number>()

  return details.map((detail) => {
    const occurrence = (occurrences.get(detail) ?? 0) + 1
    occurrences.set(detail, occurrence)

    return {
      detail,
      key: `Error-${detail}-${occurrence}`,
      severity: 'Error',
    }
  })
}

const ValidationIssuesTable = ({ errors }: { errors: string[] }) => {
  const issues = buildValidationIssueRows(errors)

  if (issues.length === 0) {
    return null
  }

  return (
    <div className="admin-upload-validation-table-wrap">
      <div className="admin-upload-validation-table-header">
        <span>Validation issues ({issues.length})</span>
      </div>
      <table className="admin-upload-validation-table" aria-label="Upload validation issues">
        <thead>
          <tr>
            <th className="admin-upload-validation-table__issue" scope="col">
              Issue
            </th>
            <th scope="col">Detail</th>
          </tr>
        </thead>
        <tbody>
          {issues.map((issue) => (
            <tr key={issue.key}>
              <td className="admin-upload-validation-table__issue">{issue.severity}</td>
              <td>{issue.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const UploadValidationStatus = ({
  isPreviewing,
  uploadError,
  previewResult,
  selectedUploadFile,
}: {
  isPreviewing: boolean
  uploadError: string
  previewResult: RtmEmsLogAmvUploadPreview | null
  selectedUploadFile: File | null
}) => {
  if (uploadError) {
    return (
      <UploadValidationMessage kind="error" title="File not ready">
        <p>{uploadError}</p>
      </UploadValidationMessage>
    )
  }

  if (isPreviewing) {
    return (
      <UploadValidationMessage kind="info" title="Validating spreadsheet">
        <p>Checking the uploaded workbook before review.</p>
      </UploadValidationMessage>
    )
  }

  if (!previewResult) {
    return null
  }

  const isAccepted = previewResult.status === 'accepted'
  const issueCount = previewResult.errors.length

  return (
    <>
      <UploadValidationMessage
        kind={isAccepted ? 'success' : 'error'}
        title={
          isAccepted
            ? 'Spreadsheet validated'
            : `${issueCount} validation issue${issueCount === 1 ? '' : 's'} found`
        }
      >
        <p>
          {selectedUploadFile
            ? `"${selectedUploadFile.name}" ${isAccepted ? 'is ready for review.' : 'needs correction before review.'}`
            : previewResult.message}
        </p>
        {!isAccepted && (
          <p>Correct the issues in your spreadsheet, then replace the file to continue.</p>
        )}
        {isAccepted && <p>{previewResult.message}</p>}
      </UploadValidationMessage>
      <ValidationIssuesTable errors={previewResult.errors} />
    </>
  )
}

const ReviewUploadContent = ({
  previewResult,
  uploadResult,
}: {
  previewResult: RtmEmsLogAmvUploadPreview
  uploadResult: RtmEmsLogAmvUploadResult | null
}) => {
  const speciesColumns = buildReviewSpeciesColumns(previewResult.rows)
  const matrixRows = buildReviewMatrixRows(previewResult.rows)

  return (
    <div className="admin-upload-review admin-upload-review--rtm">
      {matrixRows.length > 0 ? (
        <div className="admin-upload-review-table">
          <Table aria-label="Average monthly value upload review">
            <TableHead>
              <TableRow>
                <TableHeader>Grade</TableHeader>
                {speciesColumns.map((column) => (
                  <TableHeader key={column.key}>{column.label}</TableHeader>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {matrixRows.map((row) => (
                <TableRow key={row.key}>
                  <TableCell>{row.grade}</TableCell>
                  {speciesColumns.map((column) => (
                    <TableCell key={column.key}>
                      {formatReviewCell(row.values[column.key])}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <p className="admin-upload-review__empty-result">No parsed AMV rows are available.</p>
      )}

      {uploadResult && (
        <div className="admin-upload-result" role="status">
          <span
            className={`admin-upload-status-text admin-upload-status-text--${uploadResultStatusClass(uploadResult.status)}`}
          >
            {uploadResult.status}
          </span>
          <p>
            {createResultMessage(uploadResult.status, uploadResult.message, uploadResult.errors)}
          </p>
          <p>
            Attempted rows: {uploadResult.attemptedRowCount} | Uploaded rows:{' '}
            {uploadResult.uploadedRowCount}
          </p>
        </div>
      )}
    </div>
  )
}

const LegacyRtmEmsLogAmvUploadWorkflow = () => {
  const { canPerform } = useAuth()
  const canManage = canPerform('/lexisAgentAdmin')
  const validationRequestRef = useRef(0)
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const [uploadStep, setUploadStep] = useState<RtmUploadStep>('upload')
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [notification, setNotification] = useState('')
  const [notificationTitle, setNotificationTitle] = useState('Average monthly values')
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

  const validateUploadFile = async (nextFile: File | null) => {
    const requestId = validationRequestRef.current + 1
    validationRequestRef.current = requestId

    setUploadStep('upload')
    setSelectedUploadFile(nextFile)
    setUploadError('')
    setPreviewResult(null)
    setUploadResult(null)
    setPendingUploadValidation(null)

    if (!nextFile) {
      return
    }

    const sizeError = validateUploadFileSize(nextFile)
    if (sizeError) {
      setUploadError(sizeError)
      return
    }

    if (!isAcceptedUploadFile(nextFile)) {
      setUploadError('Upload an XLSX file before continuing.')
      return
    }

    setIsPreviewing(true)

    try {
      const response = await previewRtmEmsLogAmvUpload(nextFile)

      if (validationRequestRef.current !== requestId) {
        return
      }

      const validatedResponse = validateAcceptedPreview(response)
      setPreviewResult(validatedResponse)
      if (validatedResponse.status === 'accepted') {
        setPendingUploadValidation({
          fileName: nextFile.name,
          fileSize: nextFile.size,
        })
      } else {
        setPendingUploadValidation(null)
      }
    } catch (error) {
      if (validationRequestRef.current !== requestId) {
        return
      }

      console.error(error)
      setUploadError('Unable to validate this upload.')
      setPreviewResult(null)
      setPendingUploadValidation(null)
    } finally {
      if (validationRequestRef.current === requestId) {
        setIsPreviewing(false)
      }
    }
  }

  const updateUploadFile = (event: ChangeEvent<HTMLInputElement>) => {
    void validateUploadFile(event.currentTarget.files?.[0] ?? null)
  }

  const onDropUploadFile = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDraggingUpload(false)
    if (!canManage) {
      return
    }
    void validateUploadFile(event.dataTransfer.files?.[0] ?? null)
  }

  const openUploadFileDialog = () => {
    if (!canManage) {
      return
    }

    uploadInputRef.current?.click()
  }

  const onUploadDropZoneKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return
    }

    event.preventDefault()
    openUploadFileDialog()
  }

  const clearUploadState = () => {
    validationRequestRef.current += 1
    setUploadStep('upload')
    setSelectedUploadFile(null)
    setUploadError('')
    setPreviewResult(null)
    setUploadResult(null)
    setPendingUploadValidation(null)
    setUploadInputKey((current) => current + 1)
    setIsDraggingUpload(false)
    setIsPreviewing(false)
  }

  const submitUpload = async () => {
    if (!canManage) {
      setUploadError('You do not have permission to upload average monthly value rows.')
      return
    }

    if (!selectedUploadFile) {
      setUploadError('Upload an XLSX file before submitting changes.')
      return
    }

    if (
      !pendingUploadValidation ||
      pendingUploadValidation.fileName !== selectedUploadFile.name ||
      pendingUploadValidation.fileSize !== selectedUploadFile.size
    ) {
      setUploadError('Validate this file before submitting changes.')
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
      if (response.status === 'accepted') {
        setNotificationTitle('Average monthly values updated')
        setNotification(createAcceptedUploadMessage(previewResult))
        clearUploadState()
      } else {
        setNotificationTitle('Average monthly values')
        setNotification(createResultMessage(response.status, response.message, response.errors))
      }
    } catch (error) {
      console.error(error)
      const message = 'Unable to apply average monthly value upload.'
      setNotificationKind('error')
      setNotificationTitle('Average monthly values')
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

  const hasCurrentUploadValidation =
    !!selectedUploadFile &&
    selectedUploadFile.size > 0 &&
    !!pendingUploadValidation &&
    pendingUploadValidation.fileName === selectedUploadFile.name &&
    pendingUploadValidation.fileSize === selectedUploadFile.size

  const isReviewReady = hasCurrentUploadValidation && previewResult?.status === 'accepted'

  const isReviewDisabled = isPreviewing || !canManage

  const isUploadDisabled =
    isUploading ||
    !canManage ||
    !selectedUploadFile ||
    selectedUploadFile.size <= 0 ||
    !pendingUploadValidation ||
    pendingUploadValidation.fileName !== selectedUploadFile.name ||
    pendingUploadValidation.fileSize !== selectedUploadFile.size ||
    previewResult?.status !== 'accepted'

  const openReviewStep = () => {
    if (!canManage) {
      setUploadError('You do not have permission to upload average monthly value rows.')
      return
    }

    if (!selectedUploadFile || selectedUploadFile.size <= 0) {
      setUploadError('Please upload a file before continuing.')
      return
    }

    if (!isReviewReady) {
      setUploadError('Upload a spreadsheet that passes validation before reviewing it.')
      return
    }

    setUploadError('')
    setUploadStep('review')
  }

  const uploadDropZoneClassName = [
    'admin-upload-drop-zone',
    isDraggingUpload ? 'is-dragging' : '',
    !canManage ? 'is-disabled' : '',
  ]
    .filter(Boolean)
    .join(' ')
  const completedWorkflowSteps = uploadStep === 'review' ? ['upload'] : []

  return (
    <Grid fullWidth className="default-grid admin-upload-fspts-page">
      <Column sm={4} md={8} lg={16} className="admin-upload-fspts-header">
        <h1>Average Monthly Values</h1>
        <p>{RTM_UPLOAD_ONLY_DESCRIPTION}</p>
        <UploadWorkflowProgress
          steps={RTM_UPLOAD_REVIEW_STEPS}
          currentStepId={uploadStep}
          completedStepIds={completedWorkflowSteps}
          ariaLabel="Average monthly values upload workflow progress"
        />
      </Column>

      <Column sm={4} md={8} lg={16} className="admin-upload-fspts-content">
        {uploadStep === 'upload' ? (
          <>
            <div className="admin-upload-section-heading">
              <h2 id="rtm-upload-title">Upload</h2>
              <p>{RTM_UPLOAD_STEP_DESCRIPTION}</p>
            </div>

            <section className="admin-upload-panel" aria-labelledby="rtm-upload-title">
              <div className="admin-upload-field-header">
                <div>
                  <span className="admin-upload-field-label">Upload Excel Spreadsheet</span>
                  <p className="admin-upload-field-helper">{RTM_UPLOAD_FIELD_HELPER}</p>
                </div>
                <a
                  className="admin-upload-template-card"
                  href={RTM_TEMPLATE_DOWNLOAD_PATH}
                  download={RTM_TEMPLATE_DOWNLOAD_NAME}
                  aria-label="Download template"
                >
                  <span>
                    <span className="admin-upload-template-card__title">Download template</span>
                    <span className="admin-upload-template-card__meta">XLSX</span>
                  </span>
                  <Download size={16} aria-hidden="true" />
                </a>
              </div>

              <input
                ref={uploadInputRef}
                key={uploadInputKey}
                id="rtm-upload-file"
                className="admin-upload-native-input"
                type="file"
                aria-label="Average monthly values upload spreadsheet"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                disabled={!canManage}
                onChange={updateUploadFile}
              />

              <div
                className={uploadDropZoneClassName}
                role="button"
                tabIndex={canManage ? 0 : -1}
                aria-disabled={!canManage}
                aria-label="Choose an average monthly values upload spreadsheet"
                onClick={openUploadFileDialog}
                onKeyDown={onUploadDropZoneKeyDown}
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
                <div className="admin-upload-drop-zone__copy">
                  <p>Drag and drop files here or click to upload</p>
                </div>
              </div>

              {selectedUploadFile && (
                <div
                  className="admin-upload-file-chip"
                  aria-label="Selected average monthly values upload file"
                >
                  <Document size={16} aria-hidden="true" />
                  <span className="admin-upload-file-chip__name">{selectedUploadFile.name}</span>
                  <span className="admin-upload-file-chip__size">
                    {selectedUploadFile.size.toLocaleString()} bytes
                  </span>
                  <button
                    type="button"
                    className="admin-upload-file-chip__remove"
                    aria-label="Clear selected file"
                    onClick={clearUploadState}
                  >
                    <Close size={16} />
                  </button>
                </div>
              )}

              <UploadValidationStatus
                isPreviewing={isPreviewing}
                uploadError={uploadError}
                previewResult={previewResult}
                selectedUploadFile={selectedUploadFile}
              />
            </section>

            <div className="admin-upload-fspts-button-row">
              <Button
                kind="primary"
                size="md"
                className="admin-upload-fspts-action-button"
                renderIcon={ArrowRight}
                onClick={openReviewStep}
                disabled={isReviewDisabled}
              >
                Review
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="admin-upload-section-heading">
              <h2 id="rtm-review-title">Review</h2>
              <p>Review the details extracted from your file and submit when ready</p>
            </div>

            <section className="admin-upload-panel" aria-labelledby="rtm-review-title">
              {uploadError && (
                <p className="landing-page-help-text landing-page-help-text--error">
                  {uploadError}
                </p>
              )}

              {previewResult && (
                <ReviewUploadContent previewResult={previewResult} uploadResult={uploadResult} />
              )}
            </section>

            <div className="admin-upload-fspts-button-row">
              <Button kind="ghost" size="md" onClick={() => setUploadStep('upload')}>
                Back
              </Button>
              <Button
                kind="primary"
                size="md"
                className="admin-upload-fspts-action-button"
                renderIcon={ArrowRight}
                onClick={() => {
                  void submitUpload()
                }}
                disabled={isUploadDisabled}
              >
                Submit
              </Button>
            </div>
          </>
        )}
      </Column>

      {notification && (
        <Column sm={4} md={8} lg={16}>
          <AppNotification
            kind={notificationKind}
            role="status"
            title={notificationTitle}
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

export default LegacyRtmEmsLogAmvUploadWorkflow
