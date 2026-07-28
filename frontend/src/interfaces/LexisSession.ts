export type LexisSessionCapabilities = {
  authenticated: boolean
  principal: string | null
  roles: string[]
  welcomeTarget: string | null
  legacyPath: string | null
  grantedActions: string[]
  orgUnitNo?: string | null
  forestClientNumber: string | null
  availableForestClientNumbers: string[]
  forestClientSelectionRequired: boolean
}

export type LexisSessionLogoutResponse = {
  invalidated: boolean
}
