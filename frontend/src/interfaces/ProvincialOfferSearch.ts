export type ProvincialOfferSearchFilters = {
  applicationNumber: string
  packageNumber: string
  clientNumber: string
  listingFromDate: string
  listingToDate: string
  region: string[]
  withdrawalFromDate: string
  withdrawalToDate: string
}

export type ProvincialOfferSearchSortField =
  | 'offerNumber'
  | 'applicationNumber'
  | 'packageNumber'
  | 'listingDate'
  | 'region'
  | 'offerWithdrawalDate'

export type ProvincialOfferSearchItem = {
  offerNumber: string
  applicationNumber: string
  packageNumber: string
  listingDate: string
  region: string
  offerWithdrawalDate: string
  clientNumber: string
}

export type ProvincialOfferSearchRequest = {
  filters: ProvincialOfferSearchFilters
  page: number
  pageSize: number
  sortField: ProvincialOfferSearchSortField
  sortDirection: 'asc' | 'desc'
}

export type ProvincialOfferSearchResponse = {
  content: ProvincialOfferSearchItem[]
  page: {
    number: number
    size: number
    totalElements: number
    totalPages: number
  }
}
