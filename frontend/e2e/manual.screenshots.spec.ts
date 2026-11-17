import path from 'node:path'
import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from '@playwright/test'
import { E2E_BASE_URL, gotoSyntheticRoute, installSyntheticOidcSession } from './utils'
import {
  ADVERTISED_APPLICATION,
  BLANKET_OIC_EXEMPTION,
  MAIN_EXEMPTION,
  MAIN_OFFER,
  MAIN_PERMIT,
  NEW_APPLICATION,
  OWN_CLIENT,
  UPLOAD_FILE_NAME,
  resolveManualApi,
  type ManualScenario,
} from './utils/manual-fixtures'
import { createSampleDetailSwap } from './utils/manual-sample-details'
import { gotoWithRecovery } from './utils/navigation'
import {
  getWithAuth,
  hasIdirCredentials,
  isSafeCredentialedRegressionBaseUrl,
  loginWithIdir,
} from './utils/regression-auth'

// Industry edition: a synthetic session with sample data. Add a SHOTS entry and its fixture data.
// Ministry edition: a signed-in IDIR session on E2E_BASE_URL, read-only, with sample personal details.

type Edition = 'industry' | 'ministry'

type Frame = {
  edition: Edition
  /** Image name without extension; the two-digit prefix is the chapter. */
  file: string
  /** Screenshot one viewport scrolled to this element instead of the top of the page. */
  focus?: (page: Page) => Locator
  /** Tallest capture from the top of the page, in CSS pixels. */
  maxHeight?: number
}

type Shot = Frame & {
  /** 'loggedOut' installs no session. */
  scenario: ManualScenario | 'loggedOut'
  route: string
  /** Visible once the screen has its data. */
  ready: (page: Page) => Locator
  /** Clicks, typing and tab changes after the screen is ready. */
  steps?: (page: Page) => Promise<void>
  /** Device scale factor; photo-heavy screens use 1 to keep the image small. */
  scale?: number
}

const VIEWPORT = { width: 1440, height: 900 }
// Every screen shows the same "today", so dates in the images never drift.
const FIXED_NOW = new Date('2026-11-25T18:00:00Z')
const OUT_DIR = path.join(import.meta.dirname, '..', '..', 'docs', 'manual')
const HEADER_OFFSET_PX = 96
const SETTLE_TIMEOUT_MS = 20_000
const LOADING_TEXT =
  /^(Loading|Checking|Searching|Validating|Refreshing|Counting|Calculating)\b.*…$/

const heading = (page: Page, name: string) => page.getByRole('heading', { level: 1, name })
const pageTitle = (page: Page) => page.getByRole('heading', { level: 1 }).first()
const tab = (page: Page, name: string) => page.getByRole('tab', { name, exact: true })
// First match: a few actions repeat in an empty state and a card header.
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true }).first()

const openTab = async (page: Page, name: string, readyText: string | RegExp) => {
  await tab(page, name).click()
  await expect(page.getByText(readyText).first()).toBeVisible()
}

const openProfilePanel = async (page: Page) => {
  await button(page, 'Open profile panel').click()
  await expect(page.locator('#profile-panel.is-open')).toBeVisible()
}

const runSearch = async (page: Page, resultText: string) => {
  await button(page, 'Search').click()
  await expect(page.getByText(resultText, { exact: true }).first()).toBeVisible()
}

const selectTab = async (page: Page, name: string) => {
  await tab(page, name).click()
  await expect(tab(page, name)).toHaveAttribute('aria-selected', 'true')
}

const tick = async (checkbox: Locator) => {
  // Carbon hides the input behind its styled label, so click the input itself.
  await checkbox.dispatchEvent('click')
  await expect(checkbox).toBeChecked()
}

const searchFinished = (page: Page) =>
  page
    .locator('[aria-label="Search results table"][aria-busy="false"]')
    .or(page.getByRole('heading', { name: 'No results found', exact: true }))
    .first()

const loginShot = (edition: Edition): Shot => ({
  edition,
  file: '01-login',
  scenario: 'loggedOut',
  route: '/',
  ready: (page) => button(page, 'Log in with Business BCeID'),
  scale: 1,
})

