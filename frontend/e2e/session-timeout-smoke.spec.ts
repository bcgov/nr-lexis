import { expect, test, type Page } from '@playwright/test'

const SESSION_IDLE_WARNING_DELAY_MS = 10 * 60 * 1000
const SESSION_IDLE_WARNING_DURATION_MS = 5 * 60 * 1000
const URGENT_COUNTDOWN_DURATION_MS = 30 * 1000
const SESSION_START_ISO = '2026-07-22T12:00:00.000Z'
const USER_POOL_CLIENT_ID = 'local-e2e-client'
const TEST_USERNAME = 'SESSION.TIMEOUT.TESTER'
const TOKEN_STORAGE_PREFIX = `CognitoIdentityServiceProvider.${USER_POOL_CLIENT_ID}`

const createUnsignedToken = (payload: Record<string, unknown>): string => {
  const encode = (value: Record<string, unknown>) =>
    Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(payload)}.signature`
}

const authenticatedSession = {
  authenticated: true,
  principal: 'SESSION.TIMEOUT.TESTER',
  roles: ['ADMIN'],
  welcomeTarget: '/provincial/application',
  legacyPath: null,
  orgUnitNo: '1903',
  grantedActions: ['/applicationSearch'],
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

const installSyntheticLexisApi = async (page: Page) => {
  await page.route('**/api/lexis/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname
    let body: unknown

    switch (pathname) {
      case '/api/lexis/session/capabilities':
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

const installSyntheticCognitoSession = async (page: Page) => {
  const sessionStartSeconds = Math.floor(Date.parse(SESSION_START_ISO) / 1000)
  const initialAccessToken = createUnsignedToken({
    sub: 'session-timeout-test-user',
    username: TEST_USERNAME,
    client_id: USER_POOL_CLIENT_ID,
    token_use: 'access',
    iat: sessionStartSeconds,
    exp: sessionStartSeconds + 60 * 60,
  })
  const initialIdToken = createUnsignedToken({
    sub: 'session-timeout-test-user',
    'custom:org_unit_no': '1903',
    token_use: 'id',
    iat: sessionStartSeconds,
    exp: sessionStartSeconds + 60 * 60,
  })

  await page.addInitScript(
    ({ prefix, username, accessToken, idToken }) => {
      window.localStorage.setItem(`${prefix}.LastAuthUser`, username)
      window.localStorage.setItem(`${prefix}.${username}.accessToken`, accessToken)
      window.localStorage.setItem(`${prefix}.${username}.idToken`, idToken)
      window.localStorage.setItem(`${prefix}.${username}.refreshToken`, 'initial-refresh-token')
      window.localStorage.setItem(`${prefix}.${username}.clockDrift`, '0')
    },
    {
      prefix: TOKEN_STORAGE_PREFIX,
      username: TEST_USERNAME,
      accessToken: initialAccessToken,
      idToken: initialIdToken,
    },
  )

  let refreshRequestCount = 0
  await page.route('https://cognito-idp.ca-central-1.amazonaws.com/**', async (route) => {
    const target = route.request().headers()['x-amz-target']
    if (!target?.endsWith('GetTokensFromRefreshToken')) {
      await route.abort()
      return
    }

    refreshRequestCount += 1
    const refreshedAtSeconds = sessionStartSeconds + 14 * 60 + 30
    await route.fulfill({
      status: 200,
      contentType: 'application/x-amz-json-1.1',
      body: JSON.stringify({
        AuthenticationResult: {
          AccessToken: createUnsignedToken({
            sub: 'session-timeout-test-user',
            username: TEST_USERNAME,
            client_id: USER_POOL_CLIENT_ID,
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
    const getRefreshRequestCount = await installSyntheticCognitoSession(page)
    await installSyntheticLexisApi(page)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/provincial/application', { waitUntil: 'domcontentloaded' })

    await expect(
      page.getByRole('heading', { level: 1, name: 'Provincial application search' }),
    ).toBeVisible()

    await page.clock.fastForward(SESSION_IDLE_WARNING_DELAY_MS)

    const dialog = page.getByRole('alertdialog', { name: 'You’re about to be logged out' })
    const urgencyIcon = dialog.locator('.lexis-session-timeout-warning__urgency-icon')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('5:00', { exact: true })).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Close' })).toHaveCount(0)
    await expect(urgencyIcon).toBeHidden()

    await page.keyboard.press('Escape')
    await expect(dialog).toBeVisible()

    const layout = await dialog.evaluate((container) => {
      const footer = container.querySelector('.cds--modal-footer')
      const buttons = Array.from(container.querySelectorAll('.cds--modal-footer .cds--btn'))
      if (!(footer instanceof HTMLElement) || buttons.length !== 2) {
        throw new Error('Session timeout modal actions were not rendered.')
      }

      const containerBounds = container.getBoundingClientRect()
      const footerBounds = footer.getBoundingClientRect()
      const buttonBounds = buttons.map((button) => button.getBoundingClientRect())
      return {
        footerWithinContainer:
          footerBounds.left >= containerBounds.left - 1 &&
          footerBounds.right <= containerBounds.right + 1,
        buttonsWithinContainer: buttonBounds.every(
          (button) =>
            button.left >= containerBounds.left - 1 && button.right <= containerBounds.right + 1,
        ),
        buttonWidths: buttonBounds.map((button) => button.width),
        buttonBorderRadii: buttons.map((button) => getComputedStyle(button).borderRadius),
        containerWidth: containerBounds.width,
      }
    })

    expect(layout.footerWithinContainer).toBe(true)
    expect(layout.buttonsWithinContainer).toBe(true)
    expect(layout.buttonWidths.every((width) => width < layout.containerWidth / 2)).toBe(true)
    expect(layout.buttonBorderRadii).toEqual(['4px', '4px'])

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
          { prefix: TOKEN_STORAGE_PREFIX, username: TEST_USERNAME },
        ),
      )
      .toBe('rotated-refresh-token')

    await page.clock.fastForward(SESSION_IDLE_WARNING_DELAY_MS)
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('5:00', { exact: true })).toBeVisible()
  })
})
