export type ProvincialExemptionSearchFilters = {
  applicationNumber: string
  packageNumber: string
  exemptionNumber: string
  region: string[]
  approvalFromDate: string
  approvalToDate: string
  listFromDate: string
  listToDate: string
  exemptionTypeCode: string
  exemptionStatusCode: string
  applicantClientNumber: string
  ownerClientNumber: string
}

export type ProvincialExemptionSearchSortField =
  | 'exemptionNumber'
  | 'type'
  | 'status'
  | 'applicantClientNumber'
  | 'ownerClientNumber'
  | 'approvedVolume'
  | 'balanceRemaining'
  | 'listingDate'
  | 'expiryDate'
  | 'region'

export type ProvincialExemptionSearchItem = {
  exemptionNumber: string
  type: string
  typeCode: string
  status: string
  statusCode: string
  applicantClientNumber: string
  ownerClientNumber: string
  approvedVolume: number
  balanceRemaining: number
  listingDate: string
  expiryDate: string
  region: string
  canApprove: boolean
  canViewExemption: boolean
  isLocked: boolean
}

export type ProvincialExemptionSearchRequest = {
  filters: ProvincialExemptionSearchFilters
  page: number
  pageSize: number
  sortField: ProvincialExemptionSearchSortField
  sortDirection: 'asc' | 'desc'
}

export type ProvincialExemptionSearchResponse = {
  content: ProvincialExemptionSearchItem[]
  page: {
    number: number
    size: number
    totalElements: number
    totalPages: number
  }
}
