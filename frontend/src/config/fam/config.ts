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

const userPoolId = env.VITE_USER_POOLS_ID?.trim() ?? ''
const userPoolClientId = env.VITE_USER_POOLS_WEB_CLIENT_ID?.trim() ?? ''
const domain = env.VITE_COGNITO_DOMAIN?.trim()?.replace(/^https?:\/\//, '') ?? ''
const redirectSignIn = env.VITE_REDIRECT_SIGN_IN?.trim() || `${window.location.origin}/dashboard`
const redirectSignOut = env.VITE_REDIRECT_SIGN_OUT?.trim() || window.location.origin
const scopes = resolveScopes(splitScopes(env.VITE_COGNITO_SCOPES))

export const idirProviderName = `${(env.VITE_ZONE ?? 'DEV').toUpperCase()}-IDIR`

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
