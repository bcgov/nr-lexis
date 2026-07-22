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
// External logoff URL registered in the Cognito app client. The return URL
// should point back to this app's public /logout route.
export const redirectSignOut = env.VITE_REDIRECT_SIGN_OUT?.trim() || `${window.location.origin}/`
const scopes = resolveScopes(splitScopes(env.VITE_COGNITO_SCOPES))

const zone = (env.VITE_ZONE ?? 'DEV').trim().toUpperCase()
const providerPrefix = zone === 'PROD' ? '' : `${zone}-`

export const idirProviderName = `${providerPrefix}IDIR`
export const businessBceidProviderName = `${providerPrefix}BCEIDBUSINESS`

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
