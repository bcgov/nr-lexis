import apiService from '@/service/api-service'
import type {
  LexisSessionCapabilities,
  LexisSessionLogoutResponse,
} from '@/interfaces/LexisSession'

export const fetchSessionCapabilities = async (): Promise<LexisSessionCapabilities> => {
  const response = await apiService
    .getAxiosInstance()
    .get<LexisSessionCapabilities>('/lexis/session/capabilities')

  return response.data
}

export const performLogoff = async (): Promise<LexisSessionLogoutResponse> => {
  const response = await apiService
    .getAxiosInstance()
    .post<LexisSessionLogoutResponse>('/lexis/session/logoff')

  return response.data
}
