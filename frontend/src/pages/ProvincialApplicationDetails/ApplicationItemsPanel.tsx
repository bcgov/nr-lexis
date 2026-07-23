import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import {
  Button,
  InlineLoading,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TextArea,
  TextInput,
  Tile,
} from '@carbon/react'
import { Box } from '@carbon/icons-react'
import { AppNotification } from '../../components/AppNotification'
import ConfirmationModal from '../../components/ConfirmationModal'
import SearchableSelect from '../../components/SearchableSelect'
import type { ProvincialApplicationDetail } from '@/interfaces/LexisDetails'
import {
  atMostOneDecimalFieldError,
  firstValidationError,
  getVisibleFieldError,
  greaterThanFieldError,
  greaterThanOrEqualFieldError,
  integerFieldError,
  lessThanOrEqualFieldError,
  numericFieldError,
  parseNonNegativeDecimalFieldValue,
  requiredFieldError,
  requiredNumericFieldError,
  type FieldErrors,
  type TouchedFields,
} from '@/pages/shared/create-form-utils'
import { useLatestRequestGuard } from '@/pages/shared/useLatestRequestGuard'
import {
  addApplicationPackage,
  addApplicationScaleToPackage,
  deleteApplicationPackage,
  deleteApplicationScale,
  fetchApplicationEndUsesForSpeciesRegion,
  fetchApplicationGradeCodes,
  fetchApplicationPackageDetails,
  fetchApplicationPackageScales,
  fetchApplicationPackageStatusCodes,
  fetchApplicationPackageSpecies,
  fetchApplicationRemainingSpecies,
  fetchApplicationScaleDetails,
  fetchApplicationSpeciesCodes,
  fetchApplicationUniqueScales,
  updateApplicationPackage,
  type ApplicationCodeOption,
  type ApplicationPackageDetails,
  type ApplicationPackageScaleRow,
  type ApplicationScaleSummaryRow,
  type ApplicationPackageSpeciesRow,
} from '@/service/provincial-application-items-service'

type PackageFormState = {
  packageNumber: string
  newPackageNumber: string
  volume: string
  scaledVolume: string
  averageLength: string
  averageDiameter: string
  status: string
  comments: string
  reprocessed: string
  ageClass: string
  productType: string
  endUseCode: string
}

type ScaleFormState = {
  timberMark: string
  speciesCode: string
  gradeCode: string
  pieces: string
  volume: string
}

type ApplicationItemField =
  | 'packageNewPackageNumber'
  | 'packageVolume'
  | 'packageAverageLength'
  | 'packageAverageDiameter'
  | 'packageStatus'
  | 'packageProductType'
  | 'packageAgeClass'
  | 'createPackageNumber'
  | 'createPackageVolume'
  | 'createPackageAverageLength'
  | 'createPackageAverageDiameter'
  | 'createPackageStatus'
  | 'createPackageProductType'
  | 'createPackageAgeClass'
  | 'scaleTimberMark'
  | 'scaleSpeciesCode'
  | 'scaleGradeCode'
  | 'scalePieces'
  | 'scaleVolume'

type PackageSelectionState = {
  packageNumbers: string[]
  selectedPackageNumber: string
}

type PackageSelectionAction =
  | { type: 'sync'; packageNumbers: string[] }
  | { type: 'select'; packageNumber: string }
  | { type: 'add'; packageNumber: string }
  | { type: 'delete'; packageNumber: string }
  | { type: 'rename'; previousPackageNumber: string; nextPackageNumber: string }

export type ProvincialApplicationItemsPanelProps = {
  detail: ProvincialApplicationDetail
  canEditPackages: boolean
  canAddPackages: boolean
  canAddScales: boolean
  canUpdatePackageNumber: boolean
  authoritativeOptionsAvailability: 'loading' | 'available' | 'unavailable'
  productTypeOptions: ApplicationCodeOption[]
  growthTypeOptions: ApplicationCodeOption[]
  onDetailChanged: () => Promise<void>
  onDirtyChange?: (dirty: boolean) => void
  onBusyChange?: (busy: boolean) => void
  onSelectedPackageChange?: (packageNumber: string) => void
  focusedPackageNumber?: string
  focusedPackageRequestId?: number
  focusScalesRequestId?: number
}

const emptyPackageForm = (productTypeCode: string | null | undefined): PackageFormState => ({
  packageNumber: '',
  newPackageNumber: '',
  volume: '',
  scaledVolume: '',
  averageLength: '',
  averageDiameter: '',
  status: '',
  comments: '',
  reprocessed: 'N',
  ageClass: '',
  productType: productTypeCode ?? '',
  endUseCode: '',
})

const emptyScaleForm: ScaleFormState = {
  timberMark: '',
  speciesCode: '',
  gradeCode: '',
  pieces: '',
  volume: '',
}

const normalizePackageNumberInput = (value: string): string => value.toUpperCase()

const existingPackageNumberError = (
  value: string,
  packageNumbers: string[],
  excludePackageNumber = '',
): string | undefined => {
  const normalized = value.trim().toUpperCase()
  if (!normalized) {
    return undefined
  }
  const excluded = excludePackageNumber.trim().toUpperCase()
  const exists = packageNumbers.some(
    (packageNumber) =>
      packageNumber.trim().toUpperCase() === normalized &&
      packageNumber.trim().toUpperCase() !== excluded,
  )
  return exists ? `Package ${normalized} already exists.` : undefined
}

const asOptionText = (option: ApplicationCodeOption): string =>
  option.description && option.description !== option.code
    ? `${option.code} - ${option.description}`
    : option.code

const toSearchableOption = (option: ApplicationCodeOption) => ({
  value: option.code,
  label: asOptionText(option),
})

const optionsWithCurrentCode = (
  options: ApplicationCodeOption[],
  currentCode: string,
): ApplicationCodeOption[] => {
  const normalizedCurrentCode = currentCode.trim()
  if (!normalizedCurrentCode || options.some((option) => option.code === normalizedCurrentCode)) {
    return options
  }

  return [{ code: normalizedCurrentCode, description: normalizedCurrentCode }, ...options]
}

const packageRequiresAgeClass = (productTypeCode: string): boolean =>
  ['H', 'S'].includes(productTypeCode.trim().toUpperCase())

const uniqueCodes = (rows: ApplicationPackageSpeciesRow[]): string[] =>
  Array.from(new Set(rows.map((row) => row.species).filter(Boolean)))

const roundOneDecimal = (value: number): number => Math.round(value * 10) / 10

const formatPieceCount = (value: number | string): string =>
  typeof value === 'number' ? value.toLocaleString() : value

const formatScaleLookupResult = (row: {
  timberMark: string
  species: string
  grade: string
  pieces: number | string
  volume: string
}): string =>
  `${row.timberMark} ${row.species}/${row.grade} ${formatPieceCount(row.pieces)} pcs ${row.volume} m3`

const scaleVolumeWithinPackageFieldError = (
  value: string,
  remainingVolume: number | null,
): string | null => {
  const parsed = parseNonNegativeDecimalFieldValue(value)
  if (parsed === null || remainingVolume === null) {
    return null
  }

  return parsed <= remainingVolume
    ? null
    : `Scale volume must be ${remainingVolume.toFixed(1)} or less.`
}

const buildPackageSelectionState = (packageNumbers: string[]): PackageSelectionState => ({
  packageNumbers,
  selectedPackageNumber: packageNumbers[0] ?? '',
})

const packageSelectionReducer = (
  state: PackageSelectionState,
  action: PackageSelectionAction,
): PackageSelectionState => {
  if (action.type === 'sync') {
    return {
      packageNumbers: action.packageNumbers,
      selectedPackageNumber:
        state.selectedPackageNumber && action.packageNumbers.includes(state.selectedPackageNumber)
          ? state.selectedPackageNumber
          : (action.packageNumbers[0] ?? ''),
    }
  }

  if (action.type === 'select') {
    return {
      ...state,
      selectedPackageNumber: action.packageNumber,
    }
  }

  if (action.type === 'add') {
    const packageNumbers = state.packageNumbers.includes(action.packageNumber)
      ? state.packageNumbers
      : [...state.packageNumbers, action.packageNumber]
    return {
      packageNumbers,
      selectedPackageNumber: action.packageNumber,
    }
  }

  if (action.type === 'delete') {
    const packageNumbers = state.packageNumbers.filter((item) => item !== action.packageNumber)
    return {
      packageNumbers,
      selectedPackageNumber: packageNumbers[0] ?? '',
    }
  }

  const packageNumbers = state.packageNumbers.includes(action.previousPackageNumber)
    ? state.packageNumbers.map((item) =>
        item === action.previousPackageNumber ? action.nextPackageNumber : item,
      )
    : [...state.packageNumbers, action.nextPackageNumber]
  return {
    packageNumbers,
    selectedPackageNumber: action.nextPackageNumber,
  }
}