const SHOTS: Shot[] = [
  // Industry edition
  loginShot('industry'),
  {
    edition: 'industry',
    file: '01-select-organization',
    scenario: 'industryChooseOrganization',
    route: '/',
    ready: (page) => page.getByText('Forest client 00067890').first(),
    scale: 1,
  },
  {
    edition: 'industry',
    file: '01-summary',
    scenario: 'industrySubmitter',
    route: '/provincial/summary',
    ready: (page) => page.getByText('Example Forestry Ltd.').first(),
  },
  {
    edition: 'industry',
    file: '01-profile',
    scenario: 'industrySubmitter',
    route: '/provincial/summary',
    ready: (page) => page.getByText('Example Forestry Ltd.').first(),
    steps: openProfilePanel,
  },
  {
    edition: 'industry',
    file: '01-application-search',
    scenario: 'industrySubmitter',
    route: '/provincial/application',
    ready: (page) => button(page, 'Search'),
    steps: (page) => runSearch(page, '48106'),
    maxHeight: 1000,
  },
  {
    edition: 'industry',
    file: '02-create-application',
    scenario: 'industrySubmitter',
    route:
      '/provincial/application/create?ownerContactName=Jordan%20Sample&region=1909&productTypeCode=H&exemptionReason=S',
    ready: (page) => page.getByText('jordan.sample@example.com').first(),
  },
  {
    edition: 'industry',
    file: '02-create-application-details',
    scenario: 'industrySubmitter',
    route:
      '/provincial/application/create?ownerContactName=Jordan%20Sample&region=1909&productTypeCode=H&exemptionReason=S',
    ready: (page) => page.getByText('jordan.sample@example.com').first(),
    steps: async (page) => {
      await openTab(page, 'Application', 'Dec 2, 2026')
      // A submitter's region starts blank, so pick one as a user would.
      const region = page.locator('#region')
      await region.click()
      await page.getByRole('option', { name: 'South Coast', exact: true }).click()
      await expect(region).toHaveValue('South Coast')
    },
  },
  {
    edition: 'industry',
    file: '02-upload-applications',
    scenario: 'industrySubmitter',
    route: '/provincial/application/upload',
    ready: (page) => heading(page, 'Upload applications'),
    steps: async (page) => {
      await page.locator('input[type="file"]').setInputFiles({
        name: UPLOAD_FILE_NAME,
        mimeType: 'text/xml',
        buffer: Buffer.from('<?xml version="1.0" encoding="UTF-8"?><application/>'),
      })
      await expect(page.getByText('1 file validated').first()).toBeVisible()
    },
  },
  {
    edition: 'industry',
    file: '02-application-scale',
    scenario: 'industrySubmitter',
    route: `/provincial/application/${NEW_APPLICATION}?tab=items`,
    ready: (page) => page.getByRole('cell', { name: '702.4' }),
    focus: (page) => button(page, 'Create package'),
  },
  {
    edition: 'industry',
    file: '03-create-offer',
    scenario: 'industrySubmitter',
    route: `/provincial/offers/create?${new URLSearchParams({
      applicationNumber: String(ADVERTISED_APPLICATION),
      contactName: 'Jordan Sample',
      offerVolume: '850.0',
      purchaseOfferAmount: '92.50',
      pickupLocation: 'Boom ground at Sample Inlet, Jervis Inlet',
      offerCondition: 'Logs to be towed by the buyer within 30 days of approval.',
    })}`,
    ready: (page) => page.getByText('HE/BA SAWLOG').first(),
  },
  {
    edition: 'industry',
    file: '03-offer-record',
    scenario: 'industrySubmitter',
    route: `/provincial/offers/${MAIN_OFFER}`,
    ready: (page) => page.getByText('Boom ground at Sample Inlet, Jervis Inlet').first(),
  },
  {
    edition: 'industry',
    file: '04-exemption',
    scenario: 'industrySubmitter',
    route: `/provincial/exemption/${MAIN_EXEMPTION}`,
    ready: (page) => page.getByText('jordan.sample@example.com').first(),
  },
  {
    edition: 'industry',
    file: '05-exemption-permits',
    scenario: 'industrySubmitter',
    route: `/provincial/exemption/${MAIN_EXEMPTION}`,
    ready: (page) => page.getByText('jordan.sample@example.com').first(),
    steps: async (page) => {
      await openTab(page, 'Permits', `${MAIN_PERMIT} (Pending)`)
      await expect(button(page, 'Apply for new permit')).toBeVisible()
    },
  },
  {
    edition: 'industry',
    file: '05-permit',
    scenario: 'industrySubmitter',
    route: `/provincial/permit/${MAIN_PERMIT}`,
    ready: (page) => heading(page, `Permit ${MAIN_PERMIT} (Pending)`),
  },
  {
    edition: 'industry',
    file: '05-permit-shipping',
    scenario: 'industrySubmitter',
    route: `/provincial/permit/${MAIN_PERMIT}`,
    ready: (page) => heading(page, `Permit ${MAIN_PERMIT} (Pending)`),
    steps: (page) => openTab(page, 'Shipping', 'MV Example Spirit'),
  },
  {
    edition: 'industry',
    file: '05-permit-fees',
    scenario: 'industrySubmitter',
    route: `/provincial/permit/${MAIN_PERMIT}`,
    ready: (page) => heading(page, `Permit ${MAIN_PERMIT} (Pending)`),
    steps: (page) => openTab(page, 'Fees', '$2,450.29'),
    focus: pageTitle,
  },
  {
    edition: 'industry',
    file: '05-boic-permit-create',
    scenario: 'industrySubmitter',
    route: `/provincial/exemption/${BLANKET_OIC_EXEMPTION}/permit/new`,
    ready: (page) => heading(page, 'Apply for new permit'),
    steps: async (page) => {
      await page.locator('#boic-permit-request-pieces').fill('380')
      await page.locator('#boic-permit-request-volume').fill('512.4')
    },
    focus: pageTitle,
  },
  {
    edition: 'industry',
    file: '06-federal-search',
    scenario: 'federalReadOnly',
    route: '/federal',
    ready: (page) => button(page, 'Search'),
    steps: (page) => runSearch(page, 'NX-26-0419'),
    maxHeight: 1000,
  },

  // The ministry edition's other screenshots come from the signed-in session below.
  loginShot('ministry'),
]

