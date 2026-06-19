export type RouteActionMatch = 'any' | 'all'

export type RouteRoleScope =
  | 'provincial'
  | 'provincialApplicationSubmission'
  | 'federalApplicationSubmission'

export type NavigationRoleScope = Exclude<RouteRoleScope, 'provincial'>
