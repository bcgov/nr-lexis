import axios from 'axios'
import { env } from '@/env'
import apiService from '@/service/api-service'

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
  errors?: unknown
  warnings?: unknown
  applicationNumber?: unknown
  exemptionNumber?: unknown
  exportPurchaseOfferNumber?: unknown
  offerNumber?: unknown
  permitNumber?: unknown
}

type CreateSubmitRequestMode = 'form' | 'json'

const asString = (value: unknown): string | undefined => {
  if (value === null || value === undefined) {
    return undefined
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : undefined
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }
  return undefined
}

const asStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return []
  }
  return value.map((item) => asString(item)).filter((item): item is string => Boolean(item))
}

const toUrlEncodedParams = (payload: Record<string, string | undefined>): URLSearchParams => {
  const params = new URLSearchParams()
  Object.entries(payload).forEach(([key, value]) => {
    if (value !== undefined && value.trim().length > 0) {
      params.append(key, value)
    }
  })
  return params
}

const getConfiguredPath = (configured: unknown, fallback: string): string => {
  if (typeof configured !== 'string') {
    return fallback
  }

  const trimmed = configured.trim()
  return trimmed.length > 0 ? trimmed : fallback
}

const getCreateSubmitRequestMode = (): CreateSubmitRequestMode => {
  const configured = (env.VITE_LEXIS_CREATE_SUBMIT_REQUEST_MODE ?? 'form')
    .toString()
    .trim()
    .toLowerCase()

  return configured === 'json' ? 'json' : 'form'
}

const shouldIncludeCreateSubmitActionMapping = (): boolean => {
  const configured = (env.VITE_LEXIS_CREATE_SUBMIT_INCLUDE_ACTION_MAPPING ?? 'true')
    .toString()
    .trim()
    .toLowerCase()
  return configured !== '0' && configured !== 'false' && configured !== 'no'
}

const withCreateActionMapping = (
  actionMapping: string,
  payload: Record<string, string | undefined>,
): Record<string, string | undefined> => {
  if (!shouldIncludeCreateSubmitActionMapping()) {
    return payload
  }

  return {
    actionMapping,
    ...payload,
  }
}

const getProvincialApplicationCreatePath = (): string => {
  return getConfiguredPath(
    env.VITE_LEXIS_CREATE_APPLICATION_ENDPOINT,
    '/lexis/applicationDetailsRPC',
  )
}

const getProvincialExemptionCreatePath = (): string => {
  return getConfiguredPath(env.VITE_LEXIS_CREATE_EXEMPTION_ENDPOINT, '/lexis/exemptionDetailsRPC')
}

const getProvincialOfferCreatePath = (): string => {
  return getConfiguredPath(env.VITE_LEXIS_CREATE_OFFER_ENDPOINT, '/lexis/offerDetailsRPC')
}

const getProvincialPermitCreatePath = (): string => {
  return getConfiguredPath(
    env.VITE_LEXIS_CREATE_PERMIT_ENDPOINT,
    '/lexis/rpc/permit-details/add-permit',
  )
}

const getIndigenousReservePermitCreatePath = (): string => {
  return getConfiguredPath(
    env.VITE_LEXIS_CREATE_INDIGENOUS_PERMIT_ENDPOINT,
    '/lexis/indianReservePermitDetails',
  )
}

const parseCreateResponse = (
  payload: LegacyCreateResponse,
  createdIdKeyCandidates: Array<keyof LegacyCreateResponse>,
): CreateSubmissionResult => {
  const success = payload.success ?? payload.valid ?? false
  const errors = asStringArray(payload.errors)
  const warnings = asStringArray(payload.warnings)
  const message =
    asString(payload.message) ??
    (success ? 'Saved successfully.' : errors.length > 0 ? '' : 'Save failed.')
  const createdId = createdIdKeyCandidates
    .map((key) => asString(payload[key]))
    .find((value) => Boolean(value))

  return {
    success,
    message,
    createdId,
    errors,
    warnings,
  }
}