type CaptureIssues = string[]

const newShotPage = async (browser: Browser, shot: Shot, issues: CaptureIssues) => {
  const context = await browser.newContext({
    baseURL: E2E_BASE_URL,
    viewport: VIEWPORT,
    deviceScaleFactor: shot.scale ?? 1.5,
    colorScheme: 'light',
  })
  const page = await context.newPage()
  await page.clock.setFixedTime(FIXED_NOW)
  await page.addInitScript(
    ({ activeForestClient }) => {
      window.localStorage.setItem('lexis.ui.theme', 'white')
      window.localStorage.setItem('lexis.ui.sideNavCollapsed', 'false')
      if (activeForestClient) {
        window.sessionStorage.setItem('lexis.session.activeForestClientNumber', activeForestClient)
      }
    },
    { activeForestClient: shot.scenario === 'industrySubmitter' ? OWN_CLIENT : null },
  )

  if (shot.scenario !== 'loggedOut') {
    await installSyntheticOidcSession(page, {
      username: 'JSAMPLE',
      orgUnitNo: '',
      issuedAtSeconds: Math.floor(FIXED_NOW.getTime() / 1000),
      refreshToken: 'manual-refresh-token',
    })
  }

  const scenario = shot.scenario === 'loggedOut' ? 'industrySubmitter' : shot.scenario
  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (!url.pathname.startsWith('/api/')) return route.fallback()
    const resolved = resolveManualApi(
      scenario,
      request.method(),
      url.pathname,
      url.searchParams,
      request.postData(),
    )
    if (!resolved) {
      issues.push(
        `${shot.edition}/${shot.file}: no fixture for ${request.method()} ${url.pathname}`,
      )
      await route.fulfill({ status: 501, contentType: 'application/json', body: '{}' })
      return
    }
    await route.fulfill({
      status: resolved.status,
      contentType: 'application/json',
      headers: { date: FIXED_NOW.toUTCString(), 'X-Lexis-Record-Version': 'manual-1' },
      body: JSON.stringify(resolved.body),
    })
  })
  return page
}

