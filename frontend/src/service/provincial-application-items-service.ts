import apiService from '@/service/api-service'
import {
  LEGACY_FORM_CONTENT_TYPE,
  toUrlEncodedParams,
  type LegacyFormPayload,
} from '@/service/legacy-form-utils'
import {
  parsePayloadArray,
  parsePayloadArrayOrEmpty,
  payloadValueAsBoolean as asBoolean,
  payloadValueAsNumber as asNumber,
  payloadValueAsStringArray as asStringArray,
  payloadValueAsTrimmedString as asString,
} from '@/service/payload-utils'
import { toSearchServiceError } from '@/service/search-service-fallback'
import { isRecord, recordOrEmpty } from '@/utils/record'

export type ApplicationCodeOption = {
  code: string
  description: string
}

export type ApplicationPackageDetails = {
  success: boolean
  packageNumber: string
  volume: string
  scaledVolume: number
  length: string
  diameter: string
  status: string
  comments: string
  statusDescription: string
  reprocessed: string
  ageClass: string
  ageClassDescription: string
  productType: string
  productTypeDescription: string
}

export type ApplicationPackageSpeciesRow = {
  species: string
  endUse: string
  endUseDescription: string
}

export type ApplicationPackageScaleRow = {
  permitted: boolean
  timberMark: string
  species: string
  pieces: number
  grade: string
  volume: string
  id: string
  cascadeSplitCode: string
}

export type ApplicationScaleSummaryRow = {
  timberMark: string
}

export type ApplicationScaleDetails = {
  success: boolean
  timberMark: string
  species: string
  pieces: string
  grade: string
  volume: string
  id: string
}

export type ApplicationPermitRow = {
  permitNumber: string
  permitStatusDescription: string
}

export type ApplicationPackageMutation = {
  packageNumber: string
  newPackageNumber?: string
  applicationNumber: string
  volume: string
  averageLength: string
  averageDiameter: string
  status: string
  comments: string
  reprocessed: string
  ageClass?: string
  productType?: string
  endUseCode?: string
  speciesCodes: string[]
}

export type ApplicationScaleMutation = {
  timberMark: string
  packageNumber: string
  gradeCode: string
  speciesCode: string
  applicationNumber: string
  pieces: string
  volume: string
}

export type ApplicationPackageMutationResult = {
  valid: boolean
  packageNumber: string
  errors: string[]
  warnings: string[]
}

export type ApplicationScaleMutationResult = {
  valid: boolean
  result: ApplicationPackageScaleRow | null
  errors: string[]
  warnings: string[]
}

export type DeleteApplicationItemResult = {
  success: boolean
}

export type ApplicationRemarkMutation = {
  applicationNumber: string
  remarkBody: string
  remarkId?: string
}

export type ApplicationSummaryMutation = {
  applicationNumber: string
  applicationDate: string
  receivedDate: string
  termDays: string
  applicationVolume: string
  averageLogVolume: string
  exemptionReasonCode: string
  productLocation: string
  exportScheduleId: string
  agentClientNumber: string
  agentClientLocationCode: string
  ownerClientNumber: string
  ownerClientLocationCode: string
  applicantTypeCode?: string
  orgUnitNumber: string
  productTypeCode: string
  growthTypeCode: string
  agentContactName: string
  ownerContactName: string
  oicIndicator: string
  endUseCode: string
  speciesCodes: string[]
}

export type ApplicationRemarkMutationResult = {
  success: boolean
  remarkId: string
  remark: string
  title: string
  user: string
  status: string
}

export type ApplicationSummaryMutationResult = {
  valid: boolean
  message: string
  applicationNumber: string
  errors: string[]
  warnings: string[]
}

export type ApplicationVolumeUsageResult = {
  volumeUsed: boolean
}

export type ApplicationSummarySnapshot = Omit<ApplicationSummaryMutation, 'applicantTypeCode'> & {
  federalApplicationNumber: string
  exemptionNumber: string
  applicationStatusCode: string
  applicantTypeCode: string
  jurisdictionCode: string
}

const ITEMS_CACHE_TTL_MS = 30_000

const asRecord = recordOrEmpty

