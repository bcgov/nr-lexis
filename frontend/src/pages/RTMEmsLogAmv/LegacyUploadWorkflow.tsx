/** Spreadsheet-only AMV upload and review workflow. */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
  type RefObject,
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
  ActionableNotification,
  Button,
  Column,
  Grid,
  InlineLoading,
  InlineNotification,
  Loading,
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
  searchLatestRtmEmsLogAmv,
  searchRtmEmsLogAmv,
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

type SavedUploadState = {
  valueCount: number
}

type RtmUploadStep = 'upload' | 'review'

type UploadIntent = 'initial' | 'replace'

type DiscardConfirmation = 'cancel' | 'file' | 'saved-changes'

type SavedNotification = 'discarded' | 'saved'

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

const formatEffectiveStartDate = (dateValue: string): string => {
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
  return `${month} 1, ${year}`
}

const reviewValuesMatch = (
  left: Record<string, string>,
  right: Record<string, string>,
): boolean => {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)])
  return Array.from(keys).every((key) => left[key] === right[key])
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
const EFFECTIVE_MONTH_REFRESH_INTERVAL_MS = 1_000

const RTM_UPLOAD_ONLY_DESCRIPTION =
  'Set the domestic log values used to calculate export fees for coastal permits.'
const RTM_VALUES_DESCRIPTION =
  'Your spreadsheet provides a value for each species and grade. You will be able to check them before you save.'
const RTM_UPLOAD_FIELD_HELPER = 'Accepted format: .xlsx, up to 20 MB.'
const RTM_UPLOAD_SYSTEM_ERROR_TITLE = 'Upload could not be completed'
const RTM_UPLOAD_SYSTEM_ERROR_MESSAGE =
  'Something went wrong on our end. Please try again. If the problem persists, contact...'
const RTM_VALUES_LOAD_ERROR_TITLE = 'Average market values could not be loaded'
const RTM_VALUES_LOAD_ERROR_MESSAGE =
  'Something went wrong on our end. Refresh the page to try again. If the problem persists, contact...'

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
  RTM_REVIEW_SPECIES_COLUMNS.forEach((column) => {
    buildSpeciesReviewRows(rows, column).forEach((row) => {
      const newValue = firstReviewValue(row.newValues)
      values[row.key] = newValue === null ? '' : formatMoney(newValue)
    })
  })
  return values
}

const rowEffectiveDate = (row: RtmEmsLogAmvRow): string | null =>
  normalizeIsoDate(row.updateDate) ?? normalizeIsoDate(row.retrievalDate)

const rowValue = (row: RtmEmsLogAmvRow): number | null => row.newValue ?? row.currentValue

