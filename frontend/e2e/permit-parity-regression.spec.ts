import { expect, test, type Page } from '@playwright/test'
import { gotoSyntheticRoute, installSyntheticCognitoSession } from './utils'

type PermitScenario = 'normal' | 'blanket-oic'

type CapturedWrite = {
  method: string
  path: string
  body: Record<string, string>
}

type PermitParityFixture = {
  writes: CapturedWrite[]
  unexpectedRequests: string[]
  resolveDelayedGrade: (options: Array<{ code: string; description: string }>) => void
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
): Promise<PermitParityFixture> => {
  await installSyntheticCognitoSession(page, {
    username: 'PERMIT.PARITY.TESTER',
    orgUnitNo: '1903',
  })

  const permitNumber = scenario === 'normal' ? '91001' : '91002'
  let ownerLocationCode = '03'
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

  const permit = () => ({
    permitNumber: Number(permitNumber),
    applicationNumber: 111,
    packageNumber: scenario === 'normal' ? 'PKG-A' : 'BOIC-A',
    exemptionNumber: scenario === 'normal' ? '' : 'EX-BOIC-91002',
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
    permitVolume: scenario === 'normal' ? 50 : 120.5,
    approvedExemptionVolume: 500,
    exemptionVolumeRemaining: 500,
    exemptionTypeDescription: scenario === 'normal' ? 'Standard exemption' : 'Blanket OIC',
    blanketOic: scenario === 'blanket-oic',
    numberOfPieces: 3,
    receiptNumber: 'R-91002',
    federalPermitNumber: null,
    invoiceNumber: null,
    remarks: 'Synthetic parity fixture',
    oicApplicationNumber: scenario === 'blanket-oic' ? 123456 : null,
    oicRequestPieces: scenario === 'blanket-oic' ? 200 : null,
    oicRequestVolume: scenario === 'blanket-oic' ? 120.5 : null,
    orgUnitNumber: 1903,
    region: 'Cariboo Natural Resource Region',
  })

  const packageList =
    scenario === 'normal'
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
    applicationList: scenario === 'normal' ? ['111'] : [],
    packageList,
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
            grantedActions: ['/permitSearch', '/permitDetails', 'savePermit'],
          }
          break
        case '/api/lexis/session/preferences':
          body = { defaultRegion: '1903' }
          break
        case `/api/lexis/permits/${permitNumber}`:
          body = permit()
          break
        case '/api/lexis/permits/search/options':
          body = {
            permitStatuses: [{ code: 'ACT', name: 'Active' }],
            regions: [{ code: '1903', name: 'Cariboo Natural Resource Region' }],
          }
          break
        case '/api/lexis/shipping-reference-options':
          body = {
            countries: [{ code: 'CA', name: 'Canada' }],
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
        case '/api/lexis/notifications':
          body = []
          break
        case '/api/lexis/rpc/application-details/species-codes':
          body = [
            { code: 'AL', description: 'Alder' },
            { code: 'FI', description: 'Fir' },
          ]
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
      if (path === '/api/lexis/rpc/permit-details/add-boic-scale') {
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
      } else if (path === '/api/lexis/rpc/permit-details/release-lock') {
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
  test('shows normal permit scale rows with their package association', async ({ page }) => {
    const fixture = await installPermitParityFixtures(page, 'normal')
    await gotoSyntheticRoute(page, '/provincial/permit/91001')
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

  test('keeps BOIC scale entry disabled during delayed grade loading and submits selected codes', async ({
    page,
  }) => {
    const fixture = await installPermitParityFixtures(page, 'blanket-oic', true)
    await gotoSyntheticRoute(page, '/provincial/permit/91002')
    await selectTab(page, 'Items')
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
    await gotoSyntheticRoute(page, '/provincial/permit/91002')
    await selectTab(page, 'Owner')
    await expect(page.getByText('Owner Forestry Ltd.', { exact: true })).toBeVisible()
    await expect(page.getByText('1 Owner Street', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Edit owner', exact: true }).click()
    const ownerLocation = page.getByLabel('Owner location', { exact: true })
    await expect(ownerLocation).toHaveValue('03')
    await expect(
      page.getByRole('option', { name: '03 - Owner office', exact: true }),
    ).toBeAttached()
    await expect(page.getByRole('option', { name: '04 - Owner mill', exact: true })).toBeAttached()
    await expect(page.getByText('Owner Forestry Ltd.', { exact: true })).toBeVisible()
    await expect(page.getByText('1 Owner Street', { exact: true })).toBeVisible()

    await ownerLocation.selectOption('04')
    await expect(page.getByText('Owner Mill Ltd.', { exact: true })).toBeVisible()
    await expect(page.getByText('4 Mill Road', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Save permit', exact: true }).click()

    await expect(
      page.getByText('The permit was updated successfully.', { exact: true }),
    ).toBeVisible()
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
})
