import { expect, test } from '@playwright/test'
import { gotoWithRecovery } from './utils/navigation'

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

  test('recovers when a failed config script leaves a successful document empty', async ({
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

    await gotoWithRecovery(page, `${origin}/federal`, {
      ready: page.getByRole('heading', { name: 'Federal application search' }),
    })
    await expect(page.getByRole('heading', { name: 'Federal application search' })).toBeVisible()
    expect(documents).toBe(2)
    expect(configs).toBe(2)
  })
})
