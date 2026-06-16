export type DocumentRowBase = {
  id: string
  name: string
  description: string
  type: string
}

const DEFAULT_ARRAY_KEYS = ['results', 'rows', 'items', 'data']

export const documentValueAsString = (value: unknown): string => {
  if (typeof value === 'string') {
    return value.trim()
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }
  return ''
}

export const documentValueAsBoolean = (value: unknown): boolean => {
  if (typeof value === 'boolean') {
    return value
  }
  if (typeof value === 'string') {
    return value.trim().toLowerCase() === 'true'
  }
  return false
}

export const parseDocumentArrayPayload = (
  payload: unknown,
  extraKeys: string[] = [],
): unknown[] | null => {
  if (Array.isArray(payload)) {
    return payload
  }

  if (!payload || typeof payload !== 'object') {
    return null
  }

  const objectPayload = payload as Record<string, unknown>
  for (const key of [...DEFAULT_ARRAY_KEYS, ...extraKeys]) {
    if (Array.isArray(objectPayload[key])) {
      return objectPayload[key]
    }
  }

  return null
}

export const normalizeDocumentRowBase = (row: unknown, index: number): DocumentRowBase => {
  const source = (row ?? {}) as Record<string, unknown>
  const fallbackId = `document-${index + 1}`
  return {
    id: documentValueAsString(source.id || source.fileId || fallbackId) || fallbackId,
    name: documentValueAsString(source.name || source.fileName) || `Document ${index + 1}`,
    description: documentValueAsString(source.description || source.fileDescription),
    type: documentValueAsString(source.type || source.attachmentTypeDescription),
  }
}

export const parseRemoveDocumentSuccess = (payload: unknown): boolean => {
  if (typeof payload === 'boolean') {
    return payload
  }

  if (!payload || typeof payload !== 'object') {
    return false
  }

  const objectPayload = payload as Record<string, unknown>
  if ('success' in objectPayload) {
    return documentValueAsBoolean(objectPayload.success)
  }
  if ('removed' in objectPayload) {
    return documentValueAsBoolean(objectPayload.removed)
  }
  if ('valid' in objectPayload) {
    return documentValueAsBoolean(objectPayload.valid)
  }

  return false
}
