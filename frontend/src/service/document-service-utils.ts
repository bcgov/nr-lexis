import {
  DEFAULT_PAYLOAD_ARRAY_KEYS,
  parsePayloadArray,
  payloadValueAsBoolean,
} from '@/service/payload-utils'
import { isRecord, recordOrEmpty } from '@/utils/record'

export type DocumentRowBase = {
  id: string
  name: string
  description: string
  type: string
  source?: string
  deletable?: boolean
}

export const documentValueAsString = (value: unknown): string => {
  if (typeof value === 'string') {
    return value.trim()
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }
  return ''
}

export const documentValueAsBoolean = payloadValueAsBoolean

export const documentValueAsStringArray = (payload: unknown): string[] => {
  if (!Array.isArray(payload)) {
    return []
  }

  return payload.map((entry) => documentValueAsString(entry)).filter((entry) => entry.length > 0)
}

export const parseDocumentArrayPayload = (
  payload: unknown,
  extraKeys: string[] = [],
): unknown[] | null => parsePayloadArray(payload, [...DEFAULT_PAYLOAD_ARRAY_KEYS, ...extraKeys])

export const normalizeDocumentRowBase = (row: unknown, index: number): DocumentRowBase => {
  const source = recordOrEmpty(row)
  const fallbackId = `document-${index + 1}`
  const rawDeletable = source.deletable ?? source.canDelete
  return {
    id: documentValueAsString(source.id || source.fileId || fallbackId) || fallbackId,
    name: documentValueAsString(source.name || source.fileName) || `Document ${index + 1}`,
    description: documentValueAsString(source.description || source.fileDescription),
    type: documentValueAsString(source.type || source.attachmentTypeDescription),
    source: documentValueAsString(source.source || source.origin),
    ...(rawDeletable === undefined ? {} : { deletable: documentValueAsBoolean(rawDeletable) }),
  }
}

export const formatDocumentSource = (source: string | undefined): string => {
  const normalized = documentValueAsString(source)
  return normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1).toLowerCase() : '-'
}

export const parseRemoveDocumentSuccess = (payload: unknown): boolean => {
  if (typeof payload === 'boolean') {
    return payload
  }

  if (!isRecord(payload)) {
    return false
  }

  if ('success' in payload) {
    return documentValueAsBoolean(payload.success)
  }
  if ('removed' in payload) {
    return documentValueAsBoolean(payload.removed)
  }
  if ('valid' in payload) {
    return documentValueAsBoolean(payload.valid)
  }

  return false
}
