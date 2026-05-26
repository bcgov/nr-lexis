export type IndianReservePermitSearchFilters = {
  permitNumber: string
  packageNumber: string
  fromPermitIssueDate: string
  toPermitIssueDate: string
  fromEstimatedShippingDate: string
  toEstimatedShippingDate: string
}

export type IndianReservePermitSearchItem = {
  permitNumber: string
  clientNumber: string
  issueDate: string
  shippingDate: string
  packageNumber: string
}

export type IndianReservePermitSearchRequest = {
  filters: IndianReservePermitSearchFilters
  page: number
  pageSize: number
}

export type IndianReservePermitSearchResponse = {
  content: IndianReservePermitSearchItem[]
  page: {
    number: number
    size: number
    totalElements: number
    totalPages: number
  }
}
