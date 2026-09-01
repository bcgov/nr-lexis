import apiService from '@/service/api-service'
import {
  booleanField,
  firstStringField,
  isRecord,
  mapRecordArray,
  stringField,
} from '@/utils/record'

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

type ClientLookupContext = {
  applicationNumber?: string
  permitNumber?: string
}

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
  return mapRecordArray(input, (item) => {
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
}

const parseClientContacts = (input: unknown): ApplicationClientContact[] => {
  return mapRecordArray(input, (item) => {
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
}

// INTENTIONAL_LEGACY_DIVERGENCE(AUTHORITATIVE_CLIENT_LOCATION_LOOKUP):
// Always resolve contact data with the persisted location instead of legacy's default-location view.
export const fetchApplicationClientData = async (
  clientNumber: string,
  clientLocationCode: string,
  context: ClientLookupContext = {},
): Promise<ApplicationClientData | null> => {
  const normalizedClientNumber = clientNumber.trim()
  const normalizedClientLocationCode = clientLocationCode.trim()
  const normalizedApplicationNumber = context.applicationNumber?.trim() ?? ''
  const normalizedPermitNumber = context.permitNumber?.trim() ?? ''
  if (!normalizedClientNumber || !normalizedClientLocationCode) {
    return null
  }

  const contextParams = {
    ...(normalizedApplicationNumber ? { applicationNumber: normalizedApplicationNumber } : {}),
    ...(normalizedPermitNumber ? { permitNumber: normalizedPermitNumber } : {}),
  }
  const contextCacheKey = normalizedApplicationNumber
    ? `:application:${normalizedApplicationNumber}`
    : normalizedPermitNumber
      ? `:permit:${normalizedPermitNumber}`
      : ''

  const data = await apiService.getCachedData<unknown>(
    '/lexis/rpc/application-details/client-data',
    {
      params: {
        ...contextParams,
        clientLocationCode: normalizedClientLocationCode,
        clientNumber: normalizedClientNumber,
      },
    },
    {
      cacheKey: `application-client-data:${normalizedClientNumber}:${normalizedClientLocationCode}${contextCacheKey}`,
      ttlMs: CLIENT_LOCATION_CACHE_TTL_MS,
    },
  )
  return parseClientData(data)
}

export const fetchExemptionClientData = async (
  clientNumber: string,
  clientLocationCode: string,
): Promise<ApplicationClientData | null> => {
  const normalizedClientNumber = clientNumber.trim()
  const normalizedClientLocationCode = clientLocationCode.trim()
  if (!normalizedClientNumber || !normalizedClientLocationCode) {
    return null
  }

  const data = await apiService.getCachedData<unknown>(
    '/lexis/rpc/exemption-details/client-data',
    {
      params: {
        clientLocationCode: normalizedClientLocationCode,
        clientNumber: normalizedClientNumber,
      },
    },
    {
      cacheKey: `exemption-client-data:${normalizedClientNumber}:${normalizedClientLocationCode}`,
      ttlMs: CLIENT_LOCATION_CACHE_TTL_MS,
    },
  )
  return parseClientData(data)
}

export const fetchApplicationClientLocations = async (
  clientNumber: string,
  applicantType: 'owner' | 'agent' = 'owner',
  applicationNumber = '',
): Promise<ApplicationClientLocation[]> => {
  const normalizedClientNumber = clientNumber.trim()
  const normalizedApplicationNumber = applicationNumber.trim()
  if (!normalizedClientNumber) {
    return []
  }

  const data = await apiService.getCachedData<unknown>(
    '/lexis/rpc/application-details/client-locations',
    {
      params: {
        applicantType,
        ...(normalizedApplicationNumber ? { applicationNumber: normalizedApplicationNumber } : {}),
        clientNumber: normalizedClientNumber,
      },
    },
    {
      cacheKey: [
        'application-client-locations',
        applicantType,
        normalizedClientNumber,
        normalizedApplicationNumber,
      ]
        .filter(Boolean)
        .join(':'),
      ttlMs: CLIENT_LOCATION_CACHE_TTL_MS,
    },
  )
  return parseClientLocations(data)
}

export const fetchExemptionClientLocations = async (
  clientNumber: string,
): Promise<ApplicationClientLocation[]> => {
  const normalizedClientNumber = clientNumber.trim()
  if (!normalizedClientNumber) {
    return []
  }

  const data = await apiService.getCachedData<unknown>(
    '/lexis/rpc/exemption-details/client-locations',
    {
      params: {
        clientNumber: normalizedClientNumber,
      },
    },
    {
      cacheKey: `exemption-client-locations:${normalizedClientNumber}`,
      ttlMs: CLIENT_LOCATION_CACHE_TTL_MS,
    },
  )
  return parseClientLocations(data)
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
}
