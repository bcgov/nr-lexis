import {
  expect,
  type APIResponse,
  type BrowserContext,
  type Locator,
  type Page,
  test,
} from '@playwright/test'
import {
  collectApiServerErrors,
  deleteWithCsrf,
  expectAccessiblePage,
  expectInvalidApplicationCreateValidation,
  fetchSessionCapabilities,
  getWithAuth,
  hasIdirCredentials,
  loginWithIdir,
  postWithCsrf,
  putWithCsrf,
  redactedTextSnippet,
} from './utils/regression-auth'
import { E2E_BASE_URL } from './utils'
import { formatBusinessIsoDate } from '../src/utils/date'

const sideNavSection = (name: string) =>
  `.csp-side-nav__section:has(.csp-side-nav__category-text:text-is("${name}"))`

const tableRowBackgrounds = (row: Locator): Promise<string[]> =>
  row.evaluate((element) =>
    Array.from(element.querySelectorAll('td'), (cell) => getComputedStyle(cell).backgroundColor),
  )

const expectFsptsUploadLayout = async (page: Page): Promise<void> => {
  const metrics = await page.evaluate(() => {
    const rect = (selector: string) => {
      const element = document.querySelector(selector)
      if (!element) {
        return null
      }
      const bounds = element.getBoundingClientRect()
      return {
        left: bounds.left,
        right: bounds.right,
        height: bounds.height,
      }
    }

    return {
      root: rect('.admin-upload-fspts-page'),
      header: rect('.admin-upload-fspts-header'),
      progress: rect('.admin-upload-fspts-header .admin-upload-progress'),
      content: rect('.admin-upload-fspts-content'),
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }
  })

  expect(metrics.root).not.toBeNull()
  expect(metrics.header).not.toBeNull()
  expect(metrics.progress).not.toBeNull()
  expect(metrics.content).not.toBeNull()

  const root = metrics.root!
  const header = metrics.header!
  const progress = metrics.progress!
  const content = metrics.content!

  expect(Math.abs(header.left - root.left)).toBeLessThanOrEqual(1)
  expect(Math.abs(header.right - root.right)).toBeLessThanOrEqual(1)
  expect(Math.abs(progress.left - root.left)).toBeLessThanOrEqual(1)
  expect(Math.abs(progress.right - root.right)).toBeLessThanOrEqual(1)
  expect(Math.abs(content.left - root.left)).toBeLessThanOrEqual(1)
  expect(Math.abs(content.right - root.right)).toBeLessThanOrEqual(1)
  expect(header.height).toBeLessThanOrEqual(220)
  expect(metrics.scrollWidth).toBe(metrics.clientWidth)
}

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.map((item) => String(item)) : []

const hasAdminRole = (roles: string[]): boolean =>
  roles.some((role) => role === 'ADMIN' || role === 'LEXIS_ADMIN')

