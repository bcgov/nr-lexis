import { expect, test, type Page } from '@playwright/test'
import { gotoSyntheticRoute, installSyntheticCognitoSession } from './utils'

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
    '/offerReport',
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
    { code: '1903', name: 'Cariboo' },
    { code: '1904', name: 'Kootenay-Boundary' },
    { code: '1905', name: 'Northeast' },
    { code: '1907', name: 'Thompson-Okanagan' },
    { code: '1909', name: 'South Coast' },
    { code: '1910', name: 'West Coast' },
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

const federalApplicationDocumentRows = [
  {
    id: 'federal-document-1',
    name: 'inspection-file.pdf',
    description: 'Synthetic document',
    type: 'Inspection Files',
    deletable: true,
  },
]

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

const feePolicyPage = {
  rows: [
    {
      id: 'fee-policy-1',
      effectiveDate: '2099-01-01',
      orgUnitNo: '1903',
      orgUnitCode: 'RCO',
      orgUnitName: 'Cariboo Natural Resource Region',
      policyPercentage: '4',
      entryUserId: 'IDIR\\UI.TESTER',
      entryTimestamp: '2026-07-01T12:00:00.000Z',
      updateUserId: 'IDIR\\UI.TESTER',
      updateTimestamp: '2026-07-01T12:00:00.000Z',
    },
  ],
  total: 1,
  page: 0,
  size: 100,
}

const installSyntheticLexisApi = async (page: Page) => {
  let defaultRegion = 'RSI'

  await page.route('**/api/lexis/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname
    let body: unknown
    let status = 200

    switch (pathname) {
      case '/api/lexis/session/capabilities':
        body = authenticatedAdminSession
        break
      case '/api/lexis/session/preferences':
        if (route.request().method() === 'PUT') {
          const requestBody = route.request().postDataJSON() as { defaultRegion?: string | null }
          defaultRegion = requestBody.defaultRegion ?? ''
        }
        body = { defaultRegion: defaultRegion || null }
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
        body = []
        break
      case '/api/lexis/rpc/application-details/document-details':
        body = federalApplicationDocumentRows
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
      case '/api/lexis/admin/schedules':
        body = exportSchedulePage
        break
      case '/api/lexis/admin/policies/fee':
        body = feePolicyPage
        break
      case '/api/lexis/application-submissions/validation':
        if (route.request().postData()?.includes('invalid-submission.xml')) {
          status = 422
          body = {
            status: 'rejected',
            message: 'LEXIS application submission rejected.',
            errors: ['Synthetic package number is required.'],
          }
        } else {
          body = {
            status: 'validated',
            message:
              'LEXIS application submission validated for package UI-TEST-100 with 2 scale rows.',
            packageNumber: 'UI-TEST-100',
            scaleRows: 2,
            submissionSummary: {
              ownerClientNumber: '00010001',
              ownerClientLocationCode: '01',
              ownerContactName: 'UI Test Contact',
              jurisdictionCode: 'P',
              orgUnitNumber: 1909,
              sourceApplicationStatusCode: 'SUB',
              exemptionReasonCode: 'U',
              applicantTypeCode: 'O',
              productTypeCode: 'H',
              productLocation: 'Synthetic location',
              ageClass: 'M',
              applicationVolume: 525,
              averageLogVolume: 0.3,
              averageLength: 6.7,
              averageDiameter: 12.8,
              speciesCodes: ['HE', 'FI'],
              endUseCode: 'PL',
            },
          }
        }
        break
      default:
        body = { results: [], total: 0, page: 0, size: 25 }
    }

    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
    })
  })
}

const submitApplicationSearch = async (page: Page) => {
  const searchButton = page.getByRole('button', { name: 'Search', exact: true })
  await expect(searchButton).toBeVisible()
  await searchButton.click()
  await expect(page.getByText('2 results found', { exact: true })).toBeVisible()
}

