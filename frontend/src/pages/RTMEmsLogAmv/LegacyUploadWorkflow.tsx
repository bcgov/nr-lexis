/** Spreadsheet-only AMV upload and review workflow. */

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
} from 'react'
import {
  CheckmarkFilled,
  Close,
  Document,
  Download,
  ErrorFilled,
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
import ConfirmationModal from '@/components/ConfirmationModal'
import PageHeader from '@/components/PageHeader'
import { useAuth } from '@/context/auth/useAuth'
import {
  previewRtmEmsLogAmvUpload,
  saveRtmEmsLogAmvBatch,
  type RtmEmsLogAmvRow,
  type RtmEmsLogAmvSaveRequest,
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
const RTM_FIXED_GRADES = ['Z', 'BLANK', '1', '2', '3', '4', '5', '6']
const MAX_AMV_VALUE = 9999.99

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

const buildSpeciesReviewRows = (
  rows: RtmEmsLogAmvRow[],
  column: RtmReviewSpeciesColumn,
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
        newValues: {},
      } satisfies RtmSpeciesReviewRow)

    if (!(growthIndicator in reviewRow.currentValues)) {
      reviewRow.currentValues[growthIndicator] = row.currentValue
    }
    if (!(growthIndicator in reviewRow.newValues)) {
      reviewRow.newValues[growthIndicator] = row.newValue
    }

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

const firstReviewValue = (values: RtmReviewCellValues): number | null => {
  const sortedEntries = Object.entries(values).sort(
    ([leftGrowth], [rightGrowth]) => growthSortIndex(leftGrowth) - growthSortIndex(rightGrowth),
  )
  return sortedEntries.find(([, value]) => value !== null)?.[1] ?? null
}

const buildInitialReviewValues = (rows: RtmEmsLogAmvRow[]) => {
  const values: Record<string, string> = {}
  buildReviewSpeciesColumns(rows).forEach((column) => {
    buildSpeciesReviewRows(rows, column).forEach((row) => {
      const newValue = firstReviewValue(row.newValues)
      values[row.key] = newValue === null ? '' : formatMoney(newValue)
    })
  })
  return values
}

const parseReviewValue = (value: string): number | null | undefined => {
  const normalized = value.trim().replace(/,/g, '')
  if (!normalized) {
    return null
  }
  if (!/^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(normalized)) {
    return undefined
  }
  const parsed = Number(normalized)
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= MAX_AMV_VALUE ? parsed : undefined
}

const reviewValueError = (value: string) =>
  parseReviewValue(value) === undefined
    ? 'Enter a number from 0 to 9999.99 with no more than two decimal places.'
    : null

const reviewValueWarning = (
  row: RtmSpeciesReviewRow,
  value: string,
  comparisonMonthName: string,
) => {
  const currentValue = firstReviewValue(row.currentValues)
  const parsedValue = parseReviewValue(value)
  const hasPositiveNewValue = typeof parsedValue === 'number' && parsedValue > 0

  if (currentValue === null && hasPositiveNewValue) {
    return `${comparisonMonthName} had none. Confirm this species and grade combination is valid.`
  }
  if (currentValue !== null && parsedValue === null) {
    return `${comparisonMonthName} had ${formatMoney(currentValue)}. Enter a value, or 0 for none.`
  }
  return null
}

const buildReviewedSaveRequests = (
  previewResult: RtmEmsLogAmvUploadPreview,
  reviewValues: Record<string, string>,
): RtmEmsLogAmvSaveRequest[] => {
  const retrievalDate = normalizeIsoDate(previewResult.retrievalDate) ?? ''
  const updateDate = normalizeIsoDate(previewResult.updateDate) ?? ''
  const request = (species: string, grade: string, newValue: number): RtmEmsLogAmvSaveRequest => ({
    species,
    grade,
    growthIndicator: 'O',
    retrievalDate,
    updateDate,
    newValue,
    saveMode: 'update',
  })

  const visibleValues = RTM_REVIEW_SPECIES_COLUMNS.flatMap((column) =>
    buildSpeciesReviewRows(previewResult.rows, column).flatMap((row) => {
      const value = parseReviewValue(reviewValues[row.key] ?? '')
      return typeof value === 'number' ? [request(column.key, row.grade, value)] : []
    }),
  )
  const fixedValues = RTM_REVIEW_SPECIES_COLUMNS.flatMap((column) =>
    RTM_FIXED_GRADES.map((grade) => request(column.key, grade, 1)),
  )

  return [...visibleValues, ...fixedValues]
}

const RejectedUploadFile = ({
  fileName,
  issues,
  onClear,
}: {
  fileName: string
  issues: string[]
  onClear: () => void
}) => {
  const hasMultipleIssues = issues.length > 1
  const issueOccurrences = new Map<string, number>()
  const issueItems = issues.map((issue) => {
    const occurrence = (issueOccurrences.get(issue) ?? 0) + 1
    issueOccurrences.set(issue, occurrence)
    return { issue, key: `${issue}-${occurrence}` }
  })
  return (
    <div
      className="rtm-amv-rejected-file"
      role="alert"
      aria-label="Rejected average monthly values upload file"
    >
      <div className="rtm-amv-rejected-file__row">
        <span className="rtm-amv-rejected-file__name">{fileName}</span>
        <span className="rtm-amv-rejected-file__actions">
          <ErrorFilled className="rtm-amv-rejected-file__error-icon" size={12} aria-hidden="true" />
          <button
            type="button"
            className="rtm-amv-rejected-file__remove"
            aria-label="Clear selected file"
            onClick={onClear}
          >
            <Close size={12} aria-hidden="true" />
          </button>
        </span>
      </div>
      {hasMultipleIssues ? (
        <div className="rtm-amv-rejected-file__details">
          <p className="rtm-amv-rejected-file__intro">
            This file can&apos;t be used. Fix these issues in your spreadsheet, then upload it
            again:
          </p>
          <ul className="rtm-amv-rejected-file__issues" aria-label="Upload validation issues">
            {issueItems.map(({ issue, key }) => (
              <li key={key}>{issue}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="rtm-amv-rejected-file__issue">{issues[0]}</p>
      )}
    </div>
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
  comparisonMonthName,
  currentMonthLabel,
  disabled,
  nextMonthLabel,
  onValueChange,
  rows,
  values,
}: {
  column: RtmReviewSpeciesColumn
  comparisonMonthName: string
  currentMonthLabel: string
  disabled: boolean
  nextMonthLabel: string
  onValueChange: (key: string, value: string) => void
  rows: RtmSpeciesReviewRow[]
  values: Record<string, string>
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
          {rows.map((row) => {
            const value = values[row.key] ?? ''
            const error = reviewValueError(value)
            const warning = error ? null : reviewValueWarning(row, value, comparisonMonthName)
            const message = error ?? warning
            const messageId = message ? `rtm-amv-${row.key}-message` : undefined
            return (
              <tr
                key={row.key}
                className={error ? 'has-error' : warning ? 'has-warning' : undefined}
              >
                <th scope="row">{row.grade}</th>
                <td className="rtm-amv-species-table__current-value">
                  {formatReviewCell(row.currentValues) || '—'}
                </td>
                <td>
                  <div className="rtm-amv-species-table__review-value">
                    <div className="rtm-amv-species-table__input-wrap">
                      <input
                        className="rtm-amv-species-table__input"
                        type="text"
                        inputMode="decimal"
                        aria-label={`${column.label} grade ${row.grade} ${nextMonthLabel} value`}
                        aria-describedby={messageId}
                        aria-invalid={error ? true : undefined}
                        disabled={disabled}
                        value={value}
                        onChange={(event) => onValueChange(row.key, event.currentTarget.value)}
                      />
                      {warning && (
                        <WarningAltFilled
                          className="rtm-amv-species-table__input-warning"
                          size={14}
                          aria-hidden="true"
                        />
                      )}
                    </div>
                    {message && (
                      <p
                        id={messageId}
                        className={
                          error
                            ? 'rtm-amv-species-table__message has-error'
                            : 'rtm-amv-species-table__message'
                        }
                      >
                        {message}
                      </p>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

const ReviewUploadContent = ({
  disabled,
  onValueChange,
  previewResult,
  reviewValues,
  uploadResult,
}: {
  disabled: boolean
  onValueChange: (key: string, value: string) => void
  previewResult: RtmEmsLogAmvUploadPreview
  reviewValues: Record<string, string>
  uploadResult: RtmEmsLogAmvUploadResult | null
}) => {
  const [selectedSpeciesIndex, setSelectedSpeciesIndex] = useState(0)
  const speciesColumns = buildReviewSpeciesColumns(previewResult.rows)
  const speciesRows = speciesColumns.map((column) =>
    buildSpeciesReviewRows(previewResult.rows, column),
  )
  const comparisonMonthName =
    formatUploadMonth(previewResult.retrievalDate)?.split(' ')[0] ?? 'The comparison month'
  const initialReviewValues = buildInitialReviewValues(previewResult.rows)
  const hasRowWarningForValues = (row: RtmSpeciesReviewRow, values: Record<string, string>) => {
    const value = values[row.key] ?? ''
    return !reviewValueError(value) && !!reviewValueWarning(row, value, comparisonMonthName)
  }
  const hasRowWarning = (row: RtmSpeciesReviewRow) => hasRowWarningForValues(row, reviewValues)
  const warnedSpecies = speciesColumns.filter(
    (_, index) =>
      speciesRows[index].some(hasRowWarning) ||
      speciesRows[index].some((row) => hasRowWarningForValues(row, initialReviewValues)),
  )
  const warningCellCount = speciesRows.reduce(
    (total, rows) => total + rows.filter(hasRowWarning).length,
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
              const hasWarning = speciesRows[index].some(hasRowWarning)
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
                  comparisonMonthName={comparisonMonthName}
                  currentMonthLabel={currentMonthLabel}
                  disabled={disabled}
                  nextMonthLabel={nextMonthLabel}
                  onValueChange={onValueChange}
                  rows={speciesRows[index]}
                  values={reviewValues}
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
  const [reviewValues, setReviewValues] = useState<Record<string, string>>({})
  const [selectedUploadFile, setSelectedUploadFile] = useState<File | null>(null)
  const [pendingUploadValidation, setPendingUploadValidation] =
    useState<PendingUploadValidation | null>(null)
  const [uploadResult, setUploadResult] = useState<RtmEmsLogAmvUploadResult | null>(null)
  const [uploadInputKey, setUploadInputKey] = useState(0)
  const [isDraggingUpload, setIsDraggingUpload] = useState(false)
  const [discardConfirmation, setDiscardConfirmation] = useState<'cancel' | 'file' | null>(null)
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
    setReviewValues({})
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
        setReviewValues(buildInitialReviewValues(validatedResponse.rows))
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
    setReviewValues({})
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
      if (!previewResult) {
        setUploadError('Validate this file before submitting changes.')
        return
      }

      const saveRequests = buildReviewedSaveRequests(previewResult, reviewValues)
      const result = await saveRtmEmsLogAmvBatch({ values: saveRequests })
      const response: RtmEmsLogAmvUploadResult = {
        status: result.status,
        fileName: selectedUploadFile.name,
        fileSize: selectedUploadFile.size,
        message: result.message,
        attemptedRowCount: saveRequests.length,
        uploadedRowCount: result.rows.length,
        errors: result.errors,
        warnings: [],
        rows: result.rows,
      }

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
      setIsUploading(false)
    }
  }

  const hasReviewErrors = Object.values(reviewValues).some(
    (value) => reviewValueError(value) !== null,
  )

  const isUploadDisabled =
    isUploading ||
    hasReviewErrors ||
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
  const rejectedFileIssues = uploadError
    ? [uploadError]
    : previewResult && previewResult.status !== 'accepted'
      ? previewResult.errors.length > 0
        ? previewResult.errors
        : [previewResult.message]
      : []
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
                ) : rejectedFileIssues.length > 0 ? (
                  <RejectedUploadFile
                    fileName={selectedUploadFile.name}
                    issues={rejectedFileIssues}
                    onClear={clearUploadState}
                  />
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
                    onClick={() => setDiscardConfirmation('file')}
                  >
                    <Close size={12} />
                  </button>
                </div>
              )}
            </section>

            {previewResult && (
              <ReviewUploadContent
                disabled={isUploading}
                previewResult={previewResult}
                reviewValues={reviewValues}
                uploadResult={uploadResult}
                onValueChange={(key, value) => {
                  setReviewValues((current) => ({ ...current, [key]: value }))
                  setUploadResult(null)
                }}
              />
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
              <Button
                kind="tertiary"
                size="md"
                disabled={isUploading}
                onClick={() => setDiscardConfirmation('cancel')}
              >
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

      {discardConfirmation && (
        <ConfirmationModal
          open
          title={
            discardConfirmation === 'file'
              ? 'Are you sure you want to remove this file?'
              : 'Discard these values?'
          }
          description={
            discardConfirmation === 'file'
              ? 'The values on screen will be cleared. Nothing has been saved.'
              : 'The file and all values on screen will be cleared. Nothing has been saved.'
          }
          cancelLabel={discardConfirmation === 'file' ? 'Keep file' : 'Keep editing'}
          cancelKind="tertiary"
          confirmLabel={discardConfirmation === 'file' ? 'Remove file' : 'Discard values'}
          danger
          size="xs"
          onConfirm={clearUploadState}
          onClose={() => setDiscardConfirmation(null)}
        />
      )}
    </Grid>
  )
}

export default RtmEmsLogAmvUploadPage