const postLegacyForm = async <TResponse>(
  path: string,
  payload: LegacyFormPayload,
): Promise<TResponse> => {
  const response = await apiService
    .getAxiosInstance()
    .post<TResponse>(path, toUrlEncodedParams(payload), {
      headers: {
        'Content-Type': LEGACY_FORM_CONTENT_TYPE,
      },
    })
  return response.data
}

const normalizeCodeOption = (row: unknown): ApplicationCodeOption => {
  const source = asRecord(row)
  const code = asString(source.code || source.value)
  return {
    code,
    description: asString(source.description || source.label || source.name) || code,
  }
}

const parseRequiredCodeOptions = (payload: unknown): ApplicationCodeOption[] => {
  const rows = parsePayloadArray(payload)
  if (rows === null) {
    throw new Error('Authoritative code options are unavailable.')
  }

  const options = rows.map((row) => {
    if (!isRecord(row)) {
      throw new Error('Authoritative code options are invalid.')
    }
    const rawCode = row.code ?? row.value
    if (typeof rawCode !== 'string' || !rawCode.trim()) {
      throw new Error('Authoritative code options are incomplete.')
    }
    const option = normalizeCodeOption(row)
    return option
  })

  if (new Set(options.map((option) => option.code.toUpperCase())).size !== options.length) {
    throw new Error('Authoritative code options contain duplicate codes.')
  }
  return options
}

const normalizePackageDetails = (payload: unknown): ApplicationPackageDetails => {
  const source = asRecord(payload)
  return {
    success: asBoolean(source.success),
    packageNumber: asString(source.packageNumber),
    volume: asString(source.volume),
    scaledVolume: asNumber(source.scaledVolume),
    length: asString(source.length),
    diameter: asString(source.diameter),
    status: asString(source.status),
    comments: asString(source.comments),
    statusDescription: asString(source.statusDesc || source.statusDescription),
    reprocessed: asString(source.reprocessed),
    ageClass: asString(source.ageClass),
    ageClassDescription: asString(source.ageClassDescription),
    productType: asString(source.productType),
    productTypeDescription: asString(source.productTypeDescription),
  }
}

const normalizePackageSpeciesRow = (row: unknown): ApplicationPackageSpeciesRow => {
  const source = asRecord(row)
  return {
    species: asString(source.species),
    endUse: asString(source.enduse || source.endUse || source.packageEndUse),
    endUseDescription: asString(
      source.packageEndUseDescription || source.endUseDescription || source.description,
    ),
  }
}

const normalizePackageScaleRow = (row: unknown): ApplicationPackageScaleRow => {
  const source = asRecord(row)
  return {
    permitted: asBoolean(source.permitted),
    timberMark: asString(source.timberMark),
    species: asString(source.species),
    pieces: asNumber(source.pieces),
    grade: asString(source.grade),
    volume: asString(source.volume),
    id: asString(source.id || source.scaleId || source.scaleDetailId),
    cascadeSplitCode: asString(source.cascadeSplitCode || source.scaleType || source.type),
  }
}

const normalizeApplicationScaleSummaryRow = (row: unknown): ApplicationScaleSummaryRow => {
  const source = asRecord(row)
  return {
    timberMark: asString(source.timberMark),
  }
}

const normalizeScaleDetails = (payload: unknown): ApplicationScaleDetails => {
  const source = asRecord(payload)
  return {
    success: asBoolean(source.success),
    timberMark: asString(source.timberMark),
    species: asString(source.species),
    pieces: asString(source.pieces),
    grade: asString(source.grade),
    volume: asString(source.volume),
    id: asString(source.id || source.scaleId || source.scaleDetailId),
  }
}

const normalizeApplicationPermitRow = (row: unknown): ApplicationPermitRow => {
  const source = asRecord(row)
  return {
    permitNumber: asString(source.permitNumber),
    permitStatusDescription: asString(
      source.permitStatusDescription || source.statusDescription || source.status,
    ),
  }
}

const normalizePackageMutationResult = (payload: unknown): ApplicationPackageMutationResult => {
  const source = asRecord(payload)
  return {
    valid: asBoolean(source.valid),
    packageNumber: asString(source.packageNumber || source.package),
    errors: asStringArray(source.errors),
    warnings: asStringArray(source.warnings),
  }
}

