import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CheckmarkFilled,
  ErrorFilled,
  InformationFilled,
  Renew,
  Save,
  WarningAltFilled,
} from '@carbon/icons-react'
import {
  Button,
  Column,
  Grid,
  InlineLoading,
  Modal,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  TextInput,
} from '@carbon/react'
import { AppNotification } from '../../components/AppNotification'
import PageHeader from '@/components/PageHeader'
import { useAuth } from '@/context/auth/useAuth'
import {
  saveRtmEmsLogAmvBatch,
  searchLatestRtmEmsLogAmv,
  searchRtmEmsLogAmv,
  type RtmEmsLogAmvRow,
  type RtmEmsLogAmvSaveRequest,
} from '@/service/rtm-emslogamv-service'
import { formatBusinessIsoDate } from '@/utils/date'

type RtmGrowthIndicator = 'O' | 'S'
type RtmAmvChangeKind = 'added' | 'changed' | 'removed' | null

type RtmAmvSpeciesColumn = {
  key: string
  label: string
  speciesCodes: string[]
}

type RtmAmvCellBasis = {
  currentRows: RtmEmsLogAmvRow[]
  currentValue: string
  hasCurrentRow: boolean
  hasCurrentValue: boolean
  hasMixedCurrentValues: boolean
  hasMixedPreviousValues: boolean
  previousRows: RtmEmsLogAmvRow[]
  previousValue: string
  hasPreviousRow: boolean
  hasPreviousValue: boolean
}

type RtmAmvCell = RtmAmvCellBasis & {
  changeKind: RtmAmvChangeKind
  column: RtmAmvSpeciesColumn
  grade: string
  key: string
  value: string
  dirty: boolean
  warning: string | null
  validationError: string | null
}

type NotificationState = {
  kind: 'success' | 'error' | 'warning' | 'info'
  title: string
  subtitle: string
}

const RTM_AMV_DESCRIPTION =
  'Maintain one monthly value for each species and grade. Values are applied to old and second growth together.'

const RTM_AMV_SPECIES_COLUMNS: RtmAmvSpeciesColumn[] = [
  { key: 'BA', label: 'Balsam (BA)', speciesCodes: ['BA', 'BALSAM'] },
  { key: 'HE', label: 'Hemlock (HE)', speciesCodes: ['HE', 'HEMLOCK'] },
  { key: 'CE', label: 'Cedar (CE)', speciesCodes: ['CE', 'CEDAR'] },
  { key: 'CY', label: 'Cypress (CY)', speciesCodes: ['CY', 'CYPRESS'] },
  { key: 'FI', label: 'Fir (FI)', speciesCodes: ['FI', 'FIR'] },
  { key: 'SP', label: 'Spruce (SP)', speciesCodes: ['SP', 'SPRUCE'] },
  { key: 'PINE', label: 'Pine', speciesCodes: ['WH', 'LO', 'YE'] },
]

const RTM_AMV_GRADE_ORDER = [
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
  'Z',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
]

const RTM_AMV_DISPLAY_GROWTH: RtmGrowthIndicator = 'O'
const MAX_AMV_VALUE = 9999.99

const normalizeKey = (value: string | null | undefined) => (value ?? '').trim().toUpperCase()

const normalizeGrade = (value: string | null | undefined) => {
  if (value === ' ') {
    return 'BLANK'
  }

  const normalized = normalizeKey(value)
  return normalized === 'BLANK' ? 'BLANK' : normalized
}

const currentMonthDate = () => `${formatBusinessIsoDate().slice(0, 7)}-01`

const isMonthStartDate = (value: string) => {
  if (!/^\d{4}-\d{2}-01$/.test(value)) {
    return false
  }

  const [year, month] = value.split('-').map(Number)
  return Number.isInteger(year) && year >= 1 && Number.isInteger(month) && month >= 1 && month <= 12
}

