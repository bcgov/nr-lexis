export type ApplicationReviewSearchFilters = {
  applicationNumber: string
  productTypeCode: string
  region: string[]
  receivedFromDate: string
  receivedToDate: string
  listingFromDate: string
  listingToDate: string
}

export type ApplicationReviewSearchSortField =
  | 'applicationNumber'
  | 'volume'
  | 'speciesEndUse'
  | 'listingDate'
  | 'status'
  | 'region'

export type ApplicationReviewSearchItem = {
  applicationNumber: string
  volume: number
  speciesEndUse: string
  listingDate: string
  status: string
  region: string
  showInfoIcon: boolean
}

export type ApplicationReviewSearchRequest = {
  filters: ApplicationReviewSearchFilters
  page: number
  pageSize: number
  sortField: ApplicationReviewSearchSortField
  sortDirection: 'asc' | 'desc'
}

export type ApplicationReviewSearchResponse = {
  content: ApplicationReviewSearchItem[]
  page: {
    number: number
    size: number
    totalElements: number
    totalPages: number
  }
}
