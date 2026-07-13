export type ProvincialApplicationSearchFilters = {
  applicationNumber: string
  packageNumber: string
  exemptionType: string
  exemptionNumber: string
  applicationStatus: string
  productTypeCode: string
  region: string[]
  listingFromDate: string
  listingToDate: string
  applicantClientNumber: string
  ownerClientNumber: string
}

export type ProvincialApplicationSearchSortField =
  | 'applicationNumber'
  | 'applicantClientNumber'
  | 'displayOwnerClientNumber'
  | 'regionCode'
  | 'exemptionNumber'
  | 'listingDate'

export type ProvincialApplicationSearchItem = {
  applicationNumber: string
  status: string
  applicantClientNumber: string
  ownerClientNumber: string
  region: string
  applicationVolume: number
  exemptionNumber: string
  listingDate: string
  packageNumber: string
  exemptionType: string
  productTypeCode: string
  allowCreateExemption: boolean
}

export type ProvincialApplicationSearchRequest = {
  filters: ProvincialApplicationSearchFilters
  page: number
  pageSize: number
  sortField: ProvincialApplicationSearchSortField
  sortDirection: 'asc' | 'desc'
}

export type ProvincialApplicationSearchResponse = {
  content: ProvincialApplicationSearchItem[]
  page: {
    number: number
    size: number
    totalElements: number
    totalPages: number
  }
}
