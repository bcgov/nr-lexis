import { env } from '@/env'

const splitScopes = (value: string | undefined): string[] => {
  const raw = value?.trim()
  if (!raw) {
    return []
  }
  return raw.split(/[\s+,]+/).filter((scope) => scope.length > 0)
}

const resolveScopes = (explicit: string[], fallback?: string[]): string[] => {
  if (explicit.length > 0) {
    return explicit
  }
  if (fallback && fallback.length > 0) {
    return fallback
  }
  return ['openid', 'profile', 'email']
}

const resolveSameOriginRedirect = (value: string | undefined, fallbackPath = ''): string => {
  const configured = value?.trim()

  if (!configured) {
    return `${window.location.origin}${fallbackPath}`
  }

  try {
    const configuredUrl = new URL(configured, window.location.origin)
    return `${window.location.origin}${configuredUrl.pathname}${configuredUrl.search}${configuredUrl.hash}`
  } catch {
    return `${window.location.origin}${fallbackPath}`
  }
}

const userPoolId = env.VITE_USER_POOLS_ID?.trim() ?? ''
const userPoolClientId = env.VITE_USER_POOLS_WEB_CLIENT_ID?.trim() ?? ''
const domain = env.VITE_COGNITO_DOMAIN?.trim()?.replace(/^https?:\/\//, '') ?? ''
const redirectSignIn = resolveSameOriginRedirect(env.VITE_REDIRECT_SIGN_IN, '/')
// Full BC Gov logoff URL registered in the Cognito app client. The returl
// should point back to this app's root rather than chaining through
// LoginProxy's OIDC logout endpoint, which can stop on a logout-confirm page.
export const redirectSignOut = env.VITE_REDIRECT_SIGN_OUT?.trim() || `${window.location.origin}/`
const scopes = resolveScopes(splitScopes(env.VITE_COGNITO_SCOPES))

export const idirProviderName = `${(env.VITE_ZONE ?? 'DEV').toUpperCase()}-IDIR`
export const businessBceidProviderName = `${(env.VITE_ZONE ?? 'DEV').toUpperCase()}-BCEIDBUSINESS`

export const isCognitoConfigured =
  Boolean(userPoolId) && Boolean(userPoolClientId) && Boolean(domain)

const amplifyConfig = isCognitoConfigured
  ? {
      Auth: {
        Cognito: {
          userPoolId,
          userPoolClientId,
          loginWith: {
            oauth: {
              domain,
              scopes,
              redirectSignIn: [redirectSignIn],
              redirectSignOut: [redirectSignOut],
              responseType: 'code' as const,
            },
          },
        },
      },
    }
  : {}

export default amplifyConfig