/** Waits for skeletons, spinners and "Loading…" text to go, then for transitions to settle. */
const settle = async (page: Page, frame: Frame, issues: CaptureIssues) => {
  const busy = page
    .locator('.cds--skeleton, .cds--skeleton__text, .cds--data-table--skeleton, .cds--loading')
    .filter({ visible: true })
  const loadingText = page.getByText(LOADING_TEXT).filter({ visible: true })
  try {
    await expect(busy).toHaveCount(0, { timeout: SETTLE_TIMEOUT_MS })
    await expect(loadingText).toHaveCount(0, { timeout: SETTLE_TIMEOUT_MS })
  } catch {
    issues.push(`${frame.edition}/${frame.file}: still loading after ${SETTLE_TIMEOUT_MS / 1000}s`)
  }
  await page.waitForTimeout(500)
}

const snap = async (page: Page, frame: Frame, issues: CaptureIssues) => {
  await settle(page, frame, issues)
  // No focus ring or hover state in the image: park the pointer on the empty part of the header.
  await page.mouse.move(VIEWPORT.width / 2, 2)
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  const output = path.join(OUT_DIR, frame.edition, 'images', `${frame.file}.png`)
  if (frame.focus) {
    await frame.focus(page).evaluate((element, offset) => {
      window.scrollTo(0, element.getBoundingClientRect().top + window.scrollY - offset)
    }, HEADER_OFFSET_PX)
    await page.waitForTimeout(300)
    await page.screenshot({ path: output, animations: 'disabled' })
    return
  }
  await page.evaluate(() => window.scrollTo(0, 0))
  const height = await page.evaluate(() => document.documentElement.scrollHeight)
  await page.screenshot({
    path: output,
    fullPage: true,
    clip: { x: 0, y: 0, width: VIEWPORT.width, height: Math.min(height, frame.maxHeight ?? 900) },
    animations: 'disabled',
  })
}

const capture = async (browser: Browser, shot: Shot, issues: CaptureIssues) => {
  const page = await newShotPage(browser, shot, issues)
  try {
    await gotoSyntheticRoute(page, shot.route, { ready: shot.ready(page) })
    await expect(shot.ready(page)).toBeVisible()
    await settle(page, shot, issues)
    await shot.steps?.(page)
    await snap(page, shot, issues)
  } finally {
    await page.context().close()
  }
}

const chapters = new Map<string, Shot[]>()
for (const shot of SHOTS) {
  const key = `${shot.edition} ${shot.file.slice(0, 2)}`
  chapters.set(key, [...(chapters.get(key) ?? []), shot])
}

for (const [chapter, shots] of chapters) {
  test(`sample data: ${chapter}`, async ({ browser }) => {
    const issues: CaptureIssues = []
    for (const shot of shots) {
      await test.step(`${shot.edition}/${shot.file}`, () => capture(browser, shot, issues))
    }
    for (const issue of issues) {
      test.info().annotations.push({ type: 'manual screenshot gap', description: issue })
    }
    expect(issues, 'Every screenshot must load fully from fixtures').toEqual([])
  })
}

const READ_METHODS = ['GET', 'HEAD', 'OPTIONS']
const RECORDS_TO_TRY = 5
const SIGNED_IN_ACTION_TIMEOUT_MS = 10_000

/** Blocks every write, and swaps the personal details in what the API returns for sample ones. */
const allowReadsWithSampleDetails = async (page: Page) => {
  const swapSampleDetails = createSampleDetailSwap()
  await page.route(`${new URL(E2E_BASE_URL).origin}/api/**`, async (route) => {
    const request = route.request()
    if (!READ_METHODS.includes(request.method())) return route.abort()
    const response = await route.fetch()
    const body = await response.text()
    if (!body || !(response.headers()['content-type'] ?? '').includes('json')) {
      return route.fulfill({ response })
    }
    const headers = { ...response.headers() }
    delete headers['content-length']
    delete headers['content-encoding']
    await route.fulfill({
      status: response.status(),
      headers,
      body: JSON.stringify(swapSampleDetails(new URL(request.url()).pathname, JSON.parse(body))),
    })
  })
}

