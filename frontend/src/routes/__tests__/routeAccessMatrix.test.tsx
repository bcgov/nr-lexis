import { describe, expect, it } from 'vitest'
import { PROTECTED_ROUTES } from '@/routes/routePaths'

const findRoute = (path: string) => {
  const route = PROTECTED_ROUTES.find((entry) => entry.path === path)
  expect(route).toBeDefined()
  return route!
}

describe('Protected route access matrix', () => {
  it('allows federal detail access from either modern detail action or legacy federal action', () => {
    const route = findRoute('/federal/application/:applicationNumber')
    expect(route.requiredActionsMatch).toBe('any')
    expect(route.requiredActions).toEqual(['/federalApplicationDetails', 'viewFederalApplication'])
  })

  it('allows indigenous detail access from either modern detail action or legacy OIC action', () => {
    const route = findRoute('/indian-reserve/permit/:permitNumber')
    expect(route.requiredActionsMatch).toBe('any')
    expect(route.requiredActions).toEqual(['/indianReservePermitDetails', 'viewOICApplication'])
  })
})
