import { useCallback, useEffect, useMemo, useState, type FC, type ReactNode } from 'react'
import { AuthContext } from '@/context/auth/AuthContext'
import {
  clearDevRoles,
  normalizeRoles,
  readDevRoles,
  writeDevRoles,
} from '@/context/auth/dev-role-storage'
import type { AuthContextType } from '@/context/auth/types'
import type { LexisSessionCapabilities } from '@/interfaces/LexisSession'
import { fetchSessionCapabilities, performLogoff } from '@/service/session-service'

type Props = {
  children: ReactNode
}

const DEFAULT_CAPABILITIES: LexisSessionCapabilities = {
  authenticated: false,
  principal: null,
  roles: [],
  welcomeTarget: null,
  legacyPath: null,
  grantedActions: [],
}

const LEGACY_ACTION_ROUTE_MAP: Record<string, string> = {
  '/summary': '/provincial/summary',
  '/applicationsreview': '/provincial/review',
  '/applicationsearch': '/provincial/application',
  '/exemptionsearch': '/provincial/exemption',
  '/offerssearch': '/provincial/offers',
  '/permitsearch': '/provincial/permit',
  '/federalapplicationsearch': '/federal',
  '/indianreservepermitsearch': '/indian-reserve',
  '/lexisagentadmin': '/admin',
}

const ACTION_PRIORITY: string[] = [
  '/summary',
  '/applicationsReview',
  '/applicationSearch',
  '/exemptionSearch',
  '/offersSearch',
  '/permitSearch',
  '/federalApplicationSearch',
  '/indianReservePermitSearch',
  '/lexisAgentAdmin',
]

const LEGACY_TO_CANONICAL_ROLE_MAP: Record<string, string> = {
  ADMIN: 'LEXIS_ADMIN',
  READ_ONLY: 'LEXIS_READ_ONLY',
  APPLICATION_APPROVER: 'LEXIS_APPLICATION_APPROVER',
  EXEMPTION_APPROVER: 'LEXIS_EXEMPTION_APPROVER',
  LOG_EXPORT_INDUSTRY: 'LEXIS_LOG_EXPORT_INDUSTRY',
}

const LEGACY_LOG_EXPORT_CONCRETE_PREFIX = 'LOG_EXPORT_INDUSTRY_'
const CANONICAL_LOG_EXPORT_CONCRETE_PREFIX = 'LEXIS_LOG_EXPORT_INDUSTRY_'

const canonicalizeRole = (role: string): string => {
  const normalizedRole = role.trim().toUpperCase()

  if (normalizedRole.startsWith(LEGACY_LOG_EXPORT_CONCRETE_PREFIX)) {
    return `${CANONICAL_LOG_EXPORT_CONCRETE_PREFIX}${normalizedRole.slice(LEGACY_LOG_EXPORT_CONCRETE_PREFIX.length)}`
  }

  return LEGACY_TO_CANONICAL_ROLE_MAP[normalizedRole] ?? normalizedRole
}

const canonicalizeRoles = (roles: string[]): string[] => {
  return normalizeRoles(roles.map(canonicalizeRole))
}

const BASE_SEARCH_ACTIONS: string[] = [
  '/summary',
  '/applicationSearch',
  '/exemptionSearch',
  '/offersSearch',
  '/permitSearch',
  '/federalApplicationSearch',
  '/indianReservePermitSearch',
]

const BASE_DETAIL_ACTIONS: string[] = [
  '/applicationDetails',
  '/exemptionDetails',
  '/offerDetails',
  '/permitDetails',
  '/federalApplicationDetails',
  '/indianReservePermitDetails',
]

const BASE_REPORT_ACTIONS: string[] = [
  '/applicationReport',
  '/offerReport',
  '/teacReport',
  '/exemptionReport',
  '/permitLedgerReport',
  '/transportReport',
  '/speciesGradeReport',
  '/feeReport',
  '/tenureReport',
  'mofrListing',
]

const BASE_WORKFLOW_ACTIONS: string[] = [
  '/applicationsReview',
  'createApplication',
  '/createExemption',
  'createOffer',
  'createPermit',
  'approveExemption',
  'viewFederalApplication',
  'viewOICApplication',
]

