import { expect, type APIResponse, type Page } from '@playwright/test'
import { E2E_BASE_URL } from './index'

type SessionCapabilities = {
  authenticated?: boolean
  principal?: unknown
  roles?: unknown
  grantedActions?: unknown
}

type ValidationResponse = {
  valid?: boolean
  success?: boolean
  applicationNumber?: unknown
  errors?: unknown
}

type MultipartFile = {
  name: string
  mimeType: string
  buffer: Buffer
}

type PostWithCsrfOptions = {
  data?: Record<string, unknown>
  form?: Record<string, string>
  multipart?: Record<string, string | number | boolean | MultipartFile>
  params?: Record<string, string>
  headers?: Record<string, string>
}

type GetWithAuthOptions = {
  params?: Record<string, string>
  failOnStatusCode?: boolean
  headers?: Record<string, string>
}

type RealCredentials = {
  username: string
  password: string
}

type LoginConfig = {
  buttonName: RegExp
  label: string
  testId: string
  usernameEnv: string
  passwordEnv: string
}

type AuthTokenSnapshot = {
  accessToken?: string
  cookieCandidateCount: number
  storageCandidateCount: number
}

type AccessTokenDiagnostics = {
  expiresInSeconds?: number
  tokenUse?: string
}

const baseOrigin = new URL(E2E_BASE_URL).origin
const CREDENTIAL_SCREEN_TIMEOUT_MS = 5_000
const LOGIN_SESSION_TIMEOUT_MS = 30_000
const LOGIN_BUTTON_VISIBLE_TIMEOUT_MS = 10_000
const LOGIN_BUTTON_CLICK_TIMEOUT_MS = 15_000
const LOGIN_SHELL_RENDER_ATTEMPTS = 3
const APP_ROOT_NAVIGATION_ATTEMPTS = 4
const APP_ROOT_NAVIGATION_TIMEOUT_MS = 20_000
const JWT_PATTERN = /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/
const LOGIN_ERROR_TEXT =
  /username or password.*incorrect|user id or password.*incorrect|user id and password.*don't match|invalid username|invalid password|authentication failed/i
const SENSITIVE_URL_PARAM_PATTERN =
  /^(password|token|access_token|refresh_token|id_token|code|state|session_state|id_token_hint|email|user|username)$/i

const idirLoginConfig: LoginConfig = {
  buttonName: /log in with idir/i,
  label: 'IDIR',
  testId: 'landing-button__idir',
  usernameEnv: 'E2E_IDIR_USER',
  passwordEnv: 'E2E_IDIR_PASSWORD',
}

const hasCredentials = ({ usernameEnv, passwordEnv }: LoginConfig): boolean =>
  Boolean(process.env[usernameEnv]?.trim() && process.env[passwordEnv]?.trim())

export const hasIdirCredentials = (): boolean => hasCredentials(idirLoginConfig)

const credentials = ({ usernameEnv, passwordEnv }: LoginConfig): RealCredentials => {
  return {
    username: process.env[usernameEnv]?.trim() ?? '',
    password: process.env[passwordEnv] ?? '',
  }
}

