import { ComboBox } from '@carbon/react'
import { useMemo, useState, type ReactNode } from 'react'
import { fieldErrorText } from '@/utils/field-error'
import './PermitCountrySelect.scss'

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

const PREFERRED_COUNTRY_CODES = ['US', 'JP', 'CN', 'KR', 'TW', 'CA']

const itemToString = (item: PermitCountrySelectOption | null | undefined): string =>
  item?.label ?? ''

/** Type-ahead matches the start of the country name, or its exact two-letter code. */
const matchesCountrySearch = (item: PermitCountrySelectOption, inputValue: string): boolean => {
  const query = inputValue.trim().toLocaleLowerCase()
  return (
    !query ||
    item.label.toLocaleLowerCase().startsWith(query) ||
    item.value.toLocaleLowerCase() === query
  )
}

/**
 * Keeps the legacy country ordering useful without hiding active country codes.
 * Preferred countries appear once at the top, followed by a divider and the remaining
 * countries alphabetically. Search keeps preferred matches first without a group divider.
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
  const availableOptions = useMemo(
    () => (selectedItem && !options.includes(selectedItem) ? [...options, selectedItem] : options),
    [options, selectedItem],
  )
  const preferredOptions = useMemo(
    () =>
      PREFERRED_COUNTRY_CODES.flatMap((code) => {
        const option = availableOptions.find(({ value }) => value === code)
        return option ? [option] : []
      }),
    [availableOptions],
  )
  const otherOptions = useMemo(
    () =>
      availableOptions
        .filter(({ value }) => !PREFERRED_COUNTRY_CODES.includes(value))
        .sort((left, right) => left.label.localeCompare(right.label, 'en')),
    [availableOptions],
  )
  const isSearching = Boolean(inputText.trim()) && inputText !== selectedItem?.label
  const visibleOptions = useMemo(
    () => [...preferredOptions, ...otherOptions],
    [preferredOptions, otherOptions],
  )

  return (
    <ComboBox
      id={id}
      // Clearing a required country only leaves it empty.
      className={['permit-country-select', required && value && 'lexis-combobox--no-clear']
        .filter(Boolean)
        .join(' ')}
      titleText={labelText}
      items={visibleOptions}
      selectedItem={selectedItem}
      itemToString={itemToString}
      itemToElement={(item) => (
        <span
          className={
            !isSearching && preferredOptions.length > 0 && item === otherOptions[0]
              ? 'permit-country-select__after-preferred'
              : undefined
          }
        >
          {item.label}
        </span>
      )}
      shouldFilterItem={({ item, inputValue }) =>
        inputValue === selectedItem?.label || matchesCountrySearch(item, inputValue ?? '')
      }
      placeholder={placeholder}
      aria-required={required || undefined}
      // Carbon links the error text but doesn't mark the input invalid.
      aria-invalid={invalid && !disabled ? true : undefined}
      disabled={disabled}
      invalid={invalid}
      invalidText={fieldErrorText(invalidText)}
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
