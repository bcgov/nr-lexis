import { Dropdown } from '@carbon/react'
import { useEffect, useRef, useState } from 'react'
import {
  fetchApplicationGradeCodes,
  fetchApplicationSpeciesCodes,
  type ApplicationCodeOption,
} from '@/service/provincial-application-items-service'
import { fieldErrorText } from '@/utils/field-error'
import { markRequired, requiredLabel } from '@/utils/required-label'

export type BlanketOicScaleCodeField = 'speciesCode' | 'gradeCode'

export type BlanketOicScaleCodeFieldsValue = {
  speciesCode: string
  gradeCode: string
}

export type BlanketOicScaleOptionsStatus = 'loading' | 'ready' | 'unavailable'

type ReferenceAvailability = 'loading' | 'available' | 'unavailable' | 'idle'

export type BlanketOicScaleCodeFieldsProps = {
  region: string
  value: BlanketOicScaleCodeFieldsValue
  onChange: (field: BlanketOicScaleCodeField, value: string) => void
  disabled: boolean
  // The panel shows loading and load failures at its top, so the fields only report them.
  onAvailabilityChange: (status: BlanketOicScaleOptionsStatus) => void
  fieldErrors?: Partial<Record<BlanketOicScaleCodeField, string>>
}

const GRADE_HELPER_TEXT = 'Available once species are selected'

const normalizeCode = (value: string): string => value.trim().toUpperCase()

const optionName = (option: ApplicationCodeOption | null): string =>
  option ? option.description || option.code : ''

const findOption = (
  options: ApplicationCodeOption[],
  code: string,
): ApplicationCodeOption | null =>
  code
    ? (options.find((option) => normalizeCode(option.code) === code) ?? {
        code,
        description: code,
      })
    : null

export default function BlanketOicScaleCodeFields({
  region,
  value,
  onChange,
  disabled,
  onAvailabilityChange,
  fieldErrors,
}: BlanketOicScaleCodeFieldsProps) {
  const [speciesOptions, setSpeciesOptions] = useState<ApplicationCodeOption[]>([])
  const [gradeOptions, setGradeOptions] = useState<ApplicationCodeOption[]>([])
  const [speciesAvailability, setSpeciesAvailability] = useState<ReferenceAvailability>('loading')
  const [gradeAvailability, setGradeAvailability] = useState<ReferenceAvailability>('idle')
  const lastAvailabilityRef = useRef<BlanketOicScaleOptionsStatus | null>(null)
  const onAvailabilityChangeRef = useRef(onAvailabilityChange)

  onAvailabilityChangeRef.current = onAvailabilityChange

  const normalizedRegion = region.trim()
  const selectedSpeciesCode = normalizeCode(value.speciesCode)

  useEffect(() => {
    let active = true
    const loadSpecies = async () => {
      setSpeciesAvailability('loading')
      try {
        const options = await fetchApplicationSpeciesCodes()
        if (!active) return
        setSpeciesOptions(options)
        setSpeciesAvailability('available')
      } catch {
        if (!active) return
        setSpeciesOptions([])
        setSpeciesAvailability('unavailable')
      }
    }

    void loadSpecies()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    const loadGrades = async () => {
      if (!normalizedRegion || !selectedSpeciesCode) {
        setGradeOptions([])
        setGradeAvailability('idle')
        return
      }

      setGradeAvailability('loading')
      setGradeOptions([])
      try {
        const options = await fetchApplicationGradeCodes(normalizedRegion, selectedSpeciesCode)
        if (!active) return
        setGradeOptions(options)
        setGradeAvailability('available')
      } catch {
        if (!active) return
        setGradeOptions([])
        setGradeAvailability('unavailable')
      }
    }

    void loadGrades()
    return () => {
      active = false
    }
  }, [normalizedRegion, selectedSpeciesCode])

  const referenceOptionsStatus: BlanketOicScaleOptionsStatus =
    speciesAvailability === 'unavailable' || gradeAvailability === 'unavailable'
      ? 'unavailable'
      : speciesAvailability === 'loading' || gradeAvailability === 'loading'
        ? 'loading'
        : 'ready'

  useEffect(() => {
    if (lastAvailabilityRef.current === referenceOptionsStatus) return
    lastAvailabilityRef.current = referenceOptionsStatus
    onAvailabilityChangeRef.current(referenceOptionsStatus)
  }, [referenceOptionsStatus])

  const gradeAwaitsSpecies = !selectedSpeciesCode

  return (
    <div className="legacy-search-grid permit-panel-form__pair">
      <Dropdown<ApplicationCodeOption | null>
        id="boicScaleSpeciesCode"
        ref={markRequired}
        titleText={requiredLabel('Species')}
        label=""
        items={speciesOptions}
        itemToString={optionName}
        selectedItem={findOption(speciesOptions, selectedSpeciesCode)}
        disabled={disabled || speciesAvailability !== 'available'}
        invalid={!!fieldErrors?.speciesCode}
        invalidText={fieldErrorText(fieldErrors?.speciesCode)}
        onChange={({ selectedItem }) => {
          const nextSpeciesCode = selectedItem ? normalizeCode(selectedItem.code) : ''
          if (nextSpeciesCode === selectedSpeciesCode) return
          onChange('speciesCode', nextSpeciesCode)
          // Grades depend on the species, so a new species starts with no grade.
          onChange('gradeCode', '')
        }}
      />
      <Dropdown<ApplicationCodeOption | null>
        id="boicScaleGradeCode"
        ref={markRequired}
        titleText={requiredLabel('Grade')}
        label=""
        items={gradeOptions}
        itemToString={optionName}
        selectedItem={findOption(gradeOptions, normalizeCode(value.gradeCode))}
        disabled={disabled || gradeAwaitsSpecies || gradeAvailability !== 'available'}
        invalid={!!fieldErrors?.gradeCode}
        invalidText={fieldErrorText(fieldErrors?.gradeCode)}
        helperText={gradeAwaitsSpecies ? GRADE_HELPER_TEXT : undefined}
        onChange={({ selectedItem }) =>
          onChange('gradeCode', selectedItem ? normalizeCode(selectedItem.code) : '')
        }
      />
    </div>
  )
}
