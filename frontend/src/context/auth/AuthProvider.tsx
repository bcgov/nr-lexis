import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  AUTH_CALLBACK_PATH,
  endOidcSession,
  getOidcUser,
  isOidcConfigured,
  isSessionEnded,
  restoreOidcUser,
  startOidcLogin,
} from '@/service/oidc-service'
import { isProdRtmOnlyMode, PROD_RTM_ONLY_ROUTE } from '@/config/features'
import { AppToastNotification } from '@/components/AppToastNotification'
import SessionTimeoutWarning from '@/components/SessionTimeoutWarning'
import { AuthContext } from '@/context/auth/AuthContext'
import { clearLoginDestination } from '@/context/auth/login-destination'
import {
  allowedRegions,
  normalizeAction,
  normalizeActionRegions,
  withinRegions,
  type RecordOrgUnits,
} from '@/context/auth/region-utils'
import { hasRole, isPureReadOnlyRole } from '@/context/auth/role-utils'
import {
  clearSessionExpiredLoginNotice,
  markSessionExpiredLoginNotice,
  redirectToLoginShell,
  SESSION_EXPIRED_EVENT,
  SESSION_IDLE_WARNING_MS,
  SESSION_IDLE_TIMEOUT_MS,
  type SessionExpiredEventDetail,
  type SessionExpiredReason,
} from '@/context/auth/session-expiry'
import type { AuthContextType, LoginProvider } from '@/context/auth/types'
import type { LexisSessionCapabilities } from '@/interfaces/LexisSession'
import { clearAllPageDataCache } from '@/pages/shared/page-data-cache'
import { clearPersistedSearchState } from '@/pages/shared/usePersistedSearchParams'
import apiService from '@/service/api-service'
import {
  clearActiveForestClientNumber,
  getActiveForestClientNumber,
  setActiveForestClientNumber,
} from '@/service/forest-client-selection'
import { fetchSessionCapabilities } from '@/service/session-service'

type AuthProviderProps = {
  children: ReactNode
}

const DEFAULT_CAPABILITIES: LexisSessionCapabilities = {
  authenticated: false,
  principal: null,
  roles: [],
  welcomeTarget: null,
  legacyPath: null,
  grantedActions: [],
  orgUnitNo: null,
  forestClientNumber: null,
  availableForestClientNumbers: [],
  forestClientSelectionRequired: false,
  actionRegions: {},
}

const LEGACY_ACTION_ROUTE_MAP: Record<string, string> = {
  applicationsreview: '/provincial/review',
  applicationsearch: '/provincial/application',
  createapplication: '/provincial/application/upload',
  exemptionsearch: '/provincial/exemption',
  offerssearch: '/provincial/offers',
  permitsearch: '/provincial/permit',
  federalapplicationsearch: '/federal',
}

const ACTION_PRIORITY: string[] = [
  'applicationsReview',
  'applicationSearch',
  'uploadApplicationSubmission',
  'exemptionSearch',
  'offersSearch',
  'permitSearch',
  'federalApplicationSearch',
]

const REPORT_ACTION_ROUTE_MAP: Record<string, string> = {
  applicationreport: '/reports/applicationReport',
  mofrlisting: '/reports/biweeklyListing',
  offerreport: '/reports/offerReport',
  teacreport: '/reports/teacReport',
  exemptionreport: '/reports/exemptionReport',
  permitledgerreport: '/reports/permitLedgerReport',
  transportreport: '/reports/transportReport',
  speciesgradereport: '/reports/speciesGradeReport',
  feereport: '/reports/feeReport',
  tenurereport: '/reports/tenureReport',
}

const LEGACY_TO_CANONICAL_ROLE_MAP: Record<string, string> = {
  LEXIS_ADMIN: 'ADMIN',
  LEXIS_READ_ONLY: 'READ_ONLY',
  LEXIS_FEDERAL_READ_ONLY: 'FEDERAL_READ_ONLY',
  LEXIS_APPLICATION_APPROVER: 'APPLICATION_APPROVER',
  LEXIS_EXEMPTION_APPROVER: 'EXEMPTION_APPROVER',
  LEXIS_PROVINCIAL_SUBMITTER: 'PROVINCIAL_SUBMITTER',
}

