export const SESSION_IDLE_TIMEOUT_MS = 15 * 60 * 1000
export const SESSION_EXPIRED_EVENT = 'lexis:session-expired'

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

export const redirectToLoginShell = (): void => {
  window.history.replaceState({}, document.title, '/')
  const event =
    typeof PopStateEvent === 'function'
      ? new PopStateEvent('popstate', { state: window.history.state })
      : new Event('popstate')
  window.dispatchEvent(event)
}
