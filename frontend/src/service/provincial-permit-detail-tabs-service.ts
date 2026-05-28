import apiService from '@/service/api-service'
import { toSearchServiceError } from '@/service/search-service-fallback'

export type ProvincialPermitItemRow = {
  id: string
  timberMark: string
  species: string
  grade: string
  pieces: number
  volume: number
}

export type ProvincialPermitFeeRow = {
  id: string
  feeCode: string
  feeDescription: string
  amount: number
  status: string
  invoiceNumber: string
  receiptNumber: string
}

export type ProvincialPermitEventRow = {
  id: string
  eventDate: string
  eventType: string
  status: string
  reference: string
  notes: string
}

export type ProvincialPermitDetailTabsData = {
  items: ProvincialPermitItemRow[]
  fees: ProvincialPermitFeeRow[]
  gbmsEvents: ProvincialPermitEventRow[]
  oicItems: ProvincialPermitEventRow[]
  boicItems: ProvincialPermitEventRow[]
}

const parseArrayPayload = (payload: unknown): unknown[] | null => {
  if (Array.isArray(payload)) {
    return payload
  }

  if (!payload || typeof payload !== 'object') {
    return null
  }

  const objectPayload = payload as Record<string, unknown>
  if (Array.isArray(objectPayload.results)) {
    return objectPayload.results as unknown[]
  }
  if (Array.isArray(objectPayload.rows)) {
    return objectPayload.rows as unknown[]
  }
  if (Array.isArray(objectPayload.items)) {
    return objectPayload.items as unknown[]
  }
  if (Array.isArray(objectPayload.data)) {
    return objectPayload.data as unknown[]
  }

  return null
}

const asString = (value: unknown): string => {
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'number') {
    return String(value)
  }
  return ''
}

const asNumber = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return 0
}

const normalizePermitItemRow = (row: unknown, index: number): ProvincialPermitItemRow => {
  const source = (row ?? {}) as Record<string, unknown>
  return {
    id: asString(source.id || source.itemId || source.lineNumber || `item-${index + 1}`),
    timberMark: asString(source.timberMark || source.mark || source.timberMarkNumber),
    species: asString(source.species || source.speciesCode || source.speciesDescription),
    grade: asString(source.grade || source.gradeCode || source.gradeDescription),
    pieces: asNumber(source.pieces || source.pieceCount || source.numberOfPieces),
    volume: asNumber(source.volume || source.totalVolume || source.permitVolume),
  }
}

const normalizePermitFeeRow = (row: unknown, index: number): ProvincialPermitFeeRow => {
  const source = (row ?? {}) as Record<string, unknown>
  return {
    id: asString(source.id || source.feeId || source.lineNumber || `fee-${index + 1}`),
    feeCode: asString(source.feeCode || source.code),
    feeDescription: asString(source.feeDescription || source.description || source.feeType),
    amount: asNumber(source.amount || source.feeAmount || source.total),
    status: asString(source.status || source.feeStatus || source.state),
    invoiceNumber: asString(source.invoiceNumber || source.invoiceNo),
    receiptNumber: asString(source.receiptNumber || source.receiptNo),
  }
}

const normalizePermitEventRow = (row: unknown, index: number): ProvincialPermitEventRow => {
  const source = (row ?? {}) as Record<string, unknown>
  return {
    id: asString(source.id || source.eventId || source.lineNumber || `event-${index + 1}`),
    eventDate: asString(source.eventDate || source.date || source.createdDate || source.issueDate),
    eventType: asString(source.eventType || source.type || source.code),
    status: asString(source.status || source.state),
    reference: asString(source.reference || source.referenceNumber || source.number),
    notes: asString(source.notes || source.description || source.remark),
  }
}

const fetchRows = async <TRow>(
  path: string,
  normalize: (row: unknown, index: number) => TRow,
): Promise<TRow[]> => {
  try {
    const response = await apiService.getAxiosInstance().get(path)
    if (response.status === 204) {
      return []
    }

    const payloadRows = parseArrayPayload(response.data)
    if (!payloadRows) {
      throw new Error(`Invalid list response from ${path}`)
    }

    return payloadRows.map(normalize)
  } catch (error) {
    throw toSearchServiceError(`Unable to load permit tab data from ${path}.`, error)
  }
}

export const fetchProvincialPermitDetailTabs = async (
  permitNumber: string,
): Promise<ProvincialPermitDetailTabsData> => {
  const [items, fees, gbmsEvents, oicItems, boicItems] = await Promise.all([
    fetchRows(`/lexis/permits/${encodeURIComponent(permitNumber)}/items`, normalizePermitItemRow),
    fetchRows(`/lexis/permits/${encodeURIComponent(permitNumber)}/fees`, normalizePermitFeeRow),
    fetchRows(`/lexis/permits/${encodeURIComponent(permitNumber)}/gbms`, normalizePermitEventRow),
    fetchRows(
      `/lexis/permits/${encodeURIComponent(permitNumber)}/oic-items`,
      normalizePermitEventRow,
    ),
    fetchRows(
      `/lexis/permits/${encodeURIComponent(permitNumber)}/boic-items`,
      normalizePermitEventRow,
    ),
  ])

  return {
    items,
    fees,
    gbmsEvents,
    oicItems,
    boicItems,
  }
}
