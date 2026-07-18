import apiService from '@/service/api-service'
import {
  payloadValueAsStringArray as asStringArray,
  payloadValueAsTrimmedString as asString,
} from '@/service/payload-utils'
import { recordOrEmpty } from '@/utils/record'

const OFFER_CREATE_CACHE_TTL_MS = 30_000

export type OfferApplicationDetails = {
  success: boolean
  speciesGradeCode: string
  advertisingDate: string
  teacReviewDate: string
  region: string
}

export type OfferApplicationValidation = {
  isValid: boolean
  errors: string[]
}

export type OfferClientData = {
  clientNumber: string
  companyName: string
}

export const fetchOfferClientData = async (
  clientNumber: string,
): Promise<OfferClientData | null> => {
  const normalizedClientNumber = clientNumber.trim()
  if (!normalizedClientNumber) {
    return null
  }

  const data = await apiService.getCachedData<unknown>(
    '/lexis/rpc/offer-details/client-data',
    {
      params: {
        clientNumber: normalizedClientNumber,
        clientLocationCode: '00',
      },
    },
    {
      cacheKey: `offer-client-data:${normalizedClientNumber}:00`,
      ttlMs: OFFER_CREATE_CACHE_TTL_MS,
    },
  )
  const source = recordOrEmpty(data)
  const resolvedClientNumber = asString(source.clientNumber)
  const companyName = asString(source.companyName)
  const notFound = asString(source.notfound).toLowerCase() === 'true'
  if (notFound || !resolvedClientNumber || !companyName) {
    return null
  }

  return {
    clientNumber: resolvedClientNumber,
    companyName,
  }
}

export const fetchOfferApplicationDetails = async (
  applicationNumber: string,
): Promise<OfferApplicationDetails> => {
  const data = await apiService.getCachedData<unknown>(
    '/lexis/rpc/offer-details/application-details',
    {
      params: { applicationNumber },
    },
    {
      cacheKey: `offer-application-details:${applicationNumber}`,
      ttlMs: OFFER_CREATE_CACHE_TTL_MS,
    },
  )
  const source = recordOrEmpty(data)
  return {
    success: source.success === true,
    speciesGradeCode: asString(source.speciesGradeCode),
    advertisingDate: asString(source.advertisingDate),
    teacReviewDate: asString(source.teacReviewDate),
    region: asString(source.region),
  }
}

export const validateOfferApplication = async (
  applicationNumber: string,
): Promise<OfferApplicationValidation> => {
  const data = await apiService.getCachedData<unknown>(
    '/lexis/rpc/offer-details/validate-application-number',
    {
      params: { applicationNumber },
    },
    {
      cacheKey: `offer-application-validation:${applicationNumber}`,
      ttlMs: OFFER_CREATE_CACHE_TTL_MS,
    },
  )
  const source = recordOrEmpty(data)
  return {
    isValid: source.isValid === true,
    errors: asStringArray(source.errors),
  }
}

export const fetchOfferPackageList = async (applicationNumber: string): Promise<string[]> => {
  const data = await apiService.getCachedData<unknown>(
    '/lexis/rpc/offer-details/package-list',
    {
      params: { applicationNumber },
    },
    {
      cacheKey: `offer-package-list:${applicationNumber}`,
      ttlMs: OFFER_CREATE_CACHE_TTL_MS,
    },
  )
  const source = recordOrEmpty(data)
  return asStringArray(source.packageList).filter(
    (packageNumber) => packageNumber.toLowerCase() !== 'no packages',
  )
}

export const fetchOfferPackageVolume = async (packageNumber: string): Promise<string> => {
  const data = await apiService.getCachedData<unknown>(
    '/lexis/rpc/offer-details/package-volume',
    {
      params: { packageNumber },
    },
    {
      cacheKey: `offer-package-volume:${packageNumber}`,
      ttlMs: OFFER_CREATE_CACHE_TTL_MS,
    },
  )
  const source = recordOrEmpty(data)
  return asString(source.volume)
}

export const fetchOfferApplicationVolume = async (applicationNumber: string): Promise<string> => {
  const data = await apiService.getCachedData<unknown>(
    '/lexis/rpc/offer-details/application-volume',
    {
      params: { applicationNumber },
    },
    {
      cacheKey: `offer-application-volume:${applicationNumber}`,
      ttlMs: OFFER_CREATE_CACHE_TTL_MS,
    },
  )
  const source = recordOrEmpty(data)
  return asString(source.volume)
}