const hasGrantedAction = (actions: string[], action: string): boolean => {
  const normalizedAction = action.toLowerCase().replace(/^\//, '')
  return actions.some((item) => item.toLowerCase().replace(/^\//, '') === normalizedAction)
}

const asRecordArray = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === 'object' && !Array.isArray(item),
      )
    : []

const asRecord = (value: unknown): Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}

const optionCode = (option: Record<string, unknown>): string => String(option.code ?? '').trim()
const optionName = (option: Record<string, unknown>): string => String(option.name ?? '').trim()

const isoDate = (date: Date): string => date.toISOString().slice(0, 10)

const addUtcDays = (date: Date, days: number): Date => {
  const next = new Date(date.getTime())
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

const scheduleRequestForAdvertisingDate = (advertisingDate: string): ExportScheduleRequest => {
  const date = new Date(`${advertisingDate}T00:00:00.000Z`)
  return {
    advertisingDate,
    applicationReceiptDate: advertisingDate,
    offerReceiptDate: isoDate(addUtcDays(date, 14)),
    offerEndDate: isoDate(addUtcDays(date, 43)),
    offerWithdrawalDate: isoDate(addUtcDays(date, 33)),
    teacMeetingDate: isoDate(addUtcDays(date, 36)),
  }
}

const uniqueRegressionScheduleRequests = (
  latestAdvertisingDate: string,
  attempt = 0,
): {
  createRequest: ExportScheduleRequest
  updateRequest: ExportScheduleRequest
} => {
  const latestDate = new Date(`${latestAdvertisingDate}T00:00:00.000Z`)
  const createDate = isoDate(addUtcDays(latestDate, 7 + attempt * 14))
  const updateDate = isoDate(addUtcDays(latestDate, 14 + attempt * 14))

  return {
    createRequest: scheduleRequestForAdvertisingDate(createDate),
    updateRequest: scheduleRequestForAdvertisingDate(updateDate),
  }
}

const safeUrlForLog = (rawUrl: string): string => {
  try {
    const url = new URL(rawUrl)
    return `${url.origin}${url.pathname}`
  } catch {
    return '[unparseable-url]'
  }
}

const redirectExternalLogoutToLoginShell = async (page: Page): Promise<void> => {
  const logoutReturnUrl = `${new URL(E2E_BASE_URL).origin}/`

  await page.route(/https:\/\/[^/]*amazoncognito\.com\/(?:logout|error).*/i, async (route) => {
    await route.fulfill({
      status: 302,
      headers: {
        location: logoutReturnUrl,
      },
      body: '',
    })
  })
}

const isSafeCredentialedRegressionBaseUrl = (rawUrl: string): boolean => {
  try {
    const hostname = new URL(rawUrl).hostname.toLowerCase()
    return (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '[::1]' ||
      hostname === 'nr-lexis-dev.apps.gold.devops.gov.bc.ca' ||
      hostname === 'nr-lexis-test.apps.gold.devops.gov.bc.ca' ||
      /^nr-lexis-\d+\.apps\.gold\.devops\.gov\.bc\.ca$/.test(hostname)
    )
  } catch {
    return false
  }
}

const isSharedTestRegressionBaseUrl = (rawUrl: string): boolean => {
  try {
    return new URL(rawUrl).hostname.toLowerCase() === 'nr-lexis-test.apps.gold.devops.gov.bc.ca'
  } catch {
    return false
  }
}

type ReviewStatusResponse = {
  updated?: boolean
  valid?: boolean
  statusCode?: string | null
  remark?: string | null
  message?: string | null
}

type ExportScheduleMutationResponse = {
  success?: boolean
  message?: string | null
  schedule?: unknown
}

type ExportScheduleRequest = {
  advertisingDate: string
  applicationReceiptDate: string
  offerReceiptDate: string
  offerEndDate: string
  offerWithdrawalDate: string
  teacMeetingDate: string
}

type ApplicationSubmissionResponse = {
  status?: string
  message?: string | null
  applicationNumber?: number | null
  packageNumber?: string | null
  scaleRows?: number
  errors?: unknown
}

type ApplicationPersistenceResponse = {
  valid?: boolean
  message?: string | null
  applicationNumber?: number | null
  errors?: unknown
  warnings?: unknown
}

type ApplicationSummaryResponse = {
  applicationNumber?: number | null
  applicationDate?: string | null
  termDays?: number | null
  receivedDate?: string | null
  applicationVolume?: number | null
  averageLogVolume?: number | null
  productLocation?: string | null
  exportScheduleId?: number | null
  agentClientNumber?: string | null
  agentClientLocationCode?: string | null
  ownerClientNumber?: string | null
  ownerClientLocationCode?: string | null
  exemptionReasonCode?: string | null
  applicationStatusCode?: string | null
  applicantTypeCode?: string | null
  orgUnitNumber?: number | null
  productTypeCode?: string | null
  jurisdictionCode?: string | null
  growthTypeCode?: string | null
  agentContactName?: string | null
  ownerContactName?: string | null
  oicIndicator?: string | null
}

type OfferPersistenceResponse = {
  success?: boolean
  message?: string | null
  applicationNumber?: number | null
  exportPurchaseOfferNumber?: number | null
  errors?: unknown
  warnings?: unknown
}

type ExemptionPreviewResponse = {
  valid?: boolean
  exemptionTypeCode?: string | null
  exemptionStatusCode?: string | null
  approvedVolume?: string | null
  expiryDate?: string | null
  applicationNumbers?: unknown
  errors?: unknown
}

type ExemptionPersistenceResponse = {
  success?: boolean
  message?: string | null
  exemptionNumber?: string | null
  errors?: unknown
  warnings?: unknown
}

type ExemptionApprovalResponse = {
  success?: boolean
  valid?: boolean
  errorMessage?: string | null
  errors?: unknown
  warnings?: unknown
}

type RelationshipMutationResponse = {
  success?: boolean
  message?: string | null
  errors?: unknown
  warnings?: unknown
}

type ExemptionApplicationsResponse = {
  applications?: unknown
}

type PermitMutationResponse = RelationshipMutationResponse & {
  permitNumber?: number | string | null
  permitStatus?: string | null
}

type ShippingReferenceOptionsResponse = {
  countries?: unknown
  transportTypes?: unknown
  ports?: unknown
}

type LexisUploadResponse = {
  uploadType?: string
  fileName?: string | null
  fileSize?: number
  status?: string
  message?: string | null
}

type RegressionUploadFile = {
  name: string
  mimeType: string
  buffer: Buffer
}

type PackageScaleResponse = {
  id?: string | null
  scaleId?: string | null
  scaleDetailId?: string | null
}

type DeleteResponse = {
  success?: boolean
}

type ApplicationReviewSearchOptionsResponse = {
  productTypes?: unknown
  regions?: unknown
  reviewStatuses?: unknown
}

type ApplicationReviewSearchResponse = {
  results?: unknown
  total?: number
  page?: number
  size?: number
}

type ApplicationReviewPreviewResponse = {
  results?: unknown
  hasNext?: boolean
  page?: number
  size?: number
}

type SearchCountResponse = {
  total?: number
}

type SessionActionAccessResponse = {
  authenticated?: boolean
  action?: string
  granted?: boolean
}

type GenericSearchResponse = {
  results?: unknown
  total?: number
  page?: number
  size?: number
}

type GenericOptionsResponse = Record<string, unknown>
type ReferenceDataResponse = unknown[]

type JsonWithStatus<T> = {
  status: number
  payload: T
}

type VersionedJson<T> = {
  payload: T
  version: string
}

type CleanupHandle = {
  complete: () => void
}

class RegressionCleanupStack {
  private readonly tasks: Array<{
    label: string
    active: boolean
    cleanup: () => Promise<void>
  }> = []

  defer(label: string, cleanup: () => Promise<void>): CleanupHandle {
    const task = { label, active: true, cleanup }
    this.tasks.push(task)
    return {
      complete: () => {
        task.active = false
      },
    }
  }

  async run(): Promise<Error[]> {
    const failures: Error[] = []
    for (const task of [...this.tasks].reverse()) {
      if (!task.active) {
        continue
      }
      try {
        await task.cleanup()
        task.active = false
      } catch (error) {
        failures.push(
          new Error(`${task.label}: ${error instanceof Error ? error.message : String(error)}`, {
            cause: error,
          }),
        )
      }
    }
    return failures
  }
}

const throwRegressionFailures = (summary: string, failures: Error[]): void => {
  if (failures.length === 0) {
    return
  }
  if (failures.length === 1) {
    throw failures[0]
  }

  const details = failures.map((failure, index) => `${index + 1}. ${failure.message}`).join('\n')
  throw new Error(`${summary}\n${details}`, {
    cause: new AggregateError(failures, summary),
  })
}

const missingApplicationNumber = '999999999'
const virusScanRejectionMessage = 'The uploaded file failed virus scanning.'
const regressionClientEmail = 'lexis-regression@example.test'
const naturalResourceRegionCodes = ['1903', '1904', '1905', '1906', '1907', '1908', '1909', '1910']
const sessionExpiredEventName = 'lexis:session-expired'
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/
const landingSubtitle = 'Create and manage applications, view offers and permits'
const advertisingListReportEndpoint = '/api/lexis/reports/biweeklyListing'
const recordVersionHeader = 'X-Lexis-Record-Version'
const regressionEndUseCode = 'PL'
const regressionSpeciesCode = 'HE'
const regressionOwnerClientNumber = process.env.E2E_REGRESSION_CLIENT_NUMBER?.trim() || '00001074'
const regressionOwnerClientLocationCode =
  process.env.E2E_REGRESSION_CLIENT_LOCATION_CODE?.trim() || '03'
const regressionLegacyRegionCode =
  process.env.E2E_REGRESSION_LEGACY_REGION_CODE?.trim().toUpperCase() || 'RSC'
const regressionTimberMark = process.env.E2E_REGRESSION_TIMBER_MARK?.trim().toUpperCase() || 'NCHWP'

const expectNaturalResourceRegions = (value: unknown, source: string): void => {
  const regions = asRecordArray(value)
  const codes = regions.map(optionCode).sort()

  expect(codes, `${source} should expose only the eight natural resource regions`).toEqual(
    naturalResourceRegionCodes,
  )
  for (const region of regions) {
    expect(optionName(region), `${source} region names should be explicit`).toContain(
      'Natural Resource Region',
    )
  }
}

const expectFutureScheduleOptions = (
  schedules: Record<string, unknown>[],
  source: string,
): void => {
  const today = formatBusinessIsoDate()

  expect(
    schedules.length,
    `${source} should expose at least one future list date`,
  ).toBeGreaterThanOrEqual(1)

  for (const schedule of schedules) {
    const scheduleDate = optionName(schedule)
    expect(scheduleDate, `${source} schedule names should be ISO dates`).toMatch(isoDatePattern)
    expect(scheduleDate >= today, `${source} should not expose previous list dates`).toBe(true)
  }
}

const expectApplicationScheduleOptions = (value: unknown, source: string): void => {
  const schedules = asRecordArray(value)

  expect(
    schedules.length,
    `${source} should include blank plus dated schedules`,
  ).toBeGreaterThanOrEqual(2)
  const blankSchedule = schedules[schedules.length - 1]
  expect(optionCode(blankSchedule), `${source} last schedule option should be blank`).toBe('')
  expect(optionName(blankSchedule), `${source} last schedule option should be labeled Blank`).toBe(
    'Blank',
  )
  for (const schedule of schedules.filter((candidate) => optionCode(candidate))) {
    expect(optionName(schedule), `${source} schedule names should be ISO dates`).toMatch(
      isoDatePattern,
    )
  }
}

const expectReportScheduleOptions = (value: unknown, source: string): void => {
  const schedules = asRecordArray(value)
  const today = formatBusinessIsoDate()

  expect(schedules, `${source} should expose the current and next list boundaries`).toHaveLength(2)
  expect(
    schedules.every((schedule) => optionCode(schedule)),
    `${source} should expose dated schedules only`,
  ).toBe(true)
  const scheduleDates = schedules.map(optionName)
  for (const scheduleDate of scheduleDates) {
    expect(scheduleDate, `${source} schedule names should be ISO dates`).toMatch(isoDatePattern)
  }
  expect(
    scheduleDates[0] <= today,
    `${source} first boundary should start the current reporting period`,
  ).toBe(true)
  expect(
    scheduleDates[1] > today,
    `${source} second boundary should start the next reporting period`,
  ).toBe(true)
  expect(
    scheduleDates[0] < scheduleDates[1],
    `${source} schedule boundaries should be ascending`,
  ).toBe(true)
}

const expectLoginShell = async (page: Page, source: string): Promise<void> => {
  const baseOrigin = new URL(E2E_BASE_URL).origin

  try {
    await expect(page.getByRole('button', { name: /log in with idir/i })).toBeVisible({
      timeout: 60_000,
    })
  } catch (error) {
    const currentUrl = page.url()
    if (/amazoncognito\.com\/error/i.test(currentUrl)) {
      throw new Error(`${source} landed on a Cognito error page: ${safeUrlForLog(currentUrl)}`)
    }
    if (/loginproxy\.gov\.bc\.ca/i.test(currentUrl)) {
      throw new Error(
        `${source} did not return from LoginProxy to the LEXIS login shell: ${safeUrlForLog(currentUrl)}`,
      )
    }
    if (currentUrl.startsWith(`${baseOrigin}/unauthorized`)) {
      throw new Error(
        `${source} landed on the LEXIS unauthorized page: ${safeUrlForLog(currentUrl)}`,
      )
    }
    throw error
  }

  expect(new URL(page.url()).origin).toBe(baseOrigin)
  await expect(page.getByRole('button', { name: /log in with business bceid/i })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Welcome to LEXIS' })).toBeVisible()
  await expect(page.getByText(landingSubtitle, { exact: true })).toBeVisible()
  await expect(page.getByAltText('Government of British Columbia')).toBeVisible()
  await expect(page.locator('.landing-img')).toBeVisible()
}

const expectLogoutRoundTrip = async (
  page: Page,
  source: string,
  trigger: () => Promise<unknown>,
): Promise<void> => {
  const baseOrigin = new URL(E2E_BASE_URL).origin

  await Promise.all([
    page.waitForURL((url) => url.origin !== baseOrigin, { timeout: 30_000 }),
    trigger(),
  ])
  await expectLoginShell(page, source)
}

const uniqueRegressionPackageNumber = (): string => {
  const timestamp = Date.now().toString(36).toUpperCase().slice(-7)
  const suffix = Math.random()
    .toString(36)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 4)
  return `E2E-${timestamp}-${suffix}`
}

const validateRegressionFixtureConfig = (): void => {
  const invalidNames: string[] = []
  if (!/^\d{8}$/.test(regressionOwnerClientNumber)) {
    invalidNames.push('E2E_REGRESSION_CLIENT_NUMBER')
  }
  if (!/^[A-Z0-9]{2}$/i.test(regressionOwnerClientLocationCode)) {
    invalidNames.push('E2E_REGRESSION_CLIENT_LOCATION_CODE')
  }
  if (!/^[A-Z0-9]{3}$/.test(regressionLegacyRegionCode)) {
    invalidNames.push('E2E_REGRESSION_LEGACY_REGION_CODE')
  }
  if (!/^[A-Z0-9 -]{1,10}$/.test(regressionTimberMark)) {
    invalidNames.push('E2E_REGRESSION_TIMBER_MARK')
  }
  if (invalidNames.length > 0) {
    throw new Error(`Invalid TEST regression fixture configuration: ${invalidNames.join(', ')}`)
  }
}

const regressionSubmissionXml = (
  packageNumber: string,
): string => `<?xml version="1.0" encoding="UTF-8"?>
<esf:ESFSubmission xmlns:lexis="http://www.for.gov.bc.ca/schema/lexis" xmlns:esf="http://www.for.gov.bc.ca/schema/esf" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.for.gov.bc.ca/schema/esf http://www.for.gov.bc.ca/schema/esf/1/xsd/MOF/esf-submission.xsd http://www.for.gov.bc.ca/schema/lexis http://www.for.gov.bc.ca/schema/lexis/2/xsd/MOF/mof-lexis.xsd">
  <esf:submissionContent>
    <lexis:LexisSubmission>
      <lexis:applicant>
        <lexis:applicantDetails>
          <lexis:clientNumber>${regressionOwnerClientNumber}</lexis:clientNumber>
          <lexis:clientLocnCode>${regressionOwnerClientLocationCode}</lexis:clientLocnCode>
          <lexis:name>LEXIS E2E REGRESSION</lexis:name>
        </lexis:applicantDetails>
        <lexis:applicantContact>
          <lexis:contactSurname>REGRESSION</lexis:contactSurname>
          <lexis:contactFirstname>E2E</lexis:contactFirstname>
        </lexis:applicantContact>
      </lexis:applicant>
      <lexis:applicationDetail>
        <lexis:jurisdictionCode>P</lexis:jurisdictionCode>
        <lexis:bcForestRegionCode>${regressionLegacyRegionCode}</lexis:bcForestRegionCode>
        <lexis:applStatusCode>A</lexis:applStatusCode>
        <lexis:exemptionRsnCde>S</lexis:exemptionRsnCde>
        <lexis:applicantTypeCode>O</lexis:applicantTypeCode>
      </lexis:applicationDetail>
      <lexis:productDetail>
        <lexis:productTypeCode>H</lexis:productTypeCode>
        <lexis:boomNumber>${packageNumber}</lexis:boomNumber>
        <lexis:speciesEndUseSort>HE/PL</lexis:speciesEndUseSort>
        <lexis:productLocation>LEXIS E2E REGRESSION</lexis:productLocation>
        <lexis:ageClass>S</lexis:ageClass>
        <lexis:avgLength>6.7</lexis:avgLength>
        <lexis:avgDiameter>12.8</lexis:avgDiameter>
        <lexis:harvestedTimber>
          <lexis:timberMark>${regressionTimberMark}</lexis:timberMark>
          <lexis:numberOfPieces>1500</lexis:numberOfPieces>
          <lexis:species>HE</lexis:species>
          <lexis:grade>H</lexis:grade>
          <lexis:quantityVolume>500</lexis:quantityVolume>
        </lexis:harvestedTimber>
        <lexis:harvestedTimber>
          <lexis:timberMark>${regressionTimberMark}</lexis:timberMark>
          <lexis:numberOfPieces>50</lexis:numberOfPieces>
          <lexis:species>HE</lexis:species>
          <lexis:grade>J</lexis:grade>
          <lexis:quantityVolume>24.5</lexis:quantityVolume>
        </lexis:harvestedTimber>
        <lexis:harvestedTimber>
          <lexis:timberMark>${regressionTimberMark}</lexis:timberMark>
          <lexis:numberOfPieces>1</lexis:numberOfPieces>
          <lexis:species>FI</lexis:species>
          <lexis:grade>J</lexis:grade>
          <lexis:quantityVolume>0.5</lexis:quantityVolume>
        </lexis:harvestedTimber>
      </lexis:productDetail>
    </lexis:LexisSubmission>
  </esf:submissionContent>
</esf:ESFSubmission>`

const antivirusTestPayloadHex =
  '58354f2150254041505b345c505a58353428505e2937434329377d2445494341522d5354414e444152442d414e544956495255532d544553542d46494c452124482b482a'

const antivirusTestPayload = (): Buffer => Buffer.from(antivirusTestPayloadHex, 'hex')

const antivirusTestPdfPayload = (): Buffer =>
  Buffer.concat([
    Buffer.from(
      `%PDF-1.7
1 0 obj
<< /Type /Catalog /Pages 2 0 R /Names << /EmbeddedFiles << /Names [(antivirus-test.com) 5 0 R] >> >> >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R >>
endobj
4 0 obj
<< /Length 0 >>
stream

endstream
endobj
5 0 obj
<< /Type /Filespec /F (antivirus-test.com) /EF << /F 6 0 R >> >>
endobj
6 0 obj
<< /Type /EmbeddedFile /Length ${antivirusTestPayload().length} >>
stream
`,
      'ascii',
    ),
    antivirusTestPayload(),
    Buffer.from(
      `
endstream
endobj
trailer
<< /Root 1 0 R >>
%%EOF
`,
      'ascii',
    ),
  ])

const infectedApplicationSubmissionFiles = (): RegressionUploadFile[] => [
  {
    name: 'antivirus-test-application-import.xml',
    mimeType: 'application/xml',
    buffer: antivirusTestPayload(),
  },
  {
    name: 'antivirus-test-application-import.geojson',
    mimeType: 'application/geo+json',
    buffer: antivirusTestPayload(),
  },
]

const infectedApplicationDocumentPdf = (): RegressionUploadFile => ({
  name: 'antivirus-test-application-upload.pdf',
  mimeType: 'application/pdf',
  buffer: antivirusTestPdfPayload(),
})

const adminNavigationSections: Array<{
  section: string
  links: string[]
}> = [
  {
    section: 'Provincial',
    links: [
      'Application review',
      'Create/Edit Application',
      'Upload',
      'Applications',
      'Create/Edit Exemption',
      'Exemptions',
      'Create/Edit Offer',
      'Offers',
      'Permits',
    ],
  },
  {
    section: 'Federal',
    links: ['Search'],
  },
  {
    section: 'Reports',
    links: [
      'Application Report',
      'Advertising List',
      'Offers Report',
      'TEAC Package',
      'Exemptions Report',
      'Permits Report',
      'Transport Report',
      'Species and Grade Report',
      'Fees Report',
      'Tenure Analysis',
    ],
  },
  {
    section: 'Admin',
    links: ['Fee Policy', 'Fee in Lieu', 'Export Schedule', 'Average Monthly Values'],
  },
]

const adminAccessiblePages: Array<[path: string, heading: RegExp]> = [
  ['/admin/policies/fee', /fee policy administration/i],
  ['/admin/policies/fil', /fee in lieu percent policy administration/i],
  ['/admin/schedules', /export schedule administration/i],
  ['/provincial/review', /provincial application review/i],
  ['/provincial/application/create', /create provincial application/i],
  ['/provincial/application/upload', /upload application submission/i],
  ['/provincial/application', /provincial application search/i],
  ['/federal', /federal application search/i],
  ['/reports', /application report/i],
  ['/admin/rtm/emslogamv', /average monthly values/i],
]

const reportAccessiblePages: Array<[path: string, heading: RegExp]> = [
  ['/reports/applicationReport', /application report/i],
  ['/reports/biweeklyListing', /advertising list/i],
  ['/reports/offerReport', /offer report/i],
  ['/reports/teacReport', /timber export advisory committee package report/i],
  ['/reports/exemptionReport', /exemption report/i],
  ['/reports/permitLedgerReport', /permit ledger report/i],
  ['/reports/transportReport', /transport report/i],
  ['/reports/speciesGradeReport', /species and grade report/i],
  ['/reports/feeReport', /fee report/i],
  ['/reports/tenureReport', /tenure analysis report/i],
]

const createWorkflowPages: Array<[path: string, heading: RegExp]> = [
  ['/provincial/application/create', /create provincial application/i],
  ['/provincial/exemption/create', /create exemption/i],
  ['/provincial/offers/create', /create provincial offer/i],
]

const regionFilterPages: Array<[path: string, heading: RegExp]> = [
  ['/provincial/review?region=1903,1908', /provincial application review/i],
  ['/provincial/application?region=1903,1908', /provincial application search/i],
  ['/provincial/exemption?region=1903,1908', /provincial exemption search/i],
  ['/provincial/offers?region=1903,1908', /provincial offers search/i],
  ['/provincial/permit?region=1903,1908', /provincial permit search/i],
]

const searchPageSizeContracts: Array<{
  source: string
  path: string
  params: Record<string, string>
}> = [
  {
    source: 'application review search',
    path: '/api/lexis/application-reviews/search',
    params: { applicationNumber: missingApplicationNumber },
  },
  {
    source: 'provincial application search',
    path: '/api/lexis/applications/search',
    params: { applicationNumber: missingApplicationNumber },
  },
  {
    source: 'federal application search',
    path: '/api/lexis/federal/applications/search',
    params: { applicationNumber: missingApplicationNumber },
  },
  {
    source: 'exemption search',
    path: '/api/lexis/exemptions/search',
    params: { exemptionNumber: 'LEXIS-E2E-MISSING' },
  },
  {
    source: 'purchase offer search',
    path: '/api/lexis/purchase-offers/search',
    params: { packageNumber: 'LEXIS-E2E-MISSING' },
  },
  {
    source: 'permit search',
    path: '/api/lexis/permits/search',
    params: { permitNumber: 'LEXIS-E2E-MISSING' },
  },
]

const searchDefaultPageSizePages: Array<{
  source: string
  pagePath: string
  heading: RegExp
  searchPath: string
}> = [
  {
    source: 'application review search',
    pagePath: `/provincial/review?applicationNumber=${missingApplicationNumber}`,
    heading: /provincial application review/i,
    searchPath: '/api/lexis/application-reviews/search',
  },
  {
    source: 'provincial application search',
    pagePath: `/provincial/application?applicationNumber=${missingApplicationNumber}`,
    heading: /provincial application search/i,
    searchPath: '/api/lexis/applications/search',
  },
  {
    source: 'federal application search',
    pagePath: `/federal?applicationNumber=${missingApplicationNumber}`,
    heading: /federal application search/i,
    searchPath: '/api/lexis/federal/applications/search',
  },
  {
    source: 'exemption search',
    pagePath: '/provincial/exemption?exemptionNumber=LEXIS-E2E-MISSING',
    heading: /provincial exemption search/i,
    searchPath: '/api/lexis/exemptions/search',
  },
  {
    source: 'purchase offer search',
    pagePath: '/provincial/offers?packageNumber=LEXIS-E2E-MISSING',
    heading: /provincial offers search/i,
    searchPath: '/api/lexis/purchase-offers/search',
  },
  {
    source: 'permit search',
    pagePath: '/provincial/permit?permitNumber=LEXIS-E2E-MISSING',
    heading: /provincial permit search/i,
    searchPath: '/api/lexis/permits/search',
  },
]

const requiredAdminActions = [
  '/lexisAgentAdmin',
  '/applicationSearch',
  'createApplication',
  'uploadApplicationSubmission',
  '/applicationsReview',
  '/federalApplicationSearch',
  '/applicationReport',
]

const representativeAdminActions = [
  ...requiredAdminActions,
  '/lexisPolicyAdmin',
  '/lexisFILAdmin',
  '/fileApplicationUpload',
  '/fileExemptionUpload',
  '/filePermitUpload',
  'createOffer',
  'savePermit',
  'mofrListing',
]

const expectAdminNavigation = async (page: Page): Promise<void> => {
  for (const { section, links } of adminNavigationSections) {
    const navSection = page.locator(sideNavSection(section))
    await expect(navSection, `${section} navigation section should be visible`).toBeVisible()
    await expect(
      navSection.getByRole('link'),
      `${section} navigation should not include extra links`,
    ).toHaveCount(links.length)

    for (const linkName of links) {
      await expect(
        navSection.getByRole('link', { name: linkName }),
        `${section} link "${linkName}" should be visible`,
      ).toBeVisible()
    }
  }
}

const readJsonResponse = async <T>(response: APIResponse, expectedStatus = 200): Promise<T> => {
  const text = await response.text()
  expect(response.status(), redactedTextSnippet(text)).toBe(expectedStatus)
  return JSON.parse(text) as T
}

const readJsonResponseWithStatuses = async <T>(
  response: APIResponse,
  expectedStatuses: number[],
): Promise<JsonWithStatus<T>> => {
  const text = await response.text()
  const status = response.status()
  expect(expectedStatuses, redactedTextSnippet(text)).toContain(status)
  return {
    status,
    payload: JSON.parse(text) as T,
  }
}

const expectStaleRecordResponse = (
  response: JsonWithStatus<Record<string, unknown>>,
  recordType: string,
  recordId: string,
): void => {
  expect(response.status).toBe(409)
  expect(response.payload.code).toBe('STALE_RECORD')
  expect(response.payload.recordType).toBe(recordType)
  expect(response.payload.recordId).toBe(recordId)
}

const requiredString = (value: unknown, label: string): string => {
  if (value === null || value === undefined || String(value).trim() === '') {
    throw new Error(`${label} was missing from the TEST regression record.`)
  }
  return String(value).trim()
}

const versionHeaders = (version: string): Record<string, string> => ({
  [recordVersionHeader]: version,
})

const readVersionedJson = async <T>(page: Page, path: string): Promise<VersionedJson<T>> => {
  const response = await getWithAuth(page, path)
  const payload = await readJsonResponse<T>(response)
  const version = response.headers()[recordVersionHeader.toLowerCase()]?.trim() ?? ''
  expect(version, `${path} should return ${recordVersionHeader}`).not.toBe('')
  return { payload, version }
}

const readPermitVersionedJson = async <T>(
  page: Page,
  permitNumber: number,
): Promise<VersionedJson<T>> => {
  const detailPath = `/api/lexis/permits/${permitNumber}`
  const editContextPath = '/api/lexis/rpc/permit-details/edit-context'
  const [detailResponse, editContextResponse] = await Promise.all([
    getWithAuth(page, detailPath),
    getWithAuth(page, editContextPath, {
      params: { permitNumber: String(permitNumber) },
    }),
  ])
  const payload = await readJsonResponse<T>(detailResponse)
  await readJsonResponse<Record<string, unknown>>(editContextResponse)
  const version = editContextResponse.headers()[recordVersionHeader.toLowerCase()]?.trim() ?? ''
  expect(version, `${editContextPath} should return ${recordVersionHeader}`).not.toBe('')
  return { payload, version }
}

const currentOfferSchedule = async (
  page: Page,
): Promise<{ scheduleId: string; advertisingDate: string; offerReceiptDate: string }> => {
  const schedulePage = await readJsonResponse<GenericSearchResponse>(
    await getWithAuth(page, '/api/lexis/admin/schedules', {
      params: {
        page: '0',
        size: '200',
      },
    }),
  )
  const today = formatBusinessIsoDate()
  const schedule = asRecordArray(schedulePage.results).find((candidate) => {
    const advertisingDate = String(candidate.advertisingDate ?? '').trim()
    const offerReceiptDate = String(candidate.offerReceiptDate ?? '').trim()
    return advertisingDate <= today && offerReceiptDate >= today
  })
  if (!schedule) {
    throw new Error(
      `TEST needs an existing export schedule with advertisingDate <= ${today} <= offerReceiptDate for the CRUD regression.`,
    )
  }
  return {
    scheduleId: requiredString(schedule.exportScheduleId, 'Export schedule ID'),
    advertisingDate: requiredString(schedule.advertisingDate, 'Export schedule advertising date'),
    offerReceiptDate: requiredString(
      schedule.offerReceiptDate,
      'Export schedule offer receipt date',
    ),
  }
}

const fetchApplicationSummary = async (
  page: Page,
  applicationNumber: number,
): Promise<ApplicationSummaryResponse> =>
  readJsonResponse<ApplicationSummaryResponse>(
    await getWithAuth(page, '/api/lexis/rpc/application-details/application-summary', {
      params: { applicationNumber: String(applicationNumber) },
    }),
  )

const applicationSummaryForm = (
  summary: ApplicationSummaryResponse,
  scheduleId: string,
  productLocation: string,
): Record<string, string> => ({
  applicationNumber: requiredString(summary.applicationNumber, 'Application number'),
  applicationDate: requiredString(summary.applicationDate, 'Application date'),
  receivedDate: requiredString(summary.receivedDate, 'Application received date'),
  termDays: requiredString(summary.termDays, 'Application term'),
  applicationVolume: requiredString(summary.applicationVolume, 'Application volume'),
  averageLogVolume: requiredString(summary.averageLogVolume, 'Average log volume'),
  exemptionReasonCode: requiredString(summary.exemptionReasonCode, 'Exemption reason'),
  productLocation,
  exportScheduleId: scheduleId,
  agentClientNumber: String(summary.agentClientNumber ?? ''),
  agentClientLocationCode: String(summary.agentClientLocationCode ?? ''),
  ownerClientNumber: requiredString(summary.ownerClientNumber, 'Owner client number'),
  ownerClientLocationCode: requiredString(summary.ownerClientLocationCode, 'Owner client location'),
  applicantType: requiredString(summary.applicantTypeCode, 'Applicant type'),
  orgUnitNumber: requiredString(summary.orgUnitNumber, 'Application organization'),
  productTypeCode: requiredString(summary.productTypeCode, 'Application product type'),
  growthTypeCode: requiredString(summary.growthTypeCode, 'Application growth type'),
  agentContactName: String(summary.agentContactName ?? ''),
  ownerContactName: requiredString(summary.ownerContactName, 'Owner contact'),
  oicIndicator: String(summary.oicIndicator ?? 'N'),
  applicationEndUseCode: regressionEndUseCode,
  applicationSelectedSpecies: regressionSpeciesCode,
})

const createApplicationForm = (
  template: ApplicationSummaryResponse,
  scheduleId: string,
  marker: string,
): Record<string, string> => ({
  applicationDate: formatBusinessIsoDate(),
  exemptionTerm: '30',
  dateReceived: formatBusinessIsoDate(),
  applicationVolume: '10',
  averageLogVolume: requiredString(template.averageLogVolume, 'Average log volume'),
  logLocation: marker,
  exportScheduleId: scheduleId,
  ownerApplicantType: 'O',
  ownerClientNumber: requiredString(template.ownerClientNumber, 'Owner client number'),
  ownerClientLocation: requiredString(template.ownerClientLocationCode, 'Owner client location'),
  ownerContactName: marker,
  exemptionReason: requiredString(template.exemptionReasonCode, 'Exemption reason'),
  region: requiredString(template.orgUnitNumber, 'Application organization'),
  productType: requiredString(template.productTypeCode, 'Application product type'),
  exportJurisdictionCode: 'P',
  ageClass: requiredString(template.growthTypeCode, 'Application growth type'),
  oicIndicator: 'N',
  applicationEndUseCode: regressionEndUseCode,
  applicationSelectedSpecies: regressionSpeciesCode,
  additionalRemarks: marker,
})

const rejectRegressionApplication = async (
  page: Page,
  applicationNumber: number,
  remark: string,
): Promise<void> => {
  const current = await readVersionedJson<Record<string, unknown>>(
    page,
    `/api/lexis/applications/${applicationNumber}`,
  )
  if (String(current.payload.applicationStatusCode ?? '').toUpperCase() === 'REJ') {
    return
  }
  const rejected = await readJsonResponse<ReviewStatusResponse>(
    await postWithCsrf(page, `/api/lexis/application-reviews/${applicationNumber}/status`, {
      headers: versionHeaders(current.version),
      data: {
        statusCode: 'REJ',
        remark,
        clientEmailAddress: regressionClientEmail,
      },
    }),
  )
  expect(rejected.valid).toBe(true)
  expect(rejected.updated).toBe(true)
  expect(rejected.statusCode).toBe('REJ')
}

const offerUpdateForm = (
  offerNumber: number,
  values: Record<string, string>,
): Record<string, string> => ({
  exportPurchaseOfferNumber: String(offerNumber),
  offerNumber: String(offerNumber),
  ...values,
})

const withdrawRegressionOffer = async (
  page: Page,
  offerNumber: number,
  marker: string,
): Promise<void> => {
  const current = await readVersionedJson<Record<string, unknown>>(
    page,
    `/api/lexis/purchase-offers/${offerNumber}`,
  )
  if (String(current.payload.offerWithdrawalDate ?? '').trim()) {
    return
  }
  const result = await readJsonResponse<OfferPersistenceResponse>(
    await postWithCsrf(page, '/api/lexis/rpc/offer-details/offer/update', {
      headers: versionHeaders(current.version),
      form: offerUpdateForm(offerNumber, {
        offerWithdrawalDate: formatBusinessIsoDate(),
        withdrawReason: `${marker} cleanup`,
      }),
    }),
  )
  expect(result.success).toBe(true)
  expect(asStringArray(result.errors)).toEqual([])
}

const exemptionUpdateForm = (
  detail: Record<string, unknown>,
  orgUnitNumber: string,
  values: Record<string, string> = {},
): Record<string, string> => ({
  exemptionNumber: requiredString(detail.exemptionNumber, 'Exemption number'),
  previousExemptionNumber: requiredString(detail.exemptionNumber, 'Previous exemption number'),
  approvedVolume: requiredString(detail.approvedVolume, 'Exemption approved volume'),
  approvalDate: String(detail.approvalDate ?? ''),
  expiryDate: requiredString(detail.expiryDate, 'Exemption expiry date'),
  otherConditions: String(detail.otherConditions ?? ''),
  exemptionTypeCode: requiredString(detail.exemptionTypeCode, 'Exemption type'),
  exemptionStatusCode: requiredString(detail.exemptionStatusCode, 'Exemption status'),
  region: orgUnitNumber,
  ...values,
})

const exemptionContainsApplication = async (
  page: Page,
  exemptionNumber: string,
  applicationNumber: number,
): Promise<boolean> => {
  const response = await readJsonResponse<ExemptionApplicationsResponse>(
    await getWithAuth(page, '/api/lexis/rpc/exemption-details/applications', {
      params: { exemptionNumber },
    }),
  )
  return asRecordArray(response.applications).some(
    (application) => Number(application.applicationNumber) === applicationNumber,
  )
}

const unlinkRegressionExemptionApplication = async (
  page: Page,
  exemptionNumber: string,
  applicationNumber: number,
): Promise<void> => {
  if (!(await exemptionContainsApplication(page, exemptionNumber, applicationNumber))) {
    return
  }
  const current = await readVersionedJson<Record<string, unknown>>(
    page,
    `/api/lexis/exemptions/${encodeURIComponent(exemptionNumber)}`,
  )
  const result = await readJsonResponse<RelationshipMutationResponse>(
    await deleteWithCsrf(page, '/api/lexis/rpc/exemption-details/application', {
      headers: versionHeaders(current.version),
      params: {
        applicationNumber: String(applicationNumber),
        exemptionNumber,
      },
    }),
  )
  expect(result.success).toBe(true)
  expect(asStringArray(result.errors)).toEqual([])
}

const linkRegressionExemptionApplication = async (
  page: Page,
  exemptionNumber: string,
  applicationNumber: number,
): Promise<void> => {
  if (await exemptionContainsApplication(page, exemptionNumber, applicationNumber)) {
    return
  }
  const current = await readVersionedJson<Record<string, unknown>>(
    page,
    `/api/lexis/exemptions/${encodeURIComponent(exemptionNumber)}`,
  )
  const result = await readJsonResponse<RelationshipMutationResponse>(
    await postWithCsrf(page, '/api/lexis/rpc/exemption-details/application', {
      headers: versionHeaders(current.version),
      form: {
        applicationNumber: String(applicationNumber),
        exemptionNumber,
      },
    }),
  )
  expect(result.success).toBe(true)
  expect(asStringArray(result.errors)).toEqual([])
}

const cancelRegressionExemption = async (
  page: Page,
  exemptionNumber: string,
  orgUnitNumber: string,
): Promise<void> => {
  const current = await readVersionedJson<Record<string, unknown>>(
    page,
    `/api/lexis/exemptions/${encodeURIComponent(exemptionNumber)}`,
  )
  if (String(current.payload.exemptionStatusCode ?? '').toUpperCase() === 'CAN') {
    return
  }
  const result = await readJsonResponse<ExemptionPersistenceResponse>(
    await postWithCsrf(page, '/api/lexis/rpc/exemption-details/exemption/update', {
      headers: versionHeaders(current.version),
      form: exemptionUpdateForm(current.payload, orgUnitNumber, {
        exemptionStatusCode: 'CAN',
      }),
    }),
  )
  expect(result.success).toBe(true)
  expect(asStringArray(result.errors)).toEqual([])
}

const shippingFixture = async (
  page: Page,
): Promise<{ transportType: string; portOfExport: string }> => {
  const options = await readJsonResponse<ShippingReferenceOptionsResponse>(
    await getWithAuth(page, '/api/lexis/shipping-reference-options'),
  )
  expect(asRecordArray(options.countries).some((country) => optionCode(country) === 'CA')).toBe(
    true,
  )
  const transportType = optionCode(asRecordArray(options.transportTypes)[0] ?? {})
  const portOfExport = optionCode(
    asRecordArray(options.ports).find((port) => optionCode(port) !== 'OT') ?? {},
  )
  expect(transportType, 'TEST needs an active transport type for permit regression.').not.toBe('')
  expect(portOfExport, 'TEST needs a non-Other port for permit regression.').not.toBe('')
  return { transportType, portOfExport }
}

const permitMutationForm = (
  permit: Record<string, unknown>,
  marker: string,
  shipping: { transportType: string; portOfExport: string },
  permitStatus?: string,
): Record<string, string> => ({
  permitNumber: String(permit.permitNumber ?? ''),
  permitStatus: permitStatus ?? String(permit.permitStatusCode ?? ''),
  permitIssueDate: String(permit.issueDate ?? ''),
  permitExpiryDate: String(permit.expiryDate ?? ''),
  permitRequestDate: String(permit.receivedDate ?? ''),
  exemptionNumber: String(permit.exemptionNumber ?? ''),
  permitReceiptNo: String(permit.receiptNumber ?? ''),
  permitRemarks: marker,
  permitTotalVolume: String(permit.permitVolume ?? ''),
  permitNumberOfPieces: String(permit.numberOfPieces ?? ''),
  oicPermitTotalPieces: '',
  oicPermitTotalVolume: '',
  orgUnitNumber: String(permit.orgUnitNumber ?? ''),
  ownerClientNumber: String(permit.ownerClientNumber ?? ''),
  ownerClientLocation: String(permit.ownerClientLocationCode ?? ''),
  agentClientNumber: String(permit.applicantClientNumber ?? ''),
  agentClientLocation: String(permit.agentClientLocationCode ?? ''),
  destinationCompanyName: 'LEXIS E2E REGRESSION',
  destinationCountry: 'CA',
  transportType: shipping.transportType,
  transportName: marker.slice(0, 26),
  estimatedShippingDate: formatBusinessIsoDate(),
  portOfExport: shipping.portOfExport,
  otherPortOfExport: '',
})

const permitMutationFailure = (result: PermitMutationResponse, fallback: string): string => {
  const details = [result.message, ...asStringArray(result.errors)]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
  return details.length > 0 ? details.join(' ') : fallback
}

const cancelRegressionPermit = async (
  page: Page,
  permitNumber: number,
  marker: string,
  shipping: { transportType: string; portOfExport: string },
): Promise<void> => {
  const current = await readPermitVersionedJson<Record<string, unknown>>(page, permitNumber)
  if (String(current.payload.permitStatusCode ?? '').toUpperCase() === 'CAN') {
    return
  }
  const result = await readJsonResponse<PermitMutationResponse>(
    await postWithCsrf(page, '/api/lexis/rpc/permit-details/update-permit', {
      headers: versionHeaders(current.version),
      form: permitMutationForm(current.payload, marker, shipping, 'CAN'),
    }),
  )
  expect(
    result.success,
    permitMutationFailure(result, `Permit ${permitNumber} cancellation returned success=false.`),
  ).toBe(true)
  expect(result.permitStatus).toBe('CAN')
  expect(asStringArray(result.errors)).toEqual([])
}

const permitContainsApplication = async (
  page: Page,
  permitNumber: number,
  applicationNumber: number,
): Promise<boolean> => {
  const response = await readJsonResponse<Record<string, unknown>>(
    await getWithAuth(page, '/api/lexis/rpc/permit-details/application-list', {
      params: { permitNumber: String(permitNumber) },
    }),
  )
  return asStringArray(response.applicationList).includes(String(applicationNumber))
}

const detachRegressionPermitApplication = async (
  page: Page,
  permitNumber: number,
  applicationNumber: number,
): Promise<void> => {
  if (!(await permitContainsApplication(page, permitNumber, applicationNumber))) {
    return
  }
  const current = await readPermitVersionedJson<Record<string, unknown>>(page, permitNumber)
  const result = await readJsonResponse<RelationshipMutationResponse>(
    await postWithCsrf(page, '/api/lexis/rpc/permit-details/remove-application-from-permit', {
      headers: versionHeaders(current.version),
      form: {
        permitNumber: String(permitNumber),
        applicationNumber: String(applicationNumber),
      },
    }),
  )
  expect(result.success).toBe(true)
  expect(asStringArray(result.errors)).toEqual([])
}

const latestExportScheduleAdvertisingDate = async (page: Page): Promise<string> => {
  const schedulePage = await readJsonResponse<GenericSearchResponse>(
    await getWithAuth(page, '/api/lexis/admin/schedules', {
      params: {
        page: '0',
        size: '200',
      },
    }),
  )
  const dates = asRecordArray(schedulePage.results)
    .map((schedule) => String(schedule.advertisingDate ?? '').trim())
    .filter((date) => isoDatePattern.test(date))
    .sort()

  expect(
    dates.length,
    'export schedule regression needs at least one existing schedule row',
  ).toBeGreaterThan(0)
  return dates[dates.length - 1]
}

const firstCurrentScheduleAdvertisingDate = async (page: Page): Promise<string> => {
  const reportOptions = await readJsonResponse<GenericOptionsResponse>(
    await getWithAuth(page, '/api/lexis/reports/options'),
  )
  const currentSchedules = asRecordArray(reportOptions.currentSchedules)
  expectReportScheduleOptions(currentSchedules, 'advertising list report generation')

  const scheduleDate = optionName(currentSchedules.find((schedule) => optionCode(schedule)) ?? {})
  expect(scheduleDate, 'advertising list report generation needs a dated current schedule').toMatch(
    isoDatePattern,
  )
  return scheduleDate
}

const postAdvertisingListReport = async (
  page: Page,
  format: 'PDF' | 'CSV',
): Promise<APIResponse> => {
  const advertisingDate = await firstCurrentScheduleAdvertisingDate(page)
  return postWithCsrf(page, advertisingListReportEndpoint, {
    data: {
      parameters: {
        fromDate: advertisingDate,
        toDate: advertisingDate,
      },
      format,
    },
  })
}

const readReportBody = async (response: APIResponse, source: string): Promise<Buffer> => {
  const body = await response.body()
  expect(response.status(), `${source}: ${redactedTextSnippet(body.toString('utf8'))}`).toBe(200)
  return body
}

const postRegressionSubmission = async (
  page: Page,
  path: string,
  packageNumber: string,
): Promise<ApplicationSubmissionResponse> => {
  return readJsonResponse<ApplicationSubmissionResponse>(
    await postWithCsrf(page, path, {
      multipart: {
        userReference: `E2E regression ${packageNumber}`,
        file: {
          name: `${packageNumber}.xml`,
          mimeType: 'application/xml',
          buffer: Buffer.from(regressionSubmissionXml(packageNumber), 'utf8'),
        },
      },
    }),
  )
}

const postRegressionApplicationSubmissionFile = async (
  page: Page,
  path: string,
  file: RegressionUploadFile,
): Promise<JsonWithStatus<ApplicationSubmissionResponse>> => {
  return readJsonResponseWithStatuses<ApplicationSubmissionResponse>(
    await postWithCsrf(page, path, {
      multipart: {
        userReference: 'E2E ClamAV scan',
        file,
      },
    }),
    [422],
  )
}

const postRegressionApplicationDocumentFile = async (
  page: Page,
  applicationNumber: number,
  file: RegressionUploadFile,
): Promise<JsonWithStatus<LexisUploadResponse>> => {
  return readJsonResponseWithStatuses<LexisUploadResponse>(
    await postWithCsrf(page, '/api/lexis/fileApplicationUpload', {
      multipart: {
        applicationNumber: String(applicationNumber),
        fileDescription: 'E2E ClamAV application document regression',
        file,
      },
    }),
    [422],
  )
}

const expectApplicationSubmissionVirusScanRejection = (
  response: JsonWithStatus<ApplicationSubmissionResponse>,
  source: string,
): void => {
  expect(response.status, `${source} should be rejected by ClamAV`).toBe(422)
  expect(response.payload.status).toBe('rejected')
  expect(response.payload.message ?? '').toContain(virusScanRejectionMessage)
  expect(asStringArray(response.payload.errors).join(' ')).toContain(virusScanRejectionMessage)
  expect(response.payload.applicationNumber ?? null).toBeNull()
  expect(response.payload.packageNumber ?? null).toBeNull()
  expect(response.payload.scaleRows ?? 0).toBe(0)
}

const expectApplicationDocumentVirusScanRejection = (
  response: JsonWithStatus<LexisUploadResponse>,
): void => {
  expect(response.status, 'application document upload should be rejected by ClamAV').toBe(422)
  expect(response.payload.uploadType).toBe('application')
  expect(response.payload.fileName).toBe('antivirus-test-application-upload.pdf')
  expect(response.payload.status).toBe('rejected')
  expect(response.payload.message ?? '').toContain(virusScanRejectionMessage)
}

const createRegressionExportSchedule = async (
  page: Page,
): Promise<{
  scheduleId: string
  createRequest: ExportScheduleRequest
  updateRequest: ExportScheduleRequest
  createdSchedule: Record<string, unknown>
}> => {
  const latestAdvertisingDate = await latestExportScheduleAdvertisingDate(page)
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const { createRequest, updateRequest } = uniqueRegressionScheduleRequests(
      latestAdvertisingDate,
      attempt,
    )
    const created = await readJsonResponseWithStatuses<ExportScheduleMutationResponse>(
      await postWithCsrf(page, '/api/lexis/admin/schedules', {
        data: createRequest,
      }),
      [200, 400],
    )

    if (created.status === 400) {
      const message = created.payload.message ?? ''
      if (!message.includes('A schedule already exists for that advertising date.')) {
        throw new Error(
          `Export schedule create failed for ${createRequest.advertisingDate}: ${message}`,
        )
      }
      continue
    }

    expect(created.payload.success).toBe(true)
    expect(created.payload.message ?? '').toContain('added')

    const createdSchedule = asRecord(created.payload.schedule)
    const scheduleId = String(createdSchedule.exportScheduleId ?? '').trim()
    expect(scheduleId).not.toBe('')

    return {
      scheduleId,
      createRequest,
      updateRequest,
      createdSchedule,
    }
  }

  throw new Error('Unable to find an unused future export schedule date for regression.')
}

const deleteRegressionExportSchedule = async (page: Page, scheduleId: string): Promise<void> => {
  const deleteResponse = await readJsonResponse<ExportScheduleMutationResponse>(
    await deleteWithCsrf(page, `/api/lexis/admin/schedules/${encodeURIComponent(scheduleId)}`),
  )
  expect(deleteResponse.success).toBe(true)
  expect(deleteResponse.message ?? '').toContain('deleted')
}

const cleanupRegressionPackage = async (
  page: Page,
  applicationNumber: number,
  packageNumber: string,
): Promise<void> => {
  const scales = await readJsonResponse<PackageScaleResponse[]>(
    await getWithAuth(page, '/api/lexis/rpc/application-details/package-scales', {
      params: { packageNumber },
    }),
  )

  for (const scale of scales) {
    const scaleId = String(scale.id ?? scale.scaleId ?? scale.scaleDetailId ?? '').trim()
    if (!scaleId) {
      continue
    }

    const application = await readVersionedJson<Record<string, unknown>>(
      page,
      `/api/lexis/applications/${applicationNumber}`,
    )
    const deleteScale = await readJsonResponse<DeleteResponse>(
      await deleteWithCsrf(page, '/api/lexis/rpc/application-details/scale', {
        headers: versionHeaders(application.version),
        params: {
          scaleId,
          applicationNumber: String(applicationNumber),
        },
      }),
    )
    expect(deleteScale.success, `Expected scale ${scaleId} cleanup to succeed`).toBe(true)
  }

  const application = await readVersionedJson<Record<string, unknown>>(
    page,
    `/api/lexis/applications/${applicationNumber}`,
  )
  const deletePackage = await readJsonResponse<DeleteResponse>(
    await deleteWithCsrf(page, '/api/lexis/rpc/application-details/package', {
      headers: versionHeaders(application.version),
      params: {
        packageNumber,
        applicationNumber: String(applicationNumber),
      },
    }),
  )
  expect(deletePackage.success, `Expected package ${packageNumber} cleanup to succeed`).toBe(true)
}

test.describe('TEST IDIR admin regression', () => {
  test.describe.configure({ retries: 0 })
  test.skip(!hasIdirCredentials(), 'IDIR e2e credentials are not configured.')

  let idirContext: BrowserContext | undefined
  let idirPage: Page | undefined

  const authenticatedIdirPage = async (): Promise<Page> => {
    if (!idirPage) {
      throw new Error('IDIR regression page was not initialized.')
    }
    await loginWithIdir(idirPage)
    return idirPage
  }

  test.beforeAll(async ({ browser }) => {
    if (!isSafeCredentialedRegressionBaseUrl(E2E_BASE_URL)) {
      throw new Error(
        `Credentialed IDIR regression is blocked for ${safeUrlForLog(E2E_BASE_URL)}. Use localhost, DEV, TEST, or a numeric PR preview route.`,
      )
    }

    idirContext = await browser.newContext()
    idirPage = await idirContext.newPage()
    await redirectExternalLogoutToLoginShell(idirPage)
    await loginWithIdir(idirPage)
  })

  test.afterAll(async () => {
    await idirContext?.close()
  })

  test('shows admin navigation and broad grants', async () => {
    const page = await authenticatedIdirPage()
    const apiServerErrors = collectApiServerErrors(page)

    await expectAccessiblePage(page, '/provincial/review', /provincial application review/i)

    const capabilities = await fetchSessionCapabilities(page)
    const roles = asStringArray(capabilities.roles)
    const grantedActions = asStringArray(capabilities.grantedActions)

    expect(capabilities.authenticated).toBe(true)
    expect(String(capabilities.principal ?? '').trim()).not.toBe('')
    expect(hasAdminRole(roles)).toBe(true)

    for (const action of requiredAdminActions) {
      expect(hasGrantedAction(grantedActions, action), `Expected admin grant for ${action}`).toBe(
        true,
      )
    }

    await expectAdminNavigation(page)
    await expect(page.getByRole('link', { name: /^Summary$/ })).toHaveCount(0)
    await expect(page.getByRole('link', { name: /^Upload application submission$/i })).toHaveCount(
      0,
    )
    await expect(page.getByRole('link', { name: /^Data upload$/i })).toHaveCount(0)
    await expect(page.locator(sideNavSection('Federal')).getByRole('link')).toHaveCount(1)
    await expect(
      page.locator(sideNavSection('Admin')).getByRole('link', { name: /upload/i }),
    ).toHaveCount(0)
    expect(apiServerErrors).toEqual([])
  })

  test('lands authenticated IDIR admins on provincial application review from the app root', async () => {
    const page = await authenticatedIdirPage()

    await page.goto(new URL('/', E2E_BASE_URL).toString(), {
      waitUntil: 'domcontentloaded',
    })

    await expect(page.getByRole('heading', { name: /provincial application review/i })).toBeVisible(
      {
        timeout: 30_000,
      },
    )
    await expect.poll(() => new URL(page.url()).pathname).toBe('/provincial/review')
  })

  test('restores an applied search after navigating to another page', async () => {
    const page = await authenticatedIdirPage()

    await expectAccessiblePage(
      page,
      `/provincial/application?applicationNumber=${missingApplicationNumber}`,
      /provincial application search/i,
    )
    await expect(page.getByText('No applications found', { exact: true })).toBeVisible()

    await expectAccessiblePage(
      page,
      `/federal?applicationNumber=${missingApplicationNumber}`,
      /federal application search/i,
    )
    await expectAccessiblePage(page, '/provincial/application', /provincial application search/i)

    await expect.poll(() => new URL(page.url()).pathname).toBe('/provincial/application')
    await expect
      .poll(() => new URL(page.url()).searchParams.get('applicationNumber'))
      .toBe(missingApplicationNumber)
    await expect(page.getByText('No applications found', { exact: true })).toBeVisible()
  })

  test('supports collapsible sidebar sections and collapsed icon navigation', async () => {
    const page = await authenticatedIdirPage()

    await expectAccessiblePage(page, '/provincial/review', /provincial application review/i)

    const reportsSection = page.locator(sideNavSection('Reports'))
    await expect(reportsSection.getByRole('link', { name: 'Advertising List' })).toBeVisible()
    await reportsSection.getByRole('button', { name: 'Reports' }).click()
    await expect(reportsSection.getByRole('link', { name: 'Advertising List' })).toHaveCount(0)
    await reportsSection.getByRole('button', { name: 'Reports' }).click()
    await expect(reportsSection.getByRole('link', { name: 'Advertising List' })).toBeVisible()

    await page.getByRole('button', { name: 'Close menu' }).click()
    await expect(page.getByRole('button', { name: 'Open menu' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Application review' })).toHaveAttribute(
      'title',
      'Application review',
    )
    await expect(page.getByRole('link', { name: 'Advertising List' })).toHaveAttribute(
      'title',
      'Advertising List',
    )
    await page.getByRole('button', { name: 'Open menu' }).click()
  })

  test('keeps upload navigation scoped to provincial application submissions', async () => {
    const page = await authenticatedIdirPage()

    await expectAccessiblePage(page, '/provincial/review', /provincial application review/i)

    const provincialSection = page.locator(sideNavSection('Provincial'))
    const federalSection = page.locator(sideNavSection('Federal'))
    const adminSection = page.locator(sideNavSection('Admin'))

    await expect(provincialSection.getByRole('link', { name: 'Upload' })).toHaveAttribute(
      'href',
      '/provincial/application/upload',
    )
    await expectAccessiblePage(
      page,
      '/provincial/application/upload',
      /upload application submission/i,
    )
    await expectFsptsUploadLayout(page)
    await expect(page.getByText('Submission file', { exact: true })).toBeVisible()
    await expect(page.getByLabel('Upload batch summary')).toHaveCount(0)
    const applicationSubmissionProgress = page.getByRole('list', {
      name: 'Application submission upload workflow progress',
    })
    await expect(applicationSubmissionProgress.getByText('1. Upload')).toBeVisible()
    await expect(applicationSubmissionProgress.getByText('2. Review')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Validation status' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Submission summary' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Review' })).toBeDisabled()

    await expectAccessiblePage(page, '/provincial/review', /provincial application review/i)
    await expect(federalSection.getByRole('link', { name: /upload/i })).toHaveCount(0)
    await expect(adminSection.getByRole('link', { name: /upload/i })).toHaveCount(0)

    await page.goto(new URL('/federal/application/upload', E2E_BASE_URL).toString(), {
      waitUntil: 'domcontentloaded',
    })
    await expect(page.getByRole('heading', { name: /federal application search/i })).toBeVisible()
    await expect(
      page.getByRole('heading', { name: /upload federal application submission/i }),
    ).toHaveCount(0)
    await expect(page.getByText('Validate submissions')).toHaveCount(0)
    await expect.poll(() => new URL(page.url()).pathname).toBe('/federal')
  })

  test('opens reports from direct sidebar report links', async () => {
    const page = await authenticatedIdirPage()

    await expectAccessiblePage(page, '/provincial/review', /provincial application review/i)

    for (const [linkName, path, heading] of [
      ['Offers Report', '/reports/offerReport', /offer report/i],
      ['Permits Report', '/reports/permitLedgerReport', /permit ledger report/i],
      ['Tenure Analysis', '/reports/tenureReport', /tenure analysis report/i],
    ] as const) {
      await page.locator(sideNavSection('Reports')).getByRole('link', { name: linkName }).click()
      await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible()
      await expect.poll(() => new URL(page.url()).pathname).toBe(path)
    }
  })

  test('can verify representative admin action grants', async () => {
    const page = await authenticatedIdirPage()

    for (const action of representativeAdminActions) {
      const access = await readJsonResponse<SessionActionAccessResponse>(
        await getWithAuth(page, '/api/lexis/session/canPerformAction', {
          params: { action },
        }),
      )

      expect(
        access.authenticated,
        `${action} should be checked with an authenticated session`,
      ).toBe(true)
      expect(access.action).toBe(action)
      expect(access.granted, `${action} should be granted to the IDIR admin`).toBe(true)
    }
  })

  test('can open representative admin, provincial, federal, upload, and report pages', async () => {
    const page = await authenticatedIdirPage()
    const apiServerErrors = collectApiServerErrors(page)

    for (const [path, heading] of [...adminAccessiblePages, ...reportAccessiblePages]) {
      await expectAccessiblePage(page, path, heading)
    }

    expect(apiServerErrors).toEqual([])
  })

  test('can load admin routes through document navigation', async () => {
    const page = await authenticatedIdirPage()

    for (const [path, heading] of adminAccessiblePages.filter(([routePath]) =>
      routePath.startsWith('/admin'),
    )) {
      const response = await page.goto(new URL(path, E2E_BASE_URL).toString(), {
        waitUntil: 'domcontentloaded',
      })

      expect(response?.status(), `${path} should not be blocked by the frontend WAF`).toBe(200)
      await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Unauthorized' })).toHaveCount(0)
    }
  })

  test('keeps the provincial client summary unavailable to IDIR administrators', async () => {
    const page = await authenticatedIdirPage()

    await page.goto(new URL('/provincial/summary', E2E_BASE_URL).toString(), {
      waitUntil: 'domcontentloaded',
    })

    await expect(
      page.getByRole('heading', { name: "You don't have access to view this page" }),
    ).toBeVisible()
    await expect(page.getByRole('heading', { name: '404' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /log in with idir/i })).toHaveCount(0)
  })

  test('keeps review queue bulk actions limited to approve', async () => {
    const page = await authenticatedIdirPage()

    await expectAccessiblePage(
      page,
      '/provincial/review?page=1&pageSize=25',
      /provincial application review/i,
    )

    const approveSelectedButton = page.getByRole('button', {
      name: 'Approve Selected Applications',
    })
    await expect(approveSelectedButton).toBeVisible()
    await expect(approveSelectedButton).toBeDisabled()
    await expect(page.getByRole('checkbox', { name: 'Select all rows on this page' })).toBeVisible()

    await expect(page.getByRole('button', { name: /reject selected/i })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /update selected/i })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /change selected/i })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^Update Status$/i })).toHaveCount(0)
    await expect(page.getByRole('textbox', { name: /update reason/i })).toHaveCount(0)
    await expect(page.getByRole('textbox', { name: /update status/i })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Reject Application' })).toHaveCount(0)
  })

  test('shows AMV table controls and row highlighting', async () => {
    const page = await authenticatedIdirPage()
    const savedRows = ['A', 'B'].flatMap((grade, gradeIndex) =>
      ['O', 'S'].map((growthIndicator) => ({
        species: 'BA',
        grade,
        growthIndicator,
        retrievalDate: '2026-07-01',
        updateDate: '2026-07-01',
        currentValue: 10 + gradeIndex,
        newValue: 10 + gradeIndex,
        returnCode: '0',
      })),
    )

    await page.route('**/api/lexis/rtm/emslogamv**', async (route) => {
      if (route.request().method() !== 'GET') {
        await route.fallback()
        return
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(savedRows),
      })
    })

    await expectAccessiblePage(page, '/admin/rtm/emslogamv', /average monthly values/i)
    await expect(
      page.getByText('Maintain one monthly value for each species and grade.'),
    ).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Upload' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Download template' })).toHaveCount(0)
    await expect(
      page.getByRole('button', { name: 'Choose an average monthly values upload spreadsheet' }),
    ).toHaveCount(0)
    await expect(page.getByLabel('Effective month')).toBeVisible()
    await expect(page.getByRole('radio')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Reload' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save changes' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Submit' })).toHaveCount(0)

    const table = page.getByRole('table', { name: 'Average monthly value table' })
    await expect(table).toBeVisible()
    await expect(table.getByRole('columnheader', { name: 'Balsam (BA)' })).toBeVisible()
    await expect(table.getByRole('columnheader', { name: 'Pine' })).toBeVisible()
    await expect(
      table.getByRole('columnheader', { name: /white pine|lodgepole|yellow pine/i }),
    ).toHaveCount(0)
    await expect(
      page.getByText(
        'Each cell represents one species and grade for the selected effective month.',
      ),
    ).toBeVisible()
    const balsamGradeA = page.getByLabel('Balsam (BA) grade A')
    const balsamGradeB = page.getByLabel('Balsam (BA) grade B')
    await expect(balsamGradeA).toBeVisible()
    await expect(balsamGradeB).toBeVisible()

    const gradeARow = table.getByRole('row').filter({ has: balsamGradeA })
    const gradeBRow = table.getByRole('row').filter({ has: balsamGradeB })
    await expect(gradeARow).toHaveCount(1)
    await expect(gradeBRow).toHaveCount(1)

    const gradeABaseline = await tableRowBackgrounds(gradeARow)
    const gradeBBaseline = await tableRowBackgrounds(gradeBRow)

    await gradeARow.hover()
    await expect.poll(async () => tableRowBackgrounds(gradeARow)).not.toEqual(gradeABaseline)
    expect(new Set(await tableRowBackgrounds(gradeARow)).size).toBe(1)

    await gradeBRow.hover()
    await expect.poll(async () => tableRowBackgrounds(gradeBRow)).not.toEqual(gradeBBaseline)
    expect(new Set(await tableRowBackgrounds(gradeBRow)).size).toBe(1)
    await expect.poll(async () => tableRowBackgrounds(gradeARow)).toEqual(gradeABaseline)

    await balsamGradeA.focus()
    await expect.poll(async () => tableRowBackgrounds(gradeARow)).not.toEqual(gradeABaseline)

    await balsamGradeA.fill('12')
    await expect(balsamGradeA.locator('xpath=ancestor::td')).toHaveClass(/is-changed/)
    await expect(balsamGradeA.locator('xpath=ancestor::td')).not.toHaveClass(/has-warning/)
  })

  test('uses copied AMV values as the warning baseline', async () => {
    const page = await authenticatedIdirPage()
    const currentMonth = `${formatBusinessIsoDate().slice(0, 7)}-01`
    const [currentYear, currentMonthNumber] = currentMonth.split('-').map(Number)
    const previousCurrentMonth = new Date(Date.UTC(currentYear, currentMonthNumber - 2, 1))
      .toISOString()
      .slice(0, 10)
    const sourceDate = previousCurrentMonth
    const copiedRows = [
      ['BA', 'O', 10.25],
      ['BA', 'S', 10.25],
      ['HE', 'O', 20.5],
      ['HE', 'S', 20.5],
    ].map(([species, growthIndicator, value]) => ({
      species,
      grade: 'A',
      growthIndicator,
      retrievalDate: sourceDate,
      updateDate: sourceDate,
      currentValue: value,
      newValue: value,
      returnCode: '0',
    }))

    await page.route('**/api/lexis/rtm/emslogamv**', async (route) => {
      const request = route.request()
      if (request.method() !== 'GET') {
        await route.fallback()
        return
      }

      const searchParams = new URL(request.url()).searchParams
      const latestBeforeDate = searchParams.get('latestBeforeDate')
      const isImmediatePreviousMonth =
        searchParams.get('retrievalDate') === previousCurrentMonth &&
        searchParams.get('updateDate') === previousCurrentMonth
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(latestBeforeDate || isImmediatePreviousMonth ? copiedRows : []),
      })
    })

    await expectAccessiblePage(page, '/admin/rtm/emslogamv', /average monthly values/i)
    await expect(page.getByRole('heading', { name: 'Starting values copied' })).toBeVisible()
    await expect(page.getByText(/Prefilled from the previous month/)).toBeVisible()

    const balsamGradeA = page.getByLabel('Balsam (BA) grade A')
    const cedarGradeA = page.getByLabel('Cedar (CE) grade A')
    await expect(balsamGradeA).toHaveValue('10.25')
    await expect(balsamGradeA.locator('xpath=ancestor::td')).toHaveClass(/is-dirty/)
    await expect(balsamGradeA.locator('xpath=ancestor::td')).not.toHaveClass(/has-warning/)
    await expect(page.getByRole('heading', { name: 'Warnings' })).toHaveCount(0)

    await balsamGradeA.fill('')
    await expect(balsamGradeA.locator('xpath=ancestor::td')).toHaveClass(/is-removed/)
    await expect(balsamGradeA.locator('xpath=ancestor::td')).toHaveClass(/has-warning/)
    await expect(
      page.getByText(/had a value in the starting values and is now blank/),
    ).toBeVisible()

    await page.getByRole('button', { name: 'Reset' }).click()
    await expect(balsamGradeA).toHaveValue('10.25')
    await expect(page.getByRole('heading', { name: 'Warnings' })).toHaveCount(0)

    await cedarGradeA.fill('5')
    await expect(cedarGradeA.locator('xpath=ancestor::td')).toHaveClass(/is-added/)
    await expect(cedarGradeA.locator('xpath=ancestor::td')).toHaveClass(/has-warning/)
    await expect(
      page.getByText(/was blank in the starting values and is now populated/),
    ).toBeVisible()

    const cedarCell = cedarGradeA.locator('xpath=ancestor::td')
    const warningBackground = await cedarCell.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    )
    await page.getByRole('button', { name: 'Reset' }).click()
    const effectiveMonth = page.getByLabel('Effective month')
    await effectiveMonth.fill('2099-07')
    await effectiveMonth.press('Tab')

    await expect(page.getByText('Viewing future month July 2099')).toBeVisible()
    await expect(cedarGradeA).toHaveValue('')
    await expect(cedarCell).not.toHaveClass(/has-warning/)
    await expect(page.getByRole('heading', { name: 'Warnings' })).toHaveCount(0)
    await expect
      .poll(async () => cedarCell.evaluate((element) => getComputedStyle(element).backgroundColor))
      .not.toBe(warningBackground)
  })

  test('shows AMV table save validation failures without persisting values', async () => {
    const page = await authenticatedIdirPage()
    const saveRequests: Array<Record<string, unknown>> = []

    await page.route('**/api/lexis/rtm/emslogamv**', async (route) => {
      const request = route.request()

      if (request.method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        })
        return
      }

      if (request.method() === 'POST') {
        saveRequests.push(request.postDataJSON() as Record<string, unknown>)
        await route.fulfill({
          status: 422,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 'validation_failed',
            message: 'Average monthly value validation failed.',
            errors: ['Balsam grade A is outside the allowed range.'],
            rows: [],
          }),
        })
        return
      }

      await route.fallback()
    })

    await expectAccessiblePage(page, '/admin/rtm/emslogamv', /average monthly values/i)

    const balsamGradeA = page.getByLabel('Balsam (BA) grade A')
    await balsamGradeA.fill('123.45')
    await expect(balsamGradeA.locator('xpath=ancestor::td')).toHaveClass(/has-warning/)
    expect(await balsamGradeA.evaluate((element) => getComputedStyle(element).borderColor)).toBe(
      'rgb(241, 194, 27)',
    )
    await expect(page.getByRole('button', { name: 'Save changes' })).toBeEnabled()
    await page.getByRole('button', { name: 'Save changes' }).click()

    await expect(page.getByText(/Average monthly value validation failed/)).toBeVisible()
    await expect(page.getByText(/Balsam grade A is outside the allowed range/)).toBeVisible()
    await expect(balsamGradeA).toHaveValue('123.45')
    await expect(page.getByRole('button', { name: 'Save changes' })).toBeEnabled()
    await expect.poll(() => saveRequests.length).toBe(1)
    expect(saveRequests).toEqual([
      expect.objectContaining({
        values: [
          expect.objectContaining({
            species: 'BA',
            grade: 'A',
            growthIndicator: 'O',
            newValue: 123.45,
          }),
        ],
      }),
    ])
  })

  test('uses the default Carbon region multi-select across search filters', async () => {
    const page = await authenticatedIdirPage()

    for (const [path, heading] of regionFilterPages) {
      await expectAccessiblePage(page, path, heading)
      await expect(
        page.getByRole('combobox', { name: /^Region\s*Total items selected:\s*2/ }),
        `${path} should expose Carbon's selected-item summary`,
      ).toBeVisible({ timeout: 30_000 })
      await expect(page.getByRole('list', { name: 'Selected regions' })).toHaveCount(0)
    }
  })

  test('prefills create application with safe defaults and next list date', async () => {
    const page = await authenticatedIdirPage()

    const options = await readJsonResponse<GenericOptionsResponse>(
      await getWithAuth(page, '/api/lexis/applications/search/options'),
    )
    const nextSchedules = asRecordArray(options.nextSchedules)
    expectApplicationScheduleOptions(nextSchedules, 'create application list dates')
    expectFutureScheduleOptions(
      nextSchedules.filter((schedule) => optionCode(schedule)),
      'create application list dates',
    )
    const nextListDate = optionName(nextSchedules.find((schedule) => optionCode(schedule)) ?? {})
    expect(nextListDate, 'create application should have a next list date option').toMatch(
      isoDatePattern,
    )

    await expectAccessiblePage(
      page,
      '/provincial/application/create',
      /create provincial application/i,
    )
    const today = formatBusinessIsoDate()

    await expect(page.getByRole('combobox', { name: 'Product type' })).toHaveValue(
      'Harvested Timber',
    )
    await expect(page.getByRole('combobox', { name: 'Exemption reason' })).toHaveValue('Surplus')
    const region = page.getByRole('combobox', { name: 'Region' })
    await expect(region).toHaveValue('')
    await expect(region).toBeEnabled()
    await expect(page.getByRole('textbox', { name: 'Application date (YYYY-MM-DD)' })).toHaveValue(
      today,
    )
    await expect(page.getByRole('textbox', { name: 'Received date (YYYY-MM-DD)' })).toHaveValue('')
    await expect(page.getByRole('combobox', { name: 'Listing date' })).toHaveValue(nextListDate)

    const paragraphField = page.getByLabel('Location of logs')
    const normalField = page.getByLabel('Application volume')
    const [paragraphMetrics, normalFieldMetrics] = await Promise.all([
      paragraphField.evaluate((element) => ({
        fontSize: getComputedStyle(element).fontSize,
        height: element.getBoundingClientRect().height,
        resize: getComputedStyle(element).resize,
      })),
      normalField.evaluate((element) => ({
        fontSize: getComputedStyle(element).fontSize,
        height: element.getBoundingClientRect().height,
      })),
    ])
    expect(paragraphMetrics.height).toBe(normalFieldMetrics.height)
    expect(paragraphMetrics.fontSize).toBe(normalFieldMetrics.fontSize)
    expect(paragraphMetrics.resize).toBe('vertical')

    await page.getByRole('tab', { name: 'Clients' }).click()
    await expect(page.getByRole('combobox', { name: 'Applicant type' })).toHaveValue('Owner')
  })

  test('shows create application tabs and guards record-dependent actions', async () => {
    const page = await authenticatedIdirPage()

    await expectAccessiblePage(
      page,
      '/provincial/application/create',
      /create provincial application/i,
    )

    for (const tabName of [
      'Summary',
      'Clients',
      'Packages / Scales',
      'Permits',
      'Offers',
      'Documents',
      'Remarks',
    ]) {
      await expect(page.getByRole('tab', { name: tabName })).toBeVisible()
    }

    await expect(page.getByRole('button', { name: 'Save' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save Draft' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Submit' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Back to Search' })).toHaveCount(0)

    const regionSelect = page.getByRole('combobox', { name: 'Region' })
    await expect(regionSelect).toBeEnabled({ timeout: 30_000 })
    if (!(await regionSelect.inputValue()).trim()) {
      await regionSelect.click()
      const regionMenuId = await regionSelect.getAttribute('aria-controls')
      expect(regionMenuId, 'region should control a dropdown menu').toBeTruthy()
      await page.locator(`#${regionMenuId}`).getByRole('option').first().click()
    }

    await page.getByRole('tab', { name: 'Packages / Scales' }).click()
    const packagesPanel = page.getByRole('region', { name: 'Packages / Scales' })
    await expect(packagesPanel).toBeVisible()
    await expect(packagesPanel).toHaveCSS('overflow', 'visible')

    const speciesSelect = packagesPanel.getByRole('combobox', {
      name: 'Application species',
    })
    await expect(speciesSelect).toBeEnabled({ timeout: 30_000 })
    await speciesSelect.click()
    await expect(speciesSelect).toHaveAttribute('aria-expanded', 'true')
    const speciesMenuId = await speciesSelect.getAttribute('aria-controls')
    expect(speciesMenuId, 'application species should control a dropdown menu').toBeTruthy()
    const speciesMenu = page.locator(`#${speciesMenuId}`)
    await expect(speciesMenu).toBeVisible()
    expect(await speciesMenu.getByRole('option').count()).toBeGreaterThan(0)
    const firstSpeciesOption = speciesMenu.getByRole('option').first()
    const firstSpeciesLabel = (await firstSpeciesOption.textContent())?.trim() ?? ''
    const firstSpeciesCode = firstSpeciesLabel.split(/\s+-\s+/, 1)[0]?.trim() ?? ''
    expect(firstSpeciesCode, 'application species option should include a code').not.toBe('')
    await firstSpeciesOption.click()

    const addSpeciesButton = packagesPanel.getByRole('button', {
      name: 'Add application species',
      exact: true,
    })
    await expect(addSpeciesButton).toBeEnabled()
    await addSpeciesButton.click()

    const selectedSpeciesList = packagesPanel.getByRole('list', {
      name: 'Selected application species',
    })
    const selectedSpeciesItem = selectedSpeciesList.getByRole('listitem').filter({
      hasText: firstSpeciesCode,
    })
    const removeSpeciesButton = selectedSpeciesItem.getByRole('button', {
      name: `Remove ${firstSpeciesCode} from application`,
      exact: true,
    })
    await expect(removeSpeciesButton).toBeVisible()
    await expect(packagesPanel.getByRole('button', { name: 'Remove', exact: true })).toHaveCount(0)

    const [addSpeciesBox, selectedSpeciesBox] = await Promise.all([
      addSpeciesButton.boundingBox(),
      selectedSpeciesItem.boundingBox(),
    ])
    expect(addSpeciesBox).not.toBeNull()
    expect(selectedSpeciesBox).not.toBeNull()
    expect(selectedSpeciesBox!.x).toBeGreaterThanOrEqual(addSpeciesBox!.x + addSpeciesBox!.width)
    expect(Math.abs(selectedSpeciesBox!.y - addSpeciesBox!.y)).toBeLessThan(12)

    await removeSpeciesButton.click()
    await expect(removeSpeciesButton).toHaveCount(0)

    await expect(page.getByRole('heading', { name: 'Package Details', exact: true })).toBeVisible()
    const createPackageButton = page.getByRole('button', {
      name: 'Create New Package',
      exact: true,
    })
    await expect(createPackageButton).toBeEnabled()
    await createPackageButton.click()

    const unsavedPackageDialog = page.getByRole('dialog', { name: 'Application not saved' })
    await expect(unsavedPackageDialog).toBeVisible()
    await expect(
      unsavedPackageDialog.getByText('Please save this application before adding packages.'),
    ).toBeVisible()
    await unsavedPackageDialog.getByRole('button', { name: 'OK', exact: true }).click()
    await expect(unsavedPackageDialog).toBeHidden()
    await expect(createPackageButton).toBeFocused()
    await expect(page).toHaveURL(/\/provincial\/application\/create(?:\?|$)/)

    await page.getByRole('tab', { name: 'Documents' }).click()
    const createDocumentsHeading = page.getByRole('heading', { name: 'Documents', exact: true })
    await expect(createDocumentsHeading).toBeVisible()
    await expect(createDocumentsHeading).not.toContainText('API')
    const addDocumentButton = page.getByRole('button', { name: 'Add document' })
    await expect(addDocumentButton).toBeDisabled()
    await expect(addDocumentButton).toHaveAttribute(
      'title',
      'Save the application before uploading documents.',
    )
    await expect(page.getByLabel('Document File')).toHaveCount(0)
  })

  test('uses save and cancel workflow on provincial create/edit pages', async () => {
    const page = await authenticatedIdirPage()

    for (const [path, heading] of createWorkflowPages) {
      await expectAccessiblePage(page, path, heading)
      await expect(page.getByRole('button', { name: 'Save' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Save Draft' })).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Submit' })).toHaveCount(0)
      await expect(page.getByRole('link', { name: 'Back to Search' })).toHaveCount(0)
    }
  })

  test('can query application review search contracts', async () => {
    const page = await authenticatedIdirPage()

    const options = await readJsonResponse<ApplicationReviewSearchOptionsResponse>(
      await getWithAuth(page, '/api/lexis/application-reviews/search/options'),
    )
    expect(Array.isArray(options.productTypes)).toBe(true)
    expect(Array.isArray(options.regions)).toBe(true)
    expect(Array.isArray(options.reviewStatuses)).toBe(true)
    expectNaturalResourceRegions(options.regions, 'application review search options')

    const search = await readJsonResponse<ApplicationReviewSearchResponse>(
      await getWithAuth(page, '/api/lexis/application-reviews/search', {
        params: {
          page: '0',
          size: '2',
        },
      }),
    )
    expect(Array.isArray(search.results)).toBe(true)
    expect(search.total).toEqual(expect.any(Number))
    expect(search.page).toBe(0)
    expect(search.size).toBe(2)

    const count = await readJsonResponse<SearchCountResponse>(
      await getWithAuth(page, '/api/lexis/application-reviews/search/count'),
    )
    expect(count.total).toEqual(expect.any(Number))

    const preview = await readJsonResponse<ApplicationReviewPreviewResponse>(
      await getWithAuth(page, '/api/lexis/application-reviews/search/preview', {
        params: {
          page: '0',
          size: '2',
        },
      }),
    )
    expect(Array.isArray(preview.results)).toBe(true)
    expect(preview.hasNext).toEqual(expect.any(Boolean))
    expect(preview.page).toBe(0)
    expect(preview.size).toBe(2)
  })

  test('can query provincial and federal application search contracts', async () => {
    const page = await authenticatedIdirPage()

    const provincialOptions = await readJsonResponse<GenericOptionsResponse>(
      await getWithAuth(page, '/api/lexis/applications/search/options'),
    )
    expect(Array.isArray(provincialOptions.productTypes)).toBe(true)
    expect(Array.isArray(provincialOptions.regions)).toBe(true)
    expectNaturalResourceRegions(provincialOptions.regions, 'provincial application options')
    expectApplicationScheduleOptions(
      provincialOptions.currentSchedules,
      'provincial application list dates',
    )
    expectApplicationScheduleOptions(
      provincialOptions.nextSchedules,
      'provincial application next list dates',
    )
    expectFutureScheduleOptions(
      asRecordArray(provincialOptions.nextSchedules).filter((schedule) => optionCode(schedule)),
      'provincial application next list dates',
    )

    const provincialSearch = await readJsonResponse<GenericSearchResponse>(
      await getWithAuth(page, '/api/lexis/applications/search', {
        params: {
          page: '0',
          size: '2',
        },
      }),
    )
    expect(Array.isArray(provincialSearch.results)).toBe(true)
    expect(provincialSearch.total).toEqual(expect.any(Number))
    expect(provincialSearch.page).toBe(0)
    expect(provincialSearch.size).toBe(2)

    const provincialCount = await readJsonResponse<SearchCountResponse>(
      await getWithAuth(page, '/api/lexis/applications/search/count'),
    )
    expect(provincialCount.total).toEqual(expect.any(Number))

    const federalOptions = await readJsonResponse<GenericOptionsResponse>(
      await getWithAuth(page, '/api/lexis/federal/applications/search/options'),
    )
    expect(Array.isArray(federalOptions.applicationStatuses)).toBe(true)

    const federalSearch = await readJsonResponse<GenericSearchResponse>(
      await getWithAuth(page, '/api/lexis/federal/applications/search', {
        params: {
          page: '0',
          size: '2',
        },
      }),
    )
    expect(Array.isArray(federalSearch.results)).toBe(true)
    expect(federalSearch.total).toEqual(expect.any(Number))
    expect(federalSearch.page).toBe(0)
    expect(federalSearch.size).toBe(2)

    const federalCount = await readJsonResponse<SearchCountResponse>(
      await getWithAuth(page, '/api/lexis/federal/applications/search/count'),
    )
    expect(federalCount.total).toEqual(expect.any(Number))
  })

  test('exposes linked exemption descriptions used by the client summary', async () => {
    const page = await authenticatedIdirPage()

    const exemptionSearch = await readJsonResponse<GenericSearchResponse>(
      await getWithAuth(page, '/api/lexis/exemptions/search', {
        params: {
          exemptionType: 'M',
          page: '0',
          size: '1',
        },
      }),
    )
    const exemptionNumber = requiredString(
      asRecordArray(exemptionSearch.results)[0]?.exemptionNumber,
      'Ministerial exemption number',
    )

    const applicationSearch = await readJsonResponse<GenericSearchResponse>(
      await getWithAuth(page, '/api/lexis/applications/search', {
        params: {
          exemptionNumber,
          page: '0',
          size: '2',
        },
      }),
    )
    const linkedApplications = asRecordArray(applicationSearch.results)
    const exactLinkedApplication = linkedApplications.find(
      (application) => String(application.exemptionNumber ?? '').trim() === exemptionNumber,
    )

    expect(exactLinkedApplication).toBeDefined()
    expect(exactLinkedApplication?.exemptionTypeDescription).toBe('Ministerial')
  })

  test('returns one canonical row for exemptions duplicated by legacy joins', async () => {
    const page = await authenticatedIdirPage()

    for (const exemptionNumber of ['24-8706', '22-8606', '18-8483']) {
      const search = await readJsonResponse<GenericSearchResponse>(
        await getWithAuth(page, '/api/lexis/exemptions/search', {
          params: {
            exemptionNumber,
            page: '0',
            size: '10',
          },
        }),
      )
      const results = asRecordArray(search.results)

      expect(search.total).toBe(1)
      expect(results).toHaveLength(1)
      expect(String(results[0]?.exemptionNumber ?? '').trim()).toBe(exemptionNumber)

      const count = await readJsonResponse<SearchCountResponse>(
        await getWithAuth(page, '/api/lexis/exemptions/search/count', {
          params: { exemptionNumber },
        }),
      )
      expect(count.total).toBe(1)
    }
  })

  test('can query exemption, offer, and permit search contracts', async () => {
    const page = await authenticatedIdirPage()

    for (const [optionsPath, searchPath, countPath] of [
      [
        '/api/lexis/exemptions/search/options',
        '/api/lexis/exemptions/search',
        '/api/lexis/exemptions/search/count',
      ],
      [
        '/api/lexis/purchase-offers/search/options',
        '/api/lexis/purchase-offers/search',
        '/api/lexis/purchase-offers/search/count',
      ],
      [
        '/api/lexis/permits/search/options',
        '/api/lexis/permits/search',
        '/api/lexis/permits/search/count',
      ],
    ] as const) {
      const options = await readJsonResponse<GenericOptionsResponse>(
        await getWithAuth(page, optionsPath),
      )
      expect(options).toEqual(expect.any(Object))
      expectNaturalResourceRegions(options.regions, `${optionsPath} region options`)

      const search = await readJsonResponse<GenericSearchResponse>(
        await getWithAuth(page, searchPath, {
          params: {
            page: '0',
            size: '2',
          },
        }),
      )
      expect(Array.isArray(search.results)).toBe(true)
      expect(search.total).toEqual(expect.any(Number))
      expect(search.page).toBe(0)
      expect(search.size).toBe(2)

      const count = await readJsonResponse<SearchCountResponse>(await getWithAuth(page, countPath))
      expect(count.total).toEqual(expect.any(Number))
    }
  })

  test('supports the working group search page sizes', async () => {
    const page = await authenticatedIdirPage()

    for (const contract of searchPageSizeContracts) {
      for (const size of ['20', '50', '100', '200']) {
        const response = await readJsonResponse<GenericSearchResponse>(
          await getWithAuth(page, contract.path, {
            params: {
              ...contract.params,
              page: '0',
              size,
            },
          }),
        )

        expect(Array.isArray(response.results), `${contract.source} should return results`).toBe(
          true,
        )
        expect(response.page, `${contract.source} should echo the requested first page`).toBe(0)
        expect(response.size, `${contract.source} should support page size ${size}`).toBe(
          Number(size),
        )
      }
    }
  })

  test('uses configured default browser search page sizes', async () => {
    const page = await authenticatedIdirPage()

    for (const contract of searchDefaultPageSizePages) {
      const expectedPageSize = contract.source === 'application review search' ? '100' : '10'
      const searchResponsePromise = page.waitForResponse((response) => {
        if (response.request().method() !== 'GET') {
          return false
        }

        try {
          return new URL(response.url()).pathname === contract.searchPath
        } catch {
          return false
        }
      })

      await expectAccessiblePage(page, contract.pagePath, contract.heading)

      const searchResponse = await searchResponsePromise
      const searchUrl = new URL(searchResponse.url())
      expect(searchResponse.ok(), `${contract.source} initial request should succeed`).toBe(true)
      expect(searchUrl.searchParams.get('page'), `${contract.source} should start on page 0`).toBe(
        '0',
      )
      expect(
        searchUrl.searchParams.get('size'),
        `${contract.source} should request the configured default page size`,
      ).toBe(expectedPageSize)
    }
  })

  test('can query application maintenance reference data contracts', async () => {
    const page = await authenticatedIdirPage()

    for (const path of [
      '/api/lexis/rpc/application-details/species-codes',
      '/api/lexis/rpc/application-details/package-status-codes',
      '/api/lexis/rpc/application-details/grade-codes',
    ]) {
      const referenceData = await readJsonResponse<ReferenceDataResponse>(
        await getWithAuth(page, path),
      )
      expect(Array.isArray(referenceData), `${path} should return an array`).toBe(true)
    }
  })

  test('can query admin policy and report option contracts', async () => {
    const page = await authenticatedIdirPage()

    const feePolicies = await readJsonResponse<GenericSearchResponse>(
      await getWithAuth(page, '/api/lexis/admin/policies/fee'),
    )
    expect(Array.isArray(feePolicies.results)).toBe(true)
    expect(feePolicies.total).toEqual(expect.any(Number))
    expect(feePolicies.page).toBe(0)
    expect(feePolicies.size).toBe(100)

    const filPolicies = await readJsonResponse<GenericSearchResponse>(
      await getWithAuth(page, '/api/lexis/admin/policies/fil'),
    )
    expect(Array.isArray(filPolicies.results)).toBe(true)
    expect(filPolicies.total).toEqual(expect.any(Number))
    expect(filPolicies.page).toBe(0)
    expect(filPolicies.size).toBe(100)

    const reportOptions = await readJsonResponse<GenericOptionsResponse>(
      await getWithAuth(page, '/api/lexis/reports/options'),
    )
    expect(Array.isArray(reportOptions.regions)).toBe(true)
    expect(Array.isArray(reportOptions.reportJurisdictions)).toBe(true)
    expectNaturalResourceRegions(reportOptions.regions, 'report options')
    expectReportScheduleOptions(reportOptions.currentSchedules, 'report list dates')

    const exportSchedules = await readJsonResponse<GenericSearchResponse>(
      await getWithAuth(page, '/api/lexis/admin/schedules'),
    )
    expect(Array.isArray(exportSchedules.results)).toBe(true)
    expect(exportSchedules.total).toEqual(expect.any(Number))
    expect(exportSchedules.page).toBe(0)
    expect(exportSchedules.size).toBe(100)
  })

  test('can page and sort all export schedules', async () => {
    const page = await authenticatedIdirPage()

    const schedules = await readJsonResponse<GenericSearchResponse>(
      await getWithAuth(page, '/api/lexis/admin/schedules', {
        params: {
          page: 0,
          size: 20,
          sortField: 'advertisingDate',
          sortDirection: 'desc',
        },
      }),
    )
    const rows = asRecordArray(schedules.results)

    expect(schedules.total, 'TEST should include historical export schedules').toBeGreaterThan(25)
    expect(schedules.page).toBe(0)
    expect(schedules.size).toBe(20)
    expect(rows.length).toBeLessThanOrEqual(20)

    let previousAdvertisingDate: string | null = null
    for (const row of rows) {
      const advertisingDate = String(row.advertisingDate ?? '').trim()
      expect(advertisingDate).toMatch(isoDatePattern)
      expect(row.mutable).toBe(Number(row.applicationCount ?? 0) === 0)
      if (previousAdvertisingDate) {
        expect(previousAdvertisingDate >= advertisingDate).toBe(true)
      }
      previousAdvertisingDate = advertisingDate
    }
  })

  test('shows report advertising date selector from current list dates', async () => {
    const page = await authenticatedIdirPage()

    const reportOptions = await readJsonResponse<GenericOptionsResponse>(
      await getWithAuth(page, '/api/lexis/reports/options'),
    )
    const currentSchedules = asRecordArray(reportOptions.currentSchedules)
    expectReportScheduleOptions(currentSchedules, 'report advertising date selector')

    const datedSchedules = currentSchedules.filter((schedule) => optionCode(schedule))
    const firstScheduleDate = optionName(datedSchedules[0] ?? {})
    expect(firstScheduleDate).toMatch(isoDatePattern)

    await expectAccessiblePage(
      page,
      '/reports/teacReport',
      /timber export advisory committee package report/i,
    )
    await expect(
      page.getByRole('heading', {
        name: 'Timber Export Advisory Committee package report',
      }),
    ).toBeVisible()

    const advertisingDate = page.getByRole('combobox', { name: 'Advertising date' })
    await expect(advertisingDate).toBeVisible()
    await expect(advertisingDate).toHaveValue(firstScheduleDate)

    for (const optionLabel of datedSchedules.slice(0, 2).map(optionName)) {
      await advertisingDate.click()
      await advertisingDate.fill(optionLabel)
      await expect(page.getByRole('option', { name: optionLabel, exact: true })).toBeVisible()
    }
  })

  test('shows advertising list report listing date controls', async () => {
    const page = await authenticatedIdirPage()

    await expectAccessiblePage(page, '/reports/biweeklyListing', /advertising list/i)

    await expect(page.getByRole('heading', { name: 'Advertising List' })).toBeVisible()
    await expect(page.getByText('Advertising list output in PDF or CSV format.')).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Jurisdiction' })).toBeVisible()
    await expect(page.getByLabel('Listing from date')).toBeVisible()
    await expect(page.getByLabel('Listing to date')).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Output format' })).toHaveValue('PDF')
    await expect(page.getByRole('button', { name: 'Generate report' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Clear all' })).toBeVisible()
  })

  test('generates advertising list PDF report', async () => {
    const page = await authenticatedIdirPage()

    const response = await postAdvertisingListReport(page, 'PDF')
    const body = await readReportBody(response, 'advertising list PDF report')
    const headers = response.headers()

    expect(headers['content-type']?.toLowerCase() ?? '').toContain('application/pdf')
    expect(headers['content-disposition'] ?? '').toContain('advertising-list.pdf')
    expect(body.length, 'advertising list PDF should not be empty').toBeGreaterThan(100)
    expect(body.toString('utf8', 0, 4)).toBe('%PDF')
  })

  test('generates advertising list CSV report with owner and agent email columns', async () => {
    const page = await authenticatedIdirPage()

    const response = await postAdvertisingListReport(page, 'CSV')
    const body = await readReportBody(response, 'advertising list CSV report')
    const headers = response.headers()
    const csv = body.toString('utf8')
    const header =
      csv
        .split(/\r?\n/)
        .find(
          (line) =>
            line.includes('"CLIENT_CONTACT_PHONE"') && line.includes('"AGENT_CONTACT_NAME"'),
        ) ?? ''

    expect(headers['content-type']?.toLowerCase() ?? '').toContain('application/vnd.ms-excel')
    expect(headers['content-disposition'] ?? '').toMatch(/biweeklyListing\d{4}-\d{2}-\d{2}\.csv/)
    expect(header).toContain('"CLIENT_CONTACT_EMAIL"')
    expect(header).toContain('"AGENT_CONTACT_EMAIL"')
    expect(header.indexOf('"CLIENT_CONTACT_PHONE"')).toBeLessThan(
      header.indexOf('"CLIENT_CONTACT_EMAIL"'),
    )
    expect(header.indexOf('"AGENT_CONTACT_NAME"')).toBeLessThan(
      header.indexOf('"AGENT_CONTACT_EMAIL"'),
    )
  })

  test('can create, update, and delete future export schedule rows', async () => {
    const page = await authenticatedIdirPage()
    let scheduleId: string | null = null
    let deleted = false

    try {
      const {
        createRequest,
        updateRequest,
        createdSchedule,
        scheduleId: createdScheduleId,
      } = await createRegressionExportSchedule(page)
      scheduleId = createdScheduleId
      expect(createdSchedule.advertisingDate).toBe(createRequest.advertisingDate)
      expect(Number(createdSchedule.applicationCount ?? 0)).toBe(0)
      expect(createdSchedule.mutable).toBe(true)

      const updated = await readJsonResponse<ExportScheduleMutationResponse>(
        await putWithCsrf(page, `/api/lexis/admin/schedules/${encodeURIComponent(scheduleId)}`, {
          data: updateRequest,
        }),
      )
      expect(updated.success).toBe(true)
      expect(updated.message ?? '').toContain('updated')

      const updatedSchedule = asRecord(updated.schedule)
      expect(String(updatedSchedule.exportScheduleId ?? '')).toBe(scheduleId)
      expect(updatedSchedule.advertisingDate).toBe(updateRequest.advertisingDate)
      expect(Number(updatedSchedule.applicationCount ?? 0)).toBe(0)
      expect(updatedSchedule.mutable).toBe(true)

      await deleteRegressionExportSchedule(page, scheduleId)
      deleted = true
    } finally {
      if (scheduleId && !deleted) {
        await deleteRegressionExportSchedule(page, scheduleId)
      }
    }
  })

  test('allows legacy duplicate future export schedule advertising dates', async () => {
    const page = await authenticatedIdirPage()
    const scheduleIds: string[] = []

    try {
      const { createRequest, scheduleId: createdScheduleId } =
        await createRegressionExportSchedule(page)
      scheduleIds.push(createdScheduleId)

      const duplicate = await readJsonResponse<ExportScheduleMutationResponse>(
        await postWithCsrf(page, '/api/lexis/admin/schedules', {
          data: createRequest,
        }),
      )
      expect(duplicate.success).toBe(true)
      const duplicateSchedule = asRecord(duplicate.schedule)
      const duplicateScheduleId = String(duplicateSchedule.exportScheduleId ?? '').trim()
      expect(duplicateScheduleId).not.toBe('')
      scheduleIds.push(duplicateScheduleId)
      expect(duplicateScheduleId).not.toBe(createdScheduleId)
      expect(duplicateSchedule.advertisingDate).toBe(createRequest.advertisingDate)
    } finally {
      for (const scheduleId of scheduleIds.reverse()) {
        await deleteRegressionExportSchedule(page, scheduleId)
      }
    }
  })

  test('validates protected writes and rejects missing scoped resources', async () => {
    const page = await authenticatedIdirPage()

    await expectInvalidApplicationCreateValidation(
      await postWithCsrf(page, '/api/lexis/rpc/application-details/application', {
        form: {
          validation: 'true',
          ownerApplicantType: '',
          applicationDate: '',
          exemptionTerm: '0',
          dateReceived: '',
          applicationVolume: '0',
          logLocation: '',
          ownerClientNumber: '',
          ownerClientLocationCode: '',
          ownerContactName: '',
          exemptionReason: '',
          region: '',
          productTypeCode: '',
          ageClass: '',
          applicationEndUseCode: '',
          selectedSpecies: '',
        },
      }),
    )

    const approveResponse = await postWithCsrf(
      page,
      `/api/lexis/application-reviews/${missingApplicationNumber}/approve`,
    )
    expect(approveResponse.status()).toBe(403)

    const rejectResponse = await postWithCsrf(
      page,
      `/api/lexis/application-reviews/${missingApplicationNumber}/status`,
      {
        data: {
          statusCode: 'REJ',
          remark: 'IDIR admin regression authorization check',
          clientEmailAddress: '',
        },
      },
    )
    expect(rejectResponse.status()).toBe(403)

    const emailResponse = await postWithCsrf(
      page,
      `/api/lexis/application-reviews/${missingApplicationNumber}/status-email`,
      {
        data: {
          statusCode: 'REJ',
          remark: 'IDIR admin regression authorization check',
          clientEmailAddress: '',
        },
      },
    )
    expect(emailResponse.status()).toBe(403)

    const invalidScheduleResponse = await readJsonResponse<ExportScheduleMutationResponse>(
      await postWithCsrf(page, '/api/lexis/admin/schedules', {
        data: {},
      }),
      400,
    )
    expect(invalidScheduleResponse.success).toBe(false)
    expect(invalidScheduleResponse.message ?? '').toContain('Advertising date is required.')

    const rtmSearchResponse = await getWithAuth(page, '/api/lexis/rtm/emslogamv', {
      params: {
        retrievalDate: '2026-01-01',
        growthIndicator: 'S',
      },
    })
    const rtmSearchText = await rtmSearchResponse.text()
    expect(rtmSearchResponse.status(), redactedTextSnippet(rtmSearchText)).toBe(200)
    expect(JSON.parse(rtmSearchText)).toEqual(expect.any(Array))

    const invalidRtmBatch = await readJsonResponse<Record<string, unknown>>(
      await postWithCsrf(page, '/api/lexis/rtm/emslogamv/batch', {
        data: { values: [] },
      }),
      422,
    )
    expect(invalidRtmBatch.status).toBe('validation_failed')
    expect(asStringArray(invalidRtmBatch.errors)).toContain(
      'At least one AMV table value is required.',
    )
  })

  test('rejects EICAR application submission uploads named as XML and GeoJSON', async () => {
    const page = await authenticatedIdirPage()

    for (const file of infectedApplicationSubmissionFiles()) {
      for (const path of [
        '/api/lexis/application-submissions/validation',
        '/api/lexis/application-submissions',
      ] as const) {
        expectApplicationSubmissionVirusScanRejection(
          await postRegressionApplicationSubmissionFile(page, path, file),
          `${file.name} ${path}`,
        )
      }
    }
  })

  test('creates and deletes an admin notification', async () => {
    test.skip(
      !isSharedTestRegressionBaseUrl(E2E_BASE_URL),
      'Notification mutation regression runs only against shared TEST.',
    )

    const page = await authenticatedIdirPage()
    const cleanup = new RegressionCleanupStack()
    const notificationApiPath = '/api/lexis/admin/notifications'
    const notificationTitle = `LEXIS E2E notification ${Date.now().toString(36).toUpperCase()}`
    const notificationMessage = 'This is a TEST regression notification.'
    const apiServerErrors = collectApiServerErrors(page)
    const notificationCleanup = cleanup.defer('delete admin notification', async () => {
      const notifications = asRecordArray(
        await readJsonResponse<unknown>(await getWithAuth(page, notificationApiPath)),
      )
      const matchingNotifications = notifications.filter(
        (notification) => String(notification.title ?? '') === notificationTitle,
      )

      for (const notification of matchingNotifications) {
        const notificationId = Number(notification.id)
        expect(notificationId).toBeGreaterThan(0)
        const response = await deleteWithCsrf(page, `${notificationApiPath}/${notificationId}`)
        expect([204, 404]).toContain(response.status())
      }
    })
    let primaryError: unknown

    try {
      await expectAccessiblePage(page, '/notifications', /^Notifications$/)
      await page.getByRole('button', { name: 'New notification' }).click()

      const editor = page.getByRole('dialog', { name: 'New notification' })
      await expect(editor).toBeVisible()
      await editor.getByLabel('Title').fill(notificationTitle)
      await editor.getByLabel('Notification content editor').fill(notificationMessage)
      const warningLevel = editor.getByRole('radio', { name: /^Warning/ })
      await editor.locator('label[for="notification-level-warning"]').click()
      await expect(warningLevel).toBeChecked()
      await expect(editor.getByRole('checkbox', { name: 'All roles' })).toBeChecked()

      const createResponsePromise = page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' &&
          new URL(response.url()).pathname === notificationApiPath,
      )
      await editor.getByRole('button', { name: 'Publish' }).click()
      const createResponse = await createResponsePromise
      expect(createResponse.status()).toBe(201)
      const createdNotification = (await createResponse.json()) as Record<string, unknown>
      const createdNotificationId = Number(createdNotification.id)
      expect(createdNotificationId).toBeGreaterThan(0)

      await expect(page.getByText('Notification published', { exact: true })).toBeVisible()
      const notification = page
        .getByRole('listitem')
        .filter({ has: page.getByRole('heading', { name: notificationTitle, exact: true }) })
      await expect(notification).toBeVisible()
      await expect(notification.getByText(notificationMessage, { exact: true })).toBeVisible()
      await expect(notification.getByText('Warning', { exact: true })).toBeVisible()

      const deleteResponsePromise = page.waitForResponse(
        (response) =>
          response.request().method() === 'DELETE' &&
          new URL(response.url()).pathname === `${notificationApiPath}/${createdNotificationId}`,
      )
      await notification.getByRole('button', { name: 'Delete' }).click()
      const confirmation = page.getByRole('dialog', { name: 'Delete this notification?' })
      await expect(confirmation).toContainText(notificationTitle)
      await confirmation.getByRole('button', { name: 'Delete' }).click()
      const deleteResponse = await deleteResponsePromise
      expect(deleteResponse.status()).toBe(204)
      notificationCleanup.complete()

      await expect(page.getByText('Notification deleted', { exact: true })).toBeVisible()
      await expect(notification).toHaveCount(0)
      expect(apiServerErrors).toEqual([])
    } catch (error) {
      primaryError = error
    }

    const cleanupFailures = await cleanup.run()
    const failures = [...cleanupFailures]
    if (primaryError !== undefined) {
      failures.unshift(
        primaryError instanceof Error ? primaryError : new Error(String(primaryError)),
      )
    }
    throwRegressionFailures('Notification regression and cleanup failed.', failures)
  })

  test('creates, edits, terminalizes, and cleans up provincial records', async () => {
    test.setTimeout(300_000)
    test.skip(
      !isSharedTestRegressionBaseUrl(E2E_BASE_URL),
      'Persistent provincial CRUD regression runs only against shared TEST.',
    )

    const page = await authenticatedIdirPage()
    const cleanup = new RegressionCleanupStack()
    const packageNumber = uniqueRegressionPackageNumber()
    const marker = `LEXIS E2E ${packageNumber}`
    const lifecycleMarker = `${marker} lifecycle`
    const offerMarker = `${marker} offer`
    let primaryError: unknown

    try {
      validateRegressionFixtureConfig()
      const schedule = await test.step('load authoritative TEST prerequisites', async () => ({
        offer: await currentOfferSchedule(page),
        shipping: await shippingFixture(page),
      }))

      const validationResult = await test.step('validate the XML application submission', () =>
        postRegressionSubmission(
          page,
          '/api/lexis/application-submissions/validation',
          packageNumber,
        ))
      expect(validationResult.status).toBe('validated')
      expect(validationResult.packageNumber).toBe(packageNumber)
      expect(validationResult.scaleRows).toBe(3)
      expect(asStringArray(validationResult.errors)).toEqual([])

      const submissionResult = await test.step('import the lifecycle application', () =>
        postRegressionSubmission(page, '/api/lexis/application-submissions', packageNumber))
      expect(submissionResult.status).toBe('accepted')
      expect(submissionResult.packageNumber).toBe(packageNumber)
      expect(submissionResult.scaleRows).toBe(3)
      expect(asStringArray(submissionResult.errors)).toEqual([])
      expect(submissionResult.applicationNumber).toEqual(expect.any(Number))
      const lifecycleApplicationNumber = Number(submissionResult.applicationNumber)
      expect(lifecycleApplicationNumber).toBeGreaterThan(0)

      cleanup.defer('delete lifecycle application package and scales', () =>
        cleanupRegressionPackage(page, lifecycleApplicationNumber, packageNumber),
      )
      const lifecycleRejectCleanup = cleanup.defer('reject lifecycle application', () =>
        rejectRegressionApplication(page, lifecycleApplicationNumber, `${marker} cleanup`),
      )

      await test.step('reject an EICAR application document named as PDF', async () => {
        expectApplicationDocumentVirusScanRejection(
          await postRegressionApplicationDocumentFile(
            page,
            lifecycleApplicationNumber,
            infectedApplicationDocumentPdf(),
          ),
        )
      })

      await expectAccessiblePage(
        page,
        `/provincial/application/${lifecycleApplicationNumber}`,
        new RegExp(`application ${lifecycleApplicationNumber}`, 'i'),
      )
      const lifecycleTemplate = await fetchApplicationSummary(page, lifecycleApplicationNumber)

      const createdApplication = await test.step('create the offer application', async () =>
        readJsonResponse<ApplicationPersistenceResponse>(
          await postWithCsrf(page, '/api/lexis/rpc/application-details/application', {
            form: createApplicationForm(lifecycleTemplate, schedule.offer.scheduleId, offerMarker),
          }),
        ))
      expect(createdApplication.valid).toBe(true)
      expect(asStringArray(createdApplication.errors)).toEqual([])
      const offerApplicationNumber = Number(createdApplication.applicationNumber)
      expect(offerApplicationNumber).toBeGreaterThan(0)
      const offerApplicationCleanup = cleanup.defer('reject offer application', () =>
        rejectRegressionApplication(page, offerApplicationNumber, `${marker} cleanup`),
      )

      const initialOfferApplication = await readVersionedJson<Record<string, unknown>>(
        page,
        `/api/lexis/applications/${offerApplicationNumber}`,
      )
      expect(initialOfferApplication.payload.applicationStatusCode).toBe('NEW')
      expect(initialOfferApplication.payload.canCreateOffers).toBe(true)
      const offerApplicationSummary = await fetchApplicationSummary(page, offerApplicationNumber)
      const offerApplicationUpdate = applicationSummaryForm(
        offerApplicationSummary,
        schedule.offer.scheduleId,
        `${offerMarker} edited`,
      )
      const updatedApplication = await readJsonResponse<ApplicationPersistenceResponse>(
        await postWithCsrf(page, '/api/lexis/rpc/application-details/application-summary', {
          headers: versionHeaders(initialOfferApplication.version),
          form: offerApplicationUpdate,
        }),
      )
      expect(updatedApplication.valid).toBe(true)
      expect(asStringArray(updatedApplication.errors)).toEqual([])

      const staleApplicationUpdate = await readJsonResponseWithStatuses<Record<string, unknown>>(
        await postWithCsrf(page, '/api/lexis/rpc/application-details/application-summary', {
          headers: versionHeaders(initialOfferApplication.version),
          form: offerApplicationUpdate,
        }),
        [409],
      )
      expectStaleRecordResponse(
        staleApplicationUpdate,
        'application',
        String(offerApplicationNumber),
      )

      const persistedOfferApplication = await fetchApplicationSummary(page, offerApplicationNumber)
      expect(persistedOfferApplication.productLocation).toBe(`${offerMarker} edited`)

      const applicationBeforeOffer = await readVersionedJson<Record<string, unknown>>(
        page,
        `/api/lexis/applications/${offerApplicationNumber}`,
      )
      const createdOffer = await test.step('create the purchase offer', async () =>
        readJsonResponse<OfferPersistenceResponse>(
          await postWithCsrf(page, '/api/lexis/rpc/offer-details/offer', {
            headers: versionHeaders(applicationBeforeOffer.version),
            form: {
              applicationNumber: String(offerApplicationNumber),
              packageNumber: '',
              companyName: 'LEXIS E2E REGRESSION',
              contactName: offerMarker,
              offeringClientNumber: regressionOwnerClientNumber,
              clientNumber: regressionOwnerClientNumber,
              offerVolume: '1.24',
              purchaseOfferAmount: '100',
              teacReviewDate: '',
              fairOfferIndicator: 'N',
              validOfferIndicator: 'Y',
              approvalIndicator: 'N',
              pickupLocation: offerMarker,
              offerCondition: offerMarker,
              offerRemark: offerMarker,
            },
          }),
        ))
      expect(createdOffer.success).toBe(true)
      expect(asStringArray(createdOffer.errors)).toEqual([])
      const offerNumber = Number(createdOffer.exportPurchaseOfferNumber)
      expect(offerNumber).toBeGreaterThan(0)
      const offerCleanup = cleanup.defer('withdraw purchase offer', () =>
        withdrawRegressionOffer(page, offerNumber, marker),
      )

      await expectAccessiblePage(
        page,
        `/provincial/offers/${offerNumber}`,
        new RegExp(`offer ${offerNumber}`, 'i'),
      )
      const currentOffer = await readVersionedJson<Record<string, unknown>>(
        page,
        `/api/lexis/purchase-offers/${offerNumber}`,
      )
      expect(Number(currentOffer.payload.offerVolume)).toBe(1.2)
      const offerUpdate = offerUpdateForm(offerNumber, {
        purchaseOfferAmount: '125',
        offerRemark: `${offerMarker} edited`,
      })
      const editedOffer = await readJsonResponse<OfferPersistenceResponse>(
        await postWithCsrf(page, '/api/lexis/rpc/offer-details/offer/update', {
          headers: versionHeaders(currentOffer.version),
          form: offerUpdate,
        }),
      )
      expect(editedOffer.success).toBe(true)
      expect(asStringArray(editedOffer.errors)).toEqual([])

      const staleOfferUpdate = await readJsonResponseWithStatuses<Record<string, unknown>>(
        await postWithCsrf(page, '/api/lexis/rpc/offer-details/offer/update', {
          headers: versionHeaders(currentOffer.version),
          form: offerUpdate,
        }),
        [409],
      )
      expectStaleRecordResponse(staleOfferUpdate, 'offer', String(offerNumber))

      const persistedOffer = await readVersionedJson<Record<string, unknown>>(
        page,
        `/api/lexis/purchase-offers/${offerNumber}`,
      )
      expect(Number(persistedOffer.payload.purchaseOfferAmount)).toBe(125)
      expect(persistedOffer.payload.offerRemark).toBe(`${offerMarker} edited`)

      await withdrawRegressionOffer(page, offerNumber, marker)
      offerCleanup.complete()
      const withdrawnOffer = await readVersionedJson<Record<string, unknown>>(
        page,
        `/api/lexis/purchase-offers/${offerNumber}`,
      )
      expect(String(withdrawnOffer.payload.offerWithdrawalDate ?? '')).toBe(formatBusinessIsoDate())

      await rejectRegressionApplication(
        page,
        offerApplicationNumber,
        `${marker} offer application cleanup`,
      )
      offerApplicationCleanup.complete()
      const rejectedOfferApplication = await readVersionedJson<Record<string, unknown>>(
        page,
        `/api/lexis/applications/${offerApplicationNumber}`,
      )
      expect(rejectedOfferApplication.payload.applicationStatusCode).toBe('REJ')

      const lifecycleApplication = await readVersionedJson<Record<string, unknown>>(
        page,
        `/api/lexis/applications/${lifecycleApplicationNumber}`,
      )
      const lifecycleApplicationUpdate = applicationSummaryForm(
        lifecycleTemplate,
        String(lifecycleTemplate.exportScheduleId ?? ''),
        `${lifecycleMarker} edited`,
      )
      const updatedLifecycleApplication = await readJsonResponse<ApplicationPersistenceResponse>(
        await postWithCsrf(page, '/api/lexis/rpc/application-details/application-summary', {
          headers: versionHeaders(lifecycleApplication.version),
          form: lifecycleApplicationUpdate,
        }),
      )
      expect(updatedLifecycleApplication.valid).toBe(true)
      expect(asStringArray(updatedLifecycleApplication.errors)).toEqual([])

      const applicationBeforeApproval = await readVersionedJson<Record<string, unknown>>(
        page,
        `/api/lexis/applications/${lifecycleApplicationNumber}`,
      )
      const approvedApplication = await readJsonResponse<ReviewStatusResponse>(
        await postWithCsrf(
          page,
          `/api/lexis/application-reviews/${lifecycleApplicationNumber}/approve`,
          { headers: versionHeaders(applicationBeforeApproval.version) },
        ),
      )
      expect(approvedApplication.valid).toBe(true)
      expect(approvedApplication.updated).toBe(true)
      expect(approvedApplication.statusCode).toBe('APP')
      lifecycleRejectCleanup.complete()

      const preview = await readJsonResponse<ExemptionPreviewResponse>(
        await getWithAuth(page, '/api/lexis/rpc/exemption-details/create-preview', {
          params: { applicationNumbers: String(lifecycleApplicationNumber) },
        }),
      )
      expect(preview.valid).toBe(true)
      expect(preview.exemptionTypeCode).toBe('M')
      expect(preview.exemptionStatusCode).toBe('NEW')
      expect(Number(preview.approvedVolume)).toBeGreaterThan(0)
      expect(requiredString(preview.expiryDate, 'Exemption preview expiry date')).toMatch(
        isoDatePattern,
      )

      const applicationBeforeExemption = await readVersionedJson<Record<string, unknown>>(
        page,
        `/api/lexis/applications/${lifecycleApplicationNumber}`,
      )
      const orgUnitNumber = requiredString(
        lifecycleTemplate.orgUnitNumber,
        'Lifecycle application organization',
      )
      const createdExemption = await readJsonResponse<ExemptionPersistenceResponse>(
        await postWithCsrf(page, '/api/lexis/rpc/exemption-details/exemption', {
          headers: versionHeaders(applicationBeforeExemption.version),
          form: {
            applicationNumber: String(lifecycleApplicationNumber),
            applications: String(lifecycleApplicationNumber),
            exemptionNumber: '',
            exemptionTypeCode: 'M',
            exemptionStatusCode: 'NEW',
            approvalDate: '',
            expiryDate: requiredString(preview.expiryDate, 'Exemption expiry date'),
            approvedVolume: requiredString(preview.approvedVolume, 'Exemption approved volume'),
            region: orgUnitNumber,
            otherConditions: lifecycleMarker,
          },
        }),
      )
      expect(createdExemption.success).toBe(true)
      expect(asStringArray(createdExemption.errors)).toEqual([])
      const exemptionNumber = requiredString(
        createdExemption.exemptionNumber,
        'Created exemption number',
      )
      const exemptionCleanup = cleanup.defer('cancel ministerial exemption', () =>
        cancelRegressionExemption(page, exemptionNumber, orgUnitNumber),
      )

      await expectAccessiblePage(
        page,
        `/provincial/exemption/${encodeURIComponent(exemptionNumber)}`,
        new RegExp(`exemption ${exemptionNumber}`, 'i'),
      )
      const currentExemption = await readVersionedJson<Record<string, unknown>>(
        page,
        `/api/lexis/exemptions/${encodeURIComponent(exemptionNumber)}`,
      )
      const exemptionUpdate = exemptionUpdateForm(currentExemption.payload, orgUnitNumber, {
        otherConditions: `${lifecycleMarker} edited`,
      })
      const editedExemption = await readJsonResponse<ExemptionPersistenceResponse>(
        await postWithCsrf(page, '/api/lexis/rpc/exemption-details/exemption/update', {
          headers: versionHeaders(currentExemption.version),
          form: exemptionUpdate,
        }),
      )
      expect(editedExemption.success).toBe(true)
      expect(asStringArray(editedExemption.errors)).toEqual([])

      const staleExemptionUpdate = await readJsonResponseWithStatuses<Record<string, unknown>>(
        await postWithCsrf(page, '/api/lexis/rpc/exemption-details/exemption/update', {
          headers: versionHeaders(currentExemption.version),
          form: exemptionUpdate,
        }),
        [409],
      )
      expectStaleRecordResponse(staleExemptionUpdate, 'exemption', exemptionNumber.toUpperCase())

      const relinkCleanup = cleanup.defer('relink lifecycle application to exemption', () =>
        linkRegressionExemptionApplication(page, exemptionNumber, lifecycleApplicationNumber),
      )
      await unlinkRegressionExemptionApplication(page, exemptionNumber, lifecycleApplicationNumber)
      const unlinkedApplication = await readVersionedJson<Record<string, unknown>>(
        page,
        `/api/lexis/applications/${lifecycleApplicationNumber}`,
      )
      expect(unlinkedApplication.payload.applicationStatusCode).toBe('APP')
      await linkRegressionExemptionApplication(page, exemptionNumber, lifecycleApplicationNumber)
      relinkCleanup.complete()
      const relinkedApplication = await readVersionedJson<Record<string, unknown>>(
        page,
        `/api/lexis/applications/${lifecycleApplicationNumber}`,
      )
      expect(relinkedApplication.payload.applicationStatusCode).toBe('EXE')

      const exemptionBeforeApproval = await readVersionedJson<Record<string, unknown>>(
        page,
        `/api/lexis/exemptions/${encodeURIComponent(exemptionNumber)}`,
      )
      const approvedExemption = await readJsonResponse<ExemptionApprovalResponse>(
        await postWithCsrf(page, '/api/lexis/rpc/exemption-details/approve-exemptions', {
          headers: versionHeaders(exemptionBeforeApproval.version),
          form: { exemptionNumbers: exemptionNumber },
        }),
      )
      expect(approvedExemption.success).toBe(true)
      expect(approvedExemption.valid).toBe(true)
      expect(asStringArray(approvedExemption.errors)).toEqual([])

      const exemptionBeforePermit = await readVersionedJson<Record<string, unknown>>(
        page,
        `/api/lexis/exemptions/${encodeURIComponent(exemptionNumber)}`,
      )
      expect(exemptionBeforePermit.payload.exemptionStatusCode).toBe('ACT')
      const createdPermit = await readJsonResponse<PermitMutationResponse>(
        await postWithCsrf(page, '/api/lexis/rpc/permit-details/create-from-exemption', {
          headers: versionHeaders(exemptionBeforePermit.version),
          form: { exemptionNumber },
        }),
      )
      expect(createdPermit.success).toBe(true)
      expect(createdPermit.permitStatus).toBe('ACT')
      expect(asStringArray(createdPermit.errors)).toEqual([])
      const permitNumber = Number(createdPermit.permitNumber)
      expect(permitNumber).toBeGreaterThan(0)
      const permitCleanup = cleanup.defer('cancel provincial permit', () =>
        cancelRegressionPermit(page, permitNumber, lifecycleMarker, schedule.shipping),
      )
      const detachCleanup = cleanup.defer('detach lifecycle application from permit', () =>
        detachRegressionPermitApplication(page, permitNumber, lifecycleApplicationNumber),
      )

      await expectAccessiblePage(
        page,
        `/provincial/permit/${permitNumber}`,
        new RegExp(`permit ${permitNumber}`, 'i'),
      )
      const currentPermit = await readPermitVersionedJson<Record<string, unknown>>(
        page,
        permitNumber,
      )
      const permitUpdate = permitMutationForm(
        currentPermit.payload,
        packageNumber.slice(0, 24),
        schedule.shipping,
        'ACT',
      )
      const updatedPermit = await readJsonResponse<PermitMutationResponse>(
        await postWithCsrf(page, '/api/lexis/rpc/permit-details/update-permit', {
          headers: versionHeaders(currentPermit.version),
          form: permitUpdate,
        }),
      )
      expect(
        updatedPermit.success,
        permitMutationFailure(
          updatedPermit,
          `Permit ${permitNumber} update returned success=false.`,
        ),
      ).toBe(true)
      expect(updatedPermit.permitStatus).toBe('ACT')
      expect(asStringArray(updatedPermit.errors)).toEqual([])

      const stalePermitUpdate = await readJsonResponseWithStatuses<Record<string, unknown>>(
        await postWithCsrf(page, '/api/lexis/rpc/permit-details/update-permit', {
          headers: versionHeaders(currentPermit.version),
          form: permitUpdate,
        }),
        [409],
      )
      expectStaleRecordResponse(stalePermitUpdate, 'permit', String(permitNumber))

      expect(await permitContainsApplication(page, permitNumber, lifecycleApplicationNumber)).toBe(
        true,
      )
      const applicationAfterPermitCreation = await readVersionedJson<Record<string, unknown>>(
        page,
        `/api/lexis/applications/${lifecycleApplicationNumber}`,
      )
      expect(applicationAfterPermitCreation.payload.applicationStatusCode).toBe('EXE')

      await detachRegressionPermitApplication(page, permitNumber, lifecycleApplicationNumber)
      expect(await permitContainsApplication(page, permitNumber, lifecycleApplicationNumber)).toBe(
        false,
      )
      const applicationBeforeAttach = await readVersionedJson<Record<string, unknown>>(
        page,
        `/api/lexis/applications/${lifecycleApplicationNumber}`,
      )
      expect(applicationBeforeAttach.payload.applicationStatusCode).toBe('EXE')

      const permitBeforeAttach = await readPermitVersionedJson<Record<string, unknown>>(
        page,
        permitNumber,
      )
      const attachedApplication = await readJsonResponse<RelationshipMutationResponse>(
        await postWithCsrf(page, '/api/lexis/rpc/permit-details/add-applications-to-permit', {
          headers: versionHeaders(permitBeforeAttach.version),
          form: {
            permitNumber: String(permitNumber),
            selectedApplications: String(lifecycleApplicationNumber),
          },
        }),
      )
      expect(attachedApplication.success).toBe(true)
      expect(asStringArray(attachedApplication.errors)).toEqual([])
      expect(await permitContainsApplication(page, permitNumber, lifecycleApplicationNumber)).toBe(
        true,
      )
      const permittedApplication = await readVersionedJson<Record<string, unknown>>(
        page,
        `/api/lexis/applications/${lifecycleApplicationNumber}`,
      )
      expect(permittedApplication.payload.applicationStatusCode).toBe('PMT')

      await detachRegressionPermitApplication(page, permitNumber, lifecycleApplicationNumber)
      detachCleanup.complete()
      expect(await permitContainsApplication(page, permitNumber, lifecycleApplicationNumber)).toBe(
        false,
      )
      const detachedApplication = await readVersionedJson<Record<string, unknown>>(
        page,
        `/api/lexis/applications/${lifecycleApplicationNumber}`,
      )
      expect(detachedApplication.payload.applicationStatusCode).toBe('EXE')

      await cancelRegressionPermit(page, permitNumber, lifecycleMarker, schedule.shipping)
      permitCleanup.complete()
      const cancelledPermit = await readPermitVersionedJson<Record<string, unknown>>(
        page,
        permitNumber,
      )
      expect(cancelledPermit.payload.permitStatusCode).toBe('CAN')

      await cancelRegressionExemption(page, exemptionNumber, orgUnitNumber)
      exemptionCleanup.complete()
      const cancelledExemption = await readVersionedJson<Record<string, unknown>>(
        page,
        `/api/lexis/exemptions/${encodeURIComponent(exemptionNumber)}`,
      )
      expect(cancelledExemption.payload.exemptionStatusCode).toBe('CAN')
      const terminalApplication = await readVersionedJson<Record<string, unknown>>(
        page,
        `/api/lexis/applications/${lifecycleApplicationNumber}`,
      )
      expect(terminalApplication.payload.applicationStatusCode).toBe('APP')
    } catch (error) {
      primaryError = error
    }

    const cleanupFailures = await cleanup.run()
    const failures = [...cleanupFailures]
    if (primaryError !== undefined) {
      failures.unshift(
        primaryError instanceof Error ? primaryError : new Error(String(primaryError)),
      )
    }
    throwRegressionFailures('Provincial CRUD regression and cleanup failed.', failures)
  })

  // Logout mutates auth and session storage, so these checks must not reuse the suite's page.
  test('returns an expired IDIR admin session to the login shell', async ({ page }) => {
    await redirectExternalLogoutToLoginShell(page)
    await loginWithIdir(page)

    await expectAccessiblePage(page, '/provincial/review', /provincial application review/i)
    await expectLogoutRoundTrip(page, 'Expired IDIR admin session', () =>
      page.evaluate((eventName) => {
        window.dispatchEvent(
          new CustomEvent(eventName, {
            detail: { reason: 'idle-timeout' },
          }),
        )
      }, sessionExpiredEventName),
    )
    await expect(page.getByText('You’ve been logged out', { exact: true })).toBeVisible()
  })

  test('signs out to the login shell without an expired-session warning', async ({ page }) => {
    await redirectExternalLogoutToLoginShell(page)
    await loginWithIdir(page)

    await expectAccessiblePage(page, '/provincial/review', /provincial application review/i)
    const profileButton = page.locator('button[aria-controls="profile-panel"]')
    if ((await profileButton.getAttribute('aria-expanded')) !== 'true') {
      await profileButton.click()
    }
    const openProfilePanel = page.locator('#profile-panel.is-open')
    await expect(openProfilePanel).toBeVisible()
    const signOutButton = openProfilePanel.getByRole('button', { name: /sign out/i })
    await expect(signOutButton).toBeVisible()
    await expectLogoutRoundTrip(page, 'Logout', () => signOutButton.click())
    await expect(page.getByText('You’ve been logged out', { exact: true })).toHaveCount(0)
  })
})
