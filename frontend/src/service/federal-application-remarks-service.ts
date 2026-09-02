import apiService from '@/service/api-service'

export type FederalApplicationRemark = {
  remarkId: number
  remark: string
  user: string | null
  date: string | null
}

type FederalRemarkMutationResult = {
  success: boolean
  message: string | null
  remark: FederalApplicationRemark | null
  errors: string[]
}

export const fetchFederalApplicationRemarks = async (
  applicationNumber: string,
): Promise<FederalApplicationRemark[]> => {
  const response = await apiService
    .getAxiosInstance()
    .get<FederalApplicationRemark[]>(`/lexis/federal/applications/${applicationNumber}/remarks`)
  return response.data
}

export const saveFederalApplicationRemark = async (
  applicationNumber: string,
  remark: string,
  remarkId?: number,
): Promise<FederalRemarkMutationResult> => {
  const client = apiService.getAxiosInstance()
  const request = { remark }
  const response = remarkId
    ? await client.put<FederalRemarkMutationResult>(
        `/lexis/federal/applications/${applicationNumber}/remarks/${remarkId}`,
        request,
      )
    : await client.post<FederalRemarkMutationResult>(
        `/lexis/federal/applications/${applicationNumber}/remarks`,
        request,
      )
  return response.data
}
