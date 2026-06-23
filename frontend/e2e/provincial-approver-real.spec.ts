import { expect, type Page, test } from '@playwright/test'
import {
  collectApiServerErrors,
  expectAccessiblePage,
  expectRouteUnauthorized,
  fetchSessionCapabilities,
  hasIdirCredentials,
  loginWithIdir,
  postWithCsrf,
  TEST_IDIR_APPLICATION_NUMBER,
  TEST_IDIR_APPROVE_APPLICATION_NUMBER,
  TEST_IDIR_ENABLE_MUTATION_TESTS,
  TEST_IDIR_EXPECTED_PRINCIPAL,
  TEST_IDIR_REJECT_APPLICATION_NUMBER,
} from './utils/real-auth'

const sideNavSection = (name: string) =>
  `.csp-side-nav__section:has(.csp-side-nav__category:text-is("${name}"))`

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.map((item) => String(item)) : []

const hasApplicationApproverRole = (roles: string[]): boolean =>
  roles.some((role) => role === 'APPLICATION_APPROVER' || role === 'LEXIS_APPLICATION_APPROVER')

const hasProvincialSubmitterRole = (roles: string[]): boolean =>
  roles.some(
    (role) =>
      role === 'PROVINCIAL_SUBMITTER' ||
      role === 'LEXIS_PROVINCIAL_SUBMITTER' ||
      role.startsWith('PROVINCIAL_SUBMITTER_') ||
      role.startsWith('LEXIS_PROVINCIAL_SUBMITTER_'),
  )

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
  statusCode?: string | null
  clientEmail?: string | null
  remark?: string | null
  message?: string | null
}

type ReviewStatusEmailResponse = {
  success?: boolean
  message?: string | null
}

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

const missingApplicationNumber = '999999999'

const applicationReviewPanel = (page: Page) => page.locator('#application-review')

const openApplicationReviewDetail = async (
  page: Page,
  applicationNumber: string,
): Promise<void> => {
  await expectAccessiblePage(
    page,
    `/provincial/application/${applicationNumber}`,
    /provincial application details/i,
  )
  await expect(page.getByRole('heading', { name: 'Application review' })).toBeVisible()
}

const chooseReviewStatus = async (page: Page, statusLabel: string): Promise<void> => {
  const reviewPanel = applicationReviewPanel(page)
  const statusComboBox = reviewPanel.getByRole('combobox', { name: /application status/i })
  await statusComboBox.click()
  await statusComboBox.fill(statusLabel)
  await page.getByRole('option', { name: statusLabel }).click()
}

