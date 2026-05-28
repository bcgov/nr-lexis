import axios from 'axios'
import type {
  FederalApplicationDetail,
  IndianReservePermitDetail,
  ProvincialApplicationDetail,
  ProvincialExemptionDetail,
  ProvincialOfferDetail,
  ProvincialPermitDetail,
} from '@/interfaces/LexisDetails'
import apiService from '@/service/api-service'
import { toSearchServiceError } from '@/service/search-service-fallback'

const isNotFound = (error: unknown): boolean => {
  return (
    axios.isAxiosError(error) && (error.response?.status === 404 || error.response?.status === 204)
  )
}

export const fetchProvincialApplicationDetail = async (
  applicationNumber: string,
): Promise<ProvincialApplicationDetail | null> => {
  try {
    const response = await apiService
      .getAxiosInstance()
      .get<ProvincialApplicationDetail>(`/lexis/applications/${applicationNumber}`)
    return response.data
  } catch (error) {
    if (isNotFound(error)) {
      return null
    }
    throw toSearchServiceError('Unable to load provincial application detail.', error)
  }
}

export const fetchProvincialExemptionDetail = async (
  exemptionNumber: string,
): Promise<ProvincialExemptionDetail | null> => {
  try {
    const response = await apiService
      .getAxiosInstance()
      .get<ProvincialExemptionDetail>(`/lexis/exemptions/${encodeURIComponent(exemptionNumber)}`)
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
    const response = await apiService
      .getAxiosInstance()
      .get<ProvincialOfferDetail>(`/lexis/purchase-offers/${offerNumber}`)
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
    const response = await apiService
      .getAxiosInstance()
      .get<ProvincialPermitDetail>(`/lexis/permits/${permitNumber}`)
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
    const response = await apiService
      .getAxiosInstance()
      .get<FederalApplicationDetail>(`/lexis/federal/applications/${applicationNumber}`)
    return response.data
  } catch (error) {
    if (isNotFound(error)) {
      return null
    }
    throw toSearchServiceError('Unable to load federal application detail.', error)
  }
}

export const fetchIndianReservePermitDetail = async (
  permitNumber: string,
): Promise<IndianReservePermitDetail | null> => {
  try {
    const response = await apiService
      .getAxiosInstance()
      .get<IndianReservePermitDetail>(
        `/lexis/indian-reserve/permits/${encodeURIComponent(permitNumber)}`,
      )
    return response.data
  } catch (error) {
    if (isNotFound(error)) {
      return null
    }
    throw toSearchServiceError('Unable to load indigenous reserve permit detail.', error)
  }
}
