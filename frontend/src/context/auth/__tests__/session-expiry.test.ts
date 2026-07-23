import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearSessionExpiredLoginNotice,
  hasSessionExpiredLoginNotice,
  markSessionExpiredLoginNotice,
  notifySessionExpired,
  redirectToLoginShell,
  SESSION_EXPIRED_EVENT,
  SESSION_IDLE_TIMEOUT_MS,
  SESSION_IDLE_WARNING_MS,
} from '@/context/auth/session-expiry'

describe('session expiry helpers', () => {
  afterEach(() => {
    window.history.replaceState({}, document.title, '/')
    clearSessionExpiredLoginNotice()
  })

  it('emits session-expired events with the expiry reason', () => {
    const listener = vi.fn()
    window.addEventListener(SESSION_EXPIRED_EVENT, listener)

    notifySessionExpired('api-unauthorized')

    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener.mock.calls[0][0]).toMatchObject({
      detail: {
        reason: 'api-unauthorized',
      },
    })

    window.removeEventListener(SESSION_EXPIRED_EVENT, listener)
  })

  it('matches the FSPTS 30 minute authenticated idle expiry', () => {
    expect(SESSION_IDLE_TIMEOUT_MS).toBe(30 * 60 * 1000)
    expect(SESSION_IDLE_WARNING_MS).toBe(5 * 60 * 1000)
  })

  it('keeps the signed-out notice until the login shell consumes it', () => {
    expect(hasSessionExpiredLoginNotice()).toBe(false)

    markSessionExpiredLoginNotice()
    expect(hasSessionExpiredLoginNotice()).toBe(true)

    clearSessionExpiredLoginNotice()
    expect(hasSessionExpiredLoginNotice()).toBe(false)
  })

  it('returns expired users to the login shell through SPA navigation', () => {
    window.history.replaceState({}, document.title, '/admin')
    const popstateListener = vi.fn()
    window.addEventListener('popstate', popstateListener)

    redirectToLoginShell()

    expect(window.location.pathname).toBe('/')
    expect(popstateListener).toHaveBeenCalledTimes(1)

    window.removeEventListener('popstate', popstateListener)
  })
})
