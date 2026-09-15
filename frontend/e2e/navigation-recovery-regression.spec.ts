import { once } from 'node:events'
import { createServer } from 'node:http'
import { expect, test, type APIResponse } from '@playwright/test'
import { gotoSyntheticRoute } from './utils'
import { gotoWithRecovery } from './utils/navigation'
import { loginWithIdir, postWithCsrf } from './utils/regression-auth'

// All requests are intercepted. These checks never use TEST, credentials or business records.
const origin = 'https://navigation.example.test'

test.describe('navigation transport recovery', () => {
  test.describe.configure({ retries: 0 })

  test('recovers a refused document request without retrying the test', async ({ page }) => {
    let documents = 0
    await page.route(`${origin}/**`, async (route) => {
      documents += 1
      if (documents === 1) {
        await route.abort('connectionrefused')
        return
      }
      await route.fulfill({
        contentType: 'text/html',
        body: '<div id="root"><h1>Application search</h1></div>',
      })
    })

    await gotoWithRecovery(page, `${origin}/application`, {
      ready: page.getByRole('heading', { name: 'Application search' }),
    })
    await expect(page.getByRole('heading', { name: 'Application search' })).toBeVisible()
    expect(documents).toBe(2)
  })

  for (const stalledResource of ['document', 'script']) {
    test(`recovers when a timed-out ${stalledResource} is aborted by the next navigation`, async ({
      page,
    }) => {
      let documents = 0
      let scripts = 0
      const abortedTypes: string[] = []
      page.on('requestfailed', (request) => {
        if (request.failure()?.errorText === 'net::ERR_ABORTED') {
          abortedTypes.push(request.resourceType())
        }
      })
      await page.route(`${origin}/**`, async (route) => {
        if (new URL(route.request().url()).pathname === '/app.js') {
          scripts += 1
          if (stalledResource === 'script' && scripts === 1) return
          await route.fulfill({ contentType: 'application/javascript', body: '' })
          return
        }
        documents += 1
        // Leave the first request pending: Chromium cancels it when recovery navigates again.
        if (stalledResource === 'document' && documents === 1) return
        await route.fulfill({
          contentType: 'text/html',
          body: '<div id="root"><h1>Application search</h1></div><script src="/app.js"></script>',
        })
      })

      await gotoWithRecovery(page, `${origin}/application`, {
        timeout: 1_000,
        ready: page.getByRole('heading', { name: 'Application search' }),
      })
      expect(documents).toBe(2)
      expect(abortedTypes).toContain(stalledResource)
      await expect(page.getByRole('heading', { name: 'Application search' })).toBeVisible()
    })
  }

  test('recovers synthetic navigation when a failed config script leaves the document empty', async ({
    page,
  }) => {
    let documents = 0
    let configs = 0
    await page.route(`${origin}/**`, async (route) => {
      if (new URL(route.request().url()).pathname === '/config.js') {
        configs += 1
        if (configs === 1) {
          await route.abort('timedout')
          return
        }
        await route.fulfill({
          contentType: 'application/javascript',
          body: 'document.getElementById("root").innerHTML = "<h1>Federal application search</h1>"',
        })
        return
      }
      documents += 1
      await route.fulfill({
        contentType: 'text/html',
        body: '<div id="root"></div><script src="/config.js"></script>',
      })
    })

    await gotoSyntheticRoute(page, `${origin}/federal`, {
      ready: page.getByRole('heading', { name: 'Federal application search' }),
    })
    await expect(page.getByRole('heading', { name: 'Federal application search' })).toBeVisible()
    expect(documents).toBe(2)
    expect(configs).toBe(2)
  })

  test('recovers a lazy module with ERR_FAILED after the application shell renders', async ({
    page,
  }) => {
    let documents = 0
    let modules = 0
    await page.route(`${origin}/**`, async (route) => {
      if (new URL(route.request().url()).pathname === '/federal.js') {
        modules += 1
        if (modules === 1) {
          await route.abort('failed')
          return
        }
        await route.fulfill({
          contentType: 'application/javascript',
          body: 'document.getElementById("root").innerHTML = "<h1>Federal application search</h1>"',
        })
        return
      }
      documents += 1
      await route.fulfill({
        contentType: 'text/html',
        body: '<div id="root"><nav>Side navigation</nav></div><script type="module">await import("/federal.js")</script>',
      })
    })

    await gotoWithRecovery(page, `${origin}/federal`, {
      ready: page.getByRole('heading', { name: 'Federal application search' }),
    })

    expect(documents).toBe(2)
    expect(modules).toBe(2)
  })

  test('fails on a page error even when the expected heading renders', async ({ page }) => {
    let documents = 0
    await page.route(`${origin}/**`, async (route) => {
      documents += 1
      await route.fulfill({
        contentType: 'text/html',
        body: '<div id="root"><h1>Application search</h1></div><script>throw new Error("Application crashed")</script>',
      })
    })

    await expect(
      gotoWithRecovery(page, `${origin}/application`, {
        ready: page.getByRole('heading', { name: 'Application search' }),
      }),
    ).rejects.toThrow('Application crashed')
    expect(documents).toBe(1)
  })

  for (const { resource, readiness } of [
    { resource: 'script', readiness: 'visible' },
    { resource: 'stylesheet', readiness: 'omitted' },
  ]) {
    test(`recovers a failed ${resource} with readiness ${readiness}`, async ({ page }) => {
      let documents = 0
      let resources = 0
      await page.route(`${origin}/**`, async (route) => {
        if (new URL(route.request().url()).pathname === '/asset') {
          resources += 1
          if (resources === 1) {
            if (resource === 'script') await route.abort('failed')
            else await route.fulfill({ status: 503, body: 'Service unavailable' })
            return
          }
          await route.fulfill({
            contentType: resource === 'script' ? 'application/javascript' : 'text/css',
            body: '',
          })
          return
        }
        documents += 1
        await route.fulfill({
          contentType: 'text/html',
          body:
            '<div id="root"><nav>Side navigation</nav></div>' +
            (resource === 'script'
              ? '<script src="/asset"></script>'
              : '<link rel="stylesheet" href="/asset">'),
        })
      })

      await gotoWithRecovery(page, `${origin}/application`, {
        waitUntil: 'load',
        ...(readiness === 'visible' ? { ready: page.getByRole('navigation') } : {}),
      })
      expect(documents).toBe(2)
      expect(resources).toBe(2)
    })
  }

  test('reports an invalid readiness selector without retrying an empty page', async ({ page }) => {
    let documents = 0
    await page.route(`${origin}/**`, async (route) => {
      documents += 1
      await route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' })
    })

    await expect(
      gotoWithRecovery(page, `${origin}/application`, {
        ready: page.locator('css=['),
      }),
    ).rejects.toThrow(/parsing css selector/)
    expect(documents).toBe(1)
  })

  test('fails on a missing script even when the expected heading renders', async ({ page }) => {
    let documents = 0
    await page.route(`${origin}/**`, async (route) => {
      if (new URL(route.request().url()).pathname === '/missing.js') {
        await route.fulfill({ status: 404, body: 'Not found' })
        return
      }
      documents += 1
      await route.fulfill({
        contentType: 'text/html',
        body: '<div id="root"><h1>Application search</h1></div><script src="/missing.js"></script>',
      })
    })

    await expect(
      gotoWithRecovery(page, `${origin}/application`, {
        ready: page.getByRole('heading', { name: 'Application search' }),
      }),
    ).rejects.toThrow('HTTP 404')
    expect(documents).toBe(1)
  })

  test('logs in through the accessible IDIR button when its test id is absent', async ({
    page,
  }) => {
    let documents = 0
    await page.route('**/*', async (route) => {
      documents += 1
      await route.fulfill({
        contentType: 'text/html',
        body: '<div id="root"><button onclick="this.outerHTML = \'<nav id=side-navigation>Signed in</nav>\'">Log in with IDIR</button></div>',
      })
    })

    // APIRequestContext calls bypass page routes. Stub the session probe explicitly so this
    // helper check cannot reach an external API or require credentials.
    const originalGet = page.request.get
    page.request.get = async (url) => {
      expect(url).toBe('/api/lexis/session/capabilities')
      return {
        status: () => 200,
        ok: () => true,
        json: async () => ({ authenticated: await page.locator('#side-navigation').isVisible() }),
      } as APIResponse
    }
    try {
      await loginWithIdir(page)
      await expect(page.locator('#side-navigation')).toHaveText('Signed in')
      expect(documents).toBe(1)
    } finally {
      page.request.get = originalGet
    }
  })

  test('does not reload a rendered shell when its lazy module is missing', async ({ page }) => {
    let documents = 0
    let modules = 0
    await page.route(`${origin}/**`, async (route) => {
      if (new URL(route.request().url()).pathname === '/federal.js') {
        modules += 1
        await route.fulfill({ status: 404, body: 'Not found' })
        return
      }
      documents += 1
      await route.fulfill({
        contentType: 'text/html',
        body: '<div id="root"><nav>Side navigation</nav></div><script type="module">await import("/federal.js")</script>',
      })
    })

    await expect(
      gotoWithRecovery(page, `${origin}/federal`, {
        ready: page.getByRole('heading', { name: 'Federal application search' }),
      }),
    ).rejects.toThrow('HTTP 404')

    expect(documents).toBe(1)
    expect(modules).toBe(1)
  })

  test('recovers a pending lazy import after the loading shell has rendered', async ({ page }) => {
    let documents = 0
    let modules = 0
    await page.route(`${origin}/**`, async (route) => {
      if (new URL(route.request().url()).pathname === '/text.js') {
        modules += 1
        if (modules === 1) return
        await route.fulfill({
          contentType: 'application/javascript',
          body: 'document.getElementById("root").innerHTML = "<h1>Exemption detail</h1>"',
        })
        return
      }
      documents += 1
      await route.fulfill({
        contentType: 'text/html',
        body: '<div id="root"><nav>Side navigation</nav><p>Loading</p></div><script>setTimeout(() => import("/text.js"), 0)</script>',
      })
    })
    await gotoWithRecovery(page, `${origin}/exemption`, {
      ready: page.getByRole('heading', { name: 'Exemption detail' }),
    })
    expect(documents).toBe(2)
    expect(modules).toBe(2)
  })

  test('recovers a refused capabilities request that leaves the login shell', async ({ page }) => {
    let documents = 0
    let probes = 0
    await page.route(`${origin}/**`, async (route) => {
      if (new URL(route.request().url()).pathname === '/api/lexis/session/capabilities') {
        probes += 1
        if (probes === 1) {
          await route.abort('connectionrefused')
          return
        }
        await route.fulfill({ json: { authenticated: true } })
        return
      }
      documents += 1
      await route.fulfill({
        contentType: 'text/html',
        body: '<div id="root"><p>Loading</p></div><script>fetch("/api/lexis/session/capabilities").then(() => { document.getElementById("root").innerHTML = "<h1>Application review</h1>" }).catch(() => { document.getElementById("root").innerHTML = "<button>Log in with IDIR</button>" })</script>',
      })
    })
    await gotoWithRecovery(page, `${origin}/review`, {
      ready: page.getByRole('heading', { name: 'Application review' }),
    })
    expect(documents).toBe(2)
    expect(probes).toBe(2)
  })

  test('lets a successful IDIR click finish a slow federated navigation', async ({ page }) => {
    await page.route('**/*', async (route) => {
      if (new URL(route.request().url()).pathname === '/slow-federation') {
        // Exceeds the 15-second click timeout, but is within the separate login-session wait.
        await new Promise((resolve) => setTimeout(resolve, 16_000))
        await route.fulfill({
          contentType: 'text/html',
          body: '<nav id="side-navigation">Signed in</nav>',
        })
        return
      }
      await route.fulfill({
        contentType: 'text/html',
        body: '<div id="root"><button data-testid="landing-button__idir" onclick="location.href=\'/slow-federation\'">Log in with IDIR</button></div>',
      })
    })
    const originalGet = page.request.get
    page.request.get = async (url) => {
      expect(url).toBe('/api/lexis/session/capabilities')
      return {
        status: () => 200,
        ok: () => true,
        json: async () => ({ authenticated: await page.locator('#side-navigation').isVisible() }),
      } as APIResponse
    }
    try {
      await loginWithIdir(page)
      await expect(page.locator('#side-navigation')).toHaveText('Signed in')
    } finally {
      page.request.get = originalGet
    }
  })

  test('returns a mutation redirect without following it or replaying the original request', async ({
    page,
  }) => {
    const methods: string[] = []
    const server = createServer((request, response) => {
      methods.push(request.method ?? '')
      response.writeHead(302, { Location: 'http://127.0.0.1:0/unavailable' }).end()
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    try {
      const address = server.address()
      if (!address || typeof address === 'string') throw new Error('Missing local probe address')
      const response = await postWithCsrf(page, `http://127.0.0.1:${address.port}/mutation`)
      expect(response.status()).toBe(302)
      expect(methods).toEqual(['POST'])
      await response.dispose()
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      )
    }
  })
})
