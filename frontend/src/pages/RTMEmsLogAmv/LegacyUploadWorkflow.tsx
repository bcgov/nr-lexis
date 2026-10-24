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
  FeatureFlags,
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
import PendingIcon from '@/components/PendingIcon'
import UnsavedChangesGuard from '@/components/UnsavedChangesGuard'
import { useAuth } from '@/context/auth/useAuth'
import {
  getRtmEmsLogAmvLastSaved,
  previewRtmEmsLogAmvUpload,
  saveRtmEmsLogAmvBatch,
  searchRtmEmsLogAmv,
  type RtmEmsLogAmvRow,
  type RtmEmsLogAmvLastSaved,
  type RtmEmsLogAmvSaveRequest,
  type RtmEmsLogAmvUploadPreview,
} from '@/service/rtm-emslogamv-service'
import { validateUploadFileSize } from '@/components/uploads/uploadQueueHelpers'
import { formatBusinessIsoDate } from '@/utils/date'
import { displayValue } from '@/utils/display-value'

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

type FocusTarget = 'replaceFileButton' | 'replacementDropZone' | 'uploadDropZone'

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

const formatMoney = (value: number | null) => {
  if (value === null || Number.isNaN(value)) {
    return ''
  }

  return value.toLocaleString('en-CA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  })
}

const createResultMessage = (message: string, errors: string[]): string => {
  return [...new Set([message, ...errors].filter(Boolean))].join(' ')
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

const formatLastSavedTimestamp = (dateValue: string): string => {
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(dateValue)
  if (!match) {
    return dateValue
  }

  const date = new Date(
    Date.UTC(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      Number(match[4]),
      Number(match[5]),
    ),
  )
  const formattedDate = new Intl.DateTimeFormat('en-CA', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
    year: 'numeric',
  }).format(date)
  const formattedTime = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    hour12: true,
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(date)
  return `${formattedDate}, ${formattedTime}`
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
    message: "This file couldn't be used.",
    errors: [...previewResult.errors, 'Update date must be on or after the retrieval date.'],
  }
}

const RTM_UPLOAD_ACCEPT = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
const RTM_TEMPLATE_DOWNLOAD_PATH = '/templates/rtm-ems-log-amv-template.xlsx'
const RTM_TEMPLATE_DOWNLOAD_NAME = 'rtm-ems-log-amv-template.xlsx'
const EFFECTIVE_MONTH_REFRESH_INTERVAL_MS = 1_000
const MAX_REJECTED_UPLOAD_ISSUES = 10

const RTM_UPLOAD_ONLY_DESCRIPTION =
  'Set the domestic log values used to calculate export fees for coastal permits.'
const RTM_VALUES_DESCRIPTION =
  'Your spreadsheet provides a value for each species and grade. You will be able to check them before you save.'
const RTM_UPLOAD_FIELD_HELPER = 'Accepted format: .xlsx, up to 20 MB.'
const RTM_UPLOAD_SYSTEM_ERROR_TITLE = 'Upload could not be completed'
const RTM_UPLOAD_SYSTEM_ERROR_MESSAGE =
  'Something went wrong on our end. Please try again. If the problem persists, contact support.'
const RTM_VALUES_LOAD_ERROR_TITLE = 'Average market values could not be loaded'
const RTM_VALUES_SAVE_ERROR_TITLE = 'Average market values could not be saved'
const RTM_VALUES_LOAD_ERROR_MESSAGE =
  'Something went wrong on our end. Refresh the page to try again.'

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

const REVIEW_GRADES = new Set(RTM_REVIEW_GRADE_ORDER)

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
      !REVIEW_GRADES.has(grade)
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

const rowValue = (row: RtmEmsLogAmvRow): number | null => row.newValue ?? row.currentValue

