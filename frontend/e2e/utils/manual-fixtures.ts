// Fictional data for the user manual screenshots. Every name, number and address is invented.
import type { LexisSessionCapabilities } from '../../src/interfaces/LexisSession'
import type { LexisNotificationView } from '../../src/interfaces/LexisNotification'
import type {
  ProvincialApplicationDetail,
  ProvincialExemptionDetail,
  ProvincialOfferDetail,
  ProvincialPermitDetail,
} from '../../src/interfaces/LexisDetails'
import type { AdminUploadResult } from '../../src/service/admin-upload-service'
import type {
  SummaryApplication,
  SummaryExemption,
  SummaryFee,
  SummaryOffer,
  SummaryPage,
  SummaryPermit,
} from '../../src/service/summary-service'

export type ManualScenario = 'industryChooseOrganization' | 'industrySubmitter'

export type ManualApiResponse = { status: number; body: unknown }

type ManualRequest = {
  scenario: ManualScenario
  method: string
  path: string
  query: URLSearchParams
  postData?: string | null
}

type ManualRoute = {
  method: string
  path: RegExp
  respond: (request: ManualRequest, match: RegExpMatchArray) => unknown
}

// Mirrors backend LexisLegacyActionCatalog and the role-actions in application.yml.
const PROVINCIAL_SUBMITTER_ACTIONS = [
  'viewNotifications',
  'searchClients',
  '/summary',
  '/applicationSearch',
  '/applicationDetails',
  '/exemptionSearch',
  '/exemptionDetails',
  '/offersSearch',
  '/offerDetails',
  '/permitSearch',
  '/permitDetails',
  '/permitReport',
  '/fileApplicationUpload',
  '/fileExemptionUpload',
  '/filePermitUpload',
  '/fileInvoiceUpload',
  'createApplication',
  'createOffer',
  'createPermit',
  'savePermit',
  'uploadApplicationSubmission',
]

export const OWN_CLIENT = '00012345'
const SECOND_CLIENT = '00067890'
const THIRD_CLIENT = '00054321'

const capabilitiesFor = (scenario: ManualScenario): LexisSessionCapabilities => {
  const base = {
    authenticated: true,
    welcomeTarget: null,
    legacyPath: null,
    actionRegions: {},
  }
  return {
    ...base,
    principal: 'BCEID\\JSAMPLE',
    roles: ['PROVINCIAL_SUBMITTER'],
    grantedActions: PROVINCIAL_SUBMITTER_ACTIONS,
    orgUnitNo: null,
    forestClientNumber: scenario === 'industrySubmitter' ? OWN_CLIENT : null,
    availableForestClientNumbers: [OWN_CLIENT, SECOND_CLIENT],
    forestClientSelectionRequired: scenario === 'industryChooseOrganization',
  }
}

// ---------------------------------------------------------------------------
// Code tables

const option = (code: string, name: string) => ({ code, name })

const REGIONS = [
  option('1903', 'Cariboo'),
  option('1904', 'Kootenay-Boundary'),
  option('1905', 'Northeast'),
  option('1906', 'Omineca'),
  option('1907', 'Thompson-Okanagan'),
  option('1908', 'Skeena'),
  option('1909', 'South Coast'),
  option('1910', 'West Coast'),
]

const APPLICATION_STATUSES = [
  option('NEW', 'New'),
  option('APP', 'Approved'),
  option('PND', 'Pending'),
  option('REJ', 'Rejected'),
  option('WDN', 'Withdrawn'),
  option('EXE', 'Exempted'),
  option('EXP', 'Expired'),
  option('PMT', 'Permitted'),
]

const EXEMPTION_TYPES = [
  option('M', 'Ministerial'),
  option('O', 'Order in Council'),
  option('B', 'Blanket Order in Council'),
]

const EXEMPTION_STATUSES = [
  option('NEW', 'New'),
  option('ACT', 'Active'),
  option('CAN', 'Cancelled'),
  option('EXP', 'Expired'),
]

const PRODUCT_TYPES = [
  option('H', 'Harvested Timber'),
  option('S', 'Standing Timber'),
  option('T', 'Unmanufactured Timber'),
]

const EXEMPTION_REASONS = [
  option('S', 'Surplus'),
  option('U', 'Utilization'),
  option('E', 'Economic'),
]

const GROWTH_TYPES = [option('O', 'Old Growth'), option('S', 'Second Growth')]

const PERMIT_STATUSES = [
  option('ACT', 'Active'),
  option('CAN', 'Cancelled'),
  option('COM', 'Complete'),
  option('EXP', 'Expired'),
  option('PPD', 'Payment pending'),
]

// Export schedule ids with their advertising (list) dates.
const CURRENT_SCHEDULES = [option('1185', '2026-11-18'), option('1186', '2026-12-02')]
const NEXT_SCHEDULES = [option('1186', '2026-12-02'), option('1187', '2026-12-16')]

const APPLICATION_SEARCH_OPTIONS = {
  exemptionTypes: EXEMPTION_TYPES,
  exemptionReasons: EXEMPTION_REASONS,
  applicationStatuses: APPLICATION_STATUSES,
  productTypes: PRODUCT_TYPES,
  growthTypes: GROWTH_TYPES,
  regions: REGIONS,
  currentSchedules: CURRENT_SCHEDULES,
  nextSchedules: NEXT_SCHEDULES,
}

// ---------------------------------------------------------------------------
// Clients

type ManualClient = {
  clientNumber: string
  companyName: string
  clientAcronym: string
  address: string
  city: string
  postalCode: string
  phone: string
  email: string
}