const buildSavedReviewPreview = (
  effectiveMonth: string,
  savedRows: RtmEmsLogAmvRow[],
  comparisonRows: RtmEmsLogAmvRow[],
): RtmEmsLogAmvUploadPreview => {
  const supportedSpecies = new Set(RTM_REVIEW_SPECIES_COLUMNS.map((column) => column.key))
  const supportedGrades = new Set(RTM_REVIEW_GRADE_ORDER)
  const comparisonDate =
    comparisonRows
      .map(rowEffectiveDate)
      .filter((date): date is string => date !== null)
      .sort()
      .at(-1) ?? shiftEffectiveMonth(effectiveMonth, -1)
  const valuesByKey = (rows: RtmEmsLogAmvRow[]) => {
    const values = new Map<string, { grade: string; species: string; value: number | null }>()

    rows.forEach((row) => {
      const species = resolveSpeciesColumnKey(row.species)
      const grade = normalizeGrade(row.grade)
      if (!supportedSpecies.has(species) || !supportedGrades.has(grade)) {
        return
      }

      const key = `${species}-${grade}`
      if (!values.has(key)) {
        values.set(key, { grade, species, value: rowValue(row) })
      }
    })

    return values
  }
  const savedValues = valuesByKey(savedRows)
  const comparisonValues = valuesByKey(comparisonRows)
  const keys = new Set([...comparisonValues.keys(), ...savedValues.keys()])
  const rows = Array.from(keys).map((key) => {
    const savedValue = savedValues.get(key)
    const comparisonValue = comparisonValues.get(key)
    const dimensions = savedValue ?? comparisonValue

    return {
      species: dimensions?.species ?? null,
      grade: dimensions?.grade ?? null,
      growthIndicator: 'O',
      retrievalDate: comparisonDate,
      updateDate: effectiveMonth,
      currentValue: comparisonValue?.value ?? null,
      newValue: savedValue?.value ?? null,
      returnCode: '0',
    }
  })

  return {
    status: 'accepted',
    message: 'Saved average market values loaded.',
    rowCount: savedRows.length,
    retrievalDate: comparisonDate,
    updateDate: effectiveMonth,
    errors: [],
    warnings: [],
    rows,
  }
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
    return 'No value has ever been set for this grade. Confirm this species and grade combination is valid.'
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
  removeButtonRef,
}: {
  fileName: string
  issues: string[]
  onClear: () => void
  removeButtonRef?: RefObject<HTMLButtonElement | null>
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
            ref={removeButtonRef}
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
            <th scope="col">{`Value in effect (${currentMonthLabel})`}</th>
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
  const speciesColumns = RTM_REVIEW_SPECIES_COLUMNS
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
                <Tab
                  key={column.key}
                  aria-label={`${column.label}, ${hasWarning ? 'warning' : 'no warnings'}`}
                >
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
  const saveRequestRef = useRef(0)
  const savedValuesRequestRef = useRef(0)
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  const removeFileButtonRef = useRef<HTMLButtonElement>(null)
  const replacementPreviewRef = useRef<RtmEmsLogAmvUploadPreview | null>(null)
  const replacementReviewValuesRef = useRef<Record<string, string> | null>(null)
  const [effectiveMonth, setEffectiveMonth] = useState(() =>
    shiftEffectiveMonth(currentEffectiveMonth(), 1),
  )
  const effectiveMonthRef = useRef(effectiveMonth)
  const [uploadStep, setUploadStep] = useState<RtmUploadStep>('upload')
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [isCheckingSavedValues, setIsCheckingSavedValues] = useState(true)
  const [savedValuesLoadError, setSavedValuesLoadError] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [uploadSystemError, setUploadSystemError] = useState(false)
  const [notification, setNotification] = useState('')
  const [notificationTitle, setNotificationTitle] = useState('Average monthly values')
  const [notificationKind, setNotificationKind] = useState<
    'success' | 'error' | 'warning' | 'info'
  >('info')
  const [previewResult, setPreviewResult] = useState<RtmEmsLogAmvUploadPreview | null>(null)
  const [savedPreviewResult, setSavedPreviewResult] = useState<RtmEmsLogAmvUploadPreview | null>(
    null,
  )
  const [reviewValues, setReviewValues] = useState<Record<string, string>>({})
  const [savedReviewValues, setSavedReviewValues] = useState<Record<string, string> | null>(null)
  const [savedUploadState, setSavedUploadState] = useState<SavedUploadState | null>(null)
  const [savedNotification, setSavedNotification] = useState<SavedNotification | null>(null)
  const [selectedUploadFile, setSelectedUploadFile] = useState<File | null>(null)
  const [pendingUploadValidation, setPendingUploadValidation] =
    useState<PendingUploadValidation | null>(null)
  const [uploadResult, setUploadResult] = useState<RtmEmsLogAmvUploadResult | null>(null)
  const [uploadInputKey, setUploadInputKey] = useState(0)
  const [isDraggingUpload, setIsDraggingUpload] = useState(false)
  const [replacementUploadOpen, setReplacementUploadOpen] = useState(false)
  const [discardConfirmation, setDiscardConfirmation] = useState<DiscardConfirmation | null>(null)

  useEffect(() => {
    const previousTitle = document.title
    document.title = 'Average market values | NR LEXIS'

    return () => {
      document.title = previousTitle
    }
  }, [])

  const validateUploadFile = async (
    nextFile: File | null,
    uploadIntent: UploadIntent = 'initial',
  ) => {
    const isReplacingSavedValues =
      uploadIntent === 'replace' &&
      replacementUploadOpen &&
      savedReviewValues !== null &&
      savedUploadState !== null &&
      previewResult !== null
    savedValuesRequestRef.current += 1
    const requestId = validationRequestRef.current + 1
    validationRequestRef.current = requestId

    setSelectedUploadFile(nextFile)
    setUploadError('')
    setUploadSystemError(false)
    setUploadResult(null)
    setPendingUploadValidation(null)
    setNotification('')

    if (!isReplacingSavedValues) {
      setUploadStep('upload')
      setPreviewResult(null)
      setSavedPreviewResult(null)
      setReviewValues({})
      setSavedReviewValues(null)
      setSavedUploadState(null)
      setSavedNotification(null)
    }

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
      if (validatedResponse.status === 'accepted') {
        setPreviewResult(validatedResponse)
        setReviewValues(buildInitialReviewValues(validatedResponse.rows))
        setPendingUploadValidation({
          fileName: nextFile.name,
          fileSize: nextFile.size,
        })
        setSavedNotification(null)
        setUploadStep('review')
      } else if (validatedResponse.status === 'validation_failed') {
        setPendingUploadValidation(null)
        if (isReplacingSavedValues) {
          setUploadError(
            createResultMessage(
              validatedResponse.status,
              validatedResponse.message,
              validatedResponse.errors,
            ),
          )
        } else {
          setPreviewResult(validatedResponse)
        }
      } else {
        setSelectedUploadFile(null)
        if (!isReplacingSavedValues) {
          setPreviewResult(null)
        }
        setUploadSystemError(true)
        setUploadInputKey((current) => current + 1)
      }
    } catch (error) {
      if (validationRequestRef.current !== requestId) {
        return
      }

      console.error(error)
      setSelectedUploadFile(null)
      setUploadError('')
      setUploadSystemError(true)
      if (!isReplacingSavedValues) {
        setPreviewResult(null)
      }
      setPendingUploadValidation(null)
      setUploadInputKey((current) => current + 1)
    } finally {
      if (validationRequestRef.current === requestId) {
        setIsPreviewing(false)
      }
    }
  }

  const updateUploadFile = (event: ChangeEvent<HTMLInputElement>) => {
    void validateUploadFile(event.currentTarget.files?.[0] ?? null)
  }

  const updateReplacementFile = (event: ChangeEvent<HTMLInputElement>) => {
    void validateUploadFile(event.currentTarget.files?.[0] ?? null, 'replace')
  }

  const onDropUploadFile = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDraggingUpload(false)
    if (!canManage) {
      return
    }
    void validateUploadFile(event.dataTransfer.files?.[0] ?? null)
  }

  const onDropReplacementFile = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDraggingUpload(false)
    if (!canManage || !replacementUploadOpen) {
      return
    }
    void validateUploadFile(event.dataTransfer.files?.[0] ?? null, 'replace')
  }

  const openUploadFileDialog = () => {
    if (!canManage || isPreviewing || isUploading) {
      return
    }

    uploadInputRef.current?.click()
  }

  const startReplacementUpload = () => {
    if (!canManage || isPreviewing || isUploading || !savedUploadState) {
      return
    }

    validationRequestRef.current += 1
    replacementPreviewRef.current = previewResult
    replacementReviewValuesRef.current = { ...reviewValues }
    setReplacementUploadOpen(true)
    setSelectedUploadFile(null)
    setPendingUploadValidation(null)
    setUploadError('')
    setUploadSystemError(false)
    setUploadResult(null)
    setIsDraggingUpload(false)
    setUploadInputKey((current) => current + 1)
  }

  const onUploadDropZoneKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return
    }

    event.preventDefault()
    openUploadFileDialog()
  }

  const clearUploadState = useCallback(() => {
    validationRequestRef.current += 1
    saveRequestRef.current += 1
    savedValuesRequestRef.current += 1
    setUploadStep('upload')
    setSelectedUploadFile(null)
    setUploadError('')
    setUploadSystemError(false)
    setPreviewResult(null)
    setSavedPreviewResult(null)
    setReviewValues({})
    setSavedReviewValues(null)
    setSavedUploadState(null)
    setSavedNotification(null)
    setUploadResult(null)
    setPendingUploadValidation(null)
    setNotification('')
    setUploadInputKey((current) => current + 1)
    setIsDraggingUpload(false)
    setReplacementUploadOpen(false)
    setIsPreviewing(false)
    setIsUploading(false)
    setDiscardConfirmation(null)
    replacementPreviewRef.current = null
    replacementReviewValuesRef.current = null
  }, [])

  const clearReplacementFile = () => {
    validationRequestRef.current += 1
    setSelectedUploadFile(null)
    setPendingUploadValidation(null)
    setUploadError('')
    setUploadSystemError(false)
    setUploadResult(null)
    setIsDraggingUpload(false)
    setIsPreviewing(false)
    setUploadInputKey((current) => current + 1)
    if (replacementReviewValuesRef.current) {
      setReviewValues({ ...replacementReviewValuesRef.current })
    }
    if (replacementPreviewRef.current) {
      setPreviewResult(replacementPreviewRef.current)
    }
  }

  const closeReplacementUpload = () => {
    clearReplacementFile()
    setReplacementUploadOpen(false)
    replacementPreviewRef.current = null
    replacementReviewValuesRef.current = null
  }

  useEffect(() => {
    const requestId = savedValuesRequestRef.current + 1
    savedValuesRequestRef.current = requestId

    const loadSavedValues = async () => {
      try {
        const savedRows = await searchRtmEmsLogAmv({
          species: '',
          growthIndicator: '',
          retrievalDate: effectiveMonth,
          updateDate: effectiveMonth,
        })
        if (savedValuesRequestRef.current !== requestId) {
          return
        }
        if (savedRows.length === 0) {
          setIsCheckingSavedValues(false)
          return
        }

        const comparisonRows = await searchLatestRtmEmsLogAmv(effectiveMonth)
        if (savedValuesRequestRef.current !== requestId) {
          return
        }

        const savedPreview = buildSavedReviewPreview(effectiveMonth, savedRows, comparisonRows)
        const savedValues = buildInitialReviewValues(savedPreview.rows)
        setPreviewResult(savedPreview)
        setSavedPreviewResult(savedPreview)
        setReviewValues(savedValues)
        setSavedReviewValues(savedValues)
        setSavedUploadState({ valueCount: savedRows.length })
        setUploadStep('review')
        setIsCheckingSavedValues(false)
      } catch (error) {
        if (savedValuesRequestRef.current !== requestId) {
          return
        }

        console.error(error)
        setSavedValuesLoadError(true)
        setIsCheckingSavedValues(false)
      }
    }

    void loadSavedValues()

    return () => {
      if (savedValuesRequestRef.current === requestId) {
        savedValuesRequestRef.current += 1
      }
    }
  }, [effectiveMonth])

  useEffect(() => {
    const refreshEffectiveMonth = () => {
      const nextEffectiveMonth = shiftEffectiveMonth(currentEffectiveMonth(), 1)
      if (nextEffectiveMonth === effectiveMonthRef.current) {
        return
      }

      effectiveMonthRef.current = nextEffectiveMonth
      setIsCheckingSavedValues(true)
      setSavedValuesLoadError(false)
      setEffectiveMonth(nextEffectiveMonth)
      clearUploadState()
    }

    const refreshInterval = window.setInterval(
      refreshEffectiveMonth,
      EFFECTIVE_MONTH_REFRESH_INTERVAL_MS,
    )
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') {
        refreshEffectiveMonth()
      }
    }

    window.addEventListener('focus', refreshEffectiveMonth)
    document.addEventListener('visibilitychange', refreshWhenVisible)

    return () => {
      window.clearInterval(refreshInterval)
      window.removeEventListener('focus', refreshEffectiveMonth)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [clearUploadState])

  const submitUpload = async () => {
    if (!canManage) {
      setUploadError('You do not have permission to upload average monthly value rows.')
      return
    }

    const isSavedReview = savedReviewValues !== null
    if (!selectedUploadFile && !isSavedReview) {
      setUploadError('Upload an XLSX file before submitting changes.')
      return
    }

    if (
      !isSavedReview &&
      (!pendingUploadValidation ||
        pendingUploadValidation.fileName !== selectedUploadFile?.name ||
        pendingUploadValidation.fileSize !== selectedUploadFile?.size)
    ) {
      setUploadError('Validate this file before submitting changes.')
      return
    }

    setUploadError('')
    setUploadResult(null)
    setIsUploading(true)
    const requestId = saveRequestRef.current + 1
    saveRequestRef.current = requestId

    try {
      if (!previewResult) {
        setUploadError('Validate this file before submitting changes.')
        return
      }

      const saveRequests = buildReviewedSaveRequests(previewResult, reviewValues)
      const result = await saveRtmEmsLogAmvBatch({ values: saveRequests })
      if (saveRequestRef.current !== requestId) {
        return
      }

      const response: RtmEmsLogAmvUploadResult = {
        status: result.status,
        fileName: selectedUploadFile?.name,
        fileSize: selectedUploadFile?.size,
        message: result.message,
        attemptedRowCount: saveRequests.length,
        uploadedRowCount: result.rows.length,
        errors: result.errors,
        warnings: [],
        rows: result.rows,
      }

      setNotificationKind(
        response.status === 'accepted'
          ? 'success'
          : response.status === 'validation_failed'
            ? 'warning'
            : 'error',
      )
      if (response.status === 'accepted') {
        setSavedReviewValues({ ...reviewValues })
        setSavedPreviewResult(previewResult)
        setSavedUploadState({
          valueCount: saveRequests.length,
        })
        setSavedNotification('saved')
        setReplacementUploadOpen(false)
        replacementPreviewRef.current = null
        replacementReviewValuesRef.current = null
        setSelectedUploadFile(null)
        setPendingUploadValidation(null)
        setUploadInputKey((current) => current + 1)
        setNotification('')
        setUploadResult(null)
      } else {
        setUploadResult(response)
        setNotificationTitle('Average monthly values')
        setNotification(createResultMessage(response.status, response.message, response.errors))
      }
    } catch (error) {
      if (saveRequestRef.current !== requestId) {
        return
      }

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
      if (saveRequestRef.current === requestId) {
        setIsUploading(false)
      }
    }
  }

  const hasReviewErrors = Object.values(reviewValues).some(
    (value) => reviewValueError(value) !== null,
  )
  const hasUnsavedChanges =
    savedReviewValues !== null && !reviewValuesMatch(reviewValues, savedReviewValues)
  const hasValidatedUpload =
    !!selectedUploadFile &&
    selectedUploadFile.size > 0 &&
    !!pendingUploadValidation &&
    pendingUploadValidation.fileName === selectedUploadFile.name &&
    pendingUploadValidation.fileSize === selectedUploadFile.size
  const requestReplacementFileRemoval = () => {
    const replacementFileValues =
      hasValidatedUpload && previewResult?.status === 'accepted'
        ? buildInitialReviewValues(previewResult.rows)
        : replacementReviewValuesRef.current

    if (replacementFileValues && !reviewValuesMatch(reviewValues, replacementFileValues)) {
      setDiscardConfirmation('file')
      return
    }

    clearReplacementFile()
  }
  const savedActionsUnavailable =
    savedReviewValues !== null && !hasUnsavedChanges && !hasValidatedUpload
  const hasSaveSource = savedReviewValues !== null || hasValidatedUpload

  const isUploadDisabled =
    isUploading ||
    isPreviewing ||
    hasReviewErrors ||
    !canManage ||
    !hasSaveSource ||
    previewResult?.status !== 'accepted'

  const isFileSelectionDisabled = !canManage || isUploading || isPreviewing

  const uploadDropZoneClassName = [
    'admin-upload-drop-zone',
    isDraggingUpload ? 'is-dragging' : '',
    isFileSelectionDisabled ? 'is-disabled' : '',
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

  const renderUploadCard = (isReplacement: boolean) => {
    const titleId = isReplacement ? 'rtm-replacement-upload-title' : 'rtm-upload-title'
    const inputId = isReplacement ? 'rtm-replacement-file' : 'rtm-upload-file'
    const inputLabel = isReplacement
      ? 'Replacement average monthly values spreadsheet'
      : 'Average monthly values upload spreadsheet'
    const dropZoneLabel = isReplacement
      ? 'Choose a replacement average monthly values spreadsheet'
      : 'Choose an average monthly values upload spreadsheet'
    const showUploadedReplacement = isReplacement && hasValidatedUpload

    return (
      <section
        className={`rtm-amv-upload-card${isReplacement ? ' rtm-amv-replacement-upload-card' : ''}`}
        aria-labelledby={titleId}
      >
        <div className="admin-upload-field-header">
          <div>
            <span id={titleId} className="admin-upload-field-label">
              Upload spreadsheet
            </span>
            <p className="admin-upload-field-helper">{RTM_UPLOAD_FIELD_HELPER}</p>
          </div>
          {!showUploadedReplacement && (
            <a
              className="rtm-amv-template-link"
              href={RTM_TEMPLATE_DOWNLOAD_PATH}
              download={RTM_TEMPLATE_DOWNLOAD_NAME}
              aria-label="Download template"
            >
              <span>Download template</span>
              <Download size={16} aria-hidden="true" />
            </a>
          )}
        </div>

        <input
          ref={uploadInputRef}
          key={uploadInputKey}
          id={inputId}
          className="admin-upload-native-input"
          type="file"
          aria-label={inputLabel}
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          disabled={isFileSelectionDisabled}
          onChange={isReplacement ? updateReplacementFile : updateUploadFile}
        />

        {!showUploadedReplacement && (
          <div
            className={uploadDropZoneClassName}
            role="button"
            tabIndex={isFileSelectionDisabled ? -1 : 0}
            aria-disabled={isFileSelectionDisabled}
            aria-label={dropZoneLabel}
            onClick={openUploadFileDialog}
            onKeyDown={onUploadDropZoneKeyDown}
            onDragEnter={(event) => {
              event.preventDefault()
              if (!isFileSelectionDisabled) {
                setIsDraggingUpload(true)
              }
            }}
            onDragOver={(event) => {
              event.preventDefault()
              if (!isFileSelectionDisabled) {
                setIsDraggingUpload(true)
              }
            }}
            onDragLeave={() => setIsDraggingUpload(false)}
            onDrop={isReplacement ? onDropReplacementFile : onDropUploadFile}
          >
            <div className="admin-upload-drop-zone__copy">
              <p>Drag and drop your file here or click to upload</p>
            </div>
          </div>
        )}

        {selectedUploadFile &&
          (showUploadedReplacement ? (
            <div
              className="rtm-amv-uploaded-file"
              aria-label="Uploaded replacement average monthly values file"
            >
              <span className="rtm-amv-uploaded-file__name">{selectedUploadFile.name}</span>
              <button
                ref={removeFileButtonRef}
                type="button"
                className="rtm-amv-uploaded-file__remove"
                aria-label="Clear selected file"
                disabled={isUploading}
                onClick={requestReplacementFileRemoval}
              >
                <Close size={12} />
              </button>
            </div>
          ) : isPreviewing ? (
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
              onClear={isReplacement ? requestReplacementFileRemoval : clearUploadState}
              removeButtonRef={isReplacement ? removeFileButtonRef : undefined}
            />
          ) : (
            <div
              className="admin-upload-file-chip"
              aria-label={
                isReplacement
                  ? 'Selected replacement average monthly values file'
                  : 'Selected average monthly values upload file'
              }
            >
              <Document size={16} aria-hidden="true" />
              <span className="admin-upload-file-chip__name">{selectedUploadFile.name}</span>
              <span className="admin-upload-file-chip__size">
                {selectedUploadFile.size.toLocaleString()} bytes
              </span>
              <button
                ref={isReplacement ? removeFileButtonRef : undefined}
                type="button"
                className="admin-upload-file-chip__remove"
                aria-label="Clear selected file"
                onClick={isReplacement ? requestReplacementFileRemoval : clearUploadState}
              >
                <Close size={16} />
              </button>
            </div>
          ))}

        {uploadSystemError && (
          <InlineNotification
            className="rtm-amv-upload-system-error"
            kind="error"
            lowContrast
            hideCloseButton
            title={RTM_UPLOAD_SYSTEM_ERROR_TITLE}
            subtitle={RTM_UPLOAD_SYSTEM_ERROR_MESSAGE}
          />
        )}
      </section>
    )
  }

  if (isCheckingSavedValues) {
    return (
      <div
        className="admin-upload-fspts-page rtm-amv-page-loading"
        role="status"
        aria-live="polite"
      >
        <Loading description="Loading…" withOverlay={false} />
      </div>
    )
  }

  if (savedValuesLoadError) {
    return (
      <Grid
        fullWidth
        className="default-grid admin-upload-fspts-page rtm-amv-upload-page rtm-amv-initial-state"
      >
        <Column sm={4} md={8} lg={16} className="rtm-amv-initial-state__content">
          <InlineNotification
            kind="error"
            lowContrast
            hideCloseButton
            title={RTM_VALUES_LOAD_ERROR_TITLE}
            subtitle={RTM_VALUES_LOAD_ERROR_MESSAGE}
          />
        </Column>
      </Grid>
    )
  }

  return (
    <Grid fullWidth className="default-grid admin-upload-fspts-page rtm-amv-upload-page">
      <Column sm={4} md={8} lg={16} className="admin-upload-fspts-header rtm-amv-upload-header">
        <PageHeader title="Average market values" subtitle={RTM_UPLOAD_ONLY_DESCRIPTION} />

        <div className="rtm-amv-month-summary" aria-label="Average market value month details">
          <div className="rtm-amv-month-summary__item rtm-amv-month-summary__month">
            <span>Month</span>
            <strong>{formatUploadMonth(effectiveMonth) ?? effectiveMonth}</strong>
          </div>
          <div className="rtm-amv-month-summary__item">
            <span>Values take effect</span>
            <strong>{formatEffectiveStartDate(effectiveMonth)}</strong>
          </div>
        </div>
      </Column>

      <Column sm={4} md={8} lg={16} className="admin-upload-fspts-content rtm-amv-values-content">
        {savedUploadState && savedNotification && !replacementUploadOpen && (
          <InlineNotification
            className="rtm-amv-saved-notification"
            kind="success"
            lowContrast
            title={savedNotification === 'discarded' ? 'Changes discarded' : 'Values saved'}
            subtitle={
              savedNotification === 'discarded'
                ? 'Values are back to your last save.'
                : `${savedUploadState.valueCount} ${savedUploadState.valueCount === 1 ? 'value' : 'values'} will take effect on ${formatEffectiveStartDate(effectiveMonth)}.`
            }
            onCloseButtonClick={() => setSavedNotification(null)}
          />
        )}

        <div className="admin-upload-section-heading rtm-amv-values-heading">
          <div className="rtm-amv-values-heading__copy">
            <h2 id="rtm-values-title">Values</h2>
            <p>{RTM_VALUES_DESCRIPTION}</p>
          </div>
          {savedUploadState && !replacementUploadOpen && (
            <Button
              className="rtm-amv-replace-file-button"
              kind="tertiary"
              size="md"
              disabled={!canManage || isUploading || isPreviewing}
              onClick={startReplacementUpload}
            >
              Replace file
            </Button>
          )}
        </div>

        {uploadStep === 'upload' ? (
          renderUploadCard(false)
        ) : (
          <>
            {savedUploadState && replacementUploadOpen && (
              <div className="rtm-amv-replacement-upload">
                {!hasValidatedUpload && (
                  <ActionableNotification
                    className="rtm-amv-replacement-warning"
                    actionButtonLabel="Keep current values"
                    inline
                    kind="warning"
                    lowContrast
                    hideCloseButton
                    role="status"
                    title="Selecting a file will replace the values on screen"
                    subtitle="Any edits you haven't saved will be lost. Your saved values won't change until you save again."
                    onActionButtonClick={closeReplacementUpload}
                  />
                )}
                {renderUploadCard(true)}
              </div>
            )}

            {!savedUploadState && (
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
                      ref={removeFileButtonRef}
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
            )}

            {previewResult && (
              <ReviewUploadContent
                disabled={isUploading || isPreviewing}
                previewResult={previewResult}
                reviewValues={reviewValues}
                uploadResult={uploadResult}
                onValueChange={(key, value) => {
                  setReviewValues((current) => ({ ...current, [key]: value }))
                  setSavedNotification(null)
                  setUploadResult(null)
                }}
              />
            )}

            {savedActionsUnavailable && (
              <p id="rtm-amv-saved-actions-helper" className="rtm-amv-upload-review-helper">
                Edit a value to save again.
              </p>
            )}

            <div className="admin-upload-fspts-button-row rtm-amv-upload-review-actions">
              <Button
                kind="primary"
                size="md"
                className="admin-upload-fspts-action-button"
                renderIcon={Save}
                onClick={() => {
                  if (savedActionsUnavailable) {
                    return
                  }
                  void submitUpload()
                }}
                disabled={isUploadDisabled}
                aria-disabled={savedActionsUnavailable || undefined}
                aria-describedby={
                  savedActionsUnavailable ? 'rtm-amv-saved-actions-helper' : undefined
                }
              >
                {isUploading ? 'Saving values' : 'Save values'}
              </Button>
              <Button
                ref={cancelButtonRef}
                kind="tertiary"
                size="md"
                disabled={isUploading || isPreviewing}
                aria-disabled={savedActionsUnavailable || undefined}
                aria-describedby={
                  savedActionsUnavailable ? 'rtm-amv-saved-actions-helper' : undefined
                }
                onClick={() => {
                  if (savedActionsUnavailable) {
                    return
                  }
                  if (savedReviewValues) {
                    setDiscardConfirmation('saved-changes')
                    return
                  }
                  setDiscardConfirmation('cancel')
                }}
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
          launcherButtonRef={discardConfirmation === 'file' ? removeFileButtonRef : cancelButtonRef}
          title={
            discardConfirmation === 'file'
              ? 'Are you sure you want to remove this file?'
              : 'Discard these values?'
          }
          description={
            discardConfirmation === 'file'
              ? 'The values on screen will be cleared. Nothing has been saved.'
              : discardConfirmation === 'saved-changes'
                ? "The values you changed since your last save will be cleared. Your saved values won't change."
                : 'The file and all values on screen will be cleared. Nothing has been saved.'
          }
          cancelLabel={
            discardConfirmation === 'file'
              ? 'Keep file'
              : discardConfirmation === 'saved-changes'
                ? 'Discard changes'
                : 'Keep editing'
          }
          confirmLabel={
            discardConfirmation === 'file'
              ? 'Remove file'
              : discardConfirmation === 'saved-changes'
                ? 'Save changes'
                : 'Discard values'
          }
          pendingLabel={discardConfirmation === 'saved-changes' ? 'Saving changes' : undefined}
          confirmDisabled={discardConfirmation === 'saved-changes' && isUploadDisabled}
          danger={discardConfirmation !== 'saved-changes'}
          size="xs"
          onCancel={
            discardConfirmation === 'saved-changes'
              ? () => {
                  if (!savedReviewValues) return
                  setReviewValues({ ...savedReviewValues })
                  if (savedPreviewResult) {
                    setPreviewResult(savedPreviewResult)
                  }
                  setSelectedUploadFile(null)
                  setPendingUploadValidation(null)
                  setUploadError('')
                  setUploadSystemError(false)
                  setUploadInputKey((current) => current + 1)
                  setReplacementUploadOpen(false)
                  replacementPreviewRef.current = null
                  replacementReviewValuesRef.current = null
                  setSavedNotification('discarded')
                  setUploadResult(null)
                }
              : undefined
          }
          onConfirm={
            discardConfirmation === 'saved-changes'
              ? submitUpload
              : discardConfirmation === 'file' && replacementUploadOpen
                ? clearReplacementFile
                : clearUploadState
          }
          onClose={() => setDiscardConfirmation(null)}
        />
      )}
    </Grid>
  )
}

export default RtmEmsLogAmvUploadPage
