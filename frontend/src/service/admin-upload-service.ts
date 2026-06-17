import apiService from '@/service/api-service'

export type UploadWorkflowType = 'application' | 'exemption' | 'permit' | 'invoice' | 'applicationSubmission'

export type AdminUploadResult = {
  uploadType?: string
  fileName?: string
  fileSize?: number
  status?: string
  message?: string
  applicationNumber?: number
  packageNumber?: string
  scaleRows?: number
  userReference?: string
  errors?: string[]
  warnings?: string[]
  submissionSummary?: LexisXmlSubmissionSummary
}

export type LexisXmlSubmissionSummary = {
  ownerClientNumber?: string
  ownerClientLocationCode?: string
  ownerContactName?: string
  jurisdictionCode?: string
  orgUnitNumber?: number
  sourceApplicationStatusCode?: string
  exemptionReasonCode?: string
  applicantTypeCode?: string
  productTypeCode?: string
  packageNumber?: string
  productLocation?: string
  ageClass?: string
  averageLength?: number
  averageDiameter?: number
  applicationVolume?: number
  averageLogVolume?: number
  endUseCode?: string
  speciesCodes?: string[]
  scaleRows?: number
}

type UploadRequestBase = {
  file: File
  fileDescription: string
}

type UploadFileRequestBase = {
  file: File
}

export type ApplicationUploadRequest = UploadRequestBase & {
  applicationNumber: string
}

export type ExemptionUploadRequest = UploadRequestBase & {
  exemptionNumber: string
}

export type PermitUploadRequest = UploadRequestBase & {
  permitNumber: string
}

export type InvoiceUploadRequest = UploadRequestBase & {
  permitNumber: string
  salesInvoiceNumber: string
  invoiceExportValue: string
  invoiceConversionRate: string
  invoiceFeeInLieu: string
}

export type ApplicationSubmissionUploadRequest = UploadFileRequestBase & {
  userReference?: string
}

type UploadRequestByType = {
  application: ApplicationUploadRequest
  exemption: ExemptionUploadRequest
  permit: PermitUploadRequest
  invoice: InvoiceUploadRequest
  applicationSubmission: ApplicationSubmissionUploadRequest
}

const MODERN_UPLOAD_ENDPOINTS: Record<UploadWorkflowType, string> = {
  application: '/lexis/admin/uploads/applications',
  exemption: '/lexis/admin/uploads/exemptions',
  permit: '/lexis/admin/uploads/permits',
  invoice: '/lexis/admin/uploads/invoices',
  applicationSubmission: '/lexis/application-submissions',
}

const APPLICATION_SUBMISSION_VALIDATION_ENDPOINT = '/lexis/application-submissions/validation'

const appendBaseFormData = (formData: FormData, request: UploadRequestBase): void => {
  formData.append('formFile', request.file)
  formData.append('fileDescription', request.fileDescription)
}

const appendUploadFile = (formData: FormData, request: UploadFileRequestBase): void => {
  formData.append('formFile', request.file)
}

const buildModernPayload = <TType extends UploadWorkflowType>(
  workflowType: TType,
  request: UploadRequestByType[TType],
): FormData => {
  const formData = new FormData()
  if (workflowType === 'applicationSubmission') {
    appendUploadFile(formData, request)
  } else {
    appendBaseFormData(formData, request)
  }

  if (workflowType === 'application') {
    formData.append('applicationNumber', request.applicationNumber)
  }

  if (workflowType === 'exemption') {
    formData.append('exemptionNumber', request.exemptionNumber)
  }

  if (workflowType === 'permit') {
    formData.append('permitNumber', request.permitNumber)
  }

  if (workflowType === 'invoice') {
    formData.append('permitNumber', request.permitNumber)
    formData.append('salesInvoiceNumber', request.salesInvoiceNumber)
    formData.append('invoiceExportValue', request.invoiceExportValue)
    formData.append('invoiceConversionRate', request.invoiceConversionRate)
    formData.append('invoiceFeeInLieu', request.invoiceFeeInLieu)
  }

  if (workflowType === 'applicationSubmission' && 'userReference' in request) {
    const userReference = request.userReference?.trim()
    if (userReference) {
      formData.append('userReference', userReference)
    }
  }

  return formData
}

export const submitAdminUpload = async <TType extends UploadWorkflowType>(
  workflowType: TType,
  request: UploadRequestByType[TType],
): Promise<AdminUploadResult> => {
  const modernEndpoint = MODERN_UPLOAD_ENDPOINTS[workflowType]
  const modernPayload = buildModernPayload(workflowType, request)
  const response = await apiService
    .getAxiosInstance()
    .post<AdminUploadResult>(modernEndpoint, modernPayload, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
  return response.data ?? {}
}

export const validateApplicationSubmissionUpload = async (
  request: ApplicationSubmissionUploadRequest,
): Promise<AdminUploadResult> => {
  const payload = buildModernPayload('applicationSubmission', request)
  const response = await apiService
    .getAxiosInstance()
    .post<AdminUploadResult>(APPLICATION_SUBMISSION_VALIDATION_ENDPOINT, payload, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
  return response.data ?? {}
}