const buildFailureResult = (defaultMessage: string, error: unknown): CreateSubmissionResult => {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status
    const responsePayload = (error.response?.data ?? null) as LegacyCreateResponse | null
    const responseMessage = asString(responsePayload?.message)
    const responseErrors = asStringArray(responsePayload?.errors)

    let message = defaultMessage
    if (status === 404 || status === 405) {
      message = `${defaultMessage} Submit endpoint is unavailable in this environment (status ${status}).`
    } else if (responseMessage) {
      message = responseMessage
    } else if (status) {
      message = `${defaultMessage} (status ${status}).`
    }

    return {
      success: false,
      message,
      createdId: undefined,
      errors: responseErrors,
      warnings: [],
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
  payload: Record<string, string | undefined>,
): Promise<LegacyCreateResponse> => {
  const requestMode = getCreateSubmitRequestMode()
  const requestBody = requestMode === 'json' ? payload : toUrlEncodedParams(payload)
  const contentType =
    requestMode === 'json' ? 'application/json' : 'application/x-www-form-urlencoded'

  const response = await apiService
    .getAxiosInstance()
    .post<LegacyCreateResponse>(path, requestBody, {
      headers: {
        'Content-Type': contentType,
      },
    })
  return response.data ?? {}
}

export type ProvincialApplicationCreateSubmission = {
  applicationNumber: string
  packageNumber: string
  ownerClientNumber: string
  ownerClientLocationCode: string
  ownerContactName: string
  applicantTypeCode: string
  productTypeCode: string
  ageClass: string
  exemptionType: string
  region: string
  applicationDate: string
  applicationTermDays: string
  receivedDate: string
  listingDate: string
  productLocation: string
  applicationVolume: string
  comments: string
}

export const submitProvincialApplicationCreate = async (
  form: ProvincialApplicationCreateSubmission,
): Promise<CreateSubmissionResult> => {
  try {
    const payload = await postLegacyForm(
      getProvincialApplicationCreatePath(),
      withCreateActionMapping('addApplication', {
        applicationNumber: form.applicationNumber,
        packageNumber: form.packageNumber,
        ownerClientNumber: form.ownerClientNumber,
        ownerClientLocationCode: form.ownerClientLocationCode,
        ownerClientLocation: form.ownerClientLocationCode,
        ownerContactName: form.ownerContactName,
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
        listingDate: form.listingDate,
        productLocation: form.productLocation,
        logLocation: form.productLocation,
        applicationVolume: form.applicationVolume,
        comments: form.comments,
        additionalRemarks: form.comments,
      }),
    )
    return parseCreateResponse(payload, ['applicationNumber'])
  } catch (error) {
    return buildFailureResult('Unable to submit provincial application create request.', error)
  }
}

export type ProvincialExemptionCreateSubmission = {
  exemptionNumber: string
  applicationNumber: string
  linkedApplicationNumbers: string[]
  exemptionTypeCode: string
  exemptionStatusCode: string
  ownerClientNumber: string
  applicantClientNumber: string
  approvalDate: string
  expiryDate: string
  approvedVolume: string
  otherConditions: string
}

export const submitProvincialExemptionCreate = async (
  form: ProvincialExemptionCreateSubmission,
): Promise<CreateSubmissionResult> => {
  try {
    const payload = await postLegacyForm(
      getProvincialExemptionCreatePath(),
      withCreateActionMapping('addExemption', {
        exemptionNumber: form.exemptionNumber,
        applicationNumber: form.applicationNumber,
        applications: form.linkedApplicationNumbers.join(','),
        exemptionTypeCode: form.exemptionTypeCode,
        exemptionStatusCode: form.exemptionStatusCode,
        ownerClientNumber: form.ownerClientNumber,
        applicantClientNumber: form.applicantClientNumber,
        agentClientNumber: form.applicantClientNumber,
        approvalDate: form.approvalDate,
        expiryDate: form.expiryDate,
        approvedVolume: form.approvedVolume,
        otherConditions: form.otherConditions,
      }),
    )
    return parseCreateResponse(payload, ['exemptionNumber'])
  } catch (error) {
    return buildFailureResult('Unable to submit provincial exemption create request.', error)
  }
}

export type ProvincialOfferCreateSubmission = {
  offerNumber: string
  applicationNumber: string
  packageNumber: string
  offeringClientNumber: string
  companyName: string
  contactName: string
  region: string
  purchaseOfferAmount: string
  purchaseOfferDate: string
  offerEndDate: string
  withdrawReason: string
  pickupLocation: string
  offerCondition: string
}

export const submitProvincialOfferCreate = async (
  form: ProvincialOfferCreateSubmission,
): Promise<CreateSubmissionResult> => {
  try {
    const payload = await postLegacyForm(
      getProvincialOfferCreatePath(),
      withCreateActionMapping('addOffer', {
        offerNumber: form.offerNumber,
        exportPurchaseOfferNumber: form.offerNumber,
        applicationNumber: form.applicationNumber,
        packageNumber: form.packageNumber,
        companyName: form.companyName,
        contactName: form.contactName,
        offeringClientNumber: form.offeringClientNumber,
        clientNumber: form.offeringClientNumber,
        region: form.region,
        purchaseOfferAmount: form.purchaseOfferAmount,
        purchaseOfferDate: form.purchaseOfferDate,
        offerEndDate: form.offerEndDate,
        withdrawReason: form.withdrawReason,
        pickupLocation: form.pickupLocation,
        offerCondition: form.offerCondition,
        offerRemark: form.offerCondition,
      }),
    )
    return parseCreateResponse(payload, ['exportPurchaseOfferNumber', 'offerNumber'])
  } catch (error) {
    return buildFailureResult('Unable to submit provincial offer create request.', error)
  }
}

export type ProvincialPermitCreateSubmission = {
  permitNumber: string
  applicationNumber: string
  packageNumber: string
  exemptionNumber: string
  region: string
  permitStatus: string
  applicantClientNumber: string
  ownerClientNumber: string
  submitDate: string
  issueDate: string
  estimatedShippingDate: string
  permitVolume: string
  remarks: string
}

export const submitProvincialPermitCreate = async (
  form: ProvincialPermitCreateSubmission,
): Promise<CreateSubmissionResult> => {
  try {
    const payload = await postLegacyForm(
      getProvincialPermitCreatePath(),
      withCreateActionMapping('addPermit', {
        permitNumber: form.permitNumber,
        permitStatus: form.permitStatus,
        permitIssueDate: form.issueDate,
        estimatedShippingDate: form.estimatedShippingDate,
        exemptionNumber: form.exemptionNumber,
        orgUnitNo: form.region,
        region: form.region,
        permitSubmitDate: form.submitDate,
        permitTotalVolume: form.permitVolume,
        ownerClientNumber: form.ownerClientNumber,
        agentClientNumber: form.applicantClientNumber,
        permitRemarks: form.remarks,
        oicApplicationNumber: form.applicationNumber,
        packageNumber: form.packageNumber,
      }),
    )
    return parseCreateResponse(payload, ['permitNumber'])
  } catch (error) {
    return buildFailureResult('Unable to submit provincial permit create request.', error)
  }
}

export type IndianReservePermitCreateSubmission = {
  permitNumber: string
  packageNumber: string
  clientNumber: string
  clientLocation: string
  region: string
  applicationDate: string
  permitIssueDate: string
  estimatedShippingDate: string
  destinationCountry: string
  transportTypeCode: string
  transportName: string
  portOfExport: string
  otherPortOfExport: string
  remarks: string
}

export const submitIndianReservePermitCreate = async (
  form: IndianReservePermitCreateSubmission,
): Promise<CreateSubmissionResult> => {
  try {
    const payload = await postLegacyForm(
      getIndigenousReservePermitCreatePath(),
      withCreateActionMapping('saveReservePermit', {
        applicationNumber: '0',
        clientNumber: form.clientNumber,
        clientLocation: form.clientLocation,
        permitNumber: form.permitNumber,
        region: form.region,
        applicationDate: form.applicationDate,
        permitIssueDate: form.permitIssueDate,
        estShippingDate: form.estimatedShippingDate,
        destinationCountry: form.destinationCountry,
        transportTypeCode: form.transportTypeCode,
        transportName: form.transportName,
        portOfExport: form.portOfExport,
        otherPortOfExport: form.otherPortOfExport,
        permitRemarks: form.remarks,
        packageNumber: form.packageNumber,
      }),
    )
    return parseCreateResponse(payload, ['permitNumber'])
  } catch (error) {
    return buildFailureResult('Unable to submit indigenous reserve permit create request.', error)
  }
}
