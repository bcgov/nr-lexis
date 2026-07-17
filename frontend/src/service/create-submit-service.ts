import axios from 'axios'
import { env } from '@/env'
import apiService from '@/service/api-service'
import {
  LEGACY_FORM_CONTENT_TYPE,
  toUrlEncodedParams,
  type LegacyFormPayload,
} from '@/service/legacy-form-utils'
import {
  payloadValueAsOptionalString as asString,
  payloadValueAsStringList as asStringArray,
} from '@/service/payload-utils'
import { getConfiguredString, isEnabledConfig } from '@/service/service-config-utils'
import { isRecord } from '@/utils/record'

export type CreateSubmissionResult = {
  success: boolean
  message: string
  createdId?: string
  errors: string[]
  warnings: string[]
}

type LegacyCreateResponse = {
  success?: boolean
  valid?: boolean
  message?: string
  detail?: string
  errors?: unknown
  warnings?: unknown
  applicationNumber?: unknown
  exemptionNumber?: unknown
  exportPurchaseOfferNumber?: unknown
  offerNumber?: unknown
  permitNumber?: unknown
}

type CreateSubmitRequestMode = 'form' | 'json'
type LegacyFormEncoder = (payload: LegacyFormPayload) => URLSearchParams

const withQueryParam = (path: string, key: string, value: string | undefined): string => {
  if (!value) {
    return path
  }

  const separator = path.includes('?') ? '&' : '?'
  return `${path}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}`
}

const getCreateSubmitRequestMode = (): CreateSubmitRequestMode => {
  const configured = (env.VITE_LEXIS_CREATE_SUBMIT_REQUEST_MODE ?? 'form')
    .toString()
    .trim()
    .toLowerCase()

  return configured === 'json' ? 'json' : 'form'
}

const withCreateActionMapping = (
  actionMapping: string,
  payload: LegacyFormPayload,
): LegacyFormPayload => {
  if (!isEnabledConfig(env.VITE_LEXIS_CREATE_SUBMIT_INCLUDE_ACTION_MAPPING)) {
    return payload
  }

  return {
    actionMapping,
    ...payload,
  }
}

const getProvincialApplicationCreatePath = (): string => {
  return getConfiguredString(
    env.VITE_LEXIS_CREATE_APPLICATION_ENDPOINT,
    '/lexis/applicationDetailsRPC',
  )
}

const getProvincialExemptionCreatePath = (): string => {
  return getConfiguredString(env.VITE_LEXIS_CREATE_EXEMPTION_ENDPOINT, '/lexis/exemptionDetailsRPC')
}

const getProvincialOfferCreatePath = (): string => {
  return getConfiguredString(env.VITE_LEXIS_CREATE_OFFER_ENDPOINT, '/lexis/offerDetailsRPC')
}

const parseCreateResponse = (
  payload: LegacyCreateResponse,
  createdIdKeyCandidates: Array<keyof LegacyCreateResponse>,
): CreateSubmissionResult => {
  const success = payload.success ?? payload.valid ?? false
  const createdId = createdIdKeyCandidates
    .map((key) => asString(payload[key]))
    .find((value) => Boolean(value))

  return {
    success,
    message: asString(payload.message) ?? '',
    createdId,
    errors: asStringArray(payload.errors),
    warnings: asStringArray(payload.warnings),
  }
}

const buildFailureResult = (
  defaultMessage: string,
  error: unknown,
  unavailableMessage?: string,
  conflictMessage?: string,
): CreateSubmissionResult => {
  if (axios.isAxiosError(error)) {
    const payload = error.response?.data as LegacyCreateResponse | undefined
    const status = error.response?.status
    const message =
      asString(payload?.message) ??
      asString(payload?.detail) ??
      (status === 409 && conflictMessage
        ? conflictMessage
        : status === 404 && unavailableMessage
          ? unavailableMessage
          : defaultMessage)

    return {
      success: false,
      message,
      createdId: undefined,
      errors: asStringArray(payload?.errors),
      warnings: asStringArray(payload?.warnings),
    }
  }

  return {
    success: false,
    message: defaultMessage,
    createdId: undefined,
    errors: [],
    warnings: [],
  }
}

