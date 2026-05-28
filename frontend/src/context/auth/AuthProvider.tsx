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
  summary: '/provincial/summary',
  applicationsreview: '/provincial/review',
  applicationsearch: '/provincial/application',
  exemptionsearch: '/provincial/exemption',
  offerssearch: '/provincial/offers',
  permitsearch: '/provincial/permit',
  federalapplicationsearch: '/federal',
  indianreservepermitsearch: '/indian-reserve',
  lexisagentadmin: '/admin',
}

const ACTION_PRIORITY: string[] = [
  'summary',
  'applicationsReview',
  'applicationSearch',
  'exemptionSearch',
  'offersSearch',
  'permitSearch',
  'federalApplicationSearch',
  'indianReservePermitSearch',
  'lexisAgentAdmin',
]

const LEGACY_TO_CANONICAL_ROLE_MAP: Record<string, string> = {
  LEXIS_ADMIN: 'ADMIN',
  LEXIS_READ_ONLY: 'READ_ONLY',
  LEXIS_APPLICATION_APPROVER: 'APPLICATION_APPROVER',
  LEXIS_EXEMPTION_APPROVER: 'EXEMPTION_APPROVER',
  LEXIS_INDUSTRY: 'PROVINCIAL_SUBMITTER',
  LEXIS_LOG_EXPORT_INDUSTRY: 'FEDERAL_SUBMITTER',
  LOG_EXPORT_INDUSTRY: 'FEDERAL_SUBMITTER',
}

const LEGACY_PROVINCIAL_CONCRETE_PREFIX = 'LEXIS_INDUSTRY_'
const LEGACY_FEDERAL_CONCRETE_PREFIXES = ['LEXIS_LOG_EXPORT_INDUSTRY_', 'LOG_EXPORT_INDUSTRY_']
const CANONICAL_PROVINCIAL_CONCRETE_PREFIX = 'PROVINCIAL_SUBMITTER_'
const CANONICAL_FEDERAL_CONCRETE_ROLE = 'FEDERAL_SUBMITTER'
const ROLE_ADMIN = 'ADMIN'
const ROLE_READ_ONLY = 'READ_ONLY'
const ROLE_APPLICATION_APPROVER = 'APPLICATION_APPROVER'
const ROLE_EXEMPTION_APPROVER = 'EXEMPTION_APPROVER'
const ROLE_PROVINCIAL_SUBMITTER = 'PROVINCIAL_SUBMITTER'
const ROLE_FEDERAL_SUBMITTER = 'FEDERAL_SUBMITTER'