const previousMonthDate = (dateValue: string) => {
  if (!isMonthStartDate(dateValue)) {
    return ''
  }

  const [year, month] = dateValue.split('-').map(Number)
  const previous = new Date(Date.UTC(year, month - 2, 1))
  return previous.toISOString().slice(0, 10)
}

const formatEffectiveMonth = (dateValue: string) => {
  if (!isMonthStartDate(dateValue)) {
    return dateValue
  }

  const [year, month] = dateValue.split('-').map(Number)
  return new Intl.DateTimeFormat('en-CA', {
    month: 'long',
    timeZone: 'UTC',
    year: 'numeric',
  }).format(new Date(Date.UTC(year, month - 1, 1)))
}

const formatRawNumber = (value: number | null | undefined) => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return ''
  }

  return String(value)
}

const normalizeNumericString = (value: string) => value.trim().replace(/,/g, '')

const parseCellValue = (value: string): number | null | undefined => {
  const normalized = normalizeNumericString(value)
  if (!normalized) {
    return null
  }

  if (!/^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(normalized)) {
    return undefined
  }

  const parsed = Number(normalized)
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > MAX_AMV_VALUE) {
    return undefined
  }

  return parsed
}

const comparableCellValue = (value: string) => {
  const parsed = parseCellValue(value)
  if (parsed === undefined) {
    return normalizeNumericString(value)
  }

  return parsed === null ? '' : String(parsed)
}

const rowValue = (row: RtmEmsLogAmvRow) => row.newValue ?? row.currentValue ?? null

const numericSignature = (value: number) => String(value)

const resolveSpeciesColumnKey = (species: string | null | undefined) => {
  const normalizedSpecies = normalizeKey(species)
  if (!normalizedSpecies) {
    return ''
  }

  const matchedColumn = RTM_AMV_SPECIES_COLUMNS.find((column) =>
    column.speciesCodes.includes(normalizedSpecies),
  )

  return matchedColumn?.key ?? normalizedSpecies
}

const rowMatchesCell = (row: RtmEmsLogAmvRow, grade: string, column: RtmAmvSpeciesColumn) => {
  const rowGrade = normalizeGrade(row.grade)
  const rowSpeciesColumnKey = resolveSpeciesColumnKey(row.species)
  return rowGrade === grade && rowSpeciesColumnKey === column.key
}

const buildCellKey = (growthIndicator: RtmGrowthIndicator, grade: string, columnKey: string) =>
  `${growthIndicator}|${grade}|${columnKey}`

const buildCellBasis = (
  currentRows: RtmEmsLogAmvRow[],
  previousRows: RtmEmsLogAmvRow[],
): Record<string, RtmAmvCellBasis> => {
  const basisByKey: Record<string, RtmAmvCellBasis> = {}

  RTM_AMV_GRADE_ORDER.forEach((grade) => {
    RTM_AMV_SPECIES_COLUMNS.forEach((column) => {
      const currentCellRows = currentRows.filter(
        (row) =>
          rowMatchesCell(row, grade, column) &&
          normalizeKey(row.growthIndicator) === RTM_AMV_DISPLAY_GROWTH,
      )
      const previousCellRows = previousRows.filter(
        (row) =>
          rowMatchesCell(row, grade, column) &&
          normalizeKey(row.growthIndicator) === RTM_AMV_DISPLAY_GROWTH,
      )
      const currentValues = currentCellRows
        .map(rowValue)
        .filter((value): value is number => value !== null && value !== undefined)
      const previousValues = previousCellRows
        .map(rowValue)
        .filter((value): value is number => value !== null && value !== undefined)
      const distinctCurrentValues = new Set(currentValues.map(numericSignature))
      const distinctPreviousValues = new Set(previousValues.map(numericSignature))

      basisByKey[buildCellKey(RTM_AMV_DISPLAY_GROWTH, grade, column.key)] = {
        currentRows: currentCellRows,
        currentValue: formatRawNumber(currentValues[0]),
        hasCurrentRow: currentCellRows.length > 0,
        hasCurrentValue: currentValues.length > 0,
        hasMixedCurrentValues: distinctCurrentValues.size > 1,
        hasMixedPreviousValues: distinctPreviousValues.size > 1,
        previousRows: previousCellRows,
        previousValue: formatRawNumber(previousValues[0]),
        hasPreviousRow: previousCellRows.length > 0,
        hasPreviousValue: previousValues.length > 0,
      }
    })
  })

  return basisByKey
}

