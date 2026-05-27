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

const LEGACY_UPLOAD_ENDPOINTS: Record<
  UploadWorkflowType,
  {
    path: string
    actionMapping: string
  }
> = {
  application: {
    path: '/fileApplicationUpload.do',
    actionMapping: 'upload',
  },
  exemption: {
    path: '/fileExemptionUpload.do',
    actionMapping: 'upload',
  },
  permit: {
    path: '/filePermitUpload.do',
    actionMapping: 'upload',
  },
  invoice: {
    path: '/fileInvoiceUpload.do',
    actionMapping: 'upload',
  },
}

const appendBaseFormData = (formData: FormData, request: UploadRequestBase): void => {
  formData.append('formFile', request.file)
  formData.append('fileDescription', request.fileDescription)
}

export const submitLegacyUpload = async <TType extends UploadWorkflowType>(
  workflowType: TType,
  request: UploadRequestByType[TType],
): Promise<void> => {
  const endpoint = LEGACY_UPLOAD_ENDPOINTS[workflowType]
  const params = new URLSearchParams({
    actionMapping: endpoint.actionMapping,
  })
  const formData = new FormData()

  appendBaseFormData(formData, request)

  if (workflowType === 'application') {
    params.set('applicationNumber', request.applicationNumber)
  }

  if (workflowType === 'exemption') {
    params.set('exemptionNumber', request.exemptionNumber)
  }

  if (workflowType === 'permit') {
    params.set('permitNumber', request.permitNumber)
  }

  if (workflowType === 'invoice') {
    params.set('permitNumber', request.permitNumber)
    params.set('invoiceConversionRate', request.invoiceConversionRate)
    params.set('invoiceFeeInLieu', request.invoiceFeeInLieu)
    formData.append('salesInvoiceNumber', request.salesInvoiceNumber)
    formData.append('invoiceExportValue', request.invoiceExportValue)
  }

  await apiService.getAxiosInstance().post(`${endpoint.path}?${params.toString()}`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  })
}
