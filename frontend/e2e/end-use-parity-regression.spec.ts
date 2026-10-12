import { expect, test, type Page } from '@playwright/test'
import { gotoSyntheticRoute, installSyntheticOidcSession } from './utils'

type CapturedWrite = {
  method: string
  path: string
  body: Record<string, string>
}

type EndUseParityFixture = {
  writes: CapturedWrite[]
  unexpectedRequests: string[]
  endUseRequest: Promise<void>
  resolveEndUses: (options: Array<{ code: string; description: string }>) => void
}

const application = {
  applicationNumber: 321,
  exemptionNumber: null,
  applicationStatusCode: 'NEW',
  statusDescription: 'New',
  author: 'END.USE.PARITY.TESTER',
  ownerClientNumber: null,
  agentClientNumber: null,
  orgUnitNumber: 1903,
  orgUnitName: 'Cariboo Natural Resource Region',
  productTypeCode: 'H',
  exemptionReasonCode: 'U',
  applicationDate: '2026-09-01',
  receivedDate: '2026-09-01',
  listingDate: '2026-09-10',
  termDays: 30,
  applicationVolume: 100,
  averageLogVolume: 2,
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
  packages: [] as Array<{ packageNumber: string; volume: number; pieceCount: number }>,
  remarks: [],
  offers: [],
}

const applicationSummary = {
  applicationNumber: '321',
  federalApplicationNumber: '',
  applicationDate: '2026-09-01',
  receivedDate: '2026-09-01',
  termDays: '30',
  applicationVolume: '100',
  averageLogVolume: '2',
  productLocation: 'Cariboo',
  exportScheduleId: '',
  agentClientNumber: '',
  agentClientLocationCode: '',
  ownerClientNumber: '',
  ownerClientLocationCode: '',
  exemptionNumber: '',
  exemptionReasonCode: 'U',
  applicationStatusCode: 'NEW',
  applicantTypeCode: 'O',
  orgUnitNumber: '1903',
  productTypeCode: 'H',
  jurisdictionCode: 'P',
  growthTypeCode: 'S',
  agentContactName: '',
  ownerContactName: '',
  oicIndicator: 'N',
  endUseCode: 'LU',
  speciesCodes: ['FI'],
}

const applicationOptions = {
  exemptionTypes: [{ code: 'MIN', name: 'Ministerial' }],
  exemptionReasons: [{ code: 'U', name: 'Supply' }],
  applicationStatuses: [{ code: 'NEW', name: 'New' }],
  productTypes: [{ code: 'H', name: 'Harvested Timber' }],
  growthTypes: [
    { code: 'O', name: 'Old Growth' },
    { code: 'S', name: 'Second Growth' },
  ],
  regions: [{ code: '1903', name: 'Cariboo Natural Resource Region' }],
  currentSchedules: [{ code: '', name: 'Current schedule' }],
}

const respond = async (route: Parameters<Parameters<Page['route']>[1]>[0], body: unknown) => {
  await route.fulfill({
    status: 200,
    headers: { 'X-Lexis-Record-Version': 'v1' },
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}

const installEndUseParityFixtures = async (page: Page): Promise<EndUseParityFixture> => {
  await installSyntheticOidcSession(page, {
    username: 'END.USE.PARITY.TESTER',
    orgUnitNo: '1903',
  })

  const writes: CapturedWrite[] = []
  const unexpectedRequests: string[] = []
  let resolveEndUseOptions:
    | ((options: Array<{ code: string; description: string }>) => void)
    | null = null
  let resolveEndUseRequest: (() => void) | null = null
  const delayedEndUseOptions = new Promise<Array<{ code: string; description: string }>>(
    (resolve) => {
      resolveEndUseOptions = resolve
    },
  )
  const endUseRequest = new Promise<void>((resolve) => {
    resolveEndUseRequest = resolve
  })

  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname

    if (request.method() === 'POST' && path === '/api/lexis/rpc/application-details/package') {
      const body = Object.fromEntries(new URLSearchParams(request.postData() ?? '')) as Record<
        string,
        string
      >
      writes.push({ method: request.method(), path, body })
      application.packages.splice(0, application.packages.length, {
        packageNumber: body.packageNumber ?? 'PKG-DELAYED',
        volume: Number(body.packageDialogPackageVolume ?? 0),
        pieceCount: 0,
      })
      await respond(route, {
        valid: true,
        packageNumber: body.packageNumber ?? 'PKG-DELAYED',
        errors: [],
        warnings: [],
      })
      return
    }

    if (request.method() === 'POST' && path === '/api/lexis/rpc/application-details/release-lock') {
      await respond(route, {})
      return
    }

    if (request.method() !== 'GET') {
      unexpectedRequests.push(`${request.method()} ${path}`)
      await route.fulfill({ status: 501, contentType: 'application/json', body: '{}' })
      return
    }

    let body: unknown
    switch (path) {
      case '/api/lexis/session/capabilities':
        body = {
          authenticated: true,
          principal: 'END.USE.PARITY.TESTER',
          roles: ['ADMIN'],
          welcomeTarget: '/provincial/application',
          orgUnitNo: '1903',
          grantedActions: ['/applicationSearch', '/applicationDetails', 'createApplication'],
        }
        break
      case '/api/lexis/session/preferences':
        body = { defaultRegion: '1903' }
        break
      case '/api/lexis/notifications':
        body = []
        break
      case '/api/lexis/applications/321':
        body = application
        break
      case '/api/lexis/applications/search/options':
        body = applicationOptions
        break
      case '/api/lexis/application-reviews/search/options':
        body = {
          productTypes: [{ code: 'H', name: 'Harvested Timber' }],
          regions: [{ code: '1903', name: 'Cariboo Natural Resource Region' }],
          reviewStatuses: [{ code: 'NEW', name: 'New' }],
        }
        break
      case '/api/lexis/rpc/application-details/application-summary':
        body = applicationSummary
        break
      case '/api/lexis/rpc/application-details/species-for-application':
        body = [{ species: 'FI', enduse: 'LU', endUseDescription: 'Lumber' }]
        break
      case '/api/lexis/rpc/application-details/species-codes':
        body = [
          { code: 'CE', description: 'Cedar' },
          { code: 'FI', description: 'Fir' },
        ]
        break
      case '/api/lexis/rpc/application-details/package-status-codes':
        body = [{ code: 'ACT', description: 'Active' }]
        break
      case '/api/lexis/rpc/application-details/remaining-species':
        body = [
          { code: 'CE', description: 'Cedar' },
          { code: 'FI', description: 'Fir' },
        ]
        break
      case '/api/lexis/rpc/application-details/end-uses-for-species-region':
        resolveEndUseRequest?.()
        body = await delayedEndUseOptions
        break
      case '/api/lexis/rpc/application-details/permits':
      case '/api/lexis/rpc/application-details/document-details':
        body = []
        break
      case '/api/lexis/rpc/application-details/package-details':
        body = {
          success: true,
          packageNumber: application.packages[0]?.packageNumber ?? '',
          volume: String(application.packages[0]?.volume ?? 0),
          scaledVolume: 0,
          length: '12.0',
          diameter: '24.0',
          status: 'ACT',
          statusDescription: 'Active',
          comments: '',
          reprocessed: 'N',
          ageClass: 'S',
          ageClassDescription: 'Second Growth',
          productType: 'H',
          productTypeDescription: 'Harvested Timber',
        }
        break
      case '/api/lexis/rpc/application-details/species-for-package':
      case '/api/lexis/rpc/application-details/package-scales':
        body = []
        break
      default:
        unexpectedRequests.push(`${request.method()} ${path}`)
        body = {}
    }

    await respond(route, body)
  })

  return {
    writes,
    unexpectedRequests,
    endUseRequest,
    resolveEndUses: (options) => resolveEndUseOptions?.(options),
  }
}

