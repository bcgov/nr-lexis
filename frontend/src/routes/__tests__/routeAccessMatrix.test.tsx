import { describe, expect, it } from 'vitest'
import { isValidElement, type ReactElement } from 'react'
import { Navigate } from 'react-router-dom'
import type { RouteActionMatch, RouteRoleScope } from '@/routes/routeAccessTypes'
import { PROTECTED_ROUTES, PUBLIC_ROUTES } from '@/routes/routePaths'

type RouteAccessExpectation = {
  path: string
  requiredActions: string[]
  requiredActionsMatch: RouteActionMatch
  roleScope?: RouteRoleScope
}

const findRoute = (path: string) => {
  const route = PROTECTED_ROUTES.find((entry) => entry.path === path)
  expect(route).toBeDefined()
  return route!
}

const EXPECTED_PROTECTED_ROUTE_ACCESS: RouteAccessExpectation[] = [
  {
    path: '/provincial',
    requiredActions: [
      '/applicationsReview',
      '/applicationSearch',
      'uploadApplicationSubmission',
      '/exemptionSearch',
      '/offersSearch',
      '/permitSearch',
    ],
    requiredActionsMatch: 'any',
    roleScope: 'provincial',
  },
  {
    path: '/provincial/application/create',
    requiredActions: ['/applicationSearch', 'createApplication'],
    requiredActionsMatch: 'all',
  },
  {
    path: '/provincial/application/upload',
    requiredActions: ['uploadApplicationSubmission'],
    requiredActionsMatch: 'any',
    roleScope: 'provincialApplicationSubmission',
  },
  {
    path: '/provincial/exemption/create',
    requiredActions: ['/exemptionSearch', '/createExemption'],
    requiredActionsMatch: 'all',
  },
  {
    path: '/provincial/offers/create',
    requiredActions: ['/offersSearch', 'createOffer'],
    requiredActionsMatch: 'all',
  },
  {
    path: '/federal/application/:applicationNumber',
    requiredActions: ['/federalApplicationDetails', 'viewFederalApplication'],
    requiredActionsMatch: 'all',
  },
  {
    path: '/admin/uploads',
    requiredActions: [
      '/lexisAgentAdmin',
      '/fileApplicationUpload',
      '/fileExemptionUpload',
      '/filePermitUpload',
      '/fileInvoiceUpload',
    ],
    requiredActionsMatch: 'any',
  },
]

describe('Protected route access matrix', () => {
  it.each(EXPECTED_PROTECTED_ROUTE_ACCESS)(
    'enforces expected action requirements for $path',
    ({ path, requiredActions, requiredActionsMatch, roleScope }) => {
      const route = findRoute(path)
      expect(route.requiredActions).toEqual(requiredActions)
      expect(route.requiredActionsMatch ?? 'any').toBe(requiredActionsMatch)
      expect(route.roleScope).toBe(roleScope)
    },
  )

  it('requires admin action for admin landing route', () => {
    const route = findRoute('/admin')
    expect(route.requiredActions).toEqual(['/lexisAgentAdmin'])
  })

  it('includes advertising list action in reports route requirements', () => {
    const route = findRoute('/reports')
    expect(route.requiredActions).toContain('mofrListing')
    expect(route.requiredActions).toContain('/applicationReport')
  })

  it('redirects the retired federal upload URL to federal search', () => {
    const route = findRoute('/federal/application/upload')

    expect(route.id).toBe('Federal Application Upload Redirect')
    expect(route.requiredActions).toEqual(['/federalApplicationSearch', 'viewFederalApplication'])
    expect(route.requiredActionsMatch ?? 'any').toBe('any')
    expect(route.roleScope).toBeUndefined()
    expect(isValidElement(route.element)).toBe(true)
    expect((route.element as ReactElement).type).toBe(Navigate)
    expect((route.element as ReactElement).props).toMatchObject({
      to: '/federal',
      replace: true,
    })
  })

  it('does not expose retired Indian Reserve or legacy advertising routes', () => {
    const routePaths = [...PUBLIC_ROUTES, ...PROTECTED_ROUTES].map((route) =>
      route.path.toLowerCase(),
    )

    expect(routePaths.some((path) => path.includes('indian'))).toBe(false)
    expect(routePaths.some((path) => path.includes('reserve'))).toBe(false)
    expect(routePaths.some((path) => path.includes('advertising'))).toBe(false)
  })

  it('does not expose retired provincial summary route', () => {
    const routePaths = [...PUBLIC_ROUTES, ...PROTECTED_ROUTES].map((route) =>
      route.path.toLowerCase(),
    )

    expect(routePaths.some((path) => path === '/provincial/summary')).toBe(false)
    expect(routePaths.some((path) => path.startsWith('/provincial/summary/'))).toBe(false)
  })

  it('keeps legacy dashboard URL as a redirect instead of a page', () => {
    const publicDashboardRoute = PUBLIC_ROUTES.find((entry) => entry.path === '/dashboard')

    expect(publicDashboardRoute).toBeDefined()
    expect(publicDashboardRoute?.id).toBe('Legacy Dashboard Redirect')
    expect(isValidElement(publicDashboardRoute?.element)).toBe(true)
    expect((publicDashboardRoute?.element as ReactElement).type).toBe(Navigate)
    expect((publicDashboardRoute?.element as ReactElement).props).toMatchObject({
      to: '/',
      replace: true,
    })
  })
})
