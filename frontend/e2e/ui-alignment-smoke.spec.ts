import { expect, test, type Page } from '@playwright/test'

const authenticatedAdminSession = {
  authenticated: true,
  principal: 'UI.TESTER',
  roles: ['ADMIN'],
  welcomeTarget: '/provincial/application',
  legacyPath: null,
  orgUnitNo: '1903',
  grantedActions: [
    '/applicationsReview',
    '/applicationSearch',
    'createApplication',
    'uploadApplicationSubmission',
    '/exemptionSearch',
    '/createExemption',
    '/offersSearch',
    '/offerDetails',
    'createOffer',
    '/permitSearch',
    '/federalApplicationSearch',
    '/federalApplicationDetails',
    'viewFederalApplication',
    '/applicationReport',
    '/lexisAgentAdmin',
    '/applicationDetails',
  ],
}

const applicationSearchOptions = {
  exemptionTypes: [{ code: 'MIN', name: 'Ministerial order' }],
  exemptionReasons: [{ code: 'SUP', name: 'Supply' }],
  applicationStatuses: [
    { code: 'NEW', name: 'New' },
    { code: 'APP', name: 'Approved' },
  ],
  productTypes: [{ code: 'LOG', name: 'Logs' }],
  growthTypes: [{ code: 'OLD', name: 'Old growth' }],
  regions: [
    { code: '1903', name: 'West Coast' },
    { code: '1904', name: 'South Coast' },
  ],
  currentSchedules: [{ code: '', name: 'Current schedule' }],
}

const applicationSearchResults = {
  results: [
    {
      application: 281001,
      status: 'NEW - Submitted',
      client: '00010001',
      ownerClientNumber: '00020001',
      exemptionNumber: '',
      listingDate: '2026-07-08',
      region: 'West Coast',
      applicationVolume: 1250,
      showCheckbox: true,
      locked: false,
    },
    {
      application: 281002,
      status: 'APP - Approved',
      client: '00010002',
      ownerClientNumber: '00020002',
      exemptionNumber: 'E-9001',
      listingDate: '2026-07-09',
      region: 'South Coast',
      applicationVolume: 860,
      showCheckbox: false,
      locked: false,
    },
  ],
  total: 2,
  page: 0,
  size: 25,
}

const offerDetail = {
  offerNumber: 81001,
  applicationNumber: 281001,
  packageNumber: 'PKG-1001',
  companyName: 'Synthetic buyer',
  contactName: 'Pat Example',
  purchaseOfferAmount: 125,
  purchaseOfferDate: '2026-07-10',
  validOfferIndicator: 'Y',
  fairOfferIndicator: 'Y',
  approvalIndicator: 'N',
  exportJurisdictionCode: 'P',
  canEditScheduleDates: true,
  canEditOfferRemarks: true,
  canEditOfferDetails: true,
  canEditWithdrawFields: true,
  locked: false,
  lockedBy: null,
  lockMessage: null,
}

const federalApplicationDetail = {
  applicationNumber: 888,
  federalApplicationNumber: 'FED-888',
  statusCode: 'SUBMITTED',
  statusDescription: 'Submitted',
  ownerClientNumber: '00021234',
  ownerClientLocationCode: '01',
  ownerApplicantType: 'O',
  ownerContactName: 'Pat Example',
  ownerCompanyName: 'Example Forestry Ltd.',
  ownerClientContext: {
    address: '1 Example Road',
    city: 'Victoria',
    province: 'BC',
    postalCode: 'V8V 1V1',
    country: 'Canada',
    phone: '250-555-0101',
    fax: null,
    email: 'pat@example.test',
  },
  agentClientNumber: null,
  agentClientLocationCode: null,
  agentApplicantType: null,
  agentContactName: null,
  agentCompanyName: null,
  agentClientContext: null,
  exemptionNumber: null,
  exemptionType: null,
  exemptionReason: null,
  region: 'West Coast',
  productType: 'Logs',
  applicationDate: '2026-07-08',
  receivedDate: '2026-07-09',
  listingDate: '2026-07-10',
  termDays: 14,
  logLocation: 'Vancouver Island',
  ageClass: 'Mature',
  averageLogVolume: 12.5,
  applicationVolume: 1250,
  endUse: 'Lumber',
  author: 'UI.TESTER',
  readOnly: true,
  locked: false,
  lockHeldByCurrentUser: false,
  lockedBy: null,
  lockMessage: null,
  packages: ['PKG-1001'],
  remarks: [],
  offers: [],
  federalPermit: null,
}

