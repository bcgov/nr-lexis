import { expect, test } from '@playwright/test'
import {
  collectApiServerErrors,
  expectAccessiblePage,
  expectForbiddenPost,
  expectInvalidApplicationCreateValidation,
  expectRouteUnauthorized,
  fetchSessionCapabilities,
  hasBusinessBceidCredentials,
  loginWithBusinessBceid,
  postWithCsrf,
  TEST_PROVINCIAL_APPLICATION_NUMBER,
  TEST_UNOWNED_APPLICATION_NUMBER,
} from './utils/real-auth'

const sideNavSection = (name: string) =>
  `.csp-side-nav__section:has(.csp-side-nav__category:text-is("${name}"))`

const visibleProvincialLinks = [
  'Create/edit application',
  'Upload application submission',
  'Application search',
  'Exemption search',
  'Offer search',
  'Permit search',
]

const hiddenProvincialLinks = [
  'Application review',
  'Summary',
  'Create/edit exemption',
  'Create/edit offer',
]

const accessibleSubmitterPages: Array<[path: string, heading: RegExp]> = [
  ['/provincial/application', /provincial application search/i],
  ['/provincial/application/create', /create provincial application/i],
  ['/provincial/application/upload', /upload application submission/i],
  ['/provincial/exemption', /provincial exemption search/i],
  ['/provincial/offers', /provincial offers search/i],
  ['/provincial/permit', /provincial permit search/i],
]

const unauthorizedSubmitterPages = [
  '/provincial/review',
  '/provincial/summary',
  '/provincial/exemption/create',
  '/provincial/offers/create',
  '/federal',
  '/federal/application/upload',
  '/admin',
  '/admin/uploads',
]

const restrictedWriteChecks: Array<{
  path: string
  data?: Record<string, unknown>
}> = [
  {
    path: '/api/lexis/application-reviews/999999999/approve',
  },
  {
    path: '/api/lexis/application-reviews/999999999/status',
    data: {
      statusCode: 'R',
      remark: 'Regression authorization check',
      clientEmailAddress: '',
    },
  },
  {
    path: '/api/lexis/application-reviews/999999999/status-email',
    data: {
      statusCode: 'R',
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

test.describe('real TEST Business BCeID provincial submitter', () => {
  test.describe.configure({ retries: 0 })
  test.skip(!hasBusinessBceidCredentials(), 'Business BCeID e2e credentials are not configured.')

  test('shows provincial submitter navigation without restricted links', async ({ page }) => {
    const apiServerErrors = collectApiServerErrors(page)

    await loginWithBusinessBceid(page)
    await expectAccessiblePage(page, '/provincial/application', /provincial application search/i)

    const capabilities = await fetchSessionCapabilities(page)
    expect(capabilities.authenticated).toBe(true)
    expect(String(capabilities.roles ?? '')).toContain('PROVINCIAL_SUBMITTER')

    const provincialSection = page.locator(sideNavSection('Provincial'))
    await expect(provincialSection).toBeVisible()

    for (const linkName of visibleProvincialLinks) {
      await expect(provincialSection.getByRole('link', { name: linkName })).toBeVisible()
    }

    for (const linkName of hiddenProvincialLinks) {
      await expect(provincialSection.getByRole('link', { name: linkName })).toHaveCount(0)
    }

    await expect(page.locator(sideNavSection('Federal'))).toHaveCount(0)
    await expect(page.locator(sideNavSection('Administration'))).toHaveCount(0)

    expect(apiServerErrors).toEqual([])
  })

  test('opens submitter read/search/upload pages without mutating data', async ({ page }) => {
    const apiServerErrors = collectApiServerErrors(page)

    await loginWithBusinessBceid(page)

    for (const [path, heading] of accessibleSubmitterPages) {
      await expectAccessiblePage(page, path, heading)
    }

    for (const path of unauthorizedSubmitterPages) {
      await expectRouteUnauthorized(page, path)
    }

    expect(apiServerErrors).toEqual([])
  })

  test('cannot perform restricted write endpoints', async ({ page }) => {
    await loginWithBusinessBceid(page)

    for (const check of restrictedWriteChecks) {
      await expectForbiddenPost(page, check.path, { data: check.data })
    }
  })

  test('can reach application create validation without creating an application', async ({
    page,
  }) => {
    const apiServerErrors = collectApiServerErrors(page)

    await loginWithBusinessBceid(page)

    const response = await postWithCsrf(page, '/api/lexis/rpc/application-details/application', {
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
    })

    await expectInvalidApplicationCreateValidation(response)
    expect(apiServerErrors).toEqual([])
  })

  test('can open and prepare edits on an owned application when configured', async ({ page }) => {
    test.skip(
      !TEST_PROVINCIAL_APPLICATION_NUMBER,
      'Set E2E_PROVINCIAL_APPLICATION_NUMBER to verify owned application detail access.',
    )

    const apiServerErrors = collectApiServerErrors(page)

    await loginWithBusinessBceid(page)
    await expectAccessiblePage(
      page,
      `/provincial/application/${TEST_PROVINCIAL_APPLICATION_NUMBER}`,
      /provincial application details/i,
    )

    await expect(page.getByRole('heading', { name: 'Application summary' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save Summary' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Approve Application' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Create offer' })).toBeDisabled()

    const logLocation = page.getByLabel('Location of logs')
    const currentValue = await logLocation.inputValue()
    await logLocation.fill(`${currentValue} `)
    await expect(logLocation).toHaveValue(`${currentValue} `)
    await page.getByRole('button', { name: 'Reset Summary' }).click()
    await expect(logLocation).toHaveValue(currentValue)

    expect(apiServerErrors).toEqual([])
  })

  test('does not expose unowned application details when configured', async ({ page }) => {
    test.skip(
      !TEST_UNOWNED_APPLICATION_NUMBER,
      'Set E2E_PROVINCIAL_UNOWNED_APPLICATION_NUMBER to verify submitter data scoping.',
    )

    await loginWithBusinessBceid(page)
    await expectRouteUnauthorized(
      page,
      `/provincial/application/${TEST_UNOWNED_APPLICATION_NUMBER}`,
    )
  })
})
