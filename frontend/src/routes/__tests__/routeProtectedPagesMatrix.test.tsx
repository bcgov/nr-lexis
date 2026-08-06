import { describe, expect, it } from 'vitest'
import type { RouteActionMatch } from '@/routes/routeAccessTypes'
import { PROTECTED_ROUTES } from '@/routes/routePaths'

type RouteExpectation = {
  path: string
  requiredActions: string[]
  requiredActionsMatch?: RouteActionMatch
}

const EXPECTED_CORE_PAGES: RouteExpectation[] = [
  {
    path: '/provincial/summary',
    requiredActions: ['/summary'],
  },
  {
    path: '/provincial/application',
    requiredActions: ['/applicationSearch'],
  },
  {
    path: '/provincial/application/upload',
    requiredActions: ['uploadApplicationSubmission'],
  },
  {
    path: '/provincial/application/:applicationNumber',
    requiredActions: ['/applicationDetails'],
  },
  {
    path: '/provincial/exemption',
    requiredActions: ['/exemptionSearch'],
  },
  {
    path: '/provincial/exemption/:exemptionNumber',
    requiredActions: ['/exemptionSearch', '/exemptionDetails'],
    requiredActionsMatch: 'all',
  },
  {
    path: '/provincial/offers',
    requiredActions: ['/offersSearch'],
  },
  {
    path: '/provincial/offers/:offerNumber',
    requiredActions: ['/offersSearch', '/offerDetails'],
    requiredActionsMatch: 'all',
  },
  {
    path: '/provincial/permit',
    requiredActions: ['/permitSearch'],
  },
  {
    path: '/provincial/permit/:permitNumber',
    requiredActions: ['/permitSearch', '/permitDetails'],
    requiredActionsMatch: 'all',
  },
  {
    path: '/provincial/review',
    requiredActions: ['/applicationsReview'],
  },
  {
    path: '/federal',
    requiredActions: ['/federalApplicationSearch', 'viewFederalApplication'],
  },
]

describe('Protected page route matrix', () => {
  it.each(EXPECTED_CORE_PAGES)('keeps expected action contract for $path', (expectation) => {
    const route = PROTECTED_ROUTES.find((entry) => entry.path === expectation.path)

    expect(route).toBeDefined()
    expect(route?.requiredActions).toEqual(expectation.requiredActions)
    expect(route?.requiredActionsMatch ?? 'any').toBe(expectation.requiredActionsMatch ?? 'any')
  })
})
