import { InlineLoading, InlineNotification } from '@carbon/react'
import { useEffect, useRef, useState } from 'react'
import SearchableSelect from '@/components/SearchableSelect'
import {
  fetchApplicationGradeCodes,
  fetchApplicationSpeciesCodes,
  type ApplicationCodeOption,
} from '@/service/provincial-application-items-service'
import { requiredLabel } from '@/utils/required-label'

export type BlanketOicScaleCodeField = 'speciesCode' | 'gradeCode'

export type BlanketOicScaleCodeFieldsValue = {
  speciesCode: string
  gradeCode: string
}

type ReferenceAvailability = 'loading' | 'available' | 'unavailable' | 'idle'

export type BlanketOicScaleCodeFieldsProps = {
  region: string
  value: BlanketOicScaleCodeFieldsValue
  onChange: (field: BlanketOicScaleCodeField, value: string) => void
  disabled: boolean
  onAvailabilityChange: (ready: boolean) => void
}

const normalizeCode = (value: string): string => value.trim().toUpperCase()

const optionLabel = (option: ApplicationCodeOption): string =>
  option.description && option.description !== option.code
    ? `${option.code} - ${option.description}`
    : option.code

export default function BlanketOicScaleCodeFields({
  region,
  value,
  onChange,
  disabled,
  onAvailabilityChange,
}: BlanketOicScaleCodeFieldsProps) {
  const [speciesOptions, setSpeciesOptions] = useState<ApplicationCodeOption[]>([])
  const [gradeOptions, setGradeOptions] = useState<ApplicationCodeOption[]>([])
  const [speciesAvailability, setSpeciesAvailability] = useState<ReferenceAvailability>('loading')
  const [gradeAvailability, setGradeAvailability] = useState<ReferenceAvailability>('idle')
  const lastAvailabilityRef = useRef<boolean | null>(null)
  const onAvailabilityChangeRef = useRef(onAvailabilityChange)
  const onChangeRef = useRef(onChange)
  const valueRef = useRef(value)

  onAvailabilityChangeRef.current = onAvailabilityChange
  onChangeRef.current = onChange
  valueRef.current = value

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
        setSpeciesAvailability(options.length > 0 ? 'available' : 'unavailable')
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
        setGradeAvailability(options.length > 0 ? 'available' : 'unavailable')
        const currentGradeCode = normalizeCode(valueRef.current.gradeCode)
        const nextGradeCode = options.some(
          (option) => normalizeCode(option.code) === currentGradeCode,
        )
          ? currentGradeCode
          : normalizeCode(options[0]?.code ?? '')
        if (nextGradeCode !== currentGradeCode) {
          onChangeRef.current('gradeCode', nextGradeCode)
        }
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

  const referenceOptionsReady =
    speciesAvailability === 'available' &&
    (!selectedSpeciesCode || gradeAvailability === 'available')

  useEffect(() => {
    if (lastAvailabilityRef.current === referenceOptionsReady) return
    lastAvailabilityRef.current = referenceOptionsReady
    onAvailabilityChangeRef.current(referenceOptionsReady)
  }, [referenceOptionsReady])

  const referenceOptionsLoading =
    speciesAvailability === 'loading' ||
    (Boolean(selectedSpeciesCode) && gradeAvailability === 'loading')
  const referenceOptionsUnavailable =
    speciesAvailability === 'unavailable' ||
    (Boolean(selectedSpeciesCode) && gradeAvailability === 'unavailable')

  return (
    <>
      {referenceOptionsLoading && <InlineLoading description="Loading scale options…" />}
      {referenceOptionsUnavailable && (
        <InlineNotification
          kind="warning"
          title="Scale options unavailable"
          subtitle="Species and grade options could not be loaded. Reload the page to try again."
          lowContrast
          hideCloseButton
        />
      )}
      <SearchableSelect
        id="boicScaleSpeciesCode"
        labelText={requiredLabel('Species')}
        required
        value={value.speciesCode}
        options={speciesOptions.map((option) => ({
          value: option.code,
          label: optionLabel(option),
        }))}
        placeholder="Select species"
        disabled={disabled || speciesAvailability !== 'available'}
        onChange={(nextValue) => {
          const nextSpeciesCode = normalizeCode(nextValue)
          if (nextSpeciesCode === selectedSpeciesCode) return
          onChange('speciesCode', nextSpeciesCode)
          onChange('gradeCode', '')
        }}
      />
      <SearchableSelect
        id="boicScaleGradeCode"
        labelText={requiredLabel('Grade')}
        required
        value={value.gradeCode}
        options={gradeOptions.map((option) => ({
          value: option.code,
          label: optionLabel(option),
        }))}
        placeholder={selectedSpeciesCode ? 'Select grade' : 'Select species first'}
        disabled={disabled || !selectedSpeciesCode || gradeAvailability !== 'available'}
        onChange={(nextValue) => onChange('gradeCode', normalizeCode(nextValue))}
      />
    </>
  )
}
