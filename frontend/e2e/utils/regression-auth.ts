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
}

type RealCredentials = {
  username: string
  password: string
}

type LoginConfig = {
  buttonName: RegExp
  label: string
  usernameEnv: string
  passwordEnv: string
}

const baseOrigin = new URL(E2E_BASE_URL).origin
const CREDENTIAL_SCREEN_TIMEOUT_MS = 5_000
const LOGIN_SESSION_TIMEOUT_MS = 30_000

const idirLoginConfig: LoginConfig = {
  buttonName: /log in with idir/i,
  label: 'IDIR',
  usernameEnv: 'E2E_IDIR_USER',
  passwordEnv: 'E2E_IDIR_PASSWORD',
}

const businessBceidLoginConfig: LoginConfig = {
  buttonName: /log in with business bceid/i,
  label: 'Business BCeID',
  usernameEnv: 'E2E_BCEID_USER',
  passwordEnv: 'E2E_BCEID_PASSWORD',
}

const hasCredentials = ({ usernameEnv, passwordEnv }: LoginConfig): boolean =>
  Boolean(process.env[usernameEnv]?.trim() && process.env[passwordEnv]?.trim())

export const hasIdirCredentials = (): boolean => hasCredentials(idirLoginConfig)

export const hasBusinessBceidCredentials = (): boolean => hasCredentials(businessBceidLoginConfig)

const credentials = ({ usernameEnv, passwordEnv }: LoginConfig): RealCredentials => {
  return {
    username: process.env[usernameEnv]?.trim() ?? '',
    password: process.env[passwordEnv] ?? '',
  }
}

const isSessionAuthenticated = async (page: Page): Promise<boolean> => {
  const response = await page.request
    .get('/api/lexis/session/capabilities', { failOnStatusCode: false })
    .catch(() => null)

  if (!response?.ok()) {
    return false
  }

  const payload = (await response.json().catch(() => null)) as SessionCapabilities | null
  return Boolean(payload?.authenticated)
}

export const fetchSessionCapabilities = async (page: Page): Promise<SessionCapabilities> => {
  const response = await page.request.get('/api/lexis/session/capabilities', {
    failOnStatusCode: false,
  })
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

const fillCredentialScreen = async (
  page: Page,
  username: string,
  password: string,
): Promise<boolean> => {
  const [usernameInput, passwordInput] = await Promise.all([
    firstVisible(
      page,
      'input[name*="user" i], input[id*="user" i], input[type="email"], input[type="text"]',
      CREDENTIAL_SCREEN_TIMEOUT_MS,
    ),
    firstVisible(page, 'input[type="password"]', CREDENTIAL_SCREEN_TIMEOUT_MS),
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

  const submitButton = page
    .getByRole('button', { name: /log in|login|sign in|continue|submit/i })
    .first()
  if (await submitButton.isVisible({ timeout: 5000 }).catch(() => false)) {
    await submitButton.click()
  } else if (passwordInput) {
    await passwordInput.press('Enter')
  } else if (usernameInput) {
    await usernameInput.press('Enter')
  }

  await page.waitForLoadState('domcontentloaded').catch(() => undefined)
  return true
}

const loginWithConfig = async (page: Page, config: LoginConfig): Promise<void> => {
  const { buttonName, label } = config
  const { username, password } = credentials(config)
  await page.goto('/', { waitUntil: 'domcontentloaded' })

  if (await isSessionAuthenticated(page)) {
    return
  }

  await page.getByRole('button', { name: buttonName }).click()
  await page.waitForLoadState('domcontentloaded').catch(() => undefined)

  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (await isSessionAuthenticated(page)) {
      return
    }

    const filled = await fillCredentialScreen(page, username, password)
    if (!filled && page.url().startsWith(baseOrigin)) {
      break
    }

    await page.waitForTimeout(1000)
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
      `${label} login did not establish a LEXIS session. Last page: ${await currentPageSummary(page)}.`,
    )
  }
}

export const loginWithIdir = async (page: Page): Promise<void> => {
  await loginWithConfig(page, idirLoginConfig)
}

export const loginWithBusinessBceid = async (page: Page): Promise<void> => {
  await loginWithConfig(page, businessBceidLoginConfig)
}

export const collectApiServerErrors = (page: Page): string[] => {
  const errors: string[] = []
  page.on('response', (response) => {
    const url = response.url()
    const status = response.status()
    if (url.includes('/api/lexis/') && status >= 500) {
      errors.push(`${status} ${url}`)
    }
  })
  return errors
}

export const expectAccessiblePage = async (
  page: Page,
  path: string,
  heading: RegExp | string,
): Promise<void> => {
  await page.goto(path, { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: heading })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Unauthorized' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: '404' })).toHaveCount(0)
}

export const expectRouteUnauthorized = async (page: Page, path: string): Promise<void> => {
  await page.goto(path, { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Unauthorized' })).toBeVisible()
}

const csrfHeaders = async (page: Page): Promise<Record<string, string>> => {
  const cookies = await page.context().cookies()
  const xsrfCookie = cookies.find((cookie) => cookie.name === 'XSRF-TOKEN')
  return xsrfCookie ? { 'X-XSRF-TOKEN': decodeURIComponent(xsrfCookie.value) } : {}
}

export const postWithCsrf = async (
  page: Page,
  path: string,
  options: PostWithCsrfOptions = {},
): Promise<APIResponse> => {
  return page.request.post(path, {
    ...options,
    headers: await csrfHeaders(page),
    failOnStatusCode: false,
  })
}

export const deleteWithCsrf = async (
  page: Page,
  path: string,
  options: {
    params?: Record<string, string>
  } = {},
): Promise<APIResponse> => {
  return page.request.delete(path, {
    ...options,
    headers: await csrfHeaders(page),
    failOnStatusCode: false,
  })
}

export const expectForbiddenPost = async (
  page: Page,
  path: string,
  options: PostWithCsrfOptions = {},
): Promise<void> => {
  const response = await postWithCsrf(page, path, options)
  expect(response.status(), `${path} should be forbidden for this user`).toBe(403)
}

export const expectInvalidApplicationCreateValidation = async (
  response: APIResponse,
): Promise<void> => {
  const responseText = await response.text()
  expect(response.status(), responseText.slice(0, 500)).toBe(200)

  const payload = JSON.parse(responseText) as ValidationResponse
  const errors = Array.isArray(payload.errors) ? payload.errors.map(String) : []
  const normalizedErrors = errors.join(' ').toLowerCase()

  expect(payload.valid ?? payload.success).toBe(false)
  expect(payload.applicationNumber ?? null).toBeNull()
  expect(normalizedErrors).toContain('application date')
  expect(normalizedErrors).toContain('application owner number')
}
