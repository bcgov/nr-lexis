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
