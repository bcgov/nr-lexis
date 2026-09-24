import { createServer } from 'node:http'
import { expect, test, type Page } from '@playwright/test'
import {
  createUnsignedToken,
  E2E_BASE_URL,
  installSyntheticOidcSession,
  type SyntheticOidcSession,
} from './utils'
import { getWithAuth } from './utils/regression-auth'
import { gotoWithRecovery } from './utils/navigation'

const SESSION_IDLE_WARNING_DELAY_MS = 20 * 60 * 1000
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

  await page.route('**/protocol/openid-connect/logout**', async (route) => {
    const request = new URL(route.request().url())
    expect(request.searchParams.get('id_token_hint')).toMatch(/^eyJ[^.]+\.[^.]+\.[^.]+$/)
    expect(request.searchParams.get('post_logout_redirect_uri')).toBe(new URL(E2E_BASE_URL).origin)
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

const installSyntheticOidcRefresh = async (
  page: Page,
  syntheticSession: SyntheticOidcSession,
  refreshedAtSeconds = Math.floor(Date.parse(SESSION_START_ISO) / 1000) + 24 * 60 + 30,
) => {
  let refreshRequestCount = 0
  await page.route(`${syntheticSession.issuer}/protocol/openid-connect/token`, async (route) => {
    const parameters = new URLSearchParams(route.request().postData() ?? '')
    expect(parameters.get('grant_type')).toBe('refresh_token')
    expect(parameters.get('client_id')).toBe(syntheticSession.clientId)
    expect(parameters.get('refresh_token')).toBe('initial-refresh-token')

    refreshRequestCount += 1
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': new URL(E2E_BASE_URL).origin },
      body: JSON.stringify({
        access_token: createUnsignedToken({
          ...syntheticSession.profile,
          iat: refreshedAtSeconds,
          exp: refreshedAtSeconds + 5 * 60,
          typ: 'Bearer',
        }),
        id_token: createUnsignedToken({
          ...syntheticSession.profile,
          iat: refreshedAtSeconds,
          exp: refreshedAtSeconds + 5 * 60,
        }),
        refresh_token: 'rotated-refresh-token',
        expires_in: 300,
        token_type: 'Bearer',
        scope: 'openid profile email',
      }),
    })
  })

  return () => refreshRequestCount
}

const startAuthorizationProbe = async () => {
  const authorizationHeaders: Array<string | undefined> = []
  const server = createServer((request, response) => {
    authorizationHeaders.push(request.headers.authorization)
    response.writeHead(200, {
      connection: 'close',
      'content-type': 'application/json',
    })
    response.end(JSON.stringify({ accepted: true }))
  })

  await new Promise<void>((resolve, reject) => {
    const rejectOnError = (error: Error) => reject(error)
    server.once('error', rejectOnError)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', rejectOnError)
      resolve()
    })
  })

  const address = server.address()
  if (!address || typeof address === 'string') {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
    throw new Error('Authorization probe did not bind to a TCP port.')
  }

  return {
    authorizationHeaders,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      }),
    url: `http://127.0.0.1:${address.port}/authorization-probe`,
  }
}