test.describe('FSPTS-aligned LEXIS shell', () => {
  test.beforeEach(async ({ page }) => {
    await installSyntheticCognitoSession(page, {
      username: authenticatedAdminSession.principal,
      orgUnitNo: authenticatedAdminSession.orgUnitNo,
    })
    await installSyntheticLexisApi(page)
  })

  test('keeps route-level permission denial distinct from the no-role landing', async ({
    page,
  }) => {
    await page.route('**/api/lexis/session/capabilities', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...authenticatedAdminSession,
          principal: 'UI.READONLY',
          roles: ['READ_ONLY'],
          welcomeTarget: '/provincial/application',
          grantedActions: ['/applicationSearch'],
        }),
      })
    })
    await page.setViewportSize({ width: 1440, height: 900 })
    await gotoSyntheticRoute(page, '/admin/policies', { waitUntil: 'domcontentloaded' })

    await expect(
      page.getByRole('heading', { level: 1, name: "You don't have access to view this page" }),
    ).toBeVisible()
    await expect(page.locator('.app-shell')).toBeVisible()
    await expect(page.getByTestId('forbidden-page')).toHaveClass(/landing-grid-container/)
    await expect(page.getByRole('button', { name: 'Go to my landing page' })).toHaveCSS(
      'height',
      '40px',
    )
    await expect(page.getByRole('button', { name: 'Sign out' })).toHaveCSS('height', '40px')
    const pageWidth = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }))
    expect(pageWidth.scrollWidth).toBeLessThanOrEqual(pageWidth.clientWidth)
  })

  test('shows authenticated users without a LEXIS role the standalone no-access page', async ({
    page,
  }) => {
    await page.route('**/api/lexis/session/capabilities', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...authenticatedAdminSession,
          principal: 'UI.NO.ACCESS',
          roles: [],
          welcomeTarget: 'noAccess',
          legacyPath: null,
          grantedActions: [],
        }),
      })
    })
    await page.setViewportSize({ width: 1440, height: 900 })
    await gotoSyntheticRoute(page, '/provincial/application', {
      waitUntil: 'domcontentloaded',
    })

    await expect(page.getByRole('heading', { level: 1, name: 'Access not granted' })).toBeVisible()
    await expect(page.getByText(/UI\.NO\.ACCESS/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
    await expect(page.locator('.app-shell')).toHaveCount(0)
    await expect(page.getByTestId('unauthorized-page')).toBeVisible()
  })

  test('uses the FSPTS split-screen organization picker without mobile overflow', async ({
    page,
  }) => {
    await page.route('**/api/lexis/session/capabilities', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...authenticatedAdminSession,
          principal: 'UI.MULTI.CLIENT',
          roles: ['PROVINCIAL_SUBMITTER'],
          forestClientNumber: null,
          availableForestClientNumbers: ['00012345', '00067890'],
          forestClientSelectionRequired: true,
        }),
      })
    })
    await page.setViewportSize({ width: 1440, height: 900 })
    await gotoSyntheticRoute(page, '/select-organization', { waitUntil: 'domcontentloaded' })

    await expect(page.getByRole('heading', { level: 1, name: 'Select organization' })).toBeVisible()
    await expect(page.getByRole('img', { name: 'BC forest landscape' })).toBeVisible()
    const firstOrganization = page.getByRole('radio', { name: 'Forest client 00012345' })
    const continueButton = page.getByRole('button', { name: 'Continue' })
    await expect(firstOrganization).not.toBeChecked()
    await expect(continueButton).toBeDisabled()

    const desktopColumns = await page.evaluate(() => {
      const content = document.querySelector('.forest-client-selection__content')
      const image = document.querySelector('.forest-client-selection .landing-img-col')
      if (!(content instanceof HTMLElement) || !(image instanceof HTMLElement)) {
        throw new Error('Organization selection columns not found')
      }
      return {
        contentWidth: content.getBoundingClientRect().width,
        imageWidth: image.getBoundingClientRect().width,
      }
    })
    expect(Math.abs(desktopColumns.contentWidth - desktopColumns.imageWidth)).toBeLessThanOrEqual(1)

    await firstOrganization.focus()
    await page.keyboard.press('Space')
    await expect(firstOrganization).toBeChecked()
    await expect(continueButton).toBeEnabled()

    await page.setViewportSize({ width: 390, height: 844 })
    await expect(page.locator('.forest-client-selection__panel')).toBeVisible()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      ),
    ).toBe(false)
  })

  test('uses the shared full-width page composition for notifications', async ({ page }) => {
    await page.setViewportSize({ width: 2400, height: 1200 })
    await gotoSyntheticRoute(page, '/notifications', { waitUntil: 'domcontentloaded' })

    await expect(page.getByRole('heading', { level: 1, name: 'Notifications' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'New notification' })).toBeVisible()

    const layout = await page.locator('.notifications-page').evaluate((notificationsPage) => {
      const main = document.querySelector('main.app-main')
      const pageHeader = notificationsPage.querySelector('.lexis-page-header')
      const title = notificationsPage.querySelector('.lexis-page-header__title')
      const subtitle = notificationsPage.querySelector('.lexis-page-header__subtitle')
      const resultsBar = notificationsPage.querySelector('.notifications-page__results-bar')
      if (!(main instanceof HTMLElement)) throw new Error('Application content not found')
      if (!(pageHeader instanceof HTMLElement)) throw new Error('Shared page header not found')
      if (!(title instanceof HTMLElement)) throw new Error('Notification title not found')
      if (!(subtitle instanceof HTMLElement)) throw new Error('Notification subtitle not found')
      if (!(resultsBar instanceof HTMLElement))
        throw new Error('Notification results bar not found')

      const mainStyle = getComputedStyle(main)
      const titleStyle = getComputedStyle(title)
      const subtitleStyle = getComputedStyle(subtitle)
      const pageBounds = notificationsPage.getBoundingClientRect()
      const resultsBounds = resultsBar.getBoundingClientRect()
      const availableWidth =
        main.clientWidth -
        Number.parseFloat(mainStyle.paddingLeft) -
        Number.parseFloat(mainStyle.paddingRight)

      return {
        availableWidth,
        pageWidth: pageBounds.width,
        pageLeft: pageBounds.left,
        pageRight: pageBounds.right,
        resultsLeft: resultsBounds.left,
        resultsRight: resultsBounds.right,
        titleFontSize: titleStyle.fontSize,
        titleFontWeight: titleStyle.fontWeight,
        titleLineHeight: titleStyle.lineHeight,
        subtitleFontSize: subtitleStyle.fontSize,
        subtitleLineHeight: subtitleStyle.lineHeight,
      }
    })

    expect(Math.abs(layout.pageWidth - layout.availableWidth)).toBeLessThanOrEqual(1)
    expect(Math.abs(layout.resultsLeft - layout.pageLeft)).toBeLessThanOrEqual(1)
    expect(Math.abs(layout.resultsRight - layout.pageRight)).toBeLessThanOrEqual(1)
    expect(layout.titleFontSize).toBe('32px')
    expect(layout.titleFontWeight).toBe('400')
    expect(layout.titleLineHeight).toBe('40px')
    expect(layout.subtitleFontSize).toBe('16px')
    expect(layout.subtitleLineHeight).toBe('24px')
  })

  test('renders the authenticated search composition and persists UI preferences', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await gotoSyntheticRoute(page, '/provincial/application', {
      waitUntil: 'domcontentloaded',
    })

    await expect(page).toHaveTitle('Log Exemption Information System')
    await expect(page.locator('link[rel="icon"]')).toHaveAttribute('type', 'image/png')
    await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/bcid-192x192.png')
    await expect(
      page.getByRole('heading', { level: 1, name: 'Provincial application search' }),
    ).toBeVisible()
    await expect(page.locator('.csp-header-prefix')).toHaveText('LEXIS')
    const navigationToggle = page.getByRole('button', { name: 'Close menu' })
    await expect(navigationToggle).toBeVisible()
    await expect(navigationToggle).toHaveCSS('width', '48px')
    await expect(navigationToggle).toHaveCSS('height', '48px')
    await expect(page.locator('.csp-app-header > #navigation-toggle')).toHaveCount(1)
    await expect(page.locator('.csp-side-nav > .csp-side-nav__toggle')).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Application search', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Provincial', exact: true })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    await expect(page.getByRole('button', { name: 'Federal', exact: true })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
    await expect(page.getByRole('button', { name: 'Reports', exact: true })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
    await expect(page.getByRole('button', { name: 'Admin', exact: true })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
    const provincialSectionToggle = page.getByRole('button', {
      name: 'Provincial',
      exact: true,
    })
    await expect(provincialSectionToggle).toHaveClass(/cds--side-nav__submenu/)
    const sectionToggleLayout = await provincialSectionToggle.evaluate((toggle) => {
      const title = toggle.querySelector('.cds--side-nav__submenu-title')
      const chevron = toggle.querySelector('.cds--side-nav__submenu-chevron svg')
      if (!(title instanceof HTMLElement)) throw new Error('Side navigation title not found')
      if (!(chevron instanceof SVGElement)) throw new Error('Side navigation chevron not found')

      const titleBounds = title.getBoundingClientRect()
      const chevronBounds = chevron.getBoundingClientRect()
      return {
        display: getComputedStyle(toggle).display,
        titleCenter: titleBounds.top + titleBounds.height / 2,
        chevronCenter: chevronBounds.top + chevronBounds.height / 2,
        titleRight: titleBounds.right,
        chevronLeft: chevronBounds.left,
      }
    })
    expect(sectionToggleLayout.display).toBe('flex')
    expect(
      Math.abs(sectionToggleLayout.titleCenter - sectionToggleLayout.chevronCenter),
    ).toBeLessThan(1)
    expect(sectionToggleLayout.chevronLeft).toBeGreaterThan(sectionToggleLayout.titleRight)
    await expect(page.locator('.lexis-page-header__subtitle')).toContainText(
      'Find provincial applications',
    )
    const initialShellLayout = await page.evaluate(() => {
      const sideNav = document.querySelector('.csp-side-nav')
      const main = document.querySelector('main.app-main')
      const heading = document.querySelector('.lexis-page-header')
      const filters = document.querySelector('.provincial-application-search-filters')
      const criteria = document.querySelector('.provincial-application-search-grid')
      const actions = filters?.querySelector('.legacy-search-actions')
      if (!(sideNav instanceof HTMLElement)) throw new Error('Side navigation not found')
      if (!(main instanceof HTMLElement)) throw new Error('Application content not found')
      if (!(heading instanceof HTMLElement)) throw new Error('Page heading not found')
      if (!(filters instanceof HTMLElement)) throw new Error('Search filters not found')
      if (!(criteria instanceof HTMLElement)) throw new Error('Search criteria not found')
      if (!(actions instanceof HTMLElement)) throw new Error('Search actions not found')

      const sideNavBounds = sideNav.getBoundingClientRect()
      const mainBounds = main.getBoundingClientRect()
      const headingBounds = heading.getBoundingClientRect()
      const filterBounds = filters.getBoundingClientRect()
      const criteriaBounds = criteria.getBoundingClientRect()
      const actionBounds = actions.getBoundingClientRect()
      return {
        sideNavWidth: sideNavBounds.width,
        mainLeft: mainBounds.left,
        mainTop: mainBounds.top,
        headingLeft: headingBounds.left,
        filterLeft: filterBounds.left,
        criteriaActionGap: actionBounds.top - criteriaBounds.bottom,
        sideNavTransitionMs: Number.parseFloat(getComputedStyle(sideNav).transitionDuration) * 1000,
        mainTransitionMs: Number.parseFloat(getComputedStyle(main).transitionDuration) * 1000,
      }
    })
    expect(initialShellLayout.sideNavWidth).toBe(256)
    expect(initialShellLayout.mainLeft).toBe(256)
    expect(initialShellLayout.mainTop).toBe(64)
    expect(initialShellLayout.headingLeft - initialShellLayout.mainLeft).toBe(24)
    expect(initialShellLayout.filterLeft).toBe(initialShellLayout.headingLeft)
    expect(initialShellLayout.criteriaActionGap).toBe(12)
    expect(initialShellLayout.sideNavTransitionMs).toBe(320)
    expect(initialShellLayout.mainTransitionMs).toBe(320)
    await expect(
      page.getByRole('combobox', { name: /^Region\s*Total items selected:\s*3/ }),
    ).toBeVisible()
    await expect(page.locator('.region-multi-select .cds--tag--filter')).toHaveText('3')
    await expect(page.getByRole('list', { name: 'Selected regions' })).toHaveCount(0)
    const applicationSearchRequest = page.waitForRequest(
      (request) => new URL(request.url()).pathname === '/api/lexis/applications/search',
    )
    await submitApplicationSearch(page)
    const submittedRegionParams = new URL((await applicationSearchRequest).url()).searchParams
    expect(submittedRegionParams.getAll('region')).toEqual(['1903', '1904', '1907'])
    await expect(page.locator('.lexis-status-tag')).toHaveCount(2)
    const applicationSortHeader = page.getByRole('columnheader', {
      name: 'Application',
      exact: true,
    })
    await expect(applicationSortHeader).toHaveAttribute('aria-sort', 'descending')
    await expect(applicationSortHeader.locator('button.cds--table-sort')).toBeVisible()
    const fullWidthResults = await page
      .getByRole('region', { name: 'Search results table' })
      .evaluate((results) => {
        const main = document.querySelector('main.app-main')
        const filters = document.querySelector('.provincial-application-search-filters')
        const resultsSection = results.closest('.legacy-search-section--results')
        if (!(main instanceof HTMLElement)) throw new Error('Application content not found')
        if (!(filters instanceof HTMLElement)) throw new Error('Search filters not found')
        if (!(resultsSection instanceof HTMLElement)) throw new Error('Results section not found')

        const resultsBounds = results.getBoundingClientRect()
        const mainBounds = main.getBoundingClientRect()
        const filterBounds = filters.getBoundingClientRect()
        const resultsSectionBounds = resultsSection.getBoundingClientRect()
        return {
          resultsLeft: resultsBounds.left,
          resultsRight: resultsBounds.right,
          mainLeft: mainBounds.left,
          mainRight: mainBounds.right,
          headingLeft: document.querySelector('.lexis-page-header')?.getBoundingClientRect().left,
          filterResultsGap: resultsSectionBounds.top - filterBounds.bottom,
        }
      })
    expect(Math.abs(fullWidthResults.resultsLeft - fullWidthResults.mainLeft)).toBeLessThanOrEqual(
      1,
    )
    expect(
      Math.abs(fullWidthResults.resultsRight - fullWidthResults.mainRight),
    ).toBeLessThanOrEqual(1)
    expect(fullWidthResults.headingLeft).toBe(initialShellLayout.headingLeft)
    expect(fullWidthResults.filterResultsGap).toBe(32)
    const resultActionToolbar = page.locator(
      '.legacy-search-table-toolbar--with-actions .cds--toolbar-content',
    )
    await expect(resultActionToolbar).toHaveCSS('align-items', 'center')
    await expect(resultActionToolbar).toHaveCSS('height', '56px')
    await expect(resultActionToolbar).toHaveCSS('padding-left', '16px')
    await expect(page.locator('.legacy-search-table-toolbar')).toHaveCSS(
      'background-color',
      'rgb(244, 244, 244)',
    )
    await expect(page.locator('.legacy-search-table-frame .cds--pagination')).toHaveCSS(
      'background-color',
      'rgb(244, 244, 244)',
    )
    const activeNavLink = page.locator(
      'a.csp-side-nav__link[data-label="Application search"][href="/provincial/application"]',
    )
    const inactiveNavLink = page.locator('a.csp-side-nav__link[data-label="Exemption search"]')
    await expect(activeNavLink).toHaveCSS('height', '48px')
    await expect(activeNavLink).toHaveCSS('font-weight', '600')
    await expect(activeNavLink).toHaveCSS('background-color', 'rgb(232, 232, 232)')
    await expect(activeNavLink.locator('.csp-side-nav__link-text')).toHaveCSS(
      'color',
      'rgb(19, 19, 21)',
    )
    await expect(inactiveNavLink).toHaveCSS('height', '48px')
    await expect(inactiveNavLink).toHaveCSS('font-weight', '400')
    await expect(inactiveNavLink.locator('.csp-side-nav__link-text')).toHaveCSS(
      'color',
      'rgb(96, 96, 98)',
    )
    const reportsToggle = page.getByRole('button', { name: 'Reports', exact: true })
    await reportsToggle.click()
    await expect(page.locator('a.csp-side-nav__link[data-label="Application Report"]')).toHaveCount(
      0,
    )
    await expect(page.locator('a.csp-side-nav__link[data-label="TEAC Package"]')).toHaveCount(0)
    await expect(page.locator('a.csp-side-nav__link[data-label="Exemptions Report"]')).toHaveCount(
      0,
    )
    await expect(page.locator('a.csp-side-nav__link[data-label="Fees Report"]')).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Advertising List', exact: true })).toBeVisible()

    const typographyFoundation = await page.evaluate(() => {
      const rootStyle = getComputedStyle(document.documentElement)
      const bodyStyle = getComputedStyle(document.body)
      const grid = document.querySelector('.default-grid')
      const dateInput = document.querySelector('.cds--date-picker__input')
      if (!(grid instanceof HTMLElement)) throw new Error('Default grid not found')
      const label = grid.querySelector('label.cds--label')
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
        rowGap: '24px',
        columnGap: '32px',
        flexGrow: '1',
        labelColor: 'rgb(19, 19, 21)',
        dateLetterSpacing: '0.16px',
      }),
    )
    expect(typographyFoundation.dateFontFamily).toContain('BC Sans')

    const themeSwitch = page.getByRole('switch', { name: 'Toggle dark mode' })
    await expect(themeSwitch).toHaveCSS('width', '48px')
    await expect(themeSwitch).toHaveCSS('height', '24px')
    await expect(themeSwitch).toHaveCSS('background-color', 'rgba(255, 255, 255, 0.9)')
    const themeSwitchThumb = page.locator('.csp-theme-switch__thumb')
    await expect(themeSwitchThumb).toHaveCSS('width', '18px')
    await expect(themeSwitchThumb).toHaveCSS('height', '18px')
    await expect(themeSwitchThumb).toHaveCSS('background-color', 'rgb(0, 115, 230)')
    await expect(themeSwitchThumb).toHaveCSS('color', 'rgb(255, 255, 255)')

    await page.getByRole('button', { name: 'Open profile panel' }).click()
    const profilePanel = page.getByRole('dialog', { name: 'My profile' })
    await expect(profilePanel).toHaveClass(/is-open/)
    await expect(profilePanel.getByRole('button', { name: 'Log out' })).toBeVisible()
    await expect(profilePanel.getByRole('combobox', { name: 'Default zone' })).toHaveValue('RSI')
    await expect(profilePanel).toContainText(
      'Preselects the Cariboo, Kootenay-Boundary, and Thompson-Okanagan Natural Resource Regions in search tables.',
    )
    const profileLayout = await profilePanel.evaluate((panel) => {
      const avatar = panel.querySelector('.profile-avatar')
      if (!(avatar instanceof HTMLElement)) throw new Error('Profile avatar not found')
      return {
        panelWidth: panel.getBoundingClientRect().width,
        avatarWidth: avatar.getBoundingClientRect().width,
        avatarHeight: avatar.getBoundingClientRect().height,
        backgroundColor: getComputedStyle(panel).backgroundColor,
      }
    })
    expect(profileLayout).toEqual({
      panelWidth: 384,
      avatarWidth: 64,
      avatarHeight: 64,
      backgroundColor: 'rgb(255, 255, 255)',
    })
    const coastSearchRequest = page.waitForRequest((request) => {
      const url = new URL(request.url())
      return (
        url.pathname === '/api/lexis/applications/search' &&
        url.searchParams.getAll('region').join(',') === '1909,1910'
      )
    })
    await profilePanel.getByRole('combobox', { name: 'Default zone' }).selectOption('RCO')
    await profilePanel.getByRole('button', { name: 'Save preference' }).click()
    await expect(profilePanel.getByRole('status')).toHaveText('Preference saved.')
    await coastSearchRequest
    await profilePanel.getByRole('button', { name: 'Close profile panel' }).click()
    await expect(page.locator('#profile-panel')).toHaveAttribute('aria-hidden', 'true')
    await expect(
      page.getByRole('combobox', { name: /^Region\s*Total items selected:\s*2/ }),
    ).toBeVisible()
    await expect.poll(() => new URL(page.url()).searchParams.get('region')).toBe('1909,1910')

    await themeSwitch.click()
    await expect(themeSwitch).toHaveAttribute('aria-checked', 'true')
    await expect(themeSwitch).toHaveCSS('background-color', 'rgb(22, 22, 22)')
    await expect(page.locator('.csp-theme-switch__thumb')).toHaveCSS(
      'transform',
      'matrix(1, 0, 0, 1, 24, 0)',
    )
    await expect(page.locator('.csp-theme-switch__thumb')).toHaveCSS(
      'background-color',
      'rgb(255, 255, 255)',
    )
    await expect(page.locator('.csp-theme-switch__thumb')).toHaveCSS('color', 'rgb(22, 22, 22)')
    await expect(page.locator('html')).toHaveAttribute('data-carbon-theme', 'g100')

    await page.getByRole('button', { name: 'Close menu' }).click()
    await expect(page.locator('.app-shell')).toHaveClass(/is-side-nav-collapsed/)
    const collapsedNav = page.locator('.csp-side-nav')
    await expect(collapsedNav).toHaveCSS('width', '48px')
    const collapsedLinkLayout = await page
      .locator(
        'a.csp-side-nav__link[data-label="Application search"][href="/provincial/application"]',
      )
      .evaluate((link) => {
        const nav = document.querySelector('.csp-side-nav')
        const icon = link.querySelector('.csp-side-nav__icon')
        if (!(nav instanceof HTMLElement)) throw new Error('Side navigation not found')
        if (!(icon instanceof HTMLElement)) throw new Error('Navigation icon not found')
        const navBounds = nav.getBoundingClientRect()
        const iconBounds = icon.getBoundingClientRect()
        const tooltipStyle = getComputedStyle(link, '::after')
        return {
          centerOffset:
            iconBounds.left + iconBounds.width / 2 - (navBounds.left + navBounds.width / 2),
          tooltipBackground: tooltipStyle.backgroundColor,
          tooltipRadius: tooltipStyle.borderRadius,
          tooltipPaddingBlockStart: tooltipStyle.paddingBlockStart,
        }
      })
    expect(Math.abs(collapsedLinkLayout.centerOffset)).toBeLessThanOrEqual(2)
    expect(collapsedLinkLayout.tooltipBackground).toBe('rgb(19, 19, 21)')
    expect(collapsedLinkLayout.tooltipRadius).toBe('4px')
    expect(collapsedLinkLayout.tooltipPaddingBlockStart).toBe('6px')

    await page.reload({ waitUntil: 'domcontentloaded' })

    await expect(page.getByRole('switch', { name: 'Toggle dark mode' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    await expect(page.locator('html')).toHaveAttribute('data-carbon-theme', 'g100')
    await expect(page.locator('.app-shell')).toHaveClass(/is-side-nav-collapsed/)
  })

  test('uses the shared FSPTS Carbon interaction chrome', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await gotoSyntheticRoute(page, '/provincial/application?exportScheduleId=1002', {
      waitUntil: 'domcontentloaded',
    })

    const fieldLabel = page
      .locator('.provincial-application-search-filters label.cds--label')
      .first()
    const fieldInput = page.getByRole('textbox', { name: 'Application number' })
    await expect(page.locator('.lexis-page-header__title')).toHaveCSS(
      'font-family',
      '"BC Sans", "IBM Plex Sans", -apple-system, sans-serif',
    )
    await expect(fieldLabel).toHaveCSS('font-size', '14px')
    await expect(fieldInput).toHaveCSS('font-size', '16px')

    const clearButton = page.getByRole('button', { name: 'Clear all', exact: true })
    await expect(clearButton).toHaveCSS('height', '40px')
    await clearButton.hover()
    await expect(clearButton).toHaveCSS('background-color', 'rgb(235, 242, 252)')
    await expect(clearButton).toHaveCSS('border-color', 'rgb(0, 92, 184)')
    await expect(clearButton).toHaveCSS('color', 'rgb(0, 92, 184)')

    const addApplicationAction = page.getByRole('link', { name: 'Add application' })
    await expect(addApplicationAction).toHaveClass(/cds--btn--primary/)
    expect(
      await addApplicationAction.evaluate((action) =>
        Boolean(action.closest('.legacy-search-table-toolbar__actions')),
      ),
    ).toBe(true)
    await expect(addApplicationAction).toHaveCSS('background-color', 'rgb(0, 115, 230)')

    const infoNotification = page.locator('.cds--inline-notification--info')
    await expect(infoNotification).toContainText('Export schedule filter applied')
    await expect(infoNotification).toHaveCSS('background-color', 'rgb(194, 224, 255)')
    await expect(infoNotification).toHaveCSS('border-left-width', '4px')
    await expect(infoNotification).toHaveCSS('border-left-color', 'rgb(0, 92, 184)')

    const iconTooltipPopovers = page.locator('.cds--icon-tooltip > .cds--popover')
    expect(await iconTooltipPopovers.count()).toBeGreaterThan(0)
    await expect(iconTooltipPopovers.first()).toHaveCSS('display', 'none')

    const sharedTokens = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement)
      const resolveColor = (value: string) => {
        const probe = document.createElement('span')
        probe.style.color = value
        document.body.append(probe)
        const resolvedColor = getComputedStyle(probe).color
        probe.remove()
        return resolvedColor
      }

      return {
        greenTagBackground: resolveColor(
          style.getPropertyValue('--cds-tag-background-green').trim(),
        ),
        greenTagColor: resolveColor(style.getPropertyValue('--cds-tag-color-green').trim()),
      }
    })
    expect(sharedTokens).toEqual({
      greenTagBackground: 'rgb(204, 229, 204)',
      greenTagColor: 'rgb(0, 85, 0)',
    })

    const attachedTableCorners = await page.evaluate(() => {
      const probe = document.createElement('div')
      probe.style.position = 'absolute'
      probe.innerHTML = `
        <div class="cds--data-table-header"></div>
        <div class="cds--pagination">
          <button class="cds--pagination__button" type="button"></button>
        </div>
      `
      document.querySelector('.app-shell')?.append(probe)

      const corners = (selector: string) => {
        const style = getComputedStyle(probe.querySelector(selector) as HTMLElement)
        return [
          style.borderTopLeftRadius,
          style.borderTopRightRadius,
          style.borderBottomRightRadius,
          style.borderBottomLeftRadius,
        ].join(' ')
      }

      const result = {
        tableHeader: corners('.cds--data-table-header'),
        pagination: corners('.cds--pagination'),
        paginationButton: corners('.cds--pagination__button'),
      }
      probe.remove()
      return result
    })

    expect(attachedTableCorners).toEqual({
      tableHeader: '4px 4px 0px 0px',
      pagination: '0px 0px 4px 4px',
      paginationButton: '0px 0px 0px 0px',
    })

    const emptyStateChrome = await page.evaluate(() => {
      const probe = document.createElement('div')
      probe.className = 'lexis-table-frame legacy-search-table-content'
      probe.style.position = 'absolute'
      probe.innerHTML = `
        <section class="lexis-empty-state"></section>
        <div class="cds--pagination"></div>
      `
      document.querySelector('.app-shell')?.append(probe)

      const emptyState = probe.querySelector('.lexis-empty-state') as HTMLElement
      const pagination = probe.querySelector('.cds--pagination') as HTMLElement
      const result = {
        emptyStateBackground: getComputedStyle(emptyState).backgroundColor,
        paginationDisplay: getComputedStyle(pagination).display,
      }
      probe.remove()
      return result
    })

    expect(emptyStateChrome).toEqual({
      emptyStateBackground: 'rgba(0, 0, 0, 0)',
      paginationDisplay: 'none',
    })
  })

  test('uses the same FSPTS list-page foundation on every primary search route', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })

    for (const route of [
      '/provincial/application',
      '/provincial/exemption',
      '/provincial/offers',
      '/provincial/permit',
      '/provincial/review',
      '/federal',
    ]) {
      await gotoSyntheticRoute(page, route, { waitUntil: 'domcontentloaded' })
      const pageGrid = page.locator('.default-grid.fullbleed-table-page')
      await expect(pageGrid).toBeVisible()
      await expect(page.locator('.legacy-search-section--filters')).toBeVisible()

      const alignment = await page.evaluate(() => {
        const main = document.querySelector('main.app-main')
        const heading = document.querySelector('.lexis-page-header')
        const filters = document.querySelector('.legacy-search-section--filters')
        const grid = document.querySelector('.default-grid.fullbleed-table-page')
        if (!(main instanceof HTMLElement)) throw new Error('Application content not found')
        if (!(heading instanceof HTMLElement)) throw new Error('Page heading not found')
        if (!(filters instanceof HTMLElement)) throw new Error('Search filters not found')
        if (!(grid instanceof HTMLElement)) throw new Error('List page grid not found')

        const mainBounds = main.getBoundingClientRect()
        const headingBounds = heading.getBoundingClientRect()
        const filterBounds = filters.getBoundingClientRect()
        const gridStyle = getComputedStyle(grid)
        return {
          headingInset: headingBounds.left - mainBounds.left,
          filterLeft: filterBounds.left,
          headingLeft: headingBounds.left,
          paddingBlockStart: gridStyle.paddingBlockStart,
          paddingInlineStart: gridStyle.paddingInlineStart,
          rowGap: gridStyle.rowGap,
        }
      })

      expect(alignment.filterLeft).toBe(alignment.headingLeft)
      expect(alignment).toEqual(
        expect.objectContaining({
          headingInset: 24,
          paddingBlockStart: '16px',
          paddingInlineStart: '0px',
          rowGap: '24px',
        }),
      )
    }
  })

  test('uses accessible dark interactions and stable FSPTS table rows', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await gotoSyntheticRoute(page, '/provincial/application', {
      waitUntil: 'domcontentloaded',
    })
    await submitApplicationSearch(page)

    const resultsRegion = page.getByRole('region', { name: 'Search results table' })
    const table = resultsRegion.getByRole('table')
    const rows = table.locator('tbody tr')
    const firstRowCell = rows.nth(0).locator('td').first()
    const secondRowCell = rows.nth(1).locator('td').first()

    await expect(rows).toHaveCount(2)
    await expect(table).toHaveClass(/cds--data-table--md/)
    await expect(rows.first().getByRole('cell', { name: '—', exact: true })).toBeVisible()
    const firstRowHeight = await rows.first().evaluate((row) => row.getBoundingClientRect().height)
    expect(firstRowHeight).toBeGreaterThanOrEqual(40)
    expect(firstRowHeight).toBeLessThanOrEqual(64)
    await expect(table.getByRole('columnheader', { name: 'Application', exact: true })).toHaveCSS(
      'white-space',
      'nowrap',
    )
    await expect(table.locator('.legacy-search-table-date').first()).toHaveCSS(
      'white-space',
      'nowrap',
    )
    await expect(table.locator('.lexis-status-tag').first()).toHaveCSS('white-space', 'nowrap')
    await expect(firstRowCell).toHaveCSS('font-size', '14px')
    await expect(firstRowCell).toHaveCSS('vertical-align', 'top')
    await expect(firstRowCell).toHaveCSS('background-color', 'rgb(255, 255, 255)')
    await expect(secondRowCell).toHaveCSS('background-color', 'rgb(243, 243, 245)')
    const rowDividerStyles = await Promise.all(
      [firstRowCell, secondRowCell].map((cell) =>
        cell.evaluate((element) => {
          const style = getComputedStyle(element)
          return {
            backgroundColor: style.backgroundColor,
            borderBlockEndColor: style.borderBlockEndColor,
            borderBlockStartColor: style.borderBlockStartColor,
          }
        }),
      ),
    )
    expect(rowDividerStyles[0]?.borderBlockEndColor).toBe(rowDividerStyles[0]?.backgroundColor)
    expect(rowDividerStyles[1]?.borderBlockStartColor).toBe(rowDividerStyles[1]?.backgroundColor)
    expect(rowDividerStyles[1]?.borderBlockEndColor).toBe(rowDividerStyles[1]?.backgroundColor)
    await expect(page.getByText('2 results found', { exact: true })).toHaveCSS('font-weight', '400')

    const pagination = page.locator('.legacy-search-table-frame .cds--pagination')
    await expect(pagination).toHaveCSS('border-top-width', '1px')
    await expect(pagination).toHaveCSS('border-bottom-width', '1px')
    await expect(pagination.locator('.cds--pagination__control-buttons')).toHaveCSS(
      'height',
      '48px',
    )
    await expect(pagination.locator('.cds--select__item-count')).toHaveCSS(
      'border-right-width',
      '1px',
    )
    await expect(pagination.locator('.cds--select__item-count')).toHaveCSS('margin', '0px')
    await expect(pagination.locator('.cds--pagination__right')).toHaveCSS(
      'border-left-width',
      '1px',
    )
    await expect(pagination.locator('.cds--pagination__button').first()).toHaveCSS('margin', '0px')

    await rows.nth(0).hover()
    await expect(firstRowCell).toHaveCSS('background-color', 'rgb(255, 255, 255)')

    const addApplicationAction = page.getByRole('link', { name: 'Add application' })
    await page.getByRole('switch', { name: 'Toggle dark mode' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-carbon-theme', 'g100')
    await expect(addApplicationAction).toHaveCSS('color', 'rgb(255, 255, 255)')
    await expect(page.getByRole('button', { name: 'Clear all', exact: true })).toHaveCSS(
      'color',
      'rgb(255, 255, 255)',
    )
    await expect(page.getByRole('button', { name: 'Search', exact: true })).toHaveCSS(
      'background-color',
      'rgb(0, 115, 230)',
    )
    await expect(page.locator('.csp-app-header')).toHaveCSS('background-color', 'rgb(0, 115, 230)')
    await expect(page.locator('main.app-main')).toHaveCSS('background-color', 'rgb(22, 22, 22)')
    await expect(page.locator('.csp-side-nav')).toHaveCSS('background-color', 'rgb(22, 22, 22)')
    await expect(page.locator('.legacy-search-table-toolbar')).toHaveCSS(
      'background-color',
      'rgb(38, 38, 38)',
    )
    await expect(pagination).toHaveCSS('background-color', 'rgb(38, 38, 38)')
    await expect(table.locator('thead th').first()).toHaveCSS('background-color', 'rgb(57, 57, 57)')
    await expect(firstRowCell).toHaveCSS('background-color', 'rgb(38, 38, 38)')
    await expect(secondRowCell).toHaveCSS('background-color', 'rgb(44, 44, 44)')
    const darkActiveNavLink = page.locator(
      'a.csp-side-nav__link[data-label="Application search"][href="/provincial/application"]',
    )
    await expect(darkActiveNavLink).toHaveCSS('background-color', 'rgb(51, 51, 51)')
    await expect(darkActiveNavLink.locator('.csp-side-nav__link-text')).toHaveCSS(
      'color',
      'rgb(244, 244, 244)',
    )
    const darkRowDividerStyles = await Promise.all(
      [firstRowCell, secondRowCell].map((cell) =>
        cell.evaluate((element) => {
          const style = getComputedStyle(element)
          return {
            backgroundColor: style.backgroundColor,
            borderBlockEndColor: style.borderBlockEndColor,
            borderBlockStartColor: style.borderBlockStartColor,
          }
        }),
      ),
    )
    expect(darkRowDividerStyles[0]?.borderBlockEndColor).toBe(
      darkRowDividerStyles[0]?.backgroundColor,
    )
    expect(darkRowDividerStyles[1]?.borderBlockStartColor).toBe(
      darkRowDividerStyles[1]?.backgroundColor,
    )
    expect(darkRowDividerStyles[1]?.borderBlockEndColor).toBe(
      darkRowDividerStyles[1]?.backgroundColor,
    )
    await expect(table.locator('.lexis-status-tag').first()).toHaveCSS(
      'background-color',
      'rgb(194, 224, 255)',
    )

    await rows.nth(0).hover()
    await expect(firstRowCell).toHaveCSS('background-color', 'rgb(38, 38, 38)')

    await gotoSyntheticRoute(page, '/provincial/application/create', {
      waitUntil: 'domcontentloaded',
    })
    await page.getByRole('tab', { name: 'Remarks' }).click()
    const comments = page.getByRole('textbox', { name: 'Comments' })
    await expect(comments).toBeVisible()
    await expect(comments).toHaveAttribute('rows', '4')
    await expect(comments).not.toHaveCSS('height', '40px')
    await expect(comments).toHaveCSS('min-height', '40px')
    await expect(comments).toHaveCSS('resize', 'vertical')

    await page.getByRole('tab', { name: 'Items' }).click()
    const applicationItemsCard = page.locator('.application-items-card').first()
    await expect(applicationItemsCard).toBeVisible()
    await expect(applicationItemsCard).toHaveCSS('border-color', 'rgb(82, 82, 82)')
  })

  test('exposes only the spreadsheet RTM AMV workflow', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await gotoSyntheticRoute(page, '/admin/rtm/emslogamv', {
      waitUntil: 'domcontentloaded',
    })

    await expect(page).toHaveURL(/\/admin\/rtm\/emslogamv\/upload$/)
    await expect(
      page.getByRole('heading', { level: 1, name: 'Average market values' }),
    ).toBeVisible()
    await expect(page).toHaveTitle('Average market values | NR LEXIS')
    await expect(page.locator('main.app-main')).toHaveCSS('padding-bottom', '0px')
    await expect(page.getByRole('region', { name: 'Upload spreadsheet' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Download template' })).toBeVisible()
    await expect(page.getByRole('table', { name: 'Average monthly value table' })).toHaveCount(0)
  })

  test('keeps the search shell within a mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await gotoSyntheticRoute(page, '/provincial/application', {
      waitUntil: 'domcontentloaded',
    })

    const sideNav = page.getByRole('navigation', { name: 'Side navigation' })
    const openNavigation = page.getByRole('button', { name: 'Open menu' })

    await expect(openNavigation).toBeVisible()
    await expect(openNavigation).toHaveAttribute('aria-expanded', 'false')
    await expect(sideNav).toBeVisible()
    await expect(sideNav).toHaveCSS('width', '48px')
    await expect(sideNav).not.toHaveAttribute('aria-hidden')
    const provincialApplicationSearchLink = page.locator(
      'a.csp-side-nav__link[data-label="Application search"][href="/provincial/application"]',
    )
    await expect(provincialApplicationSearchLink).toBeVisible()

    await expect(
      page.getByRole('heading', { level: 1, name: 'Provincial application search' }),
    ).toBeVisible()
    await submitApplicationSearch(page)
    await expect(page.locator('.lexis-status-tag')).toHaveCount(2)
    await expect(page.getByRole('region', { name: 'Search results table' })).toHaveAttribute(
      'tabindex',
      '0',
    )
    const mobileResultsBounds = await page
      .getByRole('region', { name: 'Search results table' })
      .evaluate((results) => {
        const main = document.querySelector('main.app-main')
        if (!(main instanceof HTMLElement)) throw new Error('Application content not found')

        const resultsBounds = results.getBoundingClientRect()
        const mainBounds = main.getBoundingClientRect()
        return {
          resultsLeft: resultsBounds.left,
          resultsRight: resultsBounds.right,
          mainLeft: mainBounds.left,
          mainRight: mainBounds.right,
        }
      })
    expect(
      Math.abs(mobileResultsBounds.resultsLeft - mobileResultsBounds.mainLeft),
    ).toBeLessThanOrEqual(1)
    expect(
      Math.abs(mobileResultsBounds.resultsRight - mobileResultsBounds.mainRight),
    ).toBeLessThanOrEqual(1)

    await openNavigation.click()

    await expect(page.getByRole('button', { name: 'Close menu' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    await expect(sideNav).toBeVisible()
    await expect(sideNav).toHaveCSS('width', '256px')
    await expect(sideNav).not.toHaveAttribute('aria-hidden')
    await expect(provincialApplicationSearchLink).toHaveAttribute('aria-current', 'page')

    await page.getByRole('button', { name: 'Close menu' }).click()

    await expect(page.getByRole('button', { name: 'Open menu' })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
    await expect(sideNav).toBeVisible()
    await expect(sideNav).toHaveCSS('width', '48px')

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

  test('keeps result toolbar actions within a narrow mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 })

    for (const route of ['/provincial/application', '/federal']) {
      await gotoSyntheticRoute(page, route, { waitUntil: 'domcontentloaded' })
      const searchButton = page.getByRole('button', { name: 'Search', exact: true })
      await expect(searchButton).toBeEnabled()
      await searchButton.click()
      const exemptionAction = page.getByRole('button', {
        name: 'Create exemption for selected applications',
      })
      await expect(exemptionAction).toBeVisible()
      expect(
        await exemptionAction.evaluate((action) =>
          Boolean(action.closest('.legacy-search-table-toolbar__actions')),
        ),
      ).toBe(true)

      const bounds = await exemptionAction.evaluate((button) => {
        const rect = button.getBoundingClientRect()
        return { left: rect.left, right: rect.right, scrollWidth: button.scrollWidth }
      })

      expect(bounds.left).toBeGreaterThanOrEqual(0)
      expect(bounds.right).toBeLessThanOrEqual(320)
      expect(bounds.scrollWidth).toBeLessThanOrEqual(Math.ceil(bounds.right - bounds.left))
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
        ),
      ).toBe(false)
    }
  })

  test('uses FSPTS object-page chrome without mobile overflow', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await gotoSyntheticRoute(page, '/provincial/offers/81001', {
      waitUntil: 'domcontentloaded',
    })

    await expect(page.getByRole('heading', { level: 1, name: 'Offer 81001' })).toBeVisible({
      timeout: 30_000,
    })
    await expect(page.getByText('Check and manage this provincial offer')).toBeVisible()
    const backLink = page.getByRole('link', { name: 'Back to Provincial offers search' })
    await expect(backLink).toHaveAttribute('href', '/provincial/offers')
    await expect(backLink.locator('svg')).toBeVisible()
    await expect(backLink).toHaveCSS('column-gap', '4px')
    await expect(backLink).toHaveCSS('padding-top', '4px')
    await expect(backLink).toHaveCSS('text-decoration-line', 'none')
    await backLink.hover()
    await expect(backLink).toHaveCSS('text-decoration-line', 'underline')
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
    await expect(page.locator('.detail-page-grid')).toHaveCSS('row-gap', '40px')
    await expect(page.locator('.detail-page-header .lexis-page-header')).toHaveCSS(
      'row-gap',
      '12px',
    )
    const editOfferButton = page.getByRole('button', { name: 'Edit', exact: true })
    await expect(editOfferButton).toHaveClass(/cds--btn--tertiary/)
    await expect(editOfferButton).toHaveCSS('height', '32px')

    await expect(page.getByLabel('Offer highlights')).toHaveCount(0)

    const detailHeaderLayout = await page.evaluate(() => {
      const main = document.querySelector('main.app-main')
      const breadcrumb = document.querySelector('.back-link')
      const pageHeader = document.querySelector('.lexis-page-header')
      if (!(main instanceof HTMLElement)) throw new Error('Application content not found')
      if (!(breadcrumb instanceof HTMLElement)) throw new Error('Detail breadcrumb not found')
      if (!(pageHeader instanceof HTMLElement)) throw new Error('Detail page header not found')

      const mainBounds = main.getBoundingClientRect()
      const breadcrumbBounds = breadcrumb.getBoundingClientRect()
      const pageHeaderBounds = pageHeader.getBoundingClientRect()
      return {
        breadcrumbInset: breadcrumbBounds.left - mainBounds.left,
        breadcrumbGap: pageHeaderBounds.top - breadcrumbBounds.bottom,
      }
    })

    expect(detailHeaderLayout.breadcrumbInset).toBe(44)
    expect(detailHeaderLayout.breadcrumbGap).toBe(40)

    await page.setViewportSize({ width: 390, height: 844 })
    await expect(page.getByRole('heading', { level: 1, name: 'Offer 81001' })).toBeVisible()

    const hasHorizontalPageOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )
    expect(hasHorizontalPageOverflow).toBe(false)
  })

  test('centers initial detail loading and places toasts like FSPTS', async ({ page }) => {
    await page.route('**/api/lexis/purchase-offers/81001', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 750))
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Synthetic detail failure' }),
      })
    })

    await page.setViewportSize({ width: 1440, height: 900 })
    await gotoSyntheticRoute(page, '/provincial/offers/81001', {
      waitUntil: 'domcontentloaded',
    })

    const initialLoader = page.locator('.detail-page-loading')
    await expect(initialLoader).toBeVisible()
    await expect(initialLoader.locator('.cds--loading')).toBeVisible()
    await expect(initialLoader).toHaveCSS('justify-content', 'center')
    await expect(initialLoader).toHaveCSS('padding-top', '64px')

    await expect(page.getByText('Detail unavailable')).toBeVisible()
    const inlineError = page.locator('.detail-page-inline-error')
    const notificationRegion = page.locator('.app-notification-region')
    const toast = notificationRegion.locator('.app-notification__toast')
    await expect(inlineError).toHaveText('Unable to retrieve provincial offer detail.')
    await expect(inlineError).toHaveCSS('padding', '16px 24px')
    await expect(inlineError).toHaveCSS('font-size', '16px')
    await expect(notificationRegion).toHaveCSS('width', '288px')
    await expect(notificationRegion).toHaveCSS('top', '16px')
    await expect(notificationRegion).toHaveCSS('right', '16px')
    await expect(notificationRegion).toHaveCSS('z-index', '12000')
    await expect(notificationRegion).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
    await expect(toast).toHaveCSS('animation-name', 'app-notification-slide-in-right')
    await expect(toast).toHaveCSS('animation-duration', '0.3s')
    await expect(toast).toHaveCSS('opacity', '1')

    await toast.getByRole('button', { name: 'close notification' }).click()
    await expect(page.locator('.app-notification')).toHaveClass(/app-notification--exiting/)
    await expect(toast).toHaveCSS('animation-name', 'app-notification-slide-out-right')
    await expect(toast).toHaveCSS('opacity', '1')
    await expect(toast).toBeHidden()
    await expect(inlineError).toBeVisible()
  })

  test('bounds detail field cards to one, two, and three columns', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await gotoSyntheticRoute(page, '/federal/application/888', {
      waitUntil: 'domcontentloaded',
    })

    const ownerFields = page
      .getByRole('heading', { level: 2, name: 'Owner' })
      .locator('..')
      .locator('..')
      .locator('.detail-field-grid')
    await expect(ownerFields).toBeVisible()
    await expect(page.locator('.application-detail-tab-list')).toHaveCSS('height', '48px')
    await expect(page.locator('.application-detail-tab-list [role="tab"]').first()).toHaveCSS(
      'height',
      '48px',
    )
    await expect(page.locator('.application-detail-tab-panel .cds--tile').first()).toHaveCSS(
      'padding-top',
      '20px',
    )

    const detailCanvas = await page.evaluate(() => {
      const main = document.querySelector('main.app-main')
      const tabList = document.querySelector('.application-detail-tab-list')
      const panel = document.querySelector('.application-detail-tab-panel')
      const tile = panel?.querySelector('.cds--tile')
      if (!(main instanceof HTMLElement)) throw new Error('Application content not found')
      if (!(tabList instanceof HTMLElement)) throw new Error('Detail tab list not found')
      if (!(panel instanceof HTMLElement)) throw new Error('Detail tab panel not found')
      if (!(tile instanceof HTMLElement)) throw new Error('Detail card not found')

      const mainBounds = main.getBoundingClientRect()
      const tabListBounds = tabList.getBoundingClientRect()
      const panelBounds = panel.getBoundingClientRect()
      const tileBounds = tile.getBoundingClientRect()
      return {
        mainLeft: mainBounds.left,
        mainRight: mainBounds.right,
        panelLeft: panelBounds.left,
        panelRight: panelBounds.right,
        tabListLeft: tabListBounds.left,
        tabListRight: tabListBounds.right,
        tabListParentRight: tabList.parentElement?.getBoundingClientRect().right,
        tileLeft: tileBounds.left,
      }
    })
    expect(Math.abs(detailCanvas.panelLeft - detailCanvas.mainLeft)).toBeLessThanOrEqual(1)
    expect(Math.abs(detailCanvas.panelRight - detailCanvas.mainRight)).toBeLessThanOrEqual(1)
    expect(Math.abs(detailCanvas.tileLeft - detailCanvas.tabListLeft)).toBeLessThanOrEqual(1)
    expect(
      Math.abs(detailCanvas.tabListRight - (detailCanvas.tabListParentRight ?? 0)),
    ).toBeLessThanOrEqual(1)
    await expect(page.locator('.detail-section-card').first()).toHaveCSS(
      'background-color',
      'rgb(255, 255, 255)',
    )
    await expect(page.locator('.detail-section-card').first()).toHaveCSS('box-shadow', 'none')
    await expect(page.locator('.detail-section-card').first()).toHaveCSS('border-top-width', '1px')

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

    await ownerFields.evaluate((grid) => {
      const card = grid.closest('.detail-section-card')
      if (!(card instanceof HTMLElement)) throw new Error('Owner detail card not found')
      card.classList.remove('detail-section-card')
      card.classList.add('application-detail-clients')
    })
    await page.setViewportSize({ width: 1440, height: 900 })
    expect(await columnCount()).toBe(3)
    await page.setViewportSize({ width: 768, height: 900 })
    expect(await columnCount()).toBe(2)
    await page.setViewportSize({ width: 390, height: 844 })
    expect(await columnCount()).toBe(1)

    await page.getByRole('tab', { name: 'Items' }).click()
    const packageTable = page.getByRole('region', { name: 'Federal application packages' })
    await expect(packageTable).not.toHaveAttribute('tabindex')
    await expect(packageTable.locator('tbody td').first()).toHaveCSS('font-size', '14px')
    expect(
      await packageTable.locator(':scope > .cds--data-table-content').evaluate((content) => {
        return getComputedStyle(content).overflowX
      }),
    ).toBe('visible')

    await page.getByRole('tab', { name: 'Remarks' }).click()
    const emptyState = page.getByRole('region', { name: 'No remarks found' })
    await expect(emptyState).toHaveCSS('min-height', '320px')
    await expect(emptyState.locator('.lexis-empty-state__default-pictogram')).toHaveCSS(
      'width',
      '48px',
    )
  })

  test('left-aligns table row actions with their actions heading', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await gotoSyntheticRoute(page, '/federal/application/888', {
      waitUntil: 'domcontentloaded',
    })
    await page.getByRole('tab', { name: 'Documents' }).click()

    const documentsTable = page.getByRole('region', { name: 'Federal application documents' })
    const rowActions = documentsTable.locator('.legacy-search-actions')

    await expect(documentsTable).toBeVisible()
    await expect(rowActions).toHaveCSS('justify-content', 'flex-start')
  })

  test('gives long create forms FSPTS section rhythm without mobile overflow', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await gotoSyntheticRoute(page, '/provincial/offers/create', {
      waitUntil: 'domcontentloaded',
    })

    await expect(
      page.getByRole('heading', { level: 1, name: 'Create provincial offer' }),
    ).toBeVisible()
    const formCard = page.locator('.provincial-offer-create.create-form-tile')
    const sections = formCard.locator('.create-form-section')
    await expect(formCard).toBeVisible()
    await expect(sections).toHaveCount(5)
    await expect(sections.nth(1)).toHaveCSS('border-top-width', '1px')
    await expect(sections.first()).toHaveCSS('border-color', 'rgb(198, 198, 198)')
    const firstSectionTitleInset = await sections.first().evaluate((section) => {
      const title = section.querySelector('legend')
      if (!(title instanceof HTMLElement)) throw new Error('Offer section title not found')
      return title.getBoundingClientRect().top - section.getBoundingClientRect().top
    })
    expect(firstSectionTitleInset).toBeGreaterThanOrEqual(16)
    await expect(page.getByRole('group', { name: 'Offer form actions' })).toBeVisible()

    await page.setViewportSize({ width: 390, height: 844 })
    await expect(sections.first()).toBeVisible()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      ),
    ).toBe(false)
  })

  test('styles an active report configuration without changing its route', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await gotoSyntheticRoute(page, '/reports/offerReport', {
      waitUntil: 'domcontentloaded',
    })

    await expect(page.getByRole('heading', { level: 1, name: 'Offer Report' })).toBeVisible()
    const reportPanel = page.getByRole('region', { name: 'Offer Report' })
    const reportFields = reportPanel.locator('.report-config-fields')
    const reportActions = page.getByRole('group', { name: 'Report actions' })
    await expect(reportPanel).toHaveCSS('border-top-width', '1px')
    await expect(reportPanel).toHaveCSS('border-radius', '4px')
    await expect(page.locator('.reports-page')).toHaveCSS('row-gap', '40px')
    await expect(reportActions).toBeVisible()
    await expect(reportActions.getByRole('button', { name: 'Clear all' })).toHaveCSS(
      'height',
      '40px',
    )
    await expect(reportActions.getByRole('button', { name: 'Generate report' })).toHaveCSS(
      'height',
      '40px',
    )
    await expect(page.getByLabel('Application from date')).toHaveAttribute(
      'placeholder',
      'YYYY-MM-DD',
    )
    expect(
      await reportFields.evaluate(
        (grid) => getComputedStyle(grid).gridTemplateColumns.split(' ').length,
      ),
    ).toBe(3)
    expect(new URL(page.url()).pathname).toBe('/reports/offerReport')

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

  test('contains the provincial workflow table on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await gotoSyntheticRoute(page, '/provincial', { waitUntil: 'domcontentloaded' })

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
    await gotoSyntheticRoute(page, '/admin/schedules', { waitUntil: 'domcontentloaded' })

    await expect(
      page.getByRole('heading', { level: 1, name: 'Export schedule administration' }),
    ).toBeVisible()
    await expect(page.locator('.admin-policy-editor-tile')).toBeVisible()
    await expect(page.getByText('1 result found')).toBeVisible()
    const resultsRegion = page.getByRole('region', { name: 'Search results table' })
    await expect(resultsRegion.getByText('1001')).toBeVisible()
    await expect(resultsRegion.getByRole('table')).toHaveClass(/cds--data-table--md/)
    await expect(resultsRegion.getByLabel('Items per page:')).toBeVisible()
    const scheduleDeleteButton = resultsRegion.getByRole('button', { name: 'Delete' })
    await expect(scheduleDeleteButton).toHaveClass(/cds--btn--danger--ghost/)
    await scheduleDeleteButton.click()
    const scheduleDeleteDialog = page.getByRole('dialog', { name: 'Delete export schedule?' })
    await expect(scheduleDeleteDialog).toContainText(
      'This permanently deletes export schedule 1001 with advertising date 2026-07-15.',
    )
    await scheduleDeleteDialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(scheduleDeleteDialog).toBeHidden()
    const desktopResultsBounds = await resultsRegion.evaluate((region) => {
      const main = document.querySelector('main.app-main')
      if (!(main instanceof HTMLElement)) throw new Error('Application content not found')
      const regionBounds = region.getBoundingClientRect()
      const mainBounds = main.getBoundingClientRect()
      return {
        regionLeft: regionBounds.left,
        regionRight: regionBounds.right,
        mainLeft: mainBounds.left,
        mainRight: mainBounds.right,
      }
    })
    expect(
      Math.abs(desktopResultsBounds.regionLeft - desktopResultsBounds.mainLeft),
    ).toBeLessThanOrEqual(1)
    expect(
      Math.abs(desktopResultsBounds.regionRight - desktopResultsBounds.mainRight),
    ).toBeLessThanOrEqual(1)

    await page.setViewportSize({ width: 390, height: 844 })
    const overflow = await resultsRegion.evaluate((region) => ({
      clientWidth: region.clientWidth,
      scrollWidth: region.scrollWidth,
      headerHeight: region.querySelector('thead tr')?.getBoundingClientRect().height,
    }))
    expect(overflow.scrollWidth).toBeGreaterThan(overflow.clientWidth)
    expect(overflow.headerHeight).toBeLessThanOrEqual(80)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      ),
    ).toBe(false)
  })

  test('places policy add actions in result toolbars and uses focused add dialogs', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await gotoSyntheticRoute(page, '/admin/policies/fee', {
      waitUntil: 'domcontentloaded',
    })

    await expect(
      page.getByRole('heading', { level: 1, name: 'Multiplication Factor' }),
    ).toBeVisible()
    const feePolicyTable = page
      .getByRole('region', { name: 'Search results table' })
      .getByRole('table')
    await expect(
      feePolicyTable.getByRole('columnheader', { name: 'Fee increase %', exact: true }),
    ).toBeVisible()
    await expect(
      feePolicyTable.getByRole('columnheader', { name: 'Entry user', exact: true }),
    ).toBeVisible()
    const feeAddButton = page.getByRole('button', { name: 'Add fee policy' })
    await expect(feeAddButton).toBeEnabled()
    await expect(feeAddButton).toHaveCSS('height', '40px')
    const feeLayout = await page.locator('.admin-policy-workspace').evaluate((workspace) => {
      const toolbar = workspace.querySelector('.legacy-search-table-toolbar')
      const button = workspace.querySelector('.legacy-search-table-toolbar__actions .cds--btn')
      const tableFrame = workspace.querySelector('.legacy-search-table-frame')
      const tableContent = workspace.querySelector('.legacy-search-table-content')
      if (
        !(toolbar instanceof HTMLElement) ||
        !(button instanceof HTMLElement) ||
        !(tableFrame instanceof HTMLElement) ||
        !(tableContent instanceof HTMLElement)
      ) {
        throw new Error('Fee policy add action or results table not found')
      }

      const toolbarRect = toolbar.getBoundingClientRect()
      const buttonRect = button.getBoundingClientRect()
      const tableRect = tableFrame.getBoundingClientRect()
      const tableContentRect = tableContent.getBoundingClientRect()
      return {
        buttonTop: buttonRect.top,
        buttonBottom: buttonRect.bottom,
        buttonRight: buttonRect.right,
        toolbarTop: toolbarRect.top,
        toolbarBottom: toolbarRect.bottom,
        tableRight: tableRect.right,
        tableContentTop: tableContentRect.top,
      }
    })
    expect(feeLayout.buttonTop).toBeGreaterThanOrEqual(feeLayout.toolbarTop)
    expect(feeLayout.buttonBottom).toBeLessThanOrEqual(feeLayout.toolbarBottom)
    expect(feeLayout.toolbarBottom).toBeLessThanOrEqual(feeLayout.tableContentTop)
    expect(Math.abs(feeLayout.tableRight - feeLayout.buttonRight - 16)).toBeLessThanOrEqual(1)

    await feeAddButton.click()
    const feeDialog = page.getByRole('dialog', { name: 'Add fee policy' })
    await expect(feeDialog).toBeVisible()
    await expect(
      feeDialog.getByText(
        'Set the fee increase for one region from a given effective date onward.',
      ),
    ).toBeVisible()
    await expect(feeDialog.getByLabel('Policy effective date')).toBeVisible()
    await expect(feeDialog.getByLabel('Policy effective date')).toBeFocused()
    await expect(feeDialog.getByLabel('Region')).toBeVisible()
    await expect(feeDialog.getByLabel('Fee increase percentage')).toBeVisible()
    await expect(feeDialog.getByText('Whole numbers from 0 to 100')).toBeVisible()
    const feeDialogCancel = feeDialog.getByRole('button', { name: 'Cancel' })
    await expect(feeDialogCancel).toHaveClass(/cds--btn--tertiary/)
    await expect(feeDialog.locator('.admin-policy-modal__actions')).toHaveCSS('gap', '8px')
    await feeDialogCancel.click()
    await expect(feeDialog).toBeHidden()

    await page.setViewportSize({ width: 390, height: 844 })
    await gotoSyntheticRoute(page, '/admin/policies/fil', {
      waitUntil: 'domcontentloaded',
    })
    await expect(
      page.getByRole('heading', { level: 1, name: 'Non-appraised Sec.3 FIL%' }),
    ).toBeVisible()
    const filAddButton = page.getByRole('button', { name: 'Add fee in lieu policy' })
    await expect(filAddButton).toBeEnabled()
    await expect(filAddButton).toHaveCSS('height', '40px')
    await filAddButton.click()
    const filDialog = page.getByRole('dialog', { name: 'Add fee in lieu policy' })
    await expect(filDialog).toBeVisible()
    await expect(filDialog.getByLabel('Policy effective date')).toBeVisible()
    await expect(filDialog.getByLabel('Policy effective date')).toBeFocused()
    await expect(filDialog.getByLabel('Fee in lieu percentage')).toBeVisible()
    await expect(filDialog.getByText('Whole numbers from 1 to 99')).toBeVisible()

    const mobileDialog = await filDialog.evaluate((dialog) => {
      const fields = dialog.querySelector('.admin-policy-modal__fields')
      if (!(fields instanceof HTMLElement)) {
        throw new Error('Fee in lieu fields not found')
      }
      return {
        dialogClientWidth: dialog.clientWidth,
        dialogScrollWidth: dialog.scrollWidth,
        gridColumns: getComputedStyle(fields).gridTemplateColumns,
      }
    })
    expect(mobileDialog.dialogScrollWidth).toBeLessThanOrEqual(mobileDialog.dialogClientWidth)
    expect(mobileDialog.gridColumns.split(' ')).toHaveLength(1)
  })

  test('uses the FSPTS review-card layout for validated application submissions', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await gotoSyntheticRoute(page, '/provincial/application/upload', {
      waitUntil: 'domcontentloaded',
    })

    await expect(
      page.getByRole('heading', { level: 1, name: 'Upload application submission' }),
    ).toBeVisible()
    await expect(
      page.getByText('Upload an XML, ZIP, GeoJSON, or JSON file to create a LEXIS application.'),
    ).toBeVisible()
    await expect(page.locator('.admin-upload-fspts-page')).toHaveCSS('row-gap', '0px')
    const uploadPanel = page.locator('.admin-upload-panel').first()
    await expect(uploadPanel.getByText('Submission file', { exact: true })).toBeVisible()
    await expect(
      uploadPanel.getByText(
        'Accepted formats: XML, ZIP, GeoJSON, or JSON. Maximum file size: 20 MiB.',
        { exact: true },
      ),
    ).toBeVisible()
    await expect(uploadPanel.locator('.admin-upload-panel__header')).toHaveCount(0)
    await expect(uploadPanel.locator('.admin-upload-settings-grid')).toBeHidden()
    await expect(uploadPanel.locator('.admin-upload-summary-strip')).toHaveCount(0)
    await expect(uploadPanel.locator('.admin-upload-drop-zone-field')).toHaveCSS(
      'margin-top',
      '0px',
    )
    await expect(page.locator('.admin-upload-fspts-button-row--upload-step')).toHaveCSS(
      'margin-top',
      '16px',
    )

    const reviewButton = page.getByRole('button', { name: 'Review' })
    await expect(reviewButton).toBeEnabled()
    await reviewButton.click()
    const uploadError = uploadPanel.locator('.admin-upload-file-error')
    await expect(uploadError).toContainText('Please upload a file before continuing.')
    await expect(uploadError.locator('svg')).toHaveCount(1)
    await expect(uploadError).toHaveCSS('display', 'flex')
    await expect(uploadError).toHaveCSS('font-size', '12px')
    await expect(uploadError).toHaveCSS('line-height', '18px')
    await expect(uploadError).toHaveCSS('gap', '4px')
    await expect(uploadError).toHaveCSS('margin-top', '6px')

    await page.getByLabel('Application submission file').setInputFiles({
      name: 'valid-submission.xml',
      mimeType: 'application/xml',
      buffer: Buffer.from('<LexisSubmission />', 'utf8'),
    })

    await expect(page.locator('.admin-upload-panel')).toHaveCount(1)
    await expect(uploadPanel.locator('.admin-upload-application-validation-content')).toBeVisible()
    await expect(uploadPanel.getByLabel('Selected submission files')).toBeVisible()
    await expect(uploadPanel.locator('.admin-upload-file-chip')).toHaveCount(1)
    await expect(uploadPanel.locator('.admin-upload-queue__table--submission')).toHaveCount(0)
    await expect(uploadPanel.getByRole('heading', { name: 'Submission validated' })).toBeVisible()
    await expect(uploadPanel.getByRole('button', { name: 'Review' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Submission validated' })).toBeVisible()
    await page.getByRole('button', { name: 'Review' }).click()

    await expect(page.getByRole('heading', { level: 2, name: 'Review' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Submission validated' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Submission review' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Submission metadata' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Application details' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Package details' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Product details' })).toBeVisible()
    await expect(page.getByRole('table', { name: 'Application details review' })).toContainText(
      'UI Test Contact',
    )
    await expect(page.getByRole('table', { name: 'Product details review' })).toContainText(
      'HE, FI',
    )

    const reviewPanel = page.locator('.admin-upload-panel--submission-review')
    await expect(reviewPanel).toHaveCSS('border-top-width', '0px')
    await expect(reviewPanel).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
    await expect(page.locator('.admin-upload-submission-review__section')).toHaveCount(4)
    await expect(page.locator('.admin-upload-submission-review__section').first()).toHaveCSS(
      'border-radius',
      '8px',
    )

    const actionGap = await page
      .locator('.admin-upload-panel--submission-review .admin-upload-preview-footer-actions')
      .evaluate((actions) => {
        const buttons = actions.querySelectorAll('button')
        if (buttons.length !== 2) throw new Error('Review actions not found')
        return buttons[1].getBoundingClientRect().left - buttons[0].getBoundingClientRect().right
      })
    expect(actionGap).toBe(8)

    await page.setViewportSize({ width: 390, height: 844 })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      ),
    ).toBe(false)
  })

  test('presents application-submission validation failures as FSPTS issues', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await gotoSyntheticRoute(page, '/provincial/application/upload', {
      waitUntil: 'domcontentloaded',
    })

    await page.getByLabel('Application submission file').setInputFiles({
      name: 'invalid-submission.xml',
      mimeType: 'application/xml',
      buffer: Buffer.from('<InvalidLexisSubmission />', 'utf8'),
    })

    await expect(
      page.getByRole('heading', { name: '1 issue found in application submission' }),
    ).toBeVisible()
    const issuesTable = page.getByRole('table', { name: 'Validation issues' })
    await expect(issuesTable.getByRole('columnheader', { name: 'Issue' })).toBeVisible()
    await expect(issuesTable.getByRole('columnheader', { name: 'Submission file' })).toBeVisible()
    await expect(issuesTable.getByRole('columnheader', { name: 'Detail' })).toBeVisible()
    await expect(issuesTable).toContainText('invalid-submission.xml')
    await expect(issuesTable).toContainText('Synthetic package number is required.')
    await expect(page.getByRole('link', { name: 'Download issues as CSV' })).toHaveAttribute(
      'download',
      'lexis-validation-issues.csv',
    )
    await expect(page.getByRole('button', { name: 'Review' })).toBeDisabled()
    await expect(page.getByText('Upload error')).toHaveCount(0)
  })

  test('keeps FSPTS upload surfaces coherent in dark mode', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await gotoSyntheticRoute(page, '/admin/uploads', { waitUntil: 'domcontentloaded' })

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
