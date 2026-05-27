import apiService from '@/service/api-service'
import { isMockFallbackEnabled, toSearchServiceError } from '@/service/search-service-fallback'

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

export type ProvincialPermitTabSource = 'api' | 'mock'

export type ProvincialPermitDetailTabsSources = {
  items: ProvincialPermitTabSource
  fees: ProvincialPermitTabSource
  gbmsEvents: ProvincialPermitTabSource
  oicItems: ProvincialPermitTabSource
  boicItems: ProvincialPermitTabSource
}

export type ProvincialPermitTabsFallbackContext = {
  permitVolume: number | null
  numberOfPieces: number | null
  invoiceNumber: string | null
  receiptNumber: string | null
  issueDate: string | null
}

export type ProvincialPermitDetailTabsResult = {
  data: ProvincialPermitDetailTabsData
  sources: ProvincialPermitDetailTabsSources
}

const FALLBACK_STATUSES = new Set([204, 404, 405, 500, 501, 502, 503])

const shouldFallbackToMock = (error: unknown): boolean => {
  const status = (error as any)?.response?.status
  if (typeof status === 'number') {
    return FALLBACK_STATUSES.has(status)
  }
  return true
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

const buildMockItems = (
  context: ProvincialPermitTabsFallbackContext,
): ProvincialPermitItemRow[] => {
  const pieces = context.numberOfPieces && context.numberOfPieces > 0 ? context.numberOfPieces : 120
  const volume = context.permitVolume && context.permitVolume > 0 ? context.permitVolume : 760

  return [
    {
      id: 'ITEM-1',
      timberMark: 'TMK-A100',
      species: 'HEM',
      grade: 'J',
      pieces: Math.round(pieces * 0.6),
      volume: Number((volume * 0.62).toFixed(2)),
    },
    {
      id: 'ITEM-2',
      timberMark: 'TMK-A101',
      species: 'FIR',
      grade: '2',
      pieces: Math.round(pieces * 0.4),
      volume: Number((volume * 0.38).toFixed(2)),
    },
  ]
}

const buildMockFees = (context: ProvincialPermitTabsFallbackContext): ProvincialPermitFeeRow[] => {
  return [
    {
      id: 'FEE-1',
      feeCode: 'FIL',
      feeDescription: 'Fee In Lieu',
      amount: 1280.45,
      status: 'Posted',
      invoiceNumber: context.invoiceNumber ?? 'INV-MOCK-1001',
      receiptNumber: context.receiptNumber ?? 'RCP-MOCK-2001',
    },
    {
      id: 'FEE-2',
      feeCode: 'ADM',
      feeDescription: 'Administration',
      amount: 145.75,
      status: 'Posted',
      invoiceNumber: context.invoiceNumber ?? 'INV-MOCK-1001',
      receiptNumber: context.receiptNumber ?? 'RCP-MOCK-2001',
    },
  ]
}

const buildMockEvents = (
  prefix: string,
  context: ProvincialPermitTabsFallbackContext,
): ProvincialPermitEventRow[] => {
  const issueDate = context.issueDate ?? '2026-01-01'

  return [
    {
      id: `${prefix}-1`,
      eventDate: issueDate,
      eventType: `${prefix}_CREATE`,
      status: 'Open',
      reference: `${prefix}-REF-001`,
      notes: `${prefix} event seeded from migration fallback data.`,
    },
    {
      id: `${prefix}-2`,
      eventDate: issueDate,
      eventType: `${prefix}_UPDATE`,
      status: 'Pending',
      reference: `${prefix}-REF-002`,
      notes: `${prefix} event pending backend endpoint parity.`,
    },
  ]
}

const fetchRows = async <TRow>(
  path: string,
  normalize: (row: unknown, index: number) => TRow,
): Promise<{ rows: TRow[]; source: ProvincialPermitTabSource }> => {
  try {
    const response = await apiService.getAxiosInstance().get(path)
    if (response.status === 204) {
      return {
        rows: [],
        source: 'api',
      }
    }

    const payloadRows = parseArrayPayload(response.data)
    if (!payloadRows) {
      throw new Error(`Invalid list response from ${path}`)
    }

    return {
      rows: payloadRows.map(normalize),
      source: 'api',
    }
  } catch (error) {
    if (shouldFallbackToMock(error) && isMockFallbackEnabled()) {
      return {
        rows: [],
        source: 'mock',
      }
    }
    throw toSearchServiceError(`Unable to load permit tab data from ${path}.`, error)
  }
}

export const fetchProvincialPermitDetailTabs = async (
  permitNumber: string,
  context: ProvincialPermitTabsFallbackContext,
): Promise<ProvincialPermitDetailTabsResult> => {
  const [itemsResult, feesResult, gbmsResult, oicResult, boicResult] = await Promise.all([
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

  const items = itemsResult.source === 'api' ? itemsResult.rows : buildMockItems(context)
  const fees = feesResult.source === 'api' ? feesResult.rows : buildMockFees(context)
  const gbmsEvents =
    gbmsResult.source === 'api' ? gbmsResult.rows : buildMockEvents('GBMS', context)
  const oicItems = oicResult.source === 'api' ? oicResult.rows : buildMockEvents('OIC', context)
  const boicItems = boicResult.source === 'api' ? boicResult.rows : buildMockEvents('BOIC', context)

  return {
    data: {
      items,
      fees,
      gbmsEvents,
      oicItems,
      boicItems,
    },
    sources: {
      items: itemsResult.source,
      fees: feesResult.source,
      gbmsEvents: gbmsResult.source,
      oicItems: oicResult.source,
      boicItems: boicResult.source,
    },
  }
}