const toPackageForm = (
  productTypeCode: string | null | undefined,
  packageDetails: ApplicationPackageDetails,
  speciesRows: ApplicationPackageSpeciesRow[],
): PackageFormState => ({
  packageNumber: packageDetails.packageNumber,
  newPackageNumber: packageDetails.packageNumber,
  volume: packageDetails.volume,
  scaledVolume: String(packageDetails.scaledVolume),
  averageLength: packageDetails.length,
  averageDiameter: packageDetails.diameter,
  status: packageDetails.status,
  comments: packageDetails.comments,
  reprocessed: packageDetails.reprocessed || 'N',
  ageClass: packageDetails.ageClass,
  productType: packageDetails.productType || productTypeCode || '',
  endUseCode: speciesRows[0]?.endUse ?? '',
})

function ProvincialApplicationItemsPanel({
  detail,
  canEditPackages,
  canAddPackages,
  canAddScales,
  canUpdatePackageNumber,
  authoritativeOptionsAvailability,
  productTypeOptions,
  growthTypeOptions,
  onDetailChanged,
  onDirtyChange,
  onBusyChange,
  onSelectedPackageChange,
  focusedPackageNumber,
  focusedPackageRequestId,
  focusScalesRequestId,
}: ProvincialApplicationItemsPanelProps) {
  const applicationNumber = String(detail.applicationNumber)
  const productTypeCode = detail.productTypeCode ?? ''
  const packageNumbersFromDetail = useMemo(
    () => detail.packages.map((item) => item.packageNumber).filter(Boolean),
    [detail.packages],
  )
  const [{ packageNumbers, selectedPackageNumber }, dispatchPackageSelection] = useReducer(
    packageSelectionReducer,
    packageNumbersFromDetail,
    buildPackageSelectionState,
  )
  const [packageForm, setPackageForm] = useState<PackageFormState>(() =>
    emptyPackageForm(productTypeCode),
  )
  const [packageBaselineForm, setPackageBaselineForm] = useState<PackageFormState>(() =>
    emptyPackageForm(productTypeCode),
  )
  const [createPackageForm, setCreatePackageForm] = useState<PackageFormState>(() =>
    emptyPackageForm(productTypeCode),
  )
  const [packageSpeciesRows, setPackageSpeciesRows] = useState<ApplicationPackageSpeciesRow[]>([])
  const [speciesDraft, setSpeciesDraft] = useState<string[]>([])
  const [packageSpeciesBaseline, setPackageSpeciesBaseline] = useState<string[]>([])
  const [createSpeciesDraft, setCreateSpeciesDraft] = useState<string[]>([])
  const [scales, setScales] = useState<ApplicationPackageScaleRow[]>([])
  const [applicationScaleRows, setApplicationScaleRows] = useState<ApplicationScaleSummaryRow[]>([])
  const [speciesOptions, setSpeciesOptions] = useState<ApplicationCodeOption[]>([])
  const [packageStatusOptions, setPackageStatusOptions] = useState<ApplicationCodeOption[]>([])
  const [remainingSpeciesOptions, setRemainingSpeciesOptions] = useState<ApplicationCodeOption[]>(
    [],
  )
  const [createRemainingSpeciesOptions, setCreateRemainingSpeciesOptions] = useState<
    ApplicationCodeOption[]
  >([])
  const [endUseOptions, setEndUseOptions] = useState<ApplicationCodeOption[]>([])
  const [createEndUseOptions, setCreateEndUseOptions] = useState<ApplicationCodeOption[]>([])
  const [gradeOptions, setGradeOptions] = useState<ApplicationCodeOption[]>([])
  const [speciesToAdd, setSpeciesToAdd] = useState('')
  const [createSpeciesToAdd, setCreateSpeciesToAdd] = useState('')
  const [scaleForm, setScaleForm] = useState<ScaleFormState>(emptyScaleForm)
  const [scaleLookupId, setScaleLookupId] = useState('')
  const [scaleLookupResult, setScaleLookupResult] = useState('')
  const [scaleActionErrorMessage, setScaleActionErrorMessage] = useState('')
  const [baseReferenceOptionsAvailability, setBaseReferenceOptionsAvailability] = useState<
    'loading' | 'available' | 'unavailable'
  >('loading')
  const [dependentReferenceOptionsUnavailable, setDependentReferenceOptionsUnavailable] =
    useState(false)
  const [itemsLoading, setItemsLoading] = useState(false)
  const [packageDataLoaded, setPackageDataLoaded] = useState(false)
  const [itemsErrorMessage, setItemsErrorMessage] = useState('')
  const [itemsInfoMessage, setItemsInfoMessage] = useState('')
  const [isSavingPackage, setIsSavingPackage] = useState(false)
  const [isSavingScale, setIsSavingScale] = useState(false)
  const [deletingScaleId, setDeletingScaleId] = useState('')
  const [touchedItemFields, setTouchedItemFields] = useState<TouchedFields<ApplicationItemField>>(
    {},
  )
  const [showPackageValidationErrors, setShowPackageValidationErrors] = useState(false)
  const [showCreatePackageValidationErrors, setShowCreatePackageValidationErrors] = useState(false)
  const [showScaleValidationErrors, setShowScaleValidationErrors] = useState(false)
  const [packageDraftTouched, setPackageDraftTouched] = useState(false)
  const [createPackageDraftTouched, setCreatePackageDraftTouched] = useState(false)
  const [scaleDraftTouched, setScaleDraftTouched] = useState(false)
  const [pendingPackageSelection, setPendingPackageSelection] = useState('')
  const scalesSectionRef = useRef<HTMLElement>(null)
  const lastScrolledToScalesRequestIdRef = useRef(0)
  const beginItemsRequest = useLatestRequestGuard()
  const selectedPackageDraftDirty =
    packageDraftTouched &&
    (JSON.stringify(packageForm) !== JSON.stringify(packageBaselineForm) ||
      JSON.stringify(speciesDraft) !== JSON.stringify(packageSpeciesBaseline))
  const createPackageDraftDirty =
    createPackageDraftTouched &&
    (JSON.stringify(createPackageForm) !== JSON.stringify(emptyPackageForm(productTypeCode)) ||
      createSpeciesDraft.length > 0)
  const scaleDraftDirty =
    scaleDraftTouched && JSON.stringify(scaleForm) !== JSON.stringify(emptyScaleForm)
  const itemsDirty = selectedPackageDraftDirty || createPackageDraftDirty || scaleDraftDirty
  const itemsBusy = isSavingPackage || isSavingScale || !!deletingScaleId

  useEffect(() => {
    onDirtyChange?.(itemsDirty)
  }, [itemsDirty, onDirtyChange])

  useEffect(() => {
    onBusyChange?.(itemsBusy)
  }, [itemsBusy, onBusyChange])

  useEffect(
    () => () => {
      onDirtyChange?.(false)
      onBusyChange?.(false)
    },
    [onBusyChange, onDirtyChange],
  )
  const selectedPackageScaleVolume = scales.reduce(
    (total, row) => total + (parseNonNegativeDecimalFieldValue(row.volume) ?? 0),
    0,
  )
  const selectedPackageVolume = parseNonNegativeDecimalFieldValue(packageForm.volume)
  const selectedPackageRemainingScaleVolume =
    selectedPackageVolume === null
      ? null
      : Math.max(0, roundOneDecimal(selectedPackageVolume - selectedPackageScaleVolume))

  const itemFieldErrors = useMemo<FieldErrors<ApplicationItemField>>(
    () => ({
      packageNewPackageNumber:
        requiredFieldError(packageForm.newPackageNumber, 'Package number') ??
        existingPackageNumberError(
          packageForm.newPackageNumber,
          packageNumbers,
          selectedPackageNumber,
        ),
      packageVolume: firstValidationError(
        () => requiredNumericFieldError(packageForm.volume, 'Package volume'),
        () => greaterThanOrEqualFieldError(packageForm.volume, 'Package volume', 0),
        () => atMostOneDecimalFieldError(packageForm.volume, 'Package volume'),
      ),
      packageAverageLength: firstValidationError(
        () => requiredNumericFieldError(packageForm.averageLength, 'Average length'),
        () => greaterThanFieldError(packageForm.averageLength, 'Average length', 0),
        () => lessThanOrEqualFieldError(packageForm.averageLength, 'Average length', 99),
      ),
      packageAverageDiameter: firstValidationError(
        () => requiredNumericFieldError(packageForm.averageDiameter, 'Average diameter'),
        () => greaterThanFieldError(packageForm.averageDiameter, 'Average diameter', 0),
        () => lessThanOrEqualFieldError(packageForm.averageDiameter, 'Average diameter', 99.99),
      ),
      packageStatus: requiredFieldError(packageForm.status, 'Package status code') ?? undefined,
      packageProductType: requiredFieldError(packageForm.productType, 'Product type') ?? undefined,
      packageAgeClass: packageRequiresAgeClass(packageForm.productType)
        ? (requiredFieldError(packageForm.ageClass, 'Age class') ?? undefined)
        : undefined,
      createPackageNumber:
        requiredFieldError(createPackageForm.packageNumber, 'Package number') ??
        existingPackageNumberError(createPackageForm.packageNumber, packageNumbers),
      createPackageVolume: firstValidationError(
        () => requiredNumericFieldError(createPackageForm.volume, 'Package volume'),
        () => greaterThanOrEqualFieldError(createPackageForm.volume, 'Package volume', 0),
        () => atMostOneDecimalFieldError(createPackageForm.volume, 'Package volume'),
      ),
      createPackageAverageLength: firstValidationError(
        () => requiredNumericFieldError(createPackageForm.averageLength, 'Average length'),
        () => greaterThanFieldError(createPackageForm.averageLength, 'Average length', 0),
        () => lessThanOrEqualFieldError(createPackageForm.averageLength, 'Average length', 99),
      ),
      createPackageAverageDiameter: firstValidationError(
        () => requiredNumericFieldError(createPackageForm.averageDiameter, 'Average diameter'),
        () => greaterThanFieldError(createPackageForm.averageDiameter, 'Average diameter', 0),
        () =>
          lessThanOrEqualFieldError(createPackageForm.averageDiameter, 'Average diameter', 99.99),
      ),
      createPackageStatus:
        requiredFieldError(createPackageForm.status, 'Package status code') ?? undefined,
      createPackageProductType:
        requiredFieldError(createPackageForm.productType, 'Product type') ?? undefined,
      createPackageAgeClass: packageRequiresAgeClass(createPackageForm.productType)
        ? (requiredFieldError(createPackageForm.ageClass, 'Age class') ?? undefined)
        : undefined,
      scaleTimberMark: requiredFieldError(scaleForm.timberMark, 'Timber mark') ?? undefined,
      scaleSpeciesCode: requiredFieldError(scaleForm.speciesCode, 'Species') ?? undefined,
      scaleGradeCode: requiredFieldError(scaleForm.gradeCode, 'Grade') ?? undefined,
      scalePieces: firstValidationError(
        () => requiredFieldError(scaleForm.pieces, 'Pieces'),
        () => numericFieldError(scaleForm.pieces, 'Pieces'),
        () => integerFieldError(scaleForm.pieces, 'Pieces'),
        () => greaterThanOrEqualFieldError(scaleForm.pieces, 'Pieces', 0),
        () => lessThanOrEqualFieldError(scaleForm.pieces, 'Pieces', 999999999),
      ),
      scaleVolume: firstValidationError(
        () => requiredFieldError(scaleForm.volume, 'Scale volume'),
        () => numericFieldError(scaleForm.volume, 'Scale volume'),
        () => greaterThanOrEqualFieldError(scaleForm.volume, 'Scale volume', 0),
        () => lessThanOrEqualFieldError(scaleForm.volume, 'Scale volume', 99999.9),
        () =>
          scaleVolumeWithinPackageFieldError(scaleForm.volume, selectedPackageRemainingScaleVolume),
      ),
    }),
    [
      createPackageForm,
      packageForm,
      packageNumbers,
      scaleForm,
      selectedPackageRemainingScaleVolume,
      selectedPackageNumber,
    ],
  )

  const hasPackageValidationError = Boolean(
    itemFieldErrors.packageNewPackageNumber ||
    itemFieldErrors.packageVolume ||
    itemFieldErrors.packageAverageLength ||
    itemFieldErrors.packageAverageDiameter ||
    itemFieldErrors.packageStatus ||
    itemFieldErrors.packageProductType ||
    itemFieldErrors.packageAgeClass,
  )
  const hasCreatePackageValidationError = Boolean(
    itemFieldErrors.createPackageNumber ||
    itemFieldErrors.createPackageVolume ||
    itemFieldErrors.createPackageAverageLength ||
    itemFieldErrors.createPackageAverageDiameter ||
    itemFieldErrors.createPackageStatus ||
    itemFieldErrors.createPackageProductType ||
    itemFieldErrors.createPackageAgeClass,
  )
  const hasScaleValidationError = Boolean(
    itemFieldErrors.scaleTimberMark ||
    itemFieldErrors.scaleSpeciesCode ||
    itemFieldErrors.scaleGradeCode ||
    itemFieldErrors.scalePieces ||
    itemFieldErrors.scaleVolume,
  )

  const markItemFieldTouched = (field: ApplicationItemField): void => {
    setTouchedItemFields((current) => ({ ...current, [field]: true }))
  }

  const packageFieldError = (field: ApplicationItemField): string | undefined =>
    getVisibleFieldError(field, itemFieldErrors, touchedItemFields, showPackageValidationErrors)

  const createPackageFieldError = (field: ApplicationItemField): string | undefined =>
    getVisibleFieldError(
      field,
      itemFieldErrors,
      touchedItemFields,
      showCreatePackageValidationErrors,
    )

  const scaleFieldError = (field: ApplicationItemField): string | undefined =>
    getVisibleFieldError(field, itemFieldErrors, touchedItemFields, showScaleValidationErrors)

  const firstItemError = (...fields: ApplicationItemField[]): string | undefined =>
    fields.map((field) => itemFieldErrors[field]).find((error): error is string => !!error)

  const loadApplicationScaleSummary = useCallback(async () => {
    try {
      const result = await fetchApplicationUniqueScales(applicationNumber)
      setApplicationScaleRows(result)
    } catch {
      setApplicationScaleRows([])
    }
  }, [applicationNumber])

  const requestPackageSelection = useCallback(
    (packageNumber: string) => {
      if (packageNumber === selectedPackageNumber) return
      if (selectedPackageDraftDirty || scaleDraftDirty) {
        setPendingPackageSelection(packageNumber)
        return
      }
      dispatchPackageSelection({ type: 'select', packageNumber })
    },
    [scaleDraftDirty, selectedPackageDraftDirty, selectedPackageNumber],
  )

  useEffect(() => {
    dispatchPackageSelection({ type: 'sync', packageNumbers: packageNumbersFromDetail })
  }, [packageNumbersFromDetail])

  useEffect(() => {
    onSelectedPackageChange?.(selectedPackageNumber)
  }, [onSelectedPackageChange, selectedPackageNumber])

  useEffect(() => {
    if (focusedPackageNumber && packageNumbers.includes(focusedPackageNumber)) {
      queueMicrotask(() => requestPackageSelection(focusedPackageNumber))
    }
  }, [focusedPackageNumber, focusedPackageRequestId, packageNumbers, requestPackageSelection])

  useEffect(() => {
    let cancelled = false
    const loadCodeOptions = async () => {
      setBaseReferenceOptionsAvailability('loading')
      try {
        const [species, packageStatuses] = await Promise.all([
          fetchApplicationSpeciesCodes(),
          fetchApplicationPackageStatusCodes(),
        ])
        if (!cancelled) {
          setSpeciesOptions(species)
          setPackageStatusOptions(packageStatuses)
          setBaseReferenceOptionsAvailability(
            species.length > 0 && packageStatuses.length > 0 ? 'available' : 'unavailable',
          )
        }
      } catch {
        if (!cancelled) {
          setBaseReferenceOptionsAvailability('unavailable')
          setItemsErrorMessage('Unable to load application item code lists.')
        }
      }
    }

    void loadCodeOptions()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    void loadApplicationScaleSummary()
  }, [loadApplicationScaleSummary])

  const loadPackageItems = useCallback(
    async (packageNumber: string) => {
      const isLatestRequest = beginItemsRequest()
      if (!packageNumber) {
        setItemsLoading(false)
        setPackageDataLoaded(false)
        const emptyForm = emptyPackageForm(productTypeCode)
        setPackageForm(emptyForm)
        setPackageBaselineForm(emptyForm)
        setPackageSpeciesRows([])
        setSpeciesDraft([])
        setPackageSpeciesBaseline([])
        setPackageDraftTouched(false)
        setScaleForm(emptyScaleForm)
        setScaleDraftTouched(false)
        setScales([])
        setRemainingSpeciesOptions([])
        setEndUseOptions([])
        return
      }

      setItemsLoading(true)
      setPackageDataLoaded(false)
      setItemsErrorMessage('')
      const emptyForm = emptyPackageForm(productTypeCode)
      setPackageForm(emptyForm)
      setPackageBaselineForm(emptyForm)
      setPackageSpeciesRows([])
      setSpeciesDraft([])
      setPackageSpeciesBaseline([])
      setPackageDraftTouched(false)
      setScaleForm(emptyScaleForm)
      setScaleDraftTouched(false)
      setSpeciesToAdd('')
      setScales([])
      setRemainingSpeciesOptions([])
      setEndUseOptions([])
      try {
        const detailsResult = await fetchApplicationPackageDetails(packageNumber)
        if (!isLatestRequest()) {
          return
        }
        const speciesResult = await fetchApplicationPackageSpecies(packageNumber)
        if (!isLatestRequest()) {
          return
        }
        const scalesResult = await fetchApplicationPackageScales(packageNumber)
        if (!isLatestRequest()) {
          return
        }
        const nextSpeciesDraft = uniqueCodes(speciesResult)
        const loadedPackageForm = toPackageForm(productTypeCode, detailsResult, speciesResult)
        setPackageForm(loadedPackageForm)
        setPackageBaselineForm(loadedPackageForm)
        setShowPackageValidationErrors(false)
        setPackageSpeciesRows(speciesResult)
        setSpeciesDraft(nextSpeciesDraft)
        setPackageSpeciesBaseline(nextSpeciesDraft)
        setPackageDraftTouched(false)
        setScales(scalesResult)
        setPackageDataLoaded(true)
      } catch {
        if (isLatestRequest()) {
          setPackageDataLoaded(false)
          const failedForm = emptyPackageForm(productTypeCode)
          setPackageForm(failedForm)
          setPackageBaselineForm(failedForm)
          setPackageSpeciesRows([])
          setSpeciesDraft([])
          setPackageSpeciesBaseline([])
          setPackageDraftTouched(false)
          setScaleForm(emptyScaleForm)
          setScaleDraftTouched(false)
          setScales([])
          setItemsErrorMessage('Unable to retrieve application item details.')
        }
      } finally {
        if (isLatestRequest()) {
          setItemsLoading(false)
        }
      }
    },
    [beginItemsRequest, productTypeCode],
  )

  useEffect(() => {
    void loadPackageItems(selectedPackageNumber)
  }, [loadPackageItems, selectedPackageNumber])

  useEffect(() => {
    if (
      !focusScalesRequestId ||
      lastScrolledToScalesRequestIdRef.current === focusScalesRequestId ||
      !packageDataLoaded ||
      (focusedPackageNumber && selectedPackageNumber !== focusedPackageNumber)
    ) {
      return
    }
    lastScrolledToScalesRequestIdRef.current = focusScalesRequestId
    scalesSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [focusScalesRequestId, focusedPackageNumber, packageDataLoaded, selectedPackageNumber])

  useEffect(() => {
    let cancelled = false
    const region = detail.orgUnitNumber ? String(detail.orgUnitNumber) : ''
    const productType = packageForm.productType || productTypeCode

    const loadSpeciesOptions = async () => {
      if (!region) {
        setRemainingSpeciesOptions(speciesOptions)
        return
      }
      try {
        const remaining = await fetchApplicationRemainingSpecies(region, productType, speciesDraft)
        if (!cancelled) {
          setRemainingSpeciesOptions(remaining.length > 0 ? remaining : speciesOptions)
        }
      } catch {
        if (!cancelled) {
          setDependentReferenceOptionsUnavailable(true)
          setRemainingSpeciesOptions(speciesOptions)
        }
      }
    }

    void loadSpeciesOptions()
    return () => {
      cancelled = true
    }
  }, [detail.orgUnitNumber, productTypeCode, packageForm.productType, speciesDraft, speciesOptions])

  useEffect(() => {
    let cancelled = false
    const region = detail.orgUnitNumber ? String(detail.orgUnitNumber) : ''
    const productType = createPackageForm.productType || productTypeCode

    const loadCreateSpeciesOptions = async () => {
      if (!region) {
        setCreateRemainingSpeciesOptions(speciesOptions)
        return
      }
      try {
        const remaining = await fetchApplicationRemainingSpecies(
          region,
          productType,
          createSpeciesDraft,
        )
        if (!cancelled) {
          setCreateRemainingSpeciesOptions(remaining.length > 0 ? remaining : speciesOptions)
        }
      } catch {
        if (!cancelled) {
          setDependentReferenceOptionsUnavailable(true)
          setCreateRemainingSpeciesOptions(speciesOptions)
        }
      }
    }

    void loadCreateSpeciesOptions()
    return () => {
      cancelled = true
    }
  }, [
    createPackageForm.productType,
    createSpeciesDraft,
    detail.orgUnitNumber,
    productTypeCode,
    speciesOptions,
  ])

  useEffect(() => {
    let cancelled = false
    const region = detail.orgUnitNumber ? String(detail.orgUnitNumber) : ''

    const loadEndUseOptions = async () => {
      if (!region || speciesDraft.length === 0) {
        setEndUseOptions([])
        return
      }
      try {
        const options = await fetchApplicationEndUsesForSpeciesRegion(region, speciesDraft)
        if (!cancelled) {
          setEndUseOptions(options)
          setPackageForm((current) => ({
            ...current,
            endUseCode:
              current.endUseCode && options.some((option) => option.code === current.endUseCode)
                ? current.endUseCode
                : (options[0]?.code ?? current.endUseCode),
          }))
        }
      } catch {
        if (!cancelled) {
          setDependentReferenceOptionsUnavailable(true)
          setEndUseOptions([])
        }
      }
    }

    void loadEndUseOptions()
    return () => {
      cancelled = true
    }
  }, [detail.orgUnitNumber, speciesDraft])

  useEffect(() => {
    let cancelled = false
    const region = detail.orgUnitNumber ? String(detail.orgUnitNumber) : ''

    const loadCreateEndUseOptions = async () => {
      if (!region || createSpeciesDraft.length === 0) {
        setCreateEndUseOptions([])
        return
      }
      try {
        const options = await fetchApplicationEndUsesForSpeciesRegion(region, createSpeciesDraft)
        if (!cancelled) {
          setCreateEndUseOptions(options)
          setCreatePackageForm((current) => ({
            ...current,
            endUseCode:
              current.endUseCode && options.some((option) => option.code === current.endUseCode)
                ? current.endUseCode
                : (options[0]?.code ?? current.endUseCode),
          }))
        }
      } catch {
        if (!cancelled) {
          setDependentReferenceOptionsUnavailable(true)
          setCreateEndUseOptions([])
        }
      }
    }

    void loadCreateEndUseOptions()
    return () => {
      cancelled = true
    }
  }, [createSpeciesDraft, detail.orgUnitNumber])

  useEffect(() => {
    let cancelled = false
    const region = detail.orgUnitNumber ? String(detail.orgUnitNumber) : ''

    const loadGrades = async () => {
      if (!region || !scaleForm.speciesCode) {
        setGradeOptions([])
        return
      }
      try {
        const options = await fetchApplicationGradeCodes(region, scaleForm.speciesCode)
        if (!cancelled) {
          setGradeOptions(options)
          setScaleForm((current) => ({
            ...current,
            gradeCode:
              current.gradeCode && options.some((option) => option.code === current.gradeCode)
                ? current.gradeCode
                : (options[0]?.code ?? current.gradeCode),
          }))
        }
      } catch {
        if (!cancelled) {
          setDependentReferenceOptionsUnavailable(true)
          setGradeOptions([])
        }
      }
    }

    void loadGrades()
    return () => {
      cancelled = true
    }
  }, [detail.orgUnitNumber, scaleForm.speciesCode])

  const setPackageField = (field: keyof PackageFormState, value: string) => {
    setPackageDraftTouched(true)
    setPackageForm((current) => ({
      ...current,
      [field]: field === 'newPackageNumber' ? normalizePackageNumberInput(value) : value,
    }))
  }

  const setCreatePackageField = (field: keyof PackageFormState, value: string) => {
    setCreatePackageDraftTouched(true)
    setCreatePackageForm((current) => ({
      ...current,
      [field]: field === 'packageNumber' ? normalizePackageNumberInput(value) : value,
    }))
  }

  const setScaleField = (field: keyof ScaleFormState, value: string) => {
    setScaleDraftTouched(true)
    setScaleForm((current) => ({ ...current, [field]: value }))
  }

  const onAddSpecies = () => {
    if (!speciesToAdd || speciesDraft.includes(speciesToAdd)) {
      return
    }
    setPackageDraftTouched(true)
    setSpeciesDraft((current) => [...current, speciesToAdd])
    setSpeciesToAdd('')
  }

  const onRemoveSpecies = (species: string) => {
    setPackageDraftTouched(true)
    setSpeciesDraft((current) => current.filter((item) => item !== species))
  }

  const onAddCreateSpecies = () => {
    if (!createSpeciesToAdd || createSpeciesDraft.includes(createSpeciesToAdd)) {
      return
    }
    setCreatePackageDraftTouched(true)
    setCreateSpeciesDraft((current) => [...current, createSpeciesToAdd])
    setCreateSpeciesToAdd('')
  }

  const onRemoveCreateSpecies = (species: string) => {
    setCreatePackageDraftTouched(true)
    setCreateSpeciesDraft((current) => current.filter((item) => item !== species))
  }

  const resetSelectedPackageDrafts = () => {
    setPackageForm(packageBaselineForm)
    setSpeciesDraft(packageSpeciesBaseline)
    setSpeciesToAdd('')
    setPackageDraftTouched(false)
    setScaleForm(emptyScaleForm)
    setScaleActionErrorMessage('')
    setShowScaleValidationErrors(false)
    setScaleDraftTouched(false)
    setTouchedItemFields({})
    setShowPackageValidationErrors(false)
  }

  const resetCreatePackageDraft = () => {
    setCreatePackageForm(emptyPackageForm(productTypeCode))
    setCreateSpeciesDraft([])
    setCreateSpeciesToAdd('')
    setCreatePackageDraftTouched(false)
    setTouchedItemFields({})
    setShowCreatePackageValidationErrors(false)
  }

  const resetScaleDraft = () => {
    setScaleForm(emptyScaleForm)
    setScaleActionErrorMessage('')
    setScaleDraftTouched(false)
    setTouchedItemFields({})
    setShowScaleValidationErrors(false)
  }

  const selectedPackageTotalPieces = scales.reduce((total, row) => total + row.pieces, 0)
  const selectedPackageHasPermittedScale = scales.some((row) => row.permitted)
  const referenceOptionsLoading =
    authoritativeOptionsAvailability === 'loading' || baseReferenceOptionsAvailability === 'loading'
  const referenceOptionsUnavailable =
    authoritativeOptionsAvailability === 'unavailable' ||
    baseReferenceOptionsAvailability === 'unavailable' ||
    dependentReferenceOptionsUnavailable
  const referenceOptionsAvailable = !referenceOptionsLoading && !referenceOptionsUnavailable
  const canSaveSelectedPackage =
    canEditPackages &&
    referenceOptionsAvailable &&
    packageDataLoaded &&
    !!selectedPackageNumber &&
    !isSavingPackage &&
    !selectedPackageHasPermittedScale
  const canCreatePackages = canAddPackages && referenceOptionsAvailable
  const canAddScalesWithReferenceOptions = canAddScales && referenceOptionsAvailable
  const canDeleteSelectedPackage =
    canAddPackages &&
    packageDataLoaded &&
    !!selectedPackageNumber &&
    !isSavingPackage &&
    !selectedPackageDraftDirty &&
    !scaleDraftDirty &&
    !selectedPackageHasPermittedScale &&
    selectedPackageTotalPieces === 0

  const buildPackageMutation = (form: PackageFormState, packageNumber: string) => ({
    packageNumber,
    newPackageNumber: form.newPackageNumber || packageNumber,
    applicationNumber,
    volume: form.volume,
    averageLength: form.averageLength,
    averageDiameter: form.averageDiameter,
    status: form.status,
    comments: form.comments,
    reprocessed: form.reprocessed,
    ageClass: form.ageClass,
    productType: form.productType || productTypeCode,
    endUseCode: form.endUseCode,
    speciesCodes: speciesDraft,
  })

  const onSaveSelectedPackage = async () => {
    if (!canSaveSelectedPackage) {
      return
    }

    if (
      packageForm.newPackageNumber.trim() !== selectedPackageNumber.trim() &&
      !canUpdatePackageNumber
    ) {
      setItemsErrorMessage('Package number changes are not allowed for this application.')
      return
    }

    if (selectedPackageHasPermittedScale) {
      setItemsErrorMessage('Package changes are not allowed after a scale has been permitted.')
      return
    }

    if (hasPackageValidationError) {
      setShowPackageValidationErrors(true)
      setItemsErrorMessage(
        firstItemError(
          'packageNewPackageNumber',
          'packageVolume',
          'packageAverageLength',
          'packageAverageDiameter',
          'packageStatus',
          'packageProductType',
          'packageAgeClass',
        ) ?? 'Please fix validation errors before saving the package.',
      )
      return
    }

    setIsSavingPackage(true)
    setItemsErrorMessage('')
    setItemsInfoMessage('')
    try {
      const result = await updateApplicationPackage(
        buildPackageMutation(packageForm, selectedPackageNumber),
      )
      if (!result.valid) {
        setItemsErrorMessage(result.errors.join(' ') || 'Package update failed.')
        return
      }

      const nextPackageNumber =
        result.packageNumber || packageForm.newPackageNumber || selectedPackageNumber
      dispatchPackageSelection({
        type: 'rename',
        previousPackageNumber: selectedPackageNumber,
        nextPackageNumber,
      })
      setItemsInfoMessage(`Package ${nextPackageNumber} saved.`)
      await onDetailChanged()
      await loadApplicationScaleSummary()
      await loadPackageItems(nextPackageNumber)
    } catch {
      setItemsErrorMessage('Unable to save package details.')
    } finally {
      setIsSavingPackage(false)
    }
  }

  const onCreatePackage = async () => {
    if (!canCreatePackages) {
      return
    }

    if (hasCreatePackageValidationError) {
      setShowCreatePackageValidationErrors(true)
      setItemsErrorMessage(
        firstItemError(
          'createPackageNumber',
          'createPackageVolume',
          'createPackageAverageLength',
          'createPackageAverageDiameter',
          'createPackageStatus',
          'createPackageProductType',
          'createPackageAgeClass',
        ) ?? 'Please fix validation errors before creating the package.',
      )
      return
    }

    setIsSavingPackage(true)
    setItemsErrorMessage('')
    setItemsInfoMessage('')
    try {
      const result = await addApplicationPackage({
        packageNumber: createPackageForm.packageNumber,
        applicationNumber,
        volume: createPackageForm.volume,
        averageLength: createPackageForm.averageLength,
        averageDiameter: createPackageForm.averageDiameter,
        status: createPackageForm.status,
        comments: createPackageForm.comments,
        reprocessed: createPackageForm.reprocessed,
        ageClass: createPackageForm.ageClass,
        productType: createPackageForm.productType || productTypeCode,
        endUseCode: createPackageForm.endUseCode,
        speciesCodes: createSpeciesDraft,
      })
      if (!result.valid) {
        setItemsErrorMessage(result.errors.join(' ') || 'Package creation failed.')
        return
      }

      const nextPackageNumber = result.packageNumber || createPackageForm.packageNumber
      dispatchPackageSelection({ type: 'add', packageNumber: nextPackageNumber })
      resetCreatePackageDraft()
      setItemsInfoMessage(`Package ${nextPackageNumber} created.`)
      await onDetailChanged()
      await loadApplicationScaleSummary()
      await loadPackageItems(nextPackageNumber)
    } catch {
      setItemsErrorMessage('Unable to create package.')
    } finally {
      setIsSavingPackage(false)
    }
  }

  const onDeleteSelectedPackage = async () => {
    if (!canAddPackages || !packageDataLoaded || !selectedPackageNumber) {
      return
    }

    if (selectedPackageHasPermittedScale) {
      setItemsErrorMessage('Package delete is not allowed after a scale has been permitted.')
      return
    }

    if (selectedPackageTotalPieces > 0) {
      setItemsErrorMessage('Package delete is not allowed after scale pieces have been added.')
      return
    }

    setIsSavingPackage(true)
    setItemsErrorMessage('')
    setItemsInfoMessage('')
    try {
      const result = await deleteApplicationPackage(selectedPackageNumber, applicationNumber)
      if (!result.success) {
        setItemsErrorMessage('Package delete failed.')
        return
      }

      const deletedPackageNumber = selectedPackageNumber
      dispatchPackageSelection({ type: 'delete', packageNumber: deletedPackageNumber })
      setItemsInfoMessage(`Package ${deletedPackageNumber} deleted.`)
      await onDetailChanged()
      await loadApplicationScaleSummary()
    } catch {
      setItemsErrorMessage('Unable to delete package.')
    } finally {
      setIsSavingPackage(false)
    }
  }

  const onAddScale = async () => {
    if (!canAddScalesWithReferenceOptions || !packageDataLoaded || !selectedPackageNumber) {
      return
    }

    setScaleActionErrorMessage('')
    if (hasScaleValidationError) {
      const message =
        firstItemError(
          'scaleTimberMark',
          'scaleSpeciesCode',
          'scaleGradeCode',
          'scalePieces',
          'scaleVolume',
        ) ?? 'Please fix validation errors before adding the scale.'
      setShowScaleValidationErrors(true)
      setItemsErrorMessage(message)
      setScaleActionErrorMessage(message)
      return
    }

    setIsSavingScale(true)
    setItemsErrorMessage('')
    setItemsInfoMessage('')
    try {
      const result = await addApplicationScaleToPackage({
        timberMark: scaleForm.timberMark,
        packageNumber: selectedPackageNumber,
        gradeCode: scaleForm.gradeCode,
        speciesCode: scaleForm.speciesCode,
        applicationNumber,
        pieces: scaleForm.pieces,
        volume: scaleForm.volume,
      })
      if (!result.valid || !result.result) {
        const message = result.errors.join(' ') || 'Scale creation failed.'
        setItemsErrorMessage(message)
        setScaleActionErrorMessage(message)
        return
      }

      setScales((current) => [...current, result.result as ApplicationPackageScaleRow])
      resetScaleDraft()
      setItemsInfoMessage(`Scale ${result.result.id} added.`)
      setScaleLookupResult('')
      await loadApplicationScaleSummary()
      await loadPackageItems(selectedPackageNumber)
    } catch {
      setItemsErrorMessage('Unable to add scale.')
      setScaleActionErrorMessage('Unable to add scale.')
    } finally {
      setIsSavingScale(false)
    }
  }

  const onDeleteScale = async (scaleId: string) => {
    if (!canAddScales || !packageDataLoaded) {
      return
    }

    setDeletingScaleId(scaleId)
    setItemsErrorMessage('')
    setItemsInfoMessage('')
    try {
      const result = await deleteApplicationScale(scaleId, applicationNumber)
      if (!result.success) {
        setItemsErrorMessage('Scale delete failed.')
        return
      }
      setScales((current) => current.filter((item) => item.id !== scaleId))
      setItemsInfoMessage(`Scale ${scaleId} deleted.`)
      setScaleLookupResult('')
      await loadApplicationScaleSummary()
      await loadPackageItems(selectedPackageNumber)
    } catch {
      setItemsErrorMessage('Unable to delete scale.')
    } finally {
      setDeletingScaleId('')
    }
  }

  const onLookupScale = async () => {
    const lookupValue = scaleLookupId.trim()
    if (!lookupValue) {
      return
    }
    setItemsErrorMessage('')
    setItemsInfoMessage('')
    setScaleLookupResult('')

    const normalizedLookupValue = lookupValue.toUpperCase()
    const matchingTimberMarkRows = scales.filter(
      (row) => row.timberMark.trim().toUpperCase() === normalizedLookupValue,
    )
    if (matchingTimberMarkRows.length > 0) {
      setScaleLookupResult(
        `Found ${matchingTimberMarkRows.length} scale row${
          matchingTimberMarkRows.length === 1 ? '' : 's'
        } for timber mark ${lookupValue}: ${matchingTimberMarkRows
          .map(formatScaleLookupResult)
          .join('; ')}`,
      )
      return
    }

    try {
      const result = await fetchApplicationScaleDetails(lookupValue)
      if (!result.success) {
        setScaleLookupResult('Scale not found.')
        return
      }
      setScaleLookupResult(formatScaleLookupResult(result))
    } catch {
      setItemsErrorMessage('Unable to look up scale.')
    }
  }

  const selectedSpeciesOptions = speciesDraft.map((species) => {
    const known = speciesOptions.find((option) => option.code === species)
    return {
      code: species,
      description: known?.description ?? species,
    }
  })
  const selectedCreateSpeciesOptions = createSpeciesDraft.map((species) => {
    const known = speciesOptions.find((option) => option.code === species)
    return {
      code: species,
      description: known?.description ?? species,
    }
  })
  const scaleSpeciesOptions =
    selectedSpeciesOptions.length > 0 ? selectedSpeciesOptions : speciesOptions
  const selectedPackageStatusOptions = optionsWithCurrentCode(
    packageStatusOptions,
    packageForm.status,
  )
  const createPackageStatusOptions = optionsWithCurrentCode(
    packageStatusOptions,
    createPackageForm.status,
  )
  const selectedPackageProductTypeOptions = optionsWithCurrentCode(
    productTypeOptions,
    packageForm.productType,
  )
  const selectedPackageGrowthTypeOptions = optionsWithCurrentCode(
    growthTypeOptions,
    packageForm.ageClass,
  )
  const createPackageProductTypeOptions = optionsWithCurrentCode(
    productTypeOptions,
    createPackageForm.productType,
  )
  const createPackageGrowthTypeOptions = optionsWithCurrentCode(
    growthTypeOptions,
    createPackageForm.ageClass,
  )
  const applicationTotalPieces = detail.packages.reduce(
    (total, packageItem) => total + packageItem.pieceCount,
    0,
  )

  return (
    <Tile id="application-items" className="application-detail-section application-items-panel">
      <header className="application-items-panel__header">
        <h2 className="detail-tile-title application-items-panel__title">
          <Box size={20} aria-hidden="true" />
          <span>Items</span>
        </h2>
      </header>
      {itemsLoading && <InlineLoading description="Loading item data..." />}
      {referenceOptionsLoading && (canEditPackages || canAddPackages || canAddScales) && (
        <InlineLoading description="Loading authoritative item options..." />
      )}
      {referenceOptionsUnavailable && (canEditPackages || canAddPackages || canAddScales) && (
        <AppNotification
          kind="warning"
          title="Item options unavailable"
          subtitle="Package saves, package creation, and scale additions are disabled because authoritative Oracle options could not be verified."
          lowContrast
        />
      )}
      {!!itemsErrorMessage && (
        <AppNotification
          kind="error"
          title="Item action failed"
          subtitle={itemsErrorMessage}
          lowContrast
          onCloseButtonClick={() => setItemsErrorMessage('')}
        />
      )}
      {!!itemsInfoMessage && (
        <AppNotification
          kind="success"
          title="Item action completed"
          subtitle={itemsInfoMessage}
          lowContrast
          onCloseButtonClick={() => setItemsInfoMessage('')}
        />
      )}

      <dl className="application-items-metric-strip" aria-label="Application item summary">
        {[
          ['Application Total Pieces', applicationTotalPieces.toLocaleString()],
          ['Packages', packageNumbers.length.toLocaleString()],
          ['Selected Package Number', selectedPackageNumber || 'None selected'],
          ['Selected Scale Volume', packageForm.scaledVolume || 'Not provided'],
        ].map(([label, value]) => (
          <div key={label} className="application-items-metric">
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      <div className="application-items-grid">
        <section className="application-items-section application-items-section--package-details">
          <div className="application-items-section-header">
            <h3>Package Details</h3>
            <SearchableSelect
              id="applicationItemsPackageSelect"
              labelText="Selected Package"
              value={selectedPackageNumber}
              placeholder="Select package"
              options={packageNumbers.map((packageNumber) => ({
                value: packageNumber,
                label: packageNumber,
              }))}
              onChange={requestPackageSelection}
            />
          </div>
          <dl className="detail-field-grid application-items-summary">
            {[
              ['Package Number', selectedPackageNumber || 'None selected'],
              ['Package Volume', packageForm.volume || 'Not provided'],
              ['Total Scale Volume', packageForm.scaledVolume || 'Not provided'],
              ['Total Pieces', selectedPackageTotalPieces.toLocaleString()],
            ].map(([label, value]) => (
              <div key={label} className="detail-field-item">
                <dt className="detail-field-label">{label}</dt>
                <dd className="detail-field-value">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="application-items-package-workspace">
            <div className="application-items-package-edit-panel">
              <div className="application-items-form">
                <TextInput
                  id="applicationItemsPackageNumber"
                  labelText="Package Number"
                  value={packageForm.newPackageNumber}
                  disabled={!canSaveSelectedPackage || !canUpdatePackageNumber}
                  invalid={!!packageFieldError('packageNewPackageNumber')}
                  invalidText={packageFieldError('packageNewPackageNumber')}
                  onBlur={() => markItemFieldTouched('packageNewPackageNumber')}
                  onChange={(event) => setPackageField('newPackageNumber', event.target.value)}
                />
                <TextInput
                  id="applicationItemsPackageVolume"
                  labelText="Package Volume"
                  value={packageForm.volume}
                  disabled={!canSaveSelectedPackage}
                  invalid={!!packageFieldError('packageVolume')}
                  invalidText={packageFieldError('packageVolume')}
                  onBlur={() => markItemFieldTouched('packageVolume')}
                  onChange={(event) => setPackageField('volume', event.target.value)}
                />
                <TextInput
                  id="applicationItemsPackageLength"
                  labelText="Average Length"
                  value={packageForm.averageLength}
                  disabled={!canSaveSelectedPackage}
                  invalid={!!packageFieldError('packageAverageLength')}
                  invalidText={packageFieldError('packageAverageLength')}
                  onBlur={() => markItemFieldTouched('packageAverageLength')}
                  onChange={(event) => setPackageField('averageLength', event.target.value)}
                />
                <TextInput
                  id="applicationItemsPackageDiameter"
                  labelText="Average Diameter"
                  value={packageForm.averageDiameter}
                  disabled={!canSaveSelectedPackage}
                  invalid={!!packageFieldError('packageAverageDiameter')}
                  invalidText={packageFieldError('packageAverageDiameter')}
                  onBlur={() => markItemFieldTouched('packageAverageDiameter')}
                  onChange={(event) => setPackageField('averageDiameter', event.target.value)}
                />
                <SearchableSelect
                  id="applicationItemsPackageStatus"
                  labelText="Status Code"
                  value={packageForm.status}
                  disabled={!canSaveSelectedPackage}
                  invalid={!!packageFieldError('packageStatus')}
                  invalidText={packageFieldError('packageStatus')}
                  placeholder="Select package status"
                  options={selectedPackageStatusOptions.map(toSearchableOption)}
                  onBlur={() => markItemFieldTouched('packageStatus')}
                  onChange={(value) => setPackageField('status', value)}
                />
                <SearchableSelect
                  id="applicationItemsPackageProductType"
                  labelText="Product Type"
                  value={packageForm.productType}
                  disabled={!canSaveSelectedPackage}
                  invalid={!!packageFieldError('packageProductType')}
                  invalidText={packageFieldError('packageProductType')}
                  placeholder="Select product type"
                  options={selectedPackageProductTypeOptions.map(toSearchableOption)}
                  onBlur={() => markItemFieldTouched('packageProductType')}
                  onChange={(value) => {
                    setPackageDraftTouched(true)
                    setPackageForm((current) => ({
                      ...current,
                      productType: value,
                      ageClass: packageRequiresAgeClass(value) ? current.ageClass : '',
                    }))
                  }}
                />
                <SearchableSelect
                  id="applicationItemsPackageAgeClass"
                  labelText="Age Class"
                  value={packageForm.ageClass}
                  disabled={
                    !canSaveSelectedPackage || !packageRequiresAgeClass(packageForm.productType)
                  }
                  invalid={!!packageFieldError('packageAgeClass')}
                  invalidText={packageFieldError('packageAgeClass')}
                  placeholder="Select age class"
                  options={selectedPackageGrowthTypeOptions.map(toSearchableOption)}
                  onBlur={() => markItemFieldTouched('packageAgeClass')}
                  onChange={(value) => setPackageField('ageClass', value)}
                />
                <SearchableSelect
                  id="applicationItemsPackageReprocessed"
                  labelText="Reprocessed"
                  value={packageForm.reprocessed}
                  disabled={!canSaveSelectedPackage}
                  placeholder="Select reprocessed status"
                  options={[
                    { value: 'N', label: 'No' },
                    { value: 'Y', label: 'Yes' },
                  ]}
                  onChange={(value) => setPackageField('reprocessed', value)}
                />
                <TextInput
                  id="applicationItemsPackageEndUse"
                  labelText="End Use"
                  value={packageForm.endUseCode}
                  disabled={!canSaveSelectedPackage || endUseOptions.length > 0}
                  onChange={(event) => setPackageField('endUseCode', event.target.value)}
                />
                {endUseOptions.length > 0 && (
                  <SearchableSelect
                    id="applicationItemsPackageEndUseSelect"
                    labelText="End Use Options"
                    value={packageForm.endUseCode}
                    disabled={!canSaveSelectedPackage}
                    placeholder="Select end use"
                    options={endUseOptions.map(toSearchableOption)}
                    onChange={(value) => setPackageField('endUseCode', value)}
                  />
                )}
              </div>
              <TextArea
                id="applicationItemsPackageComments"
                labelText="Package Comments"
                value={packageForm.comments}
                disabled={!canSaveSelectedPackage}
                onChange={(event) => setPackageField('comments', event.target.value)}
              />
              <div className="legacy-search-actions">
                <Button
                  kind="primary"
                  size="sm"
                  disabled={!canSaveSelectedPackage}
                  onClick={() => void onSaveSelectedPackage()}
                >
                  Save Package
                </Button>
                <Button
                  kind="secondary"
                  size="sm"
                  disabled={!selectedPackageDraftDirty && !scaleDraftDirty}
                  onClick={resetSelectedPackageDrafts}
                >
                  Reset package drafts
                </Button>
                <Button
                  kind="danger--ghost"
                  size="sm"
                  disabled={!canDeleteSelectedPackage}
                  onClick={() => void onDeleteSelectedPackage()}
                >
                  Delete Package
                </Button>
              </div>
            </div>

            <div className="application-items-species-panel">
              <h4>Package Species</h4>
              <div className="application-items-inline-form">
                <SearchableSelect
                  id="applicationItemsSpeciesToAdd"
                  labelText="Species"
                  value={speciesToAdd}
                  disabled={!canSaveSelectedPackage}
                  placeholder="Select species"
                  options={remainingSpeciesOptions
                    .filter((option) => !speciesDraft.includes(option.code))
                    .map(toSearchableOption)}
                  onChange={setSpeciesToAdd}
                />
                <Button
                  kind="secondary"
                  size="sm"
                  disabled={!canSaveSelectedPackage || !speciesToAdd}
                  onClick={onAddSpecies}
                >
                  Add Species
                </Button>
              </div>
              <div className="application-items-table-scroll">
                <Table useZebraStyles>
                  <TableHead>
                    <TableRow>
                      <TableHeader>Species</TableHeader>
                      <TableHeader>End use</TableHeader>
                      <TableHeader>Action</TableHeader>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {selectedSpeciesOptions.map((row) => {
                      const existing = packageSpeciesRows.find((item) => item.species === row.code)
                      return (
                        <TableRow key={row.code}>
                          <TableCell>{asOptionText(row)}</TableCell>
                          <TableCell>
                            {existing?.endUseDescription || packageForm.endUseCode || '-'}
                          </TableCell>
                          <TableCell>
                            <Button
                              kind="ghost"
                              size="sm"
                              disabled={!canSaveSelectedPackage}
                              onClick={() => onRemoveSpecies(row.code)}
                            >
                              Remove
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                    {speciesDraft.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={3}>No species assigned to this package.</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="application-items-timber-marks-panel">
              <h4>Timber Marks</h4>
              <div className="application-items-table-scroll">
                <Table useZebraStyles>
                  <TableHead>
                    <TableRow>
                      <TableHeader>Timber mark</TableHeader>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {applicationScaleRows.map((row) => (
                      <TableRow key={row.timberMark}>
                        <TableCell>{row.timberMark}</TableCell>
                      </TableRow>
                    ))}
                    {applicationScaleRows.length === 0 && (
                      <TableRow>
                        <TableCell>No timber marks have been added to this application.</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        </section>

        <section className="application-items-section application-items-section--create-package">
          <h3>Create Package</h3>
          <div className="application-items-form">
            <TextInput
              id="applicationItemsCreatePackageNumber"
              labelText="Package Number"
              value={createPackageForm.packageNumber}
              disabled={!canCreatePackages}
              invalid={!!createPackageFieldError('createPackageNumber')}
              invalidText={createPackageFieldError('createPackageNumber')}
              onBlur={() => markItemFieldTouched('createPackageNumber')}
              onChange={(event) => setCreatePackageField('packageNumber', event.target.value)}
            />
            <TextInput
              id="applicationItemsCreatePackageVolume"
              labelText="Package Volume"
              value={createPackageForm.volume}
              disabled={!canCreatePackages}
              invalid={!!createPackageFieldError('createPackageVolume')}
              invalidText={createPackageFieldError('createPackageVolume')}
              onBlur={() => markItemFieldTouched('createPackageVolume')}
              onChange={(event) => setCreatePackageField('volume', event.target.value)}
            />
            <TextInput
              id="applicationItemsCreatePackageLength"
              labelText="Average Length"
              value={createPackageForm.averageLength}
              disabled={!canCreatePackages}
              invalid={!!createPackageFieldError('createPackageAverageLength')}
              invalidText={createPackageFieldError('createPackageAverageLength')}
              onBlur={() => markItemFieldTouched('createPackageAverageLength')}
              onChange={(event) => setCreatePackageField('averageLength', event.target.value)}
            />
            <TextInput
              id="applicationItemsCreatePackageDiameter"
              labelText="Average Diameter"
              value={createPackageForm.averageDiameter}
              disabled={!canCreatePackages}
              invalid={!!createPackageFieldError('createPackageAverageDiameter')}
              invalidText={createPackageFieldError('createPackageAverageDiameter')}
              onBlur={() => markItemFieldTouched('createPackageAverageDiameter')}
              onChange={(event) => setCreatePackageField('averageDiameter', event.target.value)}
            />
            <SearchableSelect
              id="applicationItemsCreatePackageStatus"
              labelText="Status Code"
              value={createPackageForm.status}
              disabled={!canCreatePackages}
              invalid={!!createPackageFieldError('createPackageStatus')}
              invalidText={createPackageFieldError('createPackageStatus')}
              placeholder="Select package status"
              options={createPackageStatusOptions.map(toSearchableOption)}
              onBlur={() => markItemFieldTouched('createPackageStatus')}
              onChange={(value) => setCreatePackageField('status', value)}
            />
            <SearchableSelect
              id="applicationItemsCreatePackageProductType"
              labelText="Product Type"
              value={createPackageForm.productType}
              disabled={!canCreatePackages}
              invalid={!!createPackageFieldError('createPackageProductType')}
              invalidText={createPackageFieldError('createPackageProductType')}
              placeholder="Select product type"
              options={createPackageProductTypeOptions.map(toSearchableOption)}
              onBlur={() => markItemFieldTouched('createPackageProductType')}
              onChange={(value) => {
                setCreatePackageDraftTouched(true)
                setCreatePackageForm((current) => ({
                  ...current,
                  productType: value,
                  ageClass: packageRequiresAgeClass(value) ? current.ageClass : '',
                }))
              }}
            />
            <SearchableSelect
              id="applicationItemsCreatePackageAgeClass"
              labelText="Age Class"
              value={createPackageForm.ageClass}
              disabled={
                !canCreatePackages || !packageRequiresAgeClass(createPackageForm.productType)
              }
              invalid={!!createPackageFieldError('createPackageAgeClass')}
              invalidText={createPackageFieldError('createPackageAgeClass')}
              placeholder="Select age class"
              options={createPackageGrowthTypeOptions.map(toSearchableOption)}
              onBlur={() => markItemFieldTouched('createPackageAgeClass')}
              onChange={(value) => setCreatePackageField('ageClass', value)}
            />
            <TextInput
              id="applicationItemsCreatePackageEndUse"
              labelText="End Use"
              value={createPackageForm.endUseCode}
              disabled={!canCreatePackages || createEndUseOptions.length > 0}
              onChange={(event) => setCreatePackageField('endUseCode', event.target.value)}
            />
            {createEndUseOptions.length > 0 && (
              <SearchableSelect
                id="applicationItemsCreatePackageEndUseSelect"
                labelText="End Use Options"
                value={createPackageForm.endUseCode}
                disabled={!canCreatePackages}
                placeholder="Select end use"
                options={createEndUseOptions.map(toSearchableOption)}
                onChange={(value) => setCreatePackageField('endUseCode', value)}
              />
            )}
          </div>
          <div className="application-items-inline-form">
            <SearchableSelect
              id="applicationItemsCreateSpeciesToAdd"
              labelText="Create Package Species"
              value={createSpeciesToAdd}
              disabled={!canCreatePackages}
              placeholder="Select species"
              options={createRemainingSpeciesOptions
                .filter((option) => !createSpeciesDraft.includes(option.code))
                .map(toSearchableOption)}
              onChange={setCreateSpeciesToAdd}
            />
            <Button
              kind="secondary"
              size="sm"
              aria-label="Add species to new package"
              disabled={!canCreatePackages || !createSpeciesToAdd}
              onClick={onAddCreateSpecies}
            >
              Add Species
            </Button>
          </div>
          <div className="application-items-table-scroll">
            <Table useZebraStyles>
              <TableHead>
                <TableRow>
                  <TableHeader>Species</TableHeader>
                  <TableHeader>Action</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {selectedCreateSpeciesOptions.map((row) => (
                  <TableRow key={row.code}>
                    <TableCell>{asOptionText(row)}</TableCell>
                    <TableCell>
                      <Button
                        kind="ghost"
                        size="sm"
                        disabled={!canCreatePackages}
                        onClick={() => onRemoveCreateSpecies(row.code)}
                      >
                        Remove
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {createSpeciesDraft.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={2}>No species selected for the new package.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <div className="legacy-search-actions">
            <Button
              kind="secondary"
              size="sm"
              disabled={!canCreatePackages || isSavingPackage}
              onClick={() => void onCreatePackage()}
            >
              Create Package
            </Button>
            <Button
              kind="ghost"
              size="sm"
              disabled={!createPackageDraftDirty}
              onClick={resetCreatePackageDraft}
            >
              Reset new package
            </Button>
          </div>
        </section>

        <section
          id="application-items-scales"
          ref={scalesSectionRef}
          className="application-items-section application-items-section--scales"
        >
          <h3>Scales</h3>
          <div className="application-items-form">
            <TextInput
              id="applicationItemsScaleTimberMark"
              labelText="Timber Mark"
              value={scaleForm.timberMark}
              disabled={
                !canAddScalesWithReferenceOptions || !packageDataLoaded || !selectedPackageNumber
              }
              invalid={!!scaleFieldError('scaleTimberMark')}
              invalidText={scaleFieldError('scaleTimberMark')}
              onBlur={() => markItemFieldTouched('scaleTimberMark')}
              onChange={(event) => setScaleField('timberMark', event.target.value)}
            />
            <SearchableSelect
              id="applicationItemsScaleSpecies"
              labelText="Species"
              value={scaleForm.speciesCode}
              disabled={
                !canAddScalesWithReferenceOptions || !packageDataLoaded || !selectedPackageNumber
              }
              invalid={!!scaleFieldError('scaleSpeciesCode')}
              invalidText={scaleFieldError('scaleSpeciesCode')}
              placeholder="Select species"
              options={scaleSpeciesOptions.map(toSearchableOption)}
              onBlur={() => markItemFieldTouched('scaleSpeciesCode')}
              onChange={(value) => setScaleField('speciesCode', value)}
            />
            <SearchableSelect
              id="applicationItemsScaleGrade"
              labelText="Grade"
              value={scaleForm.gradeCode}
              disabled={
                !canAddScalesWithReferenceOptions || !packageDataLoaded || !selectedPackageNumber
              }
              invalid={!!scaleFieldError('scaleGradeCode')}
              invalidText={scaleFieldError('scaleGradeCode')}
              placeholder="Select grade"
              options={gradeOptions.map(toSearchableOption)}
              onBlur={() => markItemFieldTouched('scaleGradeCode')}
              onChange={(value) => setScaleField('gradeCode', value)}
            />
            <TextInput
              id="applicationItemsScalePieces"
              labelText="Pieces"
              value={scaleForm.pieces}
              disabled={
                !canAddScalesWithReferenceOptions || !packageDataLoaded || !selectedPackageNumber
              }
              invalid={!!scaleFieldError('scalePieces')}
              invalidText={scaleFieldError('scalePieces')}
              onBlur={() => markItemFieldTouched('scalePieces')}
              onChange={(event) => setScaleField('pieces', event.target.value)}
            />
            <TextInput
              id="applicationItemsScaleVolume"
              labelText="Scale Volume"
              value={scaleForm.volume}
              disabled={
                !canAddScalesWithReferenceOptions || !packageDataLoaded || !selectedPackageNumber
              }
              invalid={!!scaleFieldError('scaleVolume')}
              invalidText={scaleFieldError('scaleVolume')}
              onBlur={() => markItemFieldTouched('scaleVolume')}
              onChange={(event) => setScaleField('volume', event.target.value)}
            />
          </div>
          <div className="legacy-search-actions">
            <Button
              type="button"
              kind="secondary"
              size="sm"
              disabled={
                !canAddScalesWithReferenceOptions ||
                !packageDataLoaded ||
                !selectedPackageNumber ||
                isSavingScale
              }
              onClick={() => void onAddScale()}
            >
              Add Scale
            </Button>
            <Button kind="ghost" size="sm" disabled={!scaleDraftDirty} onClick={resetScaleDraft}>
              Reset scale
            </Button>
          </div>
          {!!scaleActionErrorMessage && (
            <p className="application-items-inline-error" role="alert">
              {scaleActionErrorMessage}
            </p>
          )}
          <div className="application-items-inline-form">
            <TextInput
              id="applicationItemsScaleLookup"
              labelText="Scale ID or timber mark"
              value={scaleLookupId}
              onChange={(event) => {
                setScaleLookupId(event.target.value)
                setScaleLookupResult('')
              }}
            />
            <Button type="button" kind="ghost" size="sm" onClick={() => void onLookupScale()}>
              Lookup Scale
            </Button>
          </div>
          {scaleLookupResult && <p className="detail-field-value">{scaleLookupResult}</p>}
          <div className="application-items-table-scroll application-items-table-scroll--scales">
            <Table useZebraStyles>
              <TableHead>
                <TableRow>
                  <TableHeader>Timber mark</TableHeader>
                  <TableHeader>Scale Type</TableHeader>
                  <TableHeader>Species</TableHeader>
                  <TableHeader>Grade</TableHeader>
                  <TableHeader>Pieces</TableHeader>
                  <TableHeader>Volume</TableHeader>
                  <TableHeader>Action</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {scales.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.timberMark}</TableCell>
                    <TableCell>{row.cascadeSplitCode || '-'}</TableCell>
                    <TableCell>{row.species}</TableCell>
                    <TableCell>{row.grade}</TableCell>
                    <TableCell>{row.pieces.toLocaleString()}</TableCell>
                    <TableCell>{row.volume}</TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        kind="danger--ghost"
                        size="sm"
                        disabled={
                          !canAddScales ||
                          !packageDataLoaded ||
                          deletingScaleId === row.id ||
                          row.permitted
                        }
                        onClick={() => void onDeleteScale(row.id)}
                      >
                        {deletingScaleId === row.id ? 'Deleting...' : 'Delete'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {scales.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7}>No scales assigned to this package.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </section>
      </div>
      <ConfirmationModal
        open={!!pendingPackageSelection}
        title="Discard package drafts?"
        description="Changing packages will discard unsaved package, species, and scale values for the current package."
        confirmLabel="Discard and switch"
        danger
        onConfirm={() => {
          const nextPackageNumber = pendingPackageSelection
          resetSelectedPackageDrafts()
          setPendingPackageSelection('')
          dispatchPackageSelection({ type: 'select', packageNumber: nextPackageNumber })
        }}
        onClose={() => setPendingPackageSelection('')}
      />
    </Tile>
  )
}

export default ProvincialApplicationItemsPanel