const normalizeScaleMutationResult = (payload: unknown): ApplicationScaleMutationResult => {
  const source = asRecord(payload)
  return {
    valid: asBoolean(source.valid),
    result: source.result ? normalizePackageScaleRow(source.result) : null,
    errors: asStringArray(source.errors),
    warnings: asStringArray(source.warnings),
  }
}

const normalizeRemarkMutationResult = (payload: unknown): ApplicationRemarkMutationResult => {
  const source = asRecord(payload)
  const status = asString(source.status)
  return {
    success: status.toLowerCase() === 'ok',
    status,
    remarkId: asString(source.remarkId),
    remark: asString(source.remark),
    title: asString(source.title),
    user: asString(source.user),
  }
}

const normalizeApplicationSummaryMutationResult = (
  payload: unknown,
): ApplicationSummaryMutationResult => {
  const source = asRecord(payload)
  return {
    valid: asBoolean(source.valid),
    message: asString(source.message),
    applicationNumber: asString(source.applicationNumber),
    errors: asStringArray(source.errors),
    warnings: asStringArray(source.warnings),
  }
}

const normalizeApplicationSummarySnapshot = (payload: unknown): ApplicationSummarySnapshot => {
  const source = asRecord(payload)
  return {
    applicationNumber: asString(source.applicationNumber),
    federalApplicationNumber: asString(source.federalApplicationNumber),
    applicationDate: asString(source.applicationDate),
    termDays: asString(source.termDays),
    receivedDate: asString(source.receivedDate),
    applicationVolume: asString(source.applicationVolume),
    averageLogVolume: asString(source.averageLogVolume),
    productLocation: asString(source.productLocation),
    exportScheduleId: asString(source.exportScheduleId),
    agentClientNumber: asString(source.agentClientNumber),
    agentClientLocationCode: asString(source.agentClientLocationCode),
    ownerClientNumber: asString(source.ownerClientNumber),
    ownerClientLocationCode: asString(source.ownerClientLocationCode),
    exemptionNumber: asString(source.exemptionNumber),
    exemptionReasonCode: asString(source.exemptionReasonCode),
    applicationStatusCode: asString(source.applicationStatusCode),
    applicantTypeCode: asString(source.applicantTypeCode),
    orgUnitNumber: asString(source.orgUnitNumber),
    productTypeCode: asString(source.productTypeCode),
    jurisdictionCode: asString(source.jurisdictionCode),
    growthTypeCode: asString(source.growthTypeCode),
    agentContactName: asString(source.agentContactName),
    ownerContactName: asString(source.ownerContactName),
    oicIndicator: asString(source.oicIndicator),
    endUseCode: asString(source.endUseCode),
    speciesCodes: asStringArray(source.speciesCodes),
  }
}

export const fetchApplicationSummarySnapshot = async (
  applicationNumber: string,
): Promise<ApplicationSummarySnapshot | null> => {
  try {
    const response = await apiService.getCachedResponse<unknown>(
      '/lexis/rpc/application-details/application-summary',
      {
        params: { applicationNumber },
      },
      { ttlMs: ITEMS_CACHE_TTL_MS },
    )
    return normalizeApplicationSummarySnapshot(response.data)
  } catch (error) {
    throw toSearchServiceError('Unable to load application summary fields.', error)
  }
}

export const fetchApplicationPackageDetails = async (
  packageNumber: string,
): Promise<ApplicationPackageDetails> => {
  try {
    const response = await apiService.getCachedResponse<unknown>(
      '/lexis/rpc/application-details/package-details',
      {
        params: { packageNumber },
      },
      { ttlMs: ITEMS_CACHE_TTL_MS },
    )
    return normalizePackageDetails(response.data)
  } catch (error) {
    throw toSearchServiceError('Unable to load application package details.', error)
  }
}

export const fetchApplicationPackageSpecies = async (
  packageNumber: string,
): Promise<ApplicationPackageSpeciesRow[]> => {
  try {
    const response = await apiService.getCachedResponse<unknown>(
      '/lexis/rpc/application-details/species-for-package',
      {
        params: { packageNumber },
      },
      { ttlMs: ITEMS_CACHE_TTL_MS },
    )
    return parsePayloadArrayOrEmpty(response.data).map(normalizePackageSpeciesRow)
  } catch (error) {
    throw toSearchServiceError('Unable to load package species.', error)
  }
}

