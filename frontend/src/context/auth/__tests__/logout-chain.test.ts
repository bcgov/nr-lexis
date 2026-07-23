import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildFederatedLogoutUrl,
  clearStoredCognitoTokens,
  startFederatedLogout,
} from '@/context/auth/logout-chain'

const configuredLogout = {
  VITE_USER_POOLS_WEB_CLIENT_ID: 'lexis-client-id',
  VITE_COGNITO_DOMAIN: 'fam.auth.ca-central-1.amazoncognito.com',
  VITE_LOGOUT_SITEMINDER_URL: 'https://logontest7.gov.bc.ca/clp-cgi/logoff.cgi',
  VITE_LOGOUT_KEYCLOAK_URL:
    'https://test.loginproxy.gov.bc.ca/auth/realms/standard/protocol/openid-connect/logout',
  VITE_LOGOUT_KEYCLOAK_CLIENT_ID: 'fam-keycloak-client',
}

describe('federated logout chain', () => {
  beforeEach(() => {
    window.config = { ...configuredLogout }
    window.localStorage.clear()
  })

  afterEach(() => {
    window.config = {}
    window.localStorage.clear()
  })

  it('nests Siteminder, Keycloak, Cognito, and the application return URL', () => {
    const appReturnUrl = 'https://nr-lexis-test.apps.gold.devops.gov.bc.ca'
    const logoutUrl = buildFederatedLogoutUrl(appReturnUrl)

    expect(logoutUrl).not.toBeNull()
    const siteminderLogout = new URL(logoutUrl!)
    expect(`${siteminderLogout.origin}${siteminderLogout.pathname}`).toBe(
      configuredLogout.VITE_LOGOUT_SITEMINDER_URL,
    )
    expect(siteminderLogout.searchParams.get('retnow')).toBe('1')

    const keycloakLogout = new URL(siteminderLogout.searchParams.get('returl')!)
    expect(`${keycloakLogout.origin}${keycloakLogout.pathname}`).toBe(
      configuredLogout.VITE_LOGOUT_KEYCLOAK_URL,
    )
    expect(keycloakLogout.searchParams.get('client_id')).toBe(
      configuredLogout.VITE_LOGOUT_KEYCLOAK_CLIENT_ID,
    )

    const cognitoLogout = new URL(keycloakLogout.searchParams.get('post_logout_redirect_uri')!)
    expect(`${cognitoLogout.origin}${cognitoLogout.pathname}`).toBe(
      `https://${configuredLogout.VITE_COGNITO_DOMAIN}/logout`,
    )
    expect(cognitoLogout.searchParams.get('client_id')).toBe(
      configuredLogout.VITE_USER_POOLS_WEB_CLIENT_ID,
    )
    expect(cognitoLogout.searchParams.get('logout_uri')).toBe(appReturnUrl)
  })

  it('does not start a partial chain when required configuration is missing', () => {
    window.config = {
      ...configuredLogout,
      VITE_LOGOUT_KEYCLOAK_CLIENT_ID: '',
    }
    const navigate = vi.fn()

    expect(startFederatedLogout('https://nr-lexis-test.example', navigate)).toBe(false)
    expect(navigate).not.toHaveBeenCalled()
  })

  it('clears only this Cognito client tokens before navigation', () => {
    const matchingPrefix = `CognitoIdentityServiceProvider.${configuredLogout.VITE_USER_POOLS_WEB_CLIENT_ID}`
    window.localStorage.setItem(`${matchingPrefix}.LastAuthUser`, 'tester')
    window.localStorage.setItem(`${matchingPrefix}.tester.accessToken`, 'access')
    window.localStorage.setItem('CognitoIdentityServiceProvider.other-client.token', 'other')
    const navigate = vi.fn()

    expect(startFederatedLogout('https://nr-lexis-test.example', navigate)).toBe(true)
    expect(navigate).toHaveBeenCalledOnce()
    expect(window.localStorage.getItem(`${matchingPrefix}.LastAuthUser`)).toBeNull()
    expect(window.localStorage.getItem(`${matchingPrefix}.tester.accessToken`)).toBeNull()
    expect(window.localStorage.getItem('CognitoIdentityServiceProvider.other-client.token')).toBe(
      'other',
    )
  })

  it('leaves storage unchanged when no Cognito client is configured', () => {
    window.config = {}
    window.localStorage.setItem('unrelated', 'value')

    clearStoredCognitoTokens()

    expect(window.localStorage.getItem('unrelated')).toBe('value')
  })
})
