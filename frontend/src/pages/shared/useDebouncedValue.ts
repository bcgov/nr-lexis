import { useEffect, useMemo, useState } from 'react'

const SEARCH_DEBOUNCE_MS = 250

export const useDebouncedValue = <T>(value: T, delayMs = SEARCH_DEBOUNCE_MS): T => {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedValue(value)
    }, delayMs)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [delayMs, value])

  return debouncedValue
}

export const useDebouncedSearchFilters = <
  TFilters extends object,
  TTextFilters extends Partial<TFilters>,
>(
  filters: TFilters,
  textFilters: TTextFilters,
  delayMs = SEARCH_DEBOUNCE_MS,
): TFilters => {
  const serializedTextFilters = JSON.stringify(textFilters)
  const stableTextFilters = useMemo(
    () => JSON.parse(serializedTextFilters) as TTextFilters,
    [serializedTextFilters],
  )
  const debouncedTextFilters = useDebouncedValue(stableTextFilters, delayMs)
  const serializedRequestFilters = JSON.stringify({
    ...filters,
    ...debouncedTextFilters,
  })

  return useMemo(() => JSON.parse(serializedRequestFilters) as TFilters, [serializedRequestFilters])
}
