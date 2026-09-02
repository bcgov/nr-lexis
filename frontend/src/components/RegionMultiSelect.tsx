import { FilterableMultiSelect } from '@carbon/react'
import type { ReactNode } from 'react'

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
  disabled = false,
  invalid = false,
  invalidText,
  onChange,
}: RegionMultiSelectProps) {
  return (
    <div className="region-multi-select">
      <FilterableMultiSelect
        id={id}
        titleText={titleText}
        items={items}
        itemToString={itemToString}
        placeholder={placeholder}
        selectedItems={selectedItems}
        disabled={disabled}
        invalid={invalid}
        invalidText={invalidText}
        onChange={({ selectedItems: nextSelectedItems }) => {
          onChange(nextSelectedItems)
        }}
      />
    </div>
  )
}
