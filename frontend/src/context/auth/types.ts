import type { LexisSessionCapabilities } from '@/interfaces/LexisSession'

export type AuthContextType = {
  capabilities: LexisSessionCapabilities
  isLoading: boolean
  isLoggedIn: boolean
  hasAnyRole: boolean
  usesExternalLogin: boolean
  defaultRoute: string
  refresh: () => Promise<void>
  login: () => Promise<void>
  logout: () => Promise<void>
  canPerform: (action: string) => boolean
}
