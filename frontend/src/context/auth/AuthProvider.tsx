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

const normalizeAction = (action: string): string => action.trim().toLowerCase()

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
    roles: normalizeRoles(payload.roles ?? []),
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

  if (capabilities.roles.includes('ADMIN')) {
    return '/admin'
  }

  return '/dashboard'
}

export const AuthProvider: FC<Props> = ({ children }) => {
  const [capabilities, setCapabilities] = useState<LexisSessionCapabilities>(DEFAULT_CAPABILITIES)
  const [isLoading, setIsLoading] = useState(true)

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
    await refresh()
  }, [refresh])

  const setDevRoles = useCallback(
    async (roles: string[]) => {
      writeDevRoles(roles)
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
  const isLoggedIn = capabilities.authenticated || hasAnyRole
  const defaultRoute = resolveDefaultRoute(capabilities)
  const devRoles = readDevRoles()

  const contextValue: AuthContextType = {
    capabilities,
    isLoading,
    isLoggedIn,
    hasAnyRole,
    defaultRoute,
    devRoles,
    refresh,
    login,
    logout,
    setDevRoles,
    clearLoginSimulation,
    canPerform,
  }

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
}
