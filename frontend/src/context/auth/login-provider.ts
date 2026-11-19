import type { LoginProvider } from '@/context/auth/types'

const PENDING_LOGIN_PROVIDER_KEY = 'lexis.pending-login-provider'
const LAST_LOGIN_PROVIDER_KEY = 'lexis.last-login-provider'
const AUTOMATIC_LOGIN_ATTEMPTED_KEY = 'lexis.automatic-login-attempted'

const isLoginProvider = (value: string | null): value is LoginProvider =>
  value === 'idir' || value === 'business-bceid'

// The remembered provider is optional: without storage, a new tab shows the login page.
const readLastLoginProvider = (): string | null => {
  try {
    return window.localStorage.getItem(LAST_LOGIN_PROVIDER_KEY)
  } catch {
    return null
  }
}

/** The provider a sign-in starts with, kept in this tab until the sign-in completes. */
export const setPendingLoginProvider = (provider: LoginProvider): void => {
  window.sessionStorage.setItem(PENDING_LOGIN_PROVIDER_KEY, provider)
}

/** Remembers a completed sign-in's provider for other tabs. It holds no token. */
export const rememberCompletedLoginProvider = (): void => {
  const provider = window.sessionStorage.getItem(PENDING_LOGIN_PROVIDER_KEY)
  window.sessionStorage.removeItem(PENDING_LOGIN_PROVIDER_KEY)
  window.sessionStorage.removeItem(AUTOMATIC_LOGIN_ATTEMPTED_KEY)
  if (!isLoginProvider(provider)) return
  try {
    window.localStorage.setItem(LAST_LOGIN_PROVIDER_KEY, provider)
  } catch {
    // Without storage, a new tab shows the login page.
  }
}

/** Signing out or an expired session ends automatic sign-in for every tab. */
export const forgetLoginProvider = (): void => {
  window.sessionStorage.removeItem(PENDING_LOGIN_PROVIDER_KEY)
  try {
    window.localStorage.removeItem(LAST_LOGIN_PROVIDER_KEY)
  } catch {
    // Nothing was remembered.
  }
}

/** The provider a signed-out tab signs in with by itself. A tab tries once, so Back shows the login page. */
export const automaticLoginProvider = (): LoginProvider | null => {
  if (window.sessionStorage.getItem(AUTOMATIC_LOGIN_ATTEMPTED_KEY)) return null
  const provider = readLastLoginProvider()
  return isLoginProvider(provider) ? provider : null
}

export const markAutomaticLoginAttempted = (): void => {
  window.sessionStorage.setItem(AUTOMATIC_LOGIN_ATTEMPTED_KEY, 'true')
}
