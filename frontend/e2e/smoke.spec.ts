import { expect, test } from '@playwright/test'
import { bootstrapDevRoles, gotoProtectedRoute } from './utils'

const ROUTE_ASSERTIONS: { path: string; heading: RegExp }[] = [
  { path: '/provincial/application', heading: /provincial application search/i },
  { path: '/provincial/exemption', heading: /provincial exemption search/i },
  { path: '/provincial/offers', heading: /provincial offers search/i },
  { path: '/provincial/permit', heading: /provincial permit search/i },
  { path: '/provincial/review', heading: /provincial review/i },
  { path: '/federal', heading: /federal application search/i },
  { path: '/indian-reserve', heading: /indigenous reserve permit search/i },
]

test.describe('frontend smoke coverage', () => {
  test('landing page renders core login shell', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: /nr lexis/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /log in with idir/i })).toBeVisible()
    await expect(page.getByRole('heading', { name: /session status/i })).toBeVisible()
  })

  for (const route of ROUTE_ASSERTIONS) {
    test(`route renders: ${route.path}`, async ({ page }) => {
      await bootstrapDevRoles(page, ['LEXIS_ADMIN'])
      await gotoProtectedRoute(page, route.path)
      await expect(page.getByRole('heading', { name: route.heading })).toBeVisible()
    })
  }

  test('query-string filter state updates on core tables', async ({ page }) => {
    await bootstrapDevRoles(page, ['LEXIS_ADMIN'])
    await gotoProtectedRoute(page, '/provincial/application')
    await page.fill('#applicationNumber', 'APP-123')
    await expect(page).toHaveURL(/applicationNumber=APP-123/)

    await gotoProtectedRoute(page, '/provincial/offers')
    await page.fill('#packageNumber', 'PKG-77')
    await expect(page).toHaveURL(/packageNumber=PKG-77/)

    await gotoProtectedRoute(page, '/indian-reserve')
    await page.fill('#permitNumber', 'P-999')
    await expect(page).toHaveURL(/permitNumber=P-999/)
  })
})