export const fetchApplicationSpecies = async (
  applicationNumber: string,
): Promise<ApplicationPackageSpeciesRow[]> => {
  try {
    const response = await apiService.getCachedResponse<unknown>(
      '/lexis/rpc/application-details/species-for-application',
      {
        params: { applicationNumber },
      },
      { ttlMs: ITEMS_CACHE_TTL_MS },
    )
    return parsePayloadArrayOrEmpty(response.data).map(normalizePackageSpeciesRow)
  } catch (error) {
    throw toSearchServiceError('Unable to load application species.', error)
  }
}

export const fetchApplicationPackageScales = async (
  packageNumber: string,
): Promise<ApplicationPackageScaleRow[]> => {
  try {
    const response = await apiService.getCachedResponse<unknown>(
      '/lexis/rpc/application-details/package-scales',
      {
        params: { packageNumber },
      },
      { ttlMs: ITEMS_CACHE_TTL_MS },
    )
    return parsePayloadArrayOrEmpty(response.data).map(normalizePackageScaleRow)
  } catch (error) {
    throw toSearchServiceError('Unable to load package scales.', error)
  }
}

export const fetchApplicationUniqueScales = async (
  applicationNumber: string,
): Promise<ApplicationScaleSummaryRow[]> => {
  try {
    const response = await apiService.getCachedResponse<unknown>(
      '/lexis/rpc/application-details/unique-scales',
      {
        params: { applicationNumber },
      },
      { ttlMs: ITEMS_CACHE_TTL_MS },
    )
    return parsePayloadArrayOrEmpty(response.data)
      .map(normalizeApplicationScaleSummaryRow)
      .filter((row) => row.timberMark)
  } catch (error) {
    throw toSearchServiceError('Unable to load application timber marks.', error)
  }
}

export const fetchApplicationPermits = async (
  applicationNumber: string,
): Promise<ApplicationPermitRow[]> => {
  try {
    const response = await apiService.getCachedResponse<unknown>(
      '/lexis/rpc/application-details/permits',
      {
        params: { applicationNumber },
      },
      { ttlMs: ITEMS_CACHE_TTL_MS },
    )
    return parsePayloadArrayOrEmpty(response.data).map(normalizeApplicationPermitRow)
  } catch (error) {
    throw toSearchServiceError('Unable to load application permits.', error)
  }
}

export const fetchApplicationSpeciesCodes = async (): Promise<ApplicationCodeOption[]> => {
  try {
    const response = await apiService.getCachedResponse<unknown>(
      '/lexis/rpc/application-details/species-codes',
      undefined,
      { ttlMs: ITEMS_CACHE_TTL_MS },
    )
    return parseRequiredCodeOptions(response.data)
  } catch (error) {
    throw toSearchServiceError('Unable to load application species codes.', error)
  }
}

export const fetchApplicationPackageStatusCodes = async (): Promise<ApplicationCodeOption[]> => {
  try {
    const response = await apiService.getCachedResponse<unknown>(
      '/lexis/rpc/application-details/package-status-codes',
      undefined,
      { ttlMs: ITEMS_CACHE_TTL_MS },
    )
    return parseRequiredCodeOptions(response.data)
  } catch (error) {
    throw toSearchServiceError('Unable to load application package status codes.', error)
  }
}

export const fetchApplicationGradeCodes = async (
  region: string,
  speciesCode: string,
): Promise<ApplicationCodeOption[]> => {
  try {
    const response = await apiService.getCachedResponse<unknown>(
      '/lexis/rpc/application-details/grade-codes',
      {
        params: {
          orgUnitNumber: region,
          speciesCode,
        },
      },
      { ttlMs: ITEMS_CACHE_TTL_MS },
    )
    return parseRequiredCodeOptions(response.data)
  } catch (error) {
    throw toSearchServiceError('Unable to load application grade codes.', error)
  }
}

