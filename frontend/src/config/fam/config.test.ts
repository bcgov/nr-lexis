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

describe('FAM auth config', () => {
  beforeEach(() => {
    window.config = { ...configuredRuntimeAuth }
  })

  afterEach(() => {
    window.config = {}
  })

  it('keeps sign-in on the current origin and preserves the configured sign-out URL', async () => {
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
    expect(oauth?.redirectSignOut).toEqual([logoffUrl])
  })

  it('keeps sign-out blank when redirect values are blank', async () => {
    const config = await loadConfig()
    const oauth = config.Auth?.Cognito?.loginWith?.oauth

    expect(oauth?.redirectSignIn).toEqual([`${window.location.origin}/`])
    expect(oauth?.redirectSignOut).toEqual([''])
  })
})
