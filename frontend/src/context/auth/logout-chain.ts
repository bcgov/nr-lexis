import { env } from '@/env'

const cognitoTokenKeyPrefix = (): string => {
  return `CognitoIdentityServiceProvider.${env.VITE_USER_POOLS_WEB_CLIENT_ID?.trim() ?? ''}`
}

export const clearStoredCognitoTokens = (): void => {
  const prefix = cognitoTokenKeyPrefix()
  if (prefix.endsWith('.')) {
    return
  }

  try {
    const matchingKeys: string[] = []
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index)
      if (key?.startsWith(prefix)) {
        matchingKeys.push(key)
      }
    }
    matchingKeys.forEach((key) => window.localStorage.removeItem(key))
  } catch {
    // Logout still proceeds when browser storage is unavailable.
  }
}

export const buildFederatedLogoutUrl = (appReturnUrl: string): string | null => {
  const siteminderUrl = env.VITE_LOGOUT_SITEMINDER_URL?.trim()
  const keycloakUrl = env.VITE_LOGOUT_KEYCLOAK_URL?.trim()
  const keycloakClientId = env.VITE_LOGOUT_KEYCLOAK_CLIENT_ID?.trim()
  const cognitoClientId = env.VITE_USER_POOLS_WEB_CLIENT_ID?.trim()
  const cognitoDomain = env.VITE_COGNITO_DOMAIN?.trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '')

  if (!siteminderUrl || !keycloakUrl || !keycloakClientId || !cognitoClientId || !cognitoDomain) {
    return null
  }

  const cognitoLogoutUrl =
    `https://${cognitoDomain}/logout` +
    `?client_id=${encodeURIComponent(cognitoClientId)}` +
    `&logout_uri=${encodeURIComponent(appReturnUrl)}`
  const keycloakLogoutUrl =
    `${keycloakUrl}?client_id=${encodeURIComponent(keycloakClientId)}` +
    `&post_logout_redirect_uri=${encodeURIComponent(cognitoLogoutUrl)}`

  return `${siteminderUrl}?retnow=1&returl=${encodeURIComponent(keycloakLogoutUrl)}`
}

export const startFederatedLogout = (
  appReturnUrl = window.location.origin,
  navigate: (url: string) => void = (url) => window.location.assign(url),
): boolean => {
  const logoutUrl = buildFederatedLogoutUrl(appReturnUrl)
  if (!logoutUrl) {
    return false
  }

  clearStoredCognitoTokens()
  navigate(logoutUrl)
  return true
}