const postLegacyForm = async (
  path: string,
  payload: LegacyFormPayload,
  formEncoder: LegacyFormEncoder = toUrlEncodedParams,
): Promise<LegacyCreateResponse> => {
  const requestMode = getCreateSubmitRequestMode()
  const requestBody = requestMode === 'json' ? payload : formEncoder(payload)
  const requestPath =
    requestMode === 'json' ? withQueryParam(path, 'actionMapping', payload.actionMapping) : path
  const contentType = requestMode === 'json' ? 'application/json' : LEGACY_FORM_CONTENT_TYPE

  const response = await apiService
    .getAxiosInstance()
    .post<LegacyCreateResponse>(requestPath, requestBody, {
      headers: {
        'Content-Type': contentType,
      },
    })
  return response.data ?? {}
}

export type ProvincialApplicationCreateSubmission = {
  ownerClientNumber: string
  ownerClientLocationCode: string
  ownerContactName: string
  agentClientNumber?: string
  agentClientLocationCode?: string
  agentContactName?: string
  applicantTypeCode: string
  productTypeCode: string
  ageClass: string
  exemptionType: string
  region: string
  applicationDate: string
  applicationTermDays: string
  receivedDate: string
  exportScheduleId?: string
  listingDate: string
  productLocation: string
  applicationVolume: string
  averageLogVolume: string
  speciesCodes?: string[]
  endUseCode?: string
  comments: string
}

export const submitProvincialApplicationCreate = async (
  form: ProvincialApplicationCreateSubmission,
): Promise<CreateSubmissionResult> => {
  const selectedSpecies = (form.speciesCodes ?? []).join(',')
  try {
    const payload = await postLegacyForm(
      getProvincialApplicationCreatePath(),
      withCreateActionMapping('addApplication', {
        ownerClientNumber: form.ownerClientNumber,
        ownerClientLocationCode: form.ownerClientLocationCode,
        ownerClientLocation: form.ownerClientLocationCode,
        ownerContactName: form.ownerContactName,
        agentClientNumber: form.agentClientNumber,
        agentClientLocationCode: form.agentClientLocationCode,
        agentClientLocation: form.agentClientLocationCode,
        agentContactName: form.agentContactName,
        ownerApplicantType: form.applicantTypeCode,
        applicantType: form.applicantTypeCode,
        productTypeCode: form.productTypeCode,
        ageClass: form.ageClass,
        growthTypeCode: form.ageClass,
        exemptionReason: form.exemptionType,
        exemptionReasonCode: form.exemptionType,
        exemptionType: form.exemptionType,
        exemptionTypeCode: form.exemptionType,
        region: form.region,
        orgUnitNumber: form.region,
        applicationDate: form.applicationDate,
        exemptionTerm: form.applicationTermDays,
        termDays: form.applicationTermDays,
        receivedDate: form.receivedDate,
        dateReceived: form.receivedDate,
        exportScheduleId: form.exportScheduleId,
        legacyExportScheduleId: form.exportScheduleId,
        listingDate: form.listingDate,
        productLocation: form.productLocation,
        logLocation: form.productLocation,
        applicationVolume: form.applicationVolume,
        averageLogVolume: form.averageLogVolume,
        logVolume: form.averageLogVolume,
        applicationSelectedSpecies: selectedSpecies,
        selectedSpecies,
        speciesTableValues: selectedSpecies,
        speciesCodes: selectedSpecies,
        applicationEndUseCode: form.endUseCode,
        endUseCode: form.endUseCode,
        endUse: form.endUseCode,
        comments: form.comments,
        additionalRemarks: form.comments,
      }),
    )
    return parseCreateResponse(payload, ['applicationNumber'])
  } catch (error) {
    return buildFailureResult(
      'Application submission failed. Please review the form and try again. If the problem persists, contact support.',
      error,
    )
  }
}

export type ProvincialExemptionCreateSubmission = {
  applicationNumber: string
  linkedApplicationNumbers: string[]
  exemptionNumber: string
  exemptionTypeCode: string
  exemptionStatusCode: string
  approvalDate: string
  expiryDate: string
  approvedVolume: string
  enableRateOverride: boolean
  feeRate: string
  regionNumbers: string[]
  otherConditions: string
}

