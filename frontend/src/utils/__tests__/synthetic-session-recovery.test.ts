import { EventEmitter } from 'node:events'
import type { APIResponse, Locator, Page } from '@playwright/test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const configResponse = (status = 200) => ({
  status: () => status,
  ok: () => status >= 200 && status < 300,
  text: async () => 'VITE_USER_POOLS_WEB_CLIENT_ID: "synthetic-client"',
  dispose: vi.fn().mockResolvedValue(undefined),
})

const syntheticPage = (get: ReturnType<typeof vi.fn>) => {
  const waitForTimeout = vi.fn(async (delay: number) => vi.advanceTimersByTime(delay))
  const addInitScript = vi.fn().mockResolvedValue(undefined)
  return {
    page: { request: { get }, waitForTimeout, addInitScript } as unknown as Page,
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
    vi.restoreAllMocks()
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
    const { installSyntheticCognitoSession } = await import('../../../e2e/utils')
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

    await expect(installSyntheticCognitoSession(page, sessionOptions)).resolves.toMatchObject({
      clientId: 'synthetic-client',
    })
    expect(Date.now() - start).toBeGreaterThanOrEqual(110_000)
    expect(Date.now() - start).toBeLessThan(150_000)
    expect(response.dispose).toHaveBeenCalledOnce()
    const callsAfterRecovery = get.mock.calls.length
    await installSyntheticCognitoSession(page, sessionOptions)
    expect(get).toHaveBeenCalledTimes(callsAfterRecovery)
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toMatch(
      /preview\.example|synthetic-client|SYNTHETIC\.TEST/,
    )
  })

  it.each([502, 503, 504])(
    'recovers runtime config HTTP %s and disposes responses',
    async (status) => {
      const { installSyntheticCognitoSession } = await import('../../../e2e/utils')
      const interrupted = configResponse(status)
      const success = configResponse()
      const get = vi.fn().mockResolvedValueOnce(interrupted).mockResolvedValueOnce(success)
      const { page, waitForTimeout } = syntheticPage(get)

      await expect(installSyntheticCognitoSession(page, sessionOptions)).resolves.toMatchObject({
        clientId: 'synthetic-client',
      })
      expect(get).toHaveBeenCalledTimes(2)
      expect(waitForTimeout).toHaveBeenCalledWith(5_000)
      expect(interrupted.dispose).toHaveBeenCalledOnce()
      expect(success.dispose).toHaveBeenCalledOnce()
    },
  )

  it.each([400, 403, 404, 500])('does not retry runtime config HTTP %s', async (status) => {
    const { installSyntheticCognitoSession } = await import('../../../e2e/utils')
    const response = configResponse(status)
    const get = vi.fn().mockResolvedValue(response)
    const { page, waitForTimeout, addInitScript } = syntheticPage(get)

    await expect(installSyntheticCognitoSession(page, sessionOptions)).rejects.toThrow(
      `Runtime config returned ${status}.`,
    )
    expect(get).toHaveBeenCalledOnce()
    expect(response.dispose).toHaveBeenCalledOnce()
    expect(waitForTimeout).not.toHaveBeenCalled()
    expect(addInitScript).not.toHaveBeenCalled()
  })

  it('stops at 150 seconds for a persistent runtime config outage', async () => {
    const { installSyntheticCognitoSession } = await import('../../../e2e/utils')
    const start = Date.now()
    const get = vi.fn(async (_url: string, options: { timeout: number }) => {
      vi.advanceTimersByTime(options.timeout)
      throw new Error('apiRequestContext.get: Timeout 10000ms exceeded.')
    })
    const { page, addInitScript } = syntheticPage(get)

    await expect(installSyntheticCognitoSession(page, sessionOptions)).rejects.toThrow(
      'runtime config did not recover within 150s',
    )
    expect(Date.now() - start).toBe(150_000)
    expect(addInitScript).not.toHaveBeenCalled()
  })

  it('does not retry an unrelated setup failure', async () => {
    const { installSyntheticCognitoSession } = await import('../../../e2e/utils')
    const get = vi.fn().mockRejectedValue(new Error('Target page has been closed'))
    const { page, waitForTimeout } = syntheticPage(get)

    await expect(installSyntheticCognitoSession(page, sessionOptions)).rejects.toThrow(
      'Target page has been closed',
    )
    expect(get).toHaveBeenCalledOnce()
    expect(waitForTimeout).not.toHaveBeenCalled()
  })
})