const CLIENTS: Record<string, ManualClient> = {
  [OWN_CLIENT]: {
    clientNumber: OWN_CLIENT,
    companyName: 'Example Forestry Ltd.',
    clientAcronym: 'EFL',
    address: '100 Example Street',
    city: 'Victoria',
    postalCode: 'V8V 1A1',
    phone: '250-555-0101',
    email: 'jordan.sample@example.com',
  },
  [SECOND_CLIENT]: {
    clientNumber: SECOND_CLIENT,
    companyName: 'Sample Timber Co.',
    clientAcronym: 'STC',
    address: '200 Sample Road',
    city: 'Nanaimo',
    postalCode: 'V9R 2B2',
    phone: '250-555-0102',
    email: 'pat.example@example.com',
  },
  [THIRD_CLIENT]: {
    clientNumber: THIRD_CLIENT,
    companyName: 'Demo Log Exports Inc.',
    clientAcronym: 'DLE',
    address: '300 Demo Avenue',
    city: 'Campbell River',
    postalCode: 'V9W 3C3',
    phone: '250-555-0103',
    email: 'casey.demo@example.com',
  },
}

const clientData = (clientNumber: string) => {
  const client = CLIENTS[clientNumber]
  if (!client) return { clientNumber: '', notfound: 'true' }
  return {
    clientNumber: client.clientNumber,
    companyName: client.companyName,
    clientAcronym: client.clientAcronym,
    locationName: 'Head office',
    address: client.address,
    city: client.city,
    province: 'BC',
    postalCode: client.postalCode,
    country: 'Canada',
    phone: client.phone,
    fax: '',
    email: client.email,
    notfound: '',
  }
}

// ---------------------------------------------------------------------------
// Records

const MAIN_APPLICATION = 48101
export const NEW_APPLICATION = 48102
export const ADVERTISED_APPLICATION = 48104
export const MAIN_EXEMPTION = '26-9001'
export const BLANKET_OIC_EXEMPTION = '26-9005'
export const MAIN_OFFER = 81001
export const MAIN_PERMIT = 9030101
const COMPLETED_PERMIT = 9030102

const summaryPage = <T>(results: T[]): SummaryPage<T> => ({
  results,
  total: results.length,
  page: 0,
  size: 10,
})

const SUMMARY_APPLICATIONS = summaryPage<SummaryApplication>([
  {
    application: 48107,
    status: 'Approved',
    reason: 'Surplus',
    exemptionType: null,
    exemptionNumber: null,
    receivedDate: '2026-11-12',
    listingDate: '2026-12-16',
    packageNumberAry: ['EX-BOOM-07'],
  },
  {
    application: NEW_APPLICATION,
    status: 'New',
    reason: 'Surplus',
    exemptionType: null,
    exemptionNumber: null,
    receivedDate: '2026-11-09',
    listingDate: '2026-12-02',
    packageNumberAry: ['EX-BOOM-02'],
  },
  {
    application: MAIN_APPLICATION,
    status: 'Exempted',
    reason: 'Surplus',
    exemptionType: 'Ministerial',
    exemptionNumber: MAIN_EXEMPTION,
    receivedDate: '2026-09-21',
    listingDate: '2026-10-07',
    packageNumberAry: ['EX-BOOM-01'],
  },
])

const SUMMARY_OFFERS = summaryPage<SummaryOffer>([
  {
    offerNumber: 81003,
    application: 48103,
    packageNumber: 'EX-BOOM-03',
    listingDate: '2026-11-18',
  },
])

const SUMMARY_EXEMPTIONS = summaryPage<SummaryExemption>([
  {
    exemption: MAIN_EXEMPTION,
    exemptionType: 'Ministerial',
    ownerClientNumber: OWN_CLIENT,
    agentClientNumber: null,
    status: 'Active',
    approvedVolume: 1850,
    balanceRemaining: 802.5,
    approvalDate: '2026-10-28',
    expiryDate: '2027-10-28',
  },
  {
    exemption: BLANKET_OIC_EXEMPTION,
    exemptionType: 'Blanket Order in Council',
    ownerClientNumber: null,
    agentClientNumber: null,
    status: 'Active',
    approvedVolume: 0,
    balanceRemaining: 0,
    approvalDate: '2026-04-01',
    expiryDate: '2027-03-31',
  },
])

const SUMMARY_PERMITS = summaryPage<SummaryPermit>([
  {
    permit: COMPLETED_PERMIT,
    status: 'Complete',
    ownerClientNumber: OWN_CLIENT,
    agentClientNumber: null,
    exemption: MAIN_EXEMPTION,
    totalPieces: 297,
    totalVolume: 438,
    receipt: null,
    issueDate: '2026-11-10',
  },
  {
    permit: MAIN_PERMIT,
    status: 'Active',
    ownerClientNumber: OWN_CLIENT,
    agentClientNumber: null,
    exemption: MAIN_EXEMPTION,
    totalPieces: 412,
    totalVolume: 609.5,
    receipt: null,
    issueDate: null,
  },
])

const SUMMARY_FEES = summaryPage<SummaryFee>([
  { permit: MAIN_PERMIT, status: 'Active', volume: 609.5, fees: 3976.84, receipt: null },
  { permit: COMPLETED_PERMIT, status: 'Complete', volume: 438, fees: 3101.4, receipt: null },
])

const SUMMARY_OFFERS_PLACED = summaryPage<SummaryOffer>([
  {
    offerNumber: MAIN_OFFER,
    application: ADVERTISED_APPLICATION,
    packageNumber: 'EX-BOOM-04',
    listingDate: '2026-11-18',
  },
])

