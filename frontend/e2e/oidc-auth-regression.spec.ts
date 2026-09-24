import { createHash } from 'node:crypto'
import { expect, test } from '@playwright/test'
import {
  createUnsignedToken,
  E2E_BASE_URL,
  gotoSyntheticRoute,
  installSyntheticOidcProvider,
} from './utils'

// Exercise the real public callback and oidc-client-ts exchange. Only the identity
// provider and backend responses are synthetic; no application auth bypass is used.
for (const provider of [
  { button: /log in with idir/i, hint: 'azureidir', label: 'IDIR' },
  { button: /log in with business bceid/i, hint: 'bceidbusiness', label: 'Business BCeID' },
]) {
  test(`OIDC ${provider.label} login completes PKCE and stores a tab-scoped session`, async ({
    page,
  }) => {
    const { issuer, clientId } = await installSyntheticOidcProvider(page)
    const origin = new URL(E2E_BASE_URL).origin
    let codeChallenge = ''
    let nonce: string | null = null
    let exchanges = 0
    let authenticated = false
    let exchangedAccessToken = ''
    let authenticatedCapabilityRequests = 0

    await page.route(`${issuer}/protocol/openid-connect/auth**`, async (route) => {
      const request = new URL(route.request().url())
      expect(request.searchParams.get('client_id')).toBe(clientId)
      expect(request.searchParams.get('response_type')).toBe('code')
      expect(request.searchParams.get('redirect_uri')).toBe(`${origin}/authCallback`)
      expect(request.searchParams.get('kc_idp_hint')).toBe(provider.hint)
      expect(request.searchParams.get('code_challenge_method')).toBe('S256')
      codeChallenge = request.searchParams.get('code_challenge') ?? ''
      nonce = request.searchParams.get('nonce')
      expect(codeChallenge).not.toBe('')
      const callback = new URL('/authCallback', origin)
      callback.searchParams.set('state', request.searchParams.get('state')!)
      callback.searchParams.set('code', 'synthetic-authorization-code')
      await route.fulfill({ status: 302, headers: { location: callback.toString() }, body: '' })
    })

    await page.route(`${issuer}/protocol/openid-connect/token`, async (route) => {
      const request = new URLSearchParams(route.request().postData() ?? '')
      expect(request.get('grant_type')).toBe('authorization_code')
      expect(request.get('client_id')).toBe(clientId)
      expect(request.get('code')).toBe('synthetic-authorization-code')
      expect(request.get('redirect_uri')).toBe(`${origin}/authCallback`)
      expect(createHash('sha256').update(request.get('code_verifier')!).digest('base64url')).toBe(
        codeChallenge,
      )
      expect(request.has('client_secret')).toBe(false)
      exchanges += 1
      authenticated = true
      const now = Math.floor(Date.now() / 1000)
      const profile = {
        sub: 'synthetic-login-user',
        iss: issuer,
        aud: clientId,
        azp: clientId,
        iat: now,
        exp: now + 300,
        identity_provider: provider.hint,
        client_roles: [
          provider.hint === 'azureidir'
            ? 'LEXIS_ADMIN'
            : 'LEXIS_PROVINCIAL_SUBMITTER_FOREST_CLIENT-00001234',
        ],
        ...(nonce ? { nonce } : {}),
        ...(provider.hint === 'azureidir'
          ? { idir_username: 'OIDC.TEST', idir_user_guid: '00000000000000000000000000000001' }
          : {
              bceid_username: 'OIDC.TEST',
              bceid_user_guid: '00000000000000000000000000000002',
              bceid_business_guid: '00000000000000000000000000000003',
            }),
      }
      exchangedAccessToken = createUnsignedToken({ ...profile, typ: 'Bearer' })
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': origin },
        body: JSON.stringify({
          access_token: exchangedAccessToken,
          id_token: createUnsignedToken(profile),
          refresh_token: 'synthetic-refresh-token',
          token_type: 'Bearer',
          scope: 'openid profile email',
          expires_in: 300,
        }),
      })
    })

    await page.route('**/api/lexis/**', async (route) => {
      const pathname = new URL(route.request().url()).pathname
      if (authenticated && pathname === '/api/lexis/session/capabilities') {
        expect(route.request().headers().authorization).toBe(`Bearer ${exchangedAccessToken}`)
        authenticatedCapabilityRequests += 1
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          pathname === '/api/lexis/session/capabilities'
            ? {
                authenticated,
                principal: authenticated ? 'OIDC.TEST' : null,
                roles: authenticated
                  ? [provider.hint === 'azureidir' ? 'ADMIN' : 'PROVINCIAL_SUBMITTER_00001234']
                  : [],
                forestClientNumber: provider.hint === 'bceidbusiness' ? '00001234' : null,
                availableForestClientNumbers: provider.hint === 'bceidbusiness' ? ['00001234'] : [],
                forestClientSelectionRequired: false,
                welcomeTarget: authenticated ? '/provincial/application' : null,
                grantedActions: authenticated ? ['/applicationSearch'] : [],
              }
            : { results: [], total: 0, page: 0, size: 25 },
        ),
      })
    })

    // IDIR admin's normal landing is review; a protected search link must survive login.
    await gotoSyntheticRoute(page, '/provincial/application', {
      ready: page.getByRole('button', { name: provider.button }),
    })
    await page.getByRole('button', { name: provider.button }).click()
    await expect(
      page.getByRole('heading', { level: 1, name: 'Provincial application search' }),
    ).toBeVisible()
    await expect(page).toHaveURL(`${origin}/provincial/application`)
    expect(exchanges).toBe(1)
    expect(authenticatedCapabilityRequests).toBeGreaterThan(0)
    const storedSession = await page.evaluate(
      (key) => ({
        session: JSON.parse(sessionStorage.getItem(key)!),
        persistent: localStorage.getItem(key),
      }),
      `oidc.user:${issuer}:${clientId}`,
    )
    expect(storedSession.session.profile.identity_provider).toBe(provider.hint)
    expect(storedSession.session.refresh_token).toBe('synthetic-refresh-token')
    expect(storedSession.persistent).toBeNull()
  })
}
