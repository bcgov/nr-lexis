import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react'
import {
  Button,
  Dropdown,
  InlineLoading,
  InlineNotification,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TextArea,
  TextInput,
} from '@carbon/react'
import { Add, Box, Edit, TrashCan } from '@carbon/icons-react'
import { Archive } from '@carbon/pictograms-react'
import { ActionResultNotification } from '../../components/ActionResultNotification'
import { AppNotification } from '../../components/AppNotification'
import ConfirmationModal from '../../components/ConfirmationModal'
import { useDiscardPrompt } from '../../components/DiscardChangesModal'
import { focusFirstEditableFieldAfterPanelChange } from '@/utils/focus'
import EmptyState from '../../components/EmptyState'
import DetailSidePanel from '../../components/DetailSidePanel'
import PendingIcon from '../../components/PendingIcon'
import SearchableSelect from '../../components/SearchableSelect'
import type { ProvincialApplicationDetail } from '@/interfaces/LexisDetails'
import {
  atMostOneDecimalFieldError,
  atMostTwoDecimalFieldError,
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
  fetchApplicationSpeciesCodes,
  fetchApplicationUniqueScales,
  updateApplicationPackage,
  type ApplicationCodeOption,
  type ApplicationPackageDetails,
  type ApplicationPackageScaleRow,
  type ApplicationScaleSummaryRow,
  type ApplicationPackageSpeciesRow,
} from '@/service/provincial-application-items-service'
import { withoutActionError, type ActionResult } from '@/utils/action-result'
import { fieldErrorText } from '@/utils/field-error'
import { markRequired, requiredLabel } from '@/utils/required-label'
import RequiredFieldsLegend from '@/components/RequiredFieldsLegend'
import { displayTableValue, formatPackageNumberLabel } from '@/utils/text'
import './ApplicationItemsPanel.scss'
import { formatVolume } from '@/utils/volume'

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

type DependentOptionsAvailability = 'idle' | 'loading' | 'available' | 'unavailable'

type PackageDataAvailability = {
  details: boolean
  species: boolean
  scales: boolean
}

const unavailablePackageData: PackageDataAvailability = {
  details: false,
  species: false,
  scales: false,
}

const displayScaleType = (cascadeSplitCode: string): string => {
  switch (cascadeSplitCode.trim().toUpperCase()) {
    case 'W':
      return 'C'
    case 'E':
      return 'I'
    default:
      return '-'
  }
}

type ApplicationItemField =
  | 'packageNewPackageNumber'
  | 'packageComments'
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
  | 'createPackageComments'
  | 'scaleTimberMark'
  | 'scaleSpeciesCode'
  | 'scaleGradeCode'
  | 'scalePieces'
  | 'scaleVolume'

const CREATE_PACKAGE_INPUT_FIELDS: Partial<Record<keyof PackageFormState, ApplicationItemField>> = {
  packageNumber: 'createPackageNumber',
  volume: 'createPackageVolume',
  averageLength: 'createPackageAverageLength',
  averageDiameter: 'createPackageAverageDiameter',
  comments: 'createPackageComments',
}

const EDIT_PACKAGE_INPUT_FIELDS: Partial<Record<keyof PackageFormState, ApplicationItemField>> = {
  newPackageNumber: 'packageNewPackageNumber',
  volume: 'packageVolume',
  averageLength: 'packageAverageLength',
  averageDiameter: 'packageAverageDiameter',
  comments: 'packageComments',
  productType: 'packageProductType',
  ageClass: 'packageAgeClass',
}

const SCALE_INPUT_FIELDS: Record<keyof ScaleFormState, ApplicationItemField> = {
  timberMark: 'scaleTimberMark',
  speciesCode: 'scaleSpeciesCode',
  gradeCode: 'scaleGradeCode',
  pieces: 'scalePieces',
  volume: 'scaleVolume',
}

const DUPLICATE_SCALE_MESSAGE = 'A scale with this timber mark, species, and grade already exists.'

const CREATE_PACKAGE_SERVER_FIELDS: Array<[RegExp, ApplicationItemField]> = [
  [/^Package number .+ already exists\.$/, 'createPackageNumber'],
  [/^The (total )?package volume .+\.$/, 'createPackageVolume'],
  [/^The package average length .+\.$/, 'createPackageAverageLength'],
  [/^The package average diameter .+\.$/, 'createPackageAverageDiameter'],
  [/^Package comments .+\.$/, 'createPackageComments'],
]

const EDIT_PACKAGE_SERVER_FIELDS: Array<[RegExp, ApplicationItemField]> = [
  [/^Package (number )?.+ already exists\.$/, 'packageNewPackageNumber'],
  [/^The (total )?package volume .+\.$/, 'packageVolume'],
  [/^The package average length .+\.$/, 'packageAverageLength'],
  [/^The package average diameter .+\.$/, 'packageAverageDiameter'],
  [/^Package comments .+\.$/, 'packageComments'],
  [/^Package product type code does not exist\.$/, 'packageProductType'],
  [/^Package growth type code does not exist\.$/, 'packageAgeClass'],
]

const SCALE_SERVER_FIELDS: Array<[RegExp, ApplicationItemField]> = [
  [
    /^A valid timber mark is required\.$|^Timber mark .+ (does not exist|is not valid.*)\.$/,
    'scaleTimberMark',
  ],
  [/^A scale with this timber mark, species, and grade already exists\.$/, 'scaleTimberMark'],
  [/^A valid species code is required\.$|^Species code .+ does not exist\.$/, 'scaleSpeciesCode'],
  [/^A valid grade code is required\.$|^Grade code .+ does not exist\.$/, 'scaleGradeCode'],
  [/^The scale pieces .+\.$/, 'scalePieces'],
  [/^The scale volume .+\.$|^The package volume has already been met\.$/, 'scaleVolume'],
]

// Keep the server's message on its field; errors without a matching field stay in the panel.
const drawerServerErrors = (messages: string[], fields: Array<[RegExp, ApplicationItemField]>) => {
  const fieldErrors: FieldErrors<ApplicationItemField> = {}
  const otherMessages: string[] = []
  for (const message of messages) {
    const field = fields.find(([pattern]) => pattern.test(message))?.[1]
    if (field) fieldErrors[field] ??= message
    else otherMessages.push(message)
  }
  return { fieldErrors, otherMessages }
}

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

type ProvincialApplicationItemsPanelProps = {
  detail: ProvincialApplicationDetail
  canEditPackages: boolean
  canAddPackages: boolean
  canAddScales: boolean
  canUpdatePackageNumber: boolean
  hideMutationActions: boolean
  authoritativeOptionsAvailability: 'loading' | 'available' | 'unavailable'
  productTypeOptions: ApplicationCodeOption[]
  growthTypeOptions: ApplicationCodeOption[]
  applicationGrowthTypeCode?: string
  applicationEndUseCode?: string
  applicationSpeciesCodes?: string[]
  editingBlocked?: boolean
  onDetailChanged: () => Promise<void>
  /** The page's latest action result when an item action produced it. */
  actionResult: ActionResult | null
  /** Replaces the page's single action result so item and page results never stack. */
  onActionResult: Dispatch<SetStateAction<ActionResult | null>>
  onDirtyChange?: (dirty: boolean) => void
  onBusyChange?: (busy: boolean) => void
  onEditingChange?: (editing: boolean) => void
  onSelectedPackageChange?: (packageNumber: string) => void
  focusedPackageNumber?: string
  focusedPackageRequestId?: number
  focusScalesRequestId?: number
}

const emptyPackageForm = (
  productTypeCode: string | null | undefined,
  growthTypeCode = '',
  endUseCode = '',
): PackageFormState => ({
  packageNumber: '',
  newPackageNumber: '',
  volume: '',
  scaledVolume: '',
  averageLength: '',
  averageDiameter: '',
  status: '',
  comments: '',
  reprocessed: 'N',
  ageClass: ['H', 'S'].includes((productTypeCode ?? '').trim().toUpperCase()) ? growthTypeCode : '',
  productType: productTypeCode ?? '',
  endUseCode,
})

// INTENTIONAL_LEGACY_DIVERGENCE(APPLICATION_PACKAGE_PANELS): a new package starts its amounts at
// 0.0. Create package doesn't show status, product type, age class, end use or species, so it saves
// an active package with the application's own values.
const newPackageForm = (
  productTypeCode: string | null | undefined,
  growthTypeCode = '',
  endUseCode = '',
): PackageFormState => ({
  ...emptyPackageForm(productTypeCode, growthTypeCode, endUseCode),
  volume: '0.0',
  averageLength: '0.0',
  averageDiameter: '0.0',
  status: 'ACT',
})

// A new scale's volume starts at 0.0.
const emptyScaleForm: ScaleFormState = {
  timberMark: '',
  speciesCode: '',
  gradeCode: '',
  pieces: '',
  volume: '0.0',
}

const GRADE_HELPER_TEXT = 'Available once species are selected'

// A package or scale saved from its side panel reports inside the section that shows it.
const PACKAGE_SAVED_TITLE = 'Package saved.'
const SCALE_SAVED_TITLE = 'Scale saved.'
const NO_SPECIES_CODES: string[] = []

const normalizePackageNumberInput = (value: string): string => value.toUpperCase()

const PACKAGE_COMMENTS_MAX_LENGTH = 180
const PACKAGE_COMMENTS_ASCII_PATTERN = /^[\u0000-\u007f]*$/

