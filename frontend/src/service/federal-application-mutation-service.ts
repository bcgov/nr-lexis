import apiService from '@/service/api-service'

export type FederalPermitMutation = {
  permitNumber: number | null
  permitIssueDate: string
  destinationCountry: string
  transportType: string
  transportName: string
  shippingDate: string
  portOfExport: string
  otherPortOfExport: string
}

export type FederalMutationResult = {
  success: boolean
  message: string | null
  errors: string[]
}

export const saveFederalPermit = async (
  applicationNumber: string,
  request: FederalPermitMutation,
  update: boolean,
): Promise<FederalMutationResult> => {
  const client = apiService.getAxiosInstance()
  const path = `/lexis/federal/applications/${applicationNumber}/permit`
  const portOfExport = request.portOfExport.trim().toUpperCase()
  const normalizedRequest = {
    ...request,
    destinationCountry: request.destinationCountry.trim().toUpperCase(),
    transportType: request.transportType.trim().toUpperCase(),
    transportName: request.transportName.trim(),
    portOfExport,
    otherPortOfExport: portOfExport === 'OT' ? request.otherPortOfExport.trim() || null : null,
  }
  const response = update
    ? await client.put<FederalMutationResult>(path, normalizedRequest)
    : await client.post<FederalMutationResult>(path, normalizedRequest)
  return response.data
}

export const updateFederalApplicationStatus = async (
  applicationNumber: string,
  statusCode: string,
  remark: string,
): Promise<FederalMutationResult> => {
  const response = await apiService
    .getAxiosInstance()
    .post<FederalMutationResult>(`/lexis/federal/applications/${applicationNumber}/status`, {
      statusCode,
      remark,
    })
  return response.data
}
