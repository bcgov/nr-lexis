export type UnknownRecord = Record<string, unknown>

export const isRecord = (value: unknown): value is UnknownRecord =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

export const recordOrEmpty = (value: unknown): UnknownRecord => (isRecord(value) ? value : {})

export const stringField = (record: UnknownRecord, field: string): string => {
  const value = record[field]
  return typeof value === 'string' ? value.trim() : ''
}

export const firstStringField = (record: UnknownRecord, fields: string[]): string => {
  for (const field of fields) {
    const value = stringField(record, field)
    if (value) {
      return value
    }
  }
  return ''
}

export const booleanField = (record: UnknownRecord, field: string): boolean =>
  record[field] === true

export const mapRecordArray = <T>(
  value: unknown,
  mapRecord: (record: UnknownRecord) => T | null,
): T[] => {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((entry) => (isRecord(entry) ? mapRecord(entry) : null))
    .filter((entry): entry is T => entry !== null)
}
