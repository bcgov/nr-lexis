import { expect, test } from '@playwright/test'
import { bootstrapDevRoles, gotoProtectedRoute } from './utils'

const ADMIN_ROLE_VARIANTS = ['ADMIN', 'LEXIS_ADMIN'] as const

const PROTECTED_ROUTE_ASSERTIONS: { path: string; heading: RegExp }[] = [
  { path: '/admin', heading: /administration/i },
  { path: '/provincial/review', heading: /provincial review/i },
  { path: '/federal', heading: /federal application search/i },
]

const LEGACY_PLACEHOLDER_ASSERTIONS: { role: string; path: string; heading: RegExp }[] = [
  {
    role: 'LEXIS_INDUSTRY',
    path: '/provincial/application',
    heading: /provincial application search/i,
  },
  {
    role: 'LEXIS_INDUSTRY_00012345',
    path: '/provincial/application',
    heading: /provincial application search/i,
  },
  {
    role: 'LOG_EXPORT_INDUSTRY',
    path: '/federal',
    heading: /federal application search/i,
  },
  {
    role: 'LOG_EXPORT_INDUSTRY_00012345',
    path: '/federal',
    heading: /federal application search/i,
  },
]

test.describe('auth role alias compatibility', () => {
  for (const role of ADMIN_ROLE_VARIANTS) {
    test(`${role} resolves root to admin landing when admin is the only role`, async ({ page }) => {
      await bootstrapDevRoles(page, [role])
      await gotoProtectedRoute(page, '/')

      await expect(page).toHaveURL(/\/admin(?:\?.*)?$/)
      await expect(page.getByRole('heading', { name: /administration/i })).toBeVisible()
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

  for (const assertion of LEGACY_PLACEHOLDER_ASSERTIONS) {
    test(`legacy placeholder role ${assertion.role} remains routable`, async ({ page }) => {
      await bootstrapDevRoles(page, [assertion.role])
      await gotoProtectedRoute(page, assertion.path)

      await expect(page.getByRole('heading', { name: /unauthorized/i })).toHaveCount(0)
      await expect(page.getByRole('heading', { name: assertion.heading })).toBeVisible()
    })
  }
})