const shippingReferenceOptions = {
  countries: [{ code: 'US', name: 'United States' }],
  transportTypes: [{ code: 'T', name: 'Truck' }],
  ports: [{ code: 'VA', name: 'Vancouver' }],
}

const reportOptions = {
  currentSchedules: [{ code: '2026-07-01', name: 'July 1, 2026' }],
  defaultRegion: '1903',
  regions: [{ code: '1903', name: 'West Coast' }],
  reportJurisdictions: [{ code: '', name: 'All' }],
  biweeklyJurisdictions: [{ code: '', name: 'All' }],
  teacJurisdictions: [{ code: 'P', name: 'Provincial' }],
  exemptionTypes: [{ code: '', name: 'All' }],
  tenureExemptionTypes: [{ code: '', name: 'All' }],
  exemptionReasons: [{ code: '', name: 'All' }],
  exemptionStatuses: [{ code: '', name: 'All' }],
  growthTypes: [{ code: '', name: 'All' }],
  permitStatuses: [{ code: '', name: 'All' }],
  destinationCountries: [{ code: '', name: 'All' }],
  allDestinationCountries: [{ code: 'US', name: 'United States' }],
  portsOfExport: [{ code: '', name: 'All' }],
}

const famIdentitySearchResponse = {
  results: [
    {
      assignmentId: null,
      userId: null,
      userName: 'JSMITH',
      userTypeCode: 'IDIR',
      userTypeDescription: 'IDIR',
      firstName: 'Jane',
      lastName: 'Smith',
      fullName: 'Jane Smith',
      email: 'jane.smith@example.test',
    },
  ],
  total: 1,
  pageNumber: 1,
  pageSize: 10,
  pageCount: 1,
  configured: true,
  message: null,
}

const exportSchedulePage = {
  rows: [
    {
      exportScheduleId: '1001',
      advertisingDate: '2026-07-15',
      applicationReceiptDate: '2026-07-08',
      offerReceiptDate: '2026-07-22',
      offerEndDate: '2026-07-23',
      offerWithdrawalDate: '2026-07-24',
      teacMeetingDate: '2026-07-29',
      applicationCount: 0,
      mutable: true,
    },
  ],
  total: 1,
  page: 0,
  size: 100,
}

const installSyntheticLexisApi = async (page: Page) => {
  await page.route('**/api/lexis/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname
    let body: unknown

    switch (pathname) {
      case '/api/lexis/session/capabilities':
        body = authenticatedAdminSession
        break
      case '/api/lexis/applications/search/options':
        body = applicationSearchOptions
        break
      case '/api/lexis/applications/search/count':
        body = { total: 2 }
        break
      case '/api/lexis/applications/search':
        body = applicationSearchResults
        break
      case '/api/lexis/purchase-offers/81001':
        body = offerDetail
        break
      case '/api/lexis/federal/applications/888':
        body = federalApplicationDetail
        break
      case '/api/lexis/federal/applications/888/remarks':
      case '/api/lexis/rpc/application-details/document-details':
        body = []
        break
      case '/api/lexis/shipping-reference-options':
        body = shippingReferenceOptions
        break
      case '/api/lexis/reports/options':
        body = reportOptions
        break
      case '/api/lexis/rtm/emslogamv':
        body = []
        break
      case '/api/lexis/admin/fam-users':
        body = famIdentitySearchResponse
        break
      case '/api/lexis/admin/schedules':
        body = exportSchedulePage
        break
      default:
        body = { results: [], total: 0, page: 0, size: 25 }
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    })
  })
}