const NON_LEXIS_FAM_AUTHORITIES = new Set(['DELEGATED_ADMIN', 'LEXIS_DELEGATED_ADMIN'])
const CANONICAL_LEXIS_PROVINCIAL_CONCRETE_PREFIX = 'LEXIS_PROVINCIAL_SUBMITTER_'
const CANONICAL_PROVINCIAL_CONCRETE_PREFIX = 'PROVINCIAL_SUBMITTER_'
const ROLE_ADMIN = 'ADMIN'
const ROLE_READ_ONLY = 'READ_ONLY'
const ROLE_FEDERAL_READ_ONLY = 'FEDERAL_READ_ONLY'
const ROLE_APPLICATION_APPROVER = 'APPLICATION_APPROVER'
const ROLE_EXEMPTION_APPROVER = 'EXEMPTION_APPROVER'
const ROLE_PROVINCIAL_SUBMITTER = 'PROVINCIAL_SUBMITTER'
const APPLICATION_ROLE_NAMES = new Set([
  ROLE_ADMIN,
  ROLE_READ_ONLY,
  ROLE_FEDERAL_READ_ONLY,
  ROLE_APPLICATION_APPROVER,
  ROLE_EXEMPTION_APPROVER,
])
const PROD_RTM_ONLY_ACTION = '/lexisAgentAdmin'

const INDUSTRY_ROLE_NAMES = new Set<string>([ROLE_PROVINCIAL_SUBMITTER])
const SESSION_ACTIVITY_EVENTS = [
  'mousemove',
  'mousedown',
  'keydown',
  'scroll',
  'touchstart',
  'wheel',
]
const SESSION_ACTIVITY_THROTTLE_MS = 1_000
const SESSION_KEEPALIVE_THROTTLE_MS = 60_000

const canonicalizeRole = (role: string): string | null => {
  const normalizedRole = role.trim().toUpperCase()

  if (NON_LEXIS_FAM_AUTHORITIES.has(normalizedRole)) {
    return null
  }

  if (normalizedRole.startsWith(CANONICAL_LEXIS_PROVINCIAL_CONCRETE_PREFIX)) {
    return `${CANONICAL_PROVINCIAL_CONCRETE_PREFIX}${normalizedRole.slice(CANONICAL_LEXIS_PROVINCIAL_CONCRETE_PREFIX.length)}`
  }

  return LEGACY_TO_CANONICAL_ROLE_MAP[normalizedRole] ?? normalizedRole
}

const canonicalizeRoles = (roles: string[]): string[] => {
  const deduped = new Set<string>()
  for (const role of roles) {
    const normalizedRole = canonicalizeRole(role)
    if (normalizedRole && normalizedRole.length > 0) {
      deduped.add(normalizedRole)
    }
  }
  return Array.from(deduped)
}

const isIndustryRole = (role: string): boolean => {
  if (INDUSTRY_ROLE_NAMES.has(role)) {
    return true
  }
  return role.startsWith('PROVINCIAL_SUBMITTER_')
}

const isApplicationRole = (role: string): boolean => {
  return APPLICATION_ROLE_NAMES.has(role) || isIndustryRole(role)
}

const asNonBlankString = (value: unknown): string | null => {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return null
  }

  const normalized = String(value).trim()
  return normalized.length > 0 ? normalized : null
}

const sanitizeCapabilities = (
  payload: Partial<LexisSessionCapabilities>,
  orgUnitNo: string | null = null,
): LexisSessionCapabilities => {
  const availableForestClientNumbers = Array.from(
    new Set(
      (payload.availableForestClientNumbers ?? [])
        .map((clientNumber) => asNonBlankString(clientNumber))
        .filter((clientNumber): clientNumber is string => clientNumber !== null),
    ),
  ).sort()

  return {
    authenticated: Boolean(payload.authenticated),
    principal: payload.principal ?? null,
    roles: canonicalizeRoles(payload.roles ?? []),
    welcomeTarget: payload.welcomeTarget ?? null,
    legacyPath: payload.legacyPath ?? null,
    grantedActions: (payload.grantedActions ?? []).filter(
      (action): action is string => typeof action === 'string',
    ),
    orgUnitNo: orgUnitNo ?? payload.orgUnitNo ?? null,
    forestClientNumber: asNonBlankString(payload.forestClientNumber),
    availableForestClientNumbers,
    forestClientSelectionRequired: Boolean(payload.forestClientSelectionRequired),
    actionRegions: normalizeActionRegions(payload.actionRegions),
  }
}

