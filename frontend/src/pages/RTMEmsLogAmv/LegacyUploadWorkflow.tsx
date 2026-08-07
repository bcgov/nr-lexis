/** Spreadsheet-only AMV upload and review workflow. */

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import {
  CheckmarkFilled,
  Close,
  Document,
  Download,
  ErrorFilled,
  InformationFilled,
  Save,
  WarningAltFilled,
} from '@carbon/icons-react'
import {
  Button,
  Column,
  Grid,
  InlineLoading,
  InlineNotification,
  Select,
  SelectItem,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
} from '@carbon/react'
import { AppNotification } from '../../components/AppNotification'
import PageHeader from '@/components/PageHeader'
import { useAuth } from '@/context/auth/useAuth'
import {
  previewRtmEmsLogAmvUpload,
  uploadRtmEmsLogAmv,
  type RtmEmsLogAmvRow,
  type RtmEmsLogAmvUploadPreview,
  type RtmEmsLogAmvUploadResult,
} from '@/service/rtm-emslogamv-service'
import { validateUploadFileSize } from '@/components/uploads/uploadQueueHelpers'
import { formatBusinessIsoDate } from '@/utils/date'

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

type RtmSpeciesReviewRow = {
  currentValues: RtmReviewCellValues
  key: string
  grade: string
  hasWarning: boolean
  newValues: RtmReviewCellValues
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

const currentEffectiveMonth = () => `${formatBusinessIsoDate().slice(0, 7)}-01`

const shiftEffectiveMonth = (dateValue: string, offset: number): string => {
  const match = /^(\d{4})-(\d{2})-01$/.exec(dateValue)
  if (!match) {
    return dateValue
  }

  const shifted = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1 + offset, 1))
  return shifted.toISOString().slice(0, 10)
}

const formatEffectiveDateRange = (dateValue: string): string => {
  const match = /^(\d{4})-(\d{2})-01$/.exec(dateValue)
  if (!match) {
    return dateValue
  }

  const year = Number(match[1])
  const monthIndex = Number(match[2]) - 1
  const month = new Intl.DateTimeFormat('en-CA', {
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, monthIndex, 1)))
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
  return `${month} 1 to ${lastDay}, ${year}`
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

const RTM_UPLOAD_ONLY_DESCRIPTION =
  'Set the domestic log values that become the fee in lieu of export on coastal permits.'
const RTM_VALUES_DESCRIPTION =
  'Your spreadsheet fills in a value for each species and grade, ready to check before you save.'
const RTM_UPLOAD_FIELD_HELPER = 'Accepted format: .xlsx, up to 20 MB.'

const RTM_REVIEW_SPECIES_COLUMNS: RtmReviewSpeciesColumn[] = [
  { key: 'BA', label: 'Balsam', speciesCodes: ['BA'] },
  { key: 'HE', label: 'Hemlock', speciesCodes: ['HE'] },
  { key: 'CE', label: 'Cedar', speciesCodes: ['CE'] },
  { key: 'CY', label: 'Cypress', speciesCodes: ['CY'] },
  { key: 'FI', label: 'Fir', speciesCodes: ['FI'] },
  { key: 'SP', label: 'Spruce', speciesCodes: ['SP'] },
  { key: 'PINE', label: 'Pine', speciesCodes: ['WH', 'LO', 'YE', 'PINE'] },
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
  'X',
  'Y',
]

const HIDDEN_REVIEW_GRADES = new Set(['W', 'Z', '1', '2', '3', '4', '5', '6', 'BLANK'])

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