const buildSavedReviewPreview = (
  effectiveMonth: string,
  savedRows: RtmEmsLogAmvRow[],
  comparisonRows: RtmEmsLogAmvRow[],
): RtmEmsLogAmvUploadPreview => {
  const supportedSpecies = new Set(RTM_REVIEW_SPECIES_COLUMNS.map((column) => column.key))
  const supportedGrades = new Set(RTM_REVIEW_GRADE_ORDER)
  const comparisonDate = shiftEffectiveMonth(effectiveMonth, -1)
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
  const enteredValue = value.trim()
  if (!enteredValue) {
    return null
  }
  if (!/^(?:(?:\d{1,4}|[1-9],\d{3})(?:\.\d{1,2})?|\.\d{1,2})$/.test(enteredValue)) {
    return undefined
  }
  const normalized = enteredValue.replace(/,/g, '')
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

// The species and grade cells on screen that hold a value, blank cells excluded.
const enteredReviewValues = (
  previewResult: RtmEmsLogAmvUploadPreview,
  reviewValues: Record<string, string>,
) =>
  RTM_REVIEW_SPECIES_COLUMNS.flatMap((column) =>
    buildSpeciesReviewRows(previewResult.rows, column).flatMap((row) => {
      const value = parseReviewValue(reviewValues[row.key] ?? '')
      return typeof value === 'number'
        ? [{ key: row.key, species: column.key, grade: row.grade, value }]
        : []
    }),
  )

// With a saved baseline, only the cells that differ from it are sent.
const buildReviewedSaveRequests = (
  previewResult: RtmEmsLogAmvUploadPreview,
  reviewValues: Record<string, string>,
  savedReviewValues: Record<string, string> | null,
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

  const visibleValues = enteredReviewValues(previewResult, reviewValues)
    .filter(
      ({ key, value }) =>
        !savedReviewValues || value !== parseReviewValue(savedReviewValues[key] ?? ''),
    )
    .map(({ species, grade, value }) => request(species, grade, value))
  const fixedValues = RTM_REVIEW_SPECIES_COLUMNS.flatMap((column) =>
    RTM_FIXED_GRADES.map((grade) => request(column.key, grade, 1)),
  )

  return [...visibleValues, ...fixedValues]
}

const savedValuesMessage = (valueCount: number, effectiveStartDate: string) =>
  `${valueCount === 1 ? '1 value will' : `${valueCount} values will`} take effect on ${effectiveStartDate}.`

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
  const uniqueIssues = [...new Set(issues)]
  const hasMultipleIssues = uniqueIssues.length > 1
  const visibleIssues = uniqueIssues.slice(0, MAX_REJECTED_UPLOAD_ISSUES)
  const hiddenIssueCount = uniqueIssues.length - visibleIssues.length
  return (
    <div
      className="rtm-amv-rejected-file"
      role="alert"
      aria-label="Rejected average market values file"
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
            This file couldn&apos;t be used — {uniqueIssues.length} problems found
          </p>
          <ul className="rtm-amv-rejected-file__issues" aria-label="Upload validation issues">
            {visibleIssues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
            {hiddenIssueCount > 0 && <li>and {hiddenIssueCount} more</li>}
          </ul>
        </div>
      ) : (
        <p className="rtm-amv-rejected-file__issue">{uniqueIssues[0]}</p>
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
            <th scope="col">{`${currentMonthLabel} value`}</th>
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
                  {formatReviewCell(row.currentValues) || displayValue('')}
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
}: {
  disabled: boolean
  onValueChange: (key: string, value: string) => void
  previewResult: RtmEmsLogAmvUploadPreview
  reviewValues: Record<string, string>
}) => {
  const [selectedSpeciesIndex, setSelectedSpeciesIndex] = useState(0)
  const speciesColumns = RTM_REVIEW_SPECIES_COLUMNS
  const speciesRows = speciesColumns.map((column) =>
    buildSpeciesReviewRows(previewResult.rows, column),
  )
  const comparisonMonthName =
    formatUploadMonth(previewResult.retrievalDate)?.split(' ')[0] ?? 'The comparison month'
  const hasRowWarningForValues = (row: RtmSpeciesReviewRow, values: Record<string, string>) => {
    const value = values[row.key] ?? ''
    return !reviewValueError(value) && !!reviewValueWarning(row, value, comparisonMonthName)
  }
  const hasRowWarning = (row: RtmSpeciesReviewRow) => hasRowWarningForValues(row, reviewValues)
  const warnedSpecies = speciesColumns.filter((_, index) => speciesRows[index].some(hasRowWarning))
  const warningCellCount = speciesRows.reduce(
    (total, rows) => total + rows.filter(hasRowWarning).length,
    0,
  )
  const warningCount = warningCellCount || previewResult.warnings.length
  const warningLabel = warningCellCount > 0 ? 'cell' : 'upload warning'
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
          title={`Check ${warningCount} ${warningLabel}${warningCount === 1 ? '' : 's'} before you save`}
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
  const uploadDropZoneRef = useRef<HTMLDivElement>(null)
  const replacementDropZoneRef = useRef<HTMLDivElement>(null)
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  const removeFileButtonRef = useRef<HTMLButtonElement>(null)
  const replaceFileButtonRef = useRef<HTMLButtonElement>(null)
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
  const [uploadErrors, setUploadErrors] = useState<string[]>([])
  const [uploadSystemError, setUploadSystemError] = useState(false)
  const [notification, setNotification] = useState('')
  const [previewResult, setPreviewResult] = useState<RtmEmsLogAmvUploadPreview | null>(null)
  const [savedPreviewResult, setSavedPreviewResult] = useState<RtmEmsLogAmvUploadPreview | null>(
    null,
  )
  const [reviewValues, setReviewValues] = useState<Record<string, string>>({})
  const [savedReviewValues, setSavedReviewValues] = useState<Record<string, string> | null>(null)
  const [savedUploadState, setSavedUploadState] = useState<SavedUploadState | null>(null)
  const [lastSaved, setLastSaved] = useState<RtmEmsLogAmvLastSaved | null>(null)
  const [savedNotification, setSavedNotification] = useState<SavedNotification | null>(null)
  const [selectedUploadFile, setSelectedUploadFile] = useState<File | null>(null)
  const [pendingUploadValidation, setPendingUploadValidation] =
    useState<PendingUploadValidation | null>(null)
  const [uploadInputKey, setUploadInputKey] = useState(0)
  const [isDraggingUpload, setIsDraggingUpload] = useState(false)
  const [replacementUploadOpen, setReplacementUploadOpen] = useState(false)
  const [discardConfirmation, setDiscardConfirmation] = useState<DiscardConfirmation | null>(null)
  const [focusRequest, setFocusRequest] = useState<{ target: FocusTarget } | null>(null)
  const [saveFeedbackFocusKey, setSaveFeedbackFocusKey] = useState<number | null>(null)

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
    setUploadErrors([])
    setUploadSystemError(false)
    setPendingUploadValidation(null)
    setNotification('')

    if (!isReplacingSavedValues) {
      setUploadStep('upload')
      setPreviewResult(null)
      setSavedPreviewResult(null)
      setReviewValues({})
      setSavedReviewValues(null)
      setSavedUploadState(null)
      setLastSaved(null)
      setSavedNotification(null)
    }

    if (!nextFile) {
      return
    }

    const sizeError = validateUploadFileSize(nextFile)
    if (sizeError) {
      setUploadErrors([sizeError])
      return
    }

    if (!isAcceptedUploadFile(nextFile)) {
      setUploadErrors(['Upload an XLSX file before continuing.'])
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
          setUploadErrors(
            validatedResponse.errors.length > 0
              ? validatedResponse.errors
              : [validatedResponse.message],
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
      setUploadErrors([])
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
    setNotification('')
    setSavedNotification(null)
    setReplacementUploadOpen(true)
    setSelectedUploadFile(null)
    setPendingUploadValidation(null)
    setUploadErrors([])
    setUploadSystemError(false)
    setIsDraggingUpload(false)
    setUploadInputKey((current) => current + 1)
    setFocusRequest({ target: 'replacementDropZone' })
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
    setUploadErrors([])
    setUploadSystemError(false)
    setPreviewResult(null)
    setSavedPreviewResult(null)
    setReviewValues({})
    setSavedReviewValues(null)
    setSavedUploadState(null)
    setLastSaved(null)
    setSavedNotification(null)
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
    setUploadErrors([])
    setUploadSystemError(false)
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

  const removeReplacementFile = () => {
    clearReplacementFile()
    setFocusRequest({ target: 'replacementDropZone' })
  }

  const removeInitialUpload = () => {
    clearUploadState()
    setFocusRequest({ target: 'uploadDropZone' })
  }

  const closeReplacementUpload = () => {
    clearReplacementFile()
    setNotification('')
    setReplacementUploadOpen(false)
    replacementPreviewRef.current = null
    replacementReviewValuesRef.current = null
    setFocusRequest({ target: 'replaceFileButton' })
  }

  // The control that triggered these actions unmounts, so focus moves to the control that replaces it.
  useEffect(() => {
    if (!focusRequest) return
    const frame = requestAnimationFrame(() => {
      const targets = {
        replaceFileButton: replaceFileButtonRef,
        replacementDropZone: replacementDropZoneRef,
        uploadDropZone: uploadDropZoneRef,
      }
      targets[focusRequest.target].current?.focus()
    })
    return () => cancelAnimationFrame(frame)
  }, [focusRequest])

  const loadSavedValues = useCallback(
    async (requestId: number) => {
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
          setLastSaved(null)
          setIsCheckingSavedValues(false)
          return
        }

        const comparisonMonth = shiftEffectiveMonth(effectiveMonth, -1)
        const [comparisonRows, savedAudit] = await Promise.all([
          searchRtmEmsLogAmv({
            species: '',
            growthIndicator: '',
            retrievalDate: comparisonMonth,
            updateDate: comparisonMonth,
          }),
          getRtmEmsLogAmvLastSaved(effectiveMonth),
        ])
        if (savedValuesRequestRef.current !== requestId) {
          return
        }

        const savedPreview = buildSavedReviewPreview(effectiveMonth, savedRows, comparisonRows)
        const savedValues = buildInitialReviewValues(savedPreview.rows)
        setPreviewResult(savedPreview)
        setSavedPreviewResult(savedPreview)
        setReviewValues(savedValues)
        setSavedReviewValues(savedValues)
        setSavedUploadState({ valueCount: enteredReviewValues(savedPreview, savedValues).length })
        setLastSaved(savedAudit)
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
    },
    [effectiveMonth],
  )

  useEffect(() => {
    const requestId = savedValuesRequestRef.current + 1
    savedValuesRequestRef.current = requestId

    void loadSavedValues(requestId)

    return () => {
      if (savedValuesRequestRef.current === requestId) {
        savedValuesRequestRef.current += 1
      }
    }
  }, [loadSavedValues])

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

  const hasValidatedUpload =
    !!selectedUploadFile &&
    selectedUploadFile.size > 0 &&
    !!pendingUploadValidation &&
    pendingUploadValidation.fileName === selectedUploadFile.name &&
    pendingUploadValidation.fileSize === selectedUploadFile.size

  const submitUpload = async (focusFeedback = false) => {
    if (!canManage) {
      setUploadErrors(['You do not have permission to upload average market value rows.'])
      return
    }

    const isSavedReview = savedReviewValues !== null
    if (!selectedUploadFile && !isSavedReview) {
      setUploadErrors(['Upload an XLSX file before submitting changes.'])
      return
    }

    if (
      !isSavedReview &&
      (!pendingUploadValidation ||
        pendingUploadValidation.fileName !== selectedUploadFile?.name ||
        pendingUploadValidation.fileSize !== selectedUploadFile?.size)
    ) {
      setUploadErrors(['Validate this file before submitting changes.'])
      return
    }

    setUploadErrors([])
    setIsUploading(true)
    const requestId = saveRequestRef.current + 1
    saveRequestRef.current = requestId

    try {
      if (!previewResult) {
        setUploadErrors(['Validate this file before submitting changes.'])
        return
      }

      const saveRequests = buildReviewedSaveRequests(
        previewResult,
        reviewValues,
        hasValidatedUpload ? null : savedReviewValues,
      )
      const result = await saveRtmEmsLogAmvBatch({ values: saveRequests })
      if (saveRequestRef.current !== requestId) {
        return
      }

      if (result.status === 'accepted') {
        const savedValuesRequestId = savedValuesRequestRef.current + 1
        savedValuesRequestRef.current = savedValuesRequestId
        await loadSavedValues(savedValuesRequestId)
        if (saveRequestRef.current !== requestId) {
          return
        }

        setSaveFeedbackFocusKey(focusFeedback ? requestId : null)
        setSavedNotification('saved')
        setReplacementUploadOpen(false)
        replacementPreviewRef.current = null
        replacementReviewValuesRef.current = null
        setSelectedUploadFile(null)
        setPendingUploadValidation(null)
        setUploadInputKey((current) => current + 1)
        setNotification('')
      } else {
        setSaveFeedbackFocusKey(focusFeedback ? requestId : null)
        setNotification(
          createResultMessage(result.message, result.errors) || RTM_UPLOAD_SYSTEM_ERROR_MESSAGE,
        )
      }
    } catch (error) {
      if (saveRequestRef.current !== requestId) {
        return
      }

      console.error(error)
      setSaveFeedbackFocusKey(focusFeedback ? requestId : null)
      setNotification(RTM_UPLOAD_SYSTEM_ERROR_MESSAGE)
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
  const requestReplacementFileRemoval = () => {
    // An accepted replacement is on screen, so removing it always asks first.
    if (hasValidatedUpload && previewResult?.status === 'accepted') {
      setDiscardConfirmation('file')
      return
    }

    const replacementFileValues = replacementReviewValuesRef.current
    if (replacementFileValues && !reviewValuesMatch(reviewValues, replacementFileValues)) {
      setDiscardConfirmation('file')
      return
    }

    removeReplacementFile()
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
  const rejectedFileIssues =
    uploadErrors.length > 0
      ? uploadErrors
      : previewResult && previewResult.status !== 'accepted'
        ? previewResult.errors.length > 0
          ? previewResult.errors
          : [previewResult.message]
        : []

  const renderUploadCard = (isReplacement: boolean) => {
    const titleId = isReplacement ? 'rtm-replacement-upload-title' : 'rtm-upload-title'
    const inputId = isReplacement ? 'rtm-replacement-file' : 'rtm-upload-file'
    const inputLabel = isReplacement
      ? 'Replacement average market values spreadsheet'
      : 'Average market values spreadsheet'
    const dropZoneLabel = isReplacement
      ? 'Choose a replacement average market values spreadsheet'
      : 'Choose an average market values spreadsheet'
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
          // The drop zone is the keyboard stop; it opens this input.
          tabIndex={-1}
          aria-label={inputLabel}
          aria-required="true"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          disabled={isFileSelectionDisabled}
          onChange={isReplacement ? updateReplacementFile : updateUploadFile}
        />

        {!showUploadedReplacement && (
          <div
            ref={isReplacement ? replacementDropZoneRef : uploadDropZoneRef}
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
              aria-label="Uploaded replacement average market values file"
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
              onClear={isReplacement ? requestReplacementFileRemoval : removeInitialUpload}
              removeButtonRef={isReplacement ? removeFileButtonRef : undefined}
            />
          ) : (
            <div
              className="admin-upload-file-chip"
              aria-label={
                isReplacement
                  ? 'Selected replacement average market values file'
                  : 'Selected average market values file'
              }
            >
              <Document size={16} aria-hidden="true" />
              <span className="admin-upload-file-chip__name">{selectedUploadFile.name}</span>
              <button
                ref={isReplacement ? removeFileButtonRef : undefined}
                type="button"
                className="admin-upload-file-chip__remove"
                aria-label="Clear selected file"
                onClick={isReplacement ? requestReplacementFileRemoval : removeInitialUpload}
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
          {lastSaved?.savedAt && lastSaved.savedBy && (
            <div className="rtm-amv-month-summary__item">
              <span>Last saved</span>
              <strong>{`${formatLastSavedTimestamp(lastSaved.savedAt)} by ${lastSaved.savedBy}`}</strong>
            </div>
          )}
        </div>
      </Column>

      {notification && (
        <Column sm={4} md={8} lg={16}>
          <AppNotification
            kind="error"
            role="status"
            title={RTM_VALUES_SAVE_ERROR_TITLE}
            subtitle={notification}
            focusOnReveal={saveFeedbackFocusKey !== null}
            revealKey={saveFeedbackFocusKey}
            onCloseButtonClick={() => {
              setNotification('')
            }}
          />
        </Column>
      )}

      <Column sm={4} md={8} lg={16} className="admin-upload-fspts-content rtm-amv-values-content">
        {savedUploadState && savedNotification && !replacementUploadOpen && (
          <AppNotification
            kind="success"
            title={savedNotification === 'discarded' ? 'Changes discarded' : 'Values saved'}
            focusOnReveal={saveFeedbackFocusKey !== null}
            revealKey={saveFeedbackFocusKey}
            subtitle={
              savedNotification === 'discarded'
                ? 'Values are back to your last save.'
                : savedValuesMessage(
                    savedUploadState.valueCount,
                    formatEffectiveStartDate(effectiveMonth),
                  )
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
              ref={replaceFileButtonRef}
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
                  <FeatureFlags enableFocusWrapWithoutSentinels>
                    <ActionableNotification
                      className="rtm-amv-replacement-warning"
                      actionButtonLabel="Keep current values"
                      closeOnEscape={false}
                      inline
                      kind="warning"
                      lowContrast
                      hideCloseButton
                      role="status"
                      title="Selecting a file will replace the values on screen"
                      subtitle="Any edits you haven't saved will be lost. Your saved values won't change until you save again."
                      onActionButtonClick={closeReplacementUpload}
                    />
                  </FeatureFlags>
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
                    aria-label="Uploaded average market values file"
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
                onValueChange={(key, value) => {
                  setReviewValues((current) => ({ ...current, [key]: value }))
                  setSavedNotification(null)
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
                renderIcon={isUploading ? PendingIcon : Save}
                onClick={() => {
                  if (savedActionsUnavailable) {
                    return
                  }
                  void submitUpload(true)
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

      {discardConfirmation && (
        <ConfirmationModal
          open
          launcherButtonRef={discardConfirmation === 'file' ? removeFileButtonRef : cancelButtonRef}
          restoreFocusAfterAction={discardConfirmation !== 'saved-changes'}
          title={
            discardConfirmation === 'file'
              ? 'Are you sure you want to remove this file?'
              : 'Discard these values?'
          }
          description={
            discardConfirmation === 'saved-changes' ||
            (discardConfirmation === 'file' && replacementUploadOpen)
              ? 'The values on screen will go back to your last save.'
              : discardConfirmation === 'file'
                ? 'The values on screen will be cleared. Nothing has been saved.'
                : 'The file and all values on screen will be cleared. Nothing has been saved.'
          }
          cancelLabel={
            discardConfirmation === 'file'
              ? 'Keep file'
              : discardConfirmation === 'saved-changes'
                ? 'Discard values'
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
          cancelDanger={discardConfirmation === 'saved-changes'}
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
                  setUploadErrors([])
                  setUploadSystemError(false)
                  setUploadInputKey((current) => current + 1)
                  setReplacementUploadOpen(false)
                  replacementPreviewRef.current = null
                  replacementReviewValuesRef.current = null
                  setNotification('')
                  // A fresh key sends focus to the "Changes discarded" notice.
                  saveRequestRef.current += 1
                  setSaveFeedbackFocusKey(saveRequestRef.current)
                  setSavedNotification('discarded')
                }
              : undefined
          }
          onConfirm={
            discardConfirmation === 'saved-changes'
              ? () => submitUpload(true)
              : discardConfirmation === 'file' && replacementUploadOpen
                ? removeReplacementFile
                : removeInitialUpload
          }
          onClose={() => setDiscardConfirmation(null)}
        />
      )}
      <UnsavedChangesGuard
        isDirty={hasUnsavedChanges || hasValidatedUpload}
        isBusy={isUploading}
        onDiscard={clearUploadState}
        subject="the average market values"
      />
    </Grid>
  )
}

export default RtmEmsLogAmvUploadPage