const APPLICATION_SEARCH_ROWS = [
  [48107, 'Approved', '', OWN_CLIENT, '', '2026-12-16', 'RWC', 980],
  [NEW_APPLICATION, 'New', '', OWN_CLIENT, '', '2026-12-02', 'RSC', 1320],
  [48106, 'Withdrawn', '', OWN_CLIENT, '', '2026-11-18', 'RWC', 450],
  [48105, 'Approved', '', OWN_CLIENT, '', '2026-11-18', 'RSC', 2210.5],
  [48103, 'Rejected', '', OWN_CLIENT, '', '2026-10-21', 'RWC', 760],
  [MAIN_APPLICATION, 'Exempted', '', OWN_CLIENT, MAIN_EXEMPTION, '2026-10-07', 'RSC', 1850],
].map(
  ([
    application,
    status,
    client,
    ownerClientNumber,
    exemptionNumber,
    listingDate,
    region,
    volume,
  ]) => ({
    application,
    status,
    client,
    ownerClientNumber,
    exemptionNumber,
    listingDate,
    region,
    applicationVolume: volume,
    showCheckbox: false,
    locked: false,
    exemptionTypeDescription: exemptionNumber ? 'Ministerial' : null,
    agentClientNumber: '',
  }),
)

const ACTIVE_NOTIFICATIONS: LexisNotificationView[] = [
  {
    id: 3,
    title: 'Sample notice: advertising list dates',
    contentHtml:
      '<p>This is an example of an information notice. Administrators use notices like this to share dates and reminders.</p>',
    notificationLevel: 'INFORMATION',
    displayStartDate: '2026-11-02',
    displayEndDate: '2026-12-16',
    updateTimestamp: '2026-11-02T09:00:00',
  },
  {
    id: 2,
    title: 'Sample notice: planned maintenance',
    contentHtml:
      '<p>This is an example of a warning notice. Administrators use notices like this to announce a planned outage.</p>',
    notificationLevel: 'WARNING',
    displayStartDate: '2026-11-16',
    displayEndDate: '2026-11-28',
    updateTimestamp: '2026-11-16T08:30:00',
  },
]

// ---------------------------------------------------------------------------
// Application records

const SPECIES = [
  { code: 'BA', description: 'Balsam' },
  { code: 'CE', description: 'Cedar' },
  { code: 'CY', description: 'Cypress' },
  { code: 'FI', description: 'Fir' },
  { code: 'HE', description: 'Hemlock' },
  { code: 'SP', description: 'Spruce' },
]

const END_USES = [
  { code: 'SAW', description: 'Sawlogs' },
  { code: 'PUL', description: 'Pulp logs' },
]

const GRADES = [
  { code: 'H', description: 'H' },
  { code: 'I', description: 'I' },
  { code: 'J', description: 'J' },
  { code: 'U', description: 'U' },
]

type ManualApplication = {
  detail: ProvincialApplicationDetail
  productLocation: string
  growthTypeCode: string
  speciesCodes: string[]
  endUseCode: string
  exportScheduleId: string
  ownerContactName: string
  packages: Record<
    string,
    {
      length: string
      diameter: string
      scales: {
        id: string
        timberMark: string
        species: string
        grade: string
        pieces: number
        volume: string
        permitted: boolean
      }[]
    }
  >
}

const applicationDetail = (
  overrides: Partial<ProvincialApplicationDetail> &
    Pick<ProvincialApplicationDetail, 'applicationNumber'>,
): ProvincialApplicationDetail => ({
  exemptionNumber: null,
  applicationStatusCode: 'NEW',
  statusDescription: 'New',
  author: 'BCEID\\JSAMPLE',
  ownerClientNumber: OWN_CLIENT,
  agentClientNumber: null,
  orgUnitNumber: 1909,
  orgUnitName: 'South Coast Natural Resource Region',
  productTypeCode: 'H',
  exemptionReasonCode: 'S',
  applicationDate: '2026-11-09',
  receivedDate: '2026-11-09',
  listingDate: '2026-12-02',
  termDays: 180,
  applicationVolume: 1320,
  averageLogVolume: 1.8,
  canCreateOffers: false,
  industryUser: false,
  readOnly: false,
  exemptionApprover: false,
  canEditApplicationDetails: true,
  canEditPackages: true,
  canAddPackages: true,
  canAddScales: true,
  canUpdatePackageNumber: true,
  locked: false,
  lockedBy: null,
  lockMessage: null,
  packages: [],
  remarks: [],
  offers: [],
  ...overrides,
})

const APPLICATIONS: Record<string, ManualApplication> = {
  [NEW_APPLICATION]: {
    detail: applicationDetail({
      applicationNumber: NEW_APPLICATION,
      packages: [{ packageNumber: 'EX-BOOM-02', volume: 1320, pieceCount: 642 }],
    }),
    productLocation: 'Boom ground at Example Bay, Howe Sound',
    growthTypeCode: 'S',
    speciesCodes: ['HE', 'BA', 'CE'],
    endUseCode: 'SAW',
    exportScheduleId: '1186',
    ownerContactName: 'Jordan Sample',
    packages: {
      'EX-BOOM-02': {
        length: '11.5',
        diameter: '16.0',
        scales: [
          {
            id: '7101',
            timberMark: 'EM0001',
            species: 'HE',
            grade: 'H',
            pieces: 318,
            volume: '702.40',
            permitted: false,
          },
          {
            id: '7102',
            timberMark: 'EM0001',
            species: 'BA',
            grade: 'I',
            pieces: 201,
            volume: '389.75',
            permitted: false,
          },
          {
            id: '7103',
            timberMark: 'EM0002',
            species: 'CE',
            grade: 'J',
            pieces: 123,
            volume: '227.85',
            permitted: false,
          },
        ],
      },
    },
  },
}

