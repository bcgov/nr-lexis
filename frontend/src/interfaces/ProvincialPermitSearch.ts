export type ProvincialPermitStatus =
  | 'Active'
  | 'Issued'
  | 'Expired'
  | 'Cancelled'
  | 'Completed'
  | 'Payment pending'

export type ProvincialPermitSearchFilters = {
  applicationNumber: string
  packageNumber: string
  region: string[]
  issuedFromDate: string
  issuedToDate: string
  permitStatus: string
  permitNumber: string
  ownerClientNumber: string
  agentClientNumber: string
}

export type ProvincialPermitSearchSortField =
  | 'permitNumber'
  | 'permitStatus'
  | 'ownerClientNumber'
  | 'agentClientNumber'
  | 'permitVolume'
  | 'dateIssued'
  | 'region'

type ProvincialPermitSearchItem = {
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
