import apiService from '@/service/api-service'
import { LEGACY_FORM_CONTENT_TYPE, toUrlEncodedParams } from '@/service/legacy-form-utils'
import {
  DEFAULT_PAYLOAD_ARRAY_KEYS,
  parsePayloadArray,
  payloadValueAsNumber,
  payloadValueAsString as asString,
} from '@/service/payload-utils'
import { toSearchServiceError } from '@/service/search-service-fallback'
import { isRecord, recordOrEmpty } from '@/utils/record'

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
  packageNumber: string
  timberMark: string
  species: string
  grade: string
  amv: string
  volume: number
  ministryUser: boolean
  ewb: string
  filPercent: string
  mfPercent: string
  amount: number
  amountDisplay: string
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
  applications: string[]
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

export type ProvincialPermitFeesRequest = {
  permitNumber: string
  blanketOic?: boolean | null
  packageNumbers?: string[]
}

export type UpdatePermitScaleAttachmentRequest = {
  scaleId: string
  permitNumber: string
  attachInd: boolean
}

export type AddBlanketOicScaleRequest = {
  permitNumber: string
  packageNumber: string
  timberMark: string
  scaleVolume: string
  scalePieces: string
  speciesCode: string
  gradeCode: string
}

export type DeleteBlanketOicScaleRequest = {
  scaleId: string
  permitNumber: string
}

export type BlanketOicPackageMutationRequest = {
  permitNumber: string
  packageNumber: string
  newPackageNumber?: string
  volume: string
  averageLength: string
  averageDiameter: string
  status: string
  comments: string
  reprocessed: string
  ageClass: string
  productType: string
  endUseCode: string
  speciesCodes: string[]
}

export type BlanketOicPackageMutationResult = UpdatePermitScaleAttachmentResult & {
  permitNumber: string
  applicationNumber: string
  packageNumber: string
}

export type BlanketOicPackageEditContext = {
  packageNumber: string
  volume: string
  averageLength: string
  averageDiameter: string
  status: string
  comments: string
  reprocessed: string
  ageClass: string
  productType: string
  endUseCode: string
  speciesCodes: string[]
}

export type AddApplicationsToPermitRequest = {
  permitNumber: string
  selectedApplications: string[]
}

export type RemoveApplicationFromPermitRequest = {
  permitNumber: string
  applicationNumber: string
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
  applications: [],
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

  return {
    id: asString(source.id || source.feeId || source.lineNumber || `fee-${index + 1}`),
    packageNumber: asString(source.packageNumber),
    timberMark: asString(source.timberMark || source.timbermark),
    species: asString(source.species),
    grade: asString(source.grade),
    amv: asString(source.amv),
    volume: asNumber(source.volume),
    ministryUser: asBoolean(source.ministryUser),
    ewb: asString(source.ewb),
    filPercent: asString(source.fil),
    mfPercent: asString(source.mf),
    amount: asNumber(source.fee || source.amount || source.feeAmount || source.total),
    amountDisplay: asString(source.fee || source.amount || source.feeAmount || source.total),
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
      throw new Error(`Permit package list service unavailable at ${path}`)
    }

    const objectPayload = recordOrEmpty(response.data)
    if (!Array.isArray(objectPayload.packageList)) {
      throw new Error(`Invalid package list response from ${path}`)
    }

    const packageList = objectPayload.packageList
    return packageList
      .map(asString)
      .filter((packageNumber) => packageNumber && packageNumber !== 'No Packages')
  } catch (error) {
    throw toSearchServiceError(`Unable to load permit package list from ${path}.`, error)
  }
}