export type ProvincialExemptionCreatePreview = {
  exemptionTypeCode: string
  exemptionStatusCode: string
  approvedVolume: string
  expiryDate: string
  applicationNumbers: string[]
}

const parseCreatePreviewApplicationNumbers = (value: unknown): string[] | null => {
  if (!Array.isArray(value)) {
    return null
  }
  const applicationNumbers = value.map((entry) => asString(entry)?.trim() ?? '')
  return applicationNumbers.every((entry) => /^[1-9]\d*$/.test(entry)) ? applicationNumbers : null
}

export const fetchProvincialExemptionCreatePreview = async (
  selectedApplicationNumbers: string[],
): Promise<ProvincialExemptionCreatePreview> => {
  const applicationNumbers = Array.from(
    new Set(selectedApplicationNumbers.map((value) => value.trim())),
  )
  if (
    applicationNumbers.length === 0 ||
    applicationNumbers.some((value) => !/^[1-9]\d*$/.test(value))
  ) {
    throw new Error('Valid selected application numbers are required to prepare the exemption.')
  }

  const params = new URLSearchParams()
  applicationNumbers.forEach((value) => params.append('applicationNumbers', value))

  try {
    const response = await apiService
      .getAxiosInstance()
      .get<unknown>('/lexis/rpc/exemption-details/create-preview', { params })
    if (!isRecord(response.data)) {
      throw new Error('LEXIS returned an invalid exemption preview.')
    }

    const errors = asStringArray(response.data.errors)
    if (response.data.valid !== true) {
      throw new Error(errors[0] ?? 'The selected applications are not eligible for an exemption.')
    }

    const exemptionTypeCode = asString(response.data.exemptionTypeCode)
    const exemptionStatusCode = asString(response.data.exemptionStatusCode)
    const approvedVolume = asString(response.data.approvedVolume)
    const expiryDate = asString(response.data.expiryDate)
    const previewApplicationNumbers = parseCreatePreviewApplicationNumbers(
      response.data.applicationNumbers,
    )
    const volume = approvedVolume == null ? Number.NaN : Number(approvedVolume)
    const expiryTimestamp = Date.parse(`${expiryDate}T00:00:00Z`)
    const validExpiryDate =
      /^\d{4}-\d{2}-\d{2}$/.test(expiryDate ?? '') &&
      !Number.isNaN(expiryTimestamp) &&
      new Date(expiryTimestamp).toISOString().slice(0, 10) === expiryDate
    if (
      exemptionTypeCode !== 'M' ||
      exemptionStatusCode !== 'NEW' ||
      !approvedVolume ||
      !/^\d+(?:\.\d)?$/.test(approvedVolume) ||
      !Number.isFinite(volume) ||
      volume <= 0 ||
      !validExpiryDate ||
      previewApplicationNumbers == null ||
      previewApplicationNumbers.length !== applicationNumbers.length ||
      previewApplicationNumbers.some((value, index) => value !== applicationNumbers[index])
    ) {
      throw new Error('LEXIS returned an invalid exemption preview.')
    }

    return {
      exemptionTypeCode,
      exemptionStatusCode,
      approvedVolume,
      expiryDate: expiryDate ?? '',
      applicationNumbers: previewApplicationNumbers,
    }
  } catch (error) {
    if (error instanceof Error && !axios.isAxiosError(error)) {
      throw error
    }
    if (axios.isAxiosError(error)) {
      const payload = error.response?.data
      const detail = isRecord(payload) ? asString(payload.detail) : undefined
      throw new Error(
        detail ?? 'LEXIS could not prepare the exemption. Please try again before saving.',
      )
    }
    throw new Error('LEXIS could not prepare the exemption. Please try again before saving.')
  }
}

