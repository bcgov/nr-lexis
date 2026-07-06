import { readFileSync } from 'node:fs'
import { expect, type APIResponse, type BrowserContext, type Page, test } from '@playwright/test'
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

const sideNavSection = (name: string) =>
  `.csp-side-nav__section:has(.csp-side-nav__category-text:text-is("${name}"))`

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

type ReviewStatusResponse = {
  updated?: boolean
  valid?: boolean
  statusCode?: string | null
  remark?: string | null
  message?: string | null
}

type ReviewStatusEmailResponse = {
  success?: boolean
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

type RtmUploadPreviewResponse = {
  status?: string
  rowCount?: number
  errors?: unknown
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

const missingApplicationNumber = '999999999'
const rtmSuccessWorkbook = readFileSync(
  new URL('../public/templates/rtm-ems-log-amv-template.xlsx', import.meta.url),
)
const virusScanRejectionMessage = 'The uploaded file failed virus scanning.'
const regressionStatusRemark = 'Weekly credentialed regression status check'
const regressionClientEmail = 'lexis-regression@example.test'
const naturalResourceRegionCodes = ['1903', '1904', '1905', '1906', '1907', '1908', '1909', '1910']
const selectedNaturalResourceRegionText =
  'Selected: Cariboo Natural Resource Region, Skeena Natural Resource Region'
const sessionExpiredEventName = 'lexis:session-expired'
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/
const landingSubtitle = 'Create and manage applications, view offers and permits'
const famManageUrlPattern = /^https:\/\/fam(?:-(?:dev|tst|tools))?\.nrs\.gov\.bc\.ca(?:\/.*)?$/
const advertisingListReportEndpoint = '/api/lexis/reports/biweeklyListing'

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

const expectCurrentScheduleOptions = (value: unknown, source: string): void => {
  const schedules = asRecordArray(value)
  const datedSchedules = schedules.filter((schedule) => optionCode(schedule))
  const today = new Date().toISOString().slice(0, 10)

  expect(
    schedules.length,
    `${source} should include blank plus future dates`,
  ).toBeGreaterThanOrEqual(3)
  const blankSchedule = schedules[schedules.length - 1]
  expect(optionCode(blankSchedule), `${source} last schedule option should be blank`).toBe('')
  expect(optionName(blankSchedule), `${source} last schedule option should be labeled Blank`).toBe(
    'Blank',
  )
  expect(
    datedSchedules.length,
    `${source} should expose at least two future list dates`,
  ).toBeGreaterThanOrEqual(2)

  for (const schedule of datedSchedules) {
    const scheduleDate = optionName(schedule)
    expect(scheduleDate, `${source} schedule names should be ISO dates`).toMatch(isoDatePattern)
    expect(scheduleDate >= today, `${source} should not expose previous list dates`).toBe(true)
  }
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

const browserLocalIsoToday = async (page: Page): Promise<string> => {
  return page.evaluate(() => {
    const date = new Date()
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  })
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

const regressionSubmissionXml = (
  packageNumber: string,
): string => `<?xml version="1.0" encoding="UTF-8"?>
<esf:ESFSubmission xmlns:lexis="http://www.for.gov.bc.ca/schema/lexis" xmlns:esf="http://www.for.gov.bc.ca/schema/esf" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.for.gov.bc.ca/schema/esf http://www.for.gov.bc.ca/schema/esf/1/xsd/MOF/esf-submission.xsd http://www.for.gov.bc.ca/schema/lexis http://www.for.gov.bc.ca/schema/lexis/2/xsd/MOF/mof-lexis.xsd">
  <esf:submissionContent>
    <lexis:LexisSubmission>
      <lexis:applicant>
        <lexis:applicantDetails>
          <lexis:clientNumber>00001074</lexis:clientNumber>
          <lexis:clientLocnCode>03</lexis:clientLocnCode>
          <lexis:name>Mosaic Forest Management Corporation</lexis:name>
        </lexis:applicantDetails>
        <lexis:applicantContact>
          <lexis:contactSurname>SERVICE</lexis:contactSurname>
          <lexis:contactFirstname>CUSTOMER</lexis:contactFirstname>
        </lexis:applicantContact>
      </lexis:applicant>
      <lexis:applicationDetail>
        <lexis:jurisdictionCode>P</lexis:jurisdictionCode>
        <lexis:bcForestRegionCode>RSC</lexis:bcForestRegionCode>
        <lexis:applStatusCode>A</lexis:applStatusCode>
        <lexis:exemptionRsnCde>S</lexis:exemptionRsnCde>
        <lexis:applicantTypeCode>O</lexis:applicantTypeCode>
      </lexis:applicationDetail>
      <lexis:productDetail>
        <lexis:productTypeCode>H</lexis:productTypeCode>
        <lexis:boomNumber>${packageNumber}</lexis:boomNumber>
        <lexis:speciesEndUseSort>HE/PL</lexis:speciesEndUseSort>
        <lexis:productLocation>Port Alberni c/o Pacific Towing</lexis:productLocation>
        <lexis:ageClass>S</lexis:ageClass>
        <lexis:avgLength>6.7</lexis:avgLength>
        <lexis:avgDiameter>12.8</lexis:avgDiameter>
        <lexis:harvestedTimber>
          <lexis:timberMark>NCHWP</lexis:timberMark>
          <lexis:numberOfPieces>1500</lexis:numberOfPieces>
          <lexis:species>HE</lexis:species>
          <lexis:grade>H</lexis:grade>
          <lexis:quantityVolume>500</lexis:quantityVolume>
        </lexis:harvestedTimber>
        <lexis:harvestedTimber>
          <lexis:timberMark>NCHWP</lexis:timberMark>
          <lexis:numberOfPieces>50</lexis:numberOfPieces>
          <lexis:species>HE</lexis:species>
          <lexis:grade>J</lexis:grade>
          <lexis:quantityVolume>24.5</lexis:quantityVolume>
        </lexis:harvestedTimber>
        <lexis:harvestedTimber>
          <lexis:timberMark>NCHWP</lexis:timberMark>
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
  buffer: antivirusTestPayload(),
})

const adminNavigationSections: Array<{
  section: string
  links: string[]
}> = [
  {
    section: 'Provincial',
    links: [
      'Review',
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
      'Applications Report',
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
    links: [
      'Users & Access',
      'Fee Policy',
      'Fee in Lieu',
      'Export Schedule',
      'Average Monthly Values',
    ],
  },
]

const adminAccessiblePages: Array<[path: string, heading: RegExp]> = [
  ['/admin', /administration/i],
  ['/admin/policies/fee', /fee policy administration/i],
  ['/admin/policies/fil', /fee in lieu percent policy administration/i],
  ['/admin/schedules', /export schedule administration/i],
  ['/provincial/review', /provincial review/i],
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
  ['/provincial/exemption/create', /create provincial exemption/i],
  ['/provincial/offers/create', /provincial offers/i],
]

const regionFilterPages: Array<[path: string, heading: RegExp]> = [
  ['/provincial/review?region=1903,1908', /provincial review/i],
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
    heading: /provincial review/i,
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

const readReviewStatusResponse = async (
  response: Awaited<ReturnType<typeof postWithCsrf>>,
): Promise<ReviewStatusResponse> => {
  const text = await response.text()
  expect(response.status(), redactedTextSnippet(text)).toBe(200)
  return JSON.parse(text) as ReviewStatusResponse
}

const readReviewStatusEmailResponse = async (
  response: Awaited<ReturnType<typeof postWithCsrf>>,
): Promise<ReviewStatusEmailResponse> => {
  const text = await response.text()
  expect(response.status(), redactedTextSnippet(text)).toBe(200)
  return JSON.parse(text) as ReviewStatusEmailResponse
}

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
  expectCurrentScheduleOptions(currentSchedules, 'advertising list report generation')

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
  file: RegressionUploadFile,
): Promise<JsonWithStatus<LexisUploadResponse>> => {
  return readJsonResponseWithStatuses<LexisUploadResponse>(
    await postWithCsrf(page, '/api/lexis/fileApplicationUpload', {
      multipart: {
        applicationNumber: String(missingApplicationNumber),
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
      expect(created.payload.message ?? '').toContain(
        'A schedule already exists for that advertising date.',
      )
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

    const deleteScale = await readJsonResponse<DeleteResponse>(
      await deleteWithCsrf(page, '/api/lexis/rpc/application-details/scale', {
        params: {
          scaleId,
          applicationNumber: String(applicationNumber),
        },
      }),
    )
    expect(deleteScale.success, `Expected scale ${scaleId} cleanup to succeed`).toBe(true)
  }

  const deletePackage = await readJsonResponse<DeleteResponse>(
    await deleteWithCsrf(page, '/api/lexis/rpc/application-details/package', {
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
    await loginWithIdir(idirPage)
  })

  test.afterAll(async () => {
    await idirContext?.close()
  })

  test('shows admin navigation and broad grants', async () => {
    const page = await authenticatedIdirPage()
    const apiServerErrors = collectApiServerErrors(page)

    await expectAccessiblePage(page, '/admin', /administration/i)

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

  test('lands authenticated IDIR admins on provincial review from the app root', async () => {
    const page = await authenticatedIdirPage()

    await page.goto(new URL('/', E2E_BASE_URL).toString(), {
      waitUntil: 'domcontentloaded',
    })

    await expect(page.getByRole('heading', { name: /provincial review/i })).toBeVisible({
      timeout: 30_000,
    })
    await expect.poll(() => new URL(page.url()).pathname).toBe('/provincial/review')
  })

  test('supports collapsible sidebar sections and collapsed icon navigation', async () => {
    const page = await authenticatedIdirPage()

    await expectAccessiblePage(page, '/provincial/review', /provincial review/i)

    const reportsSection = page.locator(sideNavSection('Reports'))
    await expect(reportsSection.getByRole('link', { name: 'Advertising List' })).toBeVisible()
    await reportsSection.getByRole('button', { name: 'Reports' }).click()
    await expect(reportsSection.getByRole('link', { name: 'Advertising List' })).toHaveCount(0)
    await reportsSection.getByRole('button', { name: 'Reports' }).click()
    await expect(reportsSection.getByRole('link', { name: 'Advertising List' })).toBeVisible()

    await page.getByRole('button', { name: 'Collapse side navigation' }).click()
    await expect(page.getByRole('button', { name: 'Expand side navigation' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Review' })).toHaveAttribute('title', 'Review')
    await expect(page.getByRole('link', { name: 'Advertising List' })).toHaveAttribute(
      'title',
      'Advertising List',
    )
    await page.getByRole('button', { name: 'Expand side navigation' }).click()
  })

  test('keeps user access administration read-only and delegates changes to FAM', async () => {
    const page = await authenticatedIdirPage()

    await expectAccessiblePage(page, '/admin', /administration/i)

    const famAccessSection = page.locator('.cds--tile', {
      has: page.getByRole('heading', { name: 'FAM user access lookup' }),
    })
    await expect(famAccessSection).toBeVisible()
    await expect(
      famAccessSection.getByText(
        'Search IDIR users to confirm their FAM identity before managing access in FAM.',
      ),
    ).toBeVisible()
    await expect(famAccessSection.getByLabel('IDIR username')).toBeVisible()
    await expect(famAccessSection.getByRole('button', { name: 'Search FAM Access' })).toBeVisible()

    const manageLink = famAccessSection.getByRole('link', { name: 'Manage in FAM' })
    await expect(manageLink).toBeVisible()
    await expect(manageLink).toHaveAttribute('target', '_blank')
    await expect(manageLink).toHaveAttribute('href', famManageUrlPattern)

    for (const name of [
      /^Grant/i,
      /^Revoke/i,
      /^Add role/i,
      /^Remove role/i,
      /^Save access/i,
      /^Update access/i,
    ]) {
      await expect(famAccessSection.getByRole('button', { name })).toHaveCount(0)
      await expect(famAccessSection.getByRole('link', { name })).toHaveCount(0)
    }
  })

  test('keeps upload navigation scoped to provincial application submissions', async () => {
    const page = await authenticatedIdirPage()

    await expectAccessiblePage(page, '/provincial/review', /provincial review/i)

    const provincialSection = page.locator(sideNavSection('Provincial'))
    const federalSection = page.locator(sideNavSection('Federal'))
    const adminSection = page.locator(sideNavSection('Admin'))

    await expect(provincialSection.getByRole('link', { name: 'Upload' })).toHaveAttribute(
      'href',
      '/provincial/application/upload',
    )
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

    await expectAccessiblePage(page, '/provincial/review', /provincial review/i)

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

  test('does not expose the retired provincial summary page', async () => {
    const page = await authenticatedIdirPage()

    await page.goto(new URL('/provincial/summary', E2E_BASE_URL).toString(), {
      waitUntil: 'domcontentloaded',
    })

    await expect(page.getByRole('heading', { name: '404' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Unauthorized' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /log in with idir/i })).toHaveCount(0)
  })

  test('keeps review queue bulk actions limited to approve', async () => {
    const page = await authenticatedIdirPage()

    await expectAccessiblePage(page, '/provincial/review', /provincial review/i)

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

  test('shows average monthly values date and template controls', async () => {
    const page = await authenticatedIdirPage()

    await expectAccessiblePage(page, '/admin/rtm/emslogamv', /average monthly values/i)
    await expect(
      page.getByText(
        'Query current and historical average monthly value rows, make manual create/update entries, and generate an upload preview from XLSX files.',
      ),
    ).toBeVisible()
    await expect(page.locator('#rtm-retrieval-date')).toBeVisible()
    await expect(page.locator('#rtm-update-date')).toBeVisible()

    const today = await browserLocalIsoToday(page)
    await expect(page.locator('#rtm-retrieval-date')).toHaveValue(today)
    await expect(page.locator('#rtm-update-date')).toHaveValue(today)
    await expect(page.locator('#rtm-manual-retrieval-date')).toHaveValue(today)
    await page.locator('#rtm-save-mode').selectOption('update')
    await expect(page.locator('#rtm-manual-update-date')).toHaveValue(today)

    const templateLink = page.getByRole('link', { name: 'Download template' })
    await expect(templateLink).toHaveAttribute('href', '/templates/rtm-ems-log-amv-template.xlsx')
    await expect(templateLink).toHaveAttribute('download', 'rtm-ems-log-amv-template.xlsx')
    await expect(
      page.getByText(
        'Supported format: .xlsx. The template includes retrieval and update date rows, and values apply to old and second growth.',
      ),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'Preview data' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Apply upload' })).toBeDisabled()
  })

  test('shows selected natural resource region names across search filters', async () => {
    const page = await authenticatedIdirPage()

    for (const [path, heading] of regionFilterPages) {
      await expectAccessiblePage(page, path, heading)
      await expect(
        page.getByText(selectedNaturalResourceRegionText, { exact: true }),
        `${path} should show selected region names, not only a selected count`,
      ).toBeVisible({ timeout: 30_000 })
    }
  })

  test('prefills create application with legacy defaults and next list date', async () => {
    const page = await authenticatedIdirPage()

    const options = await readJsonResponse<GenericOptionsResponse>(
      await getWithAuth(page, '/api/lexis/applications/search/options'),
    )
    const currentSchedules = asRecordArray(options.currentSchedules)
    expectCurrentScheduleOptions(currentSchedules, 'create application list dates')
    const nextListDate = optionName(currentSchedules.find((schedule) => optionCode(schedule)) ?? {})
    expect(nextListDate, 'create application should have a next list date option').toMatch(
      isoDatePattern,
    )

    await expectAccessiblePage(
      page,
      '/provincial/application/create',
      /create provincial application/i,
    )
    const today = await browserLocalIsoToday(page)

    await expect(page.getByRole('combobox', { name: 'Product type' })).toHaveValue(
      'Harvested Timber',
    )
    await expect(page.getByRole('combobox', { name: 'Exemption reason' })).toHaveValue('Surplus')
    await expect(page.getByRole('combobox', { name: 'Region' })).toHaveValue(
      'Cariboo Natural Resource Region',
    )
    await expect(page.getByRole('textbox', { name: 'Application date (YYYY-MM-DD)' })).toHaveValue(
      today,
    )
    await expect(page.getByRole('textbox', { name: 'Received date (YYYY-MM-DD)' })).toHaveValue(
      today,
    )
    await expect(page.getByRole('combobox', { name: 'Listing date' })).toHaveValue(nextListDate)

    await page.getByRole('tab', { name: 'Clients' }).click()
    await expect(page.getByRole('combobox', { name: 'Applicant type' })).toHaveValue('Owner')
  })

  test('shows create application tabs, save workflow, and disabled document upload', async () => {
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

    await page.getByRole('tab', { name: 'Documents' }).click()
    await expect(page.getByRole('heading', { name: 'Documents', exact: true })).toBeVisible()
    await expect(page.getByText('Upload documents')).toBeVisible()
    await expect(
      page.getByText('Multiple files can be queued and submitted together.'),
    ).toBeVisible()
    await expect(page.getByText('Queued files')).toBeVisible()
    await expect(page.getByText('Save the application before uploading documents.')).toBeVisible()
    await expect(page.getByLabel('Document File')).toBeDisabled()
    await expect(page.getByText('Browse files', { exact: true })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
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
    expectCurrentScheduleOptions(
      provincialOptions.currentSchedules,
      'provincial application list dates',
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
    expectCurrentScheduleOptions(reportOptions.currentSchedules, 'report list dates')

    const exportSchedules = await readJsonResponse<GenericSearchResponse>(
      await getWithAuth(page, '/api/lexis/admin/schedules'),
    )
    expect(Array.isArray(exportSchedules.results)).toBe(true)
    expect(exportSchedules.total).toEqual(expect.any(Number))
    expect(exportSchedules.page).toBe(0)
    expect(exportSchedules.size).toBe(100)
  })

  test('shows report advertising date selector from current list dates', async () => {
    const page = await authenticatedIdirPage()

    const reportOptions = await readJsonResponse<GenericOptionsResponse>(
      await getWithAuth(page, '/api/lexis/reports/options'),
    )
    const currentSchedules = asRecordArray(reportOptions.currentSchedules)
    expectCurrentScheduleOptions(currentSchedules, 'report advertising date selector')

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

    for (const optionLabel of [...datedSchedules.slice(0, 2).map(optionName), 'Blank']) {
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
    await expect(page.getByRole('button', { name: 'Generate Report' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Reset Fields' })).toBeVisible()
  })

  test('generates advertising list PDF report', async () => {
    const page = await authenticatedIdirPage()

    const response = await postAdvertisingListReport(page, 'PDF')
    const body = await readReportBody(response, 'advertising list PDF report')
    const headers = response.headers()

    expect(headers['content-type']?.toLowerCase() ?? '').toContain('application/pdf')
    expect(headers['content-disposition'] ?? '').toContain('biweeklyListing.pdf')
    expect(body.length, 'advertising list PDF should not be empty').toBeGreaterThan(100)
    expect(body.toString('utf8', 0, 4)).toBe('%PDF')
  })

  test('generates advertising list CSV report with owner and agent email columns', async () => {
    const page = await authenticatedIdirPage()

    const response = await postAdvertisingListReport(page, 'CSV')
    const body = await readReportBody(response, 'advertising list CSV report')
    const headers = response.headers()
    const csv = body.toString('utf8')
    const header = csv.split(/\r?\n/, 1)[0] ?? ''

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

  // TODO: Re-enable this EXPORT_SCHEDULE write regression once TEST grants allow
  // INSERT/UPDATE/DELETE on EXPORT_SCHEDULE and access to EXPORT_SCHEDULE_SEQ.
  test.skip('can create, update, and delete future export schedule rows', async () => {
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

  // TODO: Re-enable this EXPORT_SCHEDULE write regression once TEST grants allow
  // INSERT/UPDATE/DELETE on EXPORT_SCHEDULE and access to EXPORT_SCHEDULE_SEQ.
  test.skip('rejects duplicate future export schedule advertising dates', async () => {
    const page = await authenticatedIdirPage()
    let scheduleId: string | null = null

    try {
      const { createRequest, scheduleId: createdScheduleId } =
        await createRegressionExportSchedule(page)
      scheduleId = createdScheduleId

      const duplicate = await readJsonResponse<ExportScheduleMutationResponse>(
        await postWithCsrf(page, '/api/lexis/admin/schedules', {
          data: createRequest,
        }),
        400,
      )
      expect(duplicate.success).toBe(false)
      expect(duplicate.message ?? '').toContain(
        'A schedule already exists for that advertising date.',
      )
      expect(duplicate.schedule ?? null).toBeNull()
    } finally {
      if (scheduleId) {
        await deleteRegressionExportSchedule(page, scheduleId)
      }
    }
  })

  test('can reach protected write validation endpoints without mutating real data', async () => {
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

    const approveResponse = await readReviewStatusResponse(
      await postWithCsrf(
        page,
        `/api/lexis/application-reviews/${missingApplicationNumber}/approve`,
      ),
    )
    expect(approveResponse.updated).toBe(false)
    expect(approveResponse.message ?? '').toContain('Application was not updated.')

    const rejectResponse = await readReviewStatusResponse(
      await postWithCsrf(
        page,
        `/api/lexis/application-reviews/${missingApplicationNumber}/status`,
        {
          data: {
            statusCode: 'REJ',
            remark: 'IDIR admin regression authorization check',
            clientEmailAddress: '',
          },
        },
      ),
    )
    expect(rejectResponse.updated).toBe(false)
    expect(rejectResponse.message ?? '').toContain('Application status update did not persist.')

    const emailResponse = await readReviewStatusEmailResponse(
      await postWithCsrf(
        page,
        `/api/lexis/application-reviews/${missingApplicationNumber}/status-email`,
        {
          data: {
            statusCode: 'REJ',
            remark: 'IDIR admin regression authorization check',
            clientEmailAddress: '',
          },
        },
      ),
    )
    expect(emailResponse.success).toBe(false)
    expect(emailResponse.message ?? '').toContain('Status code and client email are required.')

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

    const rtmPreviewResponse = await readJsonResponseWithStatuses<RtmUploadPreviewResponse>(
      await postWithCsrf(page, '/api/lexis/rtm/emslogamv/preview', {
        multipart: {
          file: {
            name: 'rtm-ems-log-amv-template.xlsx',
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            buffer: rtmSuccessWorkbook,
          },
        },
      }),
      [200, 422],
    )
    if (rtmPreviewResponse.status === 200) {
      expect(rtmPreviewResponse.payload.status).toBe('accepted')
      expect(rtmPreviewResponse.payload.rowCount).toBeGreaterThan(0)
      expect(asStringArray(rtmPreviewResponse.payload.errors)).toEqual([])
    } else {
      expect(rtmPreviewResponse.payload.status).toBe('validation_failed')
      expect(asStringArray(rtmPreviewResponse.payload.errors).join(' ')).toContain('update date')
    }
  })

  test('rejects ClamAV test payloads on application document and submission uploads', async () => {
    const page = await authenticatedIdirPage()

    expectApplicationDocumentVirusScanRejection(
      await postRegressionApplicationDocumentFile(page, infectedApplicationDocumentPdf()),
    )

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

  test('validates, submits, reviews, and cleans up an IDIR application upload', async () => {
    const page = await authenticatedIdirPage()
    const packageNumber = uniqueRegressionPackageNumber()
    let applicationNumber: number | null = null

    try {
      const validationResult = await postRegressionSubmission(
        page,
        '/api/lexis/application-submissions/validation',
        packageNumber,
      )
      expect(validationResult.status).toBe('validated')
      expect(validationResult.packageNumber).toBe(packageNumber)
      expect(validationResult.scaleRows).toBe(3)
      expect(asStringArray(validationResult.errors)).toEqual([])

      const submissionResult = await postRegressionSubmission(
        page,
        '/api/lexis/application-submissions',
        packageNumber,
      )
      expect(submissionResult.status).toBe('accepted')
      expect(submissionResult.packageNumber).toBe(packageNumber)
      expect(submissionResult.scaleRows).toBe(3)
      expect(asStringArray(submissionResult.errors)).toEqual([])
      expect(submissionResult.applicationNumber).toEqual(expect.any(Number))
      applicationNumber = submissionResult.applicationNumber ?? null

      if (applicationNumber === null) {
        throw new Error('IDIR application submission did not return an application number.')
      }

      await expectAccessiblePage(
        page,
        `/provincial/application/${applicationNumber}`,
        /provincial application details/i,
      )
      await page.getByRole('tab', { name: 'Documents' }).click()
      await expect(
        page
          .locator('.detail-tile-title')
          .filter({ hasText: /^Documents\b/ })
          .first(),
      ).toBeVisible()
      await expect(page.getByText('Upload documents').first()).toBeVisible()
      await expect(
        page.getByText('Multiple files can be queued and submitted together.').first(),
      ).toBeVisible()
      await expect(page.getByText('Queued files').first()).toBeVisible()
      await expect(page.getByText('Drag and drop files here, or browse for files.')).toBeVisible()
      await expect(page.getByLabel('Document File')).toBeEnabled()
      await expect(page.getByText('Browse files', { exact: true })).toHaveAttribute(
        'aria-disabled',
        'false',
      )

      const approved = await readJsonResponse<ReviewStatusResponse>(
        await postWithCsrf(page, `/api/lexis/application-reviews/${applicationNumber}/approve`),
      )
      expect(approved.valid).toBe(true)
      expect(approved.updated).toBe(true)
      expect(approved.statusCode).toBe('APP')

      const rejected = await readJsonResponse<ReviewStatusResponse>(
        await postWithCsrf(page, `/api/lexis/application-reviews/${applicationNumber}/status`, {
          data: {
            statusCode: 'REJ',
            remark: regressionStatusRemark,
            clientEmailAddress: regressionClientEmail,
          },
        }),
      )
      expect(rejected.valid).toBe(true)
      expect(rejected.updated).toBe(true)
      expect(rejected.statusCode).toBe('REJ')
      expect(rejected.remark).toBe(regressionStatusRemark)
    } finally {
      if (applicationNumber !== null) {
        await cleanupRegressionPackage(page, applicationNumber, packageNumber).catch(
          () => undefined,
        )
      }
    }
  })

  test('returns an expired IDIR admin session to the login shell', async () => {
    const page = await authenticatedIdirPage()

    await expectAccessiblePage(page, '/admin', /administration/i)
    await page.evaluate((eventName) => {
      window.dispatchEvent(
        new CustomEvent(eventName, {
          detail: { reason: 'idle-timeout' },
        }),
      )
    }, sessionExpiredEventName)

    await expectLoginShell(page, 'Expired IDIR admin session')
  })

  test('signs out to the login shell', async () => {
    const page = await authenticatedIdirPage()

    await expectAccessiblePage(page, '/admin', /administration/i)
    const profileButton = page.locator('button[aria-controls="profile-panel"]')
    if ((await profileButton.getAttribute('aria-expanded')) !== 'true') {
      await profileButton.click()
    }
    const openProfilePanel = page.locator('#profile-panel.is-open')
    await expect(openProfilePanel).toBeVisible()
    const signOutButton = openProfilePanel.getByRole('button', { name: /sign out/i })
    await expect(signOutButton).toBeVisible()
    await signOutButton.click()

    await expectLoginShell(page, 'Logout')
  })
})
