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
  /** Region-limited granted actions, keyed like normalized actions; absent means province-wide. */
  actionRegions?: Record<string, string[]>
}

export type LexisSessionLogoutResponse = {
  invalidated: boolean
}
