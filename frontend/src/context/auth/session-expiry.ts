export const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000
export const SESSION_IDLE_WARNING_MS = 5 * 60 * 1000
export const SESSION_EXPIRED_EVENT = 'lexis:session-expired'
const SESSION_EXPIRED_LOGIN_NOTICE_KEY = 'lexis.session-expired-login-notice'

export type SessionExpiredReason = 'idle-timeout' | 'token-unavailable' | 'api-unauthorized'

export type SessionExpiredEventDetail = {
  reason: SessionExpiredReason
}

export const notifySessionExpired = (reason: SessionExpiredReason): void => {
  window.dispatchEvent(
    new CustomEvent<SessionExpiredEventDetail>(SESSION_EXPIRED_EVENT, {
      detail: { reason },
    }),
  )
}

export const markSessionExpiredLoginNotice = (): void => {
  window.sessionStorage.setItem(SESSION_EXPIRED_LOGIN_NOTICE_KEY, 'true')
}

export const hasSessionExpiredLoginNotice = (): boolean => {
  return window.sessionStorage.getItem(SESSION_EXPIRED_LOGIN_NOTICE_KEY) === 'true'
}

export const clearSessionExpiredLoginNotice = (): void => {
  window.sessionStorage.removeItem(SESSION_EXPIRED_LOGIN_NOTICE_KEY)
}

export const redirectToLoginShell = (): void => {
  window.history.replaceState({}, document.title, '/')
  const event =
    typeof PopStateEvent === 'function'
      ? new PopStateEvent('popstate', { state: window.history.state })
      : new Event('popstate')
  window.dispatchEvent(event)
}