export const submitProvincialExemptionCreate = async (
  form: ProvincialExemptionCreateSubmission,
): Promise<CreateSubmissionResult> => {
  try {
    const payload = await postLegacyForm(
      getProvincialExemptionCreatePath(),
      withCreateActionMapping('addExemption', {
        applicationNumber: form.applicationNumber,
        applications: form.linkedApplicationNumbers.join(','),
        exemptionNumber: form.exemptionNumber,
        exemptionTypeCode: form.exemptionTypeCode,
        exemptionStatusCode: form.exemptionStatusCode,
        approvalDate: form.approvalDate,
        expiryDate: form.expiryDate,
        approvedVolume: form.approvedVolume,
        enableRateOverride: form.enableRateOverride ? 'true' : undefined,
        feeRate: form.enableRateOverride ? form.feeRate : undefined,
        region: form.regionNumbers.join(','),
        otherConditions: form.otherConditions,
      }),
    )
    return parseCreateResponse(payload, ['exemptionNumber'])
  } catch (error) {
    return buildFailureResult(
      'Exemption submission failed. Please review the form and try again. If the problem persists, contact support.',
      error,
    )
  }
}

export type ProvincialOfferCreateSubmission = {
  applicationNumber: string
  packageNumber: string
  offeringClientNumber: string
  companyName: string
  contactName: string
  offerVolume: string
  purchaseOfferAmount: string
  teacReviewDate: string
  fairOfferIndicator: string
  validOfferIndicator: string
  approvalIndicator: string
  offerRemark: string
  pickupLocation: string
  offerCondition: string
}

export type ProvincialOfferUpdateSubmission = ProvincialOfferCreateSubmission & {
  offerNumber: string
  region: string
  purchaseOfferDate: string
  offerWithdrawalDate: string
  withdrawReason: string
}

const buildProvincialOfferPayload = (form: ProvincialOfferCreateSubmission): LegacyFormPayload => ({
  applicationNumber: form.applicationNumber,
  packageNumber: form.packageNumber,
  companyName: form.companyName,
  contactName: form.contactName,
  offeringClientNumber: form.offeringClientNumber,
  clientNumber: form.offeringClientNumber,
  offerVolume: form.offerVolume,
  purchaseOfferAmount: form.purchaseOfferAmount,
  teacReviewDate: form.teacReviewDate,
  fairOfferIndicator: form.fairOfferIndicator,
  validOfferIndicator: form.validOfferIndicator,
  approvalIndicator: form.approvalIndicator,
  pickupLocation: form.pickupLocation,
  offerCondition: form.offerCondition,
  offerRemark: form.offerRemark,
})

const toProvincialOfferUpdateParams = (payload: LegacyFormPayload): URLSearchParams => {
  const params = new URLSearchParams()
  Object.entries(payload).forEach(([key, value]) => {
    if (value !== undefined) {
      params.append(key, value)
    }
  })
  return params
}

export const submitProvincialOfferCreate = async (
  form: ProvincialOfferCreateSubmission,
): Promise<CreateSubmissionResult> => {
  try {
    const payload = await postLegacyForm(
      getProvincialOfferCreatePath(),
      withCreateActionMapping('addOffer', buildProvincialOfferPayload(form)),
    )
    return parseCreateResponse(payload, ['exportPurchaseOfferNumber', 'offerNumber'])
  } catch (error) {
    return buildFailureResult(
      'Offer submission failed. Please review the form and try again. If the problem persists, contact support.',
      error,
    )
  }
}

export const submitProvincialOfferUpdate = async (
  form: ProvincialOfferUpdateSubmission,
): Promise<CreateSubmissionResult> => {
  try {
    const payload = await postLegacyForm(
      withQueryParam(getProvincialOfferCreatePath(), 'actionMapping', 'updateOffer'),
      withCreateActionMapping('updateOffer', {
        ...buildProvincialOfferPayload(form),
        purchaseOfferDate: form.purchaseOfferDate,
        offerWithdrawalDate: form.offerWithdrawalDate,
        withdrawReason: form.withdrawReason,
        exportPurchaseOfferNumber: form.offerNumber,
        offerNumber: form.offerNumber,
      }),
      toProvincialOfferUpdateParams,
    )
    return parseCreateResponse(payload, ['exportPurchaseOfferNumber', 'offerNumber'])
  } catch (error) {
    return buildFailureResult(
      'Offer update failed. Please review the form and try again. If the problem persists, contact support.',
      error,
      undefined,
      'The offer edit lock has expired or is held by another user. Close and re-open the offer before saving again.',
    )
  }
}