const applicationFor = (applicationNumber: string | null) =>
  applicationNumber ? APPLICATIONS[applicationNumber] : undefined

const applicationSummarySnapshot = (application: ManualApplication) => {
  const { detail } = application
  return {
    applicationNumber: String(detail.applicationNumber),
    federalApplicationNumber: '',
    applicationDate: detail.applicationDate,
    receivedDate: detail.receivedDate,
    termDays: String(detail.termDays),
    applicationVolume: String(detail.applicationVolume),
    averageLogVolume: String(detail.averageLogVolume),
    productLocation: application.productLocation,
    exportScheduleId: application.exportScheduleId,
    agentClientNumber: detail.agentClientNumber ?? '',
    agentClientLocationCode: '',
    ownerClientNumber: detail.ownerClientNumber ?? '',
    ownerClientLocationCode: '00',
    exemptionNumber: detail.exemptionNumber ?? '',
    exemptionReasonCode: detail.exemptionReasonCode,
    applicationStatusCode: detail.applicationStatusCode,
    applicantTypeCode: 'O',
    orgUnitNumber: String(detail.orgUnitNumber),
    productTypeCode: detail.productTypeCode,
    jurisdictionCode: 'P',
    growthTypeCode: application.growthTypeCode,
    agentContactName: '',
    ownerContactName: application.ownerContactName,
    oicIndicator: 'N',
    endUseCode: application.endUseCode,
    speciesCodes: application.speciesCodes,
  }
}

const packageFor = (packageNumber: string | null) => {
  for (const application of Object.values(APPLICATIONS)) {
    const extra = packageNumber ? application.packages[packageNumber] : undefined
    const row = application.detail.packages.find((item) => item.packageNumber === packageNumber)
    if (extra && row) return { application, row, extra }
  }
  return undefined
}

const endUseDescription = (code: string) =>
  END_USES.find((endUse) => endUse.code === code)?.description ?? code

export const UPLOAD_FILE_NAME = 'example-forestry-boom-08.xml'

const UPLOAD_VALIDATION = {
  status: 'validated',
  message: 'LEXIS application submission validated for package EX-BOOM-08 with 3 scale rows.',
  packageNumber: 'EX-BOOM-08',
  scaleRows: 3,
  errors: [],
  warnings: [],
  submissionSummary: {
    ownerClientNumber: OWN_CLIENT,
    ownerClientLocationCode: '00',
    ownerContactName: 'Jordan Sample',
    agentClientNumber: null,
    jurisdictionCode: 'P',
    orgUnitNumber: 1909,
    regionCode: 'RSC',
    sourceApplicationStatusCode: 'SUB',
    exemptionReasonCode: 'S',
    applicantTypeCode: 'O',
    productTypeCode: 'H',
    packageNumber: 'EX-BOOM-08',
    productLocation: 'Boom ground at Example Bay, Howe Sound',
    ageClass: 'S',
    applicationVolume: 1045,
    averageLogVolume: 1.7,
    averageLength: 11.5,
    averageDiameter: 16,
    speciesCodes: ['HE', 'BA', 'CE'],
    endUseCode: 'SAW',
    scaleRows: 3,
  },
} satisfies AdminUploadResult

// ---------------------------------------------------------------------------
// Offers

const offerDetail = (): ProvincialOfferDetail => {
  return {
    offerNumber: MAIN_OFFER,
    applicationNumber: ADVERTISED_APPLICATION,
    packageNumber: 'EX-BOOM-04',
    companyName: 'Example Forestry Ltd.',
    contactName: 'Jordan Sample',
    purchaseOfferAmount: 92.5,
    purchaseOfferDate: '2026-11-23',
    offerWithdrawalDate: null,
    teacReviewDate: '2026-12-09',
    approvalIndicator: 'N',
    validOfferIndicator: 'Y',
    fairOfferIndicator: 'N',
    offerRemark: null,
    withdrawReason: null,
    exportJurisdictionCode: 'P',
    manufacturingFacilityInfo: null,
    offeringClientNumber: OWN_CLIENT,
    pickupLocation: 'Boom ground at Sample Inlet, Jervis Inlet',
    offerCondition: 'Logs to be towed by the buyer within 30 days of approval.',
    advertisingDate: '2026-11-18',
    offerEndDate: '2026-12-01',
    packageVolume: 1150,
    speciesGradeCode: 'HE/BA SAWLOG',
    offerVolume: 850,
    region: 'South Coast',
    author: 'BCEID\\JSAMPLE',
    canEditScheduleDates: false,
    canEditOfferRemarks: false,
    canEditOfferDetails: true,
    canEditWithdrawFields: true,
    locked: false,
    lockedBy: null,
    lockMessage: null,
  }
}

const OFFER_APPLICATIONS: Record<string, { packages: string[]; volume: string }> = {
  [ADVERTISED_APPLICATION]: { packages: ['EX-BOOM-04'], volume: '1150.0' },
}

const OFFER_PACKAGE_VOLUMES: Record<string, string> = { 'EX-BOOM-04': '1150.0' }

// ---------------------------------------------------------------------------
// Exemptions

const EXEMPTION_SEARCH_OPTIONS = {
  exemptionTypes: EXEMPTION_TYPES,
  exemptionStatuses: EXEMPTION_STATUSES,
  regions: REGIONS,
}

type ManualExemption = {
  detail: ProvincialExemptionDetail
  regions: string[]
  applications: {
    applicationNumber: number
    requestedVolume: string
    scaleVolume: string
    ownerClientNumber: string
    ownerContactName: string
  }[]
  permits: {
    permitNumber: number
    permitVolume: string
    permitStatus: string
    permitIssueDate: string
  }[]
}

