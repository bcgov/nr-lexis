import { expect, test, type Page } from '@playwright/test'
import {
  createUnsignedToken,
  E2E_BASE_URL,
  installSyntheticCognitoSession,
  type SyntheticCognitoSession,
} from './utils'

const SESSION_IDLE_WARNING_DELAY_MS = 25 * 60 * 1000
const SESSION_IDLE_WARNING_DURATION_MS = 5 * 60 * 1000
const URGENT_COUNTDOWN_DURATION_MS = 30 * 1000
const SESSION_START_ISO = '2026-07-22T12:00:00.000Z'
const TEST_USERNAME = 'SESSION.TIMEOUT.TESTER'

const authenticatedSession = {
  authenticated: true,
  principal: 'SESSION.TIMEOUT.TESTER',
  roles: ['ADMIN'],
  welcomeTarget: '/provincial/application',
  legacyPath: null,
  orgUnitNo: '1903',
  grantedActions: ['/applicationSearch'],
}

type SyntheticSessionState = {
  authenticated: boolean
}

const applicationSearchOptions = {
  exemptionTypes: [],
  exemptionReasons: [],
  applicationStatuses: [],
  productTypes: [],
  growthTypes: [],
  regions: [],
  currentSchedules: [],
}

const installSyntheticLexisApi = async (
  page: Page,
  sessionState: SyntheticSessionState = { authenticated: true },
) => {
  await page.route('**/api/lexis/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname
    let body: unknown

    switch (pathname) {
      case '/api/lexis/session/capabilities':
        if (!sessionState.authenticated) {
          await route.fulfill({
            status: 401,
            contentType: 'application/problem+json',
            body: JSON.stringify({ title: 'Unauthorized', status: 401 }),
          })
          return
        }
        body = authenticatedSession
        break
      case '/api/lexis/applications/search/options':
        body = applicationSearchOptions
        break
      case '/api/lexis/applications/search/count':
        body = { total: 0 }
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

const installSyntheticLogoutRedirect = async (page: Page, sessionState: SyntheticSessionState) => {
  const loginUrl = new URL('/', E2E_BASE_URL).toString()

  await page.route('**/clp-cgi/logoff.cgi**', async (route) => {
    sessionState.authenticated = false
    await route.fulfill({
      status: 302,
      headers: {
        location: loginUrl,
      },
      body: '',
    })
  })
}

const installSyntheticCognitoRefresh = async (
  page: Page,
  syntheticSession: SyntheticCognitoSession,
) => {
  const sessionStartSeconds = Math.floor(Date.parse(SESSION_START_ISO) / 1000)

  let refreshRequestCount = 0
  await page.route('https://cognito-idp.ca-central-1.amazonaws.com/**', async (route) => {
    const target = route.request().headers()['x-amz-target']
    if (!target?.endsWith('GetTokensFromRefreshToken')) {
      await route.abort()
      return
    }

    refreshRequestCount += 1
    const refreshedAtSeconds = sessionStartSeconds + 29 * 60 + 30
    await route.fulfill({
      status: 200,
      contentType: 'application/x-amz-json-1.1',
      body: JSON.stringify({
        AuthenticationResult: {
          AccessToken: createUnsignedToken({
            sub: 'session-timeout-test-user',
            username: TEST_USERNAME,
            client_id: syntheticSession.clientId,
            token_use: 'access',
            iat: refreshedAtSeconds,
            exp: refreshedAtSeconds + 5 * 60,
          }),
          IdToken: createUnsignedToken({
            sub: 'session-timeout-test-user',
            'custom:org_unit_no': '1903',
            token_use: 'id',
            iat: refreshedAtSeconds,
            exp: refreshedAtSeconds + 5 * 60,
          }),
          RefreshToken: 'rotated-refresh-token',
          ExpiresIn: 300,
          TokenType: 'Bearer',
        },
      }),
    })
  })

  return () => refreshRequestCount
}

test.describe('session timeout regression', () => {
  test('opens, renders, and resets the warning without real-time waiting', async ({ page }) => {
    await page.clock.install({ time: new Date(SESSION_START_ISO) })
    const sessionStartSeconds = Math.floor(Date.parse(SESSION_START_ISO) / 1000)
    const syntheticSession = await installSyntheticCognitoSession(page, {
      username: TEST_USERNAME,
      orgUnitNo: '1903',
      issuedAtSeconds: sessionStartSeconds,
      refreshToken: 'initial-refresh-token',
    })
    const getRefreshRequestCount = await installSyntheticCognitoRefresh(page, syntheticSession)
    await installSyntheticLexisApi(page)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/provincial/application', { waitUntil: 'domcontentloaded' })

    await expect(
      page.getByRole('heading', { level: 1, name: 'Provincial application search' }),
    ).toBeVisible()
    await page.getByRole('switch', { name: 'Switch to dark theme' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-carbon-theme', 'g100')

    await page.clock.fastForward(SESSION_IDLE_WARNING_DELAY_MS)

    const dialog = page.getByRole('alertdialog', { name: 'You’re about to be logged out' })
    const urgencyIcon = dialog.locator('.lexis-session-timeout-warning__urgency-icon')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('5:00', { exact: true })).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Close' })).toHaveCount(0)
    await expect(urgencyIcon).toBeHidden()
    await expect(dialog).toBeFocused()

    await page.keyboard.press('Escape')
    await expect(dialog).toBeVisible()

    const layout = await dialog.evaluate((container) => {
      const actions = container.querySelector('.lexis-session-timeout-warning__actions')
      const body = container.querySelector('.lexis-session-timeout-warning__body')
      const buttons = Array.from(
        container.querySelectorAll('.lexis-session-timeout-warning__actions .cds--btn'),
      )
      const logOutButton = container.querySelector('.cds--btn--tertiary')
      const stayLoggedInButton = container.querySelector('.cds--btn--primary')
      if (
        !(actions instanceof HTMLElement) ||
        !(body instanceof HTMLElement) ||
        !(logOutButton instanceof HTMLElement) ||
        !(stayLoggedInButton instanceof HTMLElement) ||
        buttons.length !== 2
      ) {
        throw new Error('Session timeout modal actions were not rendered.')
      }

      const containerBounds = container.getBoundingClientRect()
      const actionsBounds = actions.getBoundingClientRect()
      const buttonBounds = buttons.map((button) => button.getBoundingClientRect())
      const containerStyle = getComputedStyle(container)
      return {
        actionsWithinContainer:
          actionsBounds.left >= containerBounds.left - 1 &&
          actionsBounds.right <= containerBounds.right + 1,
        buttonsWithinContainer: buttonBounds.every(
          (button) =>
            button.left >= containerBounds.left - 1 && button.right <= containerBounds.right + 1,
        ),
        buttonWidths: buttonBounds.map((button) => button.width),
        actionsGap: getComputedStyle(actions).gap,
        actionsMarginTop: getComputedStyle(actions).marginTop,
        bodyColor: getComputedStyle(body.querySelector('p') as HTMLElement).color,
        containerColor: containerStyle.color,
        containerBackground: containerStyle.backgroundColor,
        containerBorderRadius: containerStyle.borderRadius,
        containerPadding: containerStyle.padding,
        containerWidth: containerBounds.width,
      }
    })

    expect(layout.actionsWithinContainer).toBe(true)
    expect(layout.buttonsWithinContainer).toBe(true)
    expect(layout.buttonWidths.every((width) => width < layout.containerWidth / 2)).toBe(true)
    expect(layout.actionsGap).toBe('8px')
    expect(layout.actionsMarginTop).toBe('24px')
    expect(layout.bodyColor).toBe(layout.containerColor)
    expect(layout.containerBackground).not.toBe('rgb(255, 255, 255)')
    expect(layout.containerBorderRadius).toBe('0px')
    expect(layout.containerPadding).toBe('24px')
    expect(layout.containerWidth).toBe(416)

    await page.clock.fastForward(SESSION_IDLE_WARNING_DURATION_MS - URGENT_COUNTDOWN_DURATION_MS)

    await expect(dialog.getByText('0:30', { exact: true })).toBeVisible()
    await expect(urgencyIcon).toBeVisible()
    await expect(urgencyIcon).not.toHaveAttribute('hidden', '')

    await dialog.getByRole('button', { name: 'Stay logged in' }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByText('You’re still logged in', { exact: true })).toBeVisible()
    expect(getRefreshRequestCount()).toBe(1)
    await expect
      .poll(() =>
        page.evaluate(
          ({ prefix, username }) =>
            window.localStorage.getItem(`${prefix}.${username}.refreshToken`),
          {
            prefix: syntheticSession.storagePrefix,
            username: syntheticSession.username,
          },
        ),
      )
      .toBe('rotated-refresh-token')

    await page.clock.fastForward(SESSION_IDLE_WARNING_DELAY_MS)
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('5:00', { exact: true })).toBeVisible()
  })

  test('shows the warning after automatic inactivity logout', async ({ page }) => {
    await page.clock.install({ time: new Date(SESSION_START_ISO) })
    const sessionState = { authenticated: true }
    const sessionStartSeconds = Math.floor(Date.parse(SESSION_START_ISO) / 1000)
    await installSyntheticCognitoSession(page, {
      username: TEST_USERNAME,
      orgUnitNo: '1903',
      issuedAtSeconds: sessionStartSeconds,
    })
    await installSyntheticLexisApi(page, sessionState)
    await installSyntheticLogoutRedirect(page, sessionState)
    await page.goto('/provincial/application', { waitUntil: 'domcontentloaded' })

    await expect(
      page.getByRole('heading', { level: 1, name: 'Provincial application search' }),
    ).toBeVisible()

    await page.clock.fastForward(SESSION_IDLE_WARNING_DELAY_MS + SESSION_IDLE_WARNING_DURATION_MS)

    await expect(page.getByRole('heading', { level: 1, name: 'LEXIS' })).toBeVisible()
    await expect(page.getByText("You've been logged out", { exact: true })).toBeVisible()
  })

  test('does not show the warning after manual logout', async ({ page }) => {
    const sessionState = { authenticated: true }
    await installSyntheticCognitoSession(page, {
      username: TEST_USERNAME,
      orgUnitNo: '1903',
    })
    await installSyntheticLexisApi(page, sessionState)
    await installSyntheticLogoutRedirect(page, sessionState)
    await page.goto('/provincial/application', { waitUntil: 'domcontentloaded' })

    const profileButton = page.locator('button[aria-controls="profile-panel"]')
    await profileButton.click()
    const logOutButton = page
      .locator('#profile-panel.is-open')
      .getByRole('button', { name: 'Log out' })
    await logOutButton.click()

    await expect(page.getByRole('heading', { level: 1, name: 'LEXIS' })).toBeVisible()
    await expect(page.getByText("You've been logged out", { exact: true })).toHaveCount(0)
  })
})
