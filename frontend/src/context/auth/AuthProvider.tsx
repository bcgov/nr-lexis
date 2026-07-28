import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { fetchAuthSession, signInWithRedirect, signOut } from 'aws-amplify/auth'
import {
  businessBceidProviderName,
  idirProviderName,
  isCognitoConfigured,
} from '@/config/fam/config'
import { isProdRtmOnlyMode, PROD_RTM_ONLY_ROUTE } from '@/config/features'
import { AppNotification } from '@/components/AppNotification'
import SessionTimeoutWarning from '@/components/SessionTimeoutWarning'
import { AuthContext } from '@/context/auth/AuthContext'
import { startFederatedLogout } from '@/context/auth/logout-chain'
import { hasRole } from '@/context/auth/role-utils'
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
import apiService from '@/service/api-service'
import { fetchSessionCapabilities } from '@/service/session-service'

export type AuthProviderProps = {
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
}

const LEGACY_ACTION_ROUTE_MAP: Record<string, string> = {
  applicationsreview: '/provincial/review',
  applicationsearch: '/provincial/application',
  createapplication: '/provincial/application/upload',
  exemptionsearch: '/provincial/exemption',
  offerssearch: '/provincial/offers',
  permitsearch: '/provincial/permit',
  federalapplicationsearch: '/federal',
  lexisagentadmin: '/admin',
}

const ACTION_PRIORITY: string[] = [
  'applicationsReview',
  'applicationSearch',
  'uploadApplicationSubmission',
  'exemptionSearch',
  'offersSearch',
  'permitSearch',
  'federalApplicationSearch',
  'lexisAgentAdmin',
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
  LEXIS_APPLICATION_APPROVER: 'APPLICATION_APPROVER',
  LEXIS_EXEMPTION_APPROVER: 'EXEMPTION_APPROVER',
  LEXIS_PROVINCIAL_SUBMITTER: 'PROVINCIAL_SUBMITTER',
  LEXIS_DELEGATED_ADMIN: 'DELEGATED_ADMIN',
}

const CANONICAL_LEXIS_PROVINCIAL_CONCRETE_PREFIX = 'LEXIS_PROVINCIAL_SUBMITTER_'
const CANONICAL_PROVINCIAL_CONCRETE_PREFIX = 'PROVINCIAL_SUBMITTER_'
const ROLE_ADMIN = 'ADMIN'
const ROLE_READ_ONLY = 'READ_ONLY'
const ROLE_APPLICATION_APPROVER = 'APPLICATION_APPROVER'
const ROLE_EXEMPTION_APPROVER = 'EXEMPTION_APPROVER'
const ROLE_PROVINCIAL_SUBMITTER = 'PROVINCIAL_SUBMITTER'
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

const cognitoSignOut = async (): Promise<void> => {
  await signOut()
}

