export const parseCsvParam = (value: string | null): string[] => {
  if (!value) {
    return []
  }

  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

export const DEFAULT_SEARCH_PAGE = 1
export const DEFAULT_SEARCH_PAGE_SIZE = 100
export const SEARCH_PAGE_SIZE_OPTIONS = [20, 50, 100, 200] as const

type SearchParamValue = string | number | string[] | null | undefined

type PagedSearchResponse = {
  content: unknown[]
  page: {
    number: number
    size: number
    totalElements: number
    totalPages: number
  }
}

export const createEmptyPagedSearchResponse = <TResponse extends PagedSearchResponse>(
  pageSize = DEFAULT_SEARCH_PAGE_SIZE,
): TResponse =>
  ({
    content: [],
    page: {
      number: 0,
      size: pageSize,
      totalElements: 0,
      totalPages: 1,
    },
  }) as unknown as TResponse

export const appendSearchParamsToPath = (path: string, searchParams: URLSearchParams): string => {
  const query = searchParams.toString()
  return query.length > 0 ? `${path}?${query}` : path
}

export const searchParamsWithValue = (
  searchParams: URLSearchParams,
  key: string,
  value: string,
): URLSearchParams => {
  const nextSearchParams = new URLSearchParams(searchParams)
  if (value.trim().length > 0) {
    nextSearchParams.set(key, value)
  } else {
    nextSearchParams.delete(key)
  }

  return nextSearchParams
}

export type IdTextOption = {
  id: string
  text: string
}

export type ValueLabelOption = {
  value: string
  label: string
}

export const mapValueLabelOptionsToIdTextOptions = (options: ValueLabelOption[]): IdTextOption[] =>
  options.map((option) => ({
    id: option.value,
    text: option.label,
  }))

export const mapSelectedOptionsById = <TOption extends IdTextOption>(
  selectedIds: string[],
  options: TOption[],
  fallbackText = (selectedId: string): string => selectedId,
): TOption[] => {
  const optionMap = new Map(options.map((option) => [option.id, option]))
  return selectedIds.map(
    (selectedId) =>
      optionMap.get(selectedId) ?? ({ id: selectedId, text: fallbackText(selectedId) } as TOption),
  )
}

export const parsePositiveIntParam = (value: string | null, fallback: number): number => {
  if (!value) {
    return fallback
  }

  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback
  }

  return parsed
}

export const parsePageSizeParam = <TPageSize extends number>(
  value: string | null,
  fallback: TPageSize,
  validPageSizes: readonly TPageSize[],
): TPageSize => {
  const parsed = parsePositiveIntParam(value, fallback)
  return validPageSizes.includes(parsed as TPageSize) ? (parsed as TPageSize) : fallback
}

export const parseSortDirectionParam = (
  value: string | null,
  fallback: 'asc' | 'desc',
): 'asc' | 'desc' => {
  if (!value) {
    return fallback
  }

  const normalized = value.trim().toLowerCase()
  if (normalized === 'asc' || normalized === 'desc') {
    return normalized
  }

  return fallback
}

export const getNextSortDirection = <TField extends string>(
  currentField: TField,
  currentDirection: 'asc' | 'desc',
  nextField: TField,
): 'asc' | 'desc' => (currentField === nextField && currentDirection === 'asc' ? 'desc' : 'asc')

export const parseEnumParam = <TValue extends string>(
  value: string | null,
  validValues: readonly TValue[],
  fallback: TValue,
): TValue => {
  if (!value) {
    return fallback
  }

  const normalized = value.trim()
  if (!normalized) {
    return fallback
  }

  return validValues.includes(normalized as TValue) ? (normalized as TValue) : fallback
}

export const setSearchParam = (
  params: URLSearchParams,
  key: string,
  value: SearchParamValue,
): void => {
  if (value == null) {
    return
  }

  if (Array.isArray(value)) {
    const normalized = value.map((item) => item.trim()).filter((item) => item.length > 0)
    if (normalized.length > 0) {
      params.set(key, normalized.join(','))
    }
    return
  }

  if (typeof value === 'number') {
    params.set(key, String(value))
    return
  }

  const normalized = value.trim()
  if (normalized.length > 0) {
    params.set(key, normalized)
  }
}

export const createSearchParams = (
  entries: readonly (readonly [string, SearchParamValue])[],
): URLSearchParams => {
  const params = new URLSearchParams()
  entries.forEach(([key, value]) => setSearchParam(params, key, value))
  return params
}
