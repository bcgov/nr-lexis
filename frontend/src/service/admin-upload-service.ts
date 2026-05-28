import apiService from '@/service/api-service'

export type UploadWorkflowType = 'application' | 'exemption' | 'permit' | 'invoice'

type UploadRequestBase = {
  file: File
  fileDescription: string
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

type UploadRequestByType = {
  application: ApplicationUploadRequest
  exemption: ExemptionUploadRequest
  permit: PermitUploadRequest
  invoice: InvoiceUploadRequest
}

const MODERN_UPLOAD_ENDPOINTS: Record<UploadWorkflowType, string> = {
  application: '/lexis/admin/uploads/applications',
  exemption: '/lexis/admin/uploads/exemptions',
  permit: '/lexis/admin/uploads/permits',
  invoice: '/lexis/admin/uploads/invoices',
}

const appendBaseFormData = (formData: FormData, request: UploadRequestBase): void => {
  formData.append('formFile', request.file)
  formData.append('fileDescription', request.fileDescription)
}

const buildModernPayload = <TType extends UploadWorkflowType>(
  workflowType: TType,
  request: UploadRequestByType[TType],
): FormData => {
  const formData = new FormData()
  appendBaseFormData(formData, request)

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

  return formData
}

export const submitAdminUpload = async <TType extends UploadWorkflowType>(
  workflowType: TType,
  request: UploadRequestByType[TType],
): Promise<void> => {
  const modernEndpoint = MODERN_UPLOAD_ENDPOINTS[workflowType]
  const modernPayload = buildModernPayload(workflowType, request)
  await apiService.getAxiosInstance().post(modernEndpoint, modernPayload, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  })
}
