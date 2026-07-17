import { expect, test } from '@playwright/test'

const unauthenticatedSession = {
  authenticated: false,
  principal: null,
  roles: [],
  welcomeTarget: null,
  legacyPath: null,
  grantedActions: [],
}

test.describe('frontend smoke coverage', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/lexis/session/capabilities', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(unauthenticatedSession),
      })
    })
  })

  test('landing page renders core login shell', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'Welcome to LEXIS' })).toBeVisible()
    await expect(
      page.getByText('Create and manage applications, view offers and permits', { exact: true }),
    ).toBeVisible()
    await expect(page.getByAltText('Government of British Columbia')).toBeVisible()
    await expect(page.locator('.landing-img')).toBeVisible()
    const idirLogin = page.getByRole('button', { name: /log in with idir/i })
    const businessBceidLogin = page.getByRole('button', { name: /log in with business bceid/i })
    await expect(idirLogin).toBeVisible()
    await expect(idirLogin).toBeEnabled()
    await expect(businessBceidLogin).toBeVisible()
    await expect(businessBceidLogin).toBeEnabled()

    const layoutBounds = await page.locator('.landing-grid').evaluate((grid) => {
      const container = grid.parentElement
      if (!(container instanceof HTMLElement)) throw new Error('Landing container not found')

      return {
        gridWidth: grid.getBoundingClientRect().width,
        containerWidth: container.getBoundingClientRect().width,
        documentOverflows:
          document.documentElement.scrollWidth > document.documentElement.clientWidth,
      }
    })

    expect(layoutBounds.gridWidth).toBeLessThanOrEqual(layoutBounds.containerWidth)
    expect(layoutBounds.documentOverflows).toBe(false)
  })

  test('protected routes are not directly accessible without authenticated session', async ({
    page,
  }) => {
    await page.goto('/provincial/application', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: '404' })).toBeVisible()
    await expect(page.getByText(/does not exist/i)).toBeVisible()

    await page.getByRole('button', { name: /back home/i }).click()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('heading', { name: 'Welcome to LEXIS' })).toBeVisible()
    await expect(page.getByRole('button', { name: /log in with idir/i })).toBeVisible()
  })
})
