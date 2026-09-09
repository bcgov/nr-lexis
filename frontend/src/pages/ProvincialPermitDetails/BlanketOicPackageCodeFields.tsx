import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Button,
  InlineLoading,
  InlineNotification,
  RadioButton,
  RadioButtonGroup,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@carbon/react'
import SearchableSelect from '@/components/SearchableSelect'
import { requiredLabel } from '@/utils/required-label'
import {
  fetchApplicationEndUsesForSpeciesRegion,
  fetchApplicationPackageStatusCodes,
  fetchApplicationRemainingSpecies,
  type ApplicationCodeOption,
} from '@/service/provincial-application-items-service'
import {
  fetchProvincialApplicationOptions,
  type SearchOption,
} from '@/service/search-options-service'

export type BlanketOicPackageCodeField =
  | 'speciesCodes'
  | 'endUseCode'
  | 'ageClass'
  | 'productType'
  | 'status'
  | 'reprocessed'

export type BlanketOicPackageCodeFieldsValue = {
  speciesCodes: string
  endUseCode: string
  ageClass: string
  productType: string
  status: string
  reprocessed: string
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

const PRODUCT_TYPE_OPTIONS: SearchableOption[] = [{ value: 'H', label: 'Harvested' }]

const REPROCESSED_OPTIONS = [
  { value: 'Y', label: 'Yes' },
  { value: 'N', label: 'No' },
]

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

export default function BlanketOicPackageCodeFields({
  region,
  value,
  onChange,
  disabled,
  onAvailabilityChange,
  fieldErrors,
}: BlanketOicPackageCodeFieldsProps) {
  const [speciesToAdd, setSpeciesToAdd] = useState('')
  const [speciesOptions, setSpeciesOptions] = useState<ApplicationCodeOption[]>([])
  const [endUseOptions, setEndUseOptions] = useState<ApplicationCodeOption[]>([])
  const [ageClassOptions, setAgeClassOptions] = useState<SearchOption[]>([])
  const [statusOptions, setStatusOptions] = useState<ApplicationCodeOption[]>([])
  const [speciesAvailability, setSpeciesAvailability] = useState<ReferenceAvailability>('loading')
  const [endUseAvailability, setEndUseAvailability] = useState<ReferenceAvailability>('idle')
  const [ageClassAvailability, setAgeClassAvailability] = useState<ReferenceAvailability>('loading')
  const [statusAvailability, setStatusAvailability] = useState<ReferenceAvailability>('loading')
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
    const loadStatusOptions = async () => {
      try {
        const options = await fetchApplicationPackageStatusCodes()
        if (!active) return
        setStatusOptions(options)
        setStatusAvailability(options.length > 0 ? 'available' : 'unavailable')
      } catch {
        if (!active) return
        setStatusOptions([])
        setStatusAvailability('unavailable')
      }
    }

    void loadStatusOptions()
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
    const loadEndUseOptions = async () => {
      if (!normalizedRegion || !requiresEndUseOptions) {
        setEndUseOptions([])
        setEndUseAvailability('idle')
        return
      }

      setEndUseAvailability('loading')
      try {
        const options = await fetchApplicationEndUsesForSpeciesRegion(
          normalizedRegion,
          selectedSpeciesCodes,
        )
        if (!active) return
        setEndUseOptions(options)
        setEndUseAvailability('available')
        if (options.length > 0) {
          const currentEndUseCode = normalizeCode(valueRef.current.endUseCode)
          const nextEndUseCode = options.some(
            (option) => normalizeCode(option.code) === currentEndUseCode,
          )
            ? currentEndUseCode
            : normalizeCode(options[0].code)
          if (nextEndUseCode !== currentEndUseCode) {
            onChangeRef.current('endUseCode', nextEndUseCode)
          }
        }
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
    statusAvailability === 'available' &&
    speciesAvailability === 'available' &&
    (!requiresEndUseOptions || endUseAvailability === 'available')

  useEffect(() => {
    if (lastAvailabilityRef.current === referenceOptionsReady) return
    lastAvailabilityRef.current = referenceOptionsReady
    availabilityChangeRef.current(referenceOptionsReady)
  }, [referenceOptionsReady])

  const referenceOptionsLoading =
    ageClassAvailability === 'loading' ||
    statusAvailability === 'loading' ||
    speciesAvailability === 'loading' ||
    (requiresEndUseOptions && endUseAvailability === 'loading')
  const referenceOptionsUnavailable =
    ageClassAvailability === 'unavailable' ||
    statusAvailability === 'unavailable' ||
    speciesAvailability === 'unavailable' ||
    (requiresEndUseOptions && endUseAvailability === 'unavailable')
  const speciesSelectionDisabled = disabled || speciesAvailability !== 'available'
  const endUseDisabled = disabled || !requiresEndUseOptions || endUseAvailability !== 'available'

  const onAddSpecies = () => {
    const normalizedSpeciesCode = normalizeCode(speciesToAdd)
    if (!normalizedSpeciesCode || selectedSpeciesCodes.includes(normalizedSpeciesCode)) return
    onChange('speciesCodes', [...selectedSpeciesCodes, normalizedSpeciesCode].join(', '))
    setSpeciesToAdd('')
  }

  const onRemoveSpecies = (speciesCode: string) => {
    onChange(
      'speciesCodes',
      selectedSpeciesCodes.filter((current) => current !== speciesCode).join(', '),
    )
  }

  const speciesRows = selectedSpeciesCodes.map((speciesCode) => {
    const option = speciesOptions.find((item) => item.code === speciesCode)
    return {
      code: speciesCode,
      label: option ? optionLabel(option) : speciesCode,
    }
  })

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
      <div className="legacy-search-grid">
        <SearchableSelect
          id="boicPackageSpeciesToAdd"
          labelText={requiredLabel('Species')}
          required
          value={speciesToAdd}
          options={speciesOptions
            .filter((option) => !selectedSpeciesCodes.includes(option.code))
            .map(toSearchableOption)}
          placeholder="Select species"
          disabled={speciesSelectionDisabled}
          invalid={!!fieldErrors?.speciesCodes}
          invalidText={fieldErrors?.speciesCodes}
          onChange={setSpeciesToAdd}
        />
        <Button
          type="button"
          kind="tertiary"
          size="sm"
          disabled={speciesSelectionDisabled || !normalizeCode(speciesToAdd)}
          onClick={onAddSpecies}
        >
          Add species
        </Button>
        <SearchableSelect
          id="boicPackageEndUse"
          labelText={requiredLabel('End use')}
          required
          value={value.endUseCode}
          options={endUseOptions.map(toSearchableOption)}
          placeholder={requiresEndUseOptions ? 'Select end use' : 'Select species first'}
          disabled={endUseDisabled}
          invalid={!!fieldErrors?.endUseCode}
          invalidText={fieldErrors?.endUseCode}
          onChange={(nextValue) => onChange('endUseCode', normalizeCode(nextValue))}
        />
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
          labelText={requiredLabel('Product type')}
          required
          value={value.productType}
          options={PRODUCT_TYPE_OPTIONS}
          placeholder="Select product type"
          disabled={disabled}
          invalid={!!fieldErrors?.productType}
          invalidText={fieldErrors?.productType}
          onChange={(nextValue) => onChange('productType', normalizeCode(nextValue))}
        />
        <SearchableSelect
          id="boicPackageStatus"
          labelText={requiredLabel('Status')}
          required
          value={value.status}
          options={statusOptions.map(toSearchableOption)}
          placeholder="Select package status"
          disabled={disabled || statusAvailability !== 'available'}
          invalid={!!fieldErrors?.status}
          invalidText={fieldErrors?.status}
          onChange={(nextValue) => onChange('status', normalizeCode(nextValue))}
        />
        <RadioButtonGroup
          legendText="Reprocessed"
          name="boic-package-reprocessed"
          valueSelected={value.reprocessed}
          disabled={disabled}
          invalid={!!fieldErrors?.reprocessed}
          invalidText={fieldErrors?.reprocessed}
          onChange={(nextValue) => onChange('reprocessed', normalizeCode(String(nextValue ?? '')))}
        >
          {REPROCESSED_OPTIONS.map((option) => (
            <RadioButton
              key={option.value}
              id={`boicPackageReprocessed${option.value}`}
              labelText={option.label}
              value={option.value}
            />
          ))}
        </RadioButtonGroup>
      </div>
      <div className="application-items-species-panel">
        <h4>Package species</h4>
        <Table size="md" useZebraStyles>
          <TableHead>
            <TableRow>
              <TableHeader>Species</TableHeader>
              <TableHeader>Action</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {speciesRows.map((species) => (
              <TableRow key={species.code}>
                <TableCell>{species.label}</TableCell>
                <TableCell>
                  <Button
                    type="button"
                    kind="ghost"
                    size="sm"
                    disabled={disabled}
                    onClick={() => onRemoveSpecies(species.code)}
                  >
                    Remove {species.code}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {speciesRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={2}>No species assigned to this package.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
