import { UserManager, WebStorageStateStore, type User } from 'oidc-client-ts'
import { env } from '@/env'
import type { LoginProvider } from '@/context/auth/types'

export const AUTH_CALLBACK_PATH = '/authCallback'
export const isOidcConfigured = Boolean(
  env.VITE_OIDC_ISSUER_URI?.trim() && env.VITE_OIDC_CLIENT_ID?.trim(),
)

let manager: UserManager | undefined
let generation = 0
let signedOut = false
let renewal: Promise<User | null> | undefined
let callback: Promise<User> | undefined
let logout: Promise<void> | undefined

export const getUserManager = (): UserManager => {
  if (!manager) {
    manager = new UserManager({
      authority: env.VITE_OIDC_ISSUER_URI?.trim() ?? '',
      client_id: env.VITE_OIDC_CLIENT_ID?.trim() ?? '',
      redirect_uri: `${window.location.origin}${AUTH_CALLBACK_PATH}`,
      post_logout_redirect_uri: window.location.origin,
      response_type: 'code',
      scope: 'openid profile email',
      userStore: new WebStorageStateStore({ store: window.sessionStorage }),
      stateStore: new WebStorageStateStore({ store: window.sessionStorage }),
      automaticSilentRenew: false,
      loadUserInfo: false,
    })
  }
  return manager
}

// Provider bootstrap, API requests, activity and "Stay logged in" all use this
// renewal. A rotating refresh token must never be spent by competing callers.
export const getOidcUser = async ({
  forceRefresh = false,
}: { forceRefresh?: boolean } = {}): Promise<User | null> => {
  if (!isOidcConfigured || signedOut) return null
  const started = generation
  if (renewal) return renewal
  const user = await getUserManager().getUser()
  if (started !== generation || signedOut || !user) return null
  if (!forceRefresh && user.expires_in !== undefined && user.expires_in > 60) return user
  if (renewal) return renewal

  const attempt = (async () => {
    if (!user.refresh_token) throw new Error('The session cannot be renewed.')
    const refreshed = await getUserManager().signinSilent()
    if (started !== generation || signedOut) {
      // oidc-client-ts stores the result before resolving. Remove a late result
      // as well as refusing to publish it after logout.
      await logout?.catch(() => undefined)
      await getUserManager().removeUser()
      return null
    }
    return refreshed
  })()
  renewal = attempt
  try {
    return await attempt
  } finally {
    if (renewal === attempt) renewal = undefined
  }
}

export const startOidcLogin = async (provider: LoginProvider): Promise<void> => {
  if (!isOidcConfigured) throw new Error('LEXIS login is not configured.')
  // Finish discarding any renewal from the previous session before another
  // login can write credentials to the same store.
  await renewal?.catch(() => null)
  signedOut = false
  logout = undefined
  await getUserManager().signinRedirect({
    extraQueryParams: {
      kc_idp_hint:
        provider === 'business-bceid'
          ? env.VITE_OIDC_BCEID_HINT?.trim() || 'bceidbusiness'
          : env.VITE_OIDC_IDIR_HINT?.trim() || 'azureidir',
    },
  })
}

// Shared across React StrictMode/remounts: an authorization code is single-use.
// A failed exchange (a spent or replayed state, e.g. Back after login) stores
// nothing, so it must not clear a session that is already stored.
export const completeOidcLogin = (): Promise<User> => {
  if (!callback) {
    const started = generation
    callback = (async () => {
      const user = await getUserManager().signinRedirectCallback()
      if (started !== generation || signedOut) {
        await getUserManager().removeUser()
        throw new Error('The session ended during login.')
      }
      return user
    })()
  }
  return callback
}

// Built from the configured realm rather than discovered, so sign-out never
// waits on a network request that can fail. Keycloak ending its session does
// not end the SiteMinder session behind Business BCeID, so when configured the
// browser logs off there first and SiteMinder returns it to Keycloak.
const buildEndSessionUrl = (idTokenHint?: string): string => {
  const issuer = env.VITE_OIDC_ISSUER_URI?.trim().replace(/\/+$/, '') ?? ''
  const params = new URLSearchParams({
    client_id: env.VITE_OIDC_CLIENT_ID?.trim() ?? '',
    post_logout_redirect_uri: window.location.origin,
  })
  if (idTokenHint) params.set('id_token_hint', idTokenHint)
  const keycloakLogoutUrl = `${issuer}/protocol/openid-connect/logout?${params}`
  const siteminderLogoutUrl = env.VITE_OIDC_SITEMINDER_LOGOUT_URL?.trim()
  return siteminderLogoutUrl
    ? `${siteminderLogoutUrl}?retnow=1&returl=${encodeURIComponent(keycloakLogoutUrl)}`
    : keycloakLogoutUrl
}

// Resolves once the browser is navigating away, so a renewal that finishes
// during sign-out can still discard what it stored before the page unloads.
export const endOidcSession = (
  navigate: (url: string) => void = (url) => window.location.assign(url),
): Promise<void> => {
  if (logout) return logout
  signedOut = true
  generation += 1
  logout = (async () => {
    try {
      const user = await getUserManager().getUser()
      const endSessionUrl = buildEndSessionUrl(user?.id_token)
      await getUserManager().removeUser()
      navigate(endSessionUrl)
    } catch (error) {
      await getUserManager()
        .removeUser()
        .catch(() => undefined)
      // Allow another attempt rather than replaying this failure.
      logout = undefined
      throw error
    }
  })()
  return logout
}