const resolveDefaultRoute = (capabilities: LexisSessionCapabilities): string => {
  const isReadOnlyUser = isPureReadOnlyRole(capabilities.roles)
  const hasReadOnlyRole = hasRole(capabilities.roles, ROLE_READ_ONLY)
  const isIndustryUser = capabilities.roles.some((role) => isIndustryRole(role))
  const isProvincialSubmitterUser = capabilities.roles.some((role) => {
    return role === ROLE_PROVINCIAL_SUBMITTER || role.startsWith('PROVINCIAL_SUBMITTER_')
  })
  const isAdminUser = hasRole(capabilities.roles, ROLE_ADMIN)
  const isApplicationApproverUser = hasRole(capabilities.roles, ROLE_APPLICATION_APPROVER)
  const isExemptionApproverUser = hasRole(capabilities.roles, ROLE_EXEMPTION_APPROVER)
  const grantedSet = new Set(capabilities.grantedActions.map(normalizeAction))
  const hasGrantedAction = (action: string): boolean => grantedSet.has(normalizeAction(action))
  const reportRoute = Object.entries(REPORT_ACTION_ROUTE_MAP).find(([action]) =>
    grantedSet.has(action),
  )?.[1]

  if (isProdRtmOnlyMode()) {
    if (isAdminUser) {
      return PROD_RTM_ONLY_ROUTE
    }
    // Preserve the RTM-only read route for any READ_ONLY assignment; backend capabilities
    // continue to limit the actions available in this mode.
    if (hasReadOnlyRole) return '/provincial/application'
    return hasRole(capabilities.roles, ROLE_FEDERAL_READ_ONLY) ? '/federal' : '/unauthorized'
  }

  if (isAdminUser) {
    return '/provincial/review'
  }

  if (isReadOnlyUser) {
    return '/provincial/application'
  }

  if (isIndustryUser) {
    if (isProvincialSubmitterUser && hasGrantedAction('/summary')) {
      return '/provincial/summary'
    }
    if (isProvincialSubmitterUser && hasGrantedAction('/applicationSearch')) {
      return '/provincial/application'
    }
    if (isProvincialSubmitterUser && hasGrantedAction('createApplication')) {
      return '/provincial/application/create'
    }
    if (
      hasGrantedAction('/federalApplicationSearch') ||
      hasGrantedAction('viewFederalApplication')
    ) {
      return '/federal'
    }
    if (hasGrantedAction('uploadApplicationSubmission')) {
      return '/provincial/application/upload'
    }
    if (reportRoute) {
      return reportRoute
    }
    return '/unauthorized'
  }

  if (isExemptionApproverUser) {
    return '/provincial/exemption'
  }

  if (isApplicationApproverUser) {
    return '/provincial/review'
  }

  for (const action of ACTION_PRIORITY) {
    const normalizedAction = normalizeAction(action)
    if (grantedSet.has(normalizedAction)) {
      return LEGACY_ACTION_ROUTE_MAP[normalizedAction]
    }
  }

  if (reportRoute) {
    return reportRoute
  }

  return '/unauthorized'
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [capabilities, setCapabilities] = useState<LexisSessionCapabilities>(DEFAULT_CAPABILITIES)
  const [isLoading, setIsLoading] = useState(true)
  const refreshPromiseRef = useRef<Promise<void> | null>(null)
  const sessionGenerationRef = useRef(0)
  const sessionExpiryInFlightRef = useRef(false)
  const authenticatedSessionRef = useRef(false)
  const sessionWarningOpenRef = useRef(false)
  const sessionWarningLauncherRef = useRef<HTMLElement | null>(null)
  const [sessionWarningExpiresAt, setSessionWarningExpiresAt] = useState<number | null>(null)
  const [showSessionExtendedMessage, setShowSessionExtendedMessage] = useState(false)
  const [idleTimerVersion, setIdleTimerVersion] = useState(0)
  const usesExternalLogin = isOidcConfigured

  const closeSessionWarning = useCallback((resetIdleTimer = false) => {
    sessionWarningOpenRef.current = false
    setSessionWarningExpiresAt(null)
    if (resetIdleTimer) {
      setIdleTimerVersion((currentVersion) => currentVersion + 1)
    }
  }, [])

  const expireSession = useCallback(
    async (reason: SessionExpiredReason) => {
      if (sessionExpiryInFlightRef.current) {
        return
      }

      sessionExpiryInFlightRef.current = true
      sessionGenerationRef.current += 1
      refreshPromiseRef.current = null
      const shouldSignOut =
        isOidcConfigured && (authenticatedSessionRef.current || reason === 'idle-timeout')

      let redirectStarted = false
      try {
        closeSessionWarning()
        setShowSessionExtendedMessage(false)
        clearActiveForestClientNumber()
        apiService.clearCachedGetData()
        apiService.clearRecordVersions()
        clearAllPageDataCache()
        clearPersistedSearchState()
        clearLoginDestination()
        authenticatedSessionRef.current = false
        if (reason === 'idle-timeout') {
          markSessionExpiredLoginNotice()
        } else {
          clearSessionExpiredLoginNotice()
        }

        setCapabilities(DEFAULT_CAPABILITIES)
        setIsLoading(shouldSignOut)
        redirectToLoginShell()

        if (shouldSignOut) {
          await endOidcSession()
          redirectStarted = true
        }
      } catch (error) {
        console.warn(`Unable to complete OIDC sign-out after ${reason}.`, error)
        setIsLoading(false)
      } finally {
        if (!redirectStarted) sessionExpiryInFlightRef.current = false
      }
    },
    [closeSessionWarning],
  )

  const refresh = useCallback(async () => {
    if (refreshPromiseRef.current) {
      return refreshPromiseRef.current
    }

    setIsLoading(true)
    const refreshGeneration = sessionGenerationRef.current

    const refreshPromise = (async () => {
      try {
        if (isOidcConfigured) {
          // The callback route explicitly consumes the code before reloading the
          // application. Bootstrap must not race it or clear the saved destination.
          if (window.location.pathname === AUTH_CALLBACK_PATH) return
          // A stored session that can no longer be renewed is simply signed out,
          // not a capabilities failure: keep the destination for the next login.
          const user = await restoreOidcUser()
          if (!user?.access_token) {
            if (sessionGenerationRef.current === refreshGeneration) {
              sessionExpiryInFlightRef.current = false
              authenticatedSessionRef.current = false
              clearPersistedSearchState()
              setCapabilities(DEFAULT_CAPABILITIES)
            }
            return
          }
        }

        let data = await fetchSessionCapabilities()
        if (sessionGenerationRef.current === refreshGeneration) {
          sessionExpiryInFlightRef.current = false
          let nextCapabilities = sanitizeCapabilities(data)
          const persistedForestClientNumber = getActiveForestClientNumber()
          if (
            persistedForestClientNumber &&
            nextCapabilities.forestClientNumber !== persistedForestClientNumber
          ) {
            clearActiveForestClientNumber()
            apiService.clearCachedGetData()
            clearAllPageDataCache()
            clearPersistedSearchState()
            data = await fetchSessionCapabilities()
            if (sessionGenerationRef.current !== refreshGeneration) {
              return
            }
            nextCapabilities = sanitizeCapabilities(data)
          }
          if (!nextCapabilities.authenticated) {
            clearPersistedSearchState()
            clearLoginDestination()
          }
          authenticatedSessionRef.current = nextCapabilities.authenticated
          setCapabilities(nextCapabilities)
        }
      } catch (error) {
        if (sessionGenerationRef.current === refreshGeneration) {
          console.warn('Unable to load session capabilities.', error)
          authenticatedSessionRef.current = false
          clearPersistedSearchState()
          clearLoginDestination()
          setCapabilities(DEFAULT_CAPABILITIES)
        }
      } finally {
        if (sessionGenerationRef.current === refreshGeneration) {
          setIsLoading(false)
        }
      }
    })()

    refreshPromiseRef.current = refreshPromise
    try {
      await refreshPromise
    } finally {
      if (refreshPromiseRef.current === refreshPromise) {
        refreshPromiseRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    authenticatedSessionRef.current = capabilities.authenticated
  }, [capabilities.authenticated])

  useEffect(() => {
    const onSessionExpired = (event: Event) => {
      const reason =
        (event as CustomEvent<SessionExpiredEventDetail>).detail?.reason ?? 'api-unauthorized'
      void expireSession(reason)
    }

    window.addEventListener(SESSION_EXPIRED_EVENT, onSessionExpired)
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onSessionExpired)
  }, [expireSession])

  useEffect(() => {
    if (!isOidcConfigured || !capabilities.authenticated) {
      return undefined
    }

    let warningTimeoutId: number | undefined
    let expiryTimeoutId: number | undefined
    let lastActivityReset = 0
    let lastKeepalive = 0
    const clearTimers = () => {
      if (warningTimeoutId !== undefined) {
        window.clearTimeout(warningTimeoutId)
      }
      if (expiryTimeoutId !== undefined) {
        window.clearTimeout(expiryTimeoutId)
      }
    }
    const startSessionWarning = (expiresAt: number) => {
      sessionWarningOpenRef.current = true
      const activeElement = document.activeElement
      sessionWarningLauncherRef.current =
        activeElement instanceof HTMLElement ? activeElement : null
      setSessionWarningExpiresAt(expiresAt)
      expiryTimeoutId = window.setTimeout(
        () => {
          void expireSession('idle-timeout')
        },
        Math.max(0, expiresAt - Date.now()),
      )
    }
    const checkIdleDeadline = (expiresAt: number) => {
      const remaining = expiresAt - Date.now()
      if (remaining <= 0) {
        void expireSession('idle-timeout')
        return
      }
      startSessionWarning(expiresAt)
    }
    const resetIdleTimer = () => {
      if (sessionWarningOpenRef.current) {
        return
      }
      clearTimers()
      const expiresAt = Date.now() + SESSION_IDLE_TIMEOUT_MS
      warningTimeoutId = window.setTimeout(
        () => checkIdleDeadline(expiresAt),
        SESSION_IDLE_TIMEOUT_MS - SESSION_IDLE_WARNING_MS,
      )
    }
    const onActivity = () => {
      if (sessionWarningOpenRef.current) {
        return
      }

      const now = Date.now()
      if (now - lastActivityReset >= SESSION_ACTIVITY_THROTTLE_MS) {
        lastActivityReset = now
        resetIdleTimer()
      }
      if (now - lastKeepalive >= SESSION_KEEPALIVE_THROTTLE_MS) {
        lastKeepalive = now
        void getOidcUser()
          .then((session) => {
            if (!session?.access_token) {
              void expireSession('token-unavailable')
            }
          })
          .catch((error: unknown) => {
            // After a temporary failure, later activity tries again instead of signing out.
            if (isSessionEnded(error)) void expireSession('token-unavailable')
          })
      }
    }

    resetIdleTimer()
    SESSION_ACTIVITY_EVENTS.forEach((eventName) => {
      window.addEventListener(eventName, onActivity, { passive: true })
    })

    return () => {
      clearTimers()
      SESSION_ACTIVITY_EVENTS.forEach((eventName) => {
        window.removeEventListener(eventName, onActivity)
      })
    }
  }, [capabilities.authenticated, expireSession, idleTimerVersion])

  const login = useCallback(
    async (provider: LoginProvider = 'idir') => {
      sessionExpiryInFlightRef.current = false

      if (isOidcConfigured) {
        await refresh()
        if (authenticatedSessionRef.current) {
          return
        }
      }

      clearActiveForestClientNumber()
      apiService.clearCachedGetData()
      clearPersistedSearchState()
      if (isOidcConfigured) {
        await startOidcLogin(provider)
        return
      }
      await refresh()
    },
    [refresh],
  )

  const logout = useCallback(async () => {
    sessionExpiryInFlightRef.current = true
    sessionGenerationRef.current += 1
    refreshPromiseRef.current = null

    try {
      closeSessionWarning()
      setShowSessionExtendedMessage(false)
      clearSessionExpiredLoginNotice()
      clearActiveForestClientNumber()
      apiService.clearCachedGetData()
      apiService.clearRecordVersions()
      clearAllPageDataCache()
      clearPersistedSearchState()
      clearLoginDestination()
      authenticatedSessionRef.current = false

      setCapabilities(DEFAULT_CAPABILITIES)
      setIsLoading(isOidcConfigured)
      redirectToLoginShell()

      if (isOidcConfigured) {
        await endOidcSession()
      }
    } catch (error) {
      console.warn('Unable to complete OIDC sign-out. Clearing local auth state.', error)
      setIsLoading(false)
    }
  }, [closeSessionWarning])

  const selectForestClient = useCallback(
    async (forestClientNumber: string) => {
      const normalizedClientNumber = forestClientNumber.trim()
      if (!capabilities.availableForestClientNumbers.includes(normalizedClientNumber)) {
        throw new Error('The selected organization is not assigned to this account.')
      }

      const selectionGeneration = sessionGenerationRef.current
      const previousClientNumber = getActiveForestClientNumber()
      setActiveForestClientNumber(normalizedClientNumber)
      apiService.clearCachedGetData()
      apiService.clearRecordVersions()
      clearAllPageDataCache()
      clearPersistedSearchState()

      try {
        const data = await fetchSessionCapabilities()
        if (sessionGenerationRef.current !== selectionGeneration) {
          throw new Error('The session changed while selecting an organization.')
        }
        const nextCapabilities = sanitizeCapabilities(data, capabilities.orgUnitNo ?? null)
        if (
          nextCapabilities.forestClientNumber !== normalizedClientNumber ||
          nextCapabilities.forestClientSelectionRequired
        ) {
          throw new Error('LEXIS could not activate the selected organization.')
        }

        setCapabilities(nextCapabilities)
      } catch (error) {
        if (sessionGenerationRef.current !== selectionGeneration) {
          clearActiveForestClientNumber()
        } else if (previousClientNumber) {
          setActiveForestClientNumber(previousClientNumber)
        } else {
          clearActiveForestClientNumber()
        }
        apiService.clearCachedGetData()
        throw error
      }
    },
    [capabilities.availableForestClientNumbers, capabilities.orgUnitNo],
  )

  const extendSession = useCallback(async () => {
    const extensionGeneration = sessionGenerationRef.current
    try {
      const user = await getOidcUser({ forceRefresh: true })
      if (sessionGenerationRef.current !== extensionGeneration) return
      if (!user?.access_token) {
        throw new Error('OIDC did not return a refreshed access token.')
      }
      setShowSessionExtendedMessage(true)
      closeSessionWarning(true)
    } catch {
      if (sessionGenerationRef.current === extensionGeneration) {
        await expireSession('token-unavailable')
      }
    }
  }, [closeSessionWarning, expireSession])

  const grantedActionSet = useMemo(() => {
    return new Set(capabilities.grantedActions.map(normalizeAction))
  }, [capabilities.grantedActions])

  const canPerformAction = useCallback(
    (action: string): boolean => {
      if (isProdRtmOnlyMode()) {
        if (hasRole(capabilities.roles, ROLE_ADMIN)) {
          return normalizeAction(action) === normalizeAction(PROD_RTM_ONLY_ACTION)
        }
        if (
          !hasRole(capabilities.roles, ROLE_READ_ONLY) &&
          !hasRole(capabilities.roles, ROLE_FEDERAL_READ_ONLY)
        ) {
          return false
        }
      }
      if (hasRole(capabilities.roles, ROLE_ADMIN)) {
        return true
      }
      const normalizedAction = normalizeAction(action)
      return grantedActionSet.has(normalizedAction)
    },
    [capabilities.roles, grantedActionSet],
  )

  const canPerform = useCallback(
    (action: string, ...recordOrgUnits: [recordOrgUnits?: RecordOrgUnits]): boolean =>
      canPerformAction(action) &&
      (recordOrgUnits.length === 0 ||
        withinRegions(allowedRegions(capabilities, action), recordOrgUnits[0])),
    [canPerformAction, capabilities],
  )

  const hasAnyRole = capabilities.roles.some(isApplicationRole)
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
    selectForestClient,
    login,
    logout,
    canPerform,
  }

  return (
    <AuthContext value={contextValue}>
      {children}
      {showSessionExtendedMessage && (
        <AppToastNotification
          kind="success"
          title="You’re still logged in"
          subtitle="Your session has been extended."
          onCloseButtonClick={() => setShowSessionExtendedMessage(false)}
        />
      )}
      <SessionTimeoutWarning
        open={sessionWarningExpiresAt !== null}
        expiresAt={sessionWarningExpiresAt}
        launcherButtonRef={sessionWarningLauncherRef}
        onStayLoggedIn={extendSession}
        onLogOut={() => void logout()}
      />
    </AuthContext>
  )
}
