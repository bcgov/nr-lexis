import type { AxiosResponse } from 'axios'
import apiService from '@/service/api-service'

const SEARCH_CACHE_TTL_MS = 10_000

export const getCachedSearchResponse = async <T>(
  path: string,
  params: URLSearchParams,
): Promise<AxiosResponse<T>> => {
  return apiService.getCachedResponse<T>(
    path,
    {
      params,
    },
    {
      ttlMs: SEARCH_CACHE_TTL_MS,
    },
  )
}
