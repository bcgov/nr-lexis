import { expect, test, type Page } from '@playwright/test'
import { gotoSyntheticRoute, installSyntheticOidcSession } from './utils'

// These are frontend browser contracts with synthetic sessions and intercepted API responses.
// They do not authenticate against Keycloak or verify persistence/authorization in Oracle.
const installParityFixtures = async (page: Page) => {
  await installSyntheticOidcSession(page, { username: 'PARITY.TESTER', orgUnitNo: '1903' })
  const writes: Array<{ method: string; path: string; body: Record<string, unknown> }> = []
  const unexpectedRequests: string[] = []
  const numberChecks: string[] = []
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
              '/offersSearch',
              '/offerDetails',
            ],
          }
          break
        case '/api/lexis/session/preferences':
          body = { defaultRegion: '1903' }
          break
        case '/api/lexis/federal/applications/888':
          body = federal
          break
        case '/api/lexis/purchase-offers/81001':
          body = {
            offerNumber: 81001,
            applicationNumber: 888,
            packageNumber: 'PARITY-PKG',
            exportJurisdictionCode: 'P',
            companyName: 'Synthetic buyer',
            contactName: 'Example contact',
            author: 'PARITY.TESTER',
            locked: false,
            canEditScheduleDates: false,
            canEditOfferRemarks: false,
            canEditOfferDetails: false,
            canEditWithdrawFields: false,
          }
          break
        case '/api/lexis/rpc/offer-details/package-scales':
          body = []
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
            exemptionTypes: [
              { code: 'O', name: 'Order in Council' },
              { code: 'B', name: 'Blanket Order in Council' },
            ],
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
        case '/api/lexis/rpc/exemption-details/check-exemption-number': {
          const exemptionNumber = new URL(request.url()).searchParams.get('exemptionNumber') ?? ''
          numberChecks.push(exemptionNumber)
          body = { valid: exemptionNumber !== 'PARITY01', message: '' }
          break
        }
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
      (path === '/api/lexis/rpc/application-details/release-lock' ||
        path === '/api/lexis/rpc/offer-details/release-lock')
    ) {
      body = { success: true }
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
  return { writes, unexpectedRequests, numberChecks }
}

const selectTab = async (page: Page, name: string) => {
  await page.getByRole('tab', { name, exact: true }).click()
}

