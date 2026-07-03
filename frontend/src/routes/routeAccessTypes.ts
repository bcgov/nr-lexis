export type RouteActionMatch = 'any' | 'all'

export type RouteRoleScope = 'provincial' | 'provincialApplicationSubmission'

export type NavigationRoleScope = Exclude<RouteRoleScope, 'provincial'>
