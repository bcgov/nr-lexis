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
} from './utils/regression-auth'
import { E2E_BASE_URL } from './utils'

const sideNavSection = (name: string) =>
  `.csp-side-nav__section:has(.csp-side-nav__category:text-is("${name}"))`

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
    applicationReceiptDate: isoDate(addUtcDays(date, -1)),
    offerReceiptDate: isoDate(addUtcDays(date, 14)),
    offerEndDate: isoDate(addUtcDays(date, 21)),
    offerWithdrawalDate: isoDate(addUtcDays(date, 28)),
    teacMeetingDate: isoDate(addUtcDays(date, 19)),
  }
}

const uniqueRegressionScheduleRequests = (
  schedules: Record<string, unknown>[],
): {
  createRequest: ExportScheduleRequest
  updateRequest: ExportScheduleRequest
} => {
  const usedDates = new Set(
    schedules
      .map((schedule) => String(schedule.advertisingDate ?? '').slice(0, 10))
      .filter(Boolean),
  )
  const baseDate = new Date(Date.UTC(2090, 0, 1))
  const seed = Date.now() % 1500

  for (let offset = 0; offset < 5000; offset += 1) {
    const createDate = isoDate(addUtcDays(baseDate, seed + offset * 2))
    const updateDate = isoDate(addUtcDays(baseDate, seed + offset * 2 + 1))
    if (!usedDates.has(createDate) && !usedDates.has(updateDate)) {
      return {
        createRequest: scheduleRequestForAdvertisingDate(createDate),
        updateRequest: scheduleRequestForAdvertisingDate(updateDate),
      }
    }
  }

  throw new Error('Unable to find unused future export schedule dates for regression.')
}

