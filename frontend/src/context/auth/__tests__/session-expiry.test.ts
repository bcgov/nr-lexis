import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  notifySessionExpired,
  redirectToLoginShell,
  SESSION_EXPIRED_EVENT,
  SESSION_IDLE_TIMEOUT_MS,
} from '@/context/auth/session-expiry'

describe('session expiry helpers', () => {
  afterEach(() => {
    window.history.replaceState({}, document.title, '/')
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

  it('standardizes authenticated idle expiry to 15 minutes', () => {
    expect(SESSION_IDLE_TIMEOUT_MS).toBe(15 * 60 * 1000)
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
