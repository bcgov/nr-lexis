export const displayValue = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined || value === '') {
    return 'Not provided'
  }
  return String(value)
}

export const normalizeFilterText = (value: string): string => value.trim().toLowerCase()

export const matchesFilter = (
  values: Array<string | number | null | undefined>,
  filterValue: string,
): boolean => {
  if (!filterValue.trim()) {
    return true
  }

  const normalizedFilter = normalizeFilterText(filterValue)
  return values.some((value) => normalizeFilterText(String(value ?? '')).includes(normalizedFilter))
}
