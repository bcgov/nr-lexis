import apiService from '@/service/api-service'
import { booleanField, firstStringField, isRecord, stringField } from '@/utils/record'

export type ApplicationClientLocation = {
  locationCode: string
  locationName: string
  selected: boolean
}

export type ApplicationClientContact = {
  contactName: string
  contactId: string
}

export type ApplicationClientData = {
  clientNumber: string
  companyName: string
  address: string
  city: string
  province: string
  postalCode: string
  country: string
  phone: string
  fax: string
  email: string
  notfound: string
}

const CLIENT_LOCATION_CACHE_TTL_MS = 5 * 60_000

const parseClientData = (input: unknown): ApplicationClientData | null => {
  if (!isRecord(input)) {
    return null
  }

  const clientNumber = stringField(input, 'clientNumber')

  if (!clientNumber) {
    return null
  }

  return {
    clientNumber,
    companyName: stringField(input, 'companyName'),
    address: stringField(input, 'address'),
    city: stringField(input, 'city'),
    province: stringField(input, 'province'),
    postalCode: stringField(input, 'postalCode'),
    country: stringField(input, 'country'),
    phone: stringField(input, 'phone'),
    fax: stringField(input, 'fax'),
    email: stringField(input, 'email'),
    notfound: stringField(input, 'notfound'),
  }
}

const parseClientLocations = (input: unknown): ApplicationClientLocation[] => {
  if (!Array.isArray(input)) {
    return []
  }

  return input
    .map((item) => {
      if (!isRecord(item)) {
        return null
      }

      const locationCode = firstStringField(item, ['locationCode', 'code'])
      const locationName = firstStringField(item, ['locationName', 'name'])

      if (!locationCode || !locationName) {
        return null
      }

      return {
        locationCode,
        locationName,
        selected: booleanField(item, 'selected'),
      }
    })
    .filter((item): item is ApplicationClientLocation => item !== null)
}

const parseClientContacts = (input: unknown): ApplicationClientContact[] => {
  if (!Array.isArray(input)) {
    return []
  }

  return input
    .map((item) => {
      if (!isRecord(item)) {
        return null
      }

      const contactName = firstStringField(item, ['contactName', 'name'])
      const contactId = firstStringField(item, ['contactId', 'id'])

      if (!contactName || contactId === '0') {
        return null
      }

      return {
        contactName,
        contactId,
      }
    })
    .filter((item): item is ApplicationClientContact => item !== null)
}

export const fetchApplicationClientData = async (
  clientNumber: string,
  clientLocationCode: string,
): Promise<ApplicationClientData | null> => {
  const normalizedClientNumber = clientNumber.trim()
  const normalizedClientLocationCode = clientLocationCode.trim()
  if (!normalizedClientNumber || !normalizedClientLocationCode) {
    return null
  }

  try {
    const data = await apiService.getCachedData<unknown>(
      '/lexis/rpc/application-details/client-data',
      {
        params: {
          clientLocationCode: normalizedClientLocationCode,
          clientNumber: normalizedClientNumber,
        },
      },
      {
        cacheKey: `application-client-data:${normalizedClientNumber}:${normalizedClientLocationCode}`,
        ttlMs: CLIENT_LOCATION_CACHE_TTL_MS,
      },
    )
    return parseClientData(data)
  } catch (error) {
    console.warn(
      `Unable to load client data for client ${normalizedClientNumber} location ${normalizedClientLocationCode}.`,
      error,
    )
    return null
  }
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

export const fetchApplicationClientContacts = async (
  clientNumber: string,
  clientLocationCode: string,
  applicantType: 'owner' | 'agent' = 'owner',
  applicationNumber = '',
): Promise<ApplicationClientContact[]> => {
  const normalizedClientNumber = clientNumber.trim()
  const normalizedClientLocationCode = clientLocationCode.trim()
  const normalizedApplicationNumber = applicationNumber.trim()
  if (!normalizedClientNumber || !normalizedClientLocationCode) {
    return []
  }

  try {
    const data = await apiService.getCachedData<unknown>(
      '/lexis/rpc/application-details/contacts-for-location',
      {
        params: {
          applicantType,
          applicationNumber: normalizedApplicationNumber,
          clientLocationCode: normalizedClientLocationCode,
          clientNumber: normalizedClientNumber,
        },
      },
      {
        cacheKey: [
          'application-client-contacts',
          applicantType,
          normalizedClientNumber,
          normalizedClientLocationCode,
          normalizedApplicationNumber,
        ].join(':'),
        ttlMs: CLIENT_LOCATION_CACHE_TTL_MS,
      },
    )
    return parseClientContacts(data)
  } catch (error) {
    console.warn(
      `Unable to load ${applicantType} contacts for client ${normalizedClientNumber} location ${normalizedClientLocationCode}.`,
      error,
    )
    return []
  }
}
