import { expect, test, type Page } from '@playwright/test'
import { gotoSyntheticRoute, installSyntheticCognitoSession } from './utils'

// These are frontend browser contracts with synthetic sessions and intercepted API responses.
// They do not authenticate against Cognito or verify persistence/authorization in Oracle.
const installParityFixtures = async (page: Page) => {
  await installSyntheticCognitoSession(page, { username: 'PARITY.TESTER', orgUnitNo: '1903' })
  const writes: Array<{ method: string; path: string; body: Record<string, unknown> }> = []
  const unexpectedRequests: string[] = []
  let version = 1
  const federal = {
    applicationNumber: 888,
    federalApplicationNumber: 'FED-888',
    statusCode: 'APP',
    statusDescription: 'Approved',
    ownerClientNumber: '00021234',
    ownerClientLocationCode: '01',
    ownerApplicantType: 'O',
    ownerContactName: 'Pat Example',
    ownerCompanyName: 'Example Forestry Ltd.',
    ownerClientContext: null,
    region: 'Cariboo',
    productType: 'Logs',
    applicationDate: '2026-07-08',
    receivedDate: '2026-07-09',
    listingDate: '2999-12-31',
    termDays: 14,
    logLocation: 'Synthetic location',
    ageClass: 'Mature',
    averageLogVolume: 1,
    applicationVolume: 100,
    endUse: 'Lumber',
    author: 'PARITY.TESTER',
    readOnly: false,
    locked: false,
    lockHeldByCurrentUser: true,
    packages: ['PARITY-PKG'],
    remarks: [],
    offers: [],
    federalPermit: {
      permitNumber: 90001,
      permitIssueDate: '2026-07-10',
      destinationCountry: 'US',
      transportType: 'T',
      transportName: 'Original truck',
      shippingDate: '2026-07-11',
      portOfExport: 'VA',
      otherPortOfExport: null,
    },
  }
  const exemption = {
    exemptionNumber: 'PARITY-BOIC',
    exemptionTypeCode: 'B',
    exemptionTypeDescription: 'Blanket Order in Council',
    exemptionStatusCode: 'CAN',
    exemptionStatusDescription: 'Cancelled',
    approvalDate: null,
    expiryDate: null,
    approvedVolume: 500,
    usedVolume: 0,
    remainingVolume: 500,
    otherConditions: 'Keep existing conditions',
    blanketOic: true,
    permitNumbers: [],
    remarks: [],
  }

  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    let body: unknown
    if (request.method() === 'GET') {
      switch (path) {
        case '/api/lexis/session/capabilities':
          body = {
            authenticated: true,
            principal: 'PARITY.TESTER',
            roles: ['ADMIN'],
            welcomeTarget: '/provincial/application',
            legacyPath: null,
            orgUnitNo: '1903',
            grantedActions: [
              '/applicationSearch',
              '/federalApplicationSearch',
              '/federalApplicationDetails',
              'viewFederalApplication',
              'manageFederalApplication',
              '/exemptionSearch',
              '/exemptionDetails',
              'saveExemption',
            ],
          }
          break
        case '/api/lexis/session/preferences':
          body = { defaultRegion: '1903' }
          break
        case '/api/lexis/federal/applications/888':
          body = federal
          break
        case '/api/lexis/rpc/application-details/package-scales':
          body = [
            {
              id: 'PARITY-SCALE',
              timberMark: 'SYNTH',
              species: 'Fir',
              grade: 'J',
              pieces: 100,
              volume: '100.0',
              permitted: true,
            },
          ]
          break
        case '/api/lexis/exemptions/PARITY-BOIC':
          body = exemption
          break
        case '/api/lexis/exemptions/search/options':
          body = {
            exemptionTypes: [{ code: 'B', name: 'Blanket Order in Council' }],
            exemptionStatuses: [
              { code: 'NEW', name: 'New' },
              { code: 'ACT', name: 'Active' },
              { code: 'CAN', name: 'Cancelled' },
            ],
            regions: [{ code: '1903', name: 'Cariboo' }],
          }
          break
        case '/api/lexis/rpc/exemption-details/edit-context':
          body = {
            rateOverrideEnabled: false,
            fixedFeeRate: '',
            regionNumbers: ['1903'],
            locked: false,
            lockMessage: '',
          }
          break
        case '/api/lexis/rpc/exemption-details/applications':
          body = { applications: [], containsUnmanu: false, ownerNumber: '' }
          break
        case '/api/lexis/rpc/exemption-details/blanket-oic-totals':
          body = { requestedVolume: '0', completedVolume: '0' }
          break
        case '/api/lexis/shipping-reference-options':
          body = {
            countries: [{ code: 'US', name: 'United States' }],
            transportTypes: [{ code: 'T', name: 'Truck' }],
            ports: [{ code: 'VA', name: 'Vancouver' }],
          }
          break
        case '/api/lexis/notifications':
        case '/api/lexis/federal/applications/888/remarks':
        case '/api/lexis/rpc/application-details/document-details':
        case '/api/lexis/rpc/exemption-details/document-details':
        case '/api/lexis/rpc/exemption-details/permits':
          body = []
          break
      }
    } else if (
      request.method() === 'POST' &&
      path === '/api/lexis/rpc/application-details/release-lock'
    ) {
      body = { success: true }
    } else if (
      request.method() === 'PUT' &&
      path === '/api/lexis/federal/applications/888/permit'
    ) {
      const payload = request.postDataJSON() as Record<string, unknown>
      writes.push({ method: request.method(), path, body: payload })
      Object.assign(federal.federalPermit, payload)
      version += 1
      body = { success: true, message: 'Federal permit updated.', errors: [] }
    } else if (
      request.method() === 'POST' &&
      path === '/api/lexis/federal/applications/888/status'
    ) {
      const payload = request.postDataJSON() as { statusCode: string; remark: string }
      writes.push({ method: request.method(), path, body: payload })
      federal.statusCode = payload.statusCode
      federal.statusDescription = 'Withdrawn'
      version += 1
      body = { success: true, message: 'Federal application status updated.', errors: [] }
    } else if (
      request.method() === 'POST' &&
      path === '/api/lexis/rpc/exemption-details/exemption/update'
    ) {
      const payload = Object.fromEntries(new URLSearchParams(request.postData() ?? ''))
      writes.push({ method: request.method(), path, body: payload })
      exemption.exemptionStatusCode = payload.exemptionStatusCode
      exemption.exemptionStatusDescription = 'New'
      version += 1
      body = {
        success: true,
        message: 'Exemption updated.',
        exemptionNumber: exemption.exemptionNumber,
        errors: [],
        warnings: [],
      }
    }
    if (body === undefined) {
      unexpectedRequests.push(`${request.method()} ${path}`)
      await route.fulfill({ status: 501, body: 'No parity fixture for this request.' })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'X-Lexis-Record-Version': `synthetic-${version}` },
      body: JSON.stringify(body),
    })
  })
  return { writes, unexpectedRequests }
}

