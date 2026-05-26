export type FederalApplicationSearchFilters = {
  applicationNumber: string
  packageNumber: string
  applicationStatus: string
  clientNumber: string
  receivedFromDate: string
  receivedToDate: string
  listingFromDate: string
  listingToDate: string
}

export type FederalApplicationSearchItem = {
  applicationNumber: string
  federalApplicationNumber: string
  status: string
  clientNumber: string
  reason: string
  receivedDate: string
  listingDate: string
  packageNumber: string
}

export type FederalApplicationSearchRequest = {
  filters: FederalApplicationSearchFilters
  page: number
  pageSize: number
}

export type FederalApplicationSearchResponse = {
  content: FederalApplicationSearchItem[]
  page: {
    number: number
    size: number
    totalElements: number
    totalPages: number
  }
}