const fetchApplicationList = async (permitNumber: string): Promise<string[]> => {
  const path = '/lexis/rpc/permit-details/application-list'
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
      throw new Error(`Permit application list service unavailable at ${path}`)
    }

    const objectPayload = recordOrEmpty(response.data)
    if (!Array.isArray(objectPayload.applicationList)) {
      throw new Error(`Invalid application list response from ${path}`)
    }

    return objectPayload.applicationList.map(asString).filter(Boolean)
  } catch (error) {
    throw toSearchServiceError(`Unable to load permit application list from ${path}.`, error)
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
  permitNumber: string,
): Promise<
  Pick<
    ProvincialPermitPackageInfoRow,
    'currentPackageVolume' | 'status' | 'reprocessed' | 'comments' | 'ageClass'
  >
> => {
  const path = '/lexis/rpc/permit-details/package-details'
  try {
    const response = await apiService.getCachedResponse<unknown>(
      path,
      {
        params: {
          packageNumber,
          permitNumber,
        },
      },
      { ttlMs: PERMIT_TAB_CACHE_TTL_MS },
    )
    if (response.status === 204) {
      throw new Error(`Permit package details service unavailable at ${path}`)
    }

    return normalizePackageDetailsFields(response.data)
  } catch (error) {
    throw toSearchServiceError(`Unable to load permit package details from ${path}.`, error)
  }
}

const fetchPackageInfo = async (
  packageNumber: string,
  blanketOic: boolean,
  permitNumber: string,
): Promise<ProvincialPermitPackageInfoRow> => {
  const path = '/lexis/rpc/permit-details/package-info'
  try {
    const response = await apiService.getCachedResponse<unknown>(
      path,
      {
        params: {
          packageNumber,
          permitNumber,
        },
      },
      { ttlMs: PERMIT_TAB_CACHE_TTL_MS },
    )
    if (response.status === 204) {
      throw new Error(`Permit package information service unavailable at ${path}`)
    }

    const packageInfo = normalizePackageInfoRow(packageNumber, response.data)
    if (!blanketOic) {
      return packageInfo
    }

    const packageDetails = await fetchPackageDetails(packageNumber, permitNumber)
    return {
      ...packageInfo,
      ageClass: packageDetails.ageClass || packageInfo.ageClass,
      currentPackageVolume: packageDetails.currentPackageVolume,
      status: packageDetails.status,
      reprocessed: packageDetails.reprocessed,
      comments: packageDetails.comments,
    }
  } catch (error) {
    throw toSearchServiceError(`Unable to load permit package information from ${path}.`, error)
  }
}

const fetchScaleRows = async (
  permitNumber: string,
  packageNumber: string,
  blanketOic: boolean,
): Promise<ProvincialPermitItemRow[]> => {
  const path = '/lexis/rpc/permit-details/scales-for-package'
  try {
    const response = await apiService.getCachedResponse<unknown>(
      path,
      {
        params: {
          packageNumber,
          permitNumber,
        },
      },
      { ttlMs: PERMIT_TAB_CACHE_TTL_MS },
    )
    if (response.status === 204) {
      throw new Error(`Permit scale service unavailable at ${path}`)
    }

    const rows = parsePayloadArray(response.data, PERMIT_TAB_ARRAY_KEYS)
    if (!rows) {
      throw new Error(`Invalid scale list response from ${path}`)
    }

    const normalizedRows = rows.map((row, index) =>
      normalizePermitItemRow(row, index, packageNumber, permitNumber),
    )
    if (blanketOic) {
      return normalizedRows
    }
    return normalizedRows.filter((row) => !row.permitNumber || row.includedInPermit)
  } catch (error) {
    throw toSearchServiceError(`Unable to load permit scales from ${path}.`, error)
  }
}

