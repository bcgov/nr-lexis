import apiService from '@/service/api-service'

export type DocumentUploadWorkflowType = 'application' | 'exemption' | 'permit' | 'invoice'
export type UploadWorkflowType = DocumentUploadWorkflowType | 'applicationScaleXml'

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

export type ScaleUploadPreviewRow = {
  lineNumber: number
  timberMark: string
  speciesCode: string
  speciesDescription: string
  gradeCode: string
  gradeDescription: string
  pieces: number | null
  volume: number | null
  packageNumber: string
  applicationNumber: number | null
  valid: boolean
  errors: string[]
  warnings: string[]
}

export type ScaleUploadPreviewResponse = {
  fileName: string
  totalRows: number
  validRows: number
  totalPieces: number
  totalVolume: number
  errors: string[]
  warnings: string[]
  rows: ScaleUploadPreviewRow[]
}

export type ScaleUploadSubmitResponse = {
  success: boolean
  message: string
  submittedRows: number
  applicationNumber: number | null
  errors: string[]
  warnings: string[]
  rows: ScaleUploadPreviewRow[]
}

export type ScaleXmlPreviewRequest = {
  applicationNumber: string
  packageNumber: string
  file: File
}

export type ScaleXmlSubmitRequest = {
  applicationNumber: string
  rows: ScaleUploadPreviewRow[]
}

const MODERN_UPLOAD_ENDPOINTS: Record<DocumentUploadWorkflowType, string> = {
  application: '/lexis/admin/uploads/applications',
  exemption: '/lexis/admin/uploads/exemptions',
  permit: '/lexis/admin/uploads/permits',
  invoice: '/lexis/admin/uploads/invoices',
}

const appendBaseFormData = (formData: FormData, request: UploadRequestBase): void => {
  formData.append('formFile', request.file)
  formData.append('fileDescription', request.fileDescription)
}

const buildModernPayload = <TType extends DocumentUploadWorkflowType>(
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

export const submitAdminUpload = async <TType extends DocumentUploadWorkflowType>(
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

export const previewScaleXmlUpload = async (
  request: ScaleXmlPreviewRequest,
): Promise<ScaleUploadPreviewResponse> => {
  const formData = new FormData()
  formData.append('file', request.file)
  formData.append('applicationNumber', request.applicationNumber)
  if (request.packageNumber.trim()) {
    formData.append('packageNumber', request.packageNumber.trim())
  }

  const response = await apiService
    .getAxiosInstance()
    .post<ScaleUploadPreviewResponse>(
      '/lexis/rpc/application-details/scale-upload/preview',
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      },
    )
  return response.data
}

export const submitScaleXmlUpload = async (
  request: ScaleXmlSubmitRequest,
): Promise<ScaleUploadSubmitResponse> => {
  const response = await apiService
    .getAxiosInstance()
    .post<ScaleUploadSubmitResponse>('/lexis/rpc/application-details/scale-upload/submit', {
      applicationNumber: Number.parseInt(request.applicationNumber, 10),
      rows: request.rows.map((row) => ({
        lineNumber: row.lineNumber,
        timberMark: row.timberMark,
        speciesCode: row.speciesCode,
        gradeCode: row.gradeCode,
        pieces: row.pieces,
        volume: row.volume,
        packageNumber: row.packageNumber,
        applicationNumber: row.applicationNumber,
      })),
    })
  return response.data
}
