const DEFAULT_ARRAY_KEYS = ['results', 'rows', 'items', 'data']

export const payloadValueAsString = (value: unknown): string => {
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'number') {
    return String(value)
  }
  return ''
}

export const payloadValueAsTrimmedString = (value: unknown): string =>
  payloadValueAsString(value).trim()

export const payloadValueAsNumber = (
  value: unknown,
  normalizeString: (value: string) => string = (input) => input,
): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(normalizeString(value))
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return 0
}

export const payloadValueAsBoolean = (value: unknown): boolean => {
  if (typeof value === 'boolean') {
    return value
  }
  if (typeof value === 'string') {
    return value.trim().toLowerCase() === 'true'
  }
  return false
}

export const payloadValueAsStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return []
  }
  return value
    .map((entry) => payloadValueAsTrimmedString(entry))
    .filter((entry) => entry.length > 0)
}

export const parsePayloadArray = (
  payload: unknown,
  keys: string[] = DEFAULT_ARRAY_KEYS,
): unknown[] | null => {
  if (Array.isArray(payload)) {
    return payload
  }

  if (!payload || typeof payload !== 'object') {
    return null
  }

  const objectPayload = payload as Record<string, unknown>
  for (const key of keys) {
    if (Array.isArray(objectPayload[key])) {
      return objectPayload[key]
    }
  }

  return null
}

export const parsePayloadArrayOrEmpty = (
  payload: unknown,
  keys: string[] = DEFAULT_ARRAY_KEYS,
): unknown[] => parsePayloadArray(payload, keys) ?? []
