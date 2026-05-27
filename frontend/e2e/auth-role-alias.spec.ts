import { expect, test } from '@playwright/test'
import { bootstrapDevRoles, gotoProtectedRoute } from './utils'

const ROLE_VARIANTS = ['LEXIS_ADMIN', 'ADMIN'] as const

const PROTECTED_ROUTE_ASSERTIONS: { path: string; heading: RegExp }[] = [
  { path: '/admin', heading: /administration/i },
  { path: '/provincial/review', heading: /provincial review/i },
  { path: '/federal', heading: /federal application search/i },
]

test.describe('auth role alias compatibility', () => {
  for (const role of ROLE_VARIANTS) {
    test(`${role} resolves root to provincial summary`, async ({ page }) => {
      await bootstrapDevRoles(page, [role])
      await gotoProtectedRoute(page, '/')

      await expect(page).toHaveURL(/\/provincial\/summary(?:\?.*)?$/)
      await expect(page.getByRole('heading', { name: /provincial summary/i })).toBeVisible()
    })

    test(`${role} can access protected admin and search routes`, async ({ page }) => {
      await bootstrapDevRoles(page, [role])

      for (const route of PROTECTED_ROUTE_ASSERTIONS) {
        await gotoProtectedRoute(page, route.path)
        await expect(page.getByRole('heading', { name: /unauthorized/i })).toHaveCount(0)
        await expect(page.getByRole('heading', { name: route.heading })).toBeVisible()
      }
    })
  }
})
