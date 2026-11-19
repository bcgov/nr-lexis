import { FilterableMultiSelect } from '@carbon/react'
import type { ReactNode } from 'react'
import SelectedItemTags from '@/components/SelectedItemTags'
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
  onChange,
}: RegionMultiSelectProps) {
  const errorText = fieldErrorText(invalidText)
  const errorId = `${id}-error-msg`
  const describedByError = invalid && !!errorText
  return (
    <div className="region-multi-select">
      <FilterableMultiSelect
        id={id}
        titleText={titleText}
        items={items}
        itemToString={itemToString}
        // With regions selected, the count tag stands alone and the tags below name them.
        placeholder={selectedItems.length === 0 ? placeholder : undefined}
        selectedItems={selectedItems}
        // Regions keep the order they are given, before and after being selected.
        sortItems={(regions) => [...regions]}
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
      <SelectedItemTags
        items={selectedItems}
        itemKey={(region) => region.id}
        itemText={itemToString}
        disabled={disabled}
        onRemove={(region) => onChange(selectedItems.filter((item) => item.id !== region.id))}
      />
    </div>
  )
}