test.describe('real TEST IDIR provincial application approver', () => {
  test.describe.configure({ retries: 0 })
  test.skip(!hasIdirCredentials(), 'IDIR e2e credentials are not configured.')

  test('shows approver navigation and review access', async ({ page }) => {
    const apiServerErrors = collectApiServerErrors(page)

    await loginWithIdir(page)
    await expectAccessiblePage(page, '/provincial/review', /provincial review/i)

    const capabilities = await fetchSessionCapabilities(page)
    const roles = asStringArray(capabilities.roles)
    const grantedActions = asStringArray(capabilities.grantedActions)

    expect(capabilities.authenticated).toBe(true)
    expect(includesPrincipal(capabilities.principal, TEST_IDIR_EXPECTED_PRINCIPAL)).toBe(true)
    expect(hasApplicationApproverRole(roles)).toBe(true)
    expect(hasProvincialSubmitterRole(roles)).toBe(false)
    expect(hasGrantedAction(grantedActions, '/applicationsReview')).toBe(true)
    expect(hasGrantedAction(grantedActions, 'createApplication')).toBe(false)
    expect(hasGrantedAction(grantedActions, 'uploadApplicationSubmission')).toBe(false)

    const provincialSection = page.locator(sideNavSection('Provincial'))
    await expect(provincialSection).toBeVisible()
    await expect(provincialSection.getByRole('link', { name: 'Application review' })).toBeVisible()
    await expect(
      provincialSection.getByRole('link', { name: 'Create/edit application' }),
    ).toHaveCount(0)
    await expect(
      provincialSection.getByRole('link', { name: 'Upload application submission' }),
    ).toHaveCount(0)
    await expectRouteUnauthorized(page, '/provincial/application/create')
    await expectRouteUnauthorized(page, '/provincial/application/upload')

    expect(apiServerErrors).toEqual([])
  })

  test('can open review-ready application detail when configured', async ({ page }) => {
    test.skip(
      !TEST_IDIR_APPLICATION_NUMBER,
      'Set E2E_IDIR_APPLICATION_NUMBER to verify approver application detail access.',
    )

    const apiServerErrors = collectApiServerErrors(page)

    await loginWithIdir(page)
    const capabilities = await fetchSessionCapabilities(page)
    const grantedActions = asStringArray(capabilities.grantedActions)

    test.skip(
      !hasGrantedAction(grantedActions, '/applicationSearch') ||
        !hasGrantedAction(grantedActions, '/applicationDetails'),
      'The configured IDIR approver does not have application detail grants.',
    )

    await openApplicationReviewDetail(page, TEST_IDIR_APPLICATION_NUMBER)

    const reviewPanel = applicationReviewPanel(page)
    await expect(reviewPanel.getByRole('button', { name: 'Approve Application' })).toBeVisible()
    await expect(reviewPanel.getByRole('button', { name: 'Update Review Status' })).toBeVisible()

    expect(apiServerErrors).toEqual([])
  })

  test('can reach approver-only review write endpoints without mutating data', async ({ page }) => {
    await loginWithIdir(page)

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
            remark: 'IDIR regression authorization check',
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
            remark: 'IDIR regression authorization check',
            clientEmailAddress: 'idir-regression@example.test',
          },
        },
      ),
    )
    expect(emailResponse.success).toBe(false)
    expect(emailResponse.message ?? '').toContain('Application status email could not be prepared.')
  })

  test('uses distinct disposable applications for mutating checks when enabled', () => {
    test.skip(
      !TEST_IDIR_ENABLE_MUTATION_TESTS,
      'IDIR mutation checks are disabled for scheduled runs.',
    )

    expect(TEST_IDIR_APPROVE_APPLICATION_NUMBER).not.toBe('')
    expect(TEST_IDIR_REJECT_APPLICATION_NUMBER).not.toBe('')
    expect(TEST_IDIR_APPROVE_APPLICATION_NUMBER).not.toBe(TEST_IDIR_REJECT_APPLICATION_NUMBER)
  })

  test('can approve a dedicated application when configured', async ({ page }) => {
    test.skip(
      !TEST_IDIR_ENABLE_MUTATION_TESTS || !TEST_IDIR_APPROVE_APPLICATION_NUMBER,
      'Enable mutation tests and set E2E_IDIR_APPROVE_APPLICATION_NUMBER to approve a disposable TEST application.',
    )

    await loginWithIdir(page)
    await openApplicationReviewDetail(page, TEST_IDIR_APPROVE_APPLICATION_NUMBER)

    const reviewPanel = applicationReviewPanel(page)
    await reviewPanel.getByRole('button', { name: 'Approve Application' }).click()

    await expect(reviewPanel.getByRole('combobox', { name: /application status/i })).toHaveValue(
      'Approved',
      { timeout: 30_000 },
    )
    await expect(page.getByText('Approved').first()).toBeVisible()

    await page.reload({ waitUntil: 'domcontentloaded' })
    const reloadedReviewPanel = applicationReviewPanel(page)
    await expect(page.getByRole('heading', { name: 'Application review' })).toBeVisible()
    await expect(
      reloadedReviewPanel.getByRole('combobox', { name: /application status/i }),
    ).toHaveValue('Approved', { timeout: 30_000 })
  })

  test('can reject a dedicated application with a persisted remark when configured', async ({
    page,
  }) => {
    test.skip(
      !TEST_IDIR_ENABLE_MUTATION_TESTS || !TEST_IDIR_REJECT_APPLICATION_NUMBER,
      'Enable mutation tests and set E2E_IDIR_REJECT_APPLICATION_NUMBER to reject a disposable TEST application.',
    )

    await loginWithIdir(page)
    await openApplicationReviewDetail(page, TEST_IDIR_REJECT_APPLICATION_NUMBER)

    const reviewPanel = applicationReviewPanel(page)
    const remark = 'IDIR weekly regression rejection'
    await chooseReviewStatus(page, 'Rejected')
    await reviewPanel.getByLabel(/review remark/i).fill(remark)
    await reviewPanel.getByRole('button', { name: 'Update Review Status' }).click()

    await expect(reviewPanel.getByRole('combobox', { name: /application status/i })).toHaveValue(
      'Rejected',
      { timeout: 30_000 },
    )
    await expect(reviewPanel.getByLabel(/review remark/i)).toHaveValue(remark)

    await page.reload({ waitUntil: 'domcontentloaded' })
    const reloadedReviewPanel = applicationReviewPanel(page)
    await expect(page.getByRole('heading', { name: 'Application review' })).toBeVisible()
    await expect(
      reloadedReviewPanel.getByRole('combobox', { name: /application status/i }),
    ).toHaveValue('Rejected', { timeout: 30_000 })
    await expect(reloadedReviewPanel.getByLabel(/review remark/i)).toHaveValue(remark)
  })

  test('reject status requires a review remark in the UI', async ({ page }) => {
    test.skip(
      !TEST_IDIR_APPLICATION_NUMBER,
      'Set E2E_IDIR_APPLICATION_NUMBER to verify detail review validation.',
    )

    await loginWithIdir(page)
    await openApplicationReviewDetail(page, TEST_IDIR_APPLICATION_NUMBER)

    const reviewPanel = applicationReviewPanel(page)
    await chooseReviewStatus(page, 'Rejected')
    await reviewPanel.getByLabel(/review remark/i).fill('')
    await reviewPanel.getByRole('button', { name: 'Update Review Status' }).click()

    await expect(
      page.getByText('Review remark is required when rejecting or withdrawing an application.'),
    ).toBeVisible()
    await expect(reviewPanel.getByLabel(/review remark/i)).toHaveAttribute('aria-invalid', 'true')
  })
})
