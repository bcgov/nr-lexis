import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type AmplifyConfig = {
  Auth?: {
    Cognito?: {
      loginWith?: {
        oauth?: {
          redirectSignIn: string[]
          redirectSignOut: string[]
        }
      }
    }
  }
}

const configuredRuntimeAuth = {
  VITE_USER_POOLS_ID: 'ca-central-1_testpool',
  VITE_USER_POOLS_WEB_CLIENT_ID: 'test-client-id',
  VITE_COGNITO_DOMAIN: 'test.auth.ca-central-1.amazoncognito.com',
  VITE_COGNITO_SCOPES: 'openid profile email',
  VITE_ZONE: 'dev',
}

const loadConfig = async (): Promise<AmplifyConfig> => {
  vi.resetModules()
  const configModule = await import('@/config/fam/config')
  return configModule.default as AmplifyConfig
}

const getProviderLogoutRedirectUri = (logoffUrl: string): string | null => {
  const configuredLogoffUrl = new URL(logoffUrl)
  const providerLogoutUrl = configuredLogoffUrl.searchParams.get('returl')

  if (!providerLogoutUrl) {
    return null
  }

  return new URL(providerLogoutUrl).searchParams.get('post_logout_redirect_uri')
}

describe('FAM auth config', () => {
  beforeEach(() => {
    window.config = { ...configuredRuntimeAuth }
  })

  afterEach(() => {
    window.config = {}
  })

  it('keeps sign-in on the current origin and points logoff back to the app root', async () => {
    const logoffUrl =
      'https://logontest7.gov.bc.ca/clp-cgi/logoff.cgi?retnow=1&returl=https://test.loginproxy.gov.bc.ca/auth/realms/standard/protocol/openid-connect/logout?redirect_uri=https://nr-lexis-dev.apps.silver.devops.gov.bc.ca/'
    window.config = {
      ...configuredRuntimeAuth,
      VITE_REDIRECT_SIGN_IN: 'https://nr-lexis-dev.apps.silver.devops.gov.bc.ca/',
      VITE_REDIRECT_SIGN_OUT: logoffUrl,
    }

    const config = await loadConfig()
    const oauth = config.Auth?.Cognito?.loginWith?.oauth

    expect(oauth?.redirectSignIn).toEqual([`${window.location.origin}/`])
    expect(getProviderLogoutRedirectUri(oauth?.redirectSignOut[0] ?? '')).toBe(
      `${window.location.origin}/`,
    )
  })

  it('leaves sign-out blank when no runtime sign-out URL is configured', async () => {
    const config = await loadConfig()
    const oauth = config.Auth?.Cognito?.loginWith?.oauth

    expect(oauth?.redirectSignIn).toEqual([`${window.location.origin}/`])
    expect(oauth?.redirectSignOut).toEqual([''])
  })

  it('normalizes the configured BC Gov sign-out URL before Cognito logout', async () => {
    const signOutUrl =
      ' https://logontest7.gov.bc.ca/clp-cgi/logoff.cgi?retnow=1&returl=https%3A%2F%2Ftest.loginproxy.gov.bc.ca%2Fauth%2Frealms%2Fstandard%2Fprotocol%2Fopenid-connect%2Flogout%3Fredirect_uri%3Dhttps%253A%252F%252Fnr-lexis-test.apps.silver.devops.gov.bc.ca '
    window.config = {
      ...configuredRuntimeAuth,
      VITE_REDIRECT_SIGN_OUT: signOutUrl,
    }

    const config = await loadConfig()
    const oauth = config.Auth?.Cognito?.loginWith?.oauth

    expect(oauth?.redirectSignOut[0]).toContain('https://logontest7.gov.bc.ca')
    expect(getProviderLogoutRedirectUri(oauth?.redirectSignOut[0] ?? '')).toBe(
      `${window.location.origin}/`,
    )
  })
})
