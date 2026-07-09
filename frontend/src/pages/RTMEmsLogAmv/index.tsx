import { useCallback, useEffect, useMemo, useState } from 'react'
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
} from '@carbon/react'
import { AppNotification } from '../../components/AppNotification'
import IsoDatePicker from '@/components/IsoDatePicker'
import { useAuth } from '@/context/auth/useAuth'
import {
  saveRtmEmsLogAmv,
  searchLatestRtmEmsLogAmv,
  searchRtmEmsLogAmv,
  type RtmEmsLogAmvRow,
  type RtmEmsLogAmvSaveRequest,
} from '@/service/rtm-emslogamv-service'

type RtmGrowthIndicator = 'O' | 'S'
type RtmAmvChangeKind = 'added' | 'changed' | 'removed' | null

type RtmAmvSpeciesColumn = {
  key: string
  label: string
  speciesCodes: string[]
  persistSpeciesCodes: string[]
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
  'Maintain average monthly values directly in the table. Each saved value is persisted for old and second growth.'

const RTM_AMV_SPECIES_COLUMNS: RtmAmvSpeciesColumn[] = [
  { key: 'BA', label: 'Balsam', speciesCodes: ['BA', 'BALSAM'], persistSpeciesCodes: ['BA'] },
  { key: 'HE', label: 'Hemlock', speciesCodes: ['HE', 'HEMLOCK'], persistSpeciesCodes: ['HE'] },
  { key: 'CE', label: 'Cedar', speciesCodes: ['CE', 'CEDAR'], persistSpeciesCodes: ['CE'] },
  { key: 'CY', label: 'Cypress', speciesCodes: ['CY', 'CYPRESS'], persistSpeciesCodes: ['CY'] },
  { key: 'FI', label: 'Fir', speciesCodes: ['FI', 'FIR'], persistSpeciesCodes: ['FI'] },
  { key: 'SP', label: 'Spruce', speciesCodes: ['SP', 'SPRUCE'], persistSpeciesCodes: ['SP'] },
  {
    key: 'PINE',
    label: 'Pine',
    speciesCodes: ['P', 'PINE', 'WH', 'LO', 'YE'],
    persistSpeciesCodes: ['WH', 'LO', 'YE'],
  },
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

const RTM_AMV_GROWTH_INDICATORS: RtmGrowthIndicator[] = ['O', 'S']
const MAX_AMV_VALUE = 9999.99

const normalizeKey = (value: string | null | undefined) => (value ?? '').trim().toUpperCase()

const padDatePart = (value: number) => String(value).padStart(2, '0')

const toLocalIsoDate = (date: Date) =>
  `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`

const todayIsoDate = () => toLocalIsoDate(new Date())

const isIsoDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)

const previousDayDate = (dateValue: string) => {
  const [year, month, day] = dateValue.split('-').map(Number)
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return dateValue
  }

  return toLocalIsoDate(new Date(year, month - 1, day - 1))
}

const formatEffectiveDate = (dateValue: string) => {
  const [year, month, day] = dateValue.split('-').map(Number)
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return dateValue
  }

  return new Intl.DateTimeFormat('en-CA', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
    year: 'numeric',
  }).format(new Date(Date.UTC(year, month - 1, day)))
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
  const rowGrade = normalizeKey(row.grade)
  const rowSpeciesColumnKey = resolveSpeciesColumnKey(row.species)
  return rowGrade === grade && rowSpeciesColumnKey === column.key
}

const rowMatchesPersistTarget = (
  row: RtmEmsLogAmvRow,
  species: string,
  grade: string,
  growthIndicator: RtmGrowthIndicator,
) =>
  normalizeKey(row.species) === normalizeKey(species) &&
  normalizeKey(row.grade) === normalizeKey(grade) &&
  normalizeKey(row.growthIndicator) === growthIndicator

const buildCellKey = (grade: string, columnKey: string) => `${grade}|${columnKey}`

