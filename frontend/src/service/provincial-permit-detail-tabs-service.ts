import apiService from '@/service/api-service'
import { LEGACY_FORM_CONTENT_TYPE, toUrlEncodedParams } from '@/service/legacy-form-utils'
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
  packageNumber: string
  permitNumber: string
  includedInPermit: boolean
}

export type ProvincialPermitPackageInfoRow = {
  packageNumber: string
  region: string
  speciesEndUseSort: string
  ageClass: string
  packageVolume: string
  averageLength: string
  averageTopDiameter: string
  productType: string
  currentPackageVolume: string
  status: string
  reprocessed: string
  comments: string
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
  packages: ProvincialPermitPackageInfoRow[]
  items: ProvincialPermitItemRow[]
  fees: ProvincialPermitFeeRow[]
  gbmsEvents: ProvincialPermitEventRow[]
  oicItems: ProvincialPermitEventRow[]
  boicItems: ProvincialPermitEventRow[]
}

export type ProvincialPermitDetailTabsRequest = {
  permitNumber: string
  receiptNumber?: string | number | null
  blanketOic?: boolean | null
}

export type UpdatePermitScaleAttachmentRequest = {
  scaleId: string
  permitNumber: string
  attachInd: boolean
}

export type UpdatePermitScaleAttachmentResult = {
  success: boolean
  message: string
  errors: string[]
  warnings: string[]
}

const PERMIT_TAB_CACHE_TTL_MS = 30_000
const PERMIT_TAB_ARRAY_KEYS = ['scaleList', ...DEFAULT_PAYLOAD_ARRAY_KEYS]

export const EMPTY_PROVINCIAL_PERMIT_DETAIL_TABS: ProvincialPermitDetailTabsData = {
  packages: [],
  items: [],
  fees: [],
  gbmsEvents: [],
  oicItems: [],
  boicItems: [],
}

const asNumber = (value: unknown): number => {
  return payloadValueAsNumber(value, (input) => input.replace(/[$,\s]/g, ''))
}

const asBoolean = (value: unknown): boolean => {
  if (typeof value === 'boolean') {
    return value
  }
  if (typeof value === 'number') {
    return value !== 0
  }
  return ['true', 't', 'yes', 'y', '1'].includes(asString(value).toLowerCase())
}

const asStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map(asString).filter(Boolean)
  }
  const normalized = asString(value)
  return normalized ? [normalized] : []
}

