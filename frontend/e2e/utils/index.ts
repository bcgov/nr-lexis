import type { Page } from '@playwright/test'

export const E2E_BASE_URL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:4173'

const LOCAL_E2E_CLIENT_ID = 'local-e2e-client'

export const createUnsignedToken = (payload: Record<string, unknown>): string => {
  const encode = (value: Record<string, unknown>) =>
    Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(payload)}.signature`
}

const resolveCognitoClientId = async (page: Page): Promise<string> => {
  const response = await page.request.get(new URL('/config.js', E2E_BASE_URL).toString())
  if (!response.ok()) {
    throw new Error(
      `Unable to load runtime config for synthetic Cognito session (${response.status()}).`,
    )
  }

  const runtimeConfig = await response.text()
  const runtimeClientId = runtimeConfig
    .match(/VITE_USER_POOLS_WEB_CLIENT_ID:\s*"([^"]+)"/)?.[1]
    ?.trim()

  return runtimeClientId || process.env.VITE_USER_POOLS_WEB_CLIENT_ID?.trim() || LOCAL_E2E_CLIENT_ID
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