const normalizeAction = (action: string): string => {
  return action.trim().toLowerCase().replace(/\.do$/i, '').replace(/^\//, '')
}

const hasOauthCallbackParams = (): boolean => {
  const searchParams = new URLSearchParams(window.location.search)
  return searchParams.has('code') || searchParams.has('state')
}

const clearOauthCallbackParams = (): void => {
  if (!hasOauthCallbackParams()) {
    return
  }
  const cleanUrl = `${window.location.origin}${window.location.pathname}`
  window.history.replaceState({}, document.title, cleanUrl)
}

const canonicalizeRole = (role: string): string => {
  const normalizedRole = role.trim().toUpperCase()

  if (normalizedRole.startsWith(CANONICAL_LEXIS_PROVINCIAL_CONCRETE_PREFIX)) {
    return `${CANONICAL_PROVINCIAL_CONCRETE_PREFIX}${normalizedRole.slice(CANONICAL_LEXIS_PROVINCIAL_CONCRETE_PREFIX.length)}`
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
  return role.startsWith('PROVINCIAL_SUBMITTER_')
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
  }
}

const resolveDefaultRoute = (capabilities: LexisSessionCapabilities): string => {
  const isReadOnlyUser = hasRole(capabilities.roles, ROLE_READ_ONLY)
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
    return isAdminUser ? PROD_RTM_ONLY_ROUTE : '/unauthorized'
  }

  if (isAdminUser) {
    return '/provincial/review'
  }

  if (isReadOnlyUser) {
    return '/provincial/application'
  }

  if (isIndustryUser) {
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
  const usesExternalLogin = isCognitoConfigured

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
        isCognitoConfigured && (authenticatedSessionRef.current || reason === 'idle-timeout')

      try {
        closeSessionWarning()
        setShowSessionExtendedMessage(false)
        apiService.clearCachedGetData()
        apiService.clearRecordVersions()
        clearAllPageDataCache()
        authenticatedSessionRef.current = false
        if (reason === 'idle-timeout') {
          markSessionExpiredLoginNotice()
        } else {
          clearSessionExpiredLoginNotice()
        }

        if (shouldSignOut && startFederatedLogout()) {
          return
        }

        setCapabilities(DEFAULT_CAPABILITIES)
        setIsLoading(false)
        redirectToLoginShell()

        if (shouldSignOut) {
          await cognitoSignOut()
        }
      } catch (error) {
        console.warn(`Unable to complete Cognito sign-out after ${reason}.`, error)
      } finally {
        sessionExpiryInFlightRef.current = false
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
        let orgUnitNo: string | null = null
        if (isCognitoConfigured) {
          let tokenReady = false
          const retryCount = hasOauthCallbackParams() ? 6 : 1
          for (let attempt = 0; attempt < retryCount; attempt += 1) {
            try {
              const { tokens } = (await fetchAuthSession({ forceRefresh: false })) ?? {}
              orgUnitNo = asNonBlankString(tokens?.idToken?.payload?.['custom:org_unit_no'])
              if (tokens?.accessToken) {
                tokenReady = true
                break
              }
            } catch {
              // Continue retry loop below.
            }

            if (attempt < retryCount - 1) {
              await new Promise((resolve) => setTimeout(resolve, 300))
            }
          }

          if (!tokenReady) {
            // The deployed capabilities endpoint is protected. Calling it after logout would
            // raise a second expiry event and consume the inactivity notice before it renders.
            if (sessionGenerationRef.current === refreshGeneration) {
              sessionExpiryInFlightRef.current = false
              authenticatedSessionRef.current = false
              setCapabilities(DEFAULT_CAPABILITIES)
            }
            return
          }

          clearOauthCallbackParams()
        }

        const data = await fetchSessionCapabilities()
        if (sessionGenerationRef.current === refreshGeneration) {
          sessionExpiryInFlightRef.current = false
          const nextCapabilities = sanitizeCapabilities(data, orgUnitNo)
          authenticatedSessionRef.current = nextCapabilities.authenticated
          setCapabilities(nextCapabilities)
        }
      } catch (error) {
        if (sessionGenerationRef.current === refreshGeneration) {
          console.warn('Unable to load session capabilities.', error)
          authenticatedSessionRef.current = false
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
    if (!isCognitoConfigured || !capabilities.authenticated) {
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
        void fetchAuthSession({ forceRefresh: false })
          .then((session) => {
            if (!session.tokens?.accessToken) {
              void expireSession('token-unavailable')
            }
          })
          .catch(() => {
            void expireSession('token-unavailable')
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
      if (isCognitoConfigured) {
        const providerName =
          provider === 'business-bceid' ? businessBceidProviderName : idirProviderName
        await signInWithRedirect({ provider: { custom: providerName } })
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
      apiService.clearCachedGetData()
      apiService.clearRecordVersions()
      clearAllPageDataCache()
      authenticatedSessionRef.current = false

      if (isCognitoConfigured && startFederatedLogout()) {
        return
      }

      setCapabilities(DEFAULT_CAPABILITIES)
      setIsLoading(false)
      redirectToLoginShell()

      if (isCognitoConfigured) {
        await cognitoSignOut()
      }
    } catch (error) {
      console.warn('Unable to complete Cognito sign-out. Clearing local auth state.', error)
    }
  }, [closeSessionWarning])

  const extendSession = useCallback(async () => {
    try {
      const { tokens } = (await fetchAuthSession({ forceRefresh: true })) ?? {}
      if (!tokens?.accessToken) {
        throw new Error('Cognito did not return a refreshed access token.')
      }
      setShowSessionExtendedMessage(true)
      closeSessionWarning(true)
    } catch {
      await expireSession('token-unavailable')
    }
  }, [closeSessionWarning, expireSession])

  const grantedActionSet = useMemo(() => {
    return new Set(capabilities.grantedActions.map(normalizeAction))
  }, [capabilities.grantedActions])

  const canPerform = useCallback(
    (action: string): boolean => {
      if (isProdRtmOnlyMode()) {
        return (
          hasRole(capabilities.roles, ROLE_ADMIN) &&
          normalizeAction(action) === normalizeAction(PROD_RTM_ONLY_ACTION)
        )
      }
      if (hasRole(capabilities.roles, ROLE_ADMIN)) {
        return true
      }
      const normalizedAction = normalizeAction(action)
      return grantedActionSet.has(normalizedAction)
    },
    [capabilities.roles, grantedActionSet],
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

  return (
    <AuthContext value={contextValue}>
      {children}
      {showSessionExtendedMessage && (
        <AppNotification
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
        onStayLoggedIn={() => void extendSession()}
        onLogOut={() => void logout()}
      />
    </AuthContext>
  )
}