const exemptionDetail = (
  overrides: Partial<ProvincialExemptionDetail> &
    Pick<ProvincialExemptionDetail, 'exemptionNumber'>,
): ProvincialExemptionDetail => ({
  exemptionTypeCode: 'M',
  exemptionTypeDescription: 'Ministerial',
  exemptionStatusCode: 'ACT',
  exemptionStatusDescription: 'Active',
  author: 'IDIR\\JSAMPLE',
  ownerClientNumber: OWN_CLIENT,
  agentClientNumber: null,
  applicationNumber: null,
  applicationStatus: null,
  approvalDate: null,
  expiryDate: null,
  approvedVolume: null,
  usedVolume: null,
  remainingVolume: null,
  otherConditions: null,
  blanketOic: false,
  permitNumbers: [],
  remarks: [],
  ...overrides,
})

const EXEMPTIONS: Record<string, ManualExemption> = {
  [MAIN_EXEMPTION]: {
    detail: exemptionDetail({
      exemptionNumber: MAIN_EXEMPTION,
      applicationNumber: MAIN_APPLICATION,
      applicationStatus: 'Exempted',
      approvalDate: '2026-10-28',
      expiryDate: '2027-04-26',
      approvedVolume: 1850,
      usedVolume: 1047.5,
      remainingVolume: 802.5,
      otherConditions: 'Logs must be exported within the term of the exemption.',
    }),
    regions: ['1909'],
    applications: [
      {
        applicationNumber: MAIN_APPLICATION,
        requestedVolume: '1850.0',
        scaleVolume: '1047.5',
        ownerClientNumber: OWN_CLIENT,
        ownerContactName: 'Jordan Sample',
      },
    ],
    permits: [
      {
        permitNumber: MAIN_PERMIT,
        permitVolume: '609.5',
        permitStatus: 'Active',
        permitIssueDate: '',
      },
      {
        permitNumber: COMPLETED_PERMIT,
        permitVolume: '438.0',
        permitStatus: 'Complete',
        permitIssueDate: '2026-11-10',
      },
    ],
  },
  [BLANKET_OIC_EXEMPTION]: {
    detail: exemptionDetail({
      exemptionNumber: BLANKET_OIC_EXEMPTION,
      exemptionTypeCode: 'B',
      exemptionTypeDescription: 'Blanket Order in Council',
      ownerClientNumber: null,
      approvalDate: '2026-04-01',
      expiryDate: '2027-03-31',
      approvedVolume: 9999999.9,
      usedVolume: 12480.5,
      remainingVolume: 9987519.4,
      blanketOic: true,
    }),
    regions: ['1909', '1910'],
    applications: [],
    permits: [],
  },
}

const exemptionFor = (exemptionNumber: string | null) =>
  exemptionNumber ? EXEMPTIONS[exemptionNumber.trim()] : undefined

const exemptionApplications = (exemption: ManualExemption) => ({
  applications: exemption.applications.map((application) => ({
    applicationNumber: String(application.applicationNumber),
    requestedVolume: application.requestedVolume,
    scaleVolume: application.scaleVolume,
    locked: false,
    jurisdiction: 'P',
    ownerClientNumber: application.ownerClientNumber,
    agentClientNumber: '',
    ownerClientLocationCode: '00',
    agentClientLocationCode: '',
    applicantTypeCode: 'O',
    ownerContactName: application.ownerContactName,
    agentContactName: '',
    ownerCompanyName: CLIENTS[application.ownerClientNumber]?.companyName ?? '',
    agentCompanyName: '',
    removable: false,
  })),
  containsUnmanu: false,
  ownerNumber: exemption.detail.ownerClientNumber ?? '',
})

// ---------------------------------------------------------------------------
// Permits

type ManualPermit = {
  detail: ProvincialPermitDetail
  packages: {
    packageNumber: string
    volume: string
    length: string
    diameter: string
    scales: {
      id: string
      timberMark: string
      species: string
      grade: string
      pieces: number
      volume: string
    }[]
  }[]
  fees: { amv: string; fil: string; mf: string; fee: string }[]
  gbms: Record<string, string>[]
}

const permitDetail = (
  overrides: Partial<ProvincialPermitDetail> & Pick<ProvincialPermitDetail, 'permitNumber'>,
): ProvincialPermitDetail => ({
  applicationNumber: MAIN_APPLICATION,
  packageNumber: null,
  exemptionNumber: MAIN_EXEMPTION,
  permitStatusCode: 'ACT',
  permitStatusDescription: 'Active',
  author: 'BCEID\\JSAMPLE',
  applicantClientNumber: null,
  agentClientLocationCode: null,
  ownerClientNumber: OWN_CLIENT,
  ownerClientLocationCode: '00',
  destinationCompanyName: 'Example Pacific Trading Co.',
  destinationCountryCode: 'JP',
  transportTypeCode: 'S',
  transportName: 'MV Example Spirit',
  portOfExportCode: 'NA',
  otherPortOfExport: null,
  applicationDate: '2026-11-16',
  issueDate: null,
  expiryDate: '2027-04-26',
  receivedDate: '2026-11-16',
  estimatedShippingDate: '2026-12-08',
  permitVolume: 609.5,
  approvedExemptionVolume: 1850,
  exemptionVolumeRemaining: 802.5,
  exemptionTypeDescription: 'Ministerial',
  blanketOic: false,
  numberOfPieces: 412,
  receiptNumber: null,
  federalPermitNumber: null,
  invoiceNumber: null,
  remarks: null,
  oicApplicationNumber: null,
  oicRequestPieces: null,
  oicRequestVolume: null,
  orgUnitNumber: 1909,
  region: 'South Coast Natural Resource Region',
  ...overrides,
})