const compareReviewRows = (left: RtmSpeciesReviewRow, right: RtmSpeciesReviewRow) => {
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

const includesWholeToken = (value: string, token: string) => {
  const escapedToken = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^A-Z0-9])${escapedToken}([^A-Z0-9]|$)`).test(value)
}

const warningReferencesSpecies = (warning: string, column: RtmReviewSpeciesColumn) => {
  const normalizedWarning = normalizeKey(warning)
  return [column.key, column.label, ...column.speciesCodes].some((token) =>
    includesWholeToken(normalizedWarning, normalizeKey(token)),
  )
}

const warningReferencesGrade = (warning: string, grade: string) => {
  const normalizedWarning = normalizeKey(warning)
  return (
    normalizedWarning.includes(`GRADE ${grade}`) ||
    normalizedWarning.includes(`GRADE '${grade}'`) ||
    normalizedWarning.includes(`GRADE "${grade}"`)
  )
}

const buildSpeciesReviewRows = (
  rows: RtmEmsLogAmvRow[],
  column: RtmReviewSpeciesColumn,
  warnings: string[],
): RtmSpeciesReviewRow[] => {
  const reviewRows = new Map<string, RtmSpeciesReviewRow>()

  rows.forEach((row) => {
    const grade = normalizeGrade(row.grade)
    const growthIndicator = normalizeKey(row.growthIndicator)
    const speciesColumnKey = resolveSpeciesColumnKey(row.species)

    if (
      !grade ||
      !growthIndicator ||
      speciesColumnKey !== column.key ||
      HIDDEN_REVIEW_GRADES.has(grade)
    ) {
      return
    }

    const reviewRow =
      reviewRows.get(grade) ??
      ({
        currentValues: {},
        key: `${column.key}-${grade}`,
        grade,
        hasWarning: false,
        newValues: {},
      } satisfies RtmSpeciesReviewRow)

    if (!(growthIndicator in reviewRow.currentValues)) {
      reviewRow.currentValues[growthIndicator] = row.currentValue
    }
    if (!(growthIndicator in reviewRow.newValues)) {
      reviewRow.newValues[growthIndicator] = row.newValue
    }

    reviewRow.hasWarning =
      reviewRow.hasWarning ||
      row.currentValue === null ||
      row.newValue === null ||
      warnings.some(
        (warning) =>
          warningReferencesSpecies(warning, column) && warningReferencesGrade(warning, grade),
      )
    reviewRows.set(grade, reviewRow)
  })

  return Array.from(reviewRows.values()).sort(compareReviewRows)
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
  uploadError,
  previewResult,
  selectedUploadFile,
}: {
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

const formatSpeciesList = (labels: string[]) => {
  if (labels.length === 0) {
    return ''
  }

  return new Intl.ListFormat('en-CA', { style: 'long', type: 'conjunction' }).format(labels)
}

const SpeciesReviewTable = ({
  column,
  currentMonthLabel,
  nextMonthLabel,
  rows,
}: {
  column: RtmReviewSpeciesColumn
  currentMonthLabel: string
  nextMonthLabel: string
  rows: RtmSpeciesReviewRow[]
}) => {
  if (rows.length === 0) {
    return (
      <p className="rtm-amv-species-review__empty">
        No uploaded values are available for {column.label}.
      </p>
    )
  }

  return (
    <div className="rtm-amv-species-table-wrap">
      <table
        className="rtm-amv-species-table"
        aria-label={`${column.label} average market value review`}
      >
        <thead>
          <tr>
            <th scope="col">Grade</th>
            <th scope="col">{currentMonthLabel}</th>
            <th scope="col">{nextMonthLabel}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <th scope="row">{row.grade}</th>
              <td className="rtm-amv-species-table__current-value">
                {formatReviewCell(row.currentValues) || '—'}
              </td>
              <td className={row.hasWarning ? 'has-warning' : undefined}>
                <span className="rtm-amv-species-table__new-value">
                  {formatReviewCell(row.newValues) || '—'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const ReviewUploadContent = ({
  previewResult,
  uploadResult,
}: {
  previewResult: RtmEmsLogAmvUploadPreview
  uploadResult: RtmEmsLogAmvUploadResult | null
}) => {
  const [selectedSpeciesIndex, setSelectedSpeciesIndex] = useState(0)
  const speciesColumns = buildReviewSpeciesColumns(previewResult.rows)
  const speciesRows = speciesColumns.map((column) =>
    buildSpeciesReviewRows(previewResult.rows, column, previewResult.warnings),
  )
  const warnedSpecies = speciesColumns.filter((_, index) =>
    speciesRows[index].some((row) => row.hasWarning),
  )
  const warningCellCount = speciesRows.reduce(
    (total, rows) => total + rows.filter((row) => row.hasWarning).length,
    0,
  )
  const warningCount = warningCellCount || previewResult.warnings.length
  const warningLabel = warningCellCount > 0 ? 'cell' : 'upload warning'
  const warningVerb = warningCount === 1 ? 'needs' : 'need'
  const currentMonthLabel = formatUploadMonth(previewResult.retrievalDate) ?? 'Current values'
  const nextMonthLabel = formatUploadMonth(previewResult.updateDate) ?? 'New values'
  const warningSpeciesText = formatSpeciesList(warnedSpecies.map((column) => column.label))

  return (
    <section className="rtm-amv-review-card" aria-label="Uploaded average market values review">
      {warningCount > 0 && (
        <InlineNotification
          className="rtm-amv-review-notification rtm-amv-review-notification--warning"
          kind="warning"
          lowContrast
          hideCloseButton
          title={`${warningCount} ${warningLabel}${warningCount === 1 ? '' : 's'} ${warningVerb} a look before you save`}
          subtitle={
            warningSpeciesText
              ? `In ${warningSpeciesText}, highlighted below. You can save either way.`
              : 'Review the upload warnings before saving. You can save either way.'
          }
        />
      )}

      <div className="rtm-amv-species-tabs">
        <Tabs
          selectedIndex={selectedSpeciesIndex}
          onChange={({ selectedIndex }) => setSelectedSpeciesIndex(selectedIndex)}
        >
          <TabList aria-label="Species" size="sm">
            {speciesColumns.map((column, index) => {
              const hasWarning = speciesRows[index].some((row) => row.hasWarning)
              return (
                <Tab key={column.key}>
                  <span className="rtm-amv-species-tab__label">
                    {column.label}
                    {hasWarning ? (
                      <WarningAltFilled
                        className="rtm-amv-species-tab__status rtm-amv-species-tab__status--warning"
                        size={12}
                        aria-hidden="true"
                      />
                    ) : (
                      <CheckmarkFilled
                        className="rtm-amv-species-tab__status rtm-amv-species-tab__status--complete"
                        size={12}
                        aria-hidden="true"
                      />
                    )}
                  </span>
                </Tab>
              )
            })}
          </TabList>
          <TabPanels>
            {speciesColumns.map((column, index) => (
              <TabPanel key={column.key} className="rtm-amv-species-tab-panel">
                <SpeciesReviewTable
                  column={column}
                  currentMonthLabel={currentMonthLabel}
                  nextMonthLabel={nextMonthLabel}
                  rows={speciesRows[index]}
                />
              </TabPanel>
            ))}
          </TabPanels>
        </Tabs>
      </div>

      <InlineNotification
        className="rtm-amv-review-notification rtm-amv-review-notification--fixed"
        kind="info"
        lowContrast
        hideCloseButton
        title="Fixed values are not shown here"
        subtitle="Grades Z, BLANK and 1 to 6 are always $1.00 per cubic metre. They are saved automatically and appear on the permit invoice."
      />

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
    </section>
  )
}

const RtmEmsLogAmvUploadPage = () => {
  const { canPerform } = useAuth()
  const canManage = canPerform('/lexisAgentAdmin')
  const validationRequestRef = useRef(0)
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const [effectiveMonth] = useState(() => shiftEffectiveMonth(currentEffectiveMonth(), 1))
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
  const previousEffectiveMonth = shiftEffectiveMonth(effectiveMonth, -1)

  useEffect(() => {
    const previousTitle = document.title
    document.title = 'Average market values | NR LEXIS'

    return () => {
      document.title = previousTitle
    }
  }, [])

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
      const response = await previewRtmEmsLogAmvUpload(nextFile, effectiveMonth)

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
        setUploadStep('review')
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
        effectiveMonth,
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

  const isUploadDisabled =
    isUploading ||
    !canManage ||
    !selectedUploadFile ||
    selectedUploadFile.size <= 0 ||
    !pendingUploadValidation ||
    pendingUploadValidation.fileName !== selectedUploadFile.name ||
    pendingUploadValidation.fileSize !== selectedUploadFile.size ||
    previewResult?.status !== 'accepted'

  const uploadDropZoneClassName = [
    'admin-upload-drop-zone',
    isDraggingUpload ? 'is-dragging' : '',
    !canManage ? 'is-disabled' : '',
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <Grid fullWidth className="default-grid admin-upload-fspts-page rtm-amv-upload-page">
      <Column sm={4} md={8} lg={16} className="admin-upload-fspts-header rtm-amv-upload-header">
        <PageHeader title="Average market values" subtitle={RTM_UPLOAD_ONLY_DESCRIPTION} />

        <div className="rtm-amv-month-summary" aria-label="Average market value month details">
          <Select
            id="rtm-amv-effective-month"
            className="rtm-amv-month-select"
            labelText="Month"
            value={effectiveMonth}
            disabled
          >
            <SelectItem
              value={effectiveMonth}
              text={`${formatUploadMonth(effectiveMonth) ?? effectiveMonth}, next month`}
            />
          </Select>
          <div className="rtm-amv-month-summary__item">
            <span>Values take effect</span>
            <strong>{formatEffectiveDateRange(effectiveMonth)}</strong>
          </div>
          <div className="rtm-amv-month-summary__item">
            <span>Compared against</span>
            <strong>{formatUploadMonth(previousEffectiveMonth)}</strong>
          </div>
        </div>
      </Column>

      <Column sm={4} md={8} lg={16} className="admin-upload-fspts-content rtm-amv-values-content">
        <div className="admin-upload-section-heading rtm-amv-values-heading">
          <h2 id="rtm-values-title">Values</h2>
          <p>{RTM_VALUES_DESCRIPTION}</p>
        </div>

        {uploadStep === 'upload' ? (
          <>
            <section className="rtm-amv-upload-card" aria-labelledby="rtm-upload-title">
              <div className="admin-upload-field-header">
                <div>
                  <span id="rtm-upload-title" className="admin-upload-field-label">
                    Upload spreadsheet
                  </span>
                  <p className="admin-upload-field-helper">{RTM_UPLOAD_FIELD_HELPER}</p>
                </div>
                <a
                  className="rtm-amv-template-link"
                  href={RTM_TEMPLATE_DOWNLOAD_PATH}
                  download={RTM_TEMPLATE_DOWNLOAD_NAME}
                  aria-label="Download template"
                >
                  <span>Download template</span>
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
                  <p>Drag and drop your file here or click to upload</p>
                </div>
              </div>

              {selectedUploadFile &&
                (isPreviewing ? (
                  <div className="rtm-amv-upload-loading" aria-busy="true">
                    <span className="rtm-amv-upload-loading__name">{selectedUploadFile.name}</span>
                    <InlineLoading
                      className="rtm-amv-upload-loading__spinner"
                      description={`Validating ${selectedUploadFile.name}`}
                    />
                  </div>
                ) : (
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
                ))}

              {!isPreviewing && (
                <UploadValidationStatus
                  uploadError={uploadError}
                  previewResult={previewResult}
                  selectedUploadFile={selectedUploadFile}
                />
              )}
            </section>
          </>
        ) : (
          <>
            <section className="rtm-amv-upload-card" aria-labelledby="rtm-uploaded-title">
              <div className="admin-upload-field-header">
                <div>
                  <span id="rtm-uploaded-title" className="admin-upload-field-label">
                    Upload spreadsheet
                  </span>
                  <p className="admin-upload-field-helper">{RTM_UPLOAD_FIELD_HELPER}</p>
                </div>
              </div>

              {selectedUploadFile && (
                <div
                  className="rtm-amv-uploaded-file"
                  aria-label="Uploaded average monthly values file"
                >
                  <span className="rtm-amv-uploaded-file__name">{selectedUploadFile.name}</span>
                  <button
                    type="button"
                    className="rtm-amv-uploaded-file__remove"
                    aria-label="Clear selected file"
                    disabled={isUploading}
                    onClick={clearUploadState}
                  >
                    <Close size={12} />
                  </button>
                </div>
              )}
            </section>

            {previewResult && (
              <ReviewUploadContent previewResult={previewResult} uploadResult={uploadResult} />
            )}

            <div className="admin-upload-fspts-button-row rtm-amv-upload-review-actions">
              <Button
                kind="primary"
                size="md"
                className="admin-upload-fspts-action-button"
                renderIcon={Save}
                onClick={() => {
                  void submitUpload()
                }}
                disabled={isUploadDisabled}
              >
                {isUploading ? 'Saving values' : 'Save values'}
              </Button>
              <Button kind="tertiary" size="md" disabled={isUploading} onClick={clearUploadState}>
                Cancel
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

export default RtmEmsLogAmvUploadPage
