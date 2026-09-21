import { expect, test, type Page } from '@playwright/test'
import { gotoSyntheticRoute, installSyntheticCognitoSession } from './utils'

type PermitScenario = 'normal' | 'ministerial' | 'blanket-oic' | 'blanket-oic-empty'

type CapturedWrite = {
  method: string
  path: string
  body: Record<string, unknown>
}

type PermitParityFixture = {
  writes: CapturedWrite[]
  unexpectedRequests: string[]
  resolveDelayedGrade: (options: Array<{ code: string; description: string }>) => void
  resolveDelayedShipping: () => void
}

const ownerClientData = (locationCode: string) =>
  locationCode === '04'
    ? {
        clientNumber: '00067890',
        companyName: 'Owner Mill Ltd.',
        address: '4 Mill Road',
        city: 'Victoria',
        province: 'BC',
        postalCode: 'V8V 1A1',
        country: 'Canada',
        phone: '250-555-0104',
        fax: '',
        email: 'owner-mill@example.test',
        notfound: '',
      }
    : {
        clientNumber: '00067890',
        companyName: 'Owner Forestry Ltd.',
        address: '1 Owner Street',
        city: 'Victoria',
        province: 'BC',
        postalCode: 'V8V 1A1',
        country: 'Canada',
        phone: '250-555-0103',
        fax: '',
        email: 'owner@example.test',
        notfound: '',
      }

