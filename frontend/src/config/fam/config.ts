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

const resolveSignOutRedirect = (value: string | undefined): string => {
  const configured = value?.trim()

  if (!configured) {
    return ''
  }

  try {
    const logoffUrl = new URL(configured)
    const returl = logoffUrl.searchParams.get('returl')

    if (!returl) {
      return configured
    }

    const providerLogoutUrl = new URL(returl)
    if (providerLogoutUrl.searchParams.has('redirect_uri')) {
      providerLogoutUrl.searchParams.set('redirect_uri', `${window.location.origin}/`)
      logoffUrl.searchParams.set('returl', providerLogoutUrl.toString())
    }

    return logoffUrl.toString()
  } catch {
    return configured
  }
}

const userPoolId = env.VITE_USER_POOLS_ID?.trim() ?? ''
const userPoolClientId = env.VITE_USER_POOLS_WEB_CLIENT_ID?.trim() ?? ''
const domain = env.VITE_COGNITO_DOMAIN?.trim()?.replace(/^https?:\/\//, '') ?? ''
const redirectSignIn = resolveSameOriginRedirect(env.VITE_REDIRECT_SIGN_IN, '/')
// Full BC Gov logoff chain URL. This must match one of the Cognito allowed
// sign-out URLs for the current environment.
export const redirectSignOut = resolveSignOutRedirect(env.VITE_REDIRECT_SIGN_OUT)
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
