import { expect, test, type APIResponse } from '@playwright/test'
import { loginWithIdir } from './utils/regression-auth'

// Exercise the real helper using intercepted pages and synthetic credentials only.
test.describe('federated login timing', () => {
  let previousUser: string | undefined
  let previousPassword: string | undefined

  test.beforeEach(() => {
    previousUser = process.env.E2E_IDIR_USER
    previousPassword = process.env.E2E_IDIR_PASSWORD
    process.env.E2E_IDIR_USER = 'synthetic-user'
    process.env.E2E_IDIR_PASSWORD = 'synthetic-password'
  })

  test.afterEach(() => {
    if (previousUser === undefined) delete process.env.E2E_IDIR_USER
    else process.env.E2E_IDIR_USER = previousUser
    if (previousPassword === undefined) delete process.env.E2E_IDIR_PASSWORD
    else process.env.E2E_IDIR_PASSWORD = previousPassword
  })

  for (const scenario of [
    'late form',
    'slow submission',
    'split credentials',
    'rejected credentials',
  ]) {
    test(scenario, async ({ page }) => {
      let submissions = 0
      await page.route('**/*', async (route) => {
        await route.fulfill({
          contentType: 'text/html',
          body: `<div id="root"><button data-testid="landing-button__idir">Log in with IDIR</button></div>
            <script>
              const root = document.getElementById('root')
              const scenario = ${JSON.stringify(scenario)}
              const form = (passwordOnly = false) => {
                root.innerHTML = '<form>' +
                  (passwordOnly ? '' : '<input name="user">') +
                  (scenario === 'split credentials' && !passwordOnly ? '' : '<input name="password" type="password">') +
                  '<button type="submit">Sign in</button></form>'
                document.querySelector('form').onsubmit = (event) => {
                  event.preventDefault()
                  console.log('synthetic-credential-submit')
                  if (scenario === 'split credentials' && !passwordOnly) {
                    setTimeout(() => form(true), 1200)
                  } else if (scenario === 'rejected credentials') {
                    root.insertAdjacentHTML('beforeend', '<p>Invalid password</p>')
                  } else {
                    setTimeout(() => { root.innerHTML = '<nav id="side-navigation">Signed in</nav>' },
                      scenario === 'slow submission' ? 6000 : 0)
                  }
                }
              }
              document.querySelector('button').onclick = () => {
                root.innerHTML = '<p>Redirecting to sign in</p>'
                setTimeout(form, scenario === 'late form' ? 6000 : 0)
              }
            </script>`,
        })
      })
      page.on('console', (message) => {
        if (message.text() === 'synthetic-credential-submit') submissions += 1
      })
      // APIRequestContext bypasses page routes. Stub it so no probe reaches TEST.
      const originalGet = page.request.get
      page.request.get = async (url) => {
        expect(url).toBe('/api/lexis/session/capabilities')
        return {
          status: () => 200,
          ok: () => true,
          json: async () => ({ authenticated: await page.locator('#side-navigation').isVisible() }),
          text: async () => '',
        } as APIResponse
      }
      try {
        if (scenario === 'rejected credentials') {
          await expect(loginWithIdir(page)).rejects.toThrow(
            'login was rejected by the identity provider',
          )
        } else {
          await loginWithIdir(page)
          await expect(page.locator('#side-navigation')).toHaveText('Signed in')
        }
        expect(submissions).toBe(scenario === 'split credentials' ? 2 : 1)
      } finally {
        page.request.get = originalGet
      }
    })
  }
})