const selectTab = async (page: Page, name: string) => {
  await page.getByRole('tab', { name, exact: true }).click()
}

test.describe('Frontend parity with mocked API responses', () => {
  test('saving federal shipping preserves an unsaved status draft', async ({ page }) => {
    const fixture = await installParityFixtures(page)
    await gotoSyntheticRoute(page, '/federal/application/888')
    await selectTab(page, 'Application')
    await page.getByRole('button', { name: 'Edit federal status' }).click()
    await page.getByLabel('Status', { exact: true }).selectOption('WDN')
    await page.getByLabel('Remark', { exact: true }).fill('Pending withdrawal confirmation')
    await selectTab(page, 'Shipping details')
    await page.getByRole('button', { name: 'Edit shipping details' }).click()
    await page.getByLabel('Transport name', { exact: true }).fill('Saved truck')
    await page.getByRole('button', { name: 'Save federal permit' }).click()
    await expect(page.getByText('Federal permit updated.', { exact: true })).toBeVisible()
    await expect(page.getByText('Saved truck', { exact: true })).toBeVisible()

    await selectTab(page, 'Application')
    await expect(page.getByLabel('Status', { exact: true })).toHaveValue('WDN')
    await expect(page.getByLabel('Remark', { exact: true })).toHaveValue(
      'Pending withdrawal confirmation',
    )
    expect(fixture.writes).toEqual([
      {
        method: 'PUT',
        path: '/api/lexis/federal/applications/888/permit',
        body: expect.objectContaining({ transportName: 'Saved truck' }),
      },
    ])
    expect(fixture.unexpectedRequests).toEqual([])
  })

  test('saving federal status preserves an unsaved shipping draft', async ({ page }) => {
    const fixture = await installParityFixtures(page)
    await gotoSyntheticRoute(page, '/federal/application/888')
    await selectTab(page, 'Shipping details')
    await page.getByRole('button', { name: 'Edit shipping details' }).click()
    await page.getByLabel('Transport name', { exact: true }).fill('Unsaved truck')
    await selectTab(page, 'Application')
    await page.getByRole('button', { name: 'Edit federal status' }).click()
    await page.getByLabel('Status', { exact: true }).selectOption('WDN')
    await page.getByLabel('Remark', { exact: true }).fill('Withdraw this application')
    await page.getByRole('button', { name: 'Update status' }).click()
    await expect(
      page.getByText('Federal application status updated.', { exact: true }),
    ).toBeVisible()

    await selectTab(page, 'Shipping details')
    await expect(page.getByLabel('Transport name', { exact: true })).toHaveValue('Unsaved truck')
    await expect(page.getByRole('button', { name: 'Save federal permit' })).toBeEnabled()
    expect(fixture.writes).toEqual([
      {
        method: 'POST',
        path: '/api/lexis/federal/applications/888/status',
        body: { statusCode: 'WDN', remark: 'Withdraw this application' },
      },
    ])
    expect(fixture.unexpectedRequests).toEqual([])
  })

  test('reopens a cancelled Blanket OIC with empty locked dates', async ({ page }) => {
    const fixture = await installParityFixtures(page)
    await gotoSyntheticRoute(page, '/provincial/exemption/PARITY-BOIC')
    await page.getByRole('button', { name: 'Edit exemption' }).click()
    for (const label of ['Approval date', 'Expiry date']) {
      const date = page.getByLabel(label, { exact: true })
      await expect(date).toBeDisabled()
      await expect(date).toHaveValue('')
      await expect(date).not.toHaveAttribute('aria-invalid', 'true')
    }
    await expect(page.getByLabel('Approved volume (m³)', { exact: true })).toBeDisabled()
    await expect(page.getByLabel('Conditions', { exact: true })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Save exemption' })).toBeDisabled()
    await page.getByRole('combobox', { name: 'Status', exact: true }).click()
    await page.getByRole('option', { name: 'New', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Save exemption' })).toBeEnabled()
    await page.getByRole('button', { name: 'Save exemption' }).click()
    await expect(page.getByText('Exemption updated.', { exact: true })).toBeVisible()

    expect(fixture.writes).toEqual([
      {
        method: 'POST',
        path: '/api/lexis/rpc/exemption-details/exemption/update',
        body: expect.objectContaining({
          exemptionNumber: 'PARITY-BOIC',
          exemptionStatusCode: 'NEW',
          exemptionTypeCode: 'B',
          approvalDate: '',
          exemptionExpiryDate: '',
          approvedVolume: '500',
          otherConditions: 'Keep existing conditions',
        }),
      },
    ])
    expect(fixture.unexpectedRequests).toEqual([])
  })
})
