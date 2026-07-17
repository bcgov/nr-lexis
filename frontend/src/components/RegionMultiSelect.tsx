import { DismissibleTag, FilterableMultiSelect } from '@carbon/react'
import { useMemo, useRef, useState, type ReactNode } from 'react'

export type RegionMultiSelectOption = {
  id: string
  text: string
}

type SelectAllRegionsOption = {
  selectAllRegions: true
  text: string
}

export type RegionMultiSelectProps = {
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

const isSelectAllRegionsOption = (
  item: RegionMultiSelectOption | SelectAllRegionsOption,
): item is SelectAllRegionsOption => 'selectAllRegions' in item

const itemToString = (item: RegionMultiSelectOption | SelectAllRegionsOption | null): string =>
  item?.text ?? ''

const selectionSignature = (items: RegionMultiSelectOption[]): string =>
  items.map((item) => `${item.id}:${item.text}`).join('|')

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
  const containerRef = useRef<HTMLDivElement>(null)
  const incomingSelectionSignature = selectionSignature(selectedItems)
  const [selectionState, setSelectionState] = useState(() => ({
    incomingSelectionSignature,
    displayedSelectedItems: selectedItems,
  }))
  let displayedSelectedItems = selectionState.displayedSelectedItems

  if (selectionState.incomingSelectionSignature !== incomingSelectionSignature) {
    displayedSelectedItems = selectedItems
    setSelectionState({
      incomingSelectionSignature,
      displayedSelectedItems: selectedItems,
    })
  }
  const selectableItems = useMemo<Array<RegionMultiSelectOption | SelectAllRegionsOption>>(
    () => [
      {
        selectAllRegions: true,
        text: 'Select all shown regions',
      },
      ...items,
    ],
    [items],
  )

  const updateSelection = (nextSelectedItems: RegionMultiSelectOption[]) => {
    setSelectionState({
      incomingSelectionSignature,
      displayedSelectedItems: nextSelectedItems,
    })
    onChange(nextSelectedItems)
  }

  const removeRegion = (regionId: string) => {
    updateSelection(displayedSelectedItems.filter((item) => item.id !== regionId))
    containerRef.current?.querySelector<HTMLInputElement>('input[role="combobox"]')?.focus()
  }

  return (
    <div className="region-multi-select" ref={containerRef}>
      <FilterableMultiSelect
        id={id}
        titleText={titleText}
        items={selectableItems}
        itemToString={itemToString}
        placeholder={placeholder}
        selectedItems={displayedSelectedItems}
        selectionFeedback="fixed"
        disabled={disabled}
        invalid={invalid}
        invalidText={invalidText}
        filterItems={(availableItems, { inputValue }) => {
          const normalizedInput = inputValue?.trim().toLowerCase()
          if (!normalizedInput) {
            return [...availableItems]
          }

          return availableItems.filter(
            (item) =>
              isSelectAllRegionsOption(item) || item.text.toLowerCase().includes(normalizedInput),
          )
        }}
        onChange={({ selectedItems: nextSelectedItems }) => {
          if (nextSelectedItems.some(isSelectAllRegionsOption)) {
            const filterValue =
              containerRef.current
                ?.querySelector<HTMLInputElement>('input[role="combobox"]')
                ?.value.trim()
                .toLowerCase() ?? ''
            const shownRegions = items.filter(
              (item) => !filterValue || item.text.toLowerCase().includes(filterValue),
            )
            const shownRegionIds = new Set(shownRegions.map((item) => item.id))
            const selectedRegionIds = new Set(displayedSelectedItems.map((item) => item.id))
            const allShownRegionsSelected = shownRegions.every((item) =>
              selectedRegionIds.has(item.id),
            )

            updateSelection(
              allShownRegionsSelected
                ? displayedSelectedItems.filter((item) => !shownRegionIds.has(item.id))
                : [
                    ...displayedSelectedItems,
                    ...shownRegions.filter((item) => !selectedRegionIds.has(item.id)),
                  ],
            )
            return
          }

          updateSelection(
            nextSelectedItems.filter(
              (item): item is RegionMultiSelectOption => !isSelectAllRegionsOption(item),
            ),
          )
        }}
      />
      {displayedSelectedItems.length > 0 && (
        <ul className="region-multi-select__tags" aria-label="Selected regions">
          {displayedSelectedItems.map((item) => (
            <li key={item.id}>
              <DismissibleTag
                type="blue"
                text={item.text}
                title={`Remove ${item.text}`}
                dismissTooltipLabel={`Remove ${item.text}`}
                disabled={disabled}
                onClose={() => removeRegion(item.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
