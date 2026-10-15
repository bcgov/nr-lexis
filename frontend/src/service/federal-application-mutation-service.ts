import apiService from '@/service/api-service'

type FederalMutationResult = {
  success: boolean
  message: string | null
  errors: string[]
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