const safeDecode = (value: string): string => {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

const findAccessTokenValue = (name: string, value: string): string | undefined => {
  const normalizedName = name.toLowerCase()
  const decodedValue = safeDecode(value).replace(/^"|"$/g, '')

  if (
    (normalizedName.includes('accesstoken') || normalizedName.includes('access_token')) &&
    JWT_PATTERN.test(decodedValue)
  ) {
    return decodedValue
  }

  if (!decodedValue.includes('accessToken') && !decodedValue.includes('access_token')) {
    return undefined
  }

  try {
    const parsed = JSON.parse(decodedValue) as unknown
    if (!parsed || typeof parsed !== 'object') {
      return undefined
    }

    const stack: unknown[] = [parsed]
    while (stack.length > 0) {
      const item = stack.pop()
      if (!item || typeof item !== 'object') {
        continue
      }

      for (const [key, nestedValue] of Object.entries(item)) {
        if (typeof nestedValue === 'string') {
          const token = findAccessTokenValue(key, nestedValue)
          if (token) {
            return token
          }
        } else if (nestedValue && typeof nestedValue === 'object') {
          stack.push(nestedValue)
        }
      }
    }
  } catch {
    return undefined
  }

  return undefined
}

const browserAuthSnapshot = async (page: Page): Promise<AuthTokenSnapshot> => {
  return page
    .evaluate(() => {
      const jwtPattern = /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/
      const decode = (value: string): string => {
        try {
          return decodeURIComponent(value)
        } catch {
          return value
        }
      }
      const findToken = (name: string, value: string): string | undefined => {
        const normalizedName = name.toLowerCase()
        const decodedValue = decode(value).replace(/^"|"$/g, '')

        if (
          (normalizedName.includes('accesstoken') || normalizedName.includes('access_token')) &&
          jwtPattern.test(decodedValue)
        ) {
          return decodedValue
        }

        if (!decodedValue.includes('accessToken') && !decodedValue.includes('access_token')) {
          return undefined
        }

        try {
          const parsed = JSON.parse(decodedValue) as unknown
          if (!parsed || typeof parsed !== 'object') {
            return undefined
          }

          const stack: unknown[] = [parsed]
          while (stack.length > 0) {
            const item = stack.pop()
            if (!item || typeof item !== 'object') {
              continue
            }

            for (const [key, nestedValue] of Object.entries(item)) {
              if (typeof nestedValue === 'string') {
                const token = findToken(key, nestedValue)
                if (token) {
                  return token
                }
              } else if (nestedValue && typeof nestedValue === 'object') {
                stack.push(nestedValue)
              }
            }
          }
        } catch {
          return undefined
        }

        return undefined
      }

      const cookieEntries = document.cookie
        .split(';')
        .map((cookie) => cookie.trim())
        .filter(Boolean)
        .map((cookie) => {
          const separatorIndex = cookie.indexOf('=')
          return separatorIndex >= 0
            ? [cookie.slice(0, separatorIndex), cookie.slice(separatorIndex + 1)]
            : [cookie, '']
        })
      const storageEntries = [
        ...Array.from({ length: localStorage.length }, (_, index) => {
          const key = localStorage.key(index) ?? ''
          return [key, localStorage.getItem(key) ?? '']
        }),
        ...Array.from({ length: sessionStorage.length }, (_, index) => {
          const key = sessionStorage.key(index) ?? ''
          return [key, sessionStorage.getItem(key) ?? '']
        }),
      ]

      let accessToken: string | undefined
      let cookieCandidateCount = 0
      let storageCandidateCount = 0

      for (const [name, value] of cookieEntries) {
        if (name.toLowerCase().includes('token')) {
          cookieCandidateCount += 1
        }
        accessToken = accessToken ?? findToken(name, value)
      }

      for (const [name, value] of storageEntries) {
        if (name.toLowerCase().includes('token') || value.includes('accessToken')) {
          storageCandidateCount += 1
        }
        accessToken = accessToken ?? findToken(name, value)
      }

      return {
        accessToken,
        cookieCandidateCount,
        storageCandidateCount,
      }
    })
    .catch(() => ({
      cookieCandidateCount: 0,
      storageCandidateCount: 0,
    }))
}

const contextAuthSnapshot = async (page: Page): Promise<AuthTokenSnapshot> => {
  const cookies = await page.context().cookies()
  let accessToken: string | undefined
  let cookieCandidateCount = 0

  for (const cookie of cookies) {
    if (cookie.name.toLowerCase().includes('token')) {
      cookieCandidateCount += 1
    }
    accessToken = accessToken ?? findAccessTokenValue(cookie.name, cookie.value)
  }

  return {
    accessToken,
    cookieCandidateCount,
    storageCandidateCount: 0,
  }
}

const csrfHeaders = async (page: Page): Promise<Record<string, string>> => {
  const cookies = await page.context().cookies()
  const xsrfCookie = cookies.find((cookie) => cookie.name === 'XSRF-TOKEN')
  return xsrfCookie ? { 'X-XSRF-TOKEN': decodeURIComponent(xsrfCookie.value) } : {}
}

const bearerHeaders = async (page: Page): Promise<Record<string, string>> => {
  const browserSnapshot = await browserAuthSnapshot(page)
  const contextSnapshot = browserSnapshot.accessToken ? null : await contextAuthSnapshot(page)
  const accessToken = browserSnapshot.accessToken ?? contextSnapshot?.accessToken
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {}
}

const authHeaders = async (page: Page): Promise<Record<string, string>> => ({
  ...(await bearerHeaders(page)),
  ...(await csrfHeaders(page)),
})

export const getWithAuth = async (
  page: Page,
  path: string,
  options: GetWithAuthOptions = {},
): Promise<APIResponse> => {
  return page.request.get(path, {
    ...options,
    failOnStatusCode: options.failOnStatusCode ?? false,
    headers: {
      ...options.headers,
      ...(await authHeaders(page)),
    },
  })
}

const base64UrlDecode = (value: string): string => {
  const padded = `${value}${'='.repeat((4 - (value.length % 4)) % 4)}`
  return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
}

const accessTokenDiagnostics = (accessToken?: string): AccessTokenDiagnostics | null => {
  if (!accessToken) {
    return null
  }

  try {
    const [, payloadSegment] = accessToken.split('.')
    const payload = JSON.parse(base64UrlDecode(payloadSegment)) as Record<string, unknown>
    const exp = typeof payload.exp === 'number' ? payload.exp : undefined

    return {
      expiresInSeconds: exp ? exp - Math.floor(Date.now() / 1000) : undefined,
      tokenUse: typeof payload.token_use === 'string' ? payload.token_use : undefined,
    }
  } catch {
    return null
  }
}

export const redactedTextSnippet = (text: string, maxLength = 500): string => {
  const normalized = text
    .replace(/Bearer\s+eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/gi, 'Bearer [redacted]')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[jwt-redacted]')
    .replace(
      /("(?:accessToken|access_token|clientEmail|clientEmailAddress|email|idToken|id_token|password|principal|refreshToken|refresh_token|token|user|username)"\s*:\s*")[^"]*"/gi,
      '$1[redacted]"',
    )
    .replace(
      /([?&](?:password|token|access_token|refresh_token|id_token|code|state|session_state|id_token_hint|email|user|username)=)[^&\s"']+/gi,
      '$1[redacted]',
    )
    .replace(/\s+/g, ' ')
    .trim()

  return normalized.slice(0, maxLength)
}

const responseBodySnippet = async (response: APIResponse | null): Promise<string | null> => {
  if (!response) {
    return null
  }

  const text = await response.text().catch(() => '')
  const normalized = redactedTextSnippet(text)
  return normalized ? normalized.slice(0, 500) : null
}

const redactedUrlForLog = (rawUrl: string): string => {
  try {
    const url = new URL(rawUrl)
    for (const key of Array.from(url.searchParams.keys())) {
      if (SENSITIVE_URL_PARAM_PATTERN.test(key)) {
        url.searchParams.set(key, '[redacted]')
      }
    }
    return url.toString()
  } catch {
    return redactedTextSnippet(rawUrl, 1_000)
  }
}

const authDiagnostics = async (page: Page): Promise<string> => {
  const [browserSnapshot, contextSnapshot] = await Promise.all([
    browserAuthSnapshot(page),
    contextAuthSnapshot(page),
  ])
  const accessToken = browserSnapshot.accessToken ?? contextSnapshot.accessToken
  const tokenDiagnostics = accessTokenDiagnostics(accessToken)
  const sessionResponse = await getWithAuth(page, '/api/lexis/session/capabilities').catch(
    () => null,
  )
  const sessionBody = await responseBodySnippet(sessionResponse)

  return [
    `browserCookieTokenCandidates=${browserSnapshot.cookieCandidateCount}`,
    `browserStorageTokenCandidates=${browserSnapshot.storageCandidateCount}`,
    `contextCookieTokenCandidates=${contextSnapshot.cookieCandidateCount}`,
    `bearerTokenFound=${Boolean(accessToken)}`,
    tokenDiagnostics?.tokenUse ? `tokenUse=${tokenDiagnostics.tokenUse}` : null,
    typeof tokenDiagnostics?.expiresInSeconds === 'number'
      ? `tokenExpiresInSeconds=${tokenDiagnostics.expiresInSeconds}`
      : null,
    `sessionStatus=${sessionResponse?.status() ?? 'request-failed'}`,
    sessionBody ? `sessionBody=${JSON.stringify(sessionBody)}` : null,
  ]
    .filter(Boolean)
    .join(', ')
}

const isSessionAuthenticated = async (page: Page): Promise<boolean> => {
  const response = await getWithAuth(page, '/api/lexis/session/capabilities').catch(() => null)

  if (!response?.ok()) {
    return false
  }

  const payload = (await response.json().catch(() => null)) as SessionCapabilities | null
  return Boolean(payload?.authenticated)
}

export const fetchSessionCapabilities = async (page: Page): Promise<SessionCapabilities> => {
  const response = await getWithAuth(page, '/api/lexis/session/capabilities')
  expect(response.status()).toBe(200)
  return (await response.json()) as SessionCapabilities
}

const firstVisible = async (page: Page, selector: string, timeout = 5000) => {
  const locator = page.locator(selector).first()
  const visible = await locator.isVisible({ timeout }).catch(() => false)
  return visible ? locator : null
}

const currentPageSummary = async (page: Page): Promise<string> => {
  const title = await page.title().catch(() => '')
  const rawUrl = page.url()
  const safeUrl = (() => {
    try {
      const url = new URL(rawUrl)
      return `${url.origin}${url.pathname}`
    } catch {
      return rawUrl
    }
  })()

  return `${safeUrl}${title ? ` (${title})` : ''}`
}

const visibleLoginError = async (page: Page): Promise<string | null> => {
  const error = page.getByText(LOGIN_ERROR_TEXT).first()
  if (!(await error.isVisible({ timeout: 500 }).catch(() => false))) {
    return null
  }
  const text = await error.textContent().catch(() => null)
  return text?.trim() || 'Login form reported an authentication error.'
}

const gotoAppRoot = async (page: Page): Promise<void> => {
  let lastError: unknown

  for (let attempt = 1; attempt <= APP_ROOT_NAVIGATION_ATTEMPTS; attempt += 1) {
    try {
      await page.goto('/', {
        waitUntil: 'domcontentloaded',
        timeout: APP_ROOT_NAVIGATION_TIMEOUT_MS,
      })
      return
    } catch (error) {
      lastError = error
      if (attempt < APP_ROOT_NAVIGATION_ATTEMPTS) {
        await page.waitForTimeout(2_000)
      }
    }
  }

  throw new Error(
    `Unable to load LEXIS app root after ${APP_ROOT_NAVIGATION_ATTEMPTS} attempts. Last error: ${String(lastError)}`,
  )
}

const pageTextSnippet = async (page: Page): Promise<string> => {
  const text = await page
    .locator('body')
    .innerText({ timeout: 1_000 })
    .catch(() => '')
  return redactedTextSnippet(text, 1_000)
}

const visibleLoginButton = async (page: Page, config: LoginConfig) => {
  const testIdButton = page.getByTestId(config.testId)
  if (
    await testIdButton.isVisible({ timeout: LOGIN_BUTTON_VISIBLE_TIMEOUT_MS }).catch(() => false)
  ) {
    return testIdButton
  }

  const roleButton = page.getByRole('button', { name: config.buttonName }).first()
  if (await roleButton.isVisible({ timeout: LOGIN_BUTTON_VISIBLE_TIMEOUT_MS }).catch(() => false)) {
    return roleButton
  }

  return null
}

const clickLoginButton = async (page: Page, config: LoginConfig): Promise<void> => {
  for (let attempt = 1; attempt <= LOGIN_SHELL_RENDER_ATTEMPTS; attempt += 1) {
    const button = await visibleLoginButton(page, config)
    if (button) {
      try {
        await button.click({ timeout: LOGIN_BUTTON_CLICK_TIMEOUT_MS })
        return
      } catch (error) {
        throw new Error(
          `Unable to click ${config.label} login button from ${await currentPageSummary(page)}. Page text: ${await pageTextSnippet(page)}. ${String(error)}`,
        )
      }
    }

    if (attempt < LOGIN_SHELL_RENDER_ATTEMPTS) {
      await page
        .reload({ waitUntil: 'domcontentloaded', timeout: APP_ROOT_NAVIGATION_TIMEOUT_MS })
        .catch(() => gotoAppRoot(page))
    }
  }

  throw new Error(
    `Unable to find ${config.label} login button after ${LOGIN_SHELL_RENDER_ATTEMPTS} attempts. Last page: ${await currentPageSummary(page)}. Page text: ${await pageTextSnippet(page)}.`,
  )
}

const fillCredentialScreen = async (
  page: Page,
  username: string,
  password: string,
): Promise<boolean> => {
  const [usernameInput, passwordInput] = await Promise.all([
    firstVisible(
      page,
      'input[name="user"], input[name*="user" i], input[id*="user" i], input[type="email"], input[type="text"]',
      CREDENTIAL_SCREEN_TIMEOUT_MS,
    ),
    firstVisible(
      page,
      'input[name="password"], input[type="password"]',
      CREDENTIAL_SCREEN_TIMEOUT_MS,
    ),
  ])

  if (!usernameInput && !passwordInput) {
    return false
  }

  if (usernameInput) {
    await usernameInput.fill(username)
  }
  if (passwordInput) {
    await passwordInput.fill(password)
  }

  const submitButton = page.locator('input[type="submit"], button[type="submit"]').first()
  if (await submitButton.isVisible({ timeout: 5000 }).catch(() => false)) {
    await submitButton.click()
  } else if (
    await page
      .getByRole('button', { name: /log in|login|sign in|continue|submit/i })
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false)
  ) {
    await page
      .getByRole('button', { name: /log in|login|sign in|continue|submit/i })
      .first()
      .click()
  } else if (passwordInput) {
    await passwordInput.press('Enter')
  } else if (usernameInput) {
    await usernameInput.press('Enter')
  }

  await page.waitForLoadState('domcontentloaded').catch(() => undefined)
  return true
}

const loginWithConfig = async (page: Page, config: LoginConfig): Promise<void> => {
  const { label } = config
  const { username, password } = credentials(config)
  await gotoAppRoot(page)

  if (await isSessionAuthenticated(page)) {
    return
  }

  await clickLoginButton(page, config)
  await page.waitForLoadState('domcontentloaded').catch(() => undefined)

  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (await isSessionAuthenticated(page)) {
      return
    }

    const loginError = await visibleLoginError(page)
    if (loginError) {
      throw new Error(
        `${label} login was rejected by the identity provider: ${loginError}. Last page: ${await currentPageSummary(page)}.`,
      )
    }

    const filled = await fillCredentialScreen(page, username, password)
    if (!filled && page.url().startsWith(baseOrigin)) {
      break
    }

    await page.waitForTimeout(1000)

    const submittedLoginError = await visibleLoginError(page)
    if (submittedLoginError) {
      throw new Error(
        `${label} login was rejected by the identity provider: ${submittedLoginError}. Last page: ${await currentPageSummary(page)}.`,
      )
    }
  }

  try {
    await expect
      .poll(() => isSessionAuthenticated(page), {
        message: `Expected ${label} login to establish a LEXIS session.`,
        timeout: LOGIN_SESSION_TIMEOUT_MS,
      })
      .toBe(true)
  } catch {
    throw new Error(
      `${label} login did not establish a LEXIS session. Last page: ${await currentPageSummary(page)}. ${await authDiagnostics(page)}.`,
    )
  }
}

