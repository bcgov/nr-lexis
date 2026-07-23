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
const configuredSignOutUrl = 'https://nr-lexis-test.apps.gold.devops.gov.bc.ca'

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

  it('keeps sign-in on the current origin and uses the configured app return URL', async () => {
    window.config = {
      ...configuredRuntimeAuth,
      VITE_REDIRECT_SIGN_IN: 'https://nr-lexis-dev.apps.gold.devops.gov.bc.ca/dashboard',
      VITE_REDIRECT_SIGN_OUT: configuredSignOutUrl,
    }

    const config = await loadConfig()
    const oauth = config.Auth?.Cognito?.loginWith?.oauth

    expect(oauth?.redirectSignIn).toEqual([`${window.location.origin}/dashboard`])
    expect(oauth?.redirectSignOut).toEqual([configuredSignOutUrl])
  })

  it('uses the app root sign-out URL when no runtime sign-out URL is configured', async () => {
    const config = await loadConfig()
    const oauth = config.Auth?.Cognito?.loginWith?.oauth

    expect(oauth?.redirectSignIn).toEqual([`${window.location.origin}/`])
    expect(oauth?.redirectSignOut).toEqual([`${window.location.origin}/`])
  })

  it('trims the configured sign-out URL without rewriting it', async () => {
    window.config = {
      ...configuredRuntimeAuth,
      VITE_REDIRECT_SIGN_OUT: ` ${configuredSignOutUrl} `,
    }

    const config = await loadConfig()
    const oauth = config.Auth?.Cognito?.loginWith?.oauth

    expect(oauth?.redirectSignOut).toEqual([configuredSignOutUrl])
  })

  it.each([
    ['dev', 'DEV-IDIR', 'DEV-BCEIDBUSINESS'],
    ['test', 'TEST-IDIR', 'TEST-BCEIDBUSINESS'],
    ['prod', 'IDIR', 'BCEIDBUSINESS'],
  ])('maps %s to its deployed Cognito identity providers', async (zone, idir, businessBceid) => {
    window.config = {
      ...configuredRuntimeAuth,
      VITE_ZONE: zone,
    }
    vi.resetModules()

    const configModule = await import('@/config/fam/config')

    expect(configModule.idirProviderName).toBe(idir)
    expect(configModule.businessBceidProviderName).toBe(businessBceid)
  })
})