test.describe('session timeout regression', () => {
  test.describe.configure({ timeout: 240_000 })
  test('refreshes an expired token before direct regression API calls', async ({ page }) => {
    const nowSeconds = Math.floor(Date.now() / 1000)
    const syntheticSession = await installSyntheticOidcSession(page, {
      username: TEST_USERNAME,
      orgUnitNo: '1903',
      issuedAtSeconds: nowSeconds,
      expiresInSeconds: 60 * 60,
      refreshToken: 'initial-refresh-token',
    })
    const getRefreshRequestCount = await installSyntheticOidcRefresh(
      page,
      syntheticSession,
      nowSeconds,
    )
    await installSyntheticLexisApi(page)
    await gotoWithRecovery(page, new URL('/provincial/application', E2E_BASE_URL).toString(), {
      ready: page.getByRole('heading', { level: 1, name: 'Provincial application search' }),
    })

    await expect(
      page.getByRole('heading', { level: 1, name: 'Provincial application search' }),
    ).toBeVisible()

    const expiredAccessToken = createUnsignedToken({
      ...syntheticSession.profile,
      iat: nowSeconds - 301,
      exp: nowSeconds - 1,
      typ: 'Bearer',
    })
    await page.evaluate(
      ({ key, accessToken, expiresAt }) => {
        const user = JSON.parse(window.sessionStorage.getItem(key)!)
        user.access_token = accessToken
        user.expires_at = expiresAt
        window.sessionStorage.setItem(key, JSON.stringify(user))
      },
      {
        key: syntheticSession.storageKey,
        accessToken: expiredAccessToken,
        expiresAt: nowSeconds - 1,
      },
    )

    const authorizationProbe = await startAuthorizationProbe()
    try {
      const response = await getWithAuth(page, authorizationProbe.url)
      expect(response.status()).toBe(200)
      await response.dispose()

      expect(getRefreshRequestCount()).toBe(1)
      const refreshedAccessToken = await page.evaluate(
        (key) => JSON.parse(window.sessionStorage.getItem(key)!).access_token as string,
        syntheticSession.storageKey,
      )
      if (!refreshedAccessToken) {
        throw new Error('The synthetic OIDC access token was not refreshed.')
      }

      expect(refreshedAccessToken).not.toBe(expiredAccessToken)
      expect(authorizationProbe.authorizationHeaders).toEqual([`Bearer ${refreshedAccessToken}`])
    } finally {
      await authorizationProbe.close()
    }
  })

  test('opens, renders, and resets the warning without real-time waiting', async ({ page }) => {
    await page.clock.install({ time: new Date(SESSION_START_ISO) })
    const sessionStartSeconds = Math.floor(Date.parse(SESSION_START_ISO) / 1000)
    const syntheticSession = await installSyntheticOidcSession(page, {
      username: TEST_USERNAME,
      orgUnitNo: '1903',
      issuedAtSeconds: sessionStartSeconds,
      refreshToken: 'initial-refresh-token',
    })
    const getRefreshRequestCount = await installSyntheticOidcRefresh(page, syntheticSession)
    await installSyntheticLexisApi(page)
    await page.setViewportSize({ width: 1440, height: 900 })
    await gotoWithRecovery(page, new URL('/provincial/application', E2E_BASE_URL).toString(), {
      ready: page.getByRole('heading', { level: 1, name: 'Provincial application search' }),
    })

    await expect(
      page.getByRole('heading', { level: 1, name: 'Provincial application search' }),
    ).toBeVisible()
    await page.getByRole('switch', { name: 'Dark theme' }).click()
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
          (key) => JSON.parse(window.sessionStorage.getItem(key)!).refresh_token as string,
          syntheticSession.storageKey,
        ),
      )
      .toBe('rotated-refresh-token')

    await page.clock.fastForward(SESSION_IDLE_WARNING_DELAY_MS)
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('5:00', { exact: true })).toBeVisible()
  })

  test('ends the session when Stay logged in cannot renew it', async ({ page }) => {
    await page.clock.install({ time: new Date(SESSION_START_ISO) })
    const sessionState = { authenticated: true }
    const syntheticSession = await installSyntheticOidcSession(page, {
      username: TEST_USERNAME,
      orgUnitNo: '1903',
      issuedAtSeconds: Math.floor(Date.parse(SESSION_START_ISO) / 1000),
    })
    await page.route(`${syntheticSession.issuer}/protocol/openid-connect/token`, async (route) => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': new URL(E2E_BASE_URL).origin },
        body: JSON.stringify({ error: 'invalid_grant' }),
      })
    })
    await installSyntheticLexisApi(page, sessionState)
    await installSyntheticLogoutRedirect(page, sessionState)
    await gotoWithRecovery(page, new URL('/provincial/application', E2E_BASE_URL).toString(), {
      ready: page.getByRole('heading', { level: 1, name: 'Provincial application search' }),
    })
    await page.clock.fastForward(SESSION_IDLE_WARNING_DELAY_MS)
    const dialog = page.getByRole('alertdialog', { name: 'You’re about to be logged out' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Stay logged in' }).click()
    await expect(page.getByRole('button', { name: /log in with idir/i })).toBeVisible()
    await expect(page.getByText('You’re still logged in', { exact: true })).toHaveCount(0)
    await expect
      .poll(() => page.evaluate((key) => sessionStorage.getItem(key), syntheticSession.storageKey))
      .toBeNull()
  })

  test('shows the warning after automatic inactivity logout', async ({ page }) => {
    await page.clock.install({ time: new Date(SESSION_START_ISO) })
    const sessionState = { authenticated: true }
    const sessionStartSeconds = Math.floor(Date.parse(SESSION_START_ISO) / 1000)
    await installSyntheticOidcSession(page, {
      username: TEST_USERNAME,
      orgUnitNo: '1903',
      issuedAtSeconds: sessionStartSeconds,
    })
    await installSyntheticLexisApi(page, sessionState)
    await installSyntheticLogoutRedirect(page, sessionState)
    await gotoWithRecovery(page, new URL('/provincial/application', E2E_BASE_URL).toString(), {
      ready: page.getByRole('heading', { level: 1, name: 'Provincial application search' }),
    })

    await expect(
      page.getByRole('heading', { level: 1, name: 'Provincial application search' }),
    ).toBeVisible()

    await page.clock.fastForward(SESSION_IDLE_WARNING_DELAY_MS + SESSION_IDLE_WARNING_DURATION_MS)

    await expect(page.getByRole('heading', { level: 1, name: 'LEXIS' })).toBeVisible()
    await expect(page.getByText("You've been logged out", { exact: true })).toBeVisible()
  })

  test('does not show the warning after manual logout', async ({ page }) => {
    const sessionState = { authenticated: true }
    await installSyntheticOidcSession(page, {
      username: TEST_USERNAME,
      orgUnitNo: '1903',
    })
    await installSyntheticLexisApi(page, sessionState)
    await installSyntheticLogoutRedirect(page, sessionState)
    await gotoWithRecovery(page, new URL('/provincial/application', E2E_BASE_URL).toString(), {
      ready: page.getByRole('heading', { level: 1, name: 'Provincial application search' }),
    })

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
