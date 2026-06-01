import { env } from '@/env'

type ParsedLoginConfig = {
  clientId: string
  domain: string
  redirectSignIn: string
  scopes: string[]
}

const parseLoginUrl = (value: string | undefined): ParsedLoginConfig | null => {
  const raw = value?.trim()
  if (!raw) {
    return null
  }

  try {
    const loginUrl = new URL(raw)
    const clientId = loginUrl.searchParams.get('client_id')?.trim() ?? ''
    const redirectSignIn =
      loginUrl.searchParams.get('redirect_uri')?.trim() ?? `${window.location.origin}/dashboard`
    const scopesRaw = loginUrl.searchParams.get('scope')?.trim() ?? 'openid profile email'
    const scopes = scopesRaw.split(/[\s+]+/).filter((scope) => scope.length > 0)

    if (!clientId || !loginUrl.host) {
      return null
    }

    return {
      clientId,
      domain: loginUrl.host,
      redirectSignIn,
      scopes,
    }
  } catch {
    return null
  }
}

const parseUserPoolId = (issuerUri: string | undefined): string | null => {
  const raw = issuerUri?.trim()
  if (!raw) {
    return null
  }

  try {
    const issuer = new URL(raw)
    const segments = issuer.pathname.split('/').filter((segment) => segment.length > 0)
    return segments.at(-1) ?? null
  } catch {
    return null
  }
}

const parsedLoginConfig = parseLoginUrl(env.VITE_LOGIN_URL)
const userPoolId = parseUserPoolId(env.VITE_AWS_COGNITO_ISSUER_URI ?? env.AWS_COGNITO_ISSUER_URI)
const redirectSignOut = env.VITE_LOGOUT_URL?.trim() ?? ''

export const isCognitoConfigured =
  Boolean(userPoolId) && Boolean(parsedLoginConfig?.clientId) && Boolean(parsedLoginConfig?.domain)

const amplifyConfig = isCognitoConfigured
  ? {
      Auth: {
        Cognito: {
          userPoolId: userPoolId!,
          userPoolClientId: parsedLoginConfig!.clientId,
          loginWith: {
            oauth: {
              domain: parsedLoginConfig!.domain,
              scopes: parsedLoginConfig!.scopes,
              redirectSignIn: [parsedLoginConfig!.redirectSignIn],
              redirectSignOut: [redirectSignOut || window.location.origin],
              responseType: 'code' as const,
            },
          },
        },
      },
    }
  : {}

export default amplifyConfig