const normalizePermitItemRow = (
  row: unknown,
  index: number,
  packageNumber: string,
  currentPermitNumber: string,
): ProvincialPermitItemRow => {
  const source = recordOrEmpty(row)
  const rowPermitNumber = asString(
    source.permit || source.permitNumber || source.exportPermitDetailNumber,
  )
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
    packageNumber,
    permitNumber: rowPermitNumber,
    includedInPermit: rowPermitNumber === currentPermitNumber,
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

const fetchPackageList = async (permitNumber: string, blanketOic: boolean): Promise<string[]> => {
  const path = blanketOic
    ? '/lexis/rpc/permit-details/oic-package-list'
    : '/lexis/rpc/permit-details/package-list'

  try {
    const response = await apiService.getCachedResponse<unknown>(
      path,
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

const normalizePackageInfoRow = (
  packageNumber: string,
  payload: unknown,
): ProvincialPermitPackageInfoRow => {
  const source = recordOrEmpty(payload)
  return {
    packageNumber,
    region: asString(source.region),
    speciesEndUseSort: asString(source.enduse || source.endUse || source.speciesEndUseSort),
    ageClass: asString(source.ageclass || source.ageClass),
    packageVolume: asString(source.volume || source.packageVolume),
    averageLength: asString(source.length || source.averageLength),
    averageTopDiameter: asString(source.diameter || source.averageTopDiameter),
    productType: asString(source.productType),
    currentPackageVolume: '',
    status: '',
    reprocessed: '',
    comments: '',
  }
}

const normalizePackageDetailsFields = (
  payload: unknown,
): Pick<
  ProvincialPermitPackageInfoRow,
  'currentPackageVolume' | 'status' | 'reprocessed' | 'comments' | 'ageClass'
> => {
  const source = recordOrEmpty(payload)
  const statusCode = asString(source.status)
  const statusDescription = asString(source.statusDesc || source.statusDescription)

  return {
    currentPackageVolume: asString(source.volume || source.packageVolume),
    status: [statusCode, statusDescription].filter(Boolean).join(' - '),
    reprocessed: asString(source.reprocessed || source.reprocessedIndicator),
    comments: asString(source.comments),
    ageClass: asString(source.ageClass || source.ageclass),
  }
}

const fetchPackageDetails = async (
  packageNumber: string,
): Promise<
  Pick<
    ProvincialPermitPackageInfoRow,
    'currentPackageVolume' | 'status' | 'reprocessed' | 'comments' | 'ageClass'
  >
> => {
  try {
    const response = await apiService.getCachedResponse<unknown>(
      '/lexis/rpc/permit-details/package-details',
      {
        params: {
          packageNumber,
        },
      },
      { ttlMs: PERMIT_TAB_CACHE_TTL_MS },
    )

    return normalizePackageDetailsFields(response.status === 204 ? {} : response.data)
  } catch {
    return normalizePackageDetailsFields({})
  }
}

const fetchPackageInfo = async (
  packageNumber: string,
  blanketOic: boolean,
): Promise<ProvincialPermitPackageInfoRow> => {
  try {
    const response = await apiService.getCachedResponse<unknown>(
      '/lexis/rpc/permit-details/package-info',
      {
        params: {
          packageNumber,
        },
      },
      { ttlMs: PERMIT_TAB_CACHE_TTL_MS },
    )

    const packageInfo = normalizePackageInfoRow(
      packageNumber,
      response.status === 204 ? {} : response.data,
    )
    if (!blanketOic) {
      return packageInfo
    }

    const packageDetails = await fetchPackageDetails(packageNumber)
    return {
      ...packageInfo,
      ageClass: packageDetails.ageClass || packageInfo.ageClass,
      currentPackageVolume: packageDetails.currentPackageVolume,
      status: packageDetails.status,
      reprocessed: packageDetails.reprocessed,
      comments: packageDetails.comments,
    }
  } catch {
    return normalizePackageInfoRow(packageNumber, {})
  }
}

const fetchScaleRows = async (
  permitNumber: string,
  packageNumber: string,
  blanketOic: boolean,
): Promise<ProvincialPermitItemRow[]> => {
  try {
    const response = await apiService.getCachedResponse<unknown>(
      '/lexis/rpc/permit-details/scales-for-package',
      {
        params: {
          packageNumber,
        },
      },
      { ttlMs: PERMIT_TAB_CACHE_TTL_MS },
    )
    if (response.status === 204) {
      return []
    }

    const rows = parsePayloadArray(response.data, PERMIT_TAB_ARRAY_KEYS) ?? []
    const normalizedRows = rows.map((row, index) =>
      normalizePermitItemRow(row, index, packageNumber, permitNumber),
    )
    if (blanketOic) {
      return normalizedRows
    }
    return normalizedRows.filter((row) => !row.permitNumber || row.includedInPermit)
  } catch {
    return []
  }
}

const fetchScaleFeeRows = async (
  permitNumber: string,
  packageNumber: string,
): Promise<unknown[]> => {
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
  const blanketOic = typeof request === 'string' ? false : !!request.blanketOic
  const packageList = await fetchPackageList(permitNumber, blanketOic)

  const [packages, packageScaleRows, packageFeeRows] = await Promise.all([
    Promise.all(packageList.map((packageNumber) => fetchPackageInfo(packageNumber, blanketOic))),
    Promise.all(
      packageList.map((packageNumber) => fetchScaleRows(permitNumber, packageNumber, blanketOic)),
    ),
    Promise.all(packageList.map((packageNumber) => fetchScaleFeeRows(permitNumber, packageNumber))),
  ])
  const scaleRows = packageScaleRows.flat()
  const feeRows = packageFeeRows.flat()
  const gbmsEvents = await fetchGbmsRows(permitNumber, receiptNumber)

  return {
    packages,
    items: scaleRows,
    fees: feeRows.map(normalizeScaleFeeRow),
    gbmsEvents,
    oicItems: [],
    boicItems: [],
  }
}

export const updatePermitScaleAttachment = async (
  request: UpdatePermitScaleAttachmentRequest,
): Promise<UpdatePermitScaleAttachmentResult> => {
  const response = await apiService.getAxiosInstance().post<unknown>(
    '/lexis/rpc/permit-details/update-scale-attachment',
    toUrlEncodedParams({
      scaleId: request.scaleId.trim(),
      permitNumber: request.permitNumber.trim(),
      attachInd: String(request.attachInd),
    }),
    {
      headers: {
        'Content-Type': LEGACY_FORM_CONTENT_TYPE,
      },
    },
  )
  const payload = recordOrEmpty(response.data)
  const success = asBoolean(payload.success ?? payload.valid)
  const message = asString(payload.message)
  return {
    success,
    message:
      message ||
      (success ? 'Permit item rows were updated.' : 'Unable to update permit item rows.'),
    errors: asStringArray(payload.errors),
    warnings: asStringArray(payload.warnings),
  }
}
