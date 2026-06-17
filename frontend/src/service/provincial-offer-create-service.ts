import apiService from '@/service/api-service'
import {
  payloadValueAsStringArray as asStringArray,
  payloadValueAsTrimmedString as asString,
} from '@/service/payload-utils'

const OFFER_CREATE_CACHE_TTL_MS = 30_000

export type OfferApplicationDetails = {
  success: boolean
  speciesGradeCode: string
  advertisingDate: string
  teacReviewDate: string
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
  const source = (data ?? {}) as Record<string, unknown>
  return {
    success: source.success === true,
    speciesGradeCode: asString(source.speciesGradeCode),
    advertisingDate: asString(source.advertisingDate),
    teacReviewDate: asString(source.teacReviewDate),
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
  const source = (data ?? {}) as Record<string, unknown>
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
  const source = (data ?? {}) as Record<string, unknown>
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
  const source = (data ?? {}) as Record<string, unknown>
  return asString(source.volume)
}
