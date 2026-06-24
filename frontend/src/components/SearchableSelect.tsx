import { ComboBox } from '@carbon/react'
import type { ReactNode } from 'react'

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
  disabled?: boolean
  invalid?: boolean
  invalidText?: ReactNode
  onBlur?: () => void
  onChange: (value: string) => void
}

const itemToString = (item: SearchableSelectOption | null | undefined): string => item?.label ?? ''

const shouldFilterItem = ({
  item,
  inputValue,
}: {
  item: SearchableSelectOption
  inputValue: string | null
}): boolean => {
  const query = inputValue?.trim().toLowerCase()
  if (!query) {
    return true
  }

  return item.label.toLowerCase().includes(query) || item.value.toLowerCase().includes(query)
}

export default function SearchableSelect({
  id,
  labelText,
  value,
  options,
  placeholder = 'Search and select',
  disabled = false,
  invalid = false,
  invalidText,
  onBlur,
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
      shouldFilterItem={shouldFilterItem}
      placeholder={placeholder}
      disabled={disabled}
      invalid={invalid}
      invalidText={invalidText}
      onBlur={onBlur}
      onChange={({ selectedItem }) => onChange(selectedItem?.value ?? '')}
    />
  )
}