const BASE_ADMIN_ACTIONS: string[] = [
  '/lexisAgentAdmin',
  '/fileApplicationUpload',
  '/fileExemptionUpload',
  '/filePermitUpload',
  '/fileInvoiceUpload',
  '/lexisPolicyAdmin',
  '/lexisFILAdmin',
]

const DEV_READ_ONLY_ACTIONS: string[] = [...BASE_SEARCH_ACTIONS, ...BASE_DETAIL_ACTIONS]
const DEV_APPROVER_ACTIONS: string[] = [...DEV_READ_ONLY_ACTIONS, ...BASE_WORKFLOW_ACTIONS]
const DEV_INDUSTRY_ACTIONS: string[] = [
  ...DEV_READ_ONLY_ACTIONS,
  'createOffer',
  'createPermit',
  'viewFederalApplication',
  'viewOICApplication',
]

const DEV_ADMIN_ACTIONS: string[] = [
  ...BASE_SEARCH_ACTIONS,
  ...BASE_DETAIL_ACTIONS,
  ...BASE_REPORT_ACTIONS,
  ...BASE_WORKFLOW_ACTIONS,
  ...BASE_ADMIN_ACTIONS,
]

const DEV_ROLE_ACTIONS: Record<string, string[]> = {
  LEXIS_ADMIN: DEV_ADMIN_ACTIONS,
  LEXIS_READ_ONLY: DEV_READ_ONLY_ACTIONS,
  LEXIS_APPLICATION_APPROVER: DEV_APPROVER_ACTIONS,
  LEXIS_EXEMPTION_APPROVER: DEV_APPROVER_ACTIONS,
  LEXIS_INDUSTRY: DEV_INDUSTRY_ACTIONS,
  LEXIS_LOG_EXPORT_INDUSTRY: DEV_INDUSTRY_ACTIONS,
  ADMIN: DEV_ADMIN_ACTIONS,
  READ_ONLY: DEV_READ_ONLY_ACTIONS,
  APPLICATION_APPROVER: DEV_APPROVER_ACTIONS,
  EXEMPTION_APPROVER: DEV_APPROVER_ACTIONS,
  LOG_EXPORT_INDUSTRY: DEV_INDUSTRY_ACTIONS,
}

const DEV_CONCRETE_ROLE_PREFIXES: string[] = [
  'LEXIS_INDUSTRY_',
  'LEXIS_LOG_EXPORT_INDUSTRY_',
  'LOG_EXPORT_INDUSTRY_',
]

const normalizeAction = (action: string): string => action.trim().toLowerCase()

const resolveFallbackActionsForRole = (role: string): string[] => {
  if (DEV_ROLE_ACTIONS[role]) {
    return DEV_ROLE_ACTIONS[role]
  }

  // TODO: replace this fallback with action claims from backend once Cognito/FAM authz is fully wired.
  if (DEV_CONCRETE_ROLE_PREFIXES.some((prefix) => role.startsWith(prefix))) {
    return DEV_INDUSTRY_ACTIONS
  }

  return []
}

const deriveGrantedActionsFromRoles = (roles: string[]): string[] => {
  const actionSet = new Set<string>()

  roles
    .flatMap((role) => resolveFallbackActionsForRole(role))
    .forEach((action) => actionSet.add(action))

  return Array.from(actionSet)
}

const normalizeLegacyActionFromPath = (legacyPath: string | null): string | null => {
  if (!legacyPath) {
    return null
  }

  const withoutQuery = legacyPath.trim().split('?')[0]
  const normalizedWithLeadingSlash = withoutQuery.startsWith('/')
    ? withoutQuery
    : `/${withoutQuery}`
  return normalizedWithLeadingSlash.replace(/\.do$/i, '').toLowerCase()
}

const sanitizeCapabilities = (
  payload: Partial<LexisSessionCapabilities>,
): LexisSessionCapabilities => {
  return {
    authenticated: Boolean(payload.authenticated),
    principal: payload.principal ?? null,
    roles: canonicalizeRoles(payload.roles ?? []),
    welcomeTarget: payload.welcomeTarget ?? null,
    legacyPath: payload.legacyPath ?? null,
    grantedActions: (payload.grantedActions ?? []).filter(
      (action): action is string => typeof action === 'string',
    ),
  }
}