test("creates a package with the application's species and end use once they load", async ({
  page,
}, testInfo) => {
  const fixture = await installEndUseParityFixtures(page)
  await page.setViewportSize({ width: 1440, height: 1000 })

  await gotoSyntheticRoute(page, '/provincial/application/321?tab=items', {
    ready: page.getByRole('heading', { level: 1, name: 'Application 321', exact: true }),
  })
  await expect(page.getByRole('heading', { level: 1, name: 'Application 321' })).toBeVisible()
  await page.getByRole('button', { name: 'Create package', exact: true }).click()

  const createPackageSection = page.locator('.application-items-drawer')
  const save = createPackageSection.getByRole('button', { name: 'Save package', exact: true })
  await expect(createPackageSection.getByLabel('Package number', { exact: true })).toBeVisible()
  await fixture.endUseRequest
  await expect(save).toBeDisabled()

  // The application's own end use isn't valid for its species, so the first valid one is saved.
  fixture.resolveEndUses([
    { code: 'PL', description: 'Pulp' },
    { code: 'SL', description: 'Sawn logs' },
  ])
  await expect(save).toBeEnabled()

  await createPackageSection.getByLabel('Package number', { exact: true }).fill('PKG-DELAYED')
  await createPackageSection.getByLabel('Volume (m³)', { exact: true }).fill('25.0')
  await createPackageSection.getByLabel('Average length (m)', { exact: true }).fill('12.0')
  await createPackageSection.getByLabel('Average top diameter (rads)', { exact: true }).fill('24.0')
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await expect(
      createPackageSection.getByRole('button', { name: 'Save package', exact: true }),
    ).toBeVisible()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    await page.screenshot({
      path: testInfo.outputPath(`application-package-drawer-${width}.png`),
      fullPage: true,
      animations: 'disabled',
    })
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await save.click()

  await expect(page.getByText('Package saved.', { exact: true })).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Selected package', exact: true })).toBeFocused()
  const addScale = page.getByRole('button', { name: 'Add scale', exact: true })
  await addScale.click()
  await expect(page.getByRole('textbox', { name: 'Timber mark', exact: true })).toBeFocused()
  await page
    .locator('.application-items-drawer')
    .getByRole('button', { name: 'Cancel', exact: true })
    .click()
  await expect(addScale).toBeFocused()
  expect(fixture.writes).toEqual([
    expect.objectContaining({
      method: 'POST',
      path: '/api/lexis/rpc/application-details/package',
      body: expect.objectContaining({
        packageNumber: 'PKG-DELAYED',
        packageDialogPackageStatus: 'ACT',
        packageDialogAgeClass: 'S',
        packageDialogProductType: 'H',
        createPackageSpeciesTableValues: 'FI',
        createPackageEndUse: 'PL',
      }),
    }),
  ])
  expect(fixture.unexpectedRequests).toEqual([])
})