const installPermitParityFixtures = async (
  page: Page,
  scenario: PermitScenario,
  delayedGrade = false,
  delayedShipping = false,
): Promise<PermitParityFixture> => {
  await installSyntheticCognitoSession(page, {
    username: 'PERMIT.PARITY.TESTER',
    orgUnitNo: '1903',
  })

  const blanketOic = scenario === 'blanket-oic' || scenario === 'blanket-oic-empty'
  const permitNumber = blanketOic ? '91002' : '91001'
  let ownerLocationCode = '03'
  let createdPayload: Record<string, string> | null = null
  let version = 1
  const writes: CapturedWrite[] = []
  const unexpectedRequests: string[] = []
  let resolveGradeOptions:
    | ((options: Array<{ code: string; description: string }>) => void)
    | null = null
  const delayedGradeOptions = new Promise<Array<{ code: string; description: string }>>(
    (resolve) => {
      resolveGradeOptions = resolve
    },
  )
  let resolveShipping: (() => void) | null = null
  const shippingReady = new Promise<void>((resolve) => {
    resolveShipping = resolve
  })
  const exemption = {
    exemptionNumber: 'EX-BOIC-91002',
    exemptionTypeCode: 'B',
    exemptionTypeDescription: 'Blanket OIC',
    exemptionStatusCode: 'ACT',
    exemptionStatusDescription: 'Active',
    approvalDate: null,
    expiryDate: null,
    approvedVolume: 500,
    usedVolume: 0,
    remainingVolume: 500,
    otherConditions: '',
    blanketOic: true,
    permitNumbers: [],
    remarks: [],
  }

  const permit = () => ({
    permitNumber: Number(permitNumber),
    applicationNumber: scenario === 'blanket-oic-empty' ? null : 111,
    packageNumber: scenario === 'blanket-oic-empty' ? null : blanketOic ? 'BOIC-A' : 'PKG-A',
    exemptionNumber: blanketOic
      ? 'EX-BOIC-91002'
      : scenario === 'ministerial'
        ? 'EX-MIN-91001'
        : '',
    permitStatusCode: 'ACT',
    permitStatusDescription: 'Active',
    author: 'PERMIT.PARITY.TESTER',
    applicantClientNumber: null,
    agentClientLocationCode: null,
    ownerClientNumber: '00067890',
    ownerClientLocationCode: ownerLocationCode,
    destinationCompanyName: 'Synthetic Exporter',
    destinationCountryCode: 'CA',
    transportTypeCode: 'S',
    transportName: 'Synthetic vessel',
    portOfExportCode: 'VA',
    otherPortOfExport: null,
    applicationDate: '2026-09-01',
    issueDate: '2026-09-02',
    expiryDate: '2026-10-01',
    receivedDate: '2026-09-01',
    estimatedShippingDate: '2026-09-10',
    permitVolume: scenario === 'blanket-oic-empty' ? 0 : blanketOic ? 120.5 : 50,
    approvedExemptionVolume: 500,
    exemptionVolumeRemaining: 500,
    exemptionTypeDescription: blanketOic
      ? 'Blanket OIC'
      : scenario === 'ministerial'
        ? 'Ministerial'
        : 'Standard exemption',
    blanketOic,
    numberOfPieces: scenario === 'blanket-oic-empty' ? 0 : 3,
    receiptNumber: scenario === 'blanket-oic-empty' ? null : 'R-91002',
    federalPermitNumber: null,
    invoiceNumber: null,
    remarks: 'Synthetic parity fixture',
    oicApplicationNumber: scenario === 'blanket-oic' ? 123456 : null,
    oicRequestPieces: createdPayload
      ? Number(createdPayload.oicPermitTotalPieces)
      : blanketOic
        ? 200
        : null,
    oicRequestVolume: createdPayload
      ? Number(createdPayload.oicPermitTotalVolume)
      : blanketOic
        ? 120.5
        : null,
    orgUnitNumber: 1903,
    region: 'Cariboo Natural Resource Region',
  })

  const packageList =
    scenario === 'normal' || scenario === 'ministerial'
      ? [
          {
            packageNumber: 'PKG-A',
            packageInfo: {
              region: 'Cariboo',
              enduse: 'LU',
              ageclass: 'O',
              volume: '25.0',
              length: '12.0',
              diameter: '24.0',
              productType: 'H',
            },
            scaleList: [
              {
                id: '1047902',
                timberMark: 'TM-A',
                cascadeSplitCode: 'W',
                permit: permitNumber,
                pieces: '1',
                species: 'FI',
                grade: 'W',
                volume: '1.0',
              },
            ],
          },
          {
            packageNumber: 'PKG-B',
            packageInfo: {
              region: 'Cariboo',
              enduse: 'PL',
              ageclass: 'S',
              volume: '25.0',
              length: '12.0',
              diameter: '24.0',
              productType: 'H',
            },
            scaleList: [
              {
                id: '1047903',
                timberMark: 'TM-B',
                cascadeSplitCode: 'E',
                permit: permitNumber,
                pieces: '2',
                species: 'HE',
                grade: 'Y',
                volume: '2.0',
              },
            ],
          },
        ]
      : [
          {
            packageNumber: 'BOIC-A',
            packageInfo: {
              region: 'Cariboo',
              enduse: 'LU',
              ageclass: 'O',
              volume: '120.5',
              length: '7.1',
              diameter: '16.2',
              productType: 'H',
            },
            packageDetails: {
              scaledVolume: '0.0',
              status: 'ACT',
              statusDescription: 'Active',
              reprocessed: 'N',
              ageClass: 'O',
              comments: 'Synthetic Blanket OIC package',
            },
            scaleList: [],
          },
        ]

  const coreTabs = {
    applicationList: blanketOic ? [] : ['111'],
    packageList: scenario === 'blanket-oic-empty' ? [] : packageList,
  }

  const respond = async (route: Parameters<Parameters<Page['route']>[1]>[0], body: unknown) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'X-Lexis-Record-Version': `synthetic-${version}` },
      body: JSON.stringify(body),
    })
  }

  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    let body: unknown

    if (request.method() === 'GET') {
      switch (path) {
        case '/api/lexis/session/capabilities':
          body = {
            authenticated: true,
            principal: 'PERMIT.PARITY.TESTER',
            roles: ['ADMIN'],
            welcomeTarget: '/provincial/review',
            legacyPath: null,
            orgUnitNo: '1903',
            grantedActions: [
              '/permitSearch',
              '/permitDetails',
              'savePermit',
              'createPermit',
              '/exemptionDetails',
              '/exemptionSearch',
              '/filePermitUpload',
            ],
          }
          break
        case '/api/lexis/session/preferences':
          body = { defaultRegion: '1903' }
          break
        case `/api/lexis/permits/${permitNumber}`:
          body = permit()
          break
        case '/api/lexis/exemptions/EX-BOIC-91002':
          body = exemption
          break
        case '/api/lexis/exemptions/search/options':
          body = {
            exemptionTypes: [{ code: 'B', name: 'Blanket OIC' }],
            exemptionStatuses: [{ code: 'ACT', name: 'Active' }],
            regions: [{ code: '1903', name: 'Cariboo Natural Resource Region' }],
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
        case '/api/lexis/rpc/exemption-details/region-context':
          body = { exemptionNumber: exemption.exemptionNumber, regionNumbers: ['1903'] }
          break
        case '/api/lexis/rpc/exemption-details/applications':
          body = { applications: [], containsUnmanu: false, ownerNumber: '' }
          break
        case '/api/lexis/rpc/exemption-details/blanket-oic-totals':
          body = { requestedVolume: '0', completedVolume: '0' }
          break
        case '/api/lexis/client-search':
          body = [
            { clientNumber: '00067890', companyName: 'Owner Forestry Ltd.', clientAcronym: 'OFL' },
          ]
          break
        case '/api/lexis/permits/search/options':
          body = {
            permitStatuses: [{ code: 'ACT', name: 'Active' }],
            regions: [{ code: '1903', name: 'Cariboo Natural Resource Region' }],
          }
          break
        case '/api/lexis/applications/search/options':
          body = {
            exemptionTypes: [{ code: 'B', name: 'Blanket OIC' }],
            exemptionReasons: [],
            applicationStatuses: [{ code: 'ACT', name: 'Active' }],
            productTypes: [{ code: 'H', name: 'Harvested' }],
            growthTypes: [{ code: 'O', name: 'Old growth' }],
            regions: [{ code: '1903', name: 'Cariboo Natural Resource Region' }],
            currentSchedules: [{ code: '2026', name: '2026' }],
          }
          break
        case '/api/lexis/shipping-reference-options':
          if (delayedShipping) await shippingReady
          body = {
            countries: [
              { code: 'CO', name: 'Colombia' },
              { code: 'CA', name: 'Canada' },
              { code: 'US', name: 'United States' },
              { code: 'CL', name: 'Chile' },
              { code: 'JP', name: 'Japan' },
              { code: 'CN', name: 'China' },
              { code: 'KR', name: 'Korea' },
              { code: 'TW', name: 'Taiwan' },
              { code: 'KH', name: 'Cambodia' },
            ],
            transportTypes: [{ code: 'S', name: 'Ship' }],
            ports: [{ code: 'VA', name: 'Vancouver' }],
          }
          break
        case '/api/lexis/rpc/permit-details/edit-context':
          body = {
            overrideEnabled: false,
            overrideFee: '',
            overrideComment: '',
            locked: false,
            lockMessage: '',
          }
          break
        case '/api/lexis/rpc/permit-details/core-tabs':
          body = coreTabs
          break
        case '/api/lexis/rpc/permit-details/gbms-invoice-history':
        case '/api/lexis/rpc/permit-details/document-details':
        case '/api/lexis/rpc/exemption-details/document-details':
        case '/api/lexis/rpc/exemption-details/permits':
        case '/api/lexis/notifications':
          body = []
          break
        case '/api/lexis/rpc/permit-details/all-scale-fees':
          body =
            scenario === 'ministerial'
              ? {
                  packageList: packageList.map((entry, index) => ({
                    packageNumber: entry.packageNumber,
                    growthType: 'Synthetic growth type',
                    totalFeeForPackage: `$${(index + 1) * 10}.00`,
                    scaleList: entry.scaleList.map((scale) => ({
                      ...scale,
                      ministryUser: true,
                      amv: '$100.00',
                      ewb: '$100.00',
                      fil: '10%',
                      mf: '1',
                      fee: `${(index + 1) * 10}.00`,
                    })),
                  })),
                  totalVolume: '3.0',
                }
              : { packageList: [], totalVolume: '0' }
          break
        case '/api/lexis/rpc/permit-details/available-application-list':
          body = { applicationList: [], applicationItems: [], errorMessage: '' }
          break
        case '/api/lexis/rpc/application-details/species-codes':
          body = [
            { code: 'AL', description: 'Alder' },
            { code: 'FI', description: 'Fir' },
          ]
          break
        case '/api/lexis/rpc/application-details/remaining-species':
          body = [{ code: 'FI', description: 'Fir' }]
          break
        case '/api/lexis/rpc/application-details/end-uses-for-species-region':
          body = [{ code: 'LU', description: 'Lumber' }]
          break
        case '/api/lexis/rpc/application-details/package-details':
          body = {
            success: true,
            packageNumber: 'BOIC-A',
            volume: '120.5',
            length: '7.1',
            diameter: '16.2',
            status: 'ACT',
            comments: 'Synthetic Blanket OIC package',
            reprocessed: 'N',
            ageClass: 'O',
            productType: 'H',
          }
          break
        case '/api/lexis/rpc/application-details/species-for-package':
          body = [{ species: 'FI', enduse: 'LU', endUseDescription: 'Lumber' }]
          break
        case '/api/lexis/rpc/application-details/grade-codes':
          if (
            scenario === 'blanket-oic' &&
            delayedGrade &&
            url.searchParams.get('speciesCode') === 'AL'
          ) {
            body = await delayedGradeOptions
          } else {
            body = [{ code: 'W', description: 'Utility' }]
          }
          break
        case '/api/lexis/rpc/exemption-details/client-locations':
          body = [
            { locationCode: '03', locationName: 'Owner office', selected: true },
            { locationCode: '04', locationName: 'Owner mill', selected: false },
          ]
          break
        case '/api/lexis/rpc/exemption-details/client-data':
        case '/api/lexis/rpc/application-details/client-data':
          body = ownerClientData(url.searchParams.get('clientLocationCode') ?? ownerLocationCode)
          break
      }
    } else if (request.method() === 'POST') {
      if (path === '/api/lexis/rpc/permit-details/add-permit') {
        createdPayload = Object.fromEntries(new URLSearchParams(request.postData() ?? ''))
        writes.push({ method: request.method(), path, body: createdPayload })
        ownerLocationCode = createdPayload.ownerClientLocation
        version += 1
        body = {
          success: true,
          message: 'The permit was saved successfully.',
          errors: [],
          warnings: [],
          permitNumber,
        }
      } else if (path === '/api/lexis/rpc/permit-details/add-boic-scale') {
        const payload = Object.fromEntries(new URLSearchParams(request.postData() ?? '')) as Record<
          string,
          string
        >
        writes.push({ method: request.method(), path, body: payload })
        const boicPackage = coreTabs.packageList[0]
        boicPackage.scaleList.push({
          id: 'BOIC-SCALE-1',
          timberMark: payload.timberMark,
          cascadeSplitCode: 'W',
          permit: permitNumber,
          pieces: payload.scalePieces,
          species: payload.speciesCode,
          grade: payload.gradeCode,
          volume: payload.scaleVolume,
        })
        version += 1
        body = {
          success: true,
          message: 'Blanket OIC scale detail was added.',
          errors: [],
          warnings: [],
        }
      } else if (path === '/api/lexis/rpc/permit-details/update-permit') {
        const payload = Object.fromEntries(new URLSearchParams(request.postData() ?? '')) as Record<
          string,
          string
        >
        writes.push({ method: request.method(), path, body: payload })
        ownerLocationCode = payload.ownerClientLocation || ownerLocationCode
        version += 1
        body = {
          success: true,
          message: 'The permit was updated successfully.',
          errors: [],
          warnings: [],
        }
      } else if (path === '/api/lexis/rpc/permit-details/boic-package') {
        const payload = request.postDataJSON() as Record<string, unknown>
        writes.push({ method: request.method(), path, body: payload })
        const packageNumber = String(payload.newPackageNumber || payload.packageNumber)
        coreTabs.packageList.push({
          packageNumber,
          packageInfo: {
            region: 'Cariboo',
            enduse: 'LU',
            ageclass: 'O',
            volume: String(payload.volume),
            length: String(payload.averageLength),
            diameter: String(payload.averageDiameter),
            productType: 'H',
          },
          packageDetails: {
            scaledVolume: '0.0',
            status: 'ACT',
            statusDescription: 'Active',
            reprocessed: 'N',
            ageClass: 'O',
            comments: String(payload.comments ?? ''),
          },
          scaleList: [],
        })
        version += 1
        body = {
          success: true,
          message: 'Blanket OIC package was created.',
          errors: [],
          warnings: [],
          permitNumber,
          applicationNumber: '123456',
          packageNumber,
        }
      } else if (
        path === '/api/lexis/rpc/permit-details/release-lock' ||
        path === '/api/lexis/rpc/exemption-details/release-lock'
      ) {
        body = { success: true }
      }
    }

    if (body === undefined) {
      unexpectedRequests.push(`${request.method()} ${path}`)
      await route.fulfill({ status: 501, body: 'No permit parity fixture for this request.' })
      return
    }

    await respond(route, body)
  })

  return {
    writes,
    unexpectedRequests,
    resolveDelayedGrade: (options) => resolveGradeOptions?.(options),
    resolveDelayedShipping: () => resolveShipping?.(),
  }
}