const buildCellBasis = (
  currentRows: RtmEmsLogAmvRow[],
  previousRows: RtmEmsLogAmvRow[],
): Record<string, RtmAmvCellBasis> => {
  const basisByKey: Record<string, RtmAmvCellBasis> = {}

  RTM_AMV_GRADE_ORDER.forEach((grade) => {
    RTM_AMV_SPECIES_COLUMNS.forEach((column) => {
      const currentCellRows = currentRows.filter((row) => rowMatchesCell(row, grade, column))
      const previousCellRows = previousRows.filter((row) => rowMatchesCell(row, grade, column))
      const currentValues = currentCellRows
        .map(rowValue)
        .filter((value): value is number => value !== null && value !== undefined)
      const previousValues = previousCellRows
        .map(rowValue)
        .filter((value): value is number => value !== null && value !== undefined)
      const distinctCurrentValues = new Set(currentValues.map(numericSignature))
      const distinctPreviousValues = new Set(previousValues.map(numericSignature))

      basisByKey[buildCellKey(grade, column.key)] = {
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

const buildPrefillValues = (sourceRows: RtmEmsLogAmvRow[]) => {
  const sourceBasis = buildCellBasis(sourceRows, [])
  return Object.fromEntries(
    Object.entries(sourceBasis)
      .filter(([, basis]) => basis.hasCurrentValue)
      .map(([key, basis]) => [key, basis.currentValue]),
  )
}

const buildCellWarning = (
  cell: {
    column: RtmAmvSpeciesColumn
    changeKind: RtmAmvChangeKind
    grade: string
    hasCurrentValue: boolean
    hasPreviousValue: boolean
    value: string
  },
  showDailyWarnings: boolean,
) => {
  const nextValue = parseCellValue(cell.value)
  const hasNextValue = nextValue !== null && nextValue !== undefined

  if (showDailyWarnings && cell.hasPreviousValue && !hasNextValue) {
    return `${cell.column.label} grade ${cell.grade} had a value yesterday and is blank for today.`
  }

  if (showDailyWarnings && !cell.hasPreviousValue && hasNextValue) {
    return `${cell.column.label} grade ${cell.grade} is newly populated; it was blank yesterday.`
  }

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
  if (parsedValue === null && cell.dirty) {
    return `${cell.column.label} grade ${cell.grade} is required.`
  }

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
  showDailyWarnings: boolean,
): RtmAmvCell[] =>
  RTM_AMV_GRADE_ORDER.flatMap((grade) =>
    RTM_AMV_SPECIES_COLUMNS.map((column) => {
      const key = buildCellKey(grade, column.key)
      const basis = basisByKey[key]
      const value = editedValues[key] ?? basis.currentValue
      const dirty =
        retryCellKeys[key] === true ||
        comparableCellValue(value) !== comparableCellValue(basis.currentValue)
      const baselineValue = prefillValues[key] ?? basis.currentValue
      const changedFromBaseline = comparableCellValue(value) !== comparableCellValue(baselineValue)
      const baselineHasValue = normalizeNumericString(baselineValue) !== ''
      const hasInputValue = normalizeNumericString(value) !== ''
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
        warning: buildCellWarning(cell, showDailyWarnings),
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
  const [targetDate, setTargetDate] = useState(todayIsoDate)
  const [loadedDate, setLoadedDate] = useState(todayIsoDate)
  const [currentRows, setCurrentRows] = useState<RtmEmsLogAmvRow[]>([])
  const [previousRows, setPreviousRows] = useState<RtmEmsLogAmvRow[]>([])
  const [editedValues, setEditedValues] = useState<Record<string, string>>({})
  const [prefillValues, setPrefillValues] = useState<Record<string, string>>({})
  const [prefillSourceDate, setPrefillSourceDate] = useState('')
  const [retryCellKeys, setRetryCellKeys] = useState<Record<string, true>>({})
  const [showWarningConfirmation, setShowWarningConfirmation] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [notification, setNotification] = useState<NotificationState | null>(null)

  const today = todayIsoDate()
  const selectedDateIsPast = isIsoDate(targetDate) && targetDate < today
  const selectedDateIsToday = isIsoDate(targetDate) && targetDate === today
  const selectedDateIsFuture = isIsoDate(targetDate) && targetDate > today
  const selectedPreviousDayDate = selectedDateIsToday ? previousDayDate(targetDate) : ''

  const loadRows = useCallback(async () => {
    if (!isIsoDate(targetDate)) {
      setLoadError('Enter a valid effective date.')
      setCurrentRows([])
      setPreviousRows([])
      setEditedValues({})
      setPrefillValues({})
      setPrefillSourceDate('')
      setRetryCellKeys({})
      setShowWarningConfirmation(false)
      return
    }

    setIsLoading(true)
    setLoadError('')

    try {
      const [currentResponse, previousResponse] = await Promise.all([
        searchRtmEmsLogAmv({
          species: '',
          growthIndicator: '',
          retrievalDate: targetDate,
          updateDate: targetDate,
        }),
        selectedPreviousDayDate
          ? searchRtmEmsLogAmv({
              species: '',
              growthIndicator: '',
              retrievalDate: selectedPreviousDayDate,
              updateDate: selectedPreviousDayDate,
            })
          : Promise.resolve([]),
      ])

      let nextPrefillValues: Record<string, string> = {}
      let nextPrefillSourceDate = ''
      if (currentResponse.length === 0) {
        const latestRows = await searchLatestRtmEmsLogAmv(targetDate)
        nextPrefillValues = buildPrefillValues(latestRows)
        const sourceRow = latestRows.find((row) => row.updateDate || row.retrievalDate)
        if (Object.keys(nextPrefillValues).length > 0 && sourceRow) {
          nextPrefillSourceDate = sourceRow.updateDate ?? sourceRow.retrievalDate ?? ''
        }
      }

      setCurrentRows(currentResponse)
      setPreviousRows(previousResponse)
      setLoadedDate(targetDate)
      setEditedValues(nextPrefillValues)
      setPrefillValues(nextPrefillValues)
      setPrefillSourceDate(nextPrefillSourceDate)
      setRetryCellKeys({})
      setShowWarningConfirmation(false)
    } catch (error) {
      console.error(error)
      setLoadError('Unable to load average monthly values.')
      setCurrentRows([])
      setPreviousRows([])
      setEditedValues({})
      setPrefillValues({})
      setPrefillSourceDate('')
      setRetryCellKeys({})
      setShowWarningConfirmation(false)
    } finally {
      setIsLoading(false)
    }
  }, [selectedPreviousDayDate, targetDate])

  useEffect(() => {
    void loadRows()
  }, [loadRows])

  const basisByKey = useMemo(
    () => buildCellBasis(currentRows, previousRows),
    [currentRows, previousRows],
  )
  const compareWithPreviousDay = selectedDateIsToday && !prefillSourceDate
  const cells = useMemo(
    () =>
      buildCells(basisByKey, editedValues, prefillValues, retryCellKeys, compareWithPreviousDay),
    [basisByKey, compareWithPreviousDay, editedValues, prefillValues, retryCellKeys],
  )
  const warnings = warningDeduplicate(cells.map((cell) => cell.warning))
  const validationErrors = warningDeduplicate(cells.map((cell) => cell.validationError))
  const dirtyCells = cells.filter((cell) => cell.dirty)
  const saveWarnings = warningDeduplicate(dirtyCells.map((cell) => cell.warning))
  const confirmationMessages = warningDeduplicate([
    selectedDateIsPast
      ? `You are changing values for ${formatEffectiveDate(targetDate)}, which is in the past.`
      : null,
    ...saveWarnings,
  ])
  const hasPendingChanges = dirtyCells.length > 0
  const isReadOnly = !canManage || isLoading || isSaving
  const saveDisabled =
    isReadOnly || !hasPendingChanges || validationErrors.length > 0 || !isIsoDate(targetDate)

  const updateCellValue = (key: string, value: string) => {
    setEditedValues((current) => ({
      ...current,
      [key]: value,
    }))
  }

  const resetChanges = () => {
    setEditedValues(prefillValues)
    setRetryCellKeys({})
    setShowWarningConfirmation(false)
  }

  const buildSaveRequestsForCell = (cell: RtmAmvCell): RtmEmsLogAmvSaveRequest[] => {
    const parsedValue = parseCellValue(cell.value)
    if (typeof parsedValue !== 'number') {
      return []
    }

    return cell.column.persistSpeciesCodes.flatMap((species) =>
      RTM_AMV_GROWTH_INDICATORS.map((growthIndicator) => {
        const currentRow = cell.currentRows.find((row) =>
          rowMatchesPersistTarget(row, species, cell.grade, growthIndicator),
        )
        const previousRow = cell.previousRows.find((row) =>
          rowMatchesPersistTarget(row, species, cell.grade, growthIndicator),
        )
        const hasExistingRow = Boolean(currentRow || previousRow)
        const retrievalDate =
          currentRow?.retrievalDate ??
          previousRow?.retrievalDate ??
          (previousRow ? selectedPreviousDayDate : targetDate)

        return {
          species,
          grade: cell.grade,
          growthIndicator,
          retrievalDate: retrievalDate || targetDate,
          updateDate: targetDate,
          newValue: parsedValue,
          saveMode: hasExistingRow ? 'update' : 'create',
        }
      }),
    )
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

    const saveAttempts = dirtyCells.flatMap((cell) =>
      buildSaveRequestsForCell(cell).map((request) => ({ cellKey: cell.key, request })),
    )
    if (saveAttempts.length === 0) {
      return
    }

    setIsSaving(true)

    try {
      const results = await Promise.all(
        saveAttempts.map(async (attempt) => {
          try {
            return { ...attempt, result: await saveRtmEmsLogAmv(attempt.request) }
          } catch (error) {
            console.error(error)
            return { ...attempt, result: null }
          }
        }),
      )
      const failedResults = results.filter((attempt) => attempt.result?.status !== 'accepted')

      if (failedResults.length > 0) {
        const failedCellKeys = new Set(failedResults.map((attempt) => attempt.cellKey))
        const failedValues = Object.fromEntries(
          dirtyCells
            .filter((cell) => failedCellKeys.has(cell.key))
            .map((cell) => [cell.key, cell.value]),
        )
        const firstFailedResult = failedResults[0].result

        if (failedResults.length < results.length) {
          await loadRows()
          setEditedValues(failedValues)
          setRetryCellKeys(
            Object.fromEntries(Array.from(failedCellKeys, (key) => [key, true as const])),
          )
        }

        setNotification({
          kind: failedResults.length === results.length ? 'error' : 'warning',
          title: 'Average monthly values',
          subtitle: firstFailedResult
            ? notificationMessage(firstFailedResult.message, firstFailedResult.errors)
            : 'Unable to save average monthly values.',
        })
        return
      }

      setNotification({
        kind: saveWarnings.length > 0 ? 'warning' : 'success',
        title: 'Average monthly values updated',
        subtitle:
          saveWarnings.length > 0
            ? `Saved ${dirtyCells.length} table cell${dirtyCells.length === 1 ? '' : 's'} with ${saveWarnings.length} warning${saveWarnings.length === 1 ? '' : 's'}.`
            : `Saved ${dirtyCells.length} table cell${dirtyCells.length === 1 ? '' : 's'}.`,
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
        <h1>Average Monthly Values</h1>
        <p>{RTM_AMV_DESCRIPTION}</p>
      </Column>

      <Column sm={4} md={8} lg={16} className="admin-upload-fspts-content rtm-amv-content">
        <section
          className="admin-upload-panel rtm-amv-toolbar"
          aria-labelledby="rtm-amv-table-title"
        >
          <div className="rtm-amv-toolbar__controls">
            <IsoDatePicker
              id="rtm-amv-effective-date"
              labelText="Effective date"
              value={targetDate}
              onChange={setTargetDate}
              disabled={isLoading || isSaving}
            />
            <Button
              kind="secondary"
              size="md"
              renderIcon={Renew}
              onClick={() => {
                void loadRows()
              }}
              disabled={isLoading || isSaving || !isIsoDate(targetDate)}
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
                  {selectedDateIsToday
                    ? `Comparing ${formatEffectiveDate(loadedDate)} against ${formatEffectiveDate(selectedPreviousDayDate)}`
                    : selectedDateIsFuture
                      ? 'Future date selected'
                      : 'Past date selected'}
                </span>
              </>
            )}
          </div>
        </section>

        {selectedDateIsPast && (
          <div className="rtm-amv-warning-panel" role="status">
            <div className="rtm-amv-warning-panel__header">
              <WarningAltFilled size={20} aria-hidden="true" />
              <h2>Past date selected</h2>
            </div>
            <p>Changes for {formatEffectiveDate(targetDate)} require confirmation before saving.</p>
          </div>
        )}

        {prefillSourceDate && (
          <div className="admin-upload-validation admin-upload-validation--info" role="status">
            <InformationFilled
              size={20}
              className="admin-upload-validation__icon"
              aria-hidden="true"
            />
            <div className="admin-upload-validation__content">
              <h3>Starting values copied</h3>
              <p>
                Prefilled from {formatEffectiveDate(prefillSourceDate)}. These values are not saved
                for {formatEffectiveDate(targetDate)} until Save changes is selected.
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
              <p>{validationErrors[0]}</p>
            </div>
          </div>
        )}

        <section className="admin-upload-panel rtm-amv-table-panel">
          <div className="admin-upload-section-heading rtm-amv-table-heading">
            <h2 id="rtm-amv-table-title">Average monthly values table</h2>
            <p>Pine saves to WH, LO and YE. Each edited cell saves old and second growth rows.</p>
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
                <TableBody>
                  {RTM_AMV_GRADE_ORDER.map((grade) => (
                    <TableRow key={grade}>
                      <TableCell className="rtm-amv-grade-cell">{grade}</TableCell>
                      {RTM_AMV_SPECIES_COLUMNS.map((column) => {
                        const cell = cells.find(
                          (candidate) => candidate.key === buildCellKey(grade, column.key),
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
                                placeholder={cell.hasCurrentValue ? undefined : '-'}
                                value={cell.value}
                                disabled={isReadOnly}
                                onChange={(event) => updateCellValue(cell.key, event.target.value)}
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
                {dirtyCells.length} {prefillSourceDate ? 'carried-forward' : 'changed'} cell
                {dirtyCells.length === 1 ? '' : 's'} ready to save
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
