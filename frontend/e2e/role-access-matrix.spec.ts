import { expect, test, type Page } from '@playwright/test'
import { bootstrapDevRoles, gotoProtectedRoute } from './utils'

type DefaultRouteAssertion = {
  role: string
  expectedUrl: RegExp
  heading: RegExp
}

const DEFAULT_ROUTE_ASSERTIONS: DefaultRouteAssertion[] = [
  { role: 'READ_ONLY', expectedUrl: /\/provincial\/application(?:\?.*)?$/, heading: /provincial application search/i },
  { role: 'APPLICATION_APPROVER', expectedUrl: /\/provincial\/review(?:\?.*)?$/, heading: /provincial review/i },
  { role: 'EXEMPTION_APPROVER', expectedUrl: /\/provincial\/exemption(?:\?.*)?$/, heading: /provincial exemption search/i },
  { role: 'PROVINCIAL_SUBMITTER', expectedUrl: /\/provincial\/summary(?:\?.*)?$/, heading: /provincial summary/i },
  { role: 'FEDERAL_SUBMITTER', expectedUrl: /\/provincial\/summary(?:\?.*)?$/, heading: /provincial summary/i },
  { role: 'ADMIN', expectedUrl: /\/admin(?:\?.*)?$/, heading: /administration/i },
]

type RouteAccessAssertion = {
  role: string
  path: string
  allowed: boolean
  heading?: RegExp
}

const ROUTE_ACCESS_ASSERTIONS: RouteAccessAssertion[] = [
  { role: 'READ_ONLY', path: '/provincial/application', allowed: true, heading: /provincial application search/i },
  { role: 'READ_ONLY', path: '/provincial/application/create', allowed: false },
  { role: 'READ_ONLY', path: '/indian-reserve/permit/create', allowed: false },
  { role: 'READ_ONLY', path: '/admin/uploads', allowed: false },
  { role: 'READ_ONLY', path: '/admin/policies', allowed: false },
  { role: 'APPLICATION_APPROVER', path: '/provincial/review', allowed: true, heading: /provincial review/i },
  { role: 'APPLICATION_APPROVER', path: '/provincial/exemption', allowed: false },
  { role: 'EXEMPTION_APPROVER', path: '/provincial/exemption', allowed: true, heading: /provincial exemption search/i },
  { role: 'EXEMPTION_APPROVER', path: '/provincial/exemption/create', allowed: false },
  { role: 'PROVINCIAL_SUBMITTER', path: '/provincial/offers', allowed: true, heading: /provincial offers search/i },
  { role: 'PROVINCIAL_SUBMITTER', path: '/provincial/review', allowed: false },
  { role: 'FEDERAL_SUBMITTER', path: '/federal', allowed: true, heading: /federal application search/i },
  { role: 'FEDERAL_SUBMITTER', path: '/provincial/permit', allowed: false },
  { role: 'ADMIN', path: '/admin/uploads', allowed: true, heading: /upload center/i },
  { role: 'ADMIN', path: '/admin/policies', allowed: true, heading: /policy center/i },
]

const expectUnauthorized = async (page: Page): Promise<void> => {
  await expect(page).toHaveURL(/\/unauthorized(?:\?.*)?$/)
  await expect(page.getByRole('heading', { name: /unauthorized/i })).toBeVisible()
}

test.describe('role-access matrix hardening', () => {
  for (const assertion of DEFAULT_ROUTE_ASSERTIONS) {
    test(`root redirect for ${assertion.role}`, async ({ page }) => {
      await bootstrapDevRoles(page, [assertion.role])
      await gotoProtectedRoute(page, '/')

      await expect(page).toHaveURL(assertion.expectedUrl)
      await expect(page.getByRole('heading', { name: assertion.heading })).toBeVisible()
    })
  }

  for (const assertion of ROUTE_ACCESS_ASSERTIONS) {
    test(`${assertion.role} ${assertion.allowed ? 'can' : 'cannot'} open ${assertion.path}`, async ({
      page,
    }) => {
      await bootstrapDevRoles(page, [assertion.role])
      await gotoProtectedRoute(page, assertion.path)

      if (!assertion.allowed) {
        await expectUnauthorized(page)
        return
      }

      await expect(page.getByRole('heading', { name: /unauthorized/i })).toHaveCount(0)
      await expect(page.getByRole('heading', { name: assertion.heading! })).toBeVisible()
    })
  }
})
