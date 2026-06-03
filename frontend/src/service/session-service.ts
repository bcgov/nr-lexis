import apiService from '@/service/api-service'
import type {
  LexisSessionCapabilities,
  LexisSessionLogoutResponse,
} from '@/interfaces/LexisSession'

const SESSION_CAPABILITIES_CACHE_TTL_MS = 5_000

export const fetchSessionCapabilities = async (): Promise<LexisSessionCapabilities> => {
  const response = await apiService.getCachedResponse<LexisSessionCapabilities>(
    '/lexis/session/capabilities',
    undefined,
    {
      cacheKey: 'session-capabilities',
      ttlMs: SESSION_CAPABILITIES_CACHE_TTL_MS,
    },
  )

  return response.data
}

export const performLogoff = async (): Promise<LexisSessionLogoutResponse> => {
  const response = await apiService
    .getAxiosInstance()
    .post<LexisSessionLogoutResponse>('/lexis/session/logoff')

  return response.data
}
