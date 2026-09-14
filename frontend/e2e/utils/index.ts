import type { Locator, Page, Response } from '@playwright/test'
import { FRONTEND_RECOVERY_TIMEOUT_MS, gotoWithRecovery } from './navigation'

export const E2E_BASE_URL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:4173'

const LOCAL_E2E_CLIENT_ID = 'local-e2e-client'
const RUNTIME_CONFIG_REQUEST_TIMEOUT_MS = 10_000
const TRANSIENT_CONFIG_ERROR =
  /\b(?:ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND)\b|socket hang up|apiRequestContext\.get: Timeout \d+ms exceeded/i
const TRANSIENT_GATEWAY_STATUSES = new Set([502, 503, 504])
let cachedRuntimeClientId: string | undefined

type GotoOptions = NonNullable<Parameters<Page['goto']>[1]> & { ready: Locator }

export const gotoSyntheticRoute = async (
  page: Page,
  path: string,
  options: GotoOptions,
): Promise<Response | null> =>
  gotoWithRecovery(page, new URL(path, E2E_BASE_URL).toString(), { waitUntil: 'load', ...options })

export const createUnsignedToken = (payload: Record<string, unknown>): string => {
  const encode = (value: Record<string, unknown>) =>
    Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(payload)}.signature`
}

const resolveCognitoClientId = async (page: Page): Promise<string> => {
  if (cachedRuntimeClientId) {
    return cachedRuntimeClientId
  }

  const deadline = Date.now() + FRONTEND_RECOVERY_TIMEOUT_MS
  let attempt = 0
  let lastReason = 'transport failure'

  while (Date.now() < deadline) {
    attempt += 1
    try {
      const response = await page.request.get(new URL('/config.js', E2E_BASE_URL).toString(), {
        timeout: Math.max(1, Math.min(RUNTIME_CONFIG_REQUEST_TIMEOUT_MS, deadline - Date.now())),
      })
      try {
        if (TRANSIENT_GATEWAY_STATUSES.has(response.status())) {
          lastReason = `HTTP ${response.status()}`
        } else {
          if (!response.ok()) throw new Error(`Runtime config returned ${response.status()}.`)
          const runtimeConfig = await response.text()
          const runtimeClientId = runtimeConfig
            .match(/VITE_USER_POOLS_WEB_CLIENT_ID:\s*"([^"]+)"/)?.[1]
            ?.trim()

          cachedRuntimeClientId =
            runtimeClientId ||
            process.env.VITE_USER_POOLS_WEB_CLIENT_ID?.trim() ||
            LOCAL_E2E_CLIENT_ID
          return cachedRuntimeClientId
        }
      } finally {
        await response.dispose()
      }
    } catch (error) {
      // Retry this read-only bootstrap request only for connection failures, never HTTP 4xx.
      if (!TRANSIENT_CONFIG_ERROR.test(String(error))) throw error
      lastReason = 'transport failure'
    }

    const delay = Math.min(
      attempt === 1 ? 5_000 : attempt === 2 ? 10_000 : 20_000,
      deadline - Date.now(),
    )
    if (delay > 0) {
      console.warn(
        `[LEXIS runtime config] ${new Date().toISOString()} attempt ${attempt}: ${lastReason}; retry in ${delay}ms`,
      )
      await page.waitForTimeout(delay)
    }
  }

  throw new Error(
    `LEXIS runtime config did not recover within ${FRONTEND_RECOVERY_TIMEOUT_MS / 1_000}s (${attempt} attempts; ${lastReason}).`,
  )
}

type SyntheticCognitoSessionOptions = {
  username: string
  orgUnitNo: string
  issuedAtSeconds?: number
  expiresInSeconds?: number
  refreshToken?: string
}

export type SyntheticCognitoSession = {
  clientId: string
  storagePrefix: string
  username: string
}

export const installSyntheticCognitoSession = async (
  page: Page,
  {
    username,
    orgUnitNo,
    issuedAtSeconds = Math.floor(Date.now() / 1000),
    expiresInSeconds = 60 * 60,
    refreshToken = 'synthetic-refresh-token',
  }: SyntheticCognitoSessionOptions,
): Promise<SyntheticCognitoSession> => {
  const clientId = await resolveCognitoClientId(page)
  const storagePrefix = `CognitoIdentityServiceProvider.${clientId}`
  const accessToken = createUnsignedToken({
    sub: 'synthetic-e2e-user',
    username,
    client_id: clientId,
    token_use: 'access',
    iat: issuedAtSeconds,
    exp: issuedAtSeconds + expiresInSeconds,
  })
  const idToken = createUnsignedToken({
    sub: 'synthetic-e2e-user',
    'custom:org_unit_no': orgUnitNo,
    token_use: 'id',
    iat: issuedAtSeconds,
    exp: issuedAtSeconds + expiresInSeconds,
  })

  await page.addInitScript(
    ({ prefix, storageUsername, storedAccessToken, storedIdToken, storedRefreshToken }) => {
      const initializedKey = `${prefix}.syntheticSessionInitialized`
      // Do not restore synthetic tokens after the application deliberately clears them on logout.
      if (window.sessionStorage.getItem(initializedKey) === 'true') {
        return
      }
      window.sessionStorage.setItem(initializedKey, 'true')
      window.localStorage.setItem(`${prefix}.LastAuthUser`, storageUsername)
      window.localStorage.setItem(`${prefix}.${storageUsername}.accessToken`, storedAccessToken)
      window.localStorage.setItem(`${prefix}.${storageUsername}.idToken`, storedIdToken)
      window.localStorage.setItem(`${prefix}.${storageUsername}.refreshToken`, storedRefreshToken)
      window.localStorage.setItem(`${prefix}.${storageUsername}.clockDrift`, '0')
    },
    {
      prefix: storagePrefix,
      storageUsername: username,
      storedAccessToken: accessToken,
      storedIdToken: idToken,
      storedRefreshToken: refreshToken,
    },
  )

  return { clientId, storagePrefix, username }
}
