import apiService from '@/service/api-service'
import {
  DEFAULT_PAYLOAD_ARRAY_KEYS,
  parsePayloadArray,
  payloadValueAsNumber,
  payloadValueAsString as asString,
} from '@/service/payload-utils'
import { toSearchServiceError } from '@/service/search-service-fallback'
import { recordOrEmpty } from '@/utils/record'

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

export type ProvincialPermitDetailTabsRequest = {
  permitNumber: string
  receiptNumber?: string | number | null
}

const PERMIT_TAB_CACHE_TTL_MS = 30_000
const PERMIT_TAB_ARRAY_KEYS = ['scaleList', ...DEFAULT_PAYLOAD_ARRAY_KEYS]

export const EMPTY_PROVINCIAL_PERMIT_DETAIL_TABS: ProvincialPermitDetailTabsData = {
  items: [],
  fees: [],
  gbmsEvents: [],
  oicItems: [],
  boicItems: [],
}

const asNumber = (value: unknown): number => {
  return payloadValueAsNumber(value, (input) => input.replace(/[$,\s]/g, ''))
}

const normalizePermitItemRow = (row: unknown, index: number): ProvincialPermitItemRow => {
  const source = recordOrEmpty(row)
  return {
    id: asString(
      source.id ||
        source.itemId ||
        source.lineNumber ||
        source.exportScaleDetailId ||
        `item-${index + 1}`,
    ),
    timberMark: asString(
      source.timberMark || source.timbermark || source.mark || source.timberMarkNumber,
    ),
    species: asString(source.species || source.speciesCode || source.speciesDescription),
    grade: asString(source.grade || source.gradeCode || source.gradeDescription),
    pieces: asNumber(source.pieces || source.pieceCount || source.numberOfPieces),
    volume: asNumber(source.volume || source.totalVolume || source.permitVolume),
  }
}

const normalizeScaleFeeRow = (row: unknown, index: number): ProvincialPermitFeeRow => {
  const source = recordOrEmpty(row)
  const feeCode = asString(source.fil || source.feeCode || source.code)
  const descriptor = [
    asString(source.timberMark || source.timbermark),
    asString(source.species),
    asString(source.grade),
  ]
    .filter(Boolean)
    .join(' / ')

  return {
    id: asString(source.id || source.feeId || source.lineNumber || `fee-${index + 1}`),
    feeCode: feeCode || 'Scale',
    feeDescription:
      descriptor || asString(source.description || source.feeType) || 'Permit scale fee',
    amount: asNumber(source.fee || source.amount || source.feeAmount || source.total),
    status: asString(source.status || source.feeStatus || source.state),
    invoiceNumber: asString(source.invoiceNumber || source.invoiceNo),
    receiptNumber: asString(source.receiptNumber || source.receiptNo),
  }
}

const normalizeGbmsHistoryRow = (row: unknown, index: number): ProvincialPermitEventRow => {
  const source = recordOrEmpty(row)
  const cancelledByInvoice = asString(source.cancelledByInvoice)
  const replacedByInvoice = asString(source.replacedByInvoice)
  const invoiceAmount = asString(source.invoiceAmount)
  const notes = [
    cancelledByInvoice ? `Cancelled by ${cancelledByInvoice}` : '',
    replacedByInvoice ? `Replaced by ${replacedByInvoice}` : '',
    invoiceAmount ? `Amount ${invoiceAmount}` : '',
  ]
    .filter(Boolean)
    .join('; ')

  return {
    id: asString(source.id || source.gbmsInvoiceNumber || `gbms-${index + 1}`),
    eventDate: asString(source.printedDate || source.entryDate || source.updateDate),
    eventType: 'GBMS Invoice',
    status: cancelledByInvoice || replacedByInvoice ? 'Updated' : 'Current',
    reference: asString(source.gbmsInvoiceNumber),
    notes,
  }
}

const fetchRows = async <TRow>(
  path: string,
  normalize: (row: unknown, index: number) => TRow,
  config?: Parameters<typeof apiService.getCachedResponse>[1],
): Promise<TRow[]> => {
  try {
    const response = await apiService.getCachedResponse<unknown>(path, config, {
      ttlMs: PERMIT_TAB_CACHE_TTL_MS,
    })
    if (response.status === 204) {
      return []
    }

    const payloadRows = parsePayloadArray(response.data, PERMIT_TAB_ARRAY_KEYS)
    if (!payloadRows) {
      throw new Error(`Invalid list response from ${path}`)
    }

    return payloadRows.map(normalize)
  } catch (error) {
    throw toSearchServiceError(`Unable to load permit tab data from ${path}.`, error)
  }
}

const fetchOptionalRows = async <TRow>(
  path: string,
  normalize: (row: unknown, index: number) => TRow,
  config?: Parameters<typeof apiService.getCachedResponse>[1],
): Promise<TRow[]> => {
  try {
    return await fetchRows(path, normalize, config)
  } catch {
    return []
  }
}

const fetchPackageList = async (permitNumber: string): Promise<string[]> => {
  try {
    const response = await apiService.getCachedResponse<unknown>(
      '/lexis/rpc/permit-details/package-list',
      {
        params: {
          permitNumber,
        },
      },
      { ttlMs: PERMIT_TAB_CACHE_TTL_MS },
    )
    if (response.status === 204) {
      return []
    }

    const objectPayload = recordOrEmpty(response.data)
    const packageList = Array.isArray(objectPayload.packageList) ? objectPayload.packageList : []
    return packageList
      .map(asString)
      .filter((packageNumber) => packageNumber && packageNumber !== 'No Packages')
  } catch {
    return []
  }
}

const fetchScaleRows = async (permitNumber: string, packageNumber: string): Promise<unknown[]> => {
  try {
    const response = await apiService.getCachedResponse<unknown>(
      '/lexis/rpc/permit-details/scale-fees-for-package',
      {
        params: {
          packageNumber,
          permitNumber,
        },
      },
      { ttlMs: PERMIT_TAB_CACHE_TTL_MS },
    )
    if (response.status === 204) {
      return []
    }

    return parsePayloadArray(response.data, PERMIT_TAB_ARRAY_KEYS) ?? []
  } catch {
    return []
  }
}

const fetchGbmsRows = async (
  permitNumber: string,
  receiptNumber: string | number | null | undefined,
): Promise<ProvincialPermitEventRow[]> => {
  const normalizedReceiptNumber = asString(receiptNumber)
  if (!normalizedReceiptNumber) {
    return []
  }

  return fetchOptionalRows(
    '/lexis/rpc/permit-details/gbms-invoice-history',
    normalizeGbmsHistoryRow,
    {
      params: {
        receiptNumber: normalizedReceiptNumber,
        permitNumber,
      },
    },
  )
}

export const fetchProvincialPermitDetailTabs = async (
  request: string | ProvincialPermitDetailTabsRequest,
): Promise<ProvincialPermitDetailTabsData> => {
  const permitNumber = typeof request === 'string' ? request : request.permitNumber
  const receiptNumber = typeof request === 'string' ? undefined : request.receiptNumber
  const packageList = await fetchPackageList(permitNumber)

  const packageScaleRows = await Promise.all(
    packageList.map((packageNumber) => fetchScaleRows(permitNumber, packageNumber)),
  )
  const scaleRows = packageScaleRows.flat()
  const gbmsEvents = await fetchGbmsRows(permitNumber, receiptNumber)

  return {
    items: scaleRows.map(normalizePermitItemRow),
    fees: scaleRows.map(normalizeScaleFeeRow),
    gbmsEvents,
    oicItems: [],
    boicItems: [],
  }
}
