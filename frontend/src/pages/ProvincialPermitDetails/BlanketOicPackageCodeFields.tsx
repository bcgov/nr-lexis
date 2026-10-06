import { useEffect, useMemo, useRef, useState } from 'react'
import { FilterableMultiSelect, InlineLoading, InlineNotification } from '@carbon/react'
import SearchableSelect from '@/components/SearchableSelect'
import { requiredLabel } from '@/utils/required-label'
import {
  fetchApplicationEndUsesForSpeciesRegion,
  fetchApplicationRemainingSpecies,
  type ApplicationCodeOption,
} from '@/service/provincial-application-items-service'
import {
  fetchProvincialApplicationOptions,
  type SearchOption,
} from '@/service/search-options-service'

export type BlanketOicPackageCodeField = 'speciesCodes' | 'endUseCode' | 'ageClass' | 'productType'

export type BlanketOicPackageCodeFieldsValue = {
  speciesCodes: string
  endUseCode: string
  ageClass: string
  productType: string
}

export type BlanketOicPackageCodeFieldsProps = {
  region: string
  value: BlanketOicPackageCodeFieldsValue
  onChange: (field: BlanketOicPackageCodeField, value: string) => void
  disabled: boolean
  onAvailabilityChange: (ready: boolean) => void
  fieldErrors?: Partial<Record<BlanketOicPackageCodeField, string>>
}

type ReferenceAvailability = 'loading' | 'available' | 'unavailable' | 'idle'

type SearchableOption = {
  value: string
  label: string
}

type SpeciesListItem = {
  id: string
  text: string
}

const PRODUCT_TYPE_OPTIONS: SearchableOption[] = [{ value: 'H', label: 'Harvested' }]

const END_USE_HELPER_TEXT = 'Available once species are selected'

const normalizeCode = (value: string): string => value.trim().toUpperCase()

const parseSpeciesCodes = (value: string): string[] =>
  Array.from(
    new Set(
      value
        .split(/[,\s]+/)
        .map(normalizeCode)
        .filter(Boolean),
    ),
  )

const optionLabel = (option: ApplicationCodeOption): string =>
  option.description && option.description !== option.code
    ? `${option.code} - ${option.description}`
    : option.code

const toSearchableOption = (option: ApplicationCodeOption): SearchableOption => ({
  value: option.code,
  label: optionLabel(option),
})

const toSearchableOptions = (options: SearchOption[]): SearchableOption[] =>
  options.map((option) => ({ value: option.value, label: option.label }))

