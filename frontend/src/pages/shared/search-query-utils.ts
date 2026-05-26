export const parseCsvParam = (value: string | null): string[] => {
  if (!value) {
    return []
  }

  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
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
  value: string | number | string[] | null | undefined,
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
