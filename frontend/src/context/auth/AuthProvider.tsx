import { useCallback, useEffect, useMemo, useState, type FC, type ReactNode } from 'react'
import { fetchAuthSession, signInWithRedirect, signOut } from 'aws-amplify/auth'
import { isCognitoConfigured } from '@/config/fam/config'
import { AuthContext } from '@/context/auth/AuthContext'
import type { AuthContextType } from '@/context/auth/types'
import { env } from '@/env'
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
const ROLE_EXEMPTION_APPROVER = 'EXEMPTION_APPROVER'
const ROLE_PROVINCIAL_SUBMITTER = 'PROVINCIAL_SUBMITTER'
const ROLE_FEDERAL_SUBMITTER = 'FEDERAL_SUBMITTER'

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
  const deduped = new Set<string>()
  for (const role of roles) {
    const normalizedRole = canonicalizeRole(role)
    if (normalizedRole.length > 0) {
      deduped.add(normalizedRole)
    }
  }
  return Array.from(deduped)
}

const isIndustryRole = (role: string): boolean => {
  if (INDUSTRY_ROLE_NAMES.has(role)) {
    return true
  }
  return role.startsWith('PROVINCIAL_SUBMITTER_') || role.startsWith('LEXIS_INDUSTRY_')
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
  const externalLoginUrl = (env.VITE_LOGIN_URL ?? '').trim()
  const usesExternalLogin = isCognitoConfigured || externalLoginUrl.length > 0

  const refresh = useCallback(async () => {
    setIsLoading(true)

    try {
      if (isCognitoConfigured) {
        try {
          await fetchAuthSession({ forceRefresh: false })
        } catch {
          // Ignore here; capabilities endpoint still returns anonymous when no token exists.
        }
      }

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
    if (isCognitoConfigured) {
      await signInWithRedirect()
      return
    }

    if (externalLoginUrl) {
      window.location.assign(externalLoginUrl)
      return
    }
    await refresh()
  }, [externalLoginUrl, refresh])

  const logout = useCallback(async () => {
    try {
      await performLogoff()
      if (isCognitoConfigured) {
        await signOut()
      }
    } catch (error) {
      console.warn('Unable to complete backend logoff. Clearing local auth state.', error)
    } finally {
      setCapabilities(DEFAULT_CAPABILITIES)
      setIsLoading(false)
    }
  }, [])

  const grantedActionSet = useMemo(() => {
    return new Set(capabilities.grantedActions.map(normalizeAction))
  }, [capabilities.grantedActions])

  const canPerform = useCallback(
    (action: string): boolean => {
      return grantedActionSet.has(normalizeAction(action))
    },
    [grantedActionSet],
  )

  const hasAnyRole = capabilities.roles.length > 0
  const isLoggedIn = capabilities.authenticated
  const defaultRoute = resolveDefaultRoute(capabilities)

  const contextValue: AuthContextType = {
    capabilities,
    isLoading,
    isLoggedIn,
    hasAnyRole,
    usesExternalLogin,
    defaultRoute,
    refresh,
    login,
    logout,
    canPerform,
  }

  return <AuthContext value={contextValue}>{children}</AuthContext>
}
