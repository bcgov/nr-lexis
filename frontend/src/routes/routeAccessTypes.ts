export type RouteActionMatch = 'any' | 'all'

export type RouteRoleScope =
  | 'provincial'
  | 'provincialApplicationSubmission'
  | 'provincialSubmitter'

export type NavigationRoleScope = Exclude<RouteRoleScope, 'provincial'>
