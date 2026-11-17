import path from 'node:path'
import { expect, test, type Browser, type Locator, type Page } from '@playwright/test'
import { E2E_BASE_URL, gotoSyntheticRoute, installSyntheticOidcSession } from './utils'
import {
  ADVERTISED_APPLICATION,
  BLANKET_OIC_EXEMPTION,
  COMPLETED_PERMIT,
  FEDERAL_APPLICATION,
  MAIN_EXEMPTION,
  MAIN_OFFER,
  MAIN_PERMIT,
  NEW_APPLICATION,
  NEW_EXEMPTION,
  OWN_CLIENT,
  UPLOAD_FILE_NAME,
  resolveManualApi,
  type ManualScenario,
} from './utils/manual-fixtures'

// Manual screenshots: add a SHOTS entry, plus fixture data for any API call it makes.

type Edition = 'industry' | 'ministry'

type Shot = {
  edition: Edition
  /** Image name without extension; the two-digit prefix is the chapter. */
  file: string
  /** 'loggedOut' installs no session. */
  scenario: ManualScenario | 'loggedOut'
  route: string
  /** Visible once the screen has its data. */
  ready: (page: Page) => Locator
  /** Clicks, typing and tab changes after the screen is ready. */
  steps?: (page: Page) => Promise<void>
  /** Screenshot one viewport scrolled to this element instead of the top of the page. */
  focus?: (page: Page) => Locator
  /** Tallest capture from the top of the page, in CSS pixels. */
  maxHeight?: number
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

const tickRow = async (page: Page, label: string) => {
  const checkbox = page.getByLabel(label, { exact: true })
  // Carbon hides the input behind its styled label, so click the input itself.
  await checkbox.dispatchEvent('click')
  await expect(checkbox).toBeChecked()
}

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
    maxHeight: 1200,
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
    maxHeight: 1250,
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
    maxHeight: 1500,
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
    maxHeight: 1600,
  },
  {
    edition: 'industry',
    file: '03-offer-record',
    scenario: 'industrySubmitter',
    route: `/provincial/offers/${MAIN_OFFER}`,
    ready: (page) => page.getByText('Boom ground at Sample Inlet, Jervis Inlet').first(),
    maxHeight: 1500,
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
    maxHeight: 1300,
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
    maxHeight: 1200,
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
    maxHeight: 1300,
  },
  {
    edition: 'industry',
    file: '06-federal-search',
    scenario: 'federalReadOnly',
    route: '/federal',
    ready: (page) => button(page, 'Search'),
    steps: (page) => runSearch(page, 'NX-26-0419'),
    maxHeight: 1250,
  },

  // Ministry edition
  loginShot('ministry'),
  {
    edition: 'ministry',
    file: '01-home',
    scenario: 'ministryAdmin',
    route: '/provincial/review',
    ready: (page) => page.getByRole('link', { name: '48111', exact: true }),
  },
  {
    edition: 'ministry',
    file: '01-profile',
    scenario: 'ministryAdmin',
    route: '/provincial/review',
    ready: (page) => page.getByRole('link', { name: '48111', exact: true }),
    steps: async (page) => {
      await openProfilePanel(page)
      await expect(button(page, 'Save preference')).toBeVisible()
    },
  },
  {
    edition: 'ministry',
    file: '02-application-review',
    scenario: 'ministryAdmin',
    route: '/provincial/review',
    ready: (page) => page.getByRole('link', { name: '48111', exact: true }),
    steps: async (page) => {
      await tickRow(page, `Select application ${NEW_APPLICATION}`)
      await tickRow(page, 'Select application 48108')
      await expect(page.getByText('2 applications selected').first()).toBeVisible()
    },
  },
  {
    edition: 'ministry',
    file: '02-application-review-tab',
    scenario: 'ministryAdmin',
    route: `/provincial/application/${NEW_APPLICATION}`,
    ready: (page) => page.getByText('jordan.sample@example.com').first(),
    steps: async (page) => {
      await openTab(page, 'Review', 'Not reviewed yet')
      await button(page, 'Update status').click()
      await expect(page.getByRole('radio', { name: 'Approved' })).toBeVisible()
    },
  },
  {
    edition: 'ministry',
    file: '03-offer-approval',
    scenario: 'ministryAdmin',
    route: `/provincial/offers/${MAIN_OFFER}`,
    ready: (page) => page.getByText('Boom ground at Sample Inlet, Jervis Inlet').first(),
    steps: async (page) => {
      await button(page, 'Edit offer').click()
      await expect(page.getByLabel('TEAC review date').first()).toBeVisible()
    },
    focus: (page) => page.getByText('Offer withdrawals', { exact: true }).first(),
  },
  {
    edition: 'ministry',
    file: '04-create-exemption',
    scenario: 'ministryAdmin',
    route: '/provincial/exemption/create',
    ready: (page) => page.getByRole('radio', { name: 'Order in Council', exact: true }),
  },
  {
    edition: 'ministry',
    file: '04-exemption-approve',
    scenario: 'ministryAdmin',
    route: `/provincial/exemption/${NEW_EXEMPTION}`,
    ready: (page) => page.getByText('pat.example@example.com').first(),
    steps: async (page) => {
      await button(page, 'Approve exemption').click()
      await expect(
        page.getByRole('dialog').getByText('pat.example@example.com').first(),
      ).toBeVisible()
    },
  },
  {
    edition: 'ministry',
    file: '05-permit-fees',
    scenario: 'ministryAdmin',
    route: `/provincial/permit/${COMPLETED_PERMIT}`,
    ready: (page) => heading(page, `Permit ${COMPLETED_PERMIT}`),
    steps: (page) => openTab(page, 'Fees', '$1,782.84'),
    maxHeight: 1200,
  },
  {
    edition: 'ministry',
    file: '05-permit-invoices',
    scenario: 'ministryAdmin',
    route: `/provincial/permit/${COMPLETED_PERMIT}`,
    ready: (page) => heading(page, `Permit ${COMPLETED_PERMIT}`),
    steps: (page) => openTab(page, 'GBMS', '26004187'),
  },
  {
    edition: 'ministry',
    file: '06-federal-application',
    scenario: 'ministryAdmin',
    route: `/federal/application/${FEDERAL_APPLICATION}`,
    ready: (page) => page.getByText('jordan.sample@example.com').first(),
    steps: (page) => openTab(page, 'Application', 'Harvested Timber'),
  },
  {
    edition: 'ministry',
    file: '07-advertising-list',
    scenario: 'ministryAdmin',
    route: '/reports/biweeklyListing',
    ready: (page) => button(page, 'Use current advertising period'),
    steps: async (page) => {
      await button(page, 'Use current advertising period').click()
      await expect(page.getByLabel('Listing from date').first()).toHaveValue('2026-11-18')
    },
  },
  {
    edition: 'ministry',
    file: '08-multiplication-factor',
    scenario: 'ministryAdmin',
    route: '/admin/policies/fee',
    ready: (page) => page.getByRole('cell', { name: 'Apr 1, 2027', exact: true }),
  },
  {
    edition: 'ministry',
    file: '08-average-market-values',
    scenario: 'ministryAdmin',
    route: '/admin/rtm/emslogamv/upload',
    ready: (page) => button(page, 'Replace file'),
    maxHeight: 1300,
  },
  {
    edition: 'ministry',
    file: '08-notifications',
    scenario: 'ministryAdmin',
    route: '/notifications',
    ready: (page) => page.getByText('Sample notice: planned maintenance').first(),
    steps: (page) => expect(button(page, 'New notification')).toBeVisible(),
  },
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
      orgUnitNo: shot.scenario === 'ministryAdmin' ? '1909' : '',
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
const settle = async (page: Page, shot: Shot, issues: CaptureIssues) => {
  const busy = page
    .locator('.cds--skeleton, .cds--skeleton__text, .cds--data-table--skeleton, .cds--loading')
    .filter({ visible: true })
  const loadingText = page.getByText(LOADING_TEXT).filter({ visible: true })
  try {
    await expect(busy).toHaveCount(0, { timeout: SETTLE_TIMEOUT_MS })
    await expect(loadingText).toHaveCount(0, { timeout: SETTLE_TIMEOUT_MS })
  } catch {
    issues.push(`${shot.edition}/${shot.file}: still loading after ${SETTLE_TIMEOUT_MS / 1000}s`)
  }
  await page.waitForTimeout(500)
}

const snap = async (page: Page, shot: Shot, issues: CaptureIssues) => {
  await settle(page, shot, issues)
  // No focus ring or hover state in the image: park the pointer on the empty part of the header.
  await page.mouse.move(VIEWPORT.width / 2, 2)
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  const output = path.join(OUT_DIR, shot.edition, 'images', `${shot.file}.png`)
  if (shot.focus) {
    await shot.focus(page).evaluate((element, offset) => {
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
    clip: { x: 0, y: 0, width: VIEWPORT.width, height: Math.min(height, shot.maxHeight ?? 900) },
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
  test(`manual screenshots: ${chapter}`, async ({ browser }) => {
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
