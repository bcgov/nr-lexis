import { describe, expect, it } from 'vitest'
import { PROTECTED_ROUTES } from '@/routes/routePaths'

const findRoute = (path: string) => {
  const route = PROTECTED_ROUTES.find((entry) => entry.path === path)
  expect(route).toBeDefined()
  return route!
}

describe('Protected route access matrix', () => {
  it.each([
    {
      path: '/provincial',
      requiredActions: [
        '/summary',
        '/applicationsReview',
        '/applicationSearch',
        'createApplication',
        '/exemptionSearch',
        '/offersSearch',
        '/permitSearch',
      ],
      requiredActionsMatch: 'any',
    },
    {
      path: '/provincial/application/create',
      requiredActions: ['/applicationSearch', 'createApplication'],
      requiredActionsMatch: 'all',
    },
    {
      path: '/provincial/application/upload',
      requiredActions: ['createApplication'],
      requiredActionsMatch: 'any',
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
  ])(
    'enforces expected action requirements for $path',
    ({ path, requiredActions, requiredActionsMatch }) => {
      const route = findRoute(path)
      expect(route.requiredActions).toEqual(requiredActions)
      expect(route.requiredActionsMatch ?? 'any').toBe(requiredActionsMatch)
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
})
