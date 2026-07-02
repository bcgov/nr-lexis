import { displayValue, normalizeFilterText } from '@/utils/text'

export { displayValue, normalizeFilterText }

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