const selectTab = async (page: Page, name: string): Promise<void> => {
  await page.getByRole('tab', { name, exact: true }).click()
}

const chooseComboBoxOption = async (
  page: Page,
  name: string,
  optionName: string,
): Promise<void> => {
  const combobox = page.getByRole('combobox', { name, exact: true })
  await combobox.click()
  await combobox.fill(optionName)
  await page.getByRole('option', { name: optionName, exact: true }).click()
}

test.describe('Provincial permit parity regressions', () => {
  test('shows live BOIC validation, country choices and client details before opening the saved permit', async ({
    page,
  }) => {
    const fixture = await installPermitParityFixtures(page, 'blanket-oic-empty')
    await gotoSyntheticRoute(page, '/provincial/exemption/EX-BOIC-91002/permit/new', {
      ready: page.getByRole('heading', { level: 1, name: 'Apply for new permit', exact: true }),
    })
    const save = page.getByRole('button', { name: 'Save permit', exact: true })
    await expect(save).toBeEnabled()
    await selectTab(page, 'Shipping')
    const country = page.getByRole('combobox', { name: 'Final destination country', exact: true })
    await expect(country).toHaveValue('United States (US)')
    await selectTab(page, 'Permit')
    await save.click()

    const summary = page.getByRole('group', { name: 'Permit needs attention', exact: true })
    await expect(summary).toBeFocused()
    await expect(summary).toContainText(
      'Complete the required fields in Permit, Applicant and Shipping tabs.',
    )
    await expect(
      page.getByText(/The permit number is assigned after a successful save/),
    ).toHaveCount(0)
    await expect(
      page.getByRole('tab', { name: 'Permit, 2 required fields outstanding', exact: true }),
    ).toBeVisible()
    await save.click()
    await expect(summary).toBeFocused()
    const sideNavBounds = await page.locator('.cds--side-nav').boundingBox()
    const sideNavRight = (sideNavBounds?.x ?? 0) + (sideNavBounds?.width ?? 0)
    expect((await summary.boundingBox())?.x).toBeGreaterThanOrEqual(sideNavRight)
    await expect(summary).toBeFocused()

    await page.getByLabel('Permit request pieces', { exact: true }).fill('0')
    await expect(
      page.getByRole('tab', { name: 'Permit, 1 required field outstanding', exact: true }),
    ).toBeVisible()
    await page.getByLabel('Permit request volume (m³)', { exact: true }).fill('0')
    await expect(
      page.getByRole('tab', { name: 'Permit', exact: true }).locator('svg'),
    ).toBeVisible()
    await page
      .getByRole('tab', { name: 'Applicant, 2 required fields outstanding', exact: true })
      .click()
    await page.getByRole('combobox', { name: 'Applicant client number', exact: true }).fill('Owner')
    await page
      .getByRole('option', { name: 'Owner Forestry Ltd. (OFL) · 00067890', exact: true })
      .click()
    await expect(
      page.getByRole('region', { name: 'Applicant details', exact: true }),
    ).toContainText('1 Owner Street')
    await page.getByLabel('Applicant location', { exact: true }).selectOption('04')
    await expect(
      page.getByRole('region', { name: 'Applicant details', exact: true }),
    ).toContainText('4 Mill Road')

    await page
      .getByRole('tab', { name: 'Shipping, 3 required fields outstanding', exact: true })
      .click()
    await country.click()
    const countries = page.getByRole('listbox').getByRole('option')
    await expect(countries).toHaveText([
      'United States (US)',
      'Japan (JP)',
      'China (CN)',
      'Korea (KR)',
      'Taiwan (TW)',
      'Canada (CA)',
      'Cambodia (KH)',
      'Chile (CL)',
      'Colombia (CO)',
    ])
    await country.fill('c')
    await expect(countries).toHaveText([
      'China (CN)',
      'Canada (CA)',
      'Cambodia (KH)',
      'Chile (CL)',
      'Colombia (CO)',
    ])
    await page.getByRole('option', { name: 'Canada (CA)', exact: true }).click()
    await page.getByLabel('Purchaser', { exact: true }).fill('Synthetic Purchaser')
    await page.getByLabel('Transport name', { exact: true }).fill('Synthetic vessel')
    await page.getByLabel('Estimated shipping date', { exact: true }).fill('2099-01-01')
    await expect(summary).toHaveCount(0)
    await expect(
      page.getByText(/The permit number is assigned after a successful save/),
    ).toBeVisible()
    await save.click()

    await expect(page).toHaveURL(/\/provincial\/permit\/91002$/)
    await expect(page.getByText('Permit created', { exact: true })).toBeVisible()
    await expect(
      page.getByRole('heading', { level: 1, name: 'Permit 91002 (Pending)', exact: true }),
    ).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Permit', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    const permitCard = page
      .locator('.cds--tile')
      .filter({ has: page.getByRole('heading', { name: 'Permit details', exact: true }) })
    await expect(permitCard).toContainText('Current permit volume (m³)')
    await expect(permitCard).toContainText('Remarks')
    await expect(
      page.getByRole('heading', { name: 'Volume and remarks', exact: true }),
    ).toHaveCount(0)
    await selectTab(page, 'Scale')
    await expect(page.getByRole('heading', { name: 'No packages yet', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Create package', exact: true })).toBeVisible()
    await expect(page.getByRole('group', { name: 'Summary of Scale', exact: true })).toHaveCount(0)
    await selectTab(page, 'Fees')
    await expect(page.getByRole('heading', { name: 'Permit fees', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Package fees', exact: true })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Permit fee rows', exact: true })).toHaveCount(0)
    await expect(
      page.locator('.detail-field-item').filter({ hasText: 'Total volume (m³)' }),
    ).toHaveText('Total volume (m³)0.0')
    await selectTab(page, 'Documents')
    await page.getByRole('button', { name: 'Add document', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Add documents', exact: true })).toBeVisible()
    expect(fixture.writes).toEqual([
      expect.objectContaining({
        path: '/api/lexis/rpc/permit-details/add-permit',
        body: expect.objectContaining({
          ownerClientNumber: '00067890',
          ownerClientLocation: '04',
          oicPermitTotalPieces: '0',
          oicPermitTotalVolume: '0',
          destinationCountry: 'CA',
        }),
      }),
    ])
    expect(fixture.unexpectedRequests).toEqual([])
  })

  test('keeps BOIC Save available while defaults load and leaves without a warning after reverting an edit', async ({
    page,
  }) => {
    const fixture = await installPermitParityFixtures(page, 'blanket-oic-empty', false, true)
    await gotoSyntheticRoute(page, '/provincial/exemption/EX-BOIC-91002/permit/new', {
      ready: page.getByRole('heading', { level: 1, name: 'Apply for new permit', exact: true }),
    })
    await expect(page.getByRole('button', { name: 'Save permit', exact: true })).toBeEnabled()
    await page.getByLabel('Remarks', { exact: true }).fill('Temporary draft')
    fixture.resolveDelayedShipping()
    await selectTab(page, 'Shipping')
    await expect(
      page.getByRole('combobox', { name: 'Final destination country', exact: true }),
    ).toHaveValue('United States (US)')
    await selectTab(page, 'Permit')
    await page.getByLabel('Remarks', { exact: true }).fill('')
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(page).toHaveURL(/\/provincial\/exemption\/EX-BOIC-91002$/)
    await expect(page.getByRole('dialog', { name: 'Unsaved changes', exact: true })).toHaveCount(0)
    expect(fixture.writes).toEqual([])
    expect(fixture.unexpectedRequests).toEqual([])
  })

  test('shows normal permit scale rows with their package association', async ({ page }) => {
    const fixture = await installPermitParityFixtures(page, 'normal')
    await gotoSyntheticRoute(page, '/provincial/permit/91001', {
      ready: page.getByRole('heading', { level: 1, name: 'Permit 91001 (Pending)', exact: true }),
    })
    await expect(page.getByRole('heading', { level: 1, name: /Permit 91001/ })).toBeVisible()

    await selectTab(page, 'Items')
    const itemTable = page.getByRole('region', { name: 'Permit item rows' }).getByRole('table')
    await expect(itemTable).toBeVisible()
    await expect(
      itemTable.getByRole('columnheader', { name: 'Package', exact: true }),
    ).toBeVisible()

    const packageARow = itemTable.getByRole('row').filter({ hasText: 'TM-A' })
    const packageBRow = itemTable.getByRole('row').filter({ hasText: 'TM-B' })
    await expect(packageARow.getByRole('cell', { name: 'PKG-A', exact: true })).toBeVisible()
    await expect(packageBRow.getByRole('cell', { name: 'PKG-B', exact: true })).toBeVisible()
    expect(fixture.unexpectedRequests).toEqual([])
  })

  test('shows the selected Ministerial package consistently on Scale and Fees', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 })
    const fixture = await installPermitParityFixtures(page, 'ministerial')
    await gotoSyntheticRoute(page, '/provincial/permit/91001', {
      ready: page.getByRole('heading', { level: 1, name: 'Permit 91001 (Pending)', exact: true }),
    })

    await selectTab(page, 'Scale')
    const scaleRows = page.getByRole('region', { name: 'Scale rows', exact: true })
    await expect(scaleRows).toContainText('TM-A')
    await expect(scaleRows).not.toContainText('TM-B')
    await chooseComboBoxOption(page, 'Package number', 'PKG-B')
    await expect(scaleRows).toContainText('TM-B')
    await expect(scaleRows).not.toContainText('TM-A')
    await selectTab(page, 'Fees')
    const feeRows = page.getByRole('region', { name: 'Permit fee rows', exact: true })
    await expect(page.getByRole('combobox', { name: 'Package number', exact: true })).toHaveValue(
      'PKG-B',
    )
    await expect(feeRows).toContainText('TM-B')
    await expect(feeRows).not.toContainText('TM-A')
    await chooseComboBoxOption(page, 'Package number', 'PKG-A')
    await expect(feeRows).toContainText('TM-A')
    await expect(feeRows).not.toContainText('TM-B')
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(page.getByRole('combobox', { name: 'Package number', exact: true })).toBeVisible()
    await page
      .getByRole('combobox', { name: 'Package number', exact: true })
      .scrollIntoViewIfNeeded()
    await selectTab(page, 'Scale')
    await expect(scaleRows).toContainText('TM-A')
    await expect(scaleRows).not.toContainText('TM-B')
    expect(fixture.writes).toEqual([])
    expect(fixture.unexpectedRequests).toEqual([])
  })

  test('keeps BOIC scale entry disabled during delayed grade loading and submits selected codes', async ({
    page,
  }) => {
    const fixture = await installPermitParityFixtures(page, 'blanket-oic', true)
    await gotoSyntheticRoute(page, '/provincial/permit/91002', {
      ready: page.getByRole('heading', { level: 1, name: 'Permit 91002 (Pending)', exact: true }),
    })
    await selectTab(page, 'Scale')
    await expect(page.getByRole('group', { name: 'Summary of Scale' })).toBeVisible()

    const species = page.getByRole('combobox', { name: 'Species', exact: true })
    const grade = page.getByRole('combobox', { name: 'Grade', exact: true })
    await expect(species).toBeEnabled()
    await chooseComboBoxOption(page, 'Species', 'AL - Alder')
    await expect(grade).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Add scale', exact: true })).toBeDisabled()
    await expect(page.getByText('Loading scale options…', { exact: true })).toBeVisible()

    fixture.resolveDelayedGrade([{ code: 'W', description: 'Utility' }])
    await expect(grade).toBeEnabled()
    await expect(grade).toHaveValue('W - Utility')
    await chooseComboBoxOption(page, 'Grade', 'W - Utility')
    await page.getByLabel('Timber mark', { exact: true }).fill('TM-NEW')
    await page.getByLabel('Pieces', { exact: true }).fill('1')
    await page.getByLabel('Volume (m³)', { exact: true }).fill('1.0')
    const addScale = page.getByRole('button', { name: 'Add scale', exact: true })
    await expect(addScale).toBeEnabled()
    await addScale.click()

    await expect(
      page.getByText('Blanket OIC scale detail was added.', { exact: true }),
    ).toBeVisible()
    expect(fixture.writes).toEqual([
      expect.objectContaining({
        method: 'POST',
        path: '/api/lexis/rpc/permit-details/add-boic-scale',
        body: expect.objectContaining({
          packageNumber: 'BOIC-A',
          timberMark: 'TM-NEW',
          speciesCode: 'AL',
          gradeCode: 'W',
          scalePieces: '1',
          scaleVolume: '1.0',
        }),
      }),
    ])
    expect(fixture.unexpectedRequests).toEqual([])
  })

  test('keeps owner context visible while a verified location changes', async ({ page }) => {
    const fixture = await installPermitParityFixtures(page, 'blanket-oic')
    await gotoSyntheticRoute(page, '/provincial/permit/91002', {
      ready: page.getByRole('heading', { level: 1, name: 'Permit 91002 (Pending)', exact: true }),
    })
    await selectTab(page, 'Applicant')
    await expect(page.getByText('Owner Forestry Ltd. · 00067890', { exact: true })).toBeVisible()
    await expect(page.getByText('1 Owner Street', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Edit applicant details', exact: true }).click()
    const ownerLocation = page.getByLabel('Applicant location', { exact: true })
    await expect(ownerLocation).toHaveValue('03')
    await expect(
      page.getByRole('option', { name: '03 - Owner office', exact: true }),
    ).toBeAttached()
    await expect(page.getByRole('option', { name: '04 - Owner mill', exact: true })).toBeAttached()
    await expect(page.getByText('Owner Forestry Ltd. · 00067890', { exact: true })).toBeVisible()
    await expect(page.getByText('1 Owner Street', { exact: true })).toBeVisible()

    await ownerLocation.selectOption('04')
    await expect(page.getByText('Owner Mill Ltd. · 00067890', { exact: true })).toBeVisible()
    await expect(page.getByText('4 Mill Road', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Save changes', exact: true }).click()

    await expect(
      page.getByText('The permit was updated successfully.', { exact: true }),
    ).toBeVisible()
    const successNotice = page.locator('.cds--toast-notification--success')
    await expect(successNotice).toContainText('Applicant details saved')
    expect(fixture.writes).toEqual([
      expect.objectContaining({
        method: 'POST',
        path: '/api/lexis/rpc/permit-details/update-permit',
        body: expect.objectContaining({
          ownerClientNumber: '00067890',
          ownerClientLocation: '04',
        }),
      }),
    ])
    expect(fixture.unexpectedRequests).toEqual([])
  })

  test('opens the Blanket OIC package form as a right panel without hiding the package card', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 })
    const fixture = await installPermitParityFixtures(page, 'blanket-oic')
    await gotoSyntheticRoute(page, '/provincial/permit/91002', {
      ready: page.getByRole('heading', { level: 1, name: 'Permit 91002 (Pending)', exact: true }),
    })
    await selectTab(page, 'Scale')
    const content = page.locator('#permit-detail-content')
    const initialContentLayout = await content.evaluate((element) => ({
      right: element.getBoundingClientRect().right,
      marginInlineEnd: (element as HTMLElement).style.marginInlineEnd,
      inlineSize: (element as HTMLElement).style.inlineSize,
      transition: (element as HTMLElement).style.transition,
    }))
    const trigger = page.getByRole('button', { name: 'Create package', exact: true })
    const packageCard = page
      .locator('.detail-section-card')
      .filter({ has: page.getByRole('heading', { name: 'Package BOIC-A', exact: true }) })
    await expect(packageCard).toBeVisible()

    await trigger.click()
    const panel = page.locator('.permit-package-panel')
    await expect(panel).toBeVisible()
    await expect(panel.getByRole('heading', { name: 'Create package', exact: true })).toBeVisible()
    await expect
      .poll(async () => {
        const [contentBox, panelBox] = await Promise.all([
          content.boundingBox(),
          panel.boundingBox(),
        ])
        return !!contentBox && !!panelBox && contentBox.x + contentBox.width <= panelBox.x
      })
      .toBe(true)

    const packageNumber = panel.getByLabel('Package number', { exact: true })
    await panel.getByRole('button', { name: 'Save package', exact: true }).click()
    await expect(panel.getByText('Package number is required.', { exact: true })).toBeVisible()
    await expect(packageNumber).toBeFocused()
    await page.setViewportSize({ width: 390, height: 844 })
    await expect
      .poll(async () => {
        const panelBox = await panel.boundingBox()
        return !!panelBox && panelBox.x === 0 && panelBox.width <= 390
      })
      .toBe(true)
    await expect(packageNumber).toBeVisible()
    await packageNumber.fill('RESIZE-DRAFT')
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    await page.setViewportSize({ width: 1440, height: 1000 })
    await expect
      .poll(async () => {
        const [contentBox, panelBox] = await Promise.all([
          content.boundingBox(),
          panel.boundingBox(),
        ])
        return !!contentBox && !!panelBox && contentBox.x + contentBox.width <= panelBox.x
      })
      .toBe(true)
    await expect(packageNumber).toHaveValue('RESIZE-DRAFT')
    await panel.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(panel).toHaveCount(0)
    await expect(trigger).toBeFocused()
    expect(
      await content.evaluate((element) => ({
        marginInlineEnd: (element as HTMLElement).style.marginInlineEnd,
        inlineSize: (element as HTMLElement).style.inlineSize,
        transition: (element as HTMLElement).style.transition,
      })),
    ).toEqual({
      marginInlineEnd: initialContentLayout.marginInlineEnd,
      inlineSize: initialContentLayout.inlineSize,
      transition: initialContentLayout.transition,
    })
    const restoredContentBox = await content.boundingBox()
    expect((restoredContentBox?.x ?? 0) + (restoredContentBox?.width ?? 0)).toBeCloseTo(
      initialContentLayout.right,
      1,
    )
    expect(fixture.writes).toEqual([])
    expect(fixture.unexpectedRequests).toEqual([])
  })

  test('cancels and escapes create and edit package drafts without mutation', async ({ page }) => {
    const fixture = await installPermitParityFixtures(page, 'blanket-oic')
    await gotoSyntheticRoute(page, '/provincial/permit/91002', {
      ready: page.getByRole('heading', { level: 1, name: 'Permit 91002 (Pending)', exact: true }),
    })
    await selectTab(page, 'Scale')
    const trigger = page.getByRole('button', { name: 'Create package', exact: true })
    await trigger.click()
    const panel = page.locator('.permit-package-panel')
    await expect(panel).toBeVisible()
    await panel.getByLabel('Package number', { exact: true }).fill('DRAFT-CANCEL')
    await panel.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(panel).toHaveCount(0)
    await expect(trigger).toBeFocused()

    await trigger.click()
    await expect(panel.getByLabel('Package number', { exact: true })).toHaveValue('')
    await panel.getByLabel('Package number', { exact: true }).fill('DRAFT-ESCAPE')
    await page.keyboard.press('Escape')
    await expect(panel).toHaveCount(0)
    await expect(trigger).toBeFocused()

    const editTrigger = page.getByRole('button', { name: 'Edit package', exact: true })
    await editTrigger.click()
    await expect(panel).toBeVisible()
    const editedPackageNumber = panel.getByLabel('Package number', { exact: true })
    await expect(editedPackageNumber).toHaveValue('BOIC-A')
    await expect(editedPackageNumber).toBeFocused()
    await panel.getByRole('button', { name: 'Cancel edit', exact: true }).click()
    await expect(panel).toHaveCount(0)
    await expect(editTrigger).toBeFocused()

    await editTrigger.click()
    await expect(editedPackageNumber).toHaveValue('BOIC-A')
    await expect(editedPackageNumber).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(panel).toHaveCount(0)
    await expect(editTrigger).toBeFocused()
    expect(fixture.writes).toEqual([])
    expect(fixture.unexpectedRequests).toEqual([])
  })

  test('creates a Blanket OIC package, closes the panel, and reloads its package card', async ({
    page,
  }) => {
    const fixture = await installPermitParityFixtures(page, 'blanket-oic-empty')
    await gotoSyntheticRoute(page, '/provincial/permit/91002', {
      ready: page.getByRole('heading', { level: 1, name: 'Permit 91002 (Pending)', exact: true }),
    })
    await selectTab(page, 'Scale')
    await page.getByRole('button', { name: 'Create package', exact: true }).click()
    const panel = page.locator('.permit-package-panel')
    await expect(panel).toBeVisible()
    await panel.getByLabel('Package number', { exact: true }).fill('BOIC-NEW')
    await panel.getByLabel('Package volume (m³)', { exact: true }).fill('100.0')
    await panel.getByLabel('Average length (m)', { exact: true }).fill('10.0')
    await panel.getByLabel('Average top diameter (rads)', { exact: true }).fill('20.0')
    await chooseComboBoxOption(page, 'Species', 'FI - Fir')
    await panel.getByRole('button', { name: 'Add species', exact: true }).click()
    await expect(panel.getByRole('combobox', { name: 'End use', exact: true })).toHaveValue(
      'LU - Lumber',
    )
    await panel.getByRole('button', { name: 'Save package', exact: true }).click()

    await expect(panel).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Create package', exact: true })).toBeFocused()
    await expect(page.getByText('Blanket OIC package was created.', { exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Package BOIC-NEW', exact: true })).toBeVisible()
    expect(fixture.writes).toEqual([
      expect.objectContaining({
        method: 'POST',
        path: '/api/lexis/rpc/permit-details/boic-package',
        body: expect.objectContaining({
          permitNumber: 91002,
          packageNumber: 'BOIC-NEW',
          volume: 100,
          averageLength: 10,
          averageDiameter: 20,
          endUseCode: 'LU',
          speciesCodes: ['FI'],
        }),
      }),
    ])
    expect(fixture.unexpectedRequests).toEqual([])
  })

  for (const [viewport, layout] of [
    [{ width: 1440, height: 1000 }, 'desktop slide-in'],
    [{ width: 390, height: 844 }, 'narrow overlay'],
  ] as const) {
    test(`keeps a package draft open when Escape closes the Species list in ${layout}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport)
      const fixture = await installPermitParityFixtures(page, 'blanket-oic-empty')
      await gotoSyntheticRoute(page, '/provincial/permit/91002', {
        ready: page.getByRole('heading', {
          level: 1,
          name: 'Permit 91002 (Pending)',
          exact: true,
        }),
      })
      await selectTab(page, 'Scale')
      const trigger = page.getByRole('button', { name: 'Create package', exact: true })
      await trigger.click()
      const panel = page.locator('.permit-package-panel')
      const packageNumber = panel.getByLabel('Package number', { exact: true })
      await packageNumber.fill('DRAFT-ESCAPE')
      const species = panel.getByRole('combobox', { name: 'Species', exact: true })
      await expect(species).toBeEnabled()
      await species.click()
      await expect(page.getByRole('listbox')).toBeVisible()
      await page.keyboard.press('Escape')

      await expect(page.getByRole('listbox')).toHaveCount(0)
      await expect(panel).toBeVisible()
      await expect(packageNumber).toHaveValue('DRAFT-ESCAPE')
      await packageNumber.focus()
      await page.keyboard.press('Escape')
      await expect(panel).toHaveCount(0)
      await expect(trigger).toBeFocused()
      expect(fixture.writes).toEqual([])
      expect(fixture.unexpectedRequests).toEqual([])
    })
  }
})
