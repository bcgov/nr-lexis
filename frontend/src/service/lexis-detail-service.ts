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
const OFFER_LOCK_UNAVAILABLE_MESSAGE =
  'Offer edit lock state could not be verified. Editing is unavailable until the offer is reloaded.'
const OFFER_LOCKED_MESSAGE = 'This offer is currently locked for editing by another user.'
const FEDERAL_APPLICATION_LOCK_UNAVAILABLE_MESSAGE =
  'Application edit lock state could not be verified. Editing is unavailable until the application is reloaded.'
const FEDERAL_APPLICATION_LOCKED_MESSAGE =
  'This application is currently locked for editing by another user. The ability to make changes has been disabled.'

const valueAsNumberOrNull = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[$,\s]/g, ''))
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

const isNotFound = (error: unknown): boolean => {
  return (
    axios.isAxiosError(error) && (error.response?.status === 404 || error.response?.status === 204)
  )
}

export const fetchProvincialApplicationDetail = async (
  applicationNumber: string,
): Promise<ProvincialApplicationDetail | null> => {
  try {
    const path = `/lexis/applications/${applicationNumber}`
    const response = await apiService.getCachedResponse<ProvincialApplicationDetail>(
      path,
      undefined,
      { ttlMs: 0 },
    )
    apiService.registerRecordVersion('application', applicationNumber, response, path)
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
    // Compatibility cleanup only; record versions enforce save conflicts.
  }
}

export const fetchProvincialExemptionDetail = async (
  exemptionNumber: string,
): Promise<ProvincialExemptionDetail | null> => {
  try {
    const path = `/lexis/exemptions/${encodeURIComponent(exemptionNumber)}`
    const response = await apiService.getCachedResponse<ProvincialExemptionDetail>(
      path,
      undefined,
      { ttlMs: 0 },
    )
    apiService.registerRecordVersion('exemption', exemptionNumber, response, path)
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
    const path = `/lexis/purchase-offers/${offerNumber}`
    const response = await apiService.getCachedResponse<ProvincialOfferDetail>(path, undefined, {
      ttlMs: 0,
    })
    apiService.registerRecordVersion('offer', offerNumber, response, path)
    const detail = response.data
    if (!detail) {
      return null
    }
    const lockStateAvailable = typeof detail?.locked === 'boolean'
    const locked = lockStateAvailable ? detail.locked : true
    return {
      ...detail,
      canEditScheduleDates: lockStateAvailable ? detail.canEditScheduleDates : false,
      canEditOfferRemarks: lockStateAvailable ? detail.canEditOfferRemarks : false,
      canEditOfferDetails: lockStateAvailable ? detail.canEditOfferDetails : false,
      canEditWithdrawFields: lockStateAvailable ? detail.canEditWithdrawFields : false,
      locked,
      lockedBy: typeof detail?.lockedBy === 'string' ? detail.lockedBy : null,
      lockMessage:
        typeof detail?.lockMessage === 'string' && detail.lockMessage.trim()
          ? detail.lockMessage
          : lockStateAvailable
            ? locked
              ? OFFER_LOCKED_MESSAGE
              : null
            : OFFER_LOCK_UNAVAILABLE_MESSAGE,
    }
  } catch (error) {
    if (isNotFound(error)) {
      return null
    }
    throw toSearchServiceError('Unable to load provincial offer detail.', error)
  }
}

export const releaseOfferEditLock = async (offerNumber: string): Promise<void> => {
  try {
    await apiService.getAxiosInstance().post('/lexis/rpc/offer-details/release-lock', null, {
      params: { offerNumber },
    })
  } catch {
    // Compatibility cleanup only; record versions enforce save conflicts.
  }
}

type ProvincialPermitExemptionContext = Pick<
  ProvincialPermitDetail,
  'approvedExemptionVolume' | 'exemptionVolumeRemaining' | 'exemptionTypeDescription' | 'blanketOic'
>

export const fetchProvincialPermitExemptionContext = async (
  exemptionNumber: string,
): Promise<ProvincialPermitExemptionContext> => {
  const path = `/lexis/exemptions/${encodeURIComponent(exemptionNumber)}`
  const response = await apiService.getCachedResponse<ProvincialExemptionDetail>(path, undefined, {
    ttlMs: DETAIL_CACHE_TTL_MS,
  })
  if (response.status === 204) {
    throw new Error(`Permit exemption context service unavailable at ${path}`)
  }
  if (!response.data || typeof response.data.blanketOic !== 'boolean') {
    throw new Error(`Invalid permit exemption context response from ${path}`)
  }

  const approvedExemptionVolume = valueAsNumberOrNull(response.data.approvedVolume)
  if (approvedExemptionVolume === null) {
    throw new Error(`Invalid approved exemption volume response from ${path}`)
  }

  const exemptionVolumeRemaining = valueAsNumberOrNull(response.data.remainingVolume)
  if (exemptionVolumeRemaining === null) {
    throw new Error(`Invalid exemption volume remaining response from ${path}`)
  }

  return {
    approvedExemptionVolume,
    exemptionVolumeRemaining,
    exemptionTypeDescription: response.data.exemptionTypeDescription ?? null,
    blanketOic: response.data.blanketOic,
  }
}

export const fetchProvincialPermitDetail = async (
  permitNumber: string,
): Promise<ProvincialPermitDetail | null> => {
  try {
    const path = `/lexis/permits/${permitNumber}`
    const response = await apiService.getCachedResponse<ProvincialPermitDetail>(path, undefined, {
      ttlMs: DETAIL_CACHE_TTL_MS,
    })
    apiService.registerRecordVersion('permit', permitNumber, response, path)
    const permitDetail = response.data
    return {
      ...permitDetail,
      approvedExemptionVolume: permitDetail.approvedExemptionVolume ?? null,
      exemptionVolumeRemaining: permitDetail.exemptionVolumeRemaining ?? null,
      exemptionTypeDescription: permitDetail.exemptionTypeDescription ?? null,
      blanketOic: permitDetail.blanketOic ?? false,
    }
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
    const path = `/lexis/federal/applications/${applicationNumber}`
    const response = await apiService.getCachedResponse<FederalApplicationDetail>(path, undefined, {
      ttlMs: 0,
    })
    apiService.registerRecordVersion('federal-application', applicationNumber, response, path)
    const detail = response.data
    if (!detail) {
      return null
    }
    const lockStateAvailable =
      typeof detail.locked === 'boolean' && typeof detail.lockHeldByCurrentUser === 'boolean'
    const locked = lockStateAvailable ? detail.locked : true
    return {
      ...detail,
      locked,
      lockHeldByCurrentUser: lockStateAvailable ? detail.lockHeldByCurrentUser : false,
      lockedBy: locked && typeof detail.lockedBy === 'string' ? detail.lockedBy : null,
      lockMessage: lockStateAvailable
        ? locked
          ? typeof detail.lockMessage === 'string' && detail.lockMessage.trim()
            ? detail.lockMessage
            : FEDERAL_APPLICATION_LOCKED_MESSAGE
          : null
        : FEDERAL_APPLICATION_LOCK_UNAVAILABLE_MESSAGE,
    }
  } catch (error) {
    if (isNotFound(error)) {
      return null
    }
    throw toSearchServiceError('Unable to load federal application detail.', error)
  }
}
