export type ApplicationReviewSearchFilters = {
  applicationNumber: string
  productTypeCode: string
  region: string[]
  receivedFromDate: string
  receivedToDate: string
  listingFromDate: string
  listingToDate: string
}

export type ApplicationReviewSearchSortField = 'applicationNumber' | 'listingDate' | 'regionCode'

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

export type ApplicationReviewPreviewResponse = {
  content: ApplicationReviewSearchItem[]
  page: {
    number: number
    size: number
    hasNext: boolean
  }
}
