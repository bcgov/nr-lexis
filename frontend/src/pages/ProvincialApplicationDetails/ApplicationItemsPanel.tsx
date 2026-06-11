import { useCallback, useEffect, useMemo, useReducer, useState, type FC } from 'react'
import {
  Button,
  InlineLoading,
  InlineNotification,
  Select,
  SelectItem,
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
import type { ProvincialApplicationDetail } from '@/interfaces/LexisDetails'
import {
  firstValidationError,
  getVisibleFieldError,
  numericFieldError,
  requiredFieldError,
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
  updateApplicationPackage,
  type ApplicationCodeOption,
  type ApplicationPackageDetails,
  type ApplicationPackageScaleRow,
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
  | 'createPackageNumber'
  | 'createPackageVolume'
  | 'createPackageAverageLength'
  | 'createPackageAverageDiameter'
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

type Props = {
  detail: ProvincialApplicationDetail
  canManageItems: boolean
  onDetailChanged: () => Promise<void>
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

const asOptionText = (option: ApplicationCodeOption): string =>
  option.description && option.description !== option.code
    ? `${option.code} - ${option.description}`
    : option.code

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

const uniqueCodes = (rows: ApplicationPackageSpeciesRow[]): string[] =>
  Array.from(new Set(rows.map((row) => row.species).filter(Boolean)))

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

const ProvincialApplicationItemsPanel: FC<Props> = ({
  detail,
  canManageItems,
  onDetailChanged,
}) => {
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
  const [createPackageForm, setCreatePackageForm] = useState<PackageFormState>(() =>
    emptyPackageForm(productTypeCode),
  )
  const [packageSpeciesRows, setPackageSpeciesRows] = useState<ApplicationPackageSpeciesRow[]>([])
  const [speciesDraft, setSpeciesDraft] = useState<string[]>([])
  const [createSpeciesDraft, setCreateSpeciesDraft] = useState<string[]>([])
  const [scales, setScales] = useState<ApplicationPackageScaleRow[]>([])
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
  const [itemsLoading, setItemsLoading] = useState(false)
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
  const beginItemsRequest = useLatestRequestGuard()

  const itemFieldErrors = useMemo<FieldErrors<ApplicationItemField>>(
    () => ({
      packageNewPackageNumber:
        requiredFieldError(packageForm.newPackageNumber, 'Package number') ?? undefined,
      packageVolume: numericFieldError(packageForm.volume, 'Package volume') ?? undefined,
      packageAverageLength:
        numericFieldError(packageForm.averageLength, 'Average length') ?? undefined,
      packageAverageDiameter:
        numericFieldError(packageForm.averageDiameter, 'Average diameter') ?? undefined,
      createPackageNumber:
        requiredFieldError(createPackageForm.packageNumber, 'Package number') ?? undefined,
      createPackageVolume:
        numericFieldError(createPackageForm.volume, 'Package volume') ?? undefined,
      createPackageAverageLength:
        numericFieldError(createPackageForm.averageLength, 'Average length') ?? undefined,
      createPackageAverageDiameter:
        numericFieldError(createPackageForm.averageDiameter, 'Average diameter') ?? undefined,
      scaleTimberMark: requiredFieldError(scaleForm.timberMark, 'Timber mark') ?? undefined,
      scaleSpeciesCode: requiredFieldError(scaleForm.speciesCode, 'Species') ?? undefined,
      scaleGradeCode: requiredFieldError(scaleForm.gradeCode, 'Grade') ?? undefined,
      scalePieces: firstValidationError(
        () => requiredFieldError(scaleForm.pieces, 'Pieces'),
        () => numericFieldError(scaleForm.pieces, 'Pieces'),
      ),
      scaleVolume: firstValidationError(
        () => requiredFieldError(scaleForm.volume, 'Scale volume'),
        () => numericFieldError(scaleForm.volume, 'Scale volume'),
      ),
    }),
    [createPackageForm, packageForm, scaleForm],
  )

  const hasPackageValidationError = Boolean(
    itemFieldErrors.packageNewPackageNumber ||
    itemFieldErrors.packageVolume ||
    itemFieldErrors.packageAverageLength ||
    itemFieldErrors.packageAverageDiameter,
  )
  const hasCreatePackageValidationError = Boolean(
    itemFieldErrors.createPackageNumber ||
    itemFieldErrors.createPackageVolume ||
    itemFieldErrors.createPackageAverageLength ||
    itemFieldErrors.createPackageAverageDiameter,
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

  useEffect(() => {
    dispatchPackageSelection({ type: 'sync', packageNumbers: packageNumbersFromDetail })
  }, [packageNumbersFromDetail])

  useEffect(() => {
    let cancelled = false
    const loadCodeOptions = async () => {
      try {
        const [species, packageStatuses] = await Promise.all([
          fetchApplicationSpeciesCodes(),
          fetchApplicationPackageStatusCodes(),
        ])
        if (!cancelled) {
          setSpeciesOptions(species)
          setPackageStatusOptions(packageStatuses)
        }
      } catch (error) {
        console.error(error)
      }
    }

    void loadCodeOptions()
    return () => {
      cancelled = true
    }
  }, [])

  const loadPackageItems = useCallback(
    async (packageNumber: string) => {
      const isLatestRequest = beginItemsRequest()
      if (!packageNumber) {
        setPackageForm(emptyPackageForm(productTypeCode))
        setPackageSpeciesRows([])
        setSpeciesDraft([])
        setScales([])
        setRemainingSpeciesOptions([])
        setEndUseOptions([])
        return
      }

      setItemsLoading(true)
      setItemsErrorMessage('')
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
        setPackageForm(toPackageForm(productTypeCode, detailsResult, speciesResult))
        setShowPackageValidationErrors(false)
        setPackageSpeciesRows(speciesResult)
        setSpeciesDraft(nextSpeciesDraft)
        setScales(scalesResult)
      } catch (error) {
        if (isLatestRequest()) {
          console.error(error)
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
      } catch (error) {
        console.error(error)
        if (!cancelled) {
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
      } catch (error) {
        console.error(error)
        if (!cancelled) {
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
      } catch (error) {
        console.error(error)
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
      } catch (error) {
        console.error(error)
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
      } catch (error) {
        console.error(error)
      }
    }

    void loadGrades()
    return () => {
      cancelled = true
    }
  }, [detail.orgUnitNumber, scaleForm.speciesCode])

  const setPackageField = (field: keyof PackageFormState, value: string) => {
    setPackageForm((current) => ({ ...current, [field]: value }))
  }

  const setCreatePackageField = (field: keyof PackageFormState, value: string) => {
    setCreatePackageForm((current) => ({ ...current, [field]: value }))
  }

  const setScaleField = (field: keyof ScaleFormState, value: string) => {
    setScaleForm((current) => ({ ...current, [field]: value }))
  }

  const onAddSpecies = () => {
    if (!speciesToAdd || speciesDraft.includes(speciesToAdd)) {
      return
    }
    setSpeciesDraft((current) => [...current, speciesToAdd])
    setSpeciesToAdd('')
  }

  const onRemoveSpecies = (species: string) => {
    setSpeciesDraft((current) => current.filter((item) => item !== species))
  }

  const onAddCreateSpecies = () => {
    if (!createSpeciesToAdd || createSpeciesDraft.includes(createSpeciesToAdd)) {
      return
    }
    setCreateSpeciesDraft((current) => [...current, createSpeciesToAdd])
    setCreateSpeciesToAdd('')
  }

  const onRemoveCreateSpecies = (species: string) => {
    setCreateSpeciesDraft((current) => current.filter((item) => item !== species))
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
    if (!selectedPackageNumber) {
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
      await loadPackageItems(nextPackageNumber)
    } catch (error) {
      console.error(error)
      setItemsErrorMessage('Unable to save package details.')
    } finally {
      setIsSavingPackage(false)
    }
  }

  const onCreatePackage = async () => {
    if (hasCreatePackageValidationError) {
      setShowCreatePackageValidationErrors(true)
      setItemsErrorMessage(
        firstItemError(
          'createPackageNumber',
          'createPackageVolume',
          'createPackageAverageLength',
          'createPackageAverageDiameter',
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
      setCreatePackageForm(emptyPackageForm(productTypeCode))
      setCreateSpeciesDraft([])
      setCreateSpeciesToAdd('')
      setShowCreatePackageValidationErrors(false)
      setItemsInfoMessage(`Package ${nextPackageNumber} created.`)
      await onDetailChanged()
      await loadPackageItems(nextPackageNumber)
    } catch (error) {
      console.error(error)
      setItemsErrorMessage('Unable to create package.')
    } finally {
      setIsSavingPackage(false)
    }
  }

  const onDeleteSelectedPackage = async () => {
    if (!selectedPackageNumber) {
      return
    }

    setIsSavingPackage(true)
    setItemsErrorMessage('')
    setItemsInfoMessage('')
    try {
      const result = await deleteApplicationPackage(selectedPackageNumber)
      if (!result.success) {
        setItemsErrorMessage('Package delete failed.')
        return
      }

      const deletedPackageNumber = selectedPackageNumber
      dispatchPackageSelection({ type: 'delete', packageNumber: deletedPackageNumber })
      setItemsInfoMessage(`Package ${deletedPackageNumber} deleted.`)
      await onDetailChanged()
    } catch (error) {
      console.error(error)
      setItemsErrorMessage('Unable to delete package.')
    } finally {
      setIsSavingPackage(false)
    }
  }

  const onAddScale = async () => {
    if (!selectedPackageNumber) {
      return
    }

    if (hasScaleValidationError) {
      setShowScaleValidationErrors(true)
      setItemsErrorMessage(
        firstItemError(
          'scaleTimberMark',
          'scaleSpeciesCode',
          'scaleGradeCode',
          'scalePieces',
          'scaleVolume',
        ) ?? 'Please fix validation errors before adding the scale.',
      )
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
        setItemsErrorMessage(result.errors.join(' ') || 'Scale creation failed.')
        return
      }

      setScales((current) => [...current, result.result as ApplicationPackageScaleRow])
      setScaleForm(emptyScaleForm)
      setShowScaleValidationErrors(false)
      setItemsInfoMessage(`Scale ${result.result.id} added.`)
      await onDetailChanged()
      await loadPackageItems(selectedPackageNumber)
    } catch (error) {
      console.error(error)
      setItemsErrorMessage('Unable to add scale.')
    } finally {
      setIsSavingScale(false)
    }
  }

  const onDeleteScale = async (scaleId: string) => {
    setDeletingScaleId(scaleId)
    setItemsErrorMessage('')
    setItemsInfoMessage('')
    try {
      const result = await deleteApplicationScale(scaleId)
      if (!result.success) {
        setItemsErrorMessage('Scale delete failed.')
        return
      }
      setScales((current) => current.filter((item) => item.id !== scaleId))
      setItemsInfoMessage(`Scale ${scaleId} deleted.`)
      await onDetailChanged()
      await loadPackageItems(selectedPackageNumber)
    } catch (error) {
      console.error(error)
      setItemsErrorMessage('Unable to delete scale.')
    } finally {
      setDeletingScaleId('')
    }
  }

  const onLookupScale = async () => {
    if (!scaleLookupId.trim()) {
      return
    }
    setItemsErrorMessage('')
    setItemsInfoMessage('')
    setScaleLookupResult('')
    try {
      const result = await fetchApplicationScaleDetails(scaleLookupId)
      if (!result.success) {
        setScaleLookupResult('Scale not found.')
        return
      }
      setScaleLookupResult(
        `${result.timberMark} ${result.species}/${result.grade} ${result.pieces} pcs ${result.volume} m3`,
      )
    } catch (error) {
      console.error(error)
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
  const applicationTotalPieces = detail.packages.reduce(
    (total, packageItem) => total + packageItem.pieceCount,
    0,
  )
  const selectedPackageTotalPieces = scales.reduce((total, row) => total + row.pieces, 0)

  return (
    <Tile>
      <h2 className="detail-tile-title">Items</h2>
      {itemsLoading && <InlineLoading description="Loading item data..." />}
      {!!itemsErrorMessage && (
        <InlineNotification
          kind="error"
          title="Item action failed"
          subtitle={itemsErrorMessage}
          lowContrast
        />
      )}
      {!!itemsInfoMessage && (
        <InlineNotification
          kind="success"
          title="Item action completed"
          subtitle={itemsInfoMessage}
          lowContrast
        />
      )}

      <dl
        className="detail-field-grid application-items-summary"
        aria-label="Application item summary"
      >
        <div className="detail-field-item">
          <dt className="detail-field-label">Application Total Pieces</dt>
          <dd className="detail-field-value">{applicationTotalPieces.toLocaleString()}</dd>
        </div>
      </dl>

      <div className="application-items-grid">
        <section className="application-items-section">
          <h3>Package Details</h3>
          <Select
            id="applicationItemsPackageSelect"
            labelText="Selected package"
            value={selectedPackageNumber}
            onChange={(event) =>
              dispatchPackageSelection({ type: 'select', packageNumber: event.target.value })
            }
          >
            <SelectItem value="" text="Select package" />
            {packageNumbers.map((packageNumber) => (
              <SelectItem key={packageNumber} value={packageNumber} text={packageNumber} />
            ))}
          </Select>
          <dl className="detail-field-grid application-items-summary">
            {[
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
          <div className="application-items-form">
            <TextInput
              id="applicationItemsPackageNumber"
              labelText="Package Number"
              value={packageForm.newPackageNumber}
              disabled={!canManageItems || !selectedPackageNumber}
              invalid={!!packageFieldError('packageNewPackageNumber')}
              invalidText={packageFieldError('packageNewPackageNumber')}
              onBlur={() => markItemFieldTouched('packageNewPackageNumber')}
              onChange={(event) => setPackageField('newPackageNumber', event.target.value)}
            />
            <TextInput
              id="applicationItemsPackageVolume"
              labelText="Package Volume"
              value={packageForm.volume}
              disabled={!canManageItems || !selectedPackageNumber}
              invalid={!!packageFieldError('packageVolume')}
              invalidText={packageFieldError('packageVolume')}
              onBlur={() => markItemFieldTouched('packageVolume')}
              onChange={(event) => setPackageField('volume', event.target.value)}
            />
            <TextInput
              id="applicationItemsPackageLength"
              labelText="Average Length"
              value={packageForm.averageLength}
              disabled={!canManageItems || !selectedPackageNumber}
              invalid={!!packageFieldError('packageAverageLength')}
              invalidText={packageFieldError('packageAverageLength')}
              onBlur={() => markItemFieldTouched('packageAverageLength')}
              onChange={(event) => setPackageField('averageLength', event.target.value)}
            />
            <TextInput
              id="applicationItemsPackageDiameter"
              labelText="Average Diameter"
              value={packageForm.averageDiameter}
              disabled={!canManageItems || !selectedPackageNumber}
              invalid={!!packageFieldError('packageAverageDiameter')}
              invalidText={packageFieldError('packageAverageDiameter')}
              onBlur={() => markItemFieldTouched('packageAverageDiameter')}
              onChange={(event) => setPackageField('averageDiameter', event.target.value)}
            />
            <Select
              id="applicationItemsPackageStatus"
              labelText="Status Code"
              value={packageForm.status}
              disabled={!canManageItems || !selectedPackageNumber}
              onChange={(event) => setPackageField('status', event.target.value)}
            >
              <SelectItem value="" text="Select package status" />
              {selectedPackageStatusOptions.map((option) => (
                <SelectItem key={option.code} value={option.code} text={asOptionText(option)} />
              ))}
            </Select>
            <Select
              id="applicationItemsPackageReprocessed"
              labelText="Reprocessed"
              value={packageForm.reprocessed}
              disabled={!canManageItems || !selectedPackageNumber}
              onChange={(event) => setPackageField('reprocessed', event.target.value)}
            >
              <SelectItem value="N" text="No" />
              <SelectItem value="Y" text="Yes" />
            </Select>
            <TextInput
              id="applicationItemsPackageEndUse"
              labelText="End Use"
              value={packageForm.endUseCode}
              disabled={!canManageItems || !selectedPackageNumber || endUseOptions.length > 0}
              onChange={(event) => setPackageField('endUseCode', event.target.value)}
            />
            {endUseOptions.length > 0 && (
              <Select
                id="applicationItemsPackageEndUseSelect"
                labelText="End Use Options"
                value={packageForm.endUseCode}
                disabled={!canManageItems || !selectedPackageNumber}
                onChange={(event) => setPackageField('endUseCode', event.target.value)}
              >
                {endUseOptions.map((option) => (
                  <SelectItem key={option.code} value={option.code} text={asOptionText(option)} />
                ))}
              </Select>
            )}
          </div>
          <TextArea
            id="applicationItemsPackageComments"
            labelText="Package Comments"
            value={packageForm.comments}
            disabled={!canManageItems || !selectedPackageNumber}
            onChange={(event) => setPackageField('comments', event.target.value)}
          />
          <div className="legacy-search-actions">
            <Button
              kind="primary"
              size="sm"
              disabled={!canManageItems || !selectedPackageNumber || isSavingPackage}
              onClick={() => void onSaveSelectedPackage()}
            >
              Save Package
            </Button>
            <Button
              kind="danger--ghost"
              size="sm"
              disabled={!canManageItems || !selectedPackageNumber || isSavingPackage}
              onClick={() => void onDeleteSelectedPackage()}
            >
              Delete Package
            </Button>
          </div>
        </section>

        <section className="application-items-section">
          <h3>Package Species</h3>
          <div className="application-items-inline-form">
            <Select
              id="applicationItemsSpeciesToAdd"
              labelText="Species"
              value={speciesToAdd}
              disabled={!canManageItems || !selectedPackageNumber}
              onChange={(event) => setSpeciesToAdd(event.target.value)}
            >
              <SelectItem value="" text="Select species" />
              {remainingSpeciesOptions
                .filter((option) => !speciesDraft.includes(option.code))
                .map((option) => (
                  <SelectItem key={option.code} value={option.code} text={asOptionText(option)} />
                ))}
            </Select>
            <Button
              kind="secondary"
              size="sm"
              disabled={!canManageItems || !selectedPackageNumber || !speciesToAdd}
              onClick={onAddSpecies}
            >
              Add Species
            </Button>
          </div>
          <Table useZebraStyles>
            <TableHead>
              <TableRow>
                <TableHeader>Species</TableHeader>
                <TableHeader>End Use</TableHeader>
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
                        disabled={!canManageItems}
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
        </section>

        <section className="application-items-section">
          <h3>Create Package</h3>
          <div className="application-items-form">
            <TextInput
              id="applicationItemsCreatePackageNumber"
              labelText="Package Number"
              value={createPackageForm.packageNumber}
              disabled={!canManageItems}
              invalid={!!createPackageFieldError('createPackageNumber')}
              invalidText={createPackageFieldError('createPackageNumber')}
              onBlur={() => markItemFieldTouched('createPackageNumber')}
              onChange={(event) => setCreatePackageField('packageNumber', event.target.value)}
            />
            <TextInput
              id="applicationItemsCreatePackageVolume"
              labelText="Package Volume"
              value={createPackageForm.volume}
              disabled={!canManageItems}
              invalid={!!createPackageFieldError('createPackageVolume')}
              invalidText={createPackageFieldError('createPackageVolume')}
              onBlur={() => markItemFieldTouched('createPackageVolume')}
              onChange={(event) => setCreatePackageField('volume', event.target.value)}
            />
            <TextInput
              id="applicationItemsCreatePackageLength"
              labelText="Average Length"
              value={createPackageForm.averageLength}
              disabled={!canManageItems}
              invalid={!!createPackageFieldError('createPackageAverageLength')}
              invalidText={createPackageFieldError('createPackageAverageLength')}
              onBlur={() => markItemFieldTouched('createPackageAverageLength')}
              onChange={(event) => setCreatePackageField('averageLength', event.target.value)}
            />
            <TextInput
              id="applicationItemsCreatePackageDiameter"
              labelText="Average Diameter"
              value={createPackageForm.averageDiameter}
              disabled={!canManageItems}
              invalid={!!createPackageFieldError('createPackageAverageDiameter')}
              invalidText={createPackageFieldError('createPackageAverageDiameter')}
              onBlur={() => markItemFieldTouched('createPackageAverageDiameter')}
              onChange={(event) => setCreatePackageField('averageDiameter', event.target.value)}
            />
            <Select
              id="applicationItemsCreatePackageStatus"
              labelText="Status Code"
              value={createPackageForm.status}
              disabled={!canManageItems}
              onChange={(event) => setCreatePackageField('status', event.target.value)}
            >
              <SelectItem value="" text="Select package status" />
              {createPackageStatusOptions.map((option) => (
                <SelectItem key={option.code} value={option.code} text={asOptionText(option)} />
              ))}
            </Select>
            <TextInput
              id="applicationItemsCreatePackageEndUse"
              labelText="End Use"
              value={createPackageForm.endUseCode}
              disabled={!canManageItems || createEndUseOptions.length > 0}
              onChange={(event) => setCreatePackageField('endUseCode', event.target.value)}
            />
            {createEndUseOptions.length > 0 && (
              <Select
                id="applicationItemsCreatePackageEndUseSelect"
                labelText="End Use Options"
                value={createPackageForm.endUseCode}
                disabled={!canManageItems}
                onChange={(event) => setCreatePackageField('endUseCode', event.target.value)}
              >
                {createEndUseOptions.map((option) => (
                  <SelectItem key={option.code} value={option.code} text={asOptionText(option)} />
                ))}
              </Select>
            )}
          </div>
          <div className="application-items-inline-form">
            <Select
              id="applicationItemsCreateSpeciesToAdd"
              labelText="Create Package Species"
              value={createSpeciesToAdd}
              disabled={!canManageItems}
              onChange={(event) => setCreateSpeciesToAdd(event.target.value)}
            >
              <SelectItem value="" text="Select species" />
              {createRemainingSpeciesOptions
                .filter((option) => !createSpeciesDraft.includes(option.code))
                .map((option) => (
                  <SelectItem key={option.code} value={option.code} text={asOptionText(option)} />
                ))}
            </Select>
            <Button
              kind="secondary"
              size="sm"
              disabled={!canManageItems || !createSpeciesToAdd}
              onClick={onAddCreateSpecies}
            >
              Add Create Species
            </Button>
          </div>
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
                      disabled={!canManageItems}
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
          <div className="legacy-search-actions">
            <Button
              kind="secondary"
              size="sm"
              disabled={!canManageItems || isSavingPackage}
              onClick={() => void onCreatePackage()}
            >
              Create Package
            </Button>
          </div>
        </section>

        <section className="application-items-section">
          <h3>Scales</h3>
          <div className="application-items-form">
            <TextInput
              id="applicationItemsScaleTimberMark"
              labelText="Timber Mark"
              value={scaleForm.timberMark}
              disabled={!canManageItems || !selectedPackageNumber}
              invalid={!!scaleFieldError('scaleTimberMark')}
              invalidText={scaleFieldError('scaleTimberMark')}
              onBlur={() => markItemFieldTouched('scaleTimberMark')}
              onChange={(event) => setScaleField('timberMark', event.target.value)}
            />
            <Select
              id="applicationItemsScaleSpecies"
              labelText="Species"
              value={scaleForm.speciesCode}
              disabled={!canManageItems || !selectedPackageNumber}
              invalid={!!scaleFieldError('scaleSpeciesCode')}
              invalidText={scaleFieldError('scaleSpeciesCode')}
              onBlur={() => markItemFieldTouched('scaleSpeciesCode')}
              onChange={(event) => setScaleField('speciesCode', event.target.value)}
            >
              <SelectItem value="" text="Select species" />
              {scaleSpeciesOptions.map((option) => (
                <SelectItem key={option.code} value={option.code} text={asOptionText(option)} />
              ))}
            </Select>
            <Select
              id="applicationItemsScaleGrade"
              labelText="Grade"
              value={scaleForm.gradeCode}
              disabled={!canManageItems || !selectedPackageNumber}
              invalid={!!scaleFieldError('scaleGradeCode')}
              invalidText={scaleFieldError('scaleGradeCode')}
              onBlur={() => markItemFieldTouched('scaleGradeCode')}
              onChange={(event) => setScaleField('gradeCode', event.target.value)}
            >
              <SelectItem value="" text="Select grade" />
              {gradeOptions.map((option) => (
                <SelectItem key={option.code} value={option.code} text={asOptionText(option)} />
              ))}
            </Select>
            <TextInput
              id="applicationItemsScalePieces"
              labelText="Pieces"
              value={scaleForm.pieces}
              disabled={!canManageItems || !selectedPackageNumber}
              invalid={!!scaleFieldError('scalePieces')}
              invalidText={scaleFieldError('scalePieces')}
              onBlur={() => markItemFieldTouched('scalePieces')}
              onChange={(event) => setScaleField('pieces', event.target.value)}
            />
            <TextInput
              id="applicationItemsScaleVolume"
              labelText="Scale Volume"
              value={scaleForm.volume}
              disabled={!canManageItems || !selectedPackageNumber}
              invalid={!!scaleFieldError('scaleVolume')}
              invalidText={scaleFieldError('scaleVolume')}
              onBlur={() => markItemFieldTouched('scaleVolume')}
              onChange={(event) => setScaleField('volume', event.target.value)}
            />
          </div>
          <div className="legacy-search-actions">
            <Button
              kind="secondary"
              size="sm"
              disabled={!canManageItems || !selectedPackageNumber || isSavingScale}
              onClick={() => void onAddScale()}
            >
              Add Scale
            </Button>
          </div>
          <div className="application-items-inline-form">
            <TextInput
              id="applicationItemsScaleLookup"
              labelText="Scale ID"
              value={scaleLookupId}
              onChange={(event) => setScaleLookupId(event.target.value)}
            />
            <Button kind="ghost" size="sm" onClick={() => void onLookupScale()}>
              Lookup Scale
            </Button>
          </div>
          {scaleLookupResult && <p className="detail-field-value">{scaleLookupResult}</p>}
          <Table useZebraStyles>
            <TableHead>
              <TableRow>
                <TableHeader>Timber Mark</TableHeader>
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
                      kind="danger--ghost"
                      size="sm"
                      disabled={!canManageItems || deletingScaleId === row.id || row.permitted}
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
        </section>
      </div>
    </Tile>
  )
}

export default ProvincialApplicationItemsPanel
