import type { RecordOrgUnits } from '@/context/auth/region-utils'
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
  /** sessionChecked skips the session read, for a caller that knows this tab is signed out. */
  login: (provider?: LoginProvider, options?: { sessionChecked?: boolean }) => Promise<void>
  logout: () => Promise<void>
  /**
   * With a record argument (even undefined), also requires the action's regions to cover the
   * record's organization units; a missing record region is outside every regional grant.
   */
  canPerform: (action: string, ...recordOrgUnits: [recordOrgUnits?: RecordOrgUnits]) => boolean
}
