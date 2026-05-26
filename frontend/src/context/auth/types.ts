import type { LexisSessionCapabilities } from '@/interfaces/LexisSession'

export type AuthContextType = {
  capabilities: LexisSessionCapabilities
  isLoading: boolean
  isLoggedIn: boolean
  hasAnyRole: boolean
  usesExternalLogin: boolean
  defaultRoute: string
  devRoles: string[]
  refresh: () => Promise<void>
  login: () => Promise<void>
  logout: () => Promise<void>
  setDevRoles: (roles: string[]) => Promise<void>
  clearLoginSimulation: () => Promise<void>
  canPerform: (action: string) => boolean
}