test.describe('FSPTS-aligned LEXIS shell', () => {
  test.beforeEach(async ({ page }) => {
    await installSyntheticLexisApi(page)
  })

  test('renders the authenticated search composition and persists UI preferences', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/provincial/application', { waitUntil: 'domcontentloaded' })

    await expect(
      page.getByRole('heading', { level: 1, name: 'Provincial application search' }),
    ).toBeVisible()
    await expect(page.locator('.csp-header-prefix')).toHaveText('LEXIS')
    await expect(page.locator('.lexis-page-header__subtitle')).toContainText(
      'Find provincial applications',
    )
    await expect(page.locator('.lexis-status-tag')).toHaveCount(2)
    await expect(page.getByText('2 results found', { exact: true })).toBeVisible()

    const typographyFoundation = await page.evaluate(() => {
      const rootStyle = getComputedStyle(document.documentElement)
      const bodyStyle = getComputedStyle(document.body)
      const grid = document.querySelector('.default-grid')
      const label = document.querySelector('label.cds--label')
      const dateInput = document.querySelector('.cds--date-picker__input')
      if (!(grid instanceof HTMLElement)) throw new Error('Default grid not found')
      if (!(label instanceof HTMLElement)) throw new Error('Carbon field label not found')
      if (!(dateInput instanceof HTMLElement)) throw new Error('Carbon date input not found')

      const gridStyle = getComputedStyle(grid)
      const labelStyle = getComputedStyle(label)
      const dateStyle = getComputedStyle(dateInput)
      return {
        primaryText: rootStyle.getPropertyValue('--cds-text-primary').trim(),
        secondaryText: rootStyle.getPropertyValue('--cds-text-secondary').trim(),
        textRendering: bodyStyle.textRendering,
        fontFeatureSettings: bodyStyle.fontFeatureSettings,
        rowGap: gridStyle.rowGap,
        columnGap: gridStyle.columnGap,
        flexGrow: gridStyle.flexGrow,
        labelColor: labelStyle.color,
        dateFontFamily: dateStyle.fontFamily,
        dateLetterSpacing: dateStyle.letterSpacing,
      }
    })

    expect(typographyFoundation).toEqual(
      expect.objectContaining({
        primaryText: '#131315',
        secondaryText: '#606062',
        textRendering: 'optimizespeed',
        fontFeatureSettings: 'normal',
        rowGap: '40px',
        columnGap: '32px',
        flexGrow: '1',
        labelColor: 'rgb(19, 19, 21)',
        dateLetterSpacing: '0.16px',
      }),
    )
    expect(typographyFoundation.dateFontFamily).toContain('BC Sans')

    const themeSwitch = page.getByRole('switch', { name: 'Toggle dark mode' })
    await themeSwitch.click()
    await expect(themeSwitch).toHaveAttribute('aria-checked', 'true')
    await expect(page.locator('html')).toHaveAttribute('data-carbon-theme', 'g100')

    await page.getByRole('button', { name: 'Collapse side navigation' }).click()
    await expect(page.locator('.app-shell')).toHaveClass(/is-side-nav-collapsed/)

    await page.reload({ waitUntil: 'domcontentloaded' })

    await expect(page.getByRole('switch', { name: 'Toggle dark mode' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    await expect(page.locator('html')).toHaveAttribute('data-carbon-theme', 'g100')
    await expect(page.locator('.app-shell')).toHaveClass(/is-side-nav-collapsed/)
  })

  test('applies FSPTS row striping and blue hover to rendered data tables in both themes', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/provincial/application', { waitUntil: 'domcontentloaded' })

    const table = page.getByRole('region', { name: 'Search results table' }).getByRole('table')
    const rows = table.locator('tbody tr')
    const firstRowCell = rows.nth(0).locator('td').first()
    const secondRowCell = rows.nth(1).locator('td').first()

    await expect(rows).toHaveCount(2)
    await expect(firstRowCell).toHaveCSS('background-color', 'rgb(255, 255, 255)')
    await expect(secondRowCell).toHaveCSS('background-color', 'rgb(243, 243, 245)')

    await rows.nth(0).hover()
    await expect(firstRowCell).toHaveCSS('background-color', 'rgb(223, 234, 248)')

    await page.getByRole('switch', { name: 'Toggle dark mode' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-carbon-theme', 'g100')
    await expect(firstRowCell).toHaveCSS('background-color', 'rgb(38, 38, 38)')
    await expect(secondRowCell).toHaveCSS('background-color', 'rgb(57, 57, 57)')

    await rows.nth(0).hover()
    await expect(firstRowCell).toHaveCSS('background-color', 'rgb(31, 61, 90)')
  })

  test('shows one striped RTM AMV table without growth controls or a blank grade row', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/admin/rtm/emslogamv', { waitUntil: 'domcontentloaded' })

    await expect(
      page.getByRole('heading', { level: 1, name: 'Average monthly values' }),
    ).toBeVisible()
    const table = page.getByRole('table', { name: 'Average monthly value table' })
    await expect(table).toBeVisible()
    await expect(table.locator('tbody tr')).toHaveCount(23)
    await expect(page.getByRole('radio')).toHaveCount(0)
    await expect(table.getByRole('cell', { name: 'BLANK', exact: true })).toHaveCount(0)

    const firstRowCell = table.locator('tbody tr').first().locator('td').first()
    await expect(firstRowCell).toHaveCSS('background-color', 'rgb(255, 255, 255)')
    await table.locator('tbody tr').first().hover()
    await expect(firstRowCell).toHaveCSS('background-color', 'rgb(223, 234, 248)')
  })

  test('keeps the search shell within a mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/provincial/application', { waitUntil: 'domcontentloaded' })

    const sideNav = page.getByRole('navigation', { name: 'Side navigation', includeHidden: true })
    const openNavigation = page.getByRole('button', { name: 'Open navigation menu' })

    await expect(openNavigation).toBeVisible()
    await expect(openNavigation).toHaveAttribute('aria-expanded', 'false')
    await expect(sideNav).toHaveAttribute('aria-hidden', 'true')
    await expect(sideNav).not.toBeVisible()

    await expect(
      page.getByRole('heading', { level: 1, name: 'Provincial application search' }),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'Search' })).toBeVisible()
    await expect(page.locator('.lexis-status-tag')).toHaveCount(2)

    await openNavigation.click()

    await expect(page.getByRole('button', { name: 'Close navigation menu' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    await expect(sideNav).toBeVisible()
    await expect(sideNav).not.toHaveAttribute('aria-hidden')
    await expect(page.getByRole('link', { name: 'Applications', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    )

    await page.getByRole('button', { name: 'Close navigation menu' }).click()

    await expect(page.getByRole('button', { name: 'Open navigation menu' })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
    await expect(sideNav).not.toBeVisible()

    const hasHorizontalPageOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )
    expect(hasHorizontalPageOverflow).toBe(false)

    const resultsViewport = page.getByRole('region', { name: 'Search results table' })
    const beforeScroll = await resultsViewport.evaluate((viewport) => {
      const lastColumn = viewport.querySelector('thead th:last-child')
      if (!(lastColumn instanceof HTMLElement)) throw new Error('Last result column not found')

      const viewportBounds = viewport.getBoundingClientRect()
      const columnBounds = lastColumn.getBoundingClientRect()
      return {
        clientWidth: viewport.clientWidth,
        scrollWidth: viewport.scrollWidth,
        columnRight: columnBounds.right,
        viewportRight: viewportBounds.right,
      }
    })

    expect(beforeScroll.scrollWidth).toBeGreaterThan(beforeScroll.clientWidth)
    expect(beforeScroll.columnRight).toBeGreaterThan(beforeScroll.viewportRight)

    const afterScroll = await resultsViewport.evaluate((viewport) => {
      viewport.scrollLeft = viewport.scrollWidth
      const lastColumn = viewport.querySelector('thead th:last-child')
      if (!(lastColumn instanceof HTMLElement)) throw new Error('Last result column not found')

      const viewportBounds = viewport.getBoundingClientRect()
      const columnBounds = lastColumn.getBoundingClientRect()
      return {
        scrollLeft: viewport.scrollLeft,
        columnLeft: columnBounds.left,
        columnRight: columnBounds.right,
        viewportLeft: viewportBounds.left,
        viewportRight: viewportBounds.right,
      }
    })

    expect(afterScroll.scrollLeft).toBeGreaterThan(0)
    expect(afterScroll.columnLeft).toBeGreaterThanOrEqual(afterScroll.viewportLeft - 1)
    expect(afterScroll.columnRight).toBeLessThanOrEqual(afterScroll.viewportRight + 1)
  })

  test('uses FSPTS object-page chrome without mobile overflow', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/provincial/offers/81001', { waitUntil: 'domcontentloaded' })

    await expect(page.getByRole('heading', { level: 1, name: 'Offer 81001' })).toBeVisible()
    await expect(page.getByText('Check and manage this provincial offer')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Provincial offer search' })).toHaveAttribute(
      'href',
      '/provincial/offers',
    )
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
    await expect(page.locator('.detail-page-grid')).toHaveCSS('row-gap', '16px')

    await expect(page.getByLabel('Offer highlights')).toHaveCount(0)

    const detailHeaderLayout = await page.evaluate(() => {
      const breadcrumb = document.querySelector('.cds--breadcrumb')
      const pageHeader = document.querySelector('.lexis-page-header')
      if (!(breadcrumb instanceof HTMLElement)) throw new Error('Detail breadcrumb not found')
      if (!(pageHeader instanceof HTMLElement)) throw new Error('Detail page header not found')

      const breadcrumbBounds = breadcrumb.getBoundingClientRect()
      const pageHeaderBounds = pageHeader.getBoundingClientRect()
      return {
        breadcrumbGap: pageHeaderBounds.top - breadcrumbBounds.bottom,
      }
    })

    expect(detailHeaderLayout.breadcrumbGap).toBeLessThanOrEqual(24)

    await page.setViewportSize({ width: 390, height: 844 })
    await expect(page.getByRole('heading', { level: 1, name: 'Offer 81001' })).toBeVisible()

    const hasHorizontalPageOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )
    expect(hasHorizontalPageOverflow).toBe(false)
  })

  test('bounds detail field cards to one, two, and three columns', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/federal/application/888', { waitUntil: 'domcontentloaded' })

    const ownerFields = page
      .getByRole('heading', { level: 2, name: 'Owner' })
      .locator('..')
      .locator('..')
      .locator('.detail-field-grid')
    await expect(ownerFields).toBeVisible()

    const columnCount = async () =>
      ownerFields.evaluate((grid) => getComputedStyle(grid).gridTemplateColumns.split(' ').length)

    expect(await columnCount()).toBe(3)

    await page.setViewportSize({ width: 768, height: 900 })
    expect(await columnCount()).toBe(2)

    await page.setViewportSize({ width: 390, height: 844 })
    expect(await columnCount()).toBe(1)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      ),
    ).toBe(false)

    await page.getByRole('tab', { name: 'Items' }).click()
    const packageTable = page.getByRole('region', { name: 'Federal application packages' })
    await expect(packageTable).not.toHaveAttribute('tabindex')
    expect(
      await packageTable.locator(':scope > .cds--data-table-content').evaluate((content) => {
        return getComputedStyle(content).overflowX
      }),
    ).toBe('visible')
  })

  test('gives long create forms FSPTS section rhythm without mobile overflow', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/provincial/offers/create', { waitUntil: 'domcontentloaded' })

    await expect(
      page.getByRole('heading', { level: 1, name: 'Create provincial offer' }),
    ).toBeVisible()
    const formCard = page.locator('.provincial-offer-create.create-form-tile')
    const sections = formCard.locator('.create-form-section')
    await expect(formCard).toBeVisible()
    await expect(sections).toHaveCount(5)
    await expect(sections.nth(1)).toHaveCSS('border-top-width', '1px')
    await expect(page.getByRole('group', { name: 'Offer form actions' })).toBeVisible()

    await page.setViewportSize({ width: 390, height: 844 })
    await expect(sections.first()).toBeVisible()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      ),
    ).toBe(false)
  })

  test('styles the selected report configuration without changing its route', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/reports/applicationReport', { waitUntil: 'domcontentloaded' })

    await expect(page.getByRole('heading', { level: 1, name: 'Application Report' })).toBeVisible()
    const reportPanel = page.getByRole('region', { name: 'Application Report' })
    const reportFields = reportPanel.locator('.report-config-fields')
    await expect(reportPanel).toHaveCSS('border-top-width', '1px')
    await expect(reportPanel).toHaveCSS('border-radius', '4px')
    await expect(page.getByRole('group', { name: 'Report actions' })).toBeVisible()
    expect(
      await reportFields.evaluate(
        (grid) => getComputedStyle(grid).gridTemplateColumns.split(' ').length,
      ),
    ).toBe(3)
    expect(new URL(page.url()).pathname).toBe('/reports/applicationReport')

    await page.setViewportSize({ width: 390, height: 844 })
    expect(
      await reportFields.evaluate(
        (grid) => getComputedStyle(grid).gridTemplateColumns.split(' ').length,
      ),
    ).toBe(1)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      ),
    ).toBe(false)
  })

  test('connects the IDIR lookup count, table, and pagination', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/admin', { waitUntil: 'domcontentloaded' })

    const workspace = page.locator('.admin-identity-workspace')
    await expect(workspace).toBeVisible()
    await page.getByLabel('IDIR username').fill('smith')
    await page.getByRole('button', { name: 'Search IDIR' }).click()

    await expect(page.getByText('1 IDIR identity found')).toBeVisible()
    const resultsRegion = page.getByRole('region', { name: 'Search results table' })
    await expect(resultsRegion.getByText('JSMITH')).toBeVisible()
    await expect(workspace.locator('.cds--pagination')).toBeVisible()

    await page.setViewportSize({ width: 390, height: 844 })
    await expect(resultsRegion).toBeVisible()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      ),
    ).toBe(false)
  })

  test('contains the provincial workflow table on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/provincial', { waitUntil: 'domcontentloaded' })

    await expect(
      page.getByRole('heading', { level: 1, name: 'Provincial workflows' }),
    ).toBeVisible()
    const tableViewport = page.getByRole('region', { name: 'Provincial workflows table' })
    await expect(tableViewport).toHaveAttribute('tabindex', '0')
    const beforeScroll = await tableViewport.evaluate((viewport) => {
      const lastColumn = viewport.querySelector('thead th:last-child')
      if (!(lastColumn instanceof HTMLElement)) throw new Error('Open column not found')

      return {
        clientWidth: viewport.clientWidth,
        scrollWidth: viewport.scrollWidth,
        columnRight: lastColumn.getBoundingClientRect().right,
        viewportRight: viewport.getBoundingClientRect().right,
      }
    })

    expect(beforeScroll.scrollWidth).toBeGreaterThan(beforeScroll.clientWidth)
    expect(beforeScroll.columnRight).toBeGreaterThan(beforeScroll.viewportRight)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      ),
    ).toBe(false)

    const afterScroll = await tableViewport.evaluate((viewport) => {
      viewport.scrollLeft = viewport.scrollWidth
      const lastColumn = viewport.querySelector('thead th:last-child')
      if (!(lastColumn instanceof HTMLElement)) throw new Error('Open column not found')

      return {
        scrollLeft: viewport.scrollLeft,
        columnRight: lastColumn.getBoundingClientRect().right,
        viewportRight: viewport.getBoundingClientRect().right,
      }
    })

    expect(afterScroll.scrollLeft).toBeGreaterThan(0)
    expect(afterScroll.columnRight).toBeLessThanOrEqual(afterScroll.viewportRight + 1)
  })

  test('keeps admin policy editors stable while their tables scroll', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/admin/schedules', { waitUntil: 'domcontentloaded' })

    await expect(
      page.getByRole('heading', { level: 1, name: 'Export schedule administration' }),
    ).toBeVisible()
    await expect(page.locator('.admin-policy-editor-tile')).toBeVisible()
    await expect(page.getByText('1 result found')).toBeVisible()
    const resultsRegion = page.getByRole('region', { name: 'Search results table' })
    await expect(resultsRegion.getByText('1001')).toBeVisible()

    await page.setViewportSize({ width: 390, height: 844 })
    const overflow = await resultsRegion.evaluate((region) => ({
      clientWidth: region.clientWidth,
      scrollWidth: region.scrollWidth,
    }))
    expect(overflow.scrollWidth).toBeGreaterThan(overflow.clientWidth)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      ),
    ).toBe(false)
  })

  test('keeps FSPTS upload surfaces coherent in dark mode', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/admin/uploads', { waitUntil: 'domcontentloaded' })

    await expect(page.getByRole('heading', { level: 1, name: 'Data Upload' })).toBeVisible()
    const uploadPage = page.locator('.admin-upload-fspts-page')
    const uploadHeader = page.locator('.admin-upload-fspts-header')
    const uploadPanel = page.locator('.admin-upload-panel').first()
    await expect(uploadPanel).toBeVisible()

    await page.getByRole('switch', { name: 'Toggle dark mode' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-carbon-theme', 'g100')

    const darkSurfaces = await uploadPage.evaluate((root) => {
      const header = root.querySelector('.admin-upload-fspts-header')
      const panel = root.querySelector('.admin-upload-panel')
      if (!(header instanceof HTMLElement) || !(panel instanceof HTMLElement)) {
        throw new Error('Upload surfaces not found')
      }
      const rootStyle = getComputedStyle(root)
      const headerStyle = getComputedStyle(header)
      const panelStyle = getComputedStyle(panel)
      const primaryButtonTextToken = rootStyle.getPropertyValue('--fds-button-primary-text').trim()
      const colorProbe = document.createElement('span')
      colorProbe.style.color = primaryButtonTextToken
      root.append(colorProbe)
      const primaryButtonText = getComputedStyle(colorProbe).color
      colorProbe.remove()
      return {
        background: rootStyle.backgroundColor,
        color: rootStyle.color,
        headerBackground: headerStyle.backgroundColor,
        panelBackground: panelStyle.backgroundColor,
        panelBorder: panelStyle.borderTopColor,
        primaryButtonText,
      }
    })

    expect(darkSurfaces).toEqual({
      background: 'rgb(22, 22, 22)',
      color: 'rgb(244, 244, 244)',
      headerBackground: 'rgb(38, 38, 38)',
      panelBackground: 'rgb(38, 38, 38)',
      panelBorder: 'rgb(82, 82, 82)',
      primaryButtonText: 'rgb(255, 255, 255)',
    })
    await expect(uploadHeader).toHaveCSS('color', 'rgb(244, 244, 244)')

    await page.setViewportSize({ width: 390, height: 844 })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      ),
    ).toBe(false)
  })
})
