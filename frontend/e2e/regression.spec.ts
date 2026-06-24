import { readFileSync } from 'node:fs'
import { expect, type Page, test } from '@playwright/test'
import {
  collectApiServerErrors,
  expectAccessiblePage,
  expectInvalidApplicationCreateValidation,
  fetchSessionCapabilities,
  hasIdirCredentials,
  loginWithIdir,
  postWithCsrf,
  TEST_IDIR_EXPECTED_PRINCIPAL,
} from './utils/regression-auth'

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

const includesPrincipal = (actual: unknown, expected: string): boolean =>
  String(actual ?? '')
    .toUpperCase()
    .includes(expected.toUpperCase())

type ReviewStatusResponse = {
  updated?: boolean
  valid?: boolean
  message?: string | null
}

type ReviewStatusEmailResponse = {
  success?: boolean
  message?: string | null
}

type RtmUploadPreviewResponse = {
  status?: string
  rowCount?: number
  errors?: unknown
}

const missingApplicationNumber = '999999999'
const rtmSuccessWorkbook = readFileSync(
  new URL(
    '../public/templates/rtm-ems-log-amv-template.xlsx',
    import.meta.url,
  ),
)

const adminNavigationSections: Array<{
  section: string
  links: string[]
}> = [
  {
    section: 'Provincial',
    links: [
      'Application review',
      'Summary',
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
    links: ['LEXIS administration', 'Fee policy administration', 'Data upload', 'EMS AMV'],
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
  ['/admin/rtm/emslogamv', /rtm ems log amv/i],
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

const readRtmUploadPreviewResponse = async (
  response: Awaited<ReturnType<typeof postWithCsrf>>,
): Promise<RtmUploadPreviewResponse> => {
  const text = await response.text()
  expect(response.status(), text.slice(0, 500)).toBe(200)
  return JSON.parse(text) as RtmUploadPreviewResponse
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

test.describe('TEST IDIR admin regression', () => {
  test.describe.configure({ retries: 0 })
  test.skip(!hasIdirCredentials(), 'IDIR e2e credentials are not configured.')

  test('shows admin navigation and broad grants', async ({ page }) => {
    const apiServerErrors = collectApiServerErrors(page)

    await loginWithIdir(page)
    await expectAccessiblePage(page, '/admin', /administration/i)

    const capabilities = await fetchSessionCapabilities(page)
    const roles = asStringArray(capabilities.roles)
    const grantedActions = asStringArray(capabilities.grantedActions)

    expect(capabilities.authenticated).toBe(true)
    expect(includesPrincipal(capabilities.principal, TEST_IDIR_EXPECTED_PRINCIPAL)).toBe(true)
    expect(hasAdminRole(roles)).toBe(true)

    for (const action of requiredAdminActions) {
      expect(hasGrantedAction(grantedActions, action), `Expected admin grant for ${action}`).toBe(
        true,
      )
    }

    await expectAdminNavigation(page)
    expect(apiServerErrors).toEqual([])
  })

  test('can open representative admin, provincial, federal, upload, and report pages', async ({
    page,
  }) => {
    const apiServerErrors = collectApiServerErrors(page)

    await loginWithIdir(page)

    for (const [path, heading] of adminAccessiblePages) {
      await expectAccessiblePage(page, path, heading)
    }

    expect(apiServerErrors).toEqual([])
  })

  test('can reach protected write validation endpoints without mutating real data', async ({
    page,
  }) => {
    await loginWithIdir(page)

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
    expect(approveResponse.valid).toBe(false)
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
    expect(rejectResponse.valid).toBe(false)
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
            clientEmailAddress: 'idir-regression@example.test',
          },
        },
      ),
    )
    expect(emailResponse.success).toBe(false)
    expect(emailResponse.message ?? '').toContain('Application status email could not be prepared.')

    const rtmSearchResponse = await page.request.get(
      '/api/lexis/rtm/emslogamv?retrievalDate=2026-01-01&growthIndicator=S',
      { failOnStatusCode: false },
    )
    const rtmSearchText = await rtmSearchResponse.text()
    expect(rtmSearchResponse.status(), rtmSearchText.slice(0, 500)).toBe(200)
    expect(JSON.parse(rtmSearchText)).toEqual(expect.any(Array))

    const rtmPreviewResponse = await readRtmUploadPreviewResponse(
      await postWithCsrf(page, '/api/lexis/rtm/emslogamv/preview', {
        multipart: {
          file: {
            name: 'rtm-ems-log-amv-template.xlsx',
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            buffer: rtmSuccessWorkbook,
          },
        },
      }),
    )
    expect(rtmPreviewResponse.status).toBe('accepted')
    expect(rtmPreviewResponse.rowCount).toBeGreaterThan(0)
    expect(asStringArray(rtmPreviewResponse.errors)).toEqual([])
  })
})
