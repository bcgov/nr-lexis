import { FilterableMultiSelect } from '@carbon/react'
import type { ReactNode } from 'react'
import { fieldErrorText } from '@/utils/field-error'

export type RegionMultiSelectOption = {
  id: string
  text: string
}

type RegionMultiSelectProps = {
  id: string
  titleText?: ReactNode
  items: RegionMultiSelectOption[]
  selectedItems: RegionMultiSelectOption[]
  placeholder?: string
  required?: boolean
  disabled?: boolean
  invalid?: boolean
  invalidText?: ReactNode
  /** Names the chosen regions after the count tag, as a record form does. Filters show the count. */
  showSelectedNames?: boolean
  onChange: (selectedItems: RegionMultiSelectOption[]) => void
}

const itemToString = (item: RegionMultiSelectOption | null): string => item?.text ?? ''

export default function RegionMultiSelect({
  id,
  titleText = 'Region',
  items,
  selectedItems,
  placeholder = 'Select region(s)',
  required = false,
  disabled = false,
  invalid = false,
  invalidText,
  showSelectedNames = false,
  onChange,
}: RegionMultiSelectProps) {
  const errorText = fieldErrorText(invalidText)
  const errorId = `${id}-error-msg`
  const describedByError = invalid && !!errorText
  const selectedNames = selectedItems.map(itemToString).join(', ')
  return (
    <div
      className={`region-multi-select${
        showSelectedNames && selectedItems.length > 0 ? ' region-multi-select--named' : ''
      }`}
    >
      <FilterableMultiSelect
        id={id}
        titleText={titleText}
        items={items}
        itemToString={itemToString}
        // With regions selected, the count tag stands alone, or a form names them beside it.
        placeholder={
          selectedItems.length === 0 ? placeholder : showSelectedNames ? selectedNames : undefined
        }
        selectedItems={selectedItems}
        inputProps={{
          'aria-required': required || undefined,
          'aria-invalid': (invalid && !disabled) || undefined,
          // Carbon doesn't link its error text to the input.
          ...(describedByError ? { 'aria-describedby': errorId } : {}),
        }}
        disabled={disabled}
        invalid={invalid}
        invalidText={describedByError ? <span id={errorId}>{errorText}</span> : errorText}
        onChange={({ selectedItems: nextSelectedItems }) => {
          onChange(nextSelectedItems)
        }}
      />
    </div>
  )
}