const PERMITS: Record<string, ManualPermit> = {
  [MAIN_PERMIT]: {
    detail: permitDetail({ permitNumber: MAIN_PERMIT }),
    packages: [
      {
        packageNumber: 'EX-BOOM-05',
        volume: '609.5',
        length: '12.0',
        diameter: '17.5',
        scales: [
          {
            id: '7301',
            timberMark: 'EM0001',
            species: 'HE',
            grade: 'H',
            pieces: 244,
            volume: '361.20',
          },
          {
            id: '7302',
            timberMark: 'EM0001',
            species: 'BA',
            grade: 'I',
            pieces: 168,
            volume: '248.30',
          },
        ],
      },
    ],
    fees: [
      { amv: '$64.00', fil: '10%', mf: '6%', fee: '2450.29' },
      { amv: '$58.00', fil: '10%', mf: '6%', fee: '1526.55' },
    ],
    gbms: [],
  },
}

const permitFor = (permitNumber: string | null) =>
  permitNumber ? PERMITS[permitNumber.trim()] : undefined

const permitCoreTabs = (permit: ManualPermit) => ({
  applicationList: [String(permit.detail.applicationNumber)],
  applicationTotals: [
    {
      applicationNumber: String(permit.detail.applicationNumber),
      pieces: permit.detail.numberOfPieces,
      volume: permit.detail.permitVolume,
    },
  ],
  packageList: permit.packages.map((item) => ({
    packageNumber: item.packageNumber,
    packageInfo: {
      region: 'South Coast',
      enduse: 'HE/BA SAWLOG',
      ageclass: 'S',
      volume: item.volume,
      length: item.length,
      diameter: item.diameter,
      productType: 'H',
    },
    scaleList: item.scales.map((scale) => ({
      ...scale,
      pieces: String(scale.pieces),
      cascadeSplitCode: 'W',
      permit: String(permit.detail.permitNumber),
    })),
  })),
})

const permitFees = (permit: ManualPermit) => {
  let feeIndex = 0
  return {
    packageList: permit.packages.map((item) => ({
      packageNumber: item.packageNumber,
      growthType: 'Second Growth',
      totalFeeForPackage: `$${item.scales
        .map((_scale, index) => Number(permit.fees[index]?.fee ?? 0))
        .reduce((sum, fee) => sum + fee, 0)
        .toLocaleString('en-CA', { minimumFractionDigits: 2 })}`,
      scaleList: item.scales.map((scale) => {
        const fee = permit.fees[feeIndex++]
        return {
          ...scale,
          packageNumber: item.packageNumber,
          ministryUser: false,
          amv: fee?.amv ?? '',
          ewb: '',
          fil: fee?.fil ?? '',
          mf: fee?.mf ?? '',
          fee: fee?.fee ?? '',
        }
      }),
    })),
    totalVolume: String(permit.detail.permitVolume),
  }
}

const SHIPPING_REFERENCE_OPTIONS = {
  countries: [
    option('US', 'United States of America'),
    option('JP', 'Japan'),
    option('CN', 'China'),
    option('KR', 'Korea, Republic of'),
    option('TW', 'Taiwan'),
    option('CA', 'Canada'),
    option('NZ', 'New Zealand'),
  ],
  transportTypes: [
    option('B', 'Barge'),
    option('S', 'Ship'),
    option('T', 'Truck'),
    option('R', 'Rail'),
  ],
  ports: [
    option('CB', 'Cowichan Bay'),
    option('NA', 'Nanaimo'),
    option('VA', 'Vancouver'),
    option('PR', 'Prince Rupert'),
    option('OT', 'Other'),
  ],
}

const PERMIT_SEARCH_OPTIONS = { permitStatuses: PERMIT_STATUSES, regions: REGIONS }

// ---------------------------------------------------------------------------
// Routes

