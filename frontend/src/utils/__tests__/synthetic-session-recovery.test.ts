// @vitest-environment node

import { EventEmitter } from 'node:events'
import { User } from 'oidc-client-ts'
import type { APIResponse, Locator, Page } from '@playwright/test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const configResponse = (status = 200) => ({
  status: () => status,
  ok: () => status >= 200 && status < 300,
  text: async () =>
    'VITE_OIDC_CLIENT_ID: "synthetic-client", VITE_OIDC_ISSUER_URI: "https://issuer.example.test/realms/standard"',
  dispose: vi.fn().mockResolvedValue(undefined),
})

const syntheticPage = (get: ReturnType<typeof vi.fn>) => {
  const waitForTimeout = vi.fn(async (delay: number) => vi.advanceTimersByTime(delay))
  const addInitScript = vi.fn().mockResolvedValue(undefined)
  return {
    page: {
      request: { get },
      waitForTimeout,
      addInitScript,
      route: vi.fn().mockResolvedValue(undefined),
    } as unknown as Page,
    waitForTimeout,
    addInitScript,
  }
}

const sessionOptions = { username: 'SYNTHETIC.TEST', orgUnitNo: 'TEST' }

describe('synthetic session frontend recovery', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-14T12:00:00Z'))
    vi.stubEnv('E2E_BASE_URL', 'https://preview.example.test')
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('seeds a library-compatible OIDC user once without restoring a logged-out session', async () => {
    const { installSyntheticOidcSession } = await import('../../../e2e/utils')
    const { page, addInitScript } = syntheticPage(vi.fn().mockResolvedValue(configResponse()))
    const session = await installSyntheticOidcSession(page, sessionOptions)
    const [initialize, arguments_] = addInitScript.mock.calls[0]
    const values = new Map<string, string>()
    vi.stubGlobal('window', {
      location: { origin: 'https://preview.example.test' },
      sessionStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    })

    initialize(arguments_)
    const user = User.fromStorageString(values.get(session.storageKey)!)
    expect(user.profile.idir_username).toBe('SYNTHETIC.TEST')
    expect(user.profile.iss).toBe('https://issuer.example.test/realms/standard')
    expect(user.scope).toBe('openid profile email')
    expect(user.refresh_token).toBe('synthetic-refresh-token')
    expect(user.expired).toBe(false)
    expect(session.storageKey).toBe(
      'oidc.user:https://issuer.example.test/realms/standard:synthetic-client',
    )

    values.delete(session.storageKey)
    initialize(arguments_)
    expect(values.has(session.storageKey)).toBe(false)
  })

  it('uses bounded recovery for a synthetic route through a 110-second interruption', async () => {
    const { gotoSyntheticRoute } = await import('../../../e2e/utils')
    const start = Date.now()
    const response = { status: () => 200 }
    const goto = vi.fn(async () => {
      if (Date.now() - start < 110_000) {
        vi.advanceTimersByTime(10_000)
        throw new Error('page.goto: net::ERR_CONNECTION_REFUSED')
      }
      return response
    })
    const events = new EventEmitter()
    const page = Object.assign(events, {
      goto,
      waitForTimeout: async (delay: number) => vi.advanceTimersByTime(delay),
    }) as unknown as Page

    const waitFor = vi.fn().mockResolvedValue(undefined)
    const ready = { waitFor } as unknown as Locator
    await expect(gotoSyntheticRoute(page, '/provincial/application', { ready })).resolves.toBe(
      response,
    )
    expect(waitFor).toHaveBeenCalledOnce()
    expect(goto).toHaveBeenLastCalledWith(
      'https://preview.example.test/provincial/application',
      expect.objectContaining({ waitUntil: 'load', timeout: 10_000 }),
    )
    expect(Date.now() - start).toBeGreaterThanOrEqual(110_000)
    expect(Date.now() - start).toBeLessThan(150_000)
    expect(events.eventNames()).toEqual([])
  })

  it.each([
    'apiRequestContext.get: Timeout 10000ms exceeded.',
    'apiRequestContext.get: connect ECONNREFUSED',
  ])('recovers runtime config after a prolonged %s', async (message) => {
    const { installSyntheticOidcSession } = await import('../../../e2e/utils')
    const start = Date.now()
    const response = configResponse()
    const get = vi.fn(async () => {
      if (Date.now() - start < 110_000) {
        vi.advanceTimersByTime(10_000)
        throw new Error(message)
      }
      return response as unknown as APIResponse
    })
    const { page } = syntheticPage(get)

    await expect(installSyntheticOidcSession(page, sessionOptions)).resolves.toMatchObject({
      clientId: 'synthetic-client',
    })
    expect(Date.now() - start).toBeGreaterThanOrEqual(110_000)
    expect(Date.now() - start).toBeLessThan(150_000)
    expect(response.dispose).toHaveBeenCalledOnce()
    const callsAfterRecovery = get.mock.calls.length
    await installSyntheticOidcSession(page, sessionOptions)
    expect(get).toHaveBeenCalledTimes(callsAfterRecovery)
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toMatch(
      /preview\.example|synthetic-client|SYNTHETIC\.TEST/,
    )
  })

  it.each([502, 503, 504])(
    'recovers runtime config HTTP %s and disposes responses',
    async (status) => {
      const { installSyntheticOidcSession } = await import('../../../e2e/utils')
      const interrupted = configResponse(status)
      const success = configResponse()
      const get = vi.fn().mockResolvedValueOnce(interrupted).mockResolvedValueOnce(success)
      const { page, waitForTimeout } = syntheticPage(get)

      await expect(installSyntheticOidcSession(page, sessionOptions)).resolves.toMatchObject({
        clientId: 'synthetic-client',
      })
      expect(get).toHaveBeenCalledTimes(2)
      expect(waitForTimeout).toHaveBeenCalledWith(5_000)
      expect(interrupted.dispose).toHaveBeenCalledOnce()
      expect(success.dispose).toHaveBeenCalledOnce()
    },
  )

  it.each([400, 403, 404, 500])('does not retry runtime config HTTP %s', async (status) => {
    const { installSyntheticOidcSession } = await import('../../../e2e/utils')
    const response = configResponse(status)
    const get = vi.fn().mockResolvedValue(response)
    const { page, waitForTimeout, addInitScript } = syntheticPage(get)

    await expect(installSyntheticOidcSession(page, sessionOptions)).rejects.toThrow(
      `Runtime config returned ${status}.`,
    )
    expect(get).toHaveBeenCalledOnce()
    expect(response.dispose).toHaveBeenCalledOnce()
    expect(waitForTimeout).not.toHaveBeenCalled()
    expect(addInitScript).not.toHaveBeenCalled()
  })

  it('stops at 150 seconds for a persistent runtime config outage', async () => {
    const { installSyntheticOidcSession } = await import('../../../e2e/utils')
    const start = Date.now()
    const get = vi.fn(async (_url: string, options: { timeout: number }) => {
      vi.advanceTimersByTime(options.timeout)
      throw new Error('apiRequestContext.get: Timeout 10000ms exceeded.')
    })
    const { page, addInitScript } = syntheticPage(get)

    await expect(installSyntheticOidcSession(page, sessionOptions)).rejects.toThrow(
      'runtime config did not recover within 150s',
    )
    expect(Date.now() - start).toBe(150_000)
    expect(addInitScript).not.toHaveBeenCalled()
  })

  it('does not retry an unrelated setup failure', async () => {
    const { installSyntheticOidcSession } = await import('../../../e2e/utils')
    const get = vi.fn().mockRejectedValue(new Error('Target page has been closed'))
    const { page, waitForTimeout } = syntheticPage(get)

    await expect(installSyntheticOidcSession(page, sessionOptions)).rejects.toThrow(
      'Target page has been closed',
    )
    expect(get).toHaveBeenCalledOnce()
    expect(waitForTimeout).not.toHaveBeenCalled()
  })
})