test.describe('Frontend parity with mocked API responses', () => {
  for (const dismissal of ['Escape', 'Close', 'Close scale details']) {
    test(`restores Scale Detail focus after unmount using ${dismissal}`, async ({ page }) => {
      const fixture = await installParityFixtures(page)
      await gotoSyntheticRoute(page, '/provincial/offers/81001', {
        ready: page.getByRole('heading', { name: 'Offer 81001', exact: true }),
      })
      const launcher = page.getByRole('button', { name: 'See scale detail', exact: true })
      await launcher.click()
      const dialog = page.getByRole('dialog', { name: 'Scale Detail', exact: true })
      await expect(dialog.getByText('No scale details found for this package.')).toBeVisible()
      await launcher.evaluate((element) => {
        element.addEventListener('focus', () => {
          element.setAttribute(
            'data-dialog-present-on-focus',
            String(Boolean(document.querySelector('.offer-scale-detail-modal'))),
          )
        })
      })
      if (dismissal === 'Escape') await page.keyboard.press('Escape')
      else await dialog.getByRole('button', { name: dismissal, exact: true }).click()
      await expect(dialog).toHaveCount(0)
      // Let Carbon's deferred focus callbacks finish before checking the final focus.
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      )
      await expect(launcher).toBeFocused()
      await expect(launcher).toHaveAttribute('data-dialog-present-on-focus', 'false')
      expect(fixture.unexpectedRequests).toEqual([])
      expect(fixture.writes).toEqual([])
    })
  }

  test('asks before a tab switch drops an unsaved federal status draft', async ({ page }) => {
    const fixture = await installParityFixtures(page)
    await gotoSyntheticRoute(page, '/federal/application/888', {
      ready: page.getByRole('heading', {
        level: 1,
        name: 'Federal application FED-888',
        exact: true,
      }),
    })
    await expect(page.getByRole('tab')).toHaveText(['Applicant', 'Application', 'Items', 'Remarks'])
    await selectTab(page, 'Application')
    await expect(page.getByText('Received date', { exact: true })).toBeVisible()
    await expect(page.getByText('List date', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Withdraw', exact: true }).click()
    const statusForm = page.locator('.cds--tile', {
      has: page.getByRole('heading', { name: 'Update federal status', exact: true }),
    })
    await expect(statusForm.getByText('Withdrawn', { exact: true })).toBeVisible()
    await expect(statusForm.getByRole('combobox')).toHaveCount(0)
    await page.getByLabel('Remark', { exact: true }).fill('Pending withdrawal confirmation')

    // Only one section edits at a time, so leaving the tab asks before dropping the draft.
    const discard = page.getByRole('dialog', { name: 'Discard changes?', exact: true })
    await selectTab(page, 'Items')
    await discard.getByRole('button', { name: 'Keep editing', exact: true }).click()
    await expect(discard).toHaveCount(0)
    await expect(page.getByRole('tab', { name: 'Application', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await expect(statusForm.getByText('Withdrawn', { exact: true })).toBeVisible()
    await expect(page.getByLabel('Remark', { exact: true })).toHaveValue(
      'Pending withdrawal confirmation',
    )

    await selectTab(page, 'Items')
    await discard.getByRole('button', { name: 'Discard changes', exact: true }).click()
    await expect(page.getByRole('tab', { name: 'Items', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await expect(page.getByRole('tab', { name: 'Items', exact: true })).toBeFocused()

    await selectTab(page, 'Application')
    await expect(page.getByRole('button', { name: 'Withdraw', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Reject', exact: true })).toBeVisible()
    await expect(statusForm).toHaveCount(0)
    expect(fixture.writes).toEqual([])
    expect(fixture.unexpectedRequests).toEqual([])
  })

  test('asks before a tab switch drops an unsaved federal remark draft', async ({ page }) => {
    const fixture = await installParityFixtures(page)
    await gotoSyntheticRoute(page, '/federal/application/888', {
      ready: page.getByRole('heading', {
        level: 1,
        name: 'Federal application FED-888',
        exact: true,
      }),
    })
    await selectTab(page, 'Remarks')
    await page.getByRole('button', { name: 'Add remark', exact: true }).click()
    await page.getByLabel('New remark', { exact: true }).fill('Unsaved note')

    // Only one section edits at a time, so leaving the tab asks before dropping the draft.
    const discard = page.getByRole('dialog', { name: 'Discard changes?', exact: true })
    await selectTab(page, 'Application')
    await discard.getByRole('button', { name: 'Keep editing', exact: true }).click()
    await expect(discard).toHaveCount(0)
    await expect(page.getByRole('tab', { name: 'Remarks', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await expect(page.getByLabel('New remark', { exact: true })).toHaveValue('Unsaved note')

    await selectTab(page, 'Application')
    await discard.getByRole('button', { name: 'Discard changes', exact: true }).click()
    await expect(page.getByRole('tab', { name: 'Application', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await page.getByRole('button', { name: 'Withdraw', exact: true }).click()
    await page.getByLabel('Remark', { exact: true }).fill('Withdraw this application')
    await page.getByRole('button', { name: 'Update status' }).click()
    await expect(
      page.getByText('Federal application status updated.', { exact: true }),
    ).toBeVisible()

    await selectTab(page, 'Remarks')
    await expect(page.getByLabel('New remark', { exact: true })).toHaveCount(0)
    expect(fixture.writes).toEqual([
      {
        method: 'POST',
        path: '/api/lexis/federal/applications/888/status',
        body: { statusCode: 'WDN', remark: 'Withdraw this application' },
      },
    ])
    expect(fixture.unexpectedRequests).toEqual([])
  })

  test('requires a remark before rejecting a federal application', async ({ page }) => {
    const fixture = await installParityFixtures(page)
    await gotoSyntheticRoute(page, '/federal/application/888', {
      ready: page.getByRole('heading', {
        level: 1,
        name: 'Federal application FED-888',
        exact: true,
      }),
    })
    await selectTab(page, 'Application')
    const reject = page.getByRole('button', { name: 'Reject', exact: true })
    await reject.click()
    const statusForm = page.locator('.cds--tile', {
      has: page.getByRole('heading', { name: 'Update federal status', exact: true }),
    })
    await expect(statusForm.getByText('Rejected', { exact: true })).toBeVisible()
    await expect(statusForm.getByRole('combobox')).toHaveCount(0)

    // An empty remark is refused on the field without sending anything.
    await page.getByRole('button', { name: 'Update status', exact: true }).click()
    await expect(page.getByText('Remark is required', { exact: true })).toBeVisible()
    await expect(page.getByLabel('Remark', { exact: true })).toBeFocused()

    await statusForm.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(statusForm).toHaveCount(0)
    await expect(reject).toBeFocused()
    expect(fixture.writes).toEqual([])
    expect(fixture.unexpectedRequests).toEqual([])
  })

  test('refuses a federal remark that is too long once saved without sending it', async ({
    page,
  }) => {
    const fixture = await installParityFixtures(page)
    await gotoSyntheticRoute(page, '/federal/application/888', {
      ready: page.getByRole('heading', {
        level: 1,
        name: 'Federal application FED-888',
        exact: true,
      }),
    })
    await selectTab(page, 'Remarks')
    await page.getByRole('button', { name: 'Add remark', exact: true }).click()
    const remark = page.getByLabel('New remark', { exact: true })

    // 100 typed characters become 300 once each & is saved as five.
    await remark.fill('A&'.repeat(50))
    await page.getByRole('button', { name: 'Save remark', exact: true }).click()
    await expect(
      page.getByText(
        'Remark must not exceed 250 characters once saved. Each & counts as 5 characters, and each < or > as 4.',
        { exact: true },
      ),
    ).toBeVisible()
    await expect(remark).toBeFocused()
    expect(fixture.writes).toEqual([])
    expect(fixture.unexpectedRequests).toEqual([])
  })

  test('flags a taken exemption number when the number field loses focus', async ({ page }) => {
    const fixture = await installParityFixtures(page)
    await gotoSyntheticRoute(page, '/provincial/exemption/create', {
      ready: page.getByRole('heading', { level: 1, name: 'Create new exemption', exact: true }),
    })
    const number = page.getByLabel('Exemption number', { exact: true })
    const taken = page.getByText('This exemption number has already been assigned', {
      exact: true,
    })

    await number.fill('parity01')
    await expect(number).toHaveValue('PARITY01')
    await number.press('Tab')
    await expect(taken).toBeVisible()

    // Changing the number clears the message until the new number is checked.
    await number.fill('PARITY02')
    await expect(taken).toHaveCount(0)
    await number.press('Tab')
    await expect.poll(() => fixture.numberChecks).toEqual(['PARITY01', 'PARITY02'])
    await expect(taken).toHaveCount(0)
    expect(fixture.writes).toEqual([])
    expect(fixture.unexpectedRequests).toEqual([])
  })

  test('keeps a cancelled Blanket OIC read-only', async ({ page }) => {
    const fixture = await installParityFixtures(page)
    await gotoSyntheticRoute(page, '/provincial/exemption/PARITY-BOIC', {
      ready: page.getByRole('heading', { level: 1, name: 'Exemption PARITY-BOIC', exact: true }),
    })
    // The edit context loads after the heading; let it settle before checking for Edit.
    await page.waitForLoadState('networkidle')
    await expect(
      page.getByRole('button', { name: 'Edit exemption details', exact: true }),
    ).toHaveCount(0)
    expect(fixture.writes).toEqual([])
    expect(fixture.unexpectedRequests).toEqual([])
  })
})
