type SearchableDropdownItem = {
  label: string
  value: string
}

const SHORT_OPTION_LIST_LIMIT = 10

const shouldShowAllOptions = (optionCount: number): boolean => optionCount < SHORT_OPTION_LIST_LIMIT

/**
 * Whether an option stays in the list for the text typed so far. A caller that passes the
 * selected option's label shows every option while the input is empty or still holds that
 * label, then filters by label or value as the user types, in short and long lists alike.
 * Without a selected label, lists under ten options always show every option.
 */
export const shouldFilterSearchableDropdownItem = <T extends SearchableDropdownItem>({
  item,
  inputValue,
  optionCount,
  selectedLabel,
}: {
  item: T
  inputValue: string | null
  optionCount: number
  selectedLabel?: string
}): boolean => {
  const query = inputValue?.trim().toLowerCase()
  if (!query) {
    return true
  }

  if (selectedLabel === undefined) {
    if (shouldShowAllOptions(optionCount)) {
      return true
    }
  } else if (query === selectedLabel.trim().toLowerCase()) {
    return true
  }

  return item.label.toLowerCase().includes(query) || item.value.toLowerCase().includes(query)
}
