import apiService from '@/service/api-service'
import {
  documentValueAsBoolean as asBoolean,
  documentValueAsString as asString,
  documentValueAsStringArray as asStringArray,
  type DocumentRowBase,
  normalizeDocumentRowBase,
  parseDocumentArrayPayload,
  parseRemoveDocumentSuccess,
} from '@/service/document-service-utils'
import { extractResponseFilename } from '@/service/http-response-utils'
import { LEGACY_FORM_CONTENT_TYPE, toUrlEncodedParams } from '@/service/legacy-form-utils'
import { isRecord, recordOrEmpty } from '@/utils/record'

export type PermitDocumentRow = DocumentRowBase & {
  typeCode: string
}

export type PermitInvoiceRow = {
  id: string
  invoiceNumber: string
  exportValueCad: string
  conversionRate: string
  feeInLieu: string
  invoiceFound: boolean
}

export type PermitDocumentAndInvoiceSource = 'api'

export type PermitDocumentsResult = {
  rows: PermitDocumentRow[]
  source: PermitDocumentAndInvoiceSource
}

export type PermitInvoicesResult = {
  rows: PermitInvoiceRow[]
  source: PermitDocumentAndInvoiceSource
}

export type OpenPermitDocumentResult = {
  source: 'api'
  blob: Blob
  filename: string
}

export type PermitInvoiceConversionRateResult = {
  conversionRate: string
  source: PermitDocumentAndInvoiceSource
}

export type AddPermitInvoiceRequest = {
  permitNumber: string
  salesInvoiceNumber: string
  invoiceExportValue: string
  invoiceConversionRate: string
  invoiceFeeInLieu: string
}

export type PermitDetailMutationRequest = {
  permitNumber: string
  permitStatus: string
  permitSubmitDate: string
  permitIssueDate: string
  permitExpiryDate: string
  permitRequestDate: string
  exemptionNumber: string
  permitReceiptNo: string
  permitRemarks: string
  permitTotalVolume: string
  permitNumberOfPieces: string
  oicPermitTotalPieces: string
  oicPermitTotalVolume: string
  orgUnitNumber: string
  ownerClientNumber: string
  ownerClientLocation: string
  agentClientNumber: string
  agentClientLocation: string
  destinationCompanyName: string
  destinationCountry: string
  transportType: string
  transportName: string
  estimatedShippingDate: string
  portOfExport: string
  otherPortOfExport: string
  overrideInd?: string
  overrideFee?: string
  overrideComment?: string
}

export type PermitFeeOverrideContext = {
  overrideEnabled: boolean
  overrideFee: string
  overrideComment: string
  locked: boolean
  lockMessage: string
}

export type AddPermitInvoiceResult = {
  success: boolean
  message: string
  errors: string[]
  warnings: string[]
  source: PermitDocumentAndInvoiceSource
}

export type PermitDetailMutationResult = AddPermitInvoiceResult & {
  permitStatus?: string
  permitReceiptNo?: string
  permitVolume?: number | null
  permitNumberOfPieces?: number | null
}

export type CreatePermitFromExemptionResult = AddPermitInvoiceResult & {
  permitNumber: string
}

export type PermitEmailResult = {
  success: boolean
  message: string
  permitRequestDate: string
}

export type RemovePermitDocumentResult = {
  success: boolean
  source: PermitDocumentAndInvoiceSource
}

type PermitInvoiceDetailsPayload = {
  invoicefound?: boolean
  rate?: unknown
  fee?: unknown
  value?: unknown
}

const PERMIT_DOCUMENT_INVOICE_CACHE_TTL_MS = 30_000

const normalizeDocumentRow = (row: unknown, index: number): PermitDocumentRow => {
  const source = recordOrEmpty(row)
  return {
    ...normalizeDocumentRowBase(row, index),
    typeCode: asString(source.typeCode || source.attachmentType || source.type_code),
  }
}

const fetchInvoiceDetails = async (
  permitNumber: string,
  invoiceNumber: string,
): Promise<PermitInvoiceDetailsPayload> => {
  const response = await apiService.getCachedResponse<PermitInvoiceDetailsPayload>(
    '/lexis/rpc/permit-details/invoice-details',
    {
      params: {
        permitNumber,
        salesInvoiceNumber: invoiceNumber,
      },
    },
    { ttlMs: PERMIT_DOCUMENT_INVOICE_CACHE_TTL_MS },
  )

  if (response.status === 204) {
    return {
      invoicefound: false,
      rate: '',
      fee: '',
      value: '',
    }
  }

  return (
    response.data ?? {
      invoicefound: false,
      rate: '',
      fee: '',
      value: '',
    }
  )
}

