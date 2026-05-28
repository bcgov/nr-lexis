export type LexisSessionCapabilities = {
  authenticated: boolean
  principal: string | null
  roles: string[]
  welcomeTarget: string | null
  legacyPath: string | null
  grantedActions: string[]
}

export type LexisSessionLogoutResponse = {
  invalidated: boolean
}
