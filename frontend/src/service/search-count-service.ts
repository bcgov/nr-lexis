import { getCachedSearchResponse } from '@/service/cached-search-service'
import { toSearchServiceError } from '@/service/search-service-fallback'

type BackendSearchCountResponse = {
  total: number
}

const withoutPagingParams = (params: URLSearchParams): URLSearchParams => {
  const countParams = new URLSearchParams(params)
  countParams.delete('sortField')
  countParams.delete('page')
  countParams.delete('size')
  return countParams
}

export const getSearchCount = async (
  path: string,
  params: URLSearchParams,
  errorMessage: string,
): Promise<number> => {
  try {
    const response = await getCachedSearchResponse<BackendSearchCountResponse>(
      path,
      withoutPagingParams(params),
    )
    const total = Number(response.data?.total)
    if (!Number.isFinite(total)) {
      throw new Error('Backend count response did not include a finite total.')
    }
    return total
  } catch (error) {
    throw toSearchServiceError(errorMessage, error)
  }
}