export const fetchPermitDocuments = async (
  permitNumber: string,
): Promise<PermitDocumentsResult> => {
  const response = await apiService.getCachedResponse<unknown>(
    '/lexis/rpc/permit-details/document-details',
    {
      params: {
        permitNumber,
      },
    },
    { ttlMs: PERMIT_DOCUMENT_INVOICE_CACHE_TTL_MS },
  )

  if (response.status === 204) {
    return {
      rows: [],
      source: 'api',
    }
  }

  const rows = parseDocumentArrayPayload(response.data)
  if (!rows) {
    throw new Error('Unexpected document list payload.')
  }

  return {
    rows: rows.map(normalizeDocumentRow),
    source: 'api',
  }
}

export const openPermitDocument = async (
  fileId: string,
  fileName: string,
  permitNumber: string,
): Promise<OpenPermitDocumentResult> => {
  const response = await apiService
    .getAxiosInstance()
    .get<Blob>('/lexis/rpc/permit-details/document', {
      params: {
        fileId,
        fileName,
        permitNumber,
      },
      responseType: 'blob',
      headers: {
        Accept: 'application/octet-stream',
      },
    })

  if (response.status === 204) {
    throw new Error('Permit document payload was empty.')
  }

  return {
    source: 'api',
    blob: response.data,
    filename: extractResponseFilename(response.headers, fileName),
  }
}

export const fetchPermitInvoices = async (permitNumber: string): Promise<PermitInvoicesResult> => {
  const response = await apiService.getCachedResponse<{ invoiceList?: unknown }>(
    '/lexis/rpc/permit-details/invoices-for-permit',
    {
      params: {
        permitNumber,
      },
    },
    { ttlMs: PERMIT_DOCUMENT_INVOICE_CACHE_TTL_MS },
  )

  if (response.status === 204) {
    return {
      rows: [],
      source: 'api',
    }
  }

  const listRaw = Array.isArray(response.data?.invoiceList)
    ? response.data.invoiceList
    : parseDocumentArrayPayload(response.data, ['invoiceList'])
  if (!listRaw) {
    throw new Error('Unexpected invoice list payload.')
  }

  const invoiceNumbers = listRaw.map((entry) => asString(entry)).filter((entry) => entry.length > 0)

  const detailsResults: PermitInvoiceDetailsPayload[] = []
  for (const invoiceNumber of invoiceNumbers) {
    detailsResults.push(await fetchInvoiceDetails(permitNumber, invoiceNumber))
  }

  return {
    rows: detailsResults.map((result, index) => ({
      id: `${invoiceNumbers[index]}-${index + 1}`,
      invoiceNumber: invoiceNumbers[index],
      exportValueCad: asString(result.value),
      conversionRate: asString(result.rate),
      feeInLieu: asString(result.fee),
      invoiceFound: asBoolean(result.invoicefound),
    })),
    source: 'api',
  }
}

export const fetchPermitInvoiceConversionRate =
  async (): Promise<PermitInvoiceConversionRateResult> => {
    const response = await apiService.getCachedResponse<{
      success?: boolean
      conversionRate?: unknown
    }>('/lexis/rpc/permit-details/conversion-rate', undefined, {
      ttlMs: PERMIT_DOCUMENT_INVOICE_CACHE_TTL_MS,
    })

    const conversionRate = asString(response.data?.conversionRate).trim()
    const numericRate = Number(conversionRate)
    if (
      !asBoolean(response.data?.success) ||
      !conversionRate ||
      !Number.isFinite(numericRate) ||
      numericRate <= 0
    ) {
      throw new Error('A valid currency conversion rate is required to add an invoice.')
    }
    return {
      conversionRate,
      source: 'api',
    }
  }

const postFormData = async (path: string, payload: Record<string, string>): Promise<unknown> => {
  const response = await apiService
    .getAxiosInstance()
    .post<unknown>(path, toUrlEncodedParams(payload), {
      headers: {
        'Content-Type': LEGACY_FORM_CONTENT_TYPE,
      },
    })

  return response.data
}

const parseAddPermitInvoiceResponse = (
  payload: unknown,
  source: PermitDocumentAndInvoiceSource,
): AddPermitInvoiceResult => {
  const objectPayload = recordOrEmpty(payload)
  const success = asBoolean(objectPayload.success ?? objectPayload.valid)
  const message = asString(objectPayload.message)
  const errors = asStringArray(objectPayload.errors)
  const warnings = asStringArray(objectPayload.warnings)

  return {
    success,
    message: message || (success ? 'Invoice saved successfully.' : 'Unable to save invoice.'),
    errors,
    warnings,
    source,
  }
}

