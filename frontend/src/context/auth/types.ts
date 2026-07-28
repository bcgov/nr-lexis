import type { LexisSessionCapabilities } from '@/interfaces/LexisSession'

export type LoginProvider = 'idir' | 'business-bceid'

export type AuthContextType = {
  capabilities: LexisSessionCapabilities
  isLoading: boolean
  isLoggedIn: boolean
  hasAnyRole: boolean
  usesExternalLogin: boolean
  defaultRoute: string
  refresh: () => Promise<void>
  selectForestClient: (forestClientNumber: string) => Promise<void>
  login: (provider?: LoginProvider) => Promise<void>
  logout: () => Promise<void>
  canPerform: (action: string) => boolean
}
