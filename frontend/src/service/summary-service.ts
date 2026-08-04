import apiService from '@/service/api-service'

export type SummaryPage<T> = {
  results: T[]
  total: number
  page: number
  size: number
}

export type SummaryApplication = {
  application: number
  status: string
  reason: string | null
  exemptionType: string | null
  exemptionNumber: string | null
  receivedDate: string | null
  listingDate: string | null
  packageNumberAry: string[]
}

export type SummaryOffer = {
  offerNumber: number
  application: number
  packageNumber: string | null
  listingDate: string | null
}

export type SummaryExemption = {
  exemption: string
  exemptionType: string | null
  ownerClientNumber: string | null
  agentClientNumber: string | null
  status: string
  approvedVolume: number
  balanceRemaining: number
  approvalDate: string | null
  expiryDate: string | null
}

export type SummaryPermit = {
  permit: number
  status: string
  ownerClientNumber: string | null
  agentClientNumber: string | null
  exemption: string | null
  totalPieces: number
  totalVolume: number
  receipt: string | null
  issueDate: string | null
}

export type SummaryFee = {
  permit: number
  status: string
  volume: number
  fees: number | null
  receipt: string | null
}

const fetchSummaryPage = <T>(section: string, page = 0, size = 10): Promise<SummaryPage<T>> =>
  apiService.getCachedData<SummaryPage<T>>(
    `/lexis/summary/${section}`,
    { params: { page, size } },
    { cacheKey: `summary:${section}:${page}:${size}` },
  )

export const fetchSummaryApplications = (page = 0, size = 10) =>
  fetchSummaryPage<SummaryApplication>('applications', page, size)

export const fetchSummaryOffers = (page = 0, size = 10) =>
  fetchSummaryPage<SummaryOffer>('offers', page, size)

export const fetchSummaryExemptions = (page = 0, size = 10) =>
  fetchSummaryPage<SummaryExemption>('exemptions', page, size)

export const fetchSummaryPermits = (page = 0, size = 10) =>
  fetchSummaryPage<SummaryPermit>('permits', page, size)

export const fetchSummaryFees = (page = 0, size = 10) =>
  fetchSummaryPage<SummaryFee>('fees', page, size)

export const fetchSummaryOffersPlaced = (page = 0, size = 10) =>
  fetchSummaryPage<SummaryOffer>('offers-placed', page, size)
