export type ProvincialApplicationDetail = {
  applicationNumber: number
  exemptionNumber: string | null
  applicationStatusCode: string | null
  statusDescription: string | null
  ownerClientNumber: string | null
  agentClientNumber: string | null
  orgUnitNumber: number | null
  orgUnitName: string | null
  productTypeCode: string | null
  exemptionReasonCode: string | null
  applicationDate: string | null
  receivedDate: string | null
  listingDate: string | null
  termDays: number | null
  applicationVolume: number | null
  averageLogVolume: number | null
  canCreateOffers: boolean
  industryUser: boolean
  readOnly: boolean
  exemptionApprover: boolean
  locked: boolean
  lockedBy?: string | null
  lockMessage?: string | null
  packages: {
    packageNumber: string
    volume: number
    pieceCount: number
  }[]
  remarks: {
    remarkId: number | null
    title: string
    remark: string
    user?: string | null
    date?: string | null
  }[]
  offers: {
    offerNumber: string
    companyName: string | null
    receivedDate: string | null
    validOffer: boolean
    withdrawalDate: string | null
  }[]
}

export type ProvincialExemptionDetail = {
  exemptionNumber: string
  exemptionTypeCode: string | null
  exemptionTypeDescription: string | null
  exemptionStatusCode: string | null
  exemptionStatusDescription: string | null
  ownerClientNumber: string | null
  agentClientNumber: string | null
  applicationNumber: number | null
  applicationStatus: string | null
  approvalDate: string | null
  expiryDate: string | null
  approvedVolume: number | null
  usedVolume: number | null
  remainingVolume: number | null
  otherConditions: string | null
  blanketOic: boolean
  permitNumbers: string[]
  remarks: {
    title: string
    remark: string
  }[]
}

export type ProvincialOfferDetail = {
  offerNumber: number | null
  applicationNumber: number | null
  packageNumber: string | null
  companyName: string | null
  contactName: string | null
  purchaseOfferAmount: number | null
  purchaseOfferDate: string | null
  offerWithdrawalDate: string | null
  teacReviewDate: string | null
  approvalIndicator: string | null
  validOfferIndicator: string | null
  fairOfferIndicator: string | null
  offerRemark: string | null
  withdrawReason: string | null
  exportJurisdictionCode: string | null
  manufacturingFacilityInfo: string | null
  offeringClientNumber: string | null
  pickupLocation: string | null
  offerCondition: string | null
  advertisingDate: string | null
  offerEndDate: string | null
  packageVolume: number | null
  speciesGradeCode: string | null
  offerVolume: number | null
  region: string | null
}

export type ProvincialPermitDetail = {
  permitNumber: number | null
  applicationNumber: number | null
  packageNumber: string | null
  exemptionNumber: string | null
  permitStatusCode: string | null
  permitStatusDescription: string | null
  applicantClientNumber: string | null
  agentClientLocationCode: string | null
  ownerClientNumber: string | null
  ownerClientLocationCode: string | null
  destinationCompanyName: string | null
  destinationCountryCode: string | null
  transportTypeCode: string | null
  transportName: string | null
  portOfExportCode: string | null
  otherPortOfExport: string | null
  issueDate: string | null
  expiryDate: string | null
  receivedDate: string | null
  estimatedShippingDate: string | null
  permitVolume: number | null
  approvedExemptionVolume: number | null
  exemptionVolumeRemaining: number | null
  numberOfPieces: number | null
  receiptNumber: string | null
  federalPermitNumber: string | null
  invoiceNumber: string | null
  remarks: string | null
  region: string | null
}

export type FederalPermitDetail = {
  permitNumber: number | null
  permitIssueDate: string | null
  destinationCountry: string | null
  transportType: string | null
  transportName: string | null
  shippingDate: string | null
  portOfExport: string | null
  otherPortOfExport: string | null
}

export type FederalApplicationDetail = {
  applicationNumber: number | null
  federalApplicationNumber: string | null
  statusCode: string | null
  statusDescription: string | null
  ownerClientNumber: string | null
  ownerClientLocationCode: string | null
  ownerApplicantType?: string | null
  ownerContactName?: string | null
  ownerCompanyName?: string | null
  agentClientNumber: string | null
  agentClientLocationCode: string | null
  agentApplicantType?: string | null
  agentContactName?: string | null
  agentCompanyName?: string | null
  exemptionNumber: string | null
  exemptionType: string | null
  exemptionReason: string | null
  region?: string | null
  productType?: string | null
  applicationDate?: string | null
  receivedDate: string | null
  listingDate: string | null
  termDays?: number | null
  logLocation?: string | null
  ageClass?: string | null
  averageLogVolume?: number | null
  applicationVolume?: number | null
  endUse?: string | null
  author?: string | null
  readOnly: boolean
  packages: string[]
  remarks: string[]
  offers: string[]
  federalPermit: FederalPermitDetail | null
}
