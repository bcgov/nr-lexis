import { ComboBox } from '@carbon/react'
import type { ReactNode } from 'react'
import { shouldFilterSearchableDropdownItem } from './dropdown-filtering'

export type SearchableSelectOption = {
  value: string
  label: string
}

export type SearchableSelectProps = {
  id: string
  labelText: ReactNode
  value: string
  options: SearchableSelectOption[]
  placeholder?: string
  allowCustomValue?: boolean
  disabled?: boolean
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
  allowCustomValue = false,
  disabled = false,
  invalid = false,
  invalidText,
  onBlur,
  onFocus,
  onChange,
}: SearchableSelectProps) {
  const selectedItem =
    options.find((option) => option.value === value) ?? (value ? { value, label: value } : null)

  return (
    <ComboBox
      id={id}
      titleText={labelText}
      items={options}
      selectedItem={selectedItem}
      itemToString={itemToString}
      shouldFilterItem={({ item, inputValue }) =>
        shouldFilterSearchableDropdownItem({ item, inputValue, optionCount: options.length })
      }
      placeholder={placeholder}
      allowCustomValue={allowCustomValue}
      disabled={disabled}
      invalid={invalid}
      invalidText={invalidText}
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