export const fetchApplicationRemainingSpecies = async (
  region: string,
  productType: string,
  selectedSpecies: string[],
): Promise<ApplicationCodeOption[]> => {
  try {
    const response = await apiService.getCachedResponse<unknown>(
      '/lexis/rpc/application-details/remaining-species',
      {
        params: {
          orgUnitNumber: region,
          productType,
          speciesJSON: JSON.stringify(selectedSpecies),
        },
      },
      { ttlMs: ITEMS_CACHE_TTL_MS },
    )
    return parseRequiredCodeOptions(response.data)
  } catch (error) {
    throw toSearchServiceError('Unable to load remaining package species.', error)
  }
}

export const fetchApplicationEndUsesForSpeciesRegion = async (
  region: string,
  selectedSpecies: string[],
): Promise<ApplicationCodeOption[]> => {
  try {
    const response = await apiService.getCachedResponse<unknown>(
      '/lexis/rpc/application-details/end-uses-for-species-region',
      {
        params: {
          orgUnitNumber: region,
          speciesJSON: JSON.stringify(selectedSpecies),
        },
      },
      { ttlMs: ITEMS_CACHE_TTL_MS },
    )
    return parseRequiredCodeOptions(response.data)
  } catch (error) {
    throw toSearchServiceError('Unable to load package end-use codes.', error)
  }
}

export const fetchApplicationScaleDetails = async (
  scaleId: string,
): Promise<ApplicationScaleDetails> => {
  try {
    const response = await apiService.getCachedResponse<unknown>(
      '/lexis/rpc/application-details/scale',
      {
        params: { scaleId },
      },
      { ttlMs: ITEMS_CACHE_TTL_MS },
    )
    return normalizeScaleDetails(response.data)
  } catch (error) {
    throw toSearchServiceError('Unable to load application scale details.', error)
  }
}

export const addApplicationPackage = async (
  request: ApplicationPackageMutation,
): Promise<ApplicationPackageMutationResult> => {
  try {
    const payload = await postLegacyForm<unknown>('/lexis/rpc/application-details/package', {
      packageNumber: request.packageNumber,
      applicationNumber: request.applicationNumber,
      packageDialogPackageVolume: request.volume,
      packageDialogAverageLength: request.averageLength,
      packageDialogAverageDiameter: request.averageDiameter,
      packageDialogPackageStatus: request.status,
      packageDialogPackageComment: request.comments,
      packageDialogReprocessedIndicator: request.reprocessed,
      packageDialogAgeClass: request.ageClass,
      packageDialogProductType: request.productType,
      createPackageEndUse: request.endUseCode,
      createPackageSpeciesTableValues: request.speciesCodes.join(','),
    })
    return normalizePackageMutationResult(payload)
  } catch (error) {
    throw toSearchServiceError('Unable to add application package.', error)
  }
}

export const updateApplicationPackage = async (
  request: ApplicationPackageMutation,
): Promise<ApplicationPackageMutationResult> => {
  try {
    const payload = await postLegacyForm<unknown>('/lexis/rpc/application-details/package-update', {
      packageNumber: request.packageNumber,
      newPackageNumber: request.newPackageNumber,
      applicationNumber: request.applicationNumber,
      packageDialogPackageVolume: request.volume,
      packageDialogAverageLength: request.averageLength,
      packageDialogAverageDiameter: request.averageDiameter,
      packageDialogPackageStatus: request.status,
      packageDialogPackageComment: request.comments,
      packageDialogReprocessedIndicator: request.reprocessed,
      updatePackageDialogAgeClass: request.ageClass,
      updatePackageDialogProductType: request.productType,
      updatePackageEndUse: request.endUseCode,
      updatePackageSpeciesTableValues: request.speciesCodes.join(','),
    })
    return normalizePackageMutationResult(payload)
  } catch (error) {
    throw toSearchServiceError('Unable to update application package.', error)
  }
}

export const addApplicationScaleToPackage = async (
  request: ApplicationScaleMutation,
): Promise<ApplicationScaleMutationResult> => {
  try {
    const payload = await postLegacyForm<unknown>('/lexis/rpc/application-details/package-scale', {
      timberMark: request.timberMark,
      packageNumber: request.packageNumber,
      gradeCode: request.gradeCode,
      speciesCode: request.speciesCode,
      applicationNumber: request.applicationNumber,
      scalePieces: request.pieces,
      scaleVolume: request.volume,
    })
    return normalizeScaleMutationResult(payload)
  } catch (error) {
    throw toSearchServiceError('Unable to add application scale.', error)
  }
}