const resolveDefaultRoute = (capabilities: LexisSessionCapabilities): string => {
  const legacyAction = normalizeLegacyActionFromPath(capabilities.legacyPath)
  if (legacyAction && LEGACY_ACTION_ROUTE_MAP[legacyAction]) {
    return LEGACY_ACTION_ROUTE_MAP[legacyAction]
  }

  const grantedSet = new Set(capabilities.grantedActions.map(normalizeAction))
  for (const action of ACTION_PRIORITY) {
    const normalizedAction = normalizeAction(action)
    if (grantedSet.has(normalizedAction)) {
      return LEGACY_ACTION_ROUTE_MAP[normalizedAction]
    }
  }

  if (capabilities.roles.includes('LEXIS_ADMIN') || capabilities.roles.includes('ADMIN')) {
    return '/admin'
  }

  return '/dashboard'
}

export const AuthProvider: FC<Props> = ({ children }) => {
  const [capabilities, setCapabilities] = useState<LexisSessionCapabilities>(DEFAULT_CAPABILITIES)
  const [isLoading, setIsLoading] = useState(true)
  const externalLoginUrl = (import.meta.env.VITE_LOGIN_URL ?? '').trim()
  const usesExternalLogin = externalLoginUrl.length > 0
  const devRoles = readDevRoles()

  const refresh = useCallback(async () => {
    setIsLoading(true)

    try {
      const data = await fetchSessionCapabilities()
      setCapabilities(sanitizeCapabilities(data))
    } catch (error) {
      console.warn('Unable to load session capabilities.', error)
      setCapabilities(DEFAULT_CAPABILITIES)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const login = useCallback(async () => {
    if (externalLoginUrl) {
      window.location.assign(externalLoginUrl)
      return
    }
    await refresh()
  }, [externalLoginUrl, refresh])

  const setDevRoles = useCallback(
    async (roles: string[]) => {
      writeDevRoles(canonicalizeRoles(roles))
      await refresh()
    },
    [refresh],
  )

  const clearLoginSimulation = useCallback(async () => {
    clearDevRoles()
    await refresh()
  }, [refresh])

  const logout = useCallback(async () => {
    try {
      await performLogoff()
    } catch (error) {
      console.warn('Unable to complete backend logoff. Clearing local auth state.', error)
    } finally {
      clearDevRoles()
      setCapabilities(DEFAULT_CAPABILITIES)
      setIsLoading(false)
    }
  }, [])

  const effectiveRoles = useMemo(() => {
    const canonicalDevRoles = canonicalizeRoles(devRoles)
    if (capabilities.roles.length > 0) {
      return capabilities.roles
    }
    return canonicalDevRoles
  }, [capabilities.roles, devRoles])

  const effectiveGrantedActions = useMemo(() => {
    if (capabilities.grantedActions.length > 0) {
      return capabilities.grantedActions
    }
    return deriveGrantedActionsFromRoles(effectiveRoles)
  }, [capabilities.grantedActions, effectiveRoles])

  const effectiveCapabilities = useMemo(
    () => ({
      ...capabilities,
      roles: effectiveRoles,
      grantedActions: effectiveGrantedActions,
    }),
    [capabilities, effectiveGrantedActions, effectiveRoles],
  )

  const grantedActionSet = useMemo(() => {
    return new Set(effectiveGrantedActions.map(normalizeAction))
  }, [effectiveGrantedActions])

  const canPerform = useCallback(
    (action: string): boolean => {
      return grantedActionSet.has(normalizeAction(action))
    },
    [grantedActionSet],
  )

  const hasAnyRole = effectiveRoles.length > 0
  const isLoggedIn = capabilities.authenticated || hasAnyRole
  const defaultRoute = resolveDefaultRoute(effectiveCapabilities)

  const contextValue: AuthContextType = {
    capabilities: effectiveCapabilities,
    isLoading,
    isLoggedIn,
    hasAnyRole,
    usesExternalLogin,
    defaultRoute,
    devRoles: canonicalizeRoles(devRoles),
    refresh,
    login,
    logout,
    setDevRoles,
    clearLoginSimulation,
    canPerform,
  }

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
}