const parsePermitDetailMutationResponse = (
  payload: unknown,
  source: PermitDocumentAndInvoiceSource,
): PermitDetailMutationResult => {
  const objectPayload = recordOrEmpty(payload)
  const success = asBoolean(objectPayload.success ?? objectPayload.valid)
  const message = asString(objectPayload.message)
  const errors = asStringArray(objectPayload.errors)
  const warnings = asStringArray(objectPayload.warnings)

  return {
    success,
    message: message || (success ? 'Permit saved successfully.' : 'Unable to save permit.'),
    errors,
    warnings,
    source,
    permitStatus: asString(objectPayload.permitStatus),
    permitReceiptNo: asString(objectPayload.permitReceiptNo),
  }
}

const parseCreatePermitFromExemptionResponse = (
  payload: unknown,
): CreatePermitFromExemptionResult => {
  const objectPayload = recordOrEmpty(payload)
  const success = asBoolean(objectPayload.success ?? objectPayload.valid)
  const message = asString(objectPayload.message)

  return {
    success,
    message: message || (success ? 'Permit created successfully.' : 'Unable to create permit.'),
    errors: asStringArray(objectPayload.errors),
    warnings: asStringArray(objectPayload.warnings),
    source: 'api',
    permitNumber: asString(objectPayload.permitNumber),
  }
}

export const addPermitInvoice = async (
  request: AddPermitInvoiceRequest,
): Promise<AddPermitInvoiceResult> => {
  const normalizedPayload = {
    permitNumber: request.permitNumber.trim(),
    salesInvoiceNumber: request.salesInvoiceNumber.trim(),
    invoiceExportValue: request.invoiceExportValue.trim(),
    invoiceConversionRate: request.invoiceConversionRate.trim(),
    invoiceFeeInLieu: request.invoiceFeeInLieu.trim(),
  }

  const payload = await postFormData('/lexis/rpc/permit-details/add-invoice', normalizedPayload)
  return parseAddPermitInvoiceResponse(payload, 'api')
}

const normalizePermitDetailMutationPayload = (
  request: PermitDetailMutationRequest,
): Record<string, string> => {
  const portOfExport = request.portOfExport.trim().toUpperCase()
  const payload: Record<string, string> = {
    permitNumber: request.permitNumber.trim(),
    permitStatus: request.permitStatus.trim(),
    permitSubmitDate: request.permitSubmitDate.trim(),
    permitIssueDate: request.permitIssueDate.trim(),
    permitExpiryDate: request.permitExpiryDate.trim(),
    permitRequestDate: request.permitRequestDate.trim(),
    exemptionNumber: request.exemptionNumber.trim(),
    permitReceiptNo: request.permitReceiptNo.trim(),
    permitRemarks: request.permitRemarks.trim(),
    permitTotalVolume: request.permitTotalVolume.trim(),
    permitNumberOfPieces: request.permitNumberOfPieces.trim(),
    oicPermitTotalPieces: request.oicPermitTotalPieces.trim(),
    oicPermitTotalVolume: request.oicPermitTotalVolume.trim(),
    orgUnitNo: request.orgUnitNumber.trim(),
    ownerClientNumber: request.ownerClientNumber.trim(),
    ownerClientLocation: request.ownerClientLocation.trim(),
    agentClientNumber: request.agentClientNumber.trim(),
    agentClientLocation: request.agentClientLocation.trim(),
    destinationCompanyName: request.destinationCompanyName.trim(),
    destinationCountry: request.destinationCountry.trim().toUpperCase(),
    transportType: request.transportType.trim().toUpperCase(),
    transportName: request.transportName.trim(),
    estimatedShippingDate: request.estimatedShippingDate.trim(),
    portOfExport,
    otherPortOfExport: portOfExport === 'OT' ? request.otherPortOfExport.trim() : '',
  }
  if (request.overrideInd !== undefined) {
    payload.overrideInd = request.overrideInd.trim()
    payload.overrideFee = request.overrideFee?.trim() ?? ''
    payload.overrideComment = request.overrideComment?.trim() ?? ''
  }
  return payload
}

export const fetchPermitFeeOverrideContext = async (
  permitNumber: string,
): Promise<PermitFeeOverrideContext> => {
  const normalizedPermitNumber = permitNumber.trim()
  const path = '/lexis/rpc/permit-details/edit-context'
  const config = { params: { permitNumber: normalizedPermitNumber } }
  const response = await apiService.getCachedResponse<unknown>(path, config, { ttlMs: 0 })
  if (
    response.status === 204 ||
    !isRecord(response.data) ||
    typeof response.data.overrideEnabled !== 'boolean' ||
    typeof response.data.locked !== 'boolean'
  ) {
    throw new Error('Unexpected permit edit context payload.')
  }
  apiService.registerRecordVersion('permit', normalizedPermitNumber, response, path, config)
  const payload = response.data
  return {
    overrideEnabled: asBoolean(payload.overrideEnabled),
    overrideFee: asString(payload.overrideFee),
    overrideComment: asString(payload.overrideComment),
    locked: asBoolean(payload.locked),
    lockMessage: asString(payload.lockMessage),
  }
}

