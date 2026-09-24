import type { Locator, Page, Response } from '@playwright/test'
import { FRONTEND_RECOVERY_TIMEOUT_MS, gotoWithRecovery } from './navigation'

export const E2E_BASE_URL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:4173'

export const LOCAL_E2E_CLIENT_ID = 'local-e2e-client'
export const LOCAL_E2E_ISSUER_URI = 'https://local-e2e.example.test/auth/realms/standard'
const RUNTIME_CONFIG_REQUEST_TIMEOUT_MS = 10_000
const TRANSIENT_CONFIG_ERROR =
  /\b(?:ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND)\b|socket hang up|apiRequestContext\.get: Timeout \d+ms exceeded/i
const TRANSIENT_GATEWAY_STATUSES = new Set([502, 503, 504])
type RuntimeOidcConfig = { clientId: string; issuer: string }
let cachedRuntimeOidcConfig: RuntimeOidcConfig | undefined

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

const resolveOidcConfig = async (page: Page): Promise<RuntimeOidcConfig> => {
  if (cachedRuntimeOidcConfig) {
    return cachedRuntimeOidcConfig
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
          const runtimeValue = (name: string) =>
            runtimeConfig
              .match(new RegExp(`(?:["']?${name}["']?)\\s*:\\s*["']([^"']+)["']`))?.[1]
              ?.trim()

          cachedRuntimeOidcConfig = {
            clientId:
              runtimeValue('VITE_OIDC_CLIENT_ID') ||
              process.env.VITE_OIDC_CLIENT_ID?.trim() ||
              LOCAL_E2E_CLIENT_ID,
            issuer: (
              runtimeValue('VITE_OIDC_ISSUER_URI') ||
              process.env.VITE_OIDC_ISSUER_URI?.trim() ||
              LOCAL_E2E_ISSUER_URI
            ).replace(/\/$/, ''),
          }
          return cachedRuntimeOidcConfig
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

export const installSyntheticOidcProvider = async (page: Page): Promise<RuntimeOidcConfig> => {
  const { issuer, clientId } = await resolveOidcConfig(page)
  // Discovery and protocol requests stay in the browser's test-only network boundary.
  await page.route(`${issuer}/.well-known/openid-configuration`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': new URL(E2E_BASE_URL).origin },
      body: JSON.stringify({
        issuer,
        authorization_endpoint: `${issuer}/protocol/openid-connect/auth`,
        token_endpoint: `${issuer}/protocol/openid-connect/token`,
        end_session_endpoint: `${issuer}/protocol/openid-connect/logout`,
        jwks_uri: `${issuer}/protocol/openid-connect/certs`,
        response_types_supported: ['code'],
        subject_types_supported: ['public'],
        id_token_signing_alg_values_supported: ['RS256'],
      }),
    })
  })
  return { issuer, clientId }
}

type SyntheticOidcSessionOptions = {
  username: string
  orgUnitNo: string
  issuedAtSeconds?: number
  expiresInSeconds?: number
  refreshToken?: string
}

export type SyntheticOidcSession = RuntimeOidcConfig & {
  storageKey: string
  username: string
  profile: Record<string, unknown>
}

export const installSyntheticOidcSession = async (
  page: Page,
  {
    username,
    orgUnitNo,
    issuedAtSeconds = Math.floor(Date.now() / 1000),
    expiresInSeconds = 60 * 60,
    refreshToken = 'synthetic-refresh-token',
  }: SyntheticOidcSessionOptions,
): Promise<SyntheticOidcSession> => {
  const { clientId, issuer } = await installSyntheticOidcProvider(page)
  const storageKey = `oidc.user:${issuer}:${clientId}`
  const profile = {
    sub: 'synthetic-e2e-user',
    iss: issuer,
    aud: clientId,
    azp: clientId,
    preferred_username: '00000000000000000000000000000001@azureidir',
    identity_provider: 'azureidir',
    idir_username: username,
    idir_user_guid: '00000000000000000000000000000001',
    display_name: username,
    org_unit_no: orgUnitNo,
    client_roles: ['LEXIS_ADMIN'],
    iat: issuedAtSeconds,
    exp: issuedAtSeconds + expiresInSeconds,
  }
  const storedUser = JSON.stringify({
    id_token: createUnsignedToken(profile),
    access_token: createUnsignedToken({ ...profile, typ: 'Bearer' }),
    refresh_token: refreshToken,
    token_type: 'Bearer',
    scope: 'openid profile email',
    profile,
    expires_at: issuedAtSeconds + expiresInSeconds,
  })

  await page.addInitScript(
    ({ key, user, origin }) => {
      if (window.location.origin !== origin) return
      const initializedKey = `${key}.syntheticSessionInitialized`
      // Do not restore a session after the application deliberately clears it on logout.
      if (window.sessionStorage.getItem(initializedKey) === 'true') return
      window.sessionStorage.setItem(initializedKey, 'true')
      window.sessionStorage.setItem(key, user)
    },
    { key: storageKey, user: storedUser, origin: new URL(E2E_BASE_URL).origin },
  )

  return { clientId, issuer, storageKey, username, profile }
}