export const loginWithIdir = async (page: Page): Promise<void> => {
  await loginWithConfig(page, idirLoginConfig)
}

export const collectApiServerErrors = (page: Page): string[] => {
  const errors: string[] = []
  page.on('response', (response) => {
    const url = response.url()
    const status = response.status()
    if (url.includes('/api/lexis/') && status >= 500) {
      errors.push(`${status} ${redactedUrlForLog(url)}`)
    }
  })
  return errors
}

const navigateSpaRoute = async (page: Page, path: string): Promise<void> => {
  await page.goto(new URL(path, E2E_BASE_URL).toString(), {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  })
}

export const expectAccessiblePage = async (
  page: Page,
  path: string,
  heading: RegExp | string,
): Promise<void> => {
  await navigateSpaRoute(page, path)
  await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible({
    timeout: 30_000,
  })
  await expect(page.getByRole('heading', { name: 'Unauthorized' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: '404' })).toHaveCount(0)
}

export const postWithCsrf = async (
  page: Page,
  path: string,
  options: PostWithCsrfOptions = {},
): Promise<APIResponse> => {
  return page.request.post(path, {
    ...options,
    headers: {
      ...options.headers,
      ...(await authHeaders(page)),
    },
    failOnStatusCode: false,
  })
}

export const putWithCsrf = async (
  page: Page,
  path: string,
  options: PostWithCsrfOptions = {},
): Promise<APIResponse> => {
  return page.request.put(path, {
    ...options,
    headers: {
      ...options.headers,
      ...(await authHeaders(page)),
    },
    failOnStatusCode: false,
  })
}

export const deleteWithCsrf = async (
  page: Page,
  path: string,
  options: {
    params?: Record<string, string>
    headers?: Record<string, string>
  } = {},
): Promise<APIResponse> => {
  return page.request.delete(path, {
    ...options,
    headers: {
      ...options.headers,
      ...(await authHeaders(page)),
    },
    failOnStatusCode: false,
  })
}

export const expectInvalidApplicationCreateValidation = async (
  response: APIResponse,
): Promise<void> => {
  const responseText = await response.text()
  expect(response.status(), redactedTextSnippet(responseText)).toBe(200)

  const payload = JSON.parse(responseText) as ValidationResponse
  const errors = Array.isArray(payload.errors) ? payload.errors.map(String) : []
  const normalizedErrors = errors.join(' ').toLowerCase()

  expect(payload.valid ?? payload.success).toBe(false)
  expect(payload.applicationNumber ?? null).toBeNull()
  expect(normalizedErrors).toContain('application date')
  expect(normalizedErrors).toContain('application owner number')
}