const fetchScaleFeeRows = async (
  permitNumber: string,
  packageNumber: string,
): Promise<unknown[]> => {
  const path = '/lexis/rpc/permit-details/scale-fees-for-package'
  try {
    const response = await apiService.getCachedResponse<unknown>(
      path,
      {
        params: {
          packageNumber,
          permitNumber,
        },
      },
      { ttlMs: PERMIT_TAB_CACHE_TTL_MS },
    )
    if (response.status === 204) {
      throw new Error(`Permit scale fee service unavailable at ${path}`)
    }

    const rows = parsePayloadArray(response.data, PERMIT_TAB_ARRAY_KEYS)
    if (!rows) {
      throw new Error(`Invalid scale fee list response from ${path}`)
    }

    return rows.map((row) => ({
      ...recordOrEmpty(row),
      packageNumber,
    }))
  } catch (error) {
    throw toSearchServiceError(`Unable to load permit scale fees from ${path}.`, error)
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

  // GBMS history is display-only and does not participate in permit mutation eligibility.
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

const resolveDetailTabsRequest = (
  request: string | ProvincialPermitDetailTabsRequest,
): Required<Pick<ProvincialPermitDetailTabsRequest, 'permitNumber'>> &
  Omit<ProvincialPermitDetailTabsRequest, 'permitNumber'> => {
  if (typeof request === 'string') {
    return {
      permitNumber: request,
      receiptNumber: undefined,
      blanketOic: false,
    }
  }

  return request
}

const fetchProvincialPermitDetailTabsData = async (
  request: string | ProvincialPermitDetailTabsRequest,
  includeFees: boolean,
): Promise<ProvincialPermitDetailTabsData> => {
  const {
    permitNumber,
    receiptNumber,
    blanketOic: blanketOicValue,
  } = resolveDetailTabsRequest(request)
  const blanketOic = !!blanketOicValue
  const [applicationList, packageList] = await Promise.all([
    fetchApplicationList(permitNumber),
    fetchPackageList(permitNumber, blanketOic),
  ])

  const [packages, packageScaleRows, packageFeeRows] = await Promise.all([
    Promise.all(
      packageList.map((packageNumber) => fetchPackageInfo(packageNumber, blanketOic, permitNumber)),
    ),
    Promise.all(
      packageList.map((packageNumber) => fetchScaleRows(permitNumber, packageNumber, blanketOic)),
    ),
    includeFees
      ? Promise.all(
          packageList.map((packageNumber) => fetchScaleFeeRows(permitNumber, packageNumber)),
        )
      : Promise.resolve<unknown[][]>([]),
  ])
  const scaleRows = packageScaleRows.flat()
  const feeRows = packageFeeRows.flat()
  const gbmsEvents = await fetchGbmsRows(permitNumber, receiptNumber)

  return {
    applications: applicationList,
    packages,
    items: scaleRows,
    fees: feeRows.map(normalizeScaleFeeRow),
    gbmsEvents,
    oicItems: [],
    boicItems: [],
  }
}

export const fetchProvincialPermitDetailCoreTabs = async (
  request: string | ProvincialPermitDetailTabsRequest,
): Promise<ProvincialPermitDetailTabsData> => fetchProvincialPermitDetailTabsData(request, false)

export const fetchProvincialPermitFees = async ({
  permitNumber,
  blanketOic = false,
  packageNumbers,
}: ProvincialPermitFeesRequest): Promise<ProvincialPermitFeeRow[]> => {
  const resolvedPackageNumbers = packageNumbers
    ? packageNumbers.filter(Boolean)
    : await fetchPackageList(permitNumber, !!blanketOic)
  const packageFeeRows = await Promise.all(
    resolvedPackageNumbers.map((packageNumber) => fetchScaleFeeRows(permitNumber, packageNumber)),
  )

  return packageFeeRows.flat().map(normalizeScaleFeeRow)
}

export const fetchProvincialPermitDetailTabs = async (
  request: string | ProvincialPermitDetailTabsRequest,
): Promise<ProvincialPermitDetailTabsData> => fetchProvincialPermitDetailTabsData(request, true)

export const fetchAvailablePermitApplications = async (
  exemptionNumber: string,
  selectedApplications: string[],
): Promise<{ applicationList: string[]; errorMessage: string }> => {
  const response = await apiService.getCachedResponse<unknown>(
    '/lexis/rpc/permit-details/available-application-list',
    {
      params: {
        exemptionNumber: exemptionNumber.trim(),
        selectedApplications: selectedApplications
          .map((application) => application.trim())
          .join(','),
      },
    },
    { ttlMs: PERMIT_TAB_CACHE_TTL_MS },
  )
  const payload = recordOrEmpty(response.status === 204 ? {} : response.data)
  const applicationList = Array.isArray(payload.applicationList) ? payload.applicationList : []
  return {
    applicationList: applicationList.map(asString).filter(Boolean),
    errorMessage: asString(payload.errorMessage),
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

export const addApplicationsToPermit = async (
  request: AddApplicationsToPermitRequest,
): Promise<UpdatePermitScaleAttachmentResult> => {
  const response = await apiService.getAxiosInstance().post<unknown>(
    '/lexis/rpc/permit-details/add-applications-to-permit',
    toUrlEncodedParams({
      permitNumber: request.permitNumber.trim(),
      selectedApplications: request.selectedApplications
        .map((applicationNumber) => applicationNumber.trim())
        .filter(Boolean)
        .join(','),
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
      (success
        ? 'Applications were added to the permit.'
        : 'Unable to add applications to the permit.'),
    errors: asStringArray(payload.errors),
    warnings: asStringArray(payload.warnings),
  }
}

export const removeApplicationFromPermit = async (
  request: RemoveApplicationFromPermitRequest,
): Promise<UpdatePermitScaleAttachmentResult> => {
  const response = await apiService.getAxiosInstance().post<unknown>(
    '/lexis/rpc/permit-details/remove-application-from-permit',
    toUrlEncodedParams({
      permitNumber: request.permitNumber.trim(),
      applicationNumber: request.applicationNumber.trim(),
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
      (success
        ? 'Application was removed from the permit.'
        : 'Unable to remove application from the permit.'),
    errors: asStringArray(payload.errors),
    warnings: asStringArray(payload.warnings),
  }
}

export const addBlanketOicScale = async (
  request: AddBlanketOicScaleRequest,
): Promise<UpdatePermitScaleAttachmentResult> => {
  const response = await apiService.getAxiosInstance().post<unknown>(
    '/lexis/rpc/permit-details/add-boic-scale',
    toUrlEncodedParams({
      permitNumber: request.permitNumber.trim(),
      packageNumber: request.packageNumber.trim(),
      timberMark: request.timberMark.trim(),
      scaleVolume: request.scaleVolume.trim(),
      scalePieces: request.scalePieces.trim(),
      speciesCode: request.speciesCode.trim(),
      gradeCode: request.gradeCode.trim(),
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
      (success ? 'Blanket OIC scale detail was added.' : 'Unable to add Blanket OIC scale detail.'),
    errors: asStringArray(payload.errors),
    warnings: asStringArray(payload.warnings),
  }
}

export const deleteBlanketOicScale = async (
  request: DeleteBlanketOicScaleRequest,
): Promise<UpdatePermitScaleAttachmentResult> => {
  const response = await apiService.getAxiosInstance().post<unknown>(
    '/lexis/rpc/permit-details/delete-boic-scale',
    toUrlEncodedParams({
      scaleId: request.scaleId.trim(),
      permitNumber: request.permitNumber.trim(),
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
      (success
        ? 'Blanket OIC scale detail was removed.'
        : 'Unable to remove Blanket OIC scale detail.'),
    errors: asStringArray(payload.errors),
    warnings: asStringArray(payload.warnings),
  }
}

const normalizeBlanketOicPackageResult = (payload: unknown): BlanketOicPackageMutationResult => {
  const source = recordOrEmpty(payload)
  const success = asBoolean(source.success ?? source.valid)
  const errors = asStringArray(source.errors)
  const message = asString(source.message)
  return {
    success,
    message:
      message ||
      (success
        ? 'Blanket OIC package was saved.'
        : errors[0] || 'Unable to save the Blanket OIC package.'),
    errors,
    warnings: asStringArray(source.warnings),
    permitNumber: asString(source.permitNumber),
    applicationNumber: asString(source.applicationNumber),
    packageNumber: asString(source.packageNumber),
  }
}

const saveBlanketOicPackage = async (
  path: string,
  request: BlanketOicPackageMutationRequest,
): Promise<BlanketOicPackageMutationResult> => {
  const response = await apiService.getAxiosInstance().post<unknown>(path, {
    permitNumber: Number(request.permitNumber),
    packageNumber: request.packageNumber.trim(),
    newPackageNumber: request.newPackageNumber?.trim() || null,
    volume: Number(request.volume),
    averageLength: Number(request.averageLength),
    averageDiameter: Number(request.averageDiameter),
    status: request.status.trim(),
    comments: request.comments,
    reprocessed: request.reprocessed.trim(),
    ageClass: request.ageClass.trim(),
    productType: request.productType.trim(),
    endUseCode: request.endUseCode.trim(),
    speciesCodes: request.speciesCodes.map((code) => code.trim()).filter(Boolean),
  })
  return normalizeBlanketOicPackageResult(response.data)
}

export const addBlanketOicPackage = async (
  request: BlanketOicPackageMutationRequest,
): Promise<BlanketOicPackageMutationResult> => {
  return saveBlanketOicPackage('/lexis/rpc/permit-details/boic-package', request)
}

export const updateBlanketOicPackage = async (
  request: BlanketOicPackageMutationRequest,
): Promise<BlanketOicPackageMutationResult> => {
  return saveBlanketOicPackage('/lexis/rpc/permit-details/boic-package/update', request)
}

export const deleteBlanketOicPackage = async (
  permitNumber: string,
  packageNumber: string,
): Promise<BlanketOicPackageMutationResult> => {
  const response = await apiService
    .getAxiosInstance()
    .post<unknown>('/lexis/rpc/permit-details/boic-package/delete', {
      permitNumber: Number(permitNumber),
      packageNumber: packageNumber.trim(),
    })
  return normalizeBlanketOicPackageResult(response.data)
}

export const fetchBlanketOicPackageEditContext = async (
  packageNumber: string,
): Promise<BlanketOicPackageEditContext> => {
  const normalizedPackageNumber = packageNumber.trim()
  const [detailsResponse, speciesResponse] = await Promise.all([
    apiService.getCachedResponse<unknown>('/lexis/rpc/application-details/package-details', {
      params: { packageNumber: normalizedPackageNumber },
    }),
    apiService.getCachedResponse<unknown>('/lexis/rpc/application-details/species-for-package', {
      params: { packageNumber: normalizedPackageNumber },
    }),
  ])
  const details = detailsResponse.data
  const speciesRows = parsePayloadArray(speciesResponse.data, DEFAULT_PAYLOAD_ARRAY_KEYS)
  if (
    detailsResponse.status !== 200 ||
    !isRecord(details) ||
    details.success !== true ||
    asString(details.packageNumber).trim().toUpperCase() !==
      normalizedPackageNumber.toUpperCase() ||
    speciesResponse.status !== 200 ||
    speciesRows === null ||
    !speciesRows.every(
      (row) =>
        isRecord(row) &&
        asString(row.species).trim().length > 0 &&
        asString(row.packageEndUse || row.enduse).trim().length > 0,
    )
  ) {
    throw new Error('Unexpected Blanket OIC package edit context payload.')
  }

  const normalizedSpeciesRows = speciesRows.map(recordOrEmpty)
  return {
    packageNumber: normalizedPackageNumber,
    volume: asString(details.volume),
    averageLength: asString(details.length || details.averageLength),
    averageDiameter: asString(details.diameter || details.averageDiameter),
    status: asString(details.status),
    comments: asString(details.comments),
    reprocessed: asString(details.reprocessed),
    ageClass: asString(details.ageClass),
    productType: asString(details.productType),
    endUseCode: asString(
      normalizedSpeciesRows[0]?.packageEndUse || normalizedSpeciesRows[0]?.enduse,
    ),
    speciesCodes: normalizedSpeciesRows.map((row) => asString(row.species)).filter(Boolean),
  }
}