const canonicalizeRole = (role: string): string => {
  const normalizedRole = role.trim().toUpperCase()

  if (normalizedRole.startsWith(LEGACY_PROVINCIAL_CONCRETE_PREFIX)) {
    return `${CANONICAL_PROVINCIAL_CONCRETE_PREFIX}${normalizedRole.slice(LEGACY_PROVINCIAL_CONCRETE_PREFIX.length)}`
  }

  if (LEGACY_FEDERAL_CONCRETE_PREFIXES.some((prefix) => normalizedRole.startsWith(prefix))) {
    return CANONICAL_FEDERAL_CONCRETE_ROLE
  }

  if (normalizedRole.startsWith('FEDERAL_SUBMITTER_')) {
    return CANONICAL_FEDERAL_CONCRETE_ROLE
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

const DEV_READ_ONLY_ACTIONS: string[] = [
  '/applicationSearch',
  '/applicationDetails',
  '/federalApplicationSearch',
  '/federalApplicationDetails',
  '/permitSearch',
  '/permitDetails',
  '/indianReservePermitSearch',
  '/indianReservePermitDetails',
]

const DEV_APPLICATION_APPROVER_ACTIONS: string[] = [...DEV_READ_ONLY_ACTIONS, '/applicationsReview']
const DEV_EXEMPTION_APPROVER_ACTIONS: string[] = [
  ...DEV_READ_ONLY_ACTIONS,
  '/exemptionSearch',
  '/exemptionDetails',
  '/applicationsReview',
  'approveExemption',
]

const DEV_PROVINCIAL_SUBMITTER_ACTIONS: string[] = [
  '/summary',
  '/exemptionSearch',
  '/applicationSearch',
  '/applicationDetails',
  '/offersSearch',
  '/offerDetails',
]

const DEV_FEDERAL_SUBMITTER_ACTIONS: string[] = [
  ...DEV_PROVINCIAL_SUBMITTER_ACTIONS,
  '/federalApplicationSearch',
  '/federalApplicationDetails',
  'viewFederalApplication',
]

const DEV_ADMIN_ACTIONS: string[] = [
  ...BASE_SEARCH_ACTIONS,
  ...BASE_DETAIL_ACTIONS,
  ...BASE_REPORT_ACTIONS,
  ...BASE_WORKFLOW_ACTIONS,
  ...BASE_ADMIN_ACTIONS,
]

const DEV_ROLE_ACTIONS: Record<string, string[]> = {
  [ROLE_ADMIN]: DEV_ADMIN_ACTIONS,
  [ROLE_READ_ONLY]: DEV_READ_ONLY_ACTIONS,
  [ROLE_APPLICATION_APPROVER]: DEV_APPLICATION_APPROVER_ACTIONS,
  [ROLE_EXEMPTION_APPROVER]: DEV_EXEMPTION_APPROVER_ACTIONS,
  [ROLE_PROVINCIAL_SUBMITTER]: DEV_PROVINCIAL_SUBMITTER_ACTIONS,
  [ROLE_FEDERAL_SUBMITTER]: DEV_FEDERAL_SUBMITTER_ACTIONS,
  LEXIS_ADMIN: DEV_ADMIN_ACTIONS,
  LEXIS_READ_ONLY: DEV_READ_ONLY_ACTIONS,
  LEXIS_APPLICATION_APPROVER: DEV_APPLICATION_APPROVER_ACTIONS,
  LEXIS_EXEMPTION_APPROVER: DEV_EXEMPTION_APPROVER_ACTIONS,
  LEXIS_INDUSTRY: DEV_PROVINCIAL_SUBMITTER_ACTIONS,
  LEXIS_LOG_EXPORT_INDUSTRY: DEV_FEDERAL_SUBMITTER_ACTIONS,
  LOG_EXPORT_INDUSTRY: DEV_FEDERAL_SUBMITTER_ACTIONS,
}

const DEV_CONCRETE_ROLE_PREFIXES: string[] = ['PROVINCIAL_SUBMITTER_', 'LEXIS_INDUSTRY_']
const INDUSTRY_ROLE_NAMES = new Set<string>([
  ROLE_PROVINCIAL_SUBMITTER,
  ROLE_FEDERAL_SUBMITTER,
  'LEXIS_INDUSTRY',
  'LEXIS_LOG_EXPORT_INDUSTRY',
  'LOG_EXPORT_INDUSTRY',
])

const normalizeAction = (action: string): string => {
  return action.trim().toLowerCase().replace(/\.do$/i, '').replace(/^\//, '')
}

const isIndustryRole = (role: string): boolean => {
  if (INDUSTRY_ROLE_NAMES.has(role)) {
    return true
  }
  return DEV_CONCRETE_ROLE_PREFIXES.some((prefix) => role.startsWith(prefix))
}

const resolveFallbackActionsForRole = (role: string): string[] => {
  if (DEV_ROLE_ACTIONS[role]) {
    return DEV_ROLE_ACTIONS[role]
  }

  // TODO: replace this fallback with action claims from backend once Cognito/FAM authz is fully wired.
  if (DEV_CONCRETE_ROLE_PREFIXES.some((prefix) => role.startsWith(prefix))) {
    return DEV_PROVINCIAL_SUBMITTER_ACTIONS
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
  return normalizeAction(withoutQuery)
}

const shouldUseLegacyPathRouting = (): boolean => {
  const configured = (import.meta.env.VITE_LEXIS_ENABLE_LEGACY_PATH_ROUTING ?? '')
    .toString()
    .trim()
    .toLowerCase()
  return configured === '1' || configured === 'true' || configured === 'yes'
}

const shouldUseRoleActionFallback = (): boolean => {
  const configured = (import.meta.env.VITE_LEXIS_ENABLE_ROLE_ACTION_FALLBACK ?? 'true')
    .toString()
    .trim()
    .toLowerCase()
  return configured !== '0' && configured !== 'false' && configured !== 'no'
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
  if (shouldUseLegacyPathRouting()) {
    const legacyAction = normalizeLegacyActionFromPath(capabilities.legacyPath)
    if (legacyAction && LEGACY_ACTION_ROUTE_MAP[legacyAction]) {
      return LEGACY_ACTION_ROUTE_MAP[legacyAction]
    }
  }

  const roleSet = new Set(capabilities.roles)
  const isReadOnlyUser = roleSet.has(ROLE_READ_ONLY) || roleSet.has('LEXIS_READ_ONLY')
  const isIndustryUser = capabilities.roles.some((role) => isIndustryRole(role))
  const isAdminOnly = roleSet.size === 1 && (roleSet.has(ROLE_ADMIN) || roleSet.has('LEXIS_ADMIN'))
  const isExemptionApproverUser =
    roleSet.has(ROLE_EXEMPTION_APPROVER) || roleSet.has('LEXIS_EXEMPTION_APPROVER')

  if (isReadOnlyUser) {
    return '/provincial/application'
  }

  if (isIndustryUser) {
    return '/provincial/summary'
  }

  if (isAdminOnly) {
    return '/admin'
  }

  if (isExemptionApproverUser) {
    return '/provincial/exemption'
  }

  if (capabilities.roles.length > 0) {
    return '/provincial/review'
  }

  const grantedSet = new Set(capabilities.grantedActions.map(normalizeAction))
  for (const action of ACTION_PRIORITY) {
    const normalizedAction = normalizeAction(action)
    if (grantedSet.has(normalizedAction)) {
      return LEGACY_ACTION_ROUTE_MAP[normalizedAction]
    }
  }

  if (roleSet.has(ROLE_ADMIN) || roleSet.has('LEXIS_ADMIN')) {
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

  const canonicalDevRoles = useMemo(() => canonicalizeRoles(devRoles), [devRoles])

  const effectiveRoles = useMemo(() => {
    if (capabilities.roles.length > 0) {
      return capabilities.roles
    }
    return canonicalDevRoles
  }, [capabilities.roles, canonicalDevRoles])

  const effectiveGrantedActions = useMemo(() => {
    if (capabilities.grantedActions.length > 0) {
      return capabilities.grantedActions
    }
    const hasDevRoleSimulation = capabilities.roles.length === 0 && canonicalDevRoles.length > 0
    if (!shouldUseRoleActionFallback() && !hasDevRoleSimulation) {
      return []
    }
    return deriveGrantedActionsFromRoles(effectiveRoles)
  }, [
    capabilities.grantedActions,
    capabilities.roles.length,
    canonicalDevRoles.length,
    effectiveRoles,
  ])

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
    devRoles: canonicalDevRoles,
    refresh,
    login,
    logout,
    setDevRoles,
    clearLoginSimulation,
    canPerform,
  }

  return <AuthContext value={contextValue}>{children}</AuthContext>
}
