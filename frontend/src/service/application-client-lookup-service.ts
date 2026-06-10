import apiService from '@/service/api-service'

export type ApplicationClientLocation = {
  locationCode: string
  locationName: string
  selected: boolean
}

const CLIENT_LOCATION_CACHE_TTL_MS = 5 * 60_000

const parseClientLocations = (input: unknown): ApplicationClientLocation[] => {
  if (!Array.isArray(input)) {
    return []
  }

  return input
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null
      }

      const locationCode =
        typeof (item as any).locationCode === 'string'
          ? (item as any).locationCode.trim()
          : typeof (item as any).code === 'string'
            ? (item as any).code.trim()
            : ''
      const locationName =
        typeof (item as any).locationName === 'string'
          ? (item as any).locationName.trim()
          : typeof (item as any).name === 'string'
            ? (item as any).name.trim()
            : ''

      if (!locationCode || !locationName) {
        return null
      }

      return {
        locationCode,
        locationName,
        selected: (item as any).selected === true,
      }
    })
    .filter((item): item is ApplicationClientLocation => item !== null)
}

export const fetchApplicationClientLocations = async (
  clientNumber: string,
  applicantType: 'owner' | 'agent' = 'owner',
): Promise<ApplicationClientLocation[]> => {
  const normalizedClientNumber = clientNumber.trim()
  if (!normalizedClientNumber) {
    return []
  }

  try {
    const data = await apiService.getCachedData<unknown>(
      '/lexis/rpc/application-details/client-locations',
      {
        params: {
          applicantType,
          clientNumber: normalizedClientNumber,
        },
      },
      {
        cacheKey: `application-client-locations:${applicantType}:${normalizedClientNumber}`,
        ttlMs: CLIENT_LOCATION_CACHE_TTL_MS,
      },
    )
    return parseClientLocations(data)
  } catch (error) {
    console.warn(
      `Unable to load ${applicantType} locations for client ${normalizedClientNumber}.`,
      error,
    )
    return []
  }
}