export const releasePermitEditLock = async (permitNumber: string): Promise<void> => {
  try {
    await apiService.getAxiosInstance().post('/lexis/rpc/permit-details/release-lock', null, {
      params: { permitNumber: permitNumber.trim() },
    })
  } catch {
    // Compatibility cleanup only; record versions enforce save conflicts.
  }
}

export const updatePermitDetail = async (
  request: PermitDetailMutationRequest,
): Promise<PermitDetailMutationResult> => {
  const payload = await postFormData(
    '/lexis/rpc/permit-details/update-permit',
    normalizePermitDetailMutationPayload(request),
  )
  return parsePermitDetailMutationResponse(payload, 'api')
}

export const createPermitFromExemption = async (
  exemptionNumber: string,
): Promise<CreatePermitFromExemptionResult> => {
  const normalizedExemptionNumber = exemptionNumber.trim()
  if (!normalizedExemptionNumber) {
    throw new Error('A valid exemption number is required to create a permit.')
  }

  const payload = await postFormData('/lexis/rpc/permit-details/create-from-exemption', {
    exemptionNumber: normalizedExemptionNumber,
  })
  return parseCreatePermitFromExemptionResponse(payload)
}

export const updatePermitShipping = async (
  request: PermitDetailMutationRequest,
): Promise<PermitDetailMutationResult> => {
  const payload = await postFormData(
    '/lexis/rpc/permit-details/update-shipping',
    normalizePermitDetailMutationPayload(request),
  )
  return parsePermitDetailMutationResponse(payload, 'api')
}

const sendPermitEmail = async (
  path: string,
  permitNumber: string,
  additionalPayload: Record<string, string> = {},
): Promise<PermitEmailResult> => {
  const payload = await postFormData(path, {
    permitNumber: permitNumber.trim(),
    ...additionalPayload,
  })
  const source = recordOrEmpty(payload)
  return {
    success: asBoolean(source.success),
    message: asString(source.message),
    permitRequestDate: asString(source.permitRequestDate),
  }
}

export const sendPermitReviewRequestEmail = async (
  permitNumber: string,
  copyToEmailAddress = '',
): Promise<PermitEmailResult> =>
  sendPermitEmail('/lexis/rpc/permit-details/request-email', permitNumber, {
    copyToEmailAddress: copyToEmailAddress.trim(),
  })

export const fetchPermitApprovalEmailDefault = async (permitNumber: string): Promise<string> => {
  const response = await apiService
    .getAxiosInstance()
    .get<unknown>('/lexis/rpc/permit-details/approval-email-default', {
      params: { permitNumber: permitNumber.trim() },
    })
  return asString(recordOrEmpty(response.data).clientEmailAddress)
}

export const sendPermitApprovalEmail = async (
  permitNumber: string,
  clientEmailAddress: string,
): Promise<PermitEmailResult> =>
  sendPermitEmail('/lexis/rpc/permit-details/approval-email', permitNumber, {
    clientEmailAddress: clientEmailAddress.trim(),
  })

const removeDocument = async (
  apiPath: string,
  documentId: string,
  permitNumber: string,
): Promise<RemovePermitDocumentResult> => {
  const normalizedDocumentId = documentId.trim()
  const response = await apiService.getAxiosInstance().delete<unknown>(apiPath, {
    params: {
      documentId: normalizedDocumentId,
      permitNumber: permitNumber.trim(),
    },
  })

  if (response.status !== 200) {
    throw new Error('Unexpected permit document removal response.')
  }

  return {
    success: parseRemoveDocumentSuccess(response.data),
    source: 'api',
  }
}

export const removePermitDocument = async (
  documentId: string,
  permitNumber: string,
): Promise<RemovePermitDocumentResult> => {
  return removeDocument('/lexis/rpc/permit-details/document/permit', documentId, permitNumber)
}

export const removePermitInvoiceDocument = async (
  documentId: string,
  permitNumber: string,
): Promise<RemovePermitDocumentResult> => {
  return removeDocument('/lexis/rpc/permit-details/document/invoice', documentId, permitNumber)
}

export const removePermitApplicationDocument = async (
  documentId: string,
  permitNumber: string,
): Promise<RemovePermitDocumentResult> => {
  return removeDocument('/lexis/rpc/permit-details/document/application', documentId, permitNumber)
}