// INTENTIONAL_LEGACY_DIVERGENCE(BOIC_PACKAGE_SPECIES_LIST): Figma's Species list multi-select
// replaces legacy's one-at-a-time species dialog; End use lists only sorts that will save.
export default function BlanketOicPackageCodeFields({
  region,
  value,
  onChange,
  disabled,
  onAvailabilityChange,
  fieldErrors,
}: BlanketOicPackageCodeFieldsProps) {
  const [speciesOptions, setSpeciesOptions] = useState<ApplicationCodeOption[]>([])
  const [endUseOptions, setEndUseOptions] = useState<ApplicationCodeOption[]>([])
  const [ageClassOptions, setAgeClassOptions] = useState<SearchOption[]>([])
  const [speciesAvailability, setSpeciesAvailability] = useState<ReferenceAvailability>('loading')
  const [endUseAvailability, setEndUseAvailability] = useState<ReferenceAvailability>('idle')
  const [ageClassAvailability, setAgeClassAvailability] = useState<ReferenceAvailability>('loading')
  const lastAvailabilityRef = useRef<boolean | null>(null)
  const availabilityChangeRef = useRef(onAvailabilityChange)
  const onChangeRef = useRef(onChange)
  const valueRef = useRef(value)

  availabilityChangeRef.current = onAvailabilityChange
  onChangeRef.current = onChange
  valueRef.current = value

  const normalizedRegion = region.trim()
  const selectedSpeciesCodes = useMemo(
    () => parseSpeciesCodes(value.speciesCodes),
    [value.speciesCodes],
  )
  const requiresEndUseOptions = selectedSpeciesCodes.length > 0

  useEffect(() => {
    let active = true
    const loadAgeClassOptions = async () => {
      try {
        const options = await fetchProvincialApplicationOptions()
        if (!active) return
        setAgeClassOptions(options.growthTypes)
        setAgeClassAvailability(options.growthTypes.length > 0 ? 'available' : 'unavailable')
      } catch {
        if (!active) return
        setAgeClassOptions([])
        setAgeClassAvailability('unavailable')
      }
    }

    void loadAgeClassOptions()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    const loadSpeciesOptions = async () => {
      if (!normalizedRegion) {
        setSpeciesOptions([])
        setSpeciesAvailability('unavailable')
        return
      }

      setSpeciesAvailability('loading')
      try {
        const options = await fetchApplicationRemainingSpecies(
          normalizedRegion,
          'H',
          selectedSpeciesCodes,
        )
        if (!active) return
        setSpeciesOptions(options)
        setSpeciesAvailability('available')
      } catch {
        if (!active) return
        setSpeciesOptions([])
        setSpeciesAvailability('unavailable')
      }
    }

    void loadSpeciesOptions()
    return () => {
      active = false
    }
  }, [normalizedRegion, selectedSpeciesCodes])

  useEffect(() => {
    let active = true
    const clearUnavailableEndUse = (options: ApplicationCodeOption[]) => {
      const currentEndUseCode = normalizeCode(valueRef.current.endUseCode)
      if (
        currentEndUseCode &&
        !options.some((option) => normalizeCode(option.code) === currentEndUseCode)
      ) {
        onChangeRef.current('endUseCode', '')
      }
    }
    const loadEndUseOptions = async () => {
      if (!normalizedRegion || !requiresEndUseOptions) {
        setEndUseOptions([])
        setEndUseAvailability('idle')
        if (!requiresEndUseOptions) clearUnavailableEndUse([])
        return
      }

      setEndUseAvailability('loading')
      try {
        const options = await fetchApplicationEndUsesForSpeciesRegion(
          normalizedRegion,
          selectedSpeciesCodes,
          { completeSortOnly: true },
        )
        if (!active) return
        setEndUseOptions(options)
        setEndUseAvailability('available')
        clearUnavailableEndUse(options)
      } catch {
        if (!active) return
        setEndUseOptions([])
        setEndUseAvailability('unavailable')
      }
    }

    void loadEndUseOptions()
    return () => {
      active = false
    }
  }, [normalizedRegion, requiresEndUseOptions, selectedSpeciesCodes])

  const referenceOptionsReady =
    ageClassAvailability === 'available' &&
    speciesAvailability === 'available' &&
    (!requiresEndUseOptions || endUseAvailability === 'available')

  useEffect(() => {
    if (lastAvailabilityRef.current === referenceOptionsReady) return
    lastAvailabilityRef.current = referenceOptionsReady
    availabilityChangeRef.current(referenceOptionsReady)
  }, [referenceOptionsReady])

  const referenceOptionsLoading =
    ageClassAvailability === 'loading' ||
    speciesAvailability === 'loading' ||
    (requiresEndUseOptions && endUseAvailability === 'loading')
  const referenceOptionsUnavailable =
    ageClassAvailability === 'unavailable' ||
    speciesAvailability === 'unavailable' ||
    (requiresEndUseOptions && endUseAvailability === 'unavailable')
  const endUseAwaitsSpecies =
    !requiresEndUseOptions || (endUseAvailability === 'available' && endUseOptions.length === 0)
  const endUseDisabled = disabled || endUseAwaitsSpecies || endUseAvailability !== 'available'

  // Remaining species narrow as species are chosen; chosen species stay listed so they show checked.
  const speciesListItems = useMemo<SpeciesListItem[]>(() => {
    const itemsByCode = new Map<string, SpeciesListItem>()
    for (const option of speciesOptions) {
      const code = normalizeCode(option.code)
      itemsByCode.set(code, { id: code, text: optionLabel({ ...option, code }) })
    }
    for (const code of selectedSpeciesCodes) {
      if (!itemsByCode.has(code)) itemsByCode.set(code, { id: code, text: code })
    }
    return Array.from(itemsByCode.values()).sort((left, right) => left.id.localeCompare(right.id))
  }, [selectedSpeciesCodes, speciesOptions])
  const selectedSpeciesItems = useMemo(
    () =>
      selectedSpeciesCodes
        .map((code) => speciesListItems.find((item) => item.id === code))
        .filter((item): item is SpeciesListItem => !!item),
    [selectedSpeciesCodes, speciesListItems],
  )

  return (
    <div className="blanket-oic-package-code-fields">
      {referenceOptionsLoading && <InlineLoading description="Loading package options…" />}
      {referenceOptionsUnavailable && (
        <InlineNotification
          kind="warning"
          title="Package options unavailable"
          subtitle="Package options could not be loaded. Reload the page to try again."
          lowContrast
          hideCloseButton
        />
      )}
      <div className="legacy-search-grid permit-package-panel__pair">
        <FilterableMultiSelect<SpeciesListItem>
          id="boicPackageSpeciesList"
          titleText={requiredLabel('Species list')}
          items={speciesListItems}
          itemToString={(item) => item?.text ?? ''}
          selectedItems={selectedSpeciesItems}
          placeholder="Select species"
          inputProps={{ 'aria-required': true }}
          disabled={disabled || speciesAvailability !== 'available'}
          invalid={!!fieldErrors?.speciesCodes}
          invalidText={fieldErrors?.speciesCodes}
          onChange={({ selectedItems }) =>
            onChange('speciesCodes', selectedItems.map((item) => item.id).join(', '))
          }
        />
        <SearchableSelect
          id="boicPackageEndUse"
          labelText={requiredLabel('End use')}
          required
          value={value.endUseCode}
          options={endUseOptions.map(toSearchableOption)}
          placeholder="Select end use"
          disabled={endUseDisabled}
          invalid={!!fieldErrors?.endUseCode}
          invalidText={fieldErrors?.endUseCode}
          helperText={endUseAwaitsSpecies ? END_USE_HELPER_TEXT : undefined}
          onChange={(nextValue) => onChange('endUseCode', normalizeCode(nextValue))}
        />
      </div>
      <div className="legacy-search-grid permit-package-panel__pair">
        <SearchableSelect
          id="boicPackageAgeClass"
          labelText={requiredLabel('Age class')}
          required
          value={value.ageClass}
          options={toSearchableOptions(ageClassOptions)}
          placeholder="Select age class"
          disabled={disabled || ageClassAvailability !== 'available'}
          invalid={!!fieldErrors?.ageClass}
          invalidText={fieldErrors?.ageClass}
          onChange={(nextValue) => onChange('ageClass', normalizeCode(nextValue))}
        />
        <SearchableSelect
          id="boicPackageProductType"
          labelText="Product type"
          value={value.productType}
          options={PRODUCT_TYPE_OPTIONS}
          placeholder="Select product type"
          disabled={disabled}
          invalid={!!fieldErrors?.productType}
          invalidText={fieldErrors?.productType}
          onChange={(nextValue) => onChange('productType', normalizeCode(nextValue))}
        />
      </div>
    </div>
  )
}