export const saveApplicationRemark = async (
  request: ApplicationRemarkMutation,
): Promise<ApplicationRemarkMutationResult> => {
  try {
    const payload = await postLegacyForm<unknown>('/lexis/rpc/application-details/remark', {
      remarkId: request.remarkId || 'new',
      applicationNumber: request.applicationNumber,
      remarkBody: request.remarkBody,
    })
    return normalizeRemarkMutationResult(payload)
  } catch (error) {
    throw toSearchServiceError('Unable to save application remark.', error)
  }
}

export const checkApplicationVolumeUsage = async (
  applicationNumber: string,
): Promise<ApplicationVolumeUsageResult> => {
  try {
    const response = await apiService.getCachedResponse<unknown>(
      '/lexis/rpc/application-details/check-unused-volume',
      {
        params: {
          applicationNumber,
        },
      },
      { ttlMs: 0 },
    )
    const payload = asRecord(response.data)
    return {
      volumeUsed: asBoolean(payload.volumeUsedInd),
    }
  } catch (error) {
    throw toSearchServiceError('Unable to check application volume usage.', error)
  }
}

export const updateApplicationSummary = async (
  request: ApplicationSummaryMutation,
): Promise<ApplicationSummaryMutationResult> => {
  try {
    const payload = await postLegacyForm<unknown>(
      '/lexis/rpc/application-details/application-summary',
      {
        applicationNumber: request.applicationNumber,
        applicationDate: request.applicationDate,
        receivedDate: request.receivedDate,
        termDays: request.termDays,
        applicationVolume: request.applicationVolume,
        averageLogVolume: request.averageLogVolume,
        exemptionReasonCode: request.exemptionReasonCode,
        productLocation: request.productLocation,
        exportScheduleId: request.exportScheduleId,
        agentClientNumber: request.agentClientNumber,
        agentClientLocationCode: request.agentClientLocationCode,
        ownerClientNumber: request.ownerClientNumber,
        ownerClientLocationCode: request.ownerClientLocationCode,
        applicantType: request.applicantTypeCode,
        orgUnitNumber: request.orgUnitNumber,
        productTypeCode: request.productTypeCode,
        growthTypeCode: request.growthTypeCode,
        agentContactName: request.agentContactName,
        ownerContactName: request.ownerContactName,
        oicIndicator: request.oicIndicator,
        applicationEndUseCode: request.endUseCode,
        applicationSelectedSpecies: request.speciesCodes.join(','),
      },
    )
    return normalizeApplicationSummaryMutationResult(payload)
  } catch (error) {
    throw toSearchServiceError('Unable to update application summary.', error)
  }
}

export const deleteApplicationScale = async (
  scaleId: string,
  applicationNumber: string,
): Promise<DeleteApplicationItemResult> => {
  try {
    const response = await apiService
      .getAxiosInstance()
      .delete<unknown>('/lexis/rpc/application-details/scale', {
        params: {
          scaleId,
          applicationNumber,
        },
      })
    if (response.status !== 200) {
      throw new Error('Unexpected application scale deletion response.')
    }
    const source = asRecord(response.data)
    return { success: asBoolean(source.success) }
  } catch (error) {
    throw toSearchServiceError('Unable to delete application scale.', error)
  }
}

export const deleteApplicationPackage = async (
  packageNumber: string,
  applicationNumber: string,
): Promise<DeleteApplicationItemResult> => {
  try {
    const response = await apiService
      .getAxiosInstance()
      .delete<unknown>('/lexis/rpc/application-details/package', {
        params: {
          packageNumber,
          applicationNumber,
        },
      })
    if (response.status !== 200) {
      throw new Error('Unexpected application package deletion response.')
    }
    const source = asRecord(response.data)
    return { success: asBoolean(source.success) }
  } catch (error) {
    throw toSearchServiceError('Unable to delete application package.', error)
  }
}
