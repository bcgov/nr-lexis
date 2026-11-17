// Fictional data for the user manual screenshots. Every name, number and address is invented.
import type { LexisSessionCapabilities } from '../../src/interfaces/LexisSession'
import type {
  LexisNotification,
  LexisNotificationView,
} from '../../src/interfaces/LexisNotification'
import type {
  FederalApplicationDetail,
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

export type ManualScenario =
  | 'industryChooseOrganization'
  | 'industrySubmitter'
  | 'federalReadOnly'
  | 'ministryAdmin'

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
const ADMINISTRATOR_ACTIONS = [
  '/applicationDetails',
  '/applicationRemarks',
  '/applicationReport',
  '/applicationSearch',
  '/applicationsReview',
  '/approvedExemptionReport',
  '/changeApplicantType',
  '/createExemption',
  '/editCompletedApplications',
  '/exemptionDetails',
  '/exemptionReport',
  '/exemptionSearch',
  '/federalApplicationDetails',
  '/federalApplicationSearch',
  '/feeReport',
  '/fileApplicationUpload',
  '/fileExemptionUpload',
  '/fileInvoiceUpload',
  '/filePermitUpload',
  '/lexisAgentAdmin',
  '/lexisFILAdmin',
  '/lexisPolicyAdmin',
  '/offerDetails',
  '/offerReport',
  '/offersSearch',
  '/permitDetails',
  '/permitLedgerReport',
  '/permitReport',
  '/permitSearch',
  '/permitsReview',
  '/speciesGradeReport',
  '/summary',
  '/teacReport',
  '/tenureReport',
  '/transportReport',
  'approveExemption',
  'createApplication',
  'createOffer',
  'createPermit',
  'manageFederalApplication',
  'mofrListing',
  'saveExemption',
  'savePermit',
  'searchClients',
  'uploadApplicationSubmission',
  'viewFederalApplication',
  'viewNotifications',
]

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

const FEDERAL_READ_ONLY_ACTIONS = [
  '/federalApplicationSearch',
  '/federalApplicationDetails',
  'searchClients',
  'viewFederalApplication',
]

export const OWN_CLIENT = '00012345'
export const SECOND_CLIENT = '00067890'
export const THIRD_CLIENT = '00054321'

const capabilitiesFor = (scenario: ManualScenario): LexisSessionCapabilities => {
  const base = {
    authenticated: true,
    welcomeTarget: null,
    legacyPath: null,
    actionRegions: {},
    accessDeniedReason: null,
  }
  if (scenario === 'ministryAdmin') {
    return {
      ...base,
      principal: 'IDIR\\JSAMPLE',
      roles: ['ADMIN'],
      grantedActions: ADMINISTRATOR_ACTIONS,
      orgUnitNo: '1909',
      forestClientNumber: null,
      availableForestClientNumbers: [],
      forestClientSelectionRequired: false,
    }
  }
  if (scenario === 'federalReadOnly') {
    return {
      ...base,
      principal: 'BCEID\\JSAMPLE',
      roles: ['FEDERAL_READ_ONLY'],
      grantedActions: FEDERAL_READ_ONLY_ACTIONS,
      orgUnitNo: null,
      forestClientNumber: null,
      availableForestClientNumbers: [],
      forestClientSelectionRequired: false,
    }
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

export const MAIN_APPLICATION = 48101
export const NEW_APPLICATION = 48102
export const ADVERTISED_APPLICATION = 48104
export const MAIN_EXEMPTION = '26-9001'
export const NEW_EXEMPTION = '26-9002'
export const BLANKET_OIC_EXEMPTION = '26-9005'
export const MAIN_OFFER = 81001
export const MAIN_PERMIT = 9030101
export const COMPLETED_PERMIT = 9030102

const summaryPage = <T>(results: T[]): SummaryPage<T> => ({
  results,
  total: results.length,
  page: 0,
  size: 10,
})

const SUMMARY_APPLICATIONS = summaryPage<SummaryApplication>([
  {
    application: 48107,
    status: 'Pending',
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
  [48107, 'Pending', '', OWN_CLIENT, '', '2026-12-16', 'RWC', 980],
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
    title: 'Advertising list schedule for December',
    contentHtml:
      '<p>The advertising lists for December close on Dec 2 and Dec 16, 2026. Submit applications by noon on the closing date.</p>',
    notificationLevel: 'INFORMATION',
    displayStartDate: '2026-11-02',
    displayEndDate: '2026-12-16',
    updateTimestamp: '2026-11-02T09:00:00',
  },
  {
    id: 2,
    title: 'Planned maintenance on November 28',
    contentHtml:
      '<p>LEXIS will be unavailable on Saturday, November 28, 2026 from 8:00 a.m. to noon while updates are installed.</p>',
    notificationLevel: 'WARNING',
    displayStartDate: '2026-11-16',
    displayEndDate: '2026-11-28',
    updateTimestamp: '2026-11-16T08:30:00',
  },
]

const ADMIN_NOTIFICATIONS: LexisNotification[] = ACTIVE_NOTIFICATIONS.map((notification) => ({
  ...notification,
  createUser: 'IDIR\\JSAMPLE',
  createTimestamp: notification.updateTimestamp,
  updateUserId: 'IDIR\\JSAMPLE',
  audienceRoles: [],
}))

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

const REVIEW_QUEUE = [
  [NEW_APPLICATION, 1320, 'New', 'RSC', '2026-12-02'],
  [48108, 2475.5, 'New', 'RWC', '2026-12-02'],
  [48109, 860, 'New', 'RSC', '2026-12-02'],
  [48107, 980, 'Pending', 'RWC', '2026-12-16'],
  [48110, 1510, 'New', 'RSC', '2026-12-16'],
  [48111, 3120, 'New', 'RWC', '2026-12-16'],
].map(([applicationNumber, volume, status, region, listingDate]) => ({
  applicationNumber,
  volume,
  speciesEndUse: 'HE/BA SAWLOG',
  listingDate,
  status,
  region,
  showInfoIcon: false,
}))

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

const offerDetail = (scenario: ManualScenario): ProvincialOfferDetail => {
  const staff = scenario === 'ministryAdmin'
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
    canEditScheduleDates: staff,
    canEditOfferRemarks: staff,
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
  [NEW_EXEMPTION]: {
    detail: exemptionDetail({
      exemptionNumber: NEW_EXEMPTION,
      exemptionStatusCode: 'NEW',
      exemptionStatusDescription: 'New',
      ownerClientNumber: SECOND_CLIENT,
      applicationNumber: 48112,
      applicationStatus: 'Exempted',
      expiryDate: '2027-05-24',
      approvedVolume: 940,
      usedVolume: 0,
      remainingVolume: 940,
    }),
    regions: ['1910'],
    applications: [
      {
        applicationNumber: 48112,
        requestedVolume: '940.0',
        scaleVolume: '0.0',
        ownerClientNumber: SECOND_CLIENT,
        ownerContactName: 'Pat Example',
      },
    ],
    permits: [],
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
  fees: { amv: string; ewb: string; fil: string; mf: string; fee: string }[]
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
      { amv: '$64.00', ewb: '$23,116.80', fil: '10%', mf: '6%', fee: '2450.29' },
      { amv: '$58.00', ewb: '$14,401.40', fil: '10%', mf: '6%', fee: '1526.55' },
    ],
    gbms: [],
  },
  [COMPLETED_PERMIT]: {
    detail: permitDetail({
      permitNumber: COMPLETED_PERMIT,
      permitStatusCode: 'COM',
      permitStatusDescription: 'Complete',
      destinationCompanyName: 'Example Pacific Trading Co.',
      transportName: 'MV Sample Voyager',
      applicationDate: '2026-11-02',
      receivedDate: '2026-11-02',
      issueDate: '2026-11-10',
      estimatedShippingDate: '2026-11-19',
      permitVolume: 438,
      numberOfPieces: 297,
      invoiceNumber: 'LX26-00418',
    }),
    packages: [
      {
        packageNumber: 'EX-BOOM-01',
        volume: '438.0',
        length: '11.0',
        diameter: '16.5',
        scales: [
          {
            id: '7201',
            timberMark: 'EM0001',
            species: 'HE',
            grade: 'H',
            pieces: 181,
            volume: '262.80',
          },
          {
            id: '7202',
            timberMark: 'EM0002',
            species: 'CE',
            grade: 'J',
            pieces: 116,
            volume: '175.20',
          },
        ],
      },
    ],
    fees: [
      { amv: '$64.00', ewb: '$16,819.20', fil: '10%', mf: '6%', fee: '1782.84' },
      { amv: '$71.00', ewb: '$12,439.20', fil: '10%', mf: '6%', fee: '1318.56' },
    ],
    gbms: [
      {
        gbmsInvoiceNumber: '26004187',
        cancelledByInvoice: '',
        replacedByInvoice: '',
        invoiceAmount: '3101.40',
        printedDate: '2026-11-11',
        entryDate: '2026-11-10',
        updateDate: '2026-11-11',
      },
    ],
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

const permitFees = (permit: ManualPermit, scenario: ManualScenario) => {
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
          ministryUser: scenario === 'ministryAdmin',
          amv: fee?.amv ?? '',
          ewb: scenario === 'ministryAdmin' ? (fee?.ewb ?? '') : '',
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
// Federal applications

export const FEDERAL_APPLICATION = 47215

const FEDERAL_SEARCH_ROWS = [
  [
    FEDERAL_APPLICATION,
    'NX-26-0412',
    'Approved',
    OWN_CLIENT,
    'Surplus',
    '2026-11-03',
    '2026-11-18',
  ],
  [47216, 'NX-26-0419', 'New', SECOND_CLIENT, 'Surplus', '2026-11-12', '2026-12-02'],
  [47211, 'NX-26-0377', 'Rejected', THIRD_CLIENT, 'Economic', '2026-10-14', '2026-10-21'],
  [47208, 'NX-26-0351', 'Approved', OWN_CLIENT, 'Utilization', '2026-10-01', '2026-10-07'],
  [47203, 'NX-26-0318', 'Withdrawn', SECOND_CLIENT, 'Surplus', '2026-09-15', '2026-09-23'],
].map(
  ([
    applicationNumber,
    federalApplicationNumber,
    status,
    client,
    reason,
    receivedDate,
    listingDate,
  ]) => ({
    applicationNumber,
    federalApplicationNumber,
    status,
    client,
    reason,
    receivedDate,
    listingDate,
  }),
)

const FEDERAL_PACKAGE_SCALES: Record<string, ManualApplication['packages'][string]['scales']> = {
  'NX-BOOM-12': [
    {
      id: '7401',
      timberMark: 'EM0003',
      species: 'HE',
      grade: 'H',
      pieces: 266,
      volume: '431.60',
      permitted: false,
    },
    {
      id: '7402',
      timberMark: 'EM0003',
      species: 'CE',
      grade: 'I',
      pieces: 172,
      volume: '288.40',
      permitted: false,
    },
  ],
}

const federalApplicationDetail = (): FederalApplicationDetail => {
  const owner = CLIENTS[OWN_CLIENT]
  return {
    applicationNumber: FEDERAL_APPLICATION,
    federalApplicationNumber: 'NX-26-0412',
    statusCode: 'APP',
    statusDescription: 'Approved',
    ownerClientNumber: OWN_CLIENT,
    ownerClientLocationCode: '00',
    ownerApplicantType: 'O',
    ownerContactName: 'Jordan Sample',
    ownerCompanyName: owner.companyName,
    ownerClientContext: {
      address: owner.address,
      city: owner.city,
      province: 'BC',
      postalCode: owner.postalCode,
      country: 'Canada',
      phone: owner.phone,
      fax: null,
      email: owner.email,
    },
    agentClientNumber: null,
    agentClientLocationCode: null,
    agentApplicantType: null,
    agentContactName: null,
    agentCompanyName: null,
    agentClientContext: null,
    exemptionNumber: null,
    exemptionType: null,
    exemptionReason: 'Surplus',
    region: 'South Coast',
    orgUnitNumber: 1909,
    productType: 'Harvested Timber',
    applicationDate: '2026-11-03',
    receivedDate: '2026-11-03',
    listingDate: '2026-11-18',
    termDays: 180,
    logLocation: 'Log sort at Example Arm',
    ageClass: 'Second Growth',
    averageLogVolume: 1.6,
    applicationVolume: 720,
    endUse: 'HE/CE SAWLOG',
    author: 'SERVICE\\NEXCOL',
    readOnly: false,
    locked: false,
    lockHeldByCurrentUser: false,
    lockedBy: null,
    lockMessage: null,
    packages: ['NX-BOOM-12'],
    remarks: [],
    offers: [],
    federalPermit: null,
  }
}

// ---------------------------------------------------------------------------
// Reports and administration

const all = option('', 'All')

const REPORT_OPTIONS = {
  currentSchedules: CURRENT_SCHEDULES,
  defaultRegion: '',
  regions: REGIONS,
  reportJurisdictions: [all, option('P', 'Provincial'), option('F', 'Federal')],
  biweeklyJurisdictions: [all, option('P', 'Provincial'), option('F', 'Federal')],
  teacJurisdictions: [option('P', 'Provincial'), option('F', 'Federal')],
  exemptionTypes: [all, ...EXEMPTION_TYPES],
  tenureExemptionTypes: [all, ...EXEMPTION_TYPES],
  exemptionReasons: [all, ...EXEMPTION_REASONS],
  exemptionStatuses: [all, ...EXEMPTION_STATUSES],
  growthTypes: [all, ...GROWTH_TYPES],
  permitStatuses: [all, ...PERMIT_STATUSES],
  destinationCountries: [all, ...SHIPPING_REFERENCE_OPTIONS.countries],
  allDestinationCountries: SHIPPING_REFERENCE_OPTIONS.countries,
  portsOfExport: [all, ...SHIPPING_REFERENCE_OPTIONS.ports],
}

const feePolicy = (id: string, effectiveDate: string, orgUnitNo: string, percentage: string) => {
  const region = REGIONS.find((item) => item.code === orgUnitNo)
  return {
    id,
    effectiveDate,
    orgUnitNo,
    orgUnitCode: orgUnitNo === '1909' ? 'RSC' : 'RWC',
    orgUnitName: `${region?.name ?? ''} Natural Resource Region`,
    policyPercentage: percentage,
    entryUserId: 'IDIR\\JSAMPLE',
    entryTimestamp: '2026-03-02',
    updateUserId: 'IDIR\\JSAMPLE',
    updateTimestamp: '2026-03-02',
  }
}

const FEE_POLICIES = [
  feePolicy('5', '2027-04-01', '1909', '8'),
  feePolicy('4', '2026-04-01', '1910', '6'),
  feePolicy('3', '2026-04-01', '1909', '6'),
  feePolicy('2', '2025-04-01', '1910', '4'),
  feePolicy('1', '2025-04-01', '1909', '4'),
]

const AMV_SPECIES = ['BA', 'HE', 'CE', 'CY', 'FI', 'SP', 'WH']
const AMV_GRADES = ['B', 'C', 'D', 'F', 'H', 'I', 'J', 'U', 'X', 'Y']

const amvValue = (species: number, grade: number, bump: number) =>
  Math.round((180 - grade * 14 - species * 6 + bump) * 100) / 100

const amvRows = (effectiveDate: string, bump: number) =>
  AMV_SPECIES.flatMap((species, speciesIndex) =>
    AMV_GRADES.map((grade, gradeIndex) => ({
      species,
      grade,
      growthIndicator: 'S',
      retrievalDate: effectiveDate,
      updateDate: effectiveDate,
      currentValue: Math.max(amvValue(speciesIndex, gradeIndex, bump), 12),
      newValue: null,
      returnCode: null,
    })),
  )

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
  { method: 'GET', path: /^\/lexis\/admin\/notifications$/, respond: () => ADMIN_NOTIFICATIONS },
  {
    method: 'GET',
    path: /^\/lexis\/admin\/notifications\/audience-roles$/,
    respond: () => ({
      roles: [
        'ADMIN',
        'READ_ONLY',
        'APPLICATION_APPROVER',
        'EXEMPTION_APPROVER',
        'PROVINCIAL_SUBMITTER',
      ],
    }),
  },
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
      const scales =
        packageFor(packageNumber)?.extra.scales ?? FEDERAL_PACKAGE_SCALES[packageNumber]
      // Every sample record is coast scale.
      return scales?.map((scale) => ({ ...scale, cascadeSplitCode: 'W' }))
    },
  },
  {
    method: 'GET',
    path: /^\/lexis\/application-reviews\/search\/options$/,
    respond: () => ({
      productTypes: PRODUCT_TYPES,
      regions: REGIONS,
      reviewStatuses: APPLICATION_STATUSES.filter((status) =>
        ['APP', 'REJ', 'WDN'].includes(status.code),
      ),
    }),
  },
  {
    method: 'GET',
    path: /^\/lexis\/application-reviews\/search$/,
    respond: () => ({ results: REVIEW_QUEUE, total: REVIEW_QUEUE.length, page: 0, size: 100 }),
  },
  {
    method: 'GET',
    path: /^\/lexis\/application-reviews\/search\/count$/,
    respond: () => ({ total: REVIEW_QUEUE.length }),
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
    respond: (r, m) => (Number(m[1]) === MAIN_OFFER ? offerDetail(r.scenario) : undefined),
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
    path: /^\/lexis\/rpc\/exemption-details\/approval-recipients$/,
    respond: (r) =>
      (r.query.get('exemptionNumbers') ?? '')
        .split(',')
        .filter((exemptionNumber) => exemptionFor(exemptionNumber))
        .map((exemptionNumber) => {
          const owner = CLIENTS[exemptionFor(exemptionNumber)?.detail.ownerClientNumber ?? '']
          return {
            exemptionNumber,
            ownerEmail: owner?.email ?? '',
            agentEmail: '',
            agentApplicable: false,
            sendable: true,
            message: '',
          }
        }),
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
      return permit && permitFees(permit, r.scenario)
    },
  },
  {
    method: 'GET',
    path: /^\/lexis\/shipping-reference-options$/,
    respond: () => SHIPPING_REFERENCE_OPTIONS,
  },
  {
    method: 'GET',
    path: /^\/lexis\/federal\/applications\/search\/options$/,
    respond: () => ({ applicationStatuses: APPLICATION_STATUSES }),
  },
  {
    method: 'GET',
    path: /^\/lexis\/federal\/applications\/search$/,
    respond: () => ({
      results: FEDERAL_SEARCH_ROWS,
      total: FEDERAL_SEARCH_ROWS.length,
      page: 0,
      size: 10,
    }),
  },
  {
    method: 'GET',
    path: /^\/lexis\/federal\/applications\/search\/count$/,
    respond: () => ({ total: FEDERAL_SEARCH_ROWS.length }),
  },
  {
    method: 'GET',
    path: /^\/lexis\/federal\/applications\/(\d+)$/,
    respond: (_r, m) =>
      Number(m[1]) === FEDERAL_APPLICATION ? federalApplicationDetail() : undefined,
  },
  {
    method: 'GET',
    path: /^\/lexis\/federal\/applications\/(\d+)\/remarks$/,
    respond: (_r, m) =>
      Number(m[1]) === FEDERAL_APPLICATION
        ? [
            {
              remarkId: 1,
              remark: 'Approved for the Nov 18, 2026 advertising list.',
              user: 'IDIR\\JSAMPLE',
              date: '2026-11-04T10:15:00',
            },
          ]
        : undefined,
  },
  { method: 'GET', path: /^\/lexis\/reports\/options$/, respond: () => REPORT_OPTIONS },
  {
    method: 'GET',
    path: /^\/lexis\/admin\/policies\/fee$/,
    respond: () => ({ rows: FEE_POLICIES, total: FEE_POLICIES.length, page: 0, size: 100 }),
  },
  {
    method: 'GET',
    path: /^\/lexis\/rtm\/emslogamv\/last-saved$/,
    respond: () => ({ savedBy: 'IDIR\\JSAMPLE', savedAt: '2026-11-20T14:32:00' }),
  },
  {
    method: 'GET',
    path: /^\/lexis\/rtm\/emslogamv$/,
    respond: (r) =>
      r.query.get('latestBeforeDate')
        ? amvRows('2026-11-01', 0)
        : amvRows(
            r.query.get('retrievalDate') ?? '',
            r.query.get('retrievalDate') === '2026-12-01' ? 4 : 0,
          ),
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
