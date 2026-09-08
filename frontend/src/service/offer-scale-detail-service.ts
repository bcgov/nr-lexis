import apiService from '@/service/api-service'

export type OfferScaleDetail = {
  timberMark: string
  pieces: number
  species: string
  grade: string
  volume: string
  cascadeSplitCode: string
}

export type OfferScaleTarget =
  | { offerNumber: string; packageNumber?: never }
  | { packageNumber: string; offerNumber?: never }

export const fetchOfferScaleDetails = async (
  target: OfferScaleTarget,
  signal: AbortSignal,
): Promise<OfferScaleDetail[]> => {
  const response = await apiService
    .getAxiosInstance()
    .get<OfferScaleDetail[]>('/lexis/rpc/offer-details/package-scales', { params: target, signal })
  return response.data
}
