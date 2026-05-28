export type ProvincialPermitStatus = 'Active' | 'Issued' | 'Expired' | 'Cancelled'

export type ProvincialPermitSearchFilters = {
  applicationNumber: string
  packageNumber: string
  region: string[]
  issuedFromDate: string
  issuedToDate: string
  permitStatus: string
  permitNumber: string
  ownerClientNumber: string
  applicantClientNumber: string
}

export type ProvincialPermitSearchSortField =
  | 'permitNumber'
  | 'status'
  | 'applicantClientNumber'
  | 'ownerClientNumber'
  | 'totalVolume'
  | 'issueDate'
  | 'region'

export type ProvincialPermitSearchItem = {
  applicationNumber: string
  packageNumber: string
  permitNumber: string
  status: ProvincialPermitStatus
  applicantClientNumber: string
  ownerClientNumber: string
  totalVolume: number
  issueDate: string
  region: string
}

export type ProvincialPermitSearchRequest = {
  filters: ProvincialPermitSearchFilters
  page: number
  pageSize: number
  sortField: ProvincialPermitSearchSortField
  sortDirection: 'asc' | 'desc'
}

export type ProvincialPermitSearchResponse = {
  content: ProvincialPermitSearchItem[]
  page: {
    number: number
    size: number
    totalElements: number
    totalPages: number
  }
}