const buildPrefillValues = (sourceRows: RtmEmsLogAmvRow[], currentRows: RtmEmsLogAmvRow[]) => {
  const sourceBasis = buildCellBasis(sourceRows, [])
  const currentBasis = buildCellBasis(currentRows, [])
  return Object.fromEntries(
    Object.entries(sourceBasis)
      .filter(([key, basis]) => basis.hasCurrentValue && !currentBasis[key]?.hasCurrentValue)
      .map(([key, basis]) => [key, basis.currentValue]),
  )
}

const buildCellWarning = (cell: {
  column: RtmAmvSpeciesColumn
  changeKind: RtmAmvChangeKind
  grade: string
  hasCurrentValue: boolean
  hasPreviousValue: boolean
  value: string
}) => {
  if (cell.changeKind === 'added') {
    return `${cell.column.label} grade ${cell.grade} was blank in the starting values and is now populated.`
  }

  if (cell.changeKind === 'removed') {
    return `${cell.column.label} grade ${cell.grade} had a value in the starting values and is now blank.`
  }

  return null
}

const buildCellValidationError = (cell: {
  column: RtmAmvSpeciesColumn
  dirty: boolean
  grade: string
  value: string
}) => {
  const parsedValue = parseCellValue(cell.value)
  if (parsedValue === undefined) {
    return `${cell.column.label} grade ${cell.grade} must be a number from 0 to 9999.99 with no more than two decimal places.`
  }

  return null
}

const buildCells = (
  basisByKey: Record<string, RtmAmvCellBasis>,
  editedValues: Record<string, string>,
  prefillValues: Record<string, string>,
  retryCellKeys: Record<string, true>,
): RtmAmvCell[] =>
  RTM_AMV_GRADE_ORDER.flatMap((grade) =>
    RTM_AMV_SPECIES_COLUMNS.map((column) => {
      const key = buildCellKey(RTM_AMV_DISPLAY_GROWTH, grade, column.key)
      const basis = basisByKey[key]
      const value = editedValues[key] ?? basis.currentValue
      const clearedExistingValue = basis.hasCurrentValue && parseCellValue(value) === null
      const dirty =
        !clearedExistingValue &&
        (retryCellKeys[key] === true ||
          comparableCellValue(value) !== comparableCellValue(basis.currentValue))
      const baselineValue = prefillValues[key] ?? basis.currentValue
      const effectiveValue = clearedExistingValue ? basis.currentValue : value
      const changedFromBaseline =
        comparableCellValue(effectiveValue) !== comparableCellValue(baselineValue)
      const baselineHasValue = normalizeNumericString(baselineValue) !== ''
      const hasInputValue = normalizeNumericString(effectiveValue) !== ''
      const changeKind: RtmAmvChangeKind = !changedFromBaseline
        ? null
        : !baselineHasValue && hasInputValue
          ? 'added'
          : baselineHasValue && !hasInputValue
            ? 'removed'
            : 'changed'
      const cell = {
        ...basis,
        changeKind,
        column,
        dirty,
        grade,
        key,
        value,
      }

      return {
        ...cell,
        validationError: buildCellValidationError(cell),
        warning: buildCellWarning(cell),
      }
    }),
  )

const warningDeduplicate = (warnings: Array<string | null>) =>
  Array.from(new Set(warnings.filter((warning): warning is string => Boolean(warning))))

