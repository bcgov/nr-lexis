type SearchableDropdownItem = {
  label: string
  value: string
}

const SHORT_OPTION_LIST_LIMIT = 10

const shouldShowAllOptions = (optionCount: number): boolean => optionCount < SHORT_OPTION_LIST_LIMIT

export const shouldFilterSearchableDropdownItem = <T extends SearchableDropdownItem>({
  item,
  inputValue,
  optionCount,
}: {
  item: T
  inputValue: string | null
  optionCount: number
}): boolean => {
  if (shouldShowAllOptions(optionCount)) {
    return true
  }

  const query = inputValue?.trim().toLowerCase()
  if (!query) {
    return true
  }

  return item.label.toLowerCase().includes(query) || item.value.toLowerCase().includes(query)
}
