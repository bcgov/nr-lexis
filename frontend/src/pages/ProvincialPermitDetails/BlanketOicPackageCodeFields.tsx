import { useEffect, useMemo, useRef, useState } from 'react'
import {
  DismissibleTag,
  Dropdown,
  FilterableMultiSelect,
  InlineLoading,
  InlineNotification,
} from '@carbon/react'
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
import { BLANKET_OIC_PRODUCT_TYPE_OPTIONS } from './blanket-oic-package-options'

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

type SpeciesListItem = {
  id: string
  text: string
}

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

// The designer's Create package mockup shows end uses by name only ("Peeler").
const endUseName = (option: ApplicationCodeOption | null): string =>
  option ? option.description || option.code : ''

const optionLabelOf = (option: SearchOption | null): string => option?.label ?? ''

// INTENTIONAL_LEGACY_DIVERGENCE(BOIC_PACKAGE_SPECIES_LIST): the designer's Species list
// multi-select replaces legacy's one-at-a-time species dialog; End use lists only sorts that save.
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
  const speciesFieldRef = useRef<HTMLDivElement>(null)
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

  const selectedEndUse =
    endUseOptions.find(
      (option) => normalizeCode(option.code) === normalizeCode(value.endUseCode),
    ) ?? (value.endUseCode ? { code: value.endUseCode, description: value.endUseCode } : null)
  const selectedAgeClass =
    ageClassOptions.find((option) => option.value === value.ageClass) ??
    (value.ageClass ? { value: value.ageClass, label: value.ageClass } : null)
  const selectedProductType =
    BLANKET_OIC_PRODUCT_TYPE_OPTIONS.find((option) => option.value === value.productType) ??
    (value.productType ? { value: value.productType, label: value.productType } : null)

  const removeSpecies = (speciesCode: string) => {
    const index = selectedSpeciesCodes.indexOf(speciesCode)
    const remaining = selectedSpeciesCodes.filter((code) => code !== speciesCode)
    onChange('speciesCodes', remaining.join(', '))
    // Keep keyboard users in place: the next tag, or the field once no tags remain.
    requestAnimationFrame(() => {
      const field = speciesFieldRef.current
      const tagButtons = field?.querySelectorAll<HTMLButtonElement>(
        '.boic-package-species__tags button',
      )
      const next = tagButtons?.[Math.min(index, tagButtons.length - 1)]
      ;(next ?? field?.querySelector<HTMLInputElement>('input'))?.focus()
    })
  }

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
        <div className="boic-package-species" ref={speciesFieldRef}>
          <FilterableMultiSelect<SpeciesListItem>
            id="boicPackageSpeciesList"
            titleText={requiredLabel('Species list')}
            items={speciesListItems}
            itemToString={(item) => item?.text ?? ''}
            selectedItems={selectedSpeciesItems}
            placeholder="Choose"
            inputProps={{ 'aria-required': true }}
            disabled={disabled || speciesAvailability !== 'available'}
            invalid={!!fieldErrors?.speciesCodes}
            invalidText={fieldErrors?.speciesCodes}
            onChange={({ selectedItems }) =>
              onChange('speciesCodes', selectedItems.map((item) => item.id).join(', '))
            }
          />
          <div className="boic-package-species__tags" aria-live="polite">
            {selectedSpeciesCodes.map((speciesCode) => (
              <DismissibleTag
                key={speciesCode}
                type="gray"
                text={speciesCode}
                title={`Remove ${speciesCode}`}
                disabled={disabled}
                onClose={() => removeSpecies(speciesCode)}
              />
            ))}
          </div>
        </div>
        <Dropdown<ApplicationCodeOption | null>
          id="boicPackageEndUse"
          titleText={requiredLabel('End use')}
          label="Choose an option"
          items={endUseOptions}
          itemToString={endUseName}
          selectedItem={selectedEndUse}
          disabled={endUseDisabled}
          invalid={!!fieldErrors?.endUseCode}
          invalidText={fieldErrors?.endUseCode}
          helperText={endUseAwaitsSpecies ? END_USE_HELPER_TEXT : undefined}
          onChange={({ selectedItem }) =>
            onChange('endUseCode', selectedItem ? normalizeCode(selectedItem.code) : '')
          }
        />
      </div>
      <div className="legacy-search-grid permit-package-panel__pair">
        <Dropdown<SearchOption | null>
          id="boicPackageAgeClass"
          titleText={requiredLabel('Age class')}
          label="Choose an option"
          items={ageClassOptions}
          itemToString={optionLabelOf}
          selectedItem={selectedAgeClass}
          disabled={disabled || ageClassAvailability !== 'available'}
          invalid={!!fieldErrors?.ageClass}
          invalidText={fieldErrors?.ageClass}
          onChange={({ selectedItem }) =>
            onChange('ageClass', selectedItem ? normalizeCode(selectedItem.value) : '')
          }
        />
        {/* Blanket OIC packages are harvested only, so the mockup shows the type read-only. */}
        <Dropdown<SearchOption | null>
          id="boicPackageProductType"
          titleText="Product type"
          label="Choose an option"
          items={BLANKET_OIC_PRODUCT_TYPE_OPTIONS}
          itemToString={optionLabelOf}
          selectedItem={selectedProductType}
          readOnly
          invalid={!!fieldErrors?.productType}
          invalidText={fieldErrors?.productType}
          onChange={() => undefined}
        />
      </div>
    </div>
  )
}