const notificationMessage = (message: string, errors: string[]) =>
  Array.from(new Set([message, ...errors].filter(Boolean))).join(' ')

const RTMEmsLogAmvPage = () => {
  const { canPerform } = useAuth()
  const canManage = canPerform('/lexisAgentAdmin')
  const [targetDate, setTargetDate] = useState(currentMonthDate)
  const [loadedDate, setLoadedDate] = useState('')
  const [currentRows, setCurrentRows] = useState<RtmEmsLogAmvRow[]>([])
  const [previousRows, setPreviousRows] = useState<RtmEmsLogAmvRow[]>([])
  const [editedValues, setEditedValues] = useState<Record<string, string>>({})
  const [prefillValues, setPrefillValues] = useState<Record<string, string>>({})
  const [retryCellKeys, setRetryCellKeys] = useState<Record<string, true>>({})
  const [showWarningConfirmation, setShowWarningConfirmation] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [notification, setNotification] = useState<NotificationState | null>(null)
  const loadRequestIdRef = useRef(0)

  const currentMonth = currentMonthDate()
  const selectedDateIsPast = isMonthStartDate(targetDate) && targetDate < currentMonth
  const selectedDateIsCurrent = isMonthStartDate(targetDate) && targetDate === currentMonth
  const selectedDateIsFuture = isMonthStartDate(targetDate) && targetDate > currentMonth
  const selectedPreviousMonthDate = previousMonthDate(targetDate)
  const availableGrades = RTM_AMV_GRADE_ORDER

  const loadRows = useCallback(async () => {
    const requestId = ++loadRequestIdRef.current
    if (!isMonthStartDate(targetDate)) {
      setLoadError('Select a valid effective month.')
      setLoadedDate('')
      setCurrentRows([])
      setPreviousRows([])
      setEditedValues({})
      setPrefillValues({})
      setRetryCellKeys({})
      setShowWarningConfirmation(false)
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setLoadError('')

    try {
      const [currentResponse, previousResponse, latestRows] = await Promise.all([
        searchRtmEmsLogAmv({
          species: '',
          growthIndicator: RTM_AMV_DISPLAY_GROWTH,
          retrievalDate: targetDate,
          updateDate: targetDate,
        }),
        selectedPreviousMonthDate
          ? searchRtmEmsLogAmv({
              species: '',
              growthIndicator: '',
              retrievalDate: selectedPreviousMonthDate,
              updateDate: selectedPreviousMonthDate,
            })
          : Promise.resolve([]),
        searchLatestRtmEmsLogAmv(targetDate),
      ])

      if (requestId !== loadRequestIdRef.current) {
        return
      }

      const nextPrefillValues = buildPrefillValues(latestRows, currentResponse)

      setCurrentRows(currentResponse)
      setPreviousRows(previousResponse)
      setLoadedDate(targetDate)
      setEditedValues(nextPrefillValues)
      setPrefillValues(nextPrefillValues)
      setRetryCellKeys({})
      setShowWarningConfirmation(false)
    } catch (error) {
      if (requestId !== loadRequestIdRef.current) {
        return
      }
      console.error(error)
      setLoadError('Unable to load average monthly values.')
      setLoadedDate('')
      setCurrentRows([])
      setPreviousRows([])
      setEditedValues({})
      setPrefillValues({})
      setRetryCellKeys({})
      setShowWarningConfirmation(false)
    } finally {
      if (requestId === loadRequestIdRef.current) {
        setIsLoading(false)
      }
    }
  }, [selectedPreviousMonthDate, targetDate])

  useEffect(() => {
    void loadRows()
  }, [loadRows])

  const basisByKey = useMemo(
    () => buildCellBasis(currentRows, previousRows),
    [currentRows, previousRows],
  )
  const cells = useMemo(
    () => buildCells(basisByKey, editedValues, prefillValues, retryCellKeys),
    [basisByKey, editedValues, prefillValues, retryCellKeys],
  )
  const selectedCells = cells.filter((cell) => availableGrades.includes(cell.grade))
  const warnings = warningDeduplicate(selectedCells.map((cell) => cell.warning))
  const validationErrors = warningDeduplicate(selectedCells.map((cell) => cell.validationError))
  const dirtyCells = selectedCells.filter((cell) => cell.dirty)
  const hasSelectedPrefill = selectedCells.some(
    (cell) => prefillValues[cell.key] !== undefined && cell.dirty,
  )
  const saveWarnings = warningDeduplicate(dirtyCells.map((cell) => cell.warning))
  const confirmationMessages = warningDeduplicate([
    selectedDateIsPast
      ? `You are changing values for ${formatEffectiveMonth(targetDate)}, which is in the past.`
      : null,
    ...saveWarnings,
  ])
  const hasPendingChanges = dirtyCells.length > 0
  const hasExplicitEdits = dirtyCells.some((cell) => {
    const startingValue = prefillValues[cell.key] ?? basisByKey[cell.key].currentValue
    return comparableCellValue(cell.value) !== comparableCellValue(startingValue)
  })
  const hasAuthoritativeBaseline = !loadError && loadedDate === targetDate
  const isReadOnly = !canManage || isLoading || isSaving || !hasAuthoritativeBaseline
  const saveDisabled =
    isReadOnly || !hasPendingChanges || validationErrors.length > 0 || !isMonthStartDate(targetDate)

  const updateCellValue = (key: string, value: string) => {
    setEditedValues((current) => ({
      ...current,
      [key]: value,
    }))
  }

  const ignoreClearedExistingCell = (cell: RtmAmvCell) => {
    if (!cell.hasCurrentValue || parseCellValue(cell.value) !== null) {
      return
    }

    setEditedValues((current) => {
      if (current[cell.key] === undefined) {
        return current
      }

      const remainingValues = { ...current }
      delete remainingValues[cell.key]
      return remainingValues
    })
    setRetryCellKeys((current) => {
      if (current[cell.key] === undefined) {
        return current
      }

      const remainingKeys = { ...current }
      delete remainingKeys[cell.key]
      return remainingKeys
    })
  }

  const resetChanges = () => {
    setEditedValues(prefillValues)
    setRetryCellKeys({})
    setShowWarningConfirmation(false)
  }

  const buildSaveRequestForCell = (cell: RtmAmvCell): RtmEmsLogAmvSaveRequest | null => {
    const parsedValue = parseCellValue(cell.value)
    if (typeof parsedValue !== 'number') {
      return null
    }

    const species = cell.column.key
    const currentRow = cell.currentRows[0]
    const previousRow = cell.previousRows[0]
    const hasExistingRow = Boolean(currentRow || previousRow)
    const retrievalDate = currentRow?.retrievalDate ?? previousRow?.retrievalDate ?? targetDate

    return {
      species,
      grade: cell.grade,
      growthIndicator: RTM_AMV_DISPLAY_GROWTH,
      retrievalDate: retrievalDate || targetDate,
      updateDate: targetDate,
      newValue: parsedValue,
      saveMode: hasExistingRow ? 'update' : 'create',
    }
  }

  const saveChanges = async () => {
    if (!canManage) {
      setNotification({
        kind: 'error',
        title: 'Average monthly values',
        subtitle: 'You do not have permission to update average monthly values.',
      })
      return
    }

    if (validationErrors.length > 0) {
      setNotification({
        kind: 'error',
        title: 'Average monthly values',
        subtitle: validationErrors[0],
      })
      return
    }

    const saveRequests = dirtyCells.flatMap((cell) => {
      const request = buildSaveRequestForCell(cell)
      return request ? [request] : []
    })
    if (saveRequests.length === 0) {
      return
    }

    setIsSaving(true)

    try {
      const result = await saveRtmEmsLogAmvBatch({ values: saveRequests })
      if (result.status !== 'accepted') {
        setNotification({
          kind: 'error',
          title: 'Average monthly values',
          subtitle:
            notificationMessage(result.message, result.errors) ||
            'Unable to save average monthly values.',
        })
        return
      }

      setNotification({
        kind: saveWarnings.length > 0 ? 'warning' : 'success',
        title: 'Average monthly values updated',
        subtitle:
          saveWarnings.length > 0
            ? `Saved ${dirtyCells.length} table cell${dirtyCells.length === 1 ? '' : 's'} to old and second growth with ${saveWarnings.length} warning${saveWarnings.length === 1 ? '' : 's'}.`
            : `Saved ${dirtyCells.length} table cell${dirtyCells.length === 1 ? '' : 's'} to old and second growth.`,
      })
      await loadRows()
    } catch (error) {
      console.error(error)
      setNotification({
        kind: 'error',
        title: 'Average monthly values',
        subtitle: 'Unable to save average monthly values.',
      })
    } finally {
      setIsSaving(false)
    }
  }

  const requestSave = () => {
    if (selectedDateIsPast) {
      setShowWarningConfirmation(true)
      return
    }

    void saveChanges()
  }

  return (
    <Grid fullWidth className="default-grid admin-upload-fspts-page rtm-amv-page">
      <Column sm={4} md={8} lg={16} className="admin-upload-fspts-header rtm-amv-header">
        <PageHeader
          title="Average Monthly Values"
          subtitle={RTM_AMV_DESCRIPTION}
          style={{ marginBlockEnd: '1.5rem' }}
        />
      </Column>

      <Column sm={4} md={8} lg={16} className="admin-upload-fspts-content rtm-amv-content">
        <section
          className="admin-upload-panel rtm-amv-toolbar"
          aria-labelledby="rtm-amv-table-title"
        >
          <div className="rtm-amv-toolbar__controls">
            <TextInput
              id="rtm-amv-effective-date"
              type="month"
              labelText="Effective month"
              value={isMonthStartDate(targetDate) ? targetDate.slice(0, 7) : ''}
              onChange={(event) => {
                const month = event.target.value
                setTargetDate(/^\d{4}-\d{2}$/.test(month) ? `${month}-01` : '')
              }}
              disabled={isSaving || hasExplicitEdits}
            />
            <Button
              kind="tertiary"
              size="md"
              onClick={() => setTargetDate(currentMonth)}
              disabled={isSaving || hasExplicitEdits || targetDate === currentMonth}
            >
              Current month
            </Button>
            <Button
              kind="tertiary"
              size="md"
              onClick={() => setTargetDate(previousMonthDate(currentMonth))}
              disabled={
                isSaving || hasExplicitEdits || targetDate === previousMonthDate(currentMonth)
              }
            >
              Previous month
            </Button>
            <Button
              kind="secondary"
              size="md"
              renderIcon={Renew}
              onClick={() => {
                void loadRows()
              }}
              disabled={isLoading || isSaving || hasExplicitEdits || !isMonthStartDate(targetDate)}
            >
              Reload
            </Button>
          </div>
          <div className="rtm-amv-toolbar__status" role="status">
            {isLoading ? (
              <InlineLoading description="Loading values" />
            ) : (
              <>
                <InformationFilled size={16} aria-hidden="true" />
                <span>
                  {selectedDateIsCurrent
                    ? `Viewing ${formatEffectiveMonth(loadedDate)}; previous month is ${formatEffectiveMonth(selectedPreviousMonthDate)}`
                    : selectedDateIsFuture
                      ? `Viewing future month ${formatEffectiveMonth(loadedDate)}`
                      : `Viewing past month ${formatEffectiveMonth(loadedDate)}`}
                </span>
              </>
            )}
          </div>
        </section>

        {selectedDateIsPast && (
          <div className="rtm-amv-warning-panel" role="status">
            <div className="rtm-amv-warning-panel__header">
              <WarningAltFilled size={20} aria-hidden="true" />
              <h2>Past month selected</h2>
            </div>
            <p>
              Changes for {formatEffectiveMonth(targetDate)} require confirmation before saving.
            </p>
          </div>
        )}

        {hasSelectedPrefill && (
          <div className="admin-upload-validation admin-upload-validation--info" role="status">
            <InformationFilled
              size={20}
              className="admin-upload-validation__icon"
              aria-hidden="true"
            />
            <div className="admin-upload-validation__content">
              <h3>Starting values copied</h3>
              <p>
                Prefilled from the latest available earlier value for each species and grade. Save
                changes applies the displayed values to both old and second growth for{' '}
                {formatEffectiveMonth(targetDate)}.
              </p>
            </div>
          </div>
        )}

        {loadError && (
          <div className="admin-upload-validation admin-upload-validation--error" role="alert">
            <ErrorFilled size={20} className="admin-upload-validation__icon" aria-hidden="true" />
            <div className="admin-upload-validation__content">
              <h3>Unable to load values</h3>
              <p>{loadError}</p>
            </div>
          </div>
        )}

        {warnings.length > 0 && (
          <div className="rtm-amv-warning-panel" role="status" aria-live="polite">
            <div className="rtm-amv-warning-panel__header">
              <WarningAltFilled size={20} aria-hidden="true" />
              <h2>Warnings</h2>
              <span>{warnings.length}</span>
            </div>
            <ul>
              {warnings.slice(0, 8).map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
            {warnings.length > 8 && (
              <p>
                {warnings.length - 8} more warning{warnings.length - 8 === 1 ? '' : 's'} in the
                table.
              </p>
            )}
          </div>
        )}

        {validationErrors.length > 0 && (
          <div className="admin-upload-validation admin-upload-validation--error" role="alert">
            <ErrorFilled size={20} className="admin-upload-validation__icon" aria-hidden="true" />
            <div className="admin-upload-validation__content">
              <h3>Invalid table value</h3>
              <p id="rtm-amv-validation-summary">{validationErrors[0]}</p>
            </div>
          </div>
        )}

        <section className="admin-upload-panel rtm-amv-table-panel">
          <div className="admin-upload-section-heading rtm-amv-table-heading">
            <h2 id="rtm-amv-table-title">Average monthly values table</h2>
            <p>
              Each cell applies to the matching old- and second-growth records for its species,
              grade, and month.
            </p>
          </div>

          <div className="rtm-amv-table-wrap">
            <TableContainer>
              <Table size="lg" useZebraStyles aria-label="Average monthly value table">
                <TableHead>
                  <TableRow>
                    <TableHeader>Grade</TableHeader>
                    {RTM_AMV_SPECIES_COLUMNS.map((column) => (
                      <TableHeader key={column.key}>{column.label}</TableHeader>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody key={loadedDate}>
                  {availableGrades.map((grade) => (
                    <TableRow key={grade}>
                      <TableCell className="rtm-amv-grade-cell">{grade}</TableCell>
                      {RTM_AMV_SPECIES_COLUMNS.map((column) => {
                        const cell = cells.find(
                          (candidate) =>
                            candidate.key ===
                            buildCellKey(RTM_AMV_DISPLAY_GROWTH, grade, column.key),
                        )
                        if (!cell) {
                          return <TableCell key={column.key} />
                        }

                        const cellClassName = [
                          'rtm-amv-value-cell',
                          cell.dirty ? 'is-dirty' : '',
                          cell.changeKind ? `is-${cell.changeKind}` : '',
                          cell.warning ? 'has-warning' : '',
                          cell.validationError ? 'has-error' : '',
                          cell.hasMixedCurrentValues || cell.hasMixedPreviousValues
                            ? 'has-mixed-values'
                            : '',
                        ]
                          .filter(Boolean)
                          .join(' ')

                        return (
                          <TableCell key={column.key} className={cellClassName}>
                            <label className="rtm-amv-cell-input-label">
                              <span>{`${column.label} grade ${grade}`}</span>
                              <input
                                className="rtm-amv-cell-input"
                                inputMode="decimal"
                                aria-label={`${column.label} grade ${grade}`}
                                aria-invalid={Boolean(cell.validationError)}
                                aria-describedby={
                                  cell.validationError ? 'rtm-amv-validation-summary' : undefined
                                }
                                placeholder={cell.hasCurrentValue ? undefined : '-'}
                                value={cell.value}
                                disabled={isReadOnly}
                                onChange={(event) => updateCellValue(cell.key, event.target.value)}
                                onBlur={() => ignoreClearedExistingCell(cell)}
                              />
                            </label>
                            {cell.hasMixedCurrentValues && (
                              <span className="rtm-amv-cell-note">Multiple values</span>
                            )}
                          </TableCell>
                        )
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </div>
        </section>

        <div className="admin-upload-fspts-button-row rtm-amv-actions">
          <Button
            kind="ghost"
            size="md"
            renderIcon={Renew}
            onClick={resetChanges}
            disabled={!hasPendingChanges || isSaving}
          >
            Reset
          </Button>
          <Button
            kind="primary"
            size="md"
            className="admin-upload-fspts-action-button"
            renderIcon={isSaving ? CheckmarkFilled : Save}
            onClick={requestSave}
            disabled={saveDisabled}
          >
            {isSaving ? 'Saving' : 'Save changes'}
          </Button>
          <div className="rtm-amv-actions__summary" role="status">
            {hasPendingChanges ? (
              <span>
                {dirtyCells.length} cell{dirtyCells.length === 1 ? '' : 's'} ready to save
              </span>
            ) : (
              <span>No unsaved changes</span>
            )}
          </div>
        </div>
      </Column>

      {showWarningConfirmation && (
        <Modal
          open
          passiveModal
          size="sm"
          modalHeading="Confirm AMV changes"
          aria-label="Confirm AMV changes"
          className="rtm-amv-confirm-modal"
          preventCloseOnClickOutside
          selectorPrimaryFocus="#rtm-amv-confirm-cancel"
          onRequestClose={() => setShowWarningConfirmation(false)}
        >
          <div className="rtm-amv-confirm-modal__body">
            <p className="rtm-amv-confirm-modal__intro">
              Review the following before saving {dirtyCells.length} changed cell
              {dirtyCells.length === 1 ? '' : 's'}.
            </p>
            <div className="rtm-amv-confirm-modal__warning">
              <WarningAltFilled size={20} aria-hidden="true" />
              <div>
                <ul>
                  {confirmationMessages.slice(0, 8).map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
                {confirmationMessages.length > 8 && (
                  <p>
                    {confirmationMessages.length - 8} more warning
                    {confirmationMessages.length - 8 === 1 ? '' : 's'} apply to this save.
                  </p>
                )}
              </div>
            </div>
          </div>
          <div className="rtm-amv-confirm-modal__actions">
            <Button
              id="rtm-amv-confirm-cancel"
              kind="secondary"
              size="md"
              onClick={() => setShowWarningConfirmation(false)}
            >
              Cancel
            </Button>
            <Button
              kind="primary"
              size="md"
              renderIcon={Save}
              onClick={() => {
                setShowWarningConfirmation(false)
                void saveChanges()
              }}
            >
              Confirm and save
            </Button>
          </div>
        </Modal>
      )}

      {notification && (
        <Column sm={4} md={8} lg={16}>
          <AppNotification
            kind={notification.kind}
            role="status"
            title={notification.title}
            subtitle={notification.subtitle}
            onCloseButtonClick={() => {
              setNotification(null)
            }}
          />
        </Column>
      )}
    </Grid>
  )
}

export default RTMEmsLogAmvPage
