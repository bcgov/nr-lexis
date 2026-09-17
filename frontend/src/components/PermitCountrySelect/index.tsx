import { ComboBox } from '@carbon/react'
import { useMemo, useState, type ReactNode } from 'react'

export type PermitCountrySelectOption = {
  value: string
  label: string
}

type PermitCountrySelectProps = {
  id: string
  labelText: ReactNode
  value: string
  options: PermitCountrySelectOption[]
  placeholder?: string
  required?: boolean
  disabled?: boolean
  invalid?: boolean
  invalidText?: ReactNode
  onBlur?: () => void
  onChange: (value: string) => void
}

const PREFERRED_COUNTRY_COUNT = 6

const itemToString = (item: PermitCountrySelectOption | null | undefined): string =>
  item?.label ?? ''

const matchesCountrySearch = (item: PermitCountrySelectOption, inputValue: string): boolean => {
  const query = inputValue.trim().toLocaleLowerCase()
  return (
    !query ||
    item.label.toLocaleLowerCase().includes(query) ||
    item.value.toLocaleLowerCase().includes(query)
  )
}

/**
 * Keeps the legacy country ordering useful without hiding active country codes.
 * The source procedure orders its preferred countries first; an empty typeahead
 * therefore shows its first six entries, while typing searches the full list.
 */
export default function PermitCountrySelect({
  id,
  labelText,
  value,
  options,
  placeholder = 'Search and select a country',
  required = false,
  disabled = false,
  invalid = false,
  invalidText,
  onBlur,
  onChange,
}: PermitCountrySelectProps) {
  const [inputText, setInputText] = useState('')
  const selectedItem = useMemo<PermitCountrySelectOption | null>(
    () =>
      options.find((option) => option.value === value) ?? (value ? { value, label: value } : null),
    [options, value],
  )
  const preferredOptions = useMemo(() => options.slice(0, PREFERRED_COUNTRY_COUNT), [options])
  const isSearching = Boolean(inputText.trim()) && inputText !== selectedItem?.label
  const visibleOptions = useMemo(() => {
    if (isSearching) {
      return options
    }

    if (!selectedItem || preferredOptions.some((option) => option.value === selectedItem.value)) {
      return preferredOptions
    }

    return [...preferredOptions, selectedItem]
  }, [isSearching, options, preferredOptions, selectedItem])

  return (
    <ComboBox
      id={id}
      titleText={labelText}
      items={visibleOptions}
      selectedItem={selectedItem}
      itemToString={itemToString}
      shouldFilterItem={({ item, inputValue }) =>
        !isSearching || matchesCountrySearch(item, inputValue ?? '')
      }
      placeholder={placeholder}
      aria-required={required || undefined}
      disabled={disabled}
      invalid={invalid}
      invalidText={invalidText}
      onBlur={onBlur}
      onInputChange={setInputText}
      onChange={({ selectedItem: nextSelectedItem }) => {
        const nextValue = nextSelectedItem?.value ?? ''
        if (nextValue !== value) {
          onChange(nextValue)
        }
      }}
    />
  )
}