const packageCommentsFieldError = (value: string): string | undefined => {
  if (!PACKAGE_COMMENTS_ASCII_PATTERN.test(value)) {
    return 'Package comments contain unsupported characters. Use unaccented letters, numbers, spaces, or standard punctuation.'
  }
  return value.length > PACKAGE_COMMENTS_MAX_LENGTH
    ? `Package comments must be ${PACKAGE_COMMENTS_MAX_LENGTH} characters or fewer.`
    : undefined
}

const existingPackageNumberError = (
  value: string,
  packageNumbers: string[],
  excludePackageNumber = '',
): string | undefined => {
  const normalized = value.trim().toUpperCase()
  if (!normalized) {
    return undefined
  }
  if (value === excludePackageNumber) {
    return undefined
  }
  const exists = packageNumbers.some(
    (packageNumber) =>
      packageNumber !== excludePackageNumber && packageNumber.trim().toUpperCase() === normalized,
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

const optionTextForCode = (options: ApplicationCodeOption[], code: string): string => {
  const normalizedCode = code.trim()
  if (!normalizedCode) {
    return ''
  }
  const option = options.find((item) => item.code === normalizedCode)
  return option ? asOptionText(option) : normalizedCode
}

const packageRequiresAgeClass = (productTypeCode: string): boolean =>
  ['H', 'S'].includes(productTypeCode.trim().toUpperCase())

const uniqueCodes = (rows: ApplicationPackageSpeciesRow[]): string[] =>
  Array.from(new Set(rows.map((row) => row.species).filter(Boolean)))

// Rounds half up from hundredths, as the server does with volumes stored to two decimals.
const roundOneDecimal = (value: number): number => Math.round(Math.round(value * 100) / 10) / 10

const optionName = (option: ApplicationCodeOption | null): string =>
  option ? option.description || option.code : ''

const findOption = (
  options: ApplicationCodeOption[],
  code: string,
): ApplicationCodeOption | null =>
  code ? (options.find((option) => option.code === code) ?? { code, description: code }) : null

const scaleVolumeLimitText = (remainingVolume: number): string =>
  `Must be less than or equal to remaining package volume (${formatVolume(remainingVolume)} m³)`

// The server compares a scale's volume, rounded to one decimal, with what's left of the package.
const scaleVolumeWithinPackageFieldError = (
  value: string,
  remainingVolume: number | null,
): string | null => {
  const parsed = parseNonNegativeDecimalFieldValue(value)
  if (parsed === null || remainingVolume === null) {
    return null
  }

  return roundOneDecimal(parsed) <= remainingVolume
    ? null
    : `${scaleVolumeLimitText(remainingVolume)}.`
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
  applicationGrowthTypeCode: string | undefined,
  selectedPackageNumber: string,
  packageDetails: ApplicationPackageDetails,
  speciesRows: ApplicationPackageSpeciesRow[],
): PackageFormState => ({
  packageNumber: selectedPackageNumber,
  newPackageNumber: selectedPackageNumber,
  volume: packageDetails.volume,
  scaledVolume: String(packageDetails.scaledVolume),
  averageLength: packageDetails.length,
  averageDiameter: packageDetails.diameter,
  status: packageDetails.status,
  comments: packageDetails.comments,
  reprocessed: packageDetails.reprocessed || 'N',
  // Ordinary legacy package dialogs omitted classification; preserve explicit package values.
  ageClass:
    packageDetails.ageClass ||
    ((!packageDetails.productType || packageDetails.productType === productTypeCode) &&
    packageRequiresAgeClass(productTypeCode ?? '')
      ? applicationGrowthTypeCode
      : '') ||
    '',
  productType: packageDetails.productType || productTypeCode || '',
  endUseCode: speciesRows[0]?.endUse ?? '',
})

function ProvincialApplicationItemsPanel({
  detail,
  canEditPackages,
  canAddPackages,
  canAddScales,
  canUpdatePackageNumber,
  hideMutationActions,
  authoritativeOptionsAvailability,
  productTypeOptions,
  growthTypeOptions,
  applicationGrowthTypeCode,
  applicationEndUseCode = '',
  applicationSpeciesCodes = NO_SPECIES_CODES,
  editingBlocked = false,
  onDetailChanged,
  actionResult,
  onActionResult,
  onDirtyChange,
  onBusyChange,
  onEditingChange,
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
  const [isEditingItems, setIsEditingItems] = useState(false)
  const [activeDrawer, setActiveDrawer] = useState<'create' | 'edit' | 'scale' | null>(null)
  const packageLauncherRef = useRef<HTMLElement>(null)
  const scaleLauncherRef = useRef<HTMLElement>(null)
  const drawerFormRef = useRef<HTMLDivElement>(null)
  const [serverFieldErrors, setServerFieldErrors] = useState<FieldErrors<ApplicationItemField>>({})
  const focusFirstDrawerError = () =>
    requestAnimationFrame(() => {
      const form = drawerFormRef.current
      const invalid = form?.querySelector<HTMLElement>(
        '[aria-invalid="true"], [data-invalid="true"]',
      )
      const control = invalid?.matches('input, textarea, button')
        ? invalid
        : invalid?.querySelector<HTMLElement>('input, textarea, button')
      const target = control ?? form?.querySelector<HTMLElement>('[data-drawer-error]')
      target?.focus()
      target?.scrollIntoView({ block: 'nearest' })
    })
  const [packageBaselineForm, setPackageBaselineForm] = useState<PackageFormState>(() =>
    emptyPackageForm(productTypeCode, applicationGrowthTypeCode, applicationEndUseCode),
  )
  const [createPackageForm, setCreatePackageForm] = useState<PackageFormState>(() =>
    newPackageForm(productTypeCode),
  )
  const [packageSpeciesRows, setPackageSpeciesRows] = useState<ApplicationPackageSpeciesRow[]>([])
  const [speciesDraft, setSpeciesDraft] = useState<string[]>([])
  const [packageSpeciesBaseline, setPackageSpeciesBaseline] = useState<string[]>([])
  const [createSpeciesDraft, setCreateSpeciesDraft] = useState<string[]>(applicationSpeciesCodes)
  const applicationSpeciesCodesRef = useRef(applicationSpeciesCodes)
  applicationSpeciesCodesRef.current = applicationSpeciesCodes
  const applicationSpeciesCodesKey = applicationSpeciesCodes.join('|')
  const [scales, setScales] = useState<ApplicationPackageScaleRow[]>([])
  const [applicationScaleRows, setApplicationScaleRows] = useState<ApplicationScaleSummaryRow[]>([])
  const [speciesOptions, setSpeciesOptions] = useState<ApplicationCodeOption[]>([])
  const [remainingSpeciesOptions, setRemainingSpeciesOptions] = useState<ApplicationCodeOption[]>(
    [],
  )
  const [endUseOptions, setEndUseOptions] = useState<ApplicationCodeOption[]>([])
  const [endUseAvailability, setEndUseAvailability] = useState<DependentOptionsAvailability>('idle')
  const [createEndUseAvailability, setCreateEndUseAvailability] =
    useState<DependentOptionsAvailability>('idle')
  const [gradeOptions, setGradeOptions] = useState<ApplicationCodeOption[]>([])
  const [speciesToAdd, setSpeciesToAdd] = useState('')
  const [scaleForm, setScaleForm] = useState<ScaleFormState>(emptyScaleForm)
  const [scaleActionErrorMessage, setScaleActionErrorMessage] = useState('')
  const [baseReferenceOptionsAvailability, setBaseReferenceOptionsAvailability] = useState<
    'loading' | 'available' | 'unavailable'
  >('loading')
  const [dependentReferenceOptionsUnavailable, setDependentReferenceOptionsUnavailable] =
    useState(false)
  const [itemsLoading, setItemsLoading] = useState(false)
  const [packageDataAvailability, setPackageDataAvailability] =
    useState<PackageDataAvailability>(unavailablePackageData)
  const [packageLoadWarning, setPackageLoadWarning] = useState('')
  const [itemsErrorMessage, setItemsErrorMessage] = useState('')
  // A failure inside an open drawer stays in that drawer.
  const showItemActionError = (message: string) => {
    if (activeDrawer === 'scale') {
      setScaleActionErrorMessage(message)
    } else if (activeDrawer) {
      setItemsErrorMessage(message)
    } else {
      onActionResult({ kind: 'error', title: 'Item action failed', message })
    }
  }
  const showItemActionResult = (kind: 'success' | 'warning', message: string) =>
    onActionResult({
      kind,
      title: kind === 'success' ? 'Item action completed' : 'Item action needs attention',
      message,
    })
  const actionResultSection =
    actionResult?.kind !== 'success'
      ? 'items'
      : actionResult.title === PACKAGE_SAVED_TITLE
        ? 'package'
        : actionResult.title === SCALE_SAVED_TITLE
          ? 'scales'
          : 'items'
  const actionResultNotification = (section: typeof actionResultSection) =>
    !!actionResult &&
    actionResultSection === section && (
      <ActionResultNotification result={actionResult} onClose={() => onActionResult(null)} />
    )
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
  const [packagePendingDeletion, setPackagePendingDeletion] = useState('')
  const [scalePendingDeletion, setScalePendingDeletion] =
    useState<ApplicationPackageScaleRow | null>(null)
  const scalesSectionRef = useRef<HTMLElement>(null)
  const lastScrolledToScalesRequestIdRef = useRef(0)
  const lastHandledFocusedPackageRequestRef = useRef('')
  const beginItemsRequest = useLatestRequestGuard()
  const selectedPackageDraftDirty =
    packageDraftTouched &&
    (JSON.stringify(packageForm) !== JSON.stringify(packageBaselineForm) ||
      JSON.stringify(speciesDraft) !== JSON.stringify(packageSpeciesBaseline))
  const createPackageDraftDirty =
    createPackageDraftTouched &&
    (JSON.stringify(createPackageForm) !==
      JSON.stringify(
        newPackageForm(productTypeCode, applicationGrowthTypeCode, applicationEndUseCode),
      ) ||
      JSON.stringify(createSpeciesDraft) !== JSON.stringify(applicationSpeciesCodes))
  const scaleDraftDirty =
    scaleDraftTouched && JSON.stringify(scaleForm) !== JSON.stringify(emptyScaleForm)
  const itemsDirty = selectedPackageDraftDirty || createPackageDraftDirty || scaleDraftDirty
  const itemsBusy = isSavingPackage || isSavingScale || !!deletingScaleId
  const drawerReturnFocus = () => {
    const active = document.activeElement
    return active instanceof HTMLElement &&
      active !== document.body &&
      active.isConnected &&
      active.getAttribute('role') !== 'option'
      ? active
      : document.querySelector<HTMLElement>(
          '.application-items-drawer input:not(:disabled), .application-items-drawer textarea:not(:disabled)',
        )
  }
  const { confirmDiscard: confirmItemDiscard, discardModal: itemDiscardModal } = useDiscardPrompt(
    itemsDirty,
    undefined,
    drawerReturnFocus,
  )

  useEffect(() => {
    if (activeDrawer || createPackageDraftTouched) return
    // The saved summary can arrive after this panel mounts; refresh only an untouched create draft.
    // eslint-disable-next-line @eslint-react/set-state-in-effect
    setCreatePackageForm(
      newPackageForm(productTypeCode, applicationGrowthTypeCode, applicationEndUseCode),
    )
    setCreateSpeciesDraft(applicationSpeciesCodesRef.current)
  }, [
    activeDrawer,
    applicationEndUseCode,
    applicationGrowthTypeCode,
    applicationSpeciesCodesKey,
    createPackageDraftTouched,
    productTypeCode,
  ])
  const packageDataLoaded =
    packageDataAvailability.details &&
    packageDataAvailability.species &&
    packageDataAvailability.scales
  const packageSpeciesUnavailable =
    packageDataAvailability.details && !packageDataAvailability.species && !itemsLoading
  const packageScalesUnavailable =
    packageDataAvailability.details && !packageDataAvailability.scales && !itemsLoading

  useEffect(() => {
    onDirtyChange?.(itemsDirty)
  }, [itemsDirty, onDirtyChange])

  useEffect(() => {
    onBusyChange?.(itemsBusy)
  }, [itemsBusy, onBusyChange])

  useEffect(() => {
    onEditingChange?.(isEditingItems)
  }, [isEditingItems, onEditingChange])

  useEffect(
    () => () => {
      onDirtyChange?.(false)
      onBusyChange?.(false)
      onEditingChange?.(false)
    },
    [onBusyChange, onDirtyChange, onEditingChange],
  )
  const selectedPackageScaleVolume = scales.reduce(
    (total, row) => total + (parseNonNegativeDecimalFieldValue(row.volume) ?? 0),
    0,
  )
  const selectedPackageVolume = parseNonNegativeDecimalFieldValue(packageForm.volume)
  // As on the server, each amount counts rounded to one decimal.
  const selectedPackageRemainingScaleVolume =
    selectedPackageVolume === null
      ? null
      : Math.max(
          0,
          roundOneDecimal(
            scales.reduce(
              (remaining, row) =>
                remaining - roundOneDecimal(parseNonNegativeDecimalFieldValue(row.volume) ?? 0),
              roundOneDecimal(selectedPackageVolume),
            ),
          ),
        )

  const itemFieldErrors = useMemo<FieldErrors<ApplicationItemField>>(
    () => ({
      packageNewPackageNumber:
        requiredFieldError(packageForm.newPackageNumber, 'Package number') ??
        existingPackageNumberError(
          packageForm.newPackageNumber,
          packageNumbers,
          selectedPackageNumber,
        ),
      packageComments: packageCommentsFieldError(packageForm.comments),
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
        () => requiredNumericFieldError(createPackageForm.volume, 'Volume'),
        () => greaterThanFieldError(createPackageForm.volume, 'Volume', 0),
        () => atMostOneDecimalFieldError(createPackageForm.volume, 'Volume'),
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
      createPackageComments: packageCommentsFieldError(createPackageForm.comments),
      scaleTimberMark: requiredFieldError(scaleForm.timberMark, 'Timber mark') ?? undefined,
      scaleSpeciesCode: requiredFieldError(scaleForm.speciesCode, 'Species') ?? undefined,
      // Grade only becomes available, and required, once a species is chosen.
      scaleGradeCode: scaleForm.speciesCode
        ? (requiredFieldError(scaleForm.gradeCode, 'Grade') ?? undefined)
        : undefined,
      scalePieces: firstValidationError(
        () => requiredFieldError(scaleForm.pieces, 'Pieces'),
        () => numericFieldError(scaleForm.pieces, 'Pieces'),
        () => integerFieldError(scaleForm.pieces, 'Pieces'),
        () => greaterThanOrEqualFieldError(scaleForm.pieces, 'Pieces', 0),
        () => lessThanOrEqualFieldError(scaleForm.pieces, 'Pieces', 999999999),
      ),
      scaleVolume: firstValidationError(
        () => requiredFieldError(scaleForm.volume, 'Volume'),
        () => numericFieldError(scaleForm.volume, 'Volume'),
        () => greaterThanOrEqualFieldError(scaleForm.volume, 'Volume', 0),
        // INTENTIONAL_LEGACY_DIVERGENCE(APPLICATION_PACKAGE_PANELS): saved as entered, to the
        // database's two decimals.
        () => atMostTwoDecimalFieldError(scaleForm.volume, 'Volume'),
        () => lessThanOrEqualFieldError(scaleForm.volume, 'Volume', 99999.9),
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
    itemFieldErrors.packageComments ||
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
    itemFieldErrors.createPackageAgeClass ||
    itemFieldErrors.createPackageComments,
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
    fieldErrorText(serverFieldErrors[field]) ??
    getVisibleFieldError(field, itemFieldErrors, touchedItemFields, showPackageValidationErrors)

  const createPackageFieldError = (field: ApplicationItemField): string | undefined =>
    fieldErrorText(serverFieldErrors[field]) ??
    getVisibleFieldError(
      field,
      itemFieldErrors,
      touchedItemFields,
      showCreatePackageValidationErrors,
    )

  const scaleFieldError = (field: ApplicationItemField): string | undefined =>
    fieldErrorText(serverFieldErrors[field]) ??
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

  const resetSelectedPackageDrafts = useCallback(() => {
    setServerFieldErrors({})
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
  }, [packageBaselineForm, packageSpeciesBaseline])

  const resetCreatePackageDraft = useCallback(() => {
    setServerFieldErrors({})
    setCreatePackageForm(
      newPackageForm(productTypeCode, applicationGrowthTypeCode, applicationEndUseCode),
    )
    setCreateSpeciesDraft(applicationSpeciesCodes)
    setCreatePackageDraftTouched(false)
    setTouchedItemFields({})
    setShowCreatePackageValidationErrors(false)
  }, [productTypeCode, applicationGrowthTypeCode, applicationEndUseCode, applicationSpeciesCodes])

  const resetScaleDraft = useCallback(() => {
    setServerFieldErrors({})
    setScaleForm(emptyScaleForm)
    setScaleActionErrorMessage('')
    setScaleDraftTouched(false)
    setTouchedItemFields({})
    setShowScaleValidationErrors(false)
  }, [])

  const cancelItemEditing = useCallback(() => {
    resetSelectedPackageDrafts()
    resetCreatePackageDraft()
    resetScaleDraft()
    setItemsErrorMessage('')
    onActionResult(withoutActionError)
    setIsEditingItems(false)
    setActiveDrawer(null)
  }, [resetSelectedPackageDrafts, resetCreatePackageDraft, resetScaleDraft, onActionResult])

  const requestPackageSelection = useCallback(
    (packageNumber: string) => {
      if (itemsBusy || packageNumber === selectedPackageNumber) return
      // Loading the next package replaces the current package's drafts.
      confirmItemDiscard(() => {
        if (activeDrawer === 'create') cancelItemEditing()
        else {
          resetSelectedPackageDrafts()
          resetCreatePackageDraft()
          onActionResult(withoutActionError)
        }
        dispatchPackageSelection({ type: 'select', packageNumber })
      })
    },
    [
      activeDrawer,
      cancelItemEditing,
      confirmItemDiscard,
      itemsBusy,
      onActionResult,
      resetSelectedPackageDrafts,
      resetCreatePackageDraft,
      selectedPackageNumber,
    ],
  )
  const requestPackageSelectionRef = useRef(requestPackageSelection)

  useEffect(() => {
    requestPackageSelectionRef.current = requestPackageSelection
  }, [requestPackageSelection])

  useEffect(() => {
    dispatchPackageSelection({ type: 'sync', packageNumbers: packageNumbersFromDetail })
  }, [packageNumbersFromDetail])

  useEffect(() => {
    onSelectedPackageChange?.(selectedPackageNumber)
  }, [onSelectedPackageChange, selectedPackageNumber])

  useEffect(() => {
    const focusRequestKey = `${focusedPackageRequestId ?? 0}:${focusedPackageNumber ?? ''}`
    if (
      !focusedPackageNumber ||
      !packageNumbers.includes(focusedPackageNumber) ||
      lastHandledFocusedPackageRequestRef.current === focusRequestKey
    ) {
      return
    }

    lastHandledFocusedPackageRequestRef.current = focusRequestKey
    queueMicrotask(() => requestPackageSelectionRef.current(focusedPackageNumber))
  }, [focusedPackageNumber, focusedPackageRequestId, packageNumbers])

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
        setPackageDataAvailability(unavailablePackageData)
        setPackageLoadWarning('')
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
        setEndUseAvailability('idle')
        return
      }

      setItemsLoading(true)
      setPackageDataAvailability(unavailablePackageData)
      setPackageLoadWarning('')
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
      setEndUseAvailability('idle')
      try {
        const detailsResult = await fetchApplicationPackageDetails(packageNumber)
        if (!isLatestRequest()) {
          return
        }
        const [speciesResult, scalesResult] = await Promise.allSettled([
          fetchApplicationPackageSpecies(packageNumber),
          fetchApplicationPackageScales(packageNumber),
        ])
        if (!isLatestRequest()) {
          return
        }
        const speciesRows = speciesResult.status === 'fulfilled' ? speciesResult.value : []
        const scaleRows = scalesResult.status === 'fulfilled' ? scalesResult.value : []
        const speciesLoaded = speciesResult.status === 'fulfilled'
        const scalesLoaded = scalesResult.status === 'fulfilled'
        const nextSpeciesDraft = uniqueCodes(speciesRows)
        const loadedPackageForm = toPackageForm(
          productTypeCode,
          applicationGrowthTypeCode,
          packageNumber,
          detailsResult,
          speciesRows,
        )
        setPackageForm(loadedPackageForm)
        setPackageBaselineForm(loadedPackageForm)
        setShowPackageValidationErrors(false)
        setServerFieldErrors({})
        setPackageSpeciesRows(speciesRows)
        setSpeciesDraft(nextSpeciesDraft)
        setPackageSpeciesBaseline(nextSpeciesDraft)
        setPackageDraftTouched(false)
        setScales(scaleRows)
        setPackageDataAvailability({
          details: true,
          species: speciesLoaded,
          scales: scalesLoaded,
        })
        setPackageLoadWarning(
          !speciesLoaded && !scalesLoaded
            ? 'Package species and scales could not be loaded.'
            : !speciesLoaded
              ? 'Package species could not be loaded.'
              : !scalesLoaded
                ? 'Package scales could not be loaded.'
                : '',
        )
      } catch {
        if (isLatestRequest()) {
          setPackageDataAvailability(unavailablePackageData)
          setPackageLoadWarning('')
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
    [applicationGrowthTypeCode, beginItemsRequest, productTypeCode],
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
          setRemainingSpeciesOptions(remaining)
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

    const loadEndUseOptions = async () => {
      if (!region || speciesDraft.length === 0) {
        setEndUseOptions([])
        setEndUseAvailability('idle')
        return
      }
      setEndUseAvailability('loading')
      setEndUseOptions([])
      try {
        const options = await fetchApplicationEndUsesForSpeciesRegion(region, speciesDraft)
        if (!cancelled) {
          setEndUseOptions(options)
          setEndUseAvailability(options.length > 0 ? 'available' : 'unavailable')
          setPackageForm((current) => ({
            ...current,
            endUseCode: (() => {
              const normalizedCurrentCode = current.endUseCode.trim().toUpperCase()
              const matchingOption = options.find(
                (option) => option.code.trim().toUpperCase() === normalizedCurrentCode,
              )
              return matchingOption?.code ?? options[0]?.code ?? current.endUseCode
            })(),
          }))
        }
      } catch {
        if (!cancelled) {
          setEndUseOptions([])
          setEndUseAvailability('unavailable')
        }
      }
    }

    void loadEndUseOptions()
    return () => {
      cancelled = true
    }
  }, [detail.orgUnitNumber, speciesDraft])

  // A new package saves the application's end use, or the first one valid for its species.
  useEffect(() => {
    let cancelled = false
    const region = detail.orgUnitNumber ? String(detail.orgUnitNumber) : ''

    const loadCreateEndUseOptions = async () => {
      if (!region || createSpeciesDraft.length === 0) {
        setCreateEndUseAvailability('idle')
        return
      }
      setCreateEndUseAvailability('loading')
      try {
        const options = await fetchApplicationEndUsesForSpeciesRegion(region, createSpeciesDraft)
        if (!cancelled) {
          setCreateEndUseAvailability(options.length > 0 ? 'available' : 'unavailable')
          setCreatePackageForm((current) => ({
            ...current,
            endUseCode: (() => {
              const normalizedCurrentCode = current.endUseCode.trim().toUpperCase()
              const matchingOption = options.find(
                (option) => option.code.trim().toUpperCase() === normalizedCurrentCode,
              )
              return matchingOption?.code ?? options[0]?.code ?? current.endUseCode
            })(),
          }))
        }
      } catch {
        if (!cancelled) {
          setCreateEndUseAvailability('unavailable')
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
    const errorField = EDIT_PACKAGE_INPUT_FIELDS[field]
    if (errorField) {
      setServerFieldErrors((current) => ({ ...current, [errorField]: undefined }))
    }
    setPackageDraftTouched(true)
    setPackageForm((current) => ({
      ...current,
      [field]: field === 'newPackageNumber' ? normalizePackageNumberInput(value) : value,
    }))
  }

  const setCreatePackageField = (field: keyof PackageFormState, value: string) => {
    const errorField = CREATE_PACKAGE_INPUT_FIELDS[field]
    if (errorField) {
      setServerFieldErrors((current) => ({ ...current, [errorField]: undefined }))
    }
    setCreatePackageDraftTouched(true)
    setCreatePackageForm((current) => ({
      ...current,
      [field]: field === 'packageNumber' ? normalizePackageNumberInput(value) : value,
    }))
  }

  const setScaleField = (field: keyof ScaleFormState, value: string) => {
    setServerFieldErrors((current) => ({
      ...current,
      [SCALE_INPUT_FIELDS[field]]: undefined,
      ...(['timberMark', 'speciesCode', 'gradeCode'].includes(field) &&
      current.scaleTimberMark === DUPLICATE_SCALE_MESSAGE
        ? { scaleTimberMark: undefined }
        : {}),
    }))
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

  const requestDrawerClose = () => {
    if (itemsBusy) return
    confirmItemDiscard(cancelItemEditing)
  }

  const selectedPackageTotalPieces = scales.reduce((total, row) => total + row.pieces, 0)
  const selectedPackageHasPermittedScale = scales.some((row) => row.permitted)
  const baseReferenceOptionsLoading =
    authoritativeOptionsAvailability === 'loading' || baseReferenceOptionsAvailability === 'loading'
  const selectedEndUseOptionsLoading = speciesDraft.length > 0 && endUseAvailability === 'loading'
  const createEndUseOptionsLoading =
    createSpeciesDraft.length > 0 && createEndUseAvailability === 'loading'
  const baseReferenceOptionsUnavailable =
    authoritativeOptionsAvailability === 'unavailable' ||
    baseReferenceOptionsAvailability === 'unavailable' ||
    dependentReferenceOptionsUnavailable
  const selectedEndUseOptionsUnavailable =
    speciesDraft.length > 0 && endUseAvailability === 'unavailable'
  const createEndUseOptionsUnavailable =
    createSpeciesDraft.length > 0 && createEndUseAvailability === 'unavailable'
  const referenceOptionsLoading =
    baseReferenceOptionsLoading || selectedEndUseOptionsLoading || createEndUseOptionsLoading
  const referenceOptionsUnavailable =
    baseReferenceOptionsUnavailable ||
    selectedEndUseOptionsUnavailable ||
    createEndUseOptionsUnavailable
  const referenceOptionsUnavailableMessage = baseReferenceOptionsUnavailable
    ? 'Package saves, package creation, and scale additions are disabled because item options could not be loaded.'
    : selectedEndUseOptionsUnavailable && createEndUseOptionsUnavailable
      ? 'Package saves and package creation are disabled because end use options could not be loaded.'
      : selectedEndUseOptionsUnavailable
        ? 'Package saves are disabled because end use options could not be loaded.'
        : 'Package creation is disabled because end use options could not be loaded.'
  const baseReferenceOptionsAvailable =
    !baseReferenceOptionsLoading && !baseReferenceOptionsUnavailable
  const selectedPackageReferenceOptionsAvailable =
    baseReferenceOptionsAvailable &&
    !selectedEndUseOptionsLoading &&
    !selectedEndUseOptionsUnavailable
  const createPackageReferenceOptionsAvailable =
    baseReferenceOptionsAvailable && !createEndUseOptionsLoading && !createEndUseOptionsUnavailable
  const normalizedProductTypeCode = productTypeCode.trim().toUpperCase()
  const packageBackedItems = ['H', 'T'].includes(normalizedProductTypeCode)
  const scaleBackedItems = normalizedProductTypeCode === 'H'
  const standingTimberItems = normalizedProductTypeCode === 'S'
  const canManageItems =
    !hideMutationActions &&
    (canEditPackages || canAddPackages || (scaleBackedItems && canAddScales))
  const packageFirstEmptyState = packageBackedItems && packageNumbers.length === 0
  const canOpenItemsEditor =
    !standingTimberItems &&
    !editingBlocked &&
    (packageFirstEmptyState ? !hideMutationActions && canAddPackages : canManageItems)
  const showMutationActions = canManageItems && isEditingItems
  const canSaveSelectedPackage =
    activeDrawer === 'edit' &&
    canEditPackages &&
    selectedPackageReferenceOptionsAvailable &&
    packageDataLoaded &&
    !!selectedPackageNumber &&
    !isSavingPackage &&
    !selectedPackageHasPermittedScale
  const canSubmitSelectedPackage =
    activeDrawer === 'edit' && canEditPackages && !itemsBusy && !selectedPackageHasPermittedScale
  const canCreatePackages = activeDrawer === 'create' && canAddPackages && !itemsBusy
  const canSubmitScale = activeDrawer === 'scale' && canAddScales && !itemsBusy
  const canAddScalesWithReferenceOptions =
    activeDrawer === 'scale' && canAddScales && baseReferenceOptionsAvailable && !itemsBusy
  const scaleFieldsDisabled =
    !canAddScalesWithReferenceOptions || !packageDataLoaded || !selectedPackageNumber
  const canDeleteSelectedPackage =
    !itemsBusy &&
    canAddPackages &&
    packageDataLoaded &&
    !!selectedPackageNumber &&
    !isSavingPackage &&
    !selectedPackageHasPermittedScale &&
    selectedPackageTotalPieces === 0

  const startItemEditing = (drawer: 'create' | 'edit' | 'scale', launcher: HTMLElement) => {
    if (!canOpenItemsEditor || itemsBusy) return
    if (drawer === 'create' && !canAddPackages) return
    if (
      drawer === 'edit' &&
      (!canEditPackages || !packageDataLoaded || selectedPackageHasPermittedScale)
    )
      return
    if (drawer === 'scale' && (!canAddScales || !packageDataLoaded || !selectedPackageNumber))
      return
    confirmItemDiscard(() => {
      cancelItemEditing()
      if (drawer === 'scale') scaleLauncherRef.current = launcher
      else packageLauncherRef.current = launcher
      setActiveDrawer(drawer)
      setIsEditingItems(true)
      focusFirstEditableFieldAfterPanelChange(() =>
        document.querySelector('.application-items-drawer'),
      )
    })
  }

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
    if (!canSubmitSelectedPackage) {
      return
    }

    setServerFieldErrors({})
    setItemsErrorMessage('')
    if (!selectedPackageReferenceOptionsAvailable || !packageDataLoaded || !selectedPackageNumber) {
      showItemActionError(
        !selectedPackageReferenceOptionsAvailable
          ? baseReferenceOptionsLoading || selectedEndUseOptionsLoading
            ? 'Loading authoritative item options…'
            : referenceOptionsUnavailableMessage
          : packageLoadWarning || 'Selected package data unavailable',
      )
      focusFirstDrawerError()
      return
    }

    if (packageForm.newPackageNumber !== selectedPackageNumber && !canUpdatePackageNumber) {
      showItemActionError('Package number changes are not allowed for this application.')
      return
    }

    if (selectedPackageHasPermittedScale) {
      showItemActionError('Package changes are not allowed after a scale has been permitted.')
      return
    }

    if (!selectedPackageDraftDirty) {
      cancelItemEditing()
      return
    }

    if (hasPackageValidationError) {
      setShowPackageValidationErrors(true)
      showItemActionError(firstItemError('packageStatus') ?? '')
      focusFirstDrawerError()
      return
    }

    setIsSavingPackage(true)
    setItemsErrorMessage('')
    onActionResult(null)
    try {
      const result = await updateApplicationPackage(
        buildPackageMutation(packageForm, selectedPackageNumber),
      )
      if (!result.valid) {
        const { fieldErrors, otherMessages } = drawerServerErrors(
          result.errors.length ? result.errors : ['Package update failed.'],
          EDIT_PACKAGE_SERVER_FIELDS,
        )
        setServerFieldErrors(fieldErrors)
        showItemActionError(otherMessages.join(' '))
        focusFirstDrawerError()
        return
      }

      const nextPackageNumber =
        result.packageNumber || packageForm.newPackageNumber || selectedPackageNumber
      dispatchPackageSelection({
        type: 'rename',
        previousPackageNumber: selectedPackageNumber,
        nextPackageNumber,
      })
      setActiveDrawer(null)
      setIsEditingItems(false)
      try {
        await onDetailChanged()
        await loadApplicationScaleSummary()
        await loadPackageItems(nextPackageNumber)
        showItemActionResult('success', `Package ${nextPackageNumber} saved.`)
      } catch {
        showItemActionResult(
          'warning',
          `Package ${nextPackageNumber} was saved, but application items could not be refreshed. Reload before changing packages again.`,
        )
      }
    } catch {
      showItemActionError('Unable to save package details.')
      focusFirstDrawerError()
    } finally {
      setIsSavingPackage(false)
    }
  }

  const onCreatePackage = async () => {
    if (!canCreatePackages) {
      return
    }

    setServerFieldErrors({})
    setItemsErrorMessage('')
    if (hasCreatePackageValidationError) {
      setShowCreatePackageValidationErrors(true)
      showItemActionError(
        firstItemError(
          'createPackageStatus',
          'createPackageProductType',
          'createPackageAgeClass',
        ) ?? '',
      )
      focusFirstDrawerError()
      return
    }
    if (!createPackageReferenceOptionsAvailable) {
      showItemActionError(
        baseReferenceOptionsUnavailable || createEndUseOptionsUnavailable
          ? referenceOptionsUnavailableMessage
          : 'Loading authoritative item options…',
      )
      focusFirstDrawerError()
      return
    }

    setIsSavingPackage(true)
    setItemsErrorMessage('')
    onActionResult(null)
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
        const { fieldErrors, otherMessages } = drawerServerErrors(
          result.errors.length > 0 ? result.errors : ['Package creation failed.'],
          CREATE_PACKAGE_SERVER_FIELDS,
        )
        setServerFieldErrors(fieldErrors)
        showItemActionError(otherMessages.join(' '))
        focusFirstDrawerError()
        return
      }

      const nextPackageNumber = result.packageNumber || createPackageForm.packageNumber
      dispatchPackageSelection({ type: 'add', packageNumber: nextPackageNumber })
      resetCreatePackageDraft()
      setActiveDrawer(null)
      setIsEditingItems(false)
      try {
        await onDetailChanged()
        await loadApplicationScaleSummary()
        await loadPackageItems(nextPackageNumber)
        onActionResult({ kind: 'success', title: PACKAGE_SAVED_TITLE, message: '' })
      } catch {
        showItemActionResult(
          'warning',
          `Package ${nextPackageNumber} was created, but application items could not be refreshed. Reload before changing packages again.`,
        )
      }
    } catch {
      showItemActionError('Unable to create package.')
      focusFirstDrawerError()
    } finally {
      setIsSavingPackage(false)
    }
  }

  const onDeleteSelectedPackage = async (packageNumber: string) => {
    if (
      !canAddPackages ||
      !packageDataLoaded ||
      !packageNumber ||
      packageNumber !== selectedPackageNumber
    ) {
      throw new Error('This package is no longer available for deletion.')
    }

    if (selectedPackageHasPermittedScale) {
      throw new Error('Package delete is not allowed after a scale has been permitted.')
    }

    if (selectedPackageTotalPieces > 0) {
      throw new Error('Package delete is not allowed after scale pieces have been added.')
    }

    setIsSavingPackage(true)
    setItemsErrorMessage('')
    onActionResult(null)
    try {
      const result = await deleteApplicationPackage(packageNumber, applicationNumber)
      if (!result.success) {
        throw new Error('Package delete failed. Refresh and try again.')
      }

      dispatchPackageSelection({ type: 'delete', packageNumber })
      try {
        await onDetailChanged()
        await loadApplicationScaleSummary()
        showItemActionResult('success', `Package ${packageNumber} deleted.`)
      } catch (refreshError) {
        console.error(refreshError)
        showItemActionResult(
          'warning',
          `Package ${packageNumber} was deleted. Reload before changing packages again.`,
        )
      }
    } catch (error) {
      console.error(error)
      throw error instanceof Error ? error : new Error('Unable to delete package.')
    } finally {
      setIsSavingPackage(false)
    }
  }

  const onAddScale = async () => {
    if (!canSubmitScale) {
      return
    }

    setServerFieldErrors({})
    setScaleActionErrorMessage('')
    if (!baseReferenceOptionsAvailable || !packageDataLoaded || !selectedPackageNumber) {
      showItemActionError(
        !baseReferenceOptionsAvailable
          ? baseReferenceOptionsLoading
            ? 'Loading authoritative item options…'
            : referenceOptionsUnavailableMessage
          : packageLoadWarning || 'Selected package data unavailable',
      )
      focusFirstDrawerError()
      return
    }
    if (hasScaleValidationError) {
      setShowScaleValidationErrors(true)
      focusFirstDrawerError()
      return
    }

    setIsSavingScale(true)
    setItemsErrorMessage('')
    onActionResult(null)
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
        const { fieldErrors, otherMessages } = drawerServerErrors(
          result.errors.length > 0 ? result.errors : ['Scale creation failed.'],
          SCALE_SERVER_FIELDS,
        )
        setServerFieldErrors(fieldErrors)
        showItemActionError(otherMessages.join(' '))
        focusFirstDrawerError()
        return
      }

      setScales((current) => [...current, result.result as ApplicationPackageScaleRow])
      resetScaleDraft()
      setActiveDrawer(null)
      setIsEditingItems(false)
      try {
        await onDetailChanged()
        await loadApplicationScaleSummary()
        await loadPackageItems(selectedPackageNumber)
        onActionResult({ kind: 'success', title: SCALE_SAVED_TITLE, message: '' })
      } catch (refreshError) {
        console.error(refreshError)
        showItemActionResult(
          'warning',
          `Scale ${result.result.id} added. Reload before adding another scale row.`,
        )
      }
    } catch {
      setScaleActionErrorMessage('Unable to add scale.')
      focusFirstDrawerError()
    } finally {
      setIsSavingScale(false)
    }
  }

  const onDeleteScale = async (row: ApplicationPackageScaleRow) => {
    if (!canAddScales || !packageDataLoaded || row.permitted) {
      throw new Error('This scale is no longer available for deletion.')
    }

    setDeletingScaleId(row.id)
    setItemsErrorMessage('')
    onActionResult(null)
    try {
      const result = await deleteApplicationScale(row.id, applicationNumber)
      if (!result.success) {
        throw new Error('Scale delete failed. Refresh and try again.')
      }
      setScales((current) => current.filter((item) => item.id !== row.id))
      try {
        await onDetailChanged()
        await loadApplicationScaleSummary()
        await loadPackageItems(selectedPackageNumber)
        showItemActionResult('success', `Scale ${row.id} deleted.`)
      } catch (refreshError) {
        console.error(refreshError)
        showItemActionResult(
          'warning',
          `Scale ${row.id} deleted. Reload before changing scale rows again.`,
        )
      }
    } catch (error) {
      console.error(error)
      throw error instanceof Error ? error : new Error('Unable to delete scale.')
    } finally {
      setDeletingScaleId('')
    }
  }

  const selectedSpeciesOptions = speciesDraft.map((species) => {
    const known = speciesOptions.find((option) => option.code === species)
    return {
      code: species,
      description: known?.description ?? species,
    }
  })
  const scaleSpeciesOptions =
    selectedSpeciesOptions.length > 0 ? selectedSpeciesOptions : speciesOptions
  const selectedPackageProductTypeOptions = optionsWithCurrentCode(
    productTypeOptions,
    packageForm.productType,
  )
  const selectedPackageGrowthTypeOptions = optionsWithCurrentCode(
    growthTypeOptions,
    packageForm.ageClass,
  )
  return (
    <div
      id="application-items"
      className="application-detail-section application-items-panel"
      tabIndex={-1}
    >
      <section className="application-items-overview">
        {packageFirstEmptyState && (
          <section className="application-items-card application-items-section application-items-empty-package">
            <div className="application-items-section-header">
              <h3 className="application-items-section-title--icon">
                <Box size={20} aria-hidden="true" />
                <span>Package details</span>
              </h3>
            </div>
            <EmptyState
              title="No packages for this application"
              description="Create a package, then add Summary of scale."
              icon={<Archive width={48} height={48} />}
              headingLevel={4}
              action={
                canOpenItemsEditor ? (
                  <Button
                    kind="tertiary"
                    size="md"
                    renderIcon={Add}
                    disabled={itemsBusy}
                    onClick={(event) => startItemEditing('create', event.currentTarget)}
                  >
                    Create package
                  </Button>
                ) : undefined
              }
            />
          </section>
        )}
        {itemsLoading && <InlineLoading description="Loading item data…" />}
        {isEditingItems &&
          referenceOptionsLoading &&
          (canEditPackages || canAddPackages || canAddScales) && (
            <InlineLoading description="Loading authoritative item options…" />
          )}
        {isEditingItems &&
          referenceOptionsUnavailable &&
          (canEditPackages || canAddPackages || canAddScales) && (
            <InlineNotification
              className="detail-context-notification"
              kind="warning"
              title="Item options unavailable"
              subtitle={referenceOptionsUnavailableMessage}
              lowContrast
              hideCloseButton
            />
          )}
        {!!packageLoadWarning && (
          <InlineNotification
            className="detail-context-notification"
            kind="warning"
            title="Selected package data unavailable"
            subtitle={packageLoadWarning}
            lowContrast
            hideCloseButton
          />
        )}
        {!!itemsErrorMessage && !activeDrawer && (
          <AppNotification
            kind="error"
            title="Item action failed"
            subtitle={itemsErrorMessage}
            lowContrast
            onCloseButtonClick={() => setItemsErrorMessage('')}
          />
        )}
        {actionResultNotification('items')}
      </section>

      <div className="application-items-grid">
        {packageBackedItems && (
          <section
            className="application-items-card application-items-section application-items-section--package-details"
            hidden={packageFirstEmptyState}
            style={packageFirstEmptyState ? { display: 'none' } : undefined}
          >
            <div className="application-items-section-header">
              <h3 className="application-items-section-title--icon">
                <Box size={20} aria-hidden="true" />
                <span>
                  {selectedPackageNumber ? `Package ${selectedPackageNumber}` : 'Package details'}
                </span>
              </h3>
              <div className="application-items-card-actions">
                {canOpenItemsEditor && canEditPackages && selectedPackageNumber && (
                  <Button
                    kind="tertiary"
                    size="md"
                    renderIcon={Edit}
                    disabled={itemsBusy || !packageDataLoaded || selectedPackageHasPermittedScale}
                    onClick={(event) => startItemEditing('edit', event.currentTarget)}
                  >
                    Edit package
                  </Button>
                )}
                {canOpenItemsEditor && canDeleteSelectedPackage && (
                  <Button
                    kind="danger--ghost"
                    size="md"
                    renderIcon={TrashCan}
                    onClick={() => {
                      if (itemsBusy) return
                      confirmItemDiscard(() => {
                        cancelItemEditing()
                        onActionResult(null)
                        setPackagePendingDeletion(selectedPackageNumber)
                      })
                    }}
                  >
                    Delete package
                  </Button>
                )}
                {canOpenItemsEditor && canAddPackages && (
                  <Button
                    kind="tertiary"
                    size="md"
                    renderIcon={Add}
                    disabled={itemsBusy}
                    onClick={(event) => startItemEditing('create', event.currentTarget)}
                  >
                    Create package
                  </Button>
                )}
              </div>
              <SearchableSelect
                id="applicationItemsPackageSelect"
                labelText="Selected package"
                value={selectedPackageNumber}
                placeholder="Select package"
                disabled={itemsBusy}
                options={packageNumbers.map((packageNumber) => ({
                  value: packageNumber,
                  label: formatPackageNumberLabel(packageNumber),
                }))}
                onChange={requestPackageSelection}
              />
            </div>
            {actionResultNotification('package')}
            <dl className="detail-field-grid application-items-summary">
              {[
                ['Package number', selectedPackageNumber || 'None selected'],
                ['Package volume (m³)', formatVolume(packageForm.volume)],
                ['Total scale volume (m³)', formatVolume(packageForm.scaledVolume)],
                [
                  'Total pieces',
                  packageScalesUnavailable
                    ? 'Not available'
                    : selectedPackageTotalPieces.toLocaleString(),
                ],
                ['Average length (m)', packageForm.averageLength],
                ['Average top diameter (rads)', packageForm.averageDiameter],
                [
                  'Product type',
                  optionTextForCode(selectedPackageProductTypeOptions, packageForm.productType),
                ],
                [
                  'Age class',
                  optionTextForCode(selectedPackageGrowthTypeOptions, packageForm.ageClass),
                ],
                ['End use', packageSpeciesUnavailable ? 'Not available' : packageForm.endUseCode],
                ['Comments', packageForm.comments],
              ].map(([label, value]) => (
                <div key={label} className="detail-field-item">
                  <dt className="detail-field-label">{label}</dt>
                  <dd className="detail-field-value">{displayTableValue(value)}</dd>
                </div>
              ))}
            </dl>
            <div className="application-items-package-workspace">
              <DetailSidePanel
                open={activeDrawer === 'edit'}
                title="Edit package"
                className="application-items-drawer"
                contentSelector=".provincial-application-detail"
                initialFocusSelector="#applicationItemsPackageNumber"
                launcherRef={packageLauncherRef}
                fallbackFocusSelector="#applicationItemsPackageSelect"
                busy={isSavingPackage}
                onClose={requestDrawerClose}
                actions={[
                  {
                    label: 'Cancel',
                    kind: 'tertiary',
                    disabled: isSavingPackage,
                    onClick: requestDrawerClose,
                  },
                  {
                    label: isSavingPackage ? 'Saving…' : 'Save package',
                    kind: 'primary',
                    disabled: !canSubmitSelectedPackage,
                    onClick: () => void onSaveSelectedPackage(),
                  },
                ]}
              >
                <RequiredFieldsLegend />
                <div className="application-items-package-edit-panel" ref={drawerFormRef}>
                  {!!itemsErrorMessage && (
                    <div tabIndex={-1} data-drawer-error>
                      <InlineNotification
                        kind="error"
                        title="Package save failed"
                        subtitle={itemsErrorMessage}
                        lowContrast
                        hideCloseButton
                      />
                    </div>
                  )}
                  <div className="application-items-form">
                    <TextInput
                      id="applicationItemsPackageNumber"
                      labelText={requiredLabel('Package number')}
                      aria-required="true"
                      value={packageForm.newPackageNumber}
                      disabled={!canSaveSelectedPackage || !canUpdatePackageNumber}
                      invalid={!!packageFieldError('packageNewPackageNumber')}
                      invalidText={packageFieldError('packageNewPackageNumber')}
                      onBlur={() => markItemFieldTouched('packageNewPackageNumber')}
                      onChange={(event) => setPackageField('newPackageNumber', event.target.value)}
                    />
                    <TextInput
                      id="applicationItemsPackageVolume"
                      labelText={requiredLabel('Package volume (m³)')}
                      aria-required="true"
                      value={packageForm.volume}
                      disabled={!canSaveSelectedPackage}
                      invalid={!!packageFieldError('packageVolume')}
                      invalidText={packageFieldError('packageVolume')}
                      onBlur={() => markItemFieldTouched('packageVolume')}
                      onChange={(event) => setPackageField('volume', event.target.value)}
                    />
                    <TextInput
                      id="applicationItemsPackageLength"
                      labelText={requiredLabel('Average length (m)')}
                      aria-required="true"
                      value={packageForm.averageLength}
                      disabled={!canSaveSelectedPackage}
                      invalid={!!packageFieldError('packageAverageLength')}
                      invalidText={packageFieldError('packageAverageLength')}
                      onBlur={() => markItemFieldTouched('packageAverageLength')}
                      onChange={(event) => setPackageField('averageLength', event.target.value)}
                    />
                    <TextInput
                      id="applicationItemsPackageDiameter"
                      labelText={requiredLabel('Average top diameter (rads)')}
                      aria-required="true"
                      value={packageForm.averageDiameter}
                      disabled={!canSaveSelectedPackage}
                      invalid={!!packageFieldError('packageAverageDiameter')}
                      invalidText={packageFieldError('packageAverageDiameter')}
                      onBlur={() => markItemFieldTouched('packageAverageDiameter')}
                      onChange={(event) => setPackageField('averageDiameter', event.target.value)}
                    />
                    <SearchableSelect
                      id="applicationItemsPackageProductType"
                      labelText={requiredLabel('Product type')}
                      required
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
                      labelText={requiredLabel(
                        'Age class',
                        packageRequiresAgeClass(packageForm.productType),
                      )}
                      required={packageRequiresAgeClass(packageForm.productType)}
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
                      id="applicationItemsPackageEndUse"
                      labelText="End use"
                      value={packageForm.endUseCode}
                      disabled={!canSaveSelectedPackage || endUseAvailability !== 'available'}
                      placeholder={
                        endUseAvailability === 'loading'
                          ? 'Loading end uses'
                          : speciesDraft.length === 0
                            ? 'Select species first'
                            : endUseAvailability === 'available'
                              ? 'Select end use'
                              : 'End uses unavailable'
                      }
                      options={optionsWithCurrentCode(endUseOptions, packageForm.endUseCode).map(
                        toSearchableOption,
                      )}
                      onChange={(value) => setPackageField('endUseCode', value)}
                    />
                  </div>
                  <TextArea
                    id="applicationItemsPackageComments"
                    labelText="Package comments"
                    helperText="Use unaccented letters, numbers, spaces, or standard punctuation."
                    enableCounter
                    maxCount={PACKAGE_COMMENTS_MAX_LENGTH}
                    maxLength={PACKAGE_COMMENTS_MAX_LENGTH}
                    value={packageForm.comments}
                    disabled={!canSaveSelectedPackage}
                    invalid={!!packageFieldError('packageComments')}
                    invalidText={packageFieldError('packageComments')}
                    onBlur={() => markItemFieldTouched('packageComments')}
                    onChange={(event) => setPackageField('comments', event.target.value)}
                  />
                </div>
                <div className="application-items-species-panel">
                  <h4>Package species</h4>
                  {showMutationActions && (
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
                        kind="tertiary"
                        size="md"
                        disabled={!canSaveSelectedPackage || !speciesToAdd}
                        onClick={onAddSpecies}
                      >
                        Add Species
                      </Button>
                    </div>
                  )}
                  <div className="application-items-table-scroll">
                    <Table size="md" useZebraStyles>
                      <TableHead>
                        <TableRow>
                          <TableHeader>Species</TableHeader>
                          <TableHeader>End use</TableHeader>
                          {showMutationActions && <TableHeader>Action</TableHeader>}
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {packageSpeciesUnavailable ? (
                          <TableRow>
                            <TableCell colSpan={showMutationActions ? 3 : 2}>
                              Package species could not be loaded.
                            </TableCell>
                          </TableRow>
                        ) : (
                          selectedSpeciesOptions.map((row) => {
                            const existing = packageSpeciesRows.find(
                              (item) => item.species === row.code,
                            )
                            return (
                              <TableRow key={row.code}>
                                <TableCell>{asOptionText(row)}</TableCell>
                                <TableCell>
                                  {displayTableValue(
                                    existing?.endUseDescription || packageForm.endUseCode,
                                  )}
                                </TableCell>
                                {showMutationActions && (
                                  <TableCell>
                                    <Button
                                      kind="ghost"
                                      size="md"
                                      disabled={!canSaveSelectedPackage}
                                      onClick={() => onRemoveSpecies(row.code)}
                                    >
                                      Remove
                                    </Button>
                                  </TableCell>
                                )}
                              </TableRow>
                            )
                          })
                        )}
                        {!packageSpeciesUnavailable && speciesDraft.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={showMutationActions ? 3 : 2}>
                              No species assigned to this package.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </DetailSidePanel>
              {activeDrawer !== 'edit' && (
                <div className="application-items-species-summary">
                  <h4>Package species</h4>
                  <p>
                    {packageSpeciesUnavailable
                      ? 'Package species could not be loaded.'
                      : selectedSpeciesOptions.length
                        ? selectedSpeciesOptions.map(asOptionText).join(', ')
                        : 'No species assigned to this package.'}
                  </p>
                </div>
              )}
            </div>
          </section>
        )}

        {standingTimberItems && (
          <section className="application-items-card application-items-section application-items-section--timber-marks">
            <h3>Timber marks</h3>
            <div className="application-items-table-scroll">
              <Table size="md" useZebraStyles>
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
          </section>
        )}

        {packageBackedItems && (
          <DetailSidePanel
            open={activeDrawer === 'create'}
            title="Create package"
            className="application-items-drawer"
            contentSelector=".provincial-application-detail"
            initialFocusSelector="#applicationItemsCreatePackageNumber"
            launcherRef={packageLauncherRef}
            fallbackFocusSelector="#applicationItemsPackageSelect"
            busy={isSavingPackage}
            onClose={requestDrawerClose}
            actions={[
              {
                label: 'Cancel',
                kind: 'tertiary',
                disabled: isSavingPackage,
                onClick: requestDrawerClose,
              },
              {
                label: isSavingPackage ? 'Saving package' : 'Save package',
                kind: 'primary',
                disabled: !canCreatePackages,
                renderIcon: isSavingPackage ? PendingIcon : undefined,
                onClick: () => void onCreatePackage(),
              },
            ]}
          >
            <div className="application-items-panel-form" ref={drawerFormRef}>
              <RequiredFieldsLegend />
              {!!itemsErrorMessage && (
                <div tabIndex={-1} data-drawer-error>
                  <InlineNotification
                    kind="error"
                    title="Package creation failed"
                    subtitle={itemsErrorMessage}
                    lowContrast
                    hideCloseButton
                  />
                </div>
              )}
              <TextInput
                id="applicationItemsCreatePackageNumber"
                labelText={requiredLabel('Package number')}
                aria-required="true"
                value={createPackageForm.packageNumber}
                disabled={!canCreatePackages}
                invalid={!!createPackageFieldError('createPackageNumber')}
                invalidText={createPackageFieldError('createPackageNumber')}
                onBlur={() => markItemFieldTouched('createPackageNumber')}
                onChange={(event) => setCreatePackageField('packageNumber', event.target.value)}
              />
              <TextInput
                id="applicationItemsCreatePackageVolume"
                labelText={requiredLabel('Volume (m³)')}
                aria-required="true"
                helperText="Must be less than or equal to application request volume. Must be greater than 0"
                value={createPackageForm.volume}
                disabled={!canCreatePackages}
                invalid={!!createPackageFieldError('createPackageVolume')}
                invalidText={createPackageFieldError('createPackageVolume')}
                onBlur={() => markItemFieldTouched('createPackageVolume')}
                onChange={(event) => setCreatePackageField('volume', event.target.value)}
              />
              <TextInput
                id="applicationItemsCreatePackageLength"
                labelText={requiredLabel('Average length (m)')}
                aria-required="true"
                helperText="Must be greater than 0"
                value={createPackageForm.averageLength}
                disabled={!canCreatePackages}
                invalid={!!createPackageFieldError('createPackageAverageLength')}
                invalidText={createPackageFieldError('createPackageAverageLength')}
                onBlur={() => markItemFieldTouched('createPackageAverageLength')}
                onChange={(event) => setCreatePackageField('averageLength', event.target.value)}
              />
              <TextInput
                id="applicationItemsCreatePackageDiameter"
                labelText={requiredLabel('Average top diameter (rads)')}
                aria-required="true"
                helperText="Must be greater than 0"
                value={createPackageForm.averageDiameter}
                disabled={!canCreatePackages}
                invalid={!!createPackageFieldError('createPackageAverageDiameter')}
                invalidText={createPackageFieldError('createPackageAverageDiameter')}
                onBlur={() => markItemFieldTouched('createPackageAverageDiameter')}
                onChange={(event) => setCreatePackageField('averageDiameter', event.target.value)}
              />
              <TextArea
                id="applicationItemsCreatePackageComments"
                labelText="Comments"
                enableCounter
                maxCount={PACKAGE_COMMENTS_MAX_LENGTH}
                maxLength={PACKAGE_COMMENTS_MAX_LENGTH}
                value={createPackageForm.comments}
                disabled={!canCreatePackages}
                invalid={!!createPackageFieldError('createPackageComments')}
                invalidText={createPackageFieldError('createPackageComments')}
                onBlur={() => markItemFieldTouched('createPackageComments')}
                onChange={(event) => setCreatePackageField('comments', event.target.value)}
              />
            </div>
          </DetailSidePanel>
        )}

        {scaleBackedItems && (
          <section
            id="application-items-scales"
            tabIndex={-1}
            ref={scalesSectionRef}
            className="application-items-card application-items-section application-items-section--scales"
            hidden={packageFirstEmptyState}
            style={packageFirstEmptyState ? { display: 'none' } : undefined}
          >
            <div className="application-items-section-header">
              <h3>Summary of scale</h3>
              {canOpenItemsEditor && canAddScales && selectedPackageNumber && (
                <Button
                  kind="tertiary"
                  size="md"
                  renderIcon={Add}
                  disabled={itemsBusy || !packageDataLoaded}
                  onClick={(event) => startItemEditing('scale', event.currentTarget)}
                >
                  Add scale
                </Button>
              )}
            </div>
            {actionResultNotification('scales')}
            <div className="application-items-scale-totals">
              <span>
                Total pieces:{' '}
                {itemsLoading
                  ? 'Loading…'
                  : packageScalesUnavailable
                    ? 'Not available'
                    : selectedPackageTotalPieces.toLocaleString()}
              </span>
              <span>
                Total scale volume (m³):{' '}
                {itemsLoading
                  ? 'Loading…'
                  : packageScalesUnavailable
                    ? 'Not available'
                    : formatVolume(selectedPackageScaleVolume)}
              </span>
            </div>
            {scaleBackedItems && (
              <DetailSidePanel
                open={activeDrawer === 'scale'}
                title="Add scale"
                className="application-items-drawer"
                contentSelector=".provincial-application-detail"
                initialFocusSelector="#applicationItemsScaleTimberMark"
                launcherRef={scaleLauncherRef}
                fallbackFocusSelector="#application-items-scales"
                busy={isSavingScale}
                onClose={requestDrawerClose}
                actions={[
                  {
                    label: 'Cancel',
                    kind: 'tertiary',
                    disabled: isSavingScale,
                    onClick: requestDrawerClose,
                  },
                  {
                    label: isSavingScale ? 'Saving scale' : 'Save scale',
                    kind: 'primary',
                    disabled: !canSubmitScale,
                    renderIcon: isSavingScale ? PendingIcon : undefined,
                    onClick: () => void onAddScale(),
                  },
                ]}
              >
                <div className="application-items-panel-form" ref={drawerFormRef}>
                  <RequiredFieldsLegend />
                  {!!scaleActionErrorMessage && (
                    <div tabIndex={-1} data-drawer-error>
                      <InlineNotification
                        kind="error"
                        title="Scale creation failed"
                        subtitle={scaleActionErrorMessage}
                        lowContrast
                        hideCloseButton
                      />
                    </div>
                  )}
                  <div className="application-items-panel-form__pair">
                    <TextInput
                      id="applicationItemsScaleTimberMark"
                      labelText={requiredLabel('Timber mark')}
                      aria-required="true"
                      value={scaleForm.timberMark}
                      disabled={scaleFieldsDisabled}
                      invalid={!!scaleFieldError('scaleTimberMark')}
                      invalidText={scaleFieldError('scaleTimberMark')}
                      onBlur={() => markItemFieldTouched('scaleTimberMark')}
                      onChange={(event) => setScaleField('timberMark', event.target.value)}
                    />
                    <TextInput
                      id="applicationItemsScalePieces"
                      labelText={requiredLabel('Pieces')}
                      aria-required="true"
                      value={scaleForm.pieces}
                      disabled={scaleFieldsDisabled}
                      invalid={!!scaleFieldError('scalePieces')}
                      invalidText={scaleFieldError('scalePieces')}
                      onBlur={() => markItemFieldTouched('scalePieces')}
                      onChange={(event) => setScaleField('pieces', event.target.value)}
                    />
                  </div>
                  <div className="application-items-panel-form__pair">
                    <Dropdown<ApplicationCodeOption | null>
                      id="applicationItemsScaleSpecies"
                      ref={markRequired}
                      titleText={requiredLabel('Species')}
                      label=""
                      items={scaleSpeciesOptions}
                      itemToString={optionName}
                      selectedItem={findOption(scaleSpeciesOptions, scaleForm.speciesCode)}
                      disabled={scaleFieldsDisabled}
                      invalid={!!scaleFieldError('scaleSpeciesCode')}
                      invalidText={scaleFieldError('scaleSpeciesCode')}
                      onChange={({ selectedItem }) => {
                        const speciesCode = selectedItem?.code ?? ''
                        if (speciesCode === scaleForm.speciesCode) return
                        markItemFieldTouched('scaleSpeciesCode')
                        // Grades depend on the species, so a new species starts with no grade.
                        setScaleField('speciesCode', speciesCode)
                        setScaleField('gradeCode', '')
                      }}
                    />
                    <Dropdown<ApplicationCodeOption | null>
                      id="applicationItemsScaleGrade"
                      ref={markRequired}
                      titleText={requiredLabel('Grade')}
                      label=""
                      items={gradeOptions}
                      itemToString={optionName}
                      selectedItem={findOption(gradeOptions, scaleForm.gradeCode)}
                      disabled={scaleFieldsDisabled || !scaleForm.speciesCode}
                      invalid={!!scaleFieldError('scaleGradeCode')}
                      invalidText={scaleFieldError('scaleGradeCode')}
                      helperText={scaleForm.speciesCode ? undefined : GRADE_HELPER_TEXT}
                      onChange={({ selectedItem }) => {
                        markItemFieldTouched('scaleGradeCode')
                        setScaleField('gradeCode', selectedItem?.code ?? '')
                      }}
                    />
                  </div>
                  <TextInput
                    id="applicationItemsScaleVolume"
                    labelText={requiredLabel('Volume (m³)')}
                    aria-required="true"
                    helperText={
                      selectedPackageRemainingScaleVolume === null
                        ? undefined
                        : scaleVolumeLimitText(selectedPackageRemainingScaleVolume)
                    }
                    value={scaleForm.volume}
                    disabled={scaleFieldsDisabled}
                    invalid={!!scaleFieldError('scaleVolume')}
                    invalidText={scaleFieldError('scaleVolume')}
                    onBlur={() => markItemFieldTouched('scaleVolume')}
                    onChange={(event) => setScaleField('volume', event.target.value)}
                  />
                </div>
              </DetailSidePanel>
            )}
            <div className="application-items-table-scroll application-items-table-scroll--scales">
              <Table size="md" useZebraStyles>
                <TableHead>
                  <TableRow>
                    <TableHeader>Timber mark</TableHeader>
                    <TableHeader>Scale type</TableHeader>
                    <TableHeader>Pieces</TableHeader>
                    <TableHeader>Species</TableHeader>
                    <TableHeader>Grade</TableHeader>
                    <TableHeader>Volume (m³)</TableHeader>
                    {canOpenItemsEditor && <TableHeader>Delete</TableHeader>}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {packageScalesUnavailable ? (
                    <TableRow>
                      <TableCell colSpan={canOpenItemsEditor ? 7 : 6}>
                        Package scales could not be loaded.
                      </TableCell>
                    </TableRow>
                  ) : (
                    scales.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>{row.timberMark}</TableCell>
                        <TableCell>{displayScaleType(row.cascadeSplitCode)}</TableCell>
                        <TableCell>{row.pieces.toLocaleString()}</TableCell>
                        <TableCell>{row.species}</TableCell>
                        <TableCell>{row.grade}</TableCell>
                        <TableCell>{formatVolume(row.volume)}</TableCell>
                        {canOpenItemsEditor && (
                          <TableCell>
                            <Button
                              type="button"
                              kind="danger--ghost"
                              size="md"
                              disabled={
                                !canAddScales ||
                                itemsBusy ||
                                !packageDataLoaded ||
                                deletingScaleId === row.id ||
                                row.permitted
                              }
                              renderIcon={deletingScaleId === row.id ? PendingIcon : TrashCan}
                              onClick={() => {
                                if (itemsBusy) return
                                confirmItemDiscard(() => {
                                  cancelItemEditing()
                                  onActionResult(null)
                                  setScalePendingDeletion(row)
                                })
                              }}
                            >
                              {deletingScaleId === row.id ? 'Deleting…' : 'Delete'}
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))
                  )}
                  {!packageScalesUnavailable && scales.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={canOpenItemsEditor ? 7 : 6}>No scales yet.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </section>
        )}
      </div>
      {packagePendingDeletion && (
        <ConfirmationModal
          open
          danger
          title="Delete package"
          description={
            <>
              Permanently delete package <strong>{packagePendingDeletion}</strong> from application{' '}
              {applicationNumber}? This cannot be undone.
            </>
          }
          confirmLabel="Delete"
          pendingLabel="Deleting…"
          errorTitle="Failed to delete package"
          onConfirm={() => onDeleteSelectedPackage(packagePendingDeletion)}
          onClose={() => setPackagePendingDeletion('')}
        />
      )}
      {scalePendingDeletion && (
        <ConfirmationModal
          open
          danger
          title="Delete scale"
          description={
            <>
              Permanently delete scale <strong>{scalePendingDeletion.id}</strong> (
              {scalePendingDeletion.timberMark}) from package {selectedPackageNumber}? This cannot
              be undone.
            </>
          }
          confirmLabel="Delete"
          pendingLabel="Deleting…"
          errorTitle="Failed to delete scale"
          onConfirm={() => onDeleteScale(scalePendingDeletion)}
          onClose={() => setScalePendingDeletion(null)}
        />
      )}
      {itemDiscardModal}
    </div>
  )
}

export default ProvincialApplicationItemsPanel
