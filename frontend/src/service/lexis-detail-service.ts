import axios from 'axios'
import type {
  FederalApplicationDetail,
  IndianReservePermitDetail,
  ProvincialApplicationDetail,
  ProvincialExemptionDetail,
  ProvincialOfferDetail,
  ProvincialPermitDetail,
} from '@/interfaces/LexisDetails'
import apiService from '@/service/api-service'

const isNotFound = (error: unknown): boolean => {
  return (
    axios.isAxiosError(error) && (error.response?.status === 404 || error.response?.status === 204)
  )
}

const parseNumericSuffix = (value: string, fallback: number): number => {
  const match = value.match(/(\d+)$/)
  if (!match) {
    return fallback
  }
  const parsed = Number.parseInt(match[1], 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

const buildMockProvincialApplicationDetail = (
  applicationNumber: string,
): ProvincialApplicationDetail => {
  const id = parseNumericSuffix(applicationNumber, 10001)
  return {
    applicationNumber: id,
    exemptionNumber: `E-${Math.max(id - 5000, 1)}`,
    applicationStatusCode: 'NEW',
    statusDescription: 'New',
    ownerClientNumber: '00021234',
    agentClientNumber: '00011234',
    orgUnitNumber: 11,
    orgUnitName: 'Cariboo',
    productTypeCode: 'LOG',
    exemptionReasonCode: 'ECON',
    applicationDate: '2026-01-10',
    receivedDate: '2026-01-11',
    listingDate: '2026-01-12',
    termDays: 365,
    applicationVolume: 1200,
    averageLogVolume: 5.4,
    canCreateOffers: true,
    industryUser: false,
    readOnly: false,
    exemptionApprover: false,
    locked: false,
    packages: [{ packageNumber: `PKG-${id}`, volume: 1200, pieceCount: 220 }],
    remarks: [
      { title: 'Migration', remark: 'Mock detail while backend detail data is unavailable.' },
    ],
    offers: [{ offerNumber: `OFR-${id}`, validOffer: true, withdrawalDate: null }],
  }
}

const buildMockProvincialExemptionDetail = (exemptionNumber: string): ProvincialExemptionDetail => {
  return {
    exemptionNumber,
    exemptionTypeCode: 'SECTION_1',
    exemptionTypeDescription: 'Section 1',
    exemptionStatusCode: 'NEW',
    exemptionStatusDescription: 'New',
    ownerClientNumber: '00021234',
    agentClientNumber: '00011234',
    applicationNumber: 10001,
    applicationStatus: 'Submitted',
    approvalDate: '2026-01-20',
    expiryDate: '2026-12-31',
    approvedVolume: 1200,
    usedVolume: 200,
    remainingVolume: 1000,
    otherConditions: 'Mock exemption conditions.',
    blanketOic: false,
    permitNumbers: ['900001'],
    remarks: [
      { title: 'Migration', remark: 'Mock detail while backend detail data is unavailable.' },
    ],
  }
}

const buildMockProvincialOfferDetail = (offerNumber: string): ProvincialOfferDetail => {
  const id = parseNumericSuffix(offerNumber, 70001)
  return {
    offerNumber: id,
    applicationNumber: 10001,
    packageNumber: 'PKG-10001',
    companyName: 'BC Timber Co.',
    contactName: 'A. Analyst',
    purchaseOfferAmount: 95000,
    purchaseOfferDate: '2026-01-25',
    offerWithdrawalDate: null,
    teacReviewDate: null,
    approvalIndicator: 'Y',
    validOfferIndicator: 'Y',
    fairOfferIndicator: 'Y',
    offerRemark: 'Mock offer detail.',
    withdrawReason: null,
    exportJurisdictionCode: 'US',
    manufacturingFacilityInfo: 'Mock mill',
    offeringClientNumber: '00031234',
    pickupLocation: 'Prince George',
    offerCondition: 'Standard',
    advertisingDate: '2026-01-12',
    offerEndDate: '2026-02-12',
    offerVolume: 980,
    region: '11',
  }
}

const buildMockProvincialPermitDetail = (permitNumber: string): ProvincialPermitDetail => {
  const id = parseNumericSuffix(permitNumber, 900001)
  return {
    permitNumber: id,
    applicationNumber: 10001,
    packageNumber: 'PKG-10001',
    exemptionNumber: 'E-50001',
    permitStatusCode: 'ISSUED',
    permitStatusDescription: 'Issued',
    applicantClientNumber: '00011234',
    ownerClientNumber: '00021234',
    destinationCompanyName: 'Mock Destination Co.',
    destinationCountryCode: 'US',
    transportTypeCode: 'TRUCK',
    transportName: 'Truck',
    portOfExportCode: 'VAN',
    otherPortOfExport: null,
    issueDate: '2026-02-01',
    expiryDate: '2026-08-01',
    receivedDate: '2026-01-28',
    estimatedShippingDate: '2026-02-10',
    permitVolume: 980,
    numberOfPieces: 200,
    receiptNumber: 'RCP-10001',
    federalPermitNumber: 'FED-90001',
    invoiceNumber: 'INV-10001',
    remarks: 'Mock permit detail.',
    region: '11',
  }
}

const buildMockFederalApplicationDetail = (applicationNumber: string): FederalApplicationDetail => {
  const id = parseNumericSuffix(applicationNumber, 10001)
  return {
    applicationNumber: id,
    federalApplicationNumber: `FED-${id}`,
    statusCode: 'SUBMITTED',
    statusDescription: 'Submitted',
    ownerClientNumber: '00021234',
    ownerClientLocationCode: '01',
    agentClientNumber: '00011234',
    agentClientLocationCode: '01',
    exemptionNumber: 'E-50001',
    exemptionType: 'Section 1',
    exemptionReason: 'Economic',
    receivedDate: '2026-01-11',
    listingDate: '2026-01-12',
    readOnly: false,
    packages: [`PKG-${id}`],
    remarks: ['Mock detail while backend detail data is unavailable.'],
    offers: [`OFR-${id}`],
    federalPermit: {
      permitNumber: 90001,
      permitIssueDate: '2026-02-01',
      destinationCountry: 'United States',
      transportType: 'TRUCK',
      transportName: 'Truck',
      shippingDate: '2026-02-10',
      portOfExport: 'Vancouver',
      otherPortOfExport: null,
    },
  }
}

const buildMockIndianReservePermitDetail = (permitNumber: string): IndianReservePermitDetail => {
  return {
    permitNumber,
    clientNumber: '00011234',
    clientLocation: '01',
    region: 11,
    applicationDate: '2026-01-10',
    permitIssueDate: '2026-01-20',
    estimatedShippingDate: '2026-01-30',
    destinationCountry: 'United States',
    transportTypeCode: 'TRUCK',
    transportName: 'Truck',
    portOfExport: 'Vancouver',
    otherPortOfExport: null,
    packages: ['PKG-IR-1001'],
  }
}

export const fetchProvincialApplicationDetail = async (
  applicationNumber: string,
): Promise<ProvincialApplicationDetail | null> => {
  try {
    const response = await apiService
      .getAxiosInstance()
      .get<ProvincialApplicationDetail>(`/lexis/applications/${applicationNumber}`)
    return response.data
  } catch (error) {
    if (isNotFound(error)) {
      return null
    }
    console.warn('Using mock provincial application detail data.', error)
    return buildMockProvincialApplicationDetail(applicationNumber)
  }
}

export const fetchProvincialExemptionDetail = async (
  exemptionNumber: string,
): Promise<ProvincialExemptionDetail | null> => {
  try {
    const response = await apiService
      .getAxiosInstance()
      .get<ProvincialExemptionDetail>(`/lexis/exemptions/${encodeURIComponent(exemptionNumber)}`)
    return response.data
  } catch (error) {
    if (isNotFound(error)) {
      return null
    }
    console.warn('Using mock provincial exemption detail data.', error)
    return buildMockProvincialExemptionDetail(exemptionNumber)
  }
}

export const fetchProvincialOfferDetail = async (
  offerNumber: string,
): Promise<ProvincialOfferDetail | null> => {
  try {
    const response = await apiService
      .getAxiosInstance()
      .get<ProvincialOfferDetail>(`/lexis/purchase-offers/${offerNumber}`)
    return response.data
  } catch (error) {
    if (isNotFound(error)) {
      return null
    }
    console.warn('Using mock provincial offer detail data.', error)
    return buildMockProvincialOfferDetail(offerNumber)
  }
}

export const fetchProvincialPermitDetail = async (
  permitNumber: string,
): Promise<ProvincialPermitDetail | null> => {
  try {
    const response = await apiService
      .getAxiosInstance()
      .get<ProvincialPermitDetail>(`/lexis/permits/${permitNumber}`)
    return response.data
  } catch (error) {
    if (isNotFound(error)) {
      return null
    }
    console.warn('Using mock provincial permit detail data.', error)
    return buildMockProvincialPermitDetail(permitNumber)
  }
}

export const fetchFederalApplicationDetail = async (
  applicationNumber: string,
): Promise<FederalApplicationDetail | null> => {
  try {
    const response = await apiService
      .getAxiosInstance()
      .get<FederalApplicationDetail>(`/lexis/federal/applications/${applicationNumber}`)
    return response.data
  } catch (error) {
    if (isNotFound(error)) {
      return null
    }
    console.warn('Using mock federal application detail data.', error)
    return buildMockFederalApplicationDetail(applicationNumber)
  }
}

export const fetchIndianReservePermitDetail = async (
  permitNumber: string,
): Promise<IndianReservePermitDetail | null> => {
  try {
    const response = await apiService
      .getAxiosInstance()
      .get<IndianReservePermitDetail>(
        `/lexis/indian-reserve/permits/${encodeURIComponent(permitNumber)}`,
      )
    return response.data
  } catch (error) {
    if (isNotFound(error)) {
      return null
    }
    console.warn('Using mock indian reserve permit detail data.', error)
    return buildMockIndianReservePermitDetail(permitNumber)
  }
}