test.describe('signed in: ministry edition', () => {
  test.describe.configure({ retries: 0 })
  test.skip(
    !process.env.E2E_BASE_URL || !hasIdirCredentials(),
    'Set E2E_BASE_URL, E2E_IDIR_USER and E2E_IDIR_PASSWORD to capture the ministry edition.',
  )

  let context: BrowserContext | undefined
  let page: Page
  let issues: CaptureIssues = []

  const capture = (file: string, framing: Pick<Frame, 'focus' | 'maxHeight'> = {}) =>
    snap(page, { edition: 'ministry', file, ...framing }, issues)

  const notCaptured = (file: string, reason: string) => {
    const description = `ministry/${file}: ${reason}`
    test.info().annotations.push({ type: 'not captured', description })
    console.warn(`Not captured: ${description}`)
  }

  const open = async (route: string) => {
    await gotoWithRecovery(page, new URL(route, E2E_BASE_URL).toString(), {
      ready: pageTitle(page),
    })
    await expect(pageTitle(page)).toBeVisible({ timeout: 30_000 })
    // Never save the no-access page under a screen's name.
    await expect(pageTitle(page)).not.toHaveText(/^(Unauthorized|Page not found)$/)
    await settle(page, { edition: 'ministry', file: route }, issues)
  }

  const openSearch = async (route: string) => {
    await open(route)
    await expect(searchFinished(page)).toBeVisible({ timeout: 30_000 })
  }

  /** Record numbers from a search API, so no search form has to be filled in. */
  const findRecordNumbers = async (
    searchPath: string,
    numberField: string,
    criteria: Record<string, string> = {},
  ) => {
    const response = await getWithAuth(page, searchPath, {
      params: { page: '0', size: String(RECORDS_TO_TRY), ...criteria },
    })
    expect(response.status(), searchPath).toBe(200)
    const { results = [] } = (await response.json()) as { results?: Record<string, unknown>[] }
    return results.map((row) => String(row[numberField] ?? '')).filter(Boolean)
  }

  /** Opens each record until `prepare` succeeds on one; reports the screenshot as not captured otherwise. */
  const openFirstRecord = async (file: string, routes: string[], prepare: () => Promise<void>) => {
    let reason = 'the search found no record'
    for (const route of routes) {
      await open(route)
      try {
        await prepare()
        return true
      } catch (error) {
        reason = String(error).split('\n')[0]
      }
    }
    notCaptured(file, reason)
    return false
  }

  test.beforeAll(async ({ browser }) => {
    if (!isSafeCredentialedRegressionBaseUrl(E2E_BASE_URL)) {
      throw new Error(
        'Signed-in screenshots need E2E_BASE_URL to be localhost, DEV, TEST or a PR preview.',
      )
    }
    context = await browser.newContext({
      baseURL: E2E_BASE_URL,
      viewport: VIEWPORT,
      deviceScaleFactor: 1.5,
      colorScheme: 'light',
    })
    page = await context.newPage()
    page.setDefaultTimeout(SIGNED_IN_ACTION_TIMEOUT_MS)
    await page.addInitScript(() => {
      window.localStorage.setItem('lexis.ui.theme', 'white')
      window.localStorage.setItem('lexis.ui.sideNavCollapsed', 'false')
    })
    await allowReadsWithSampleDetails(page)
    // One sign-in for the run: a failure here stops it instead of retrying per chapter.
    await loginWithIdir(page)
  })

  test.afterAll(async () => {
    await context?.close()
  })

  test.beforeEach(() => {
    issues = []
  })

  test.afterEach(() => {
    expect(issues, 'Every screenshot must load fully').toEqual([])
  })

  test('ministry 01', async () => {
    await openSearch('/provincial/review')
    await capture('01-home')
    await openProfilePanel(page)
    await capture('01-profile')
  })

  test('ministry 02', async () => {
    await openSearch('/provincial/review')
    const rows = page.getByRole('checkbox', { name: /^Select application \d+$/ })
    if ((await rows.count()) >= 2) {
      // Selecting changes nothing until Approve is confirmed.
      await tick(rows.nth(0))
      await tick(rows.nth(1))
      await expect(page.getByText('2 applications selected').first()).toBeVisible()
      await capture('02-application-review')
    } else {
      notCaptured('02-application-review', 'fewer than two applications are waiting for review')
    }

    const applications = await findRecordNumbers(
      '/api/lexis/application-reviews/search',
      'applicationNumber',
    )
    const reviewOpen = await openFirstRecord(
      '02-application-review-tab',
      applications.map((number) => `/provincial/application/${number}`),
      async () => {
        await selectTab(page, 'Review')
        await button(page, 'Update status').click()
        await expect(page.getByRole('radio', { name: 'Approved' })).toBeVisible()
      },
    )
    if (reviewOpen) await capture('02-application-review-tab', { focus: pageTitle })
  })

  test('ministry 03', async () => {
    const approval = (target: Page) =>
      target.getByText('Offer withdrawals', { exact: true }).first()
    const offers = await findRecordNumbers('/api/lexis/purchase-offers/search', 'offerNumber')
    const offerOpen = await openFirstRecord(
      '03-offer-approval',
      offers.map((number) => `/provincial/offers/${number}`),
      async () => {
        await button(page, 'Edit offer').click()
        await expect(page.getByLabel('TEAC review date').first()).toBeVisible()
        await expect(approval(page)).toBeVisible()
      },
    )
    if (offerOpen) await capture('03-offer-approval', { focus: approval })
  })

  test('ministry 04', async () => {
    await open('/provincial/exemption/create')
    await expect(page.getByRole('radio', { name: 'Order in Council', exact: true })).toBeVisible()
    await capture('04-create-exemption')

    const newExemptions = await findRecordNumbers(
      '/api/lexis/exemptions/search',
      'exemptionNumber',
      {
        exemptionStatusCode: 'NEW',
      },
    )
    const approvalOpen = await openFirstRecord(
      '04-exemption-approve',
      newExemptions.map((number) => `/provincial/exemption/${encodeURIComponent(number)}`),
      async () => {
        await button(page, 'Approve exemption').click()
        await expect(
          page
            .getByRole('dialog')
            .getByText(/^Approve exemption/)
            .first(),
        ).toBeVisible()
      },
    )
    if (approvalOpen) await capture('04-exemption-approve')
  })

  test('ministry 05', async () => {
    const completedPermits = await findRecordNumbers('/api/lexis/permits/search', 'permitNumber', {
      permitStatus: 'COM',
    })
    const feesOpen = await openFirstRecord(
      '05-permit-fees',
      completedPermits.map((number) => `/provincial/permit/${number}`),
      async () => {
        await expect(tab(page, 'GBMS')).toBeVisible()
        await selectTab(page, 'Fees')
      },
    )
    if (!feesOpen) return
    await capture('05-permit-fees', { focus: pageTitle })
    await selectTab(page, 'GBMS')
    await capture('05-permit-invoices', { focus: pageTitle })
  })

  test('ministry 06', async () => {
    const federalApplications = await findRecordNumbers(
      '/api/lexis/federal/applications/search',
      'applicationNumber',
    )
    const applicationOpen = await openFirstRecord(
      '06-federal-application',
      federalApplications.map((number) => `/federal/application/${number}`),
      () => selectTab(page, 'Application'),
    )
    if (applicationOpen) await capture('06-federal-application', { focus: pageTitle })
  })

  test('ministry 07', async () => {
    await open('/reports/biweeklyListing')
    await button(page, 'Use current advertising period').click()
    await capture('07-advertising-list')
  })

  test('ministry 08', async () => {
    await open('/admin/policies/fee')
    await capture('08-multiplication-factor')

    await open('/admin/rtm/emslogamv/upload')
    await capture('08-average-market-values', { maxHeight: 1000 })

    await open('/notifications')
    await expect(button(page, 'New notification')).toBeVisible()
    await capture('08-notifications')
  })
})