const ROUTES: ManualRoute[] = [
  {
    method: 'GET',
    path: /^\/lexis\/session\/capabilities$/,
    respond: (r) => capabilitiesFor(r.scenario),
  },
  {
    method: 'GET',
    path: /^\/lexis\/session\/preferences$/,
    respond: () => ({ defaultRegion: null }),
  },
  { method: 'GET', path: /^\/lexis\/notifications$/, respond: () => ACTIVE_NOTIFICATIONS },
  {
    method: 'GET',
    path: /^\/lexis\/rpc\/application-details\/client-data$/,
    respond: (r) => clientData(r.query.get('clientNumber') ?? ''),
  },
  { method: 'GET', path: /^\/lexis\/summary\/applications$/, respond: () => SUMMARY_APPLICATIONS },
  { method: 'GET', path: /^\/lexis\/summary\/offers$/, respond: () => SUMMARY_OFFERS },
  { method: 'GET', path: /^\/lexis\/summary\/exemptions$/, respond: () => SUMMARY_EXEMPTIONS },
  { method: 'GET', path: /^\/lexis\/summary\/permits$/, respond: () => SUMMARY_PERMITS },
  { method: 'GET', path: /^\/lexis\/summary\/fees$/, respond: () => SUMMARY_FEES },
  {
    method: 'GET',
    path: /^\/lexis\/summary\/offers-placed$/,
    respond: () => SUMMARY_OFFERS_PLACED,
  },
  {
    method: 'GET',
    path: /^\/lexis\/applications\/search\/options$/,
    respond: () => APPLICATION_SEARCH_OPTIONS,
  },
  {
    method: 'GET',
    path: /^\/lexis\/applications\/search$/,
    respond: () => ({
      results: APPLICATION_SEARCH_ROWS,
      total: APPLICATION_SEARCH_ROWS.length,
      page: 0,
      size: 10,
    }),
  },
  {
    method: 'GET',
    path: /^\/lexis\/applications\/search\/count$/,
    respond: () => ({ total: APPLICATION_SEARCH_ROWS.length }),
  },
  {
    method: 'GET',
    path: /^\/lexis\/rpc\/application-details\/client-locations$/,
    respond: (r) =>
      CLIENTS[r.query.get('clientNumber') ?? '']
        ? [{ locationCode: '00', locationName: 'HEAD OFFICE', selected: true }]
        : [],
  },
  {
    method: 'GET',
    path: /^\/lexis\/rpc\/application-details\/contacts-for-location$/,
    respond: (r) =>
      CLIENTS[r.query.get('clientNumber') ?? '']
        ? [{ contactName: 'Jordan Sample', contactId: '1' }]
        : [{ contactName: 'No contacts on file for this location', contactId: '0' }],
  },
  {
    method: 'GET',
    path: /^\/lexis\/applications\/(\d+)$/,
    respond: (_r, m) => applicationFor(m[1])?.detail,
  },
  {
    method: 'GET',
    path: /^\/lexis\/rpc\/application-details\/application-summary$/,
    respond: (r) => {
      const application = applicationFor(r.query.get('applicationNumber'))
      return application && applicationSummarySnapshot(application)
    },
  },
  {
    method: 'GET',
    path: /^\/lexis\/rpc\/application-details\/species-for-application$/,
    respond: (r) => {
      const application = applicationFor(r.query.get('applicationNumber'))
      return application?.speciesCodes.map((species) => ({
        species,
        enduse: application.endUseCode,
        endUseDescription: endUseDescription(application.endUseCode),
      }))
    },
  },
  { method: 'GET', path: /^\/lexis\/rpc\/application-details\/permits$/, respond: () => [] },
  {
    method: 'GET',
    path: /^\/lexis\/rpc\/application-details\/document-details$/,
    respond: () => [],
  },
  {
    method: 'GET',
    path: /^\/lexis\/rpc\/application-details\/(remaining-species|species-codes)$/,
    respond: () => SPECIES,
  },
  {
    method: 'GET',
    path: /^\/lexis\/rpc\/application-details\/end-uses-for-species-region$/,
    respond: () => END_USES,
  },
  {
    method: 'GET',
    path: /^\/lexis\/rpc\/application-details\/grade-codes$/,
    respond: () => GRADES,
  },
  {
    method: 'GET',
    path: /^\/lexis\/rpc\/application-details\/package-status-codes$/,
    respond: () => [{ code: 'ACT', description: 'Active' }],
  },
  {
    method: 'GET',
    path: /^\/lexis\/rpc\/application-details\/package-details$/,
    respond: (r) => {
      const found = packageFor(r.query.get('packageNumber'))
      if (!found) return undefined
      return {
        success: true,
        packageNumber: found.row.packageNumber,
        volume: String(found.row.volume),
        scaledVolume: found.extra.scales.reduce((sum, scale) => sum + Number(scale.volume), 0),
        length: found.extra.length,
        diameter: found.extra.diameter,
        status: 'ACT',
        statusDescription: 'Active',
        comments: '',
        reprocessed: 'N',
        ageClass: found.application.growthTypeCode,
        ageClassDescription: 'Second Growth',
        productType: 'H',
        productTypeDescription: 'Harvested Timber',
      }
    },
  },
  {
    method: 'GET',
    path: /^\/lexis\/rpc\/application-details\/species-for-package$/,
    respond: (r) => {
      const found = packageFor(r.query.get('packageNumber'))
      return found?.application.speciesCodes.map((species) => ({
        species,
        enduse: found.application.endUseCode,
        endUseDescription: endUseDescription(found.application.endUseCode),
      }))
    },
  },
  {
    method: 'GET',
    path: /^\/lexis\/rpc\/application-details\/package-scales$/,
    respond: (r) => {
      const packageNumber = r.query.get('packageNumber') ?? ''
      const scales = packageFor(packageNumber)?.extra.scales
      // Every sample record is coast scale.
      return scales?.map((scale) => ({ ...scale, cascadeSplitCode: 'W' }))
    },
  },
  {
    method: 'POST',
    path: /^\/lexis\/application-submissions\/validation$/,
    respond: () => UPLOAD_VALIDATION,
  },
  {
    // Record pages call this as they close.
    method: 'POST',
    path: /^\/lexis\/rpc\/(application|exemption|offer|permit)-details\/release-lock$/,
    respond: () => ({ success: true }),
  },
  {
    method: 'GET',
    path: /^\/lexis\/purchase-offers\/(\d+)$/,
    respond: (_r, m) => (Number(m[1]) === MAIN_OFFER ? offerDetail() : undefined),
  },
  {
    method: 'GET',
    path: /^\/lexis\/rpc\/offer-details\/client-data$/,
    respond: (r) => {
      const client = clientData(r.query.get('clientNumber') ?? '')
      return { ...client, legalContactName: 'Jordan Sample' }
    },
  },
  {
    method: 'GET',
    path: /^\/lexis\/rpc\/offer-details\/validate-application-number$/,
    respond: (r) =>
      OFFER_APPLICATIONS[r.query.get('applicationNumber') ?? '']
        ? { isValid: true, errors: [] }
        : undefined,
  },
  {
    method: 'GET',
    path: /^\/lexis\/rpc\/offer-details\/application-details$/,
    respond: (r) =>
      OFFER_APPLICATIONS[r.query.get('applicationNumber') ?? '']
        ? {
            success: true,
            speciesGradeCode: 'HE/BA SAWLOG',
            advertisingDate: '2026-11-18',
            teacReviewDate: '2026-12-09',
            region: 'Coast',
          }
        : undefined,
  },
  {
    method: 'GET',
    path: /^\/lexis\/rpc\/offer-details\/package-list$/,
    respond: (r) => {
      const application = OFFER_APPLICATIONS[r.query.get('applicationNumber') ?? '']
      return application && { packageList: application.packages }
    },
  },
  {
    method: 'GET',
    path: /^\/lexis\/rpc\/offer-details\/application-volume$/,
    respond: (r) => {
      const application = OFFER_APPLICATIONS[r.query.get('applicationNumber') ?? '']
      return application && { volume: application.volume }
    },
  },
  {
    method: 'GET',
    path: /^\/lexis\/rpc\/offer-details\/package-volume$/,
    respond: (r) => {
      const volume = OFFER_PACKAGE_VOLUMES[r.query.get('packageNumber') ?? '']
      return volume && { volume }
    },
  },
  {
    method: 'GET',
    path: /^\/lexis\/exemptions\/search\/options$/,
    respond: () => EXEMPTION_SEARCH_OPTIONS,
  },
  {
    method: 'GET',
    path: /^\/lexis\/exemptions\/([^/]+)$/,
    respond: (_r, m) => exemptionFor(decodeURIComponent(m[1]))?.detail,
  },
  {
    method: 'GET',
    path: /^\/lexis\/rpc\/exemption-details\/applications$/,
    respond: (r) => {
      const exemption = exemptionFor(r.query.get('exemptionNumber'))
      return exemption && exemptionApplications(exemption)
    },
  },
  {
    method: 'GET',
    path: /^\/lexis\/rpc\/exemption-details\/edit-context$/,
    respond: (r) => {
      const exemption = exemptionFor(r.query.get('exemptionNumber'))
      return (
        exemption && {
          rateOverrideEnabled: false,
          fixedFeeRate: '',
          regionNumbers: exemption.detail.blanketOic ? exemption.regions : [],
          accessRegionNumbers: exemption.regions,
          locked: false,
          lockMessage: '',
        }
      )
    },
  },
  {
    method: 'GET',
    path: /^\/lexis\/rpc\/exemption-details\/region-context$/,
    respond: (r) => {
      const exemption = exemptionFor(r.query.get('exemptionNumber'))
      return (
        exemption && {
          exemptionNumber: exemption.detail.exemptionNumber,
          regionNumbers: exemption.regions,
        }
      )
    },
  },
  {
    method: 'GET',
    path: /^\/lexis\/rpc\/exemption-details\/permits$/,
    respond: (r) =>
      exemptionFor(r.query.get('exemptionNumber'))?.permits.map((permit) => ({
        permitNumber: String(permit.permitNumber),
        permitVolume: permit.permitVolume,
        permitStatus: permit.permitStatus,
        permitIssueDate: permit.permitIssueDate,
        canViewPermit: true,
      })),
  },
  {
    method: 'GET',
    path: /^\/lexis\/rpc\/(exemption|permit)-details\/document-details$/,
    respond: () => [],
  },
  {
    method: 'GET',
    path: /^\/lexis\/permits\/search\/options$/,
    respond: () => PERMIT_SEARCH_OPTIONS,
  },
  {
    method: 'GET',
    path: /^\/lexis\/permits\/(\d+)$/,
    respond: (_r, m) => permitFor(m[1])?.detail,
  },
  {
    method: 'GET',
    path: /^\/lexis\/rpc\/permit-details\/edit-context$/,
    respond: (r) =>
      permitFor(r.query.get('permitNumber')) && {
        overrideEnabled: false,
        overrideFee: '',
        overrideComment: '',
        locked: false,
        lockMessage: '',
        interior: false,
      },
  },
  {
    method: 'GET',
    path: /^\/lexis\/rpc\/permit-details\/core-tabs$/,
    respond: (r) => {
      const permit = permitFor(r.query.get('permitNumber'))
      return permit && permitCoreTabs(permit)
    },
  },
  {
    method: 'GET',
    path: /^\/lexis\/rpc\/permit-details\/gbms-invoice-history$/,
    respond: (r) => permitFor(r.query.get('permitNumber'))?.gbms,
  },
  {
    method: 'GET',
    path: /^\/lexis\/rpc\/permit-details\/all-scale-fees$/,
    respond: (r) => {
      const permit = permitFor(r.query.get('permitNumber'))
      return permit && permitFees(permit)
    },
  },
  {
    method: 'GET',
    path: /^\/lexis\/shipping-reference-options$/,
    respond: () => SHIPPING_REFERENCE_OPTIONS,
  },
]

export const resolveManualApi = (
  scenario: ManualScenario,
  method: string,
  pathname: string,
  searchParams: URLSearchParams,
  postData?: string | null,
): ManualApiResponse | undefined => {
  const path = pathname.replace(/^\/api(?=\/)/, '')
  const upperMethod = method.toUpperCase()
  for (const route of ROUTES) {
    if (route.method !== upperMethod) continue
    const match = path.match(route.path)
    if (!match) continue
    const body = route.respond(
      { scenario, method: upperMethod, path, query: searchParams, postData },
      match,
    )
    // A known path with an unknown record is a gap in the data set, not a 404 to show.
    if (body === undefined) return undefined
    return { status: 200, body }
  }
  return undefined
}
