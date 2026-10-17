import { ComboBox } from '@carbon/react'
import type { ReactNode } from 'react'
import { fieldErrorText } from '@/utils/field-error'
import { shouldFilterSearchableDropdownItem } from './dropdown-filtering'

type SearchableSelectOption = {
  value: string
  label: string
}

type SearchableSelectProps = {
  id: string
  labelText: ReactNode
  value: string
  options: SearchableSelectOption[]
  placeholder?: string
  /** Adds a first option with this label that selects no restriction (an empty value). */
  allOptionLabel?: string
  helperText?: ReactNode
  allowCustomValue?: boolean
  required?: boolean
  disabled?: boolean
  readOnly?: boolean
  invalid?: boolean
  invalidText?: ReactNode
  onBlur?: () => void
  onFocus?: () => void
  onChange: (value: string) => void
}

const itemToString = (item: SearchableSelectOption | string | null | undefined): string =>
  typeof item === 'string' ? item : (item?.label ?? '')

export default function SearchableSelect({
  id,
  labelText,
  value,
  options,
  placeholder = 'Search and select',
  allOptionLabel,
  helperText,
  allowCustomValue = false,
  required = false,
  disabled = false,
  readOnly = false,
  invalid = false,
  invalidText,
  onBlur,
  onFocus,
  onChange,
}: SearchableSelectProps) {
  // A list that already has its own All option (or an empty value) keeps it as the All option.
  const listAllOption =
    allOptionLabel === undefined
      ? undefined
      : options.find(
          (option) =>
            option.value === '' || option.label.toLowerCase() === allOptionLabel.toLowerCase(),
        )
  const addedAllOption =
    allOptionLabel !== undefined && !listAllOption ? { value: '', label: allOptionLabel } : null
  const allOption = listAllOption ?? addedAllOption
  const items = addedAllOption ? [addedAllOption, ...options] : options
  const selectedItem =
    items.find((option) => option.value === value) ??
    (value ? { value, label: value } : (allOption ?? null))
  const allSelected = !!allOption && (value === '' || value === allOption.value)

  return (
    <ComboBox
      id={id}
      // With All selected there's nothing to clear.
      className={allSelected ? 'searchable-select--all' : undefined}
      titleText={labelText}
      items={items}
      selectedItem={selectedItem}
      itemToString={itemToString}
      shouldFilterItem={({ item, inputValue }) =>
        shouldFilterSearchableDropdownItem({ item, inputValue, optionCount: items.length })
      }
      placeholder={placeholder}
      helperText={helperText}
      allowCustomValue={allowCustomValue}
      aria-required={required || undefined}
      // Carbon links the error text but doesn't mark the input invalid.
      aria-invalid={invalid && !disabled && !readOnly ? true : undefined}
      disabled={disabled}
      readOnly={readOnly}
      invalid={invalid}
      invalidText={fieldErrorText(invalidText)}
      onBlur={onBlur}
      onFocus={() => onFocus?.()}
      onInputChange={(inputValue) => {
        if (allowCustomValue && inputValue !== value) {
          onChange(inputValue)
        }
      }}
      onChange={({ selectedItem, inputValue }) => {
        const nextValue =
          typeof selectedItem === 'string'
            ? selectedItem
            : (selectedItem?.value ?? (allowCustomValue ? (inputValue ?? '') : ''))
        if (nextValue !== value) {
          onChange(nextValue)
        }
      }}
    />
  )
}
