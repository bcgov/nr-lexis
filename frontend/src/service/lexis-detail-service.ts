import axios from 'axios'
import type {
  FederalApplicationDetail,
  ProvincialApplicationDetail,
  ProvincialExemptionDetail,
  ProvincialOfferDetail,
  ProvincialPermitDetail,
} from '@/interfaces/LexisDetails'
import apiService from '@/service/api-service'
import { toSearchServiceError } from '@/service/search-service-fallback'

const DETAIL_CACHE_TTL_MS = 30_000

const isNotFound = (error: unknown): boolean => {
  return (
    axios.isAxiosError(error) && (error.response?.status === 404 || error.response?.status === 204)
  )
}

export const fetchProvincialApplicationDetail = async (
  applicationNumber: string,
): Promise<ProvincialApplicationDetail | null> => {
  try {
    const response = await apiService.getCachedResponse<ProvincialApplicationDetail>(
      `/lexis/applications/${applicationNumber}`,
      undefined,
      { ttlMs: 0 },
    )
    return response.data
  } catch (error) {
    if (isNotFound(error)) {
      return null
    }
    throw toSearchServiceError('Unable to load provincial application detail.', error)
  }
}

export const releaseApplicationEditLock = async (applicationNumber: string): Promise<void> => {
  try {
    await apiService.getAxiosInstance().post('/lexis/rpc/application-details/release-lock', null, {
      params: { applicationNumber },
    })
  } catch {
    // Best-effort cleanup only; the server expires abandoned locks.
  }
}

export const fetchProvincialExemptionDetail = async (
  exemptionNumber: string,
): Promise<ProvincialExemptionDetail | null> => {
  try {
    const response = await apiService.getCachedResponse<ProvincialExemptionDetail>(
      `/lexis/exemptions/${encodeURIComponent(exemptionNumber)}`,
      undefined,
      { ttlMs: DETAIL_CACHE_TTL_MS },
    )
    return response.data
  } catch (error) {
    if (isNotFound(error)) {
      return null
    }
    throw toSearchServiceError('Unable to load provincial exemption detail.', error)
  }
}

export const fetchProvincialOfferDetail = async (
  offerNumber: string,
): Promise<ProvincialOfferDetail | null> => {
  try {
    const response = await apiService.getCachedResponse<ProvincialOfferDetail>(
      `/lexis/purchase-offers/${offerNumber}`,
      undefined,
      { ttlMs: DETAIL_CACHE_TTL_MS },
    )
    return response.data
  } catch (error) {
    if (isNotFound(error)) {
      return null
    }
    throw toSearchServiceError('Unable to load provincial offer detail.', error)
  }
}

export const fetchProvincialPermitDetail = async (
  permitNumber: string,
): Promise<ProvincialPermitDetail | null> => {
  try {
    const response = await apiService.getCachedResponse<ProvincialPermitDetail>(
      `/lexis/permits/${permitNumber}`,
      undefined,
      { ttlMs: DETAIL_CACHE_TTL_MS },
    )
    return response.data
  } catch (error) {
    if (isNotFound(error)) {
      return null
    }
    throw toSearchServiceError('Unable to load provincial permit detail.', error)
  }
}

export const fetchFederalApplicationDetail = async (
  applicationNumber: string,
): Promise<FederalApplicationDetail | null> => {
  try {
    const response = await apiService.getCachedResponse<FederalApplicationDetail>(
      `/lexis/federal/applications/${applicationNumber}`,
      undefined,
      { ttlMs: DETAIL_CACHE_TTL_MS },
    )
    return response.data
  } catch (error) {
    if (isNotFound(error)) {
      return null
    }
    throw toSearchServiceError('Unable to load federal application detail.', error)
  }
}