const safeUrlForLog = (rawUrl: string): string => {
  try {
    const url = new URL(rawUrl)
    return `${url.origin}${url.pathname}`
  } catch {
    return '[unparseable-url]'
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
const regressionStatusRemark = 'Weekly credentialed regression status check'
const regressionClientEmail = 'lexis-regression@example.test'
const naturalResourceRegionCodes = ['1903', '1904', '1905', '1906', '1907', '1908', '1909', '1910']
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/

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

const adminNavigationSections: Array<{
  section: string
  links: string[]
}> = [
  {
    section: 'Provincial',
    links: [
      'Application review',
      'Create/edit application',
      'Upload application submission',
      'Application search',
      'Create/edit exemption',
      'Exemption search',
      'Create/edit offer',
      'Offer search',
      'Permit search',
    ],
  },
  {
    section: 'Federal',
    links: ['Application search', 'Upload application submission'],
  },
  {
    section: 'Reports',
    links: ['Reports menu'],
  },
  {
    section: 'Administration',
    links: [
      'LEXIS administration',
      'Fee policy administration',
      'Data upload',
      'Average Monthly Values',
    ],
  },
]

const adminAccessiblePages: Array<[path: string, heading: RegExp]> = [
  ['/admin', /administration/i],
  ['/admin/policies', /policy center/i],
  ['/admin/uploads', /data upload/i],
  ['/provincial/review', /provincial review/i],
  ['/provincial/application/create', /create provincial application/i],
  ['/provincial/application/upload', /upload application submission/i],
  ['/provincial/application', /provincial application search/i],
  ['/federal', /federal application search/i],
  ['/federal/application/upload', /upload federal application submission/i],
  ['/reports', /reports/i],
  ['/admin/rtm/emslogamv', /average monthly values/i],
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

const visibleProvincialSubmitterLinks = [
  'Create/edit application',
  'Upload application submission',
  'Application search',
  'Exemption search',
  'Offer search',
  'Permit search',
]

const hiddenProvincialSubmitterLinks = [
  'Application review',
  'Create/edit exemption',
  'Create/edit offer',
]

const submitterAccessiblePages: Array<[path: string, heading: RegExp]> = [
  ['/provincial/application', /provincial application search/i],
  ['/provincial/application/create', /create provincial application/i],
  ['/provincial/application/upload', /upload application submission/i],
  ['/provincial/exemption', /provincial exemption search/i],
  ['/provincial/offers', /provincial offers search/i],
  ['/provincial/permit', /provincial permit search/i],
]

const unauthorizedSubmitterPages = [
  '/provincial/review',
  '/provincial/exemption/create',
  '/provincial/offers/create',
  '/federal',
  '/federal/application/upload',
  '/admin',
  '/admin/uploads',
]

const restrictedSubmitterWriteChecks: Array<{
  path: string
  data?: Record<string, unknown>
}> = [
  {
    path: '/api/lexis/application-reviews/999999999/approve',
  },
  {
    path: '/api/lexis/application-reviews/999999999/status',
    data: {
      statusCode: 'REJ',
      remark: 'Regression authorization check',
      clientEmailAddress: '',
    },
  },
  {
    path: '/api/lexis/application-reviews/999999999/status-email',
    data: {
      statusCode: 'REJ',
      remark: 'Regression authorization check',
      clientEmailAddress: 'nobody@example.com',
    },
  },
  {
    path: '/api/lexis/rpc/exemption-details/exemption',
    data: {
      exemptionNumber: '999999999',
      applicationNumber: '999999999',
      exemptionTypeCode: 'O',
      exemptionStatusCode: 'D',
    },
  },
  {
    path: '/api/lexis/rpc/exemption-details/exemption/update',
    data: {
      exemptionNumber: '999999999',
      exemptionTypeCode: 'O',
      exemptionStatusCode: 'D',
    },
  },
  {
    path: '/api/lexis/rpc/exemption-details/approve-exemptions',
    data: {
      exemptionNumbers: ['999999999'],
    },
  },
  {
    path: '/api/lexis/rpc/offer-details/offer',
    data: {
      offerNumber: '999999999',
      applicationNumber: '999999999',
      packageNumber: 'REGRESSION-NO-WRITE',
    },
  },
  {
    path: '/api/lexis/rpc/offer-details/offer/update',
    data: {
      offerNumber: '999999999',
      applicationNumber: '999999999',
      packageNumber: 'REGRESSION-NO-WRITE',
    },
  },
  {
    path: '/api/lexis/admin/policies/fee',
    data: {
      effectiveDate: '2099-01-01',
      rate: 0,
    },
  },
]

const readReviewStatusResponse = async (
  response: Awaited<ReturnType<typeof postWithCsrf>>,
): Promise<ReviewStatusResponse> => {
  const text = await response.text()
  expect(response.status(), text.slice(0, 500)).toBe(200)
  return JSON.parse(text) as ReviewStatusResponse
}

const readReviewStatusEmailResponse = async (
  response: Awaited<ReturnType<typeof postWithCsrf>>,
): Promise<ReviewStatusEmailResponse> => {
  const text = await response.text()
  expect(response.status(), text.slice(0, 500)).toBe(200)
  return JSON.parse(text) as ReviewStatusEmailResponse
}

const expectAdminNavigation = async (page: Page): Promise<void> => {
  for (const { section, links } of adminNavigationSections) {
    const navSection = page.locator(sideNavSection(section))
    await expect(navSection, `${section} navigation section should be visible`).toBeVisible()

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
  expect(response.status(), text.slice(0, 500)).toBe(expectedStatus)
  return JSON.parse(text) as T
}

const readJsonResponseWithStatuses = async <T>(
  response: APIResponse,
  expectedStatuses: number[],
): Promise<JsonWithStatus<T>> => {
  const text = await response.text()
  const status = response.status()
  expect(expectedStatuses, text.slice(0, 500)).toContain(status)
  return {
    status,
    payload: JSON.parse(text) as T,
  }
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

test.describe.serial('TEST IDIR admin regression', () => {
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
    expect(apiServerErrors).toEqual([])
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

    for (const [path, heading] of adminAccessiblePages) {
      await expectAccessiblePage(page, path, heading)
    }

    expect(apiServerErrors).toEqual([])
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

    const feePolicies = await readJsonResponse<unknown>(
      await getWithAuth(page, '/api/lexis/admin/policies/fee'),
    )
    expect(feePolicies).toBeTruthy()

    const filPolicies = await readJsonResponse<unknown>(
      await getWithAuth(page, '/api/lexis/admin/policies/fil'),
    )
    expect(filPolicies).toBeTruthy()

    const reportOptions = await readJsonResponse<GenericOptionsResponse>(
      await getWithAuth(page, '/api/lexis/reports/options'),
    )
    expect(Array.isArray(reportOptions.regions)).toBe(true)
    expect(Array.isArray(reportOptions.reportJurisdictions)).toBe(true)
    expectNaturalResourceRegions(reportOptions.regions, 'report options')
    expectCurrentScheduleOptions(reportOptions.currentSchedules, 'report list dates')

    const exportSchedules = await readJsonResponse<unknown>(
      await getWithAuth(page, '/api/lexis/admin/schedules'),
    )
    expect(Array.isArray(exportSchedules)).toBe(true)
  })

  test('can create, update, and delete future export schedule rows', async () => {
    const page = await authenticatedIdirPage()
    const existingSchedules = asRecordArray(
      await readJsonResponse<unknown>(await getWithAuth(page, '/api/lexis/admin/schedules')),
    )
    const { createRequest, updateRequest } = uniqueRegressionScheduleRequests(existingSchedules)
    let scheduleId: string | null = null
    let deleted = false

    try {
      const created = await readJsonResponse<ExportScheduleMutationResponse>(
        await postWithCsrf(page, '/api/lexis/admin/schedules', {
          data: createRequest,
        }),
      )
      expect(created.success).toBe(true)
      expect(created.message ?? '').toContain('added')

      const createdSchedule = asRecord(created.schedule)
      scheduleId = String(createdSchedule.exportScheduleId ?? '').trim()
      expect(scheduleId).not.toBe('')
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

      const schedulesAfterUpdate = asRecordArray(
        await readJsonResponse<unknown>(await getWithAuth(page, '/api/lexis/admin/schedules')),
      )
      const persistedSchedule = schedulesAfterUpdate.find(
        (schedule) => String(schedule.exportScheduleId ?? '') === scheduleId,
      )
      expect(persistedSchedule).toBeTruthy()
      expect(persistedSchedule?.advertisingDate).toBe(updateRequest.advertisingDate)
      expect(persistedSchedule?.mutable).toBe(true)

      const deleteResponse = await readJsonResponse<ExportScheduleMutationResponse>(
        await deleteWithCsrf(page, `/api/lexis/admin/schedules/${encodeURIComponent(scheduleId)}`),
      )
      expect(deleteResponse.success).toBe(true)
      expect(deleteResponse.message ?? '').toContain('deleted')
      deleted = true

      const schedulesAfterDelete = asRecordArray(
        await readJsonResponse<unknown>(await getWithAuth(page, '/api/lexis/admin/schedules')),
      )
      expect(
        schedulesAfterDelete.some(
          (schedule) => String(schedule.exportScheduleId ?? '') === scheduleId,
        ),
      ).toBe(false)
    } finally {
      if (scheduleId && !deleted) {
        await deleteWithCsrf(
          page,
          `/api/lexis/admin/schedules/${encodeURIComponent(scheduleId)}`,
        ).catch(() => undefined)
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
    expect(rtmSearchResponse.status(), rtmSearchText.slice(0, 500)).toBe(200)
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

  test('signs out to the login shell', async () => {
    const page = await authenticatedIdirPage()
    const baseOrigin = new URL(E2E_BASE_URL).origin

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

    try {
      await expect(page.getByRole('button', { name: /log in with idir/i })).toBeVisible({
        timeout: 60_000,
      })
    } catch (error) {
      const currentUrl = page.url()
      if (/amazoncognito\.com\/error/i.test(currentUrl)) {
        throw new Error(
          `Cognito rejected the configured logout redirect: ${safeUrlForLog(currentUrl)}`,
        )
      }
      if (/loginproxy\.gov\.bc\.ca/i.test(currentUrl)) {
        throw new Error(
          `LoginProxy did not return to the LEXIS login shell: ${safeUrlForLog(currentUrl)}`,
        )
      }
      if (currentUrl.startsWith(`${baseOrigin}/unauthorized`)) {
        throw new Error(
          `Logout landed on the LEXIS unauthorized page: ${safeUrlForLog(currentUrl)}`,
        )
      }
      throw error
    }

    expect(new URL(page.url()).origin).toBe(baseOrigin)
    await expect(page.getByRole('button', { name: /log in with business bceid/i })).toBeVisible()
  })
})
