import { EventEmitter } from 'node:events'
import type { Locator, Page, Request, Response } from '@playwright/test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { gotoWithRecovery } from '../../../e2e/utils/navigation'

const target = 'https://lexis.example.test/federal?applicationNumber=private-fixture'
const request = (
  resourceType = 'document',
  path = '/federal',
  method = 'GET',
  errorText = 'net::ERR_CONNECTION_REFUSED',
) =>
  ({
    url: () => new URL(path, target).toString(),
    method: () => method,
    resourceType: () => resourceType,
    failure: () => ({ errorText }),
  }) as Request
const response = (status = 200, resource = request()) =>
  ({ status: () => status, request: () => resource }) as Response

const createPage = (rootText = 'An application page') => {
  const events = new EventEmitter()
  const goto = vi.fn().mockResolvedValue(response())
  const waitForTimeout = vi.fn(async (delay: number) => vi.advanceTimersByTime(delay))
  const waitFor = vi.fn().mockResolvedValue(undefined)
  const page = Object.assign(events, {
    goto,
    waitForTimeout,
    locator: () => ({
      count: async () => 1,
      innerText: async () => rootText,
    }),
  }) as unknown as Page
  return { page, events, goto, waitForTimeout, waitFor, ready: { waitFor } as unknown as Locator }
}

describe('regression navigation recovery', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-11T12:00:00Z'))
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('survives a 110-second connection interruption and removes listeners afterward', async () => {
    const { page, events, goto, ready } = createPage()
    const start = Date.now()
    goto.mockImplementation(async () => {
      if (Date.now() - start < 110_000) {
        vi.advanceTimersByTime(10_000)
        throw new Error('page.goto: net::ERR_CONNECTION_REFUSED')
      }
      return response()
    })

    await expect(gotoWithRecovery(page, target, { ready })).resolves.toBeDefined()
    expect(Date.now() - start).toBeGreaterThanOrEqual(110_000)
    expect(Date.now() - start).toBeLessThan(150_000)
    expect(events.eventNames()).toEqual([])
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain('private-fixture')
  })

  it('fails after the finite recovery window during a persistent outage', async () => {
    const { page, events, goto } = createPage()
    const start = Date.now()
    goto.mockImplementation(async (_url, options) => {
      vi.advanceTimersByTime(options.timeout)
      throw new Error('page.goto: net::ERR_TIMED_OUT')
    })

    await expect(gotoWithRecovery(page, target)).rejects.toThrow('did not recover within 150s')
    expect(Date.now() - start).toBe(150_000)
    expect(events.eventNames()).toEqual([])
  })

  it('reloads after a failed config script leaves a blank shell', async () => {
    const { page, events, goto, ready, waitFor, waitForTimeout } = createPage('')
    goto.mockImplementationOnce(async () => {
      events.emit('requestfailed', request('script', '/config.js'))
      return response()
    })
    waitFor.mockRejectedValueOnce(new Error('Expected heading did not render'))

    await gotoWithRecovery(page, target, { ready })
    expect(goto).toHaveBeenCalledTimes(2)
    expect(waitForTimeout).toHaveBeenCalledWith(5_000)
    expect(events.eventNames()).toEqual([])
  })

  it('recovers a stalled empty shell even before a resource failure is reported', async () => {
    const { page, goto, ready, waitFor, waitForTimeout } = createPage('')
    waitFor.mockRejectedValueOnce(new Error('App shell remained empty'))
    await gotoWithRecovery(page, target, { ready })
    expect(goto).toHaveBeenCalledTimes(2)
    expect(waitForTimeout).toHaveBeenCalledWith(5_000)
  })

  it.each(['net::ERR_CONNECTION_REFUSED', 'net::ERR_FAILED'])(
    'recovers a lazy module with %s after the surrounding application renders',
    async (errorText) => {
      const { page, events, goto, ready, waitFor } = createPage('Side navigation')
      goto.mockImplementationOnce(async () => {
        events.emit('requestfailed', request('script', '/assets/federal.js', 'GET', errorText))
        events.emit('pageerror', new Error('Failed to fetch dynamically imported module'))
        return response()
      })
      waitFor.mockRejectedValueOnce(new Error('Expected heading did not render'))
      await gotoWithRecovery(page, target, { ready })
      expect(goto).toHaveBeenCalledTimes(2)
    },
  )

  it('fails without retrying when a page error occurs despite successful readiness', async () => {
    const { page, events, goto, ready, waitFor, waitForTimeout } = createPage()
    const error = new Error('Application crashed')
    waitFor.mockImplementationOnce(async () => {
      events.emit('pageerror', error)
    })

    await expect(gotoWithRecovery(page, target, { ready })).rejects.toBe(error)
    expect(goto).toHaveBeenCalledTimes(1)
    expect(waitForTimeout).not.toHaveBeenCalled()
    expect(events.eventNames()).toEqual([])
  })

  it.each([400, 403, 404, 500])(
    'fails without retrying a frontend HTTP %s response despite successful readiness',
    async (status) => {
      const { page, events, goto, ready, waitFor, waitForTimeout } = createPage()
      waitFor.mockImplementationOnce(async () => {
        events.emit('response', response(status, request('script', '/assets/app.js')))
      })

      await expect(gotoWithRecovery(page, target, { ready })).rejects.toThrow(`HTTP ${status}`)
      expect(goto).toHaveBeenCalledTimes(1)
      expect(waitForTimeout).not.toHaveBeenCalled()
      expect(events.eventNames()).toEqual([])
    },
  )

  it.each([502, 503, 504])('recovers an HTTP %s frontend response', async (status) => {
    const { page, goto } = createPage()
    goto.mockResolvedValueOnce(response(status))
    await gotoWithRecovery(page, target)
    expect(goto).toHaveBeenCalledTimes(2)
  })

  it('does not retry a rendered page whose expected heading is missing', async () => {
    const { page, events, goto, ready, waitFor } = createPage()
    const error = new Error('Expected Federal heading is missing')
    waitFor.mockRejectedValue(error)
    await expect(gotoWithRecovery(page, target, { ready })).rejects.toBe(error)
    expect(goto).toHaveBeenCalledTimes(1)
    expect(events.eventNames()).toEqual([])
  })

  it.each(['pageerror', 'missing-script', 'denied-route'])(
    'does not retry an empty shell after %s',
    async (failure) => {
      const { page, events, goto, ready, waitFor } = createPage('')
      const error = new Error('Expected page is missing')
      goto.mockImplementation(async () => {
        if (failure === 'pageerror') events.emit('pageerror', new Error('Application crashed'))
        else
          events.emit(
            'response',
            response(failure === 'denied-route' ? 403 : 404, request('script', '/assets/app.js')),
          )
        return response()
      })
      waitFor.mockRejectedValue(error)
      await expect(gotoWithRecovery(page, target, { ready })).rejects.toBe(error)
      expect(goto).toHaveBeenCalledTimes(1)
    },
  )

  it('does not use failed API writes as a reason to reload', async () => {
    const { page, events, goto, ready, waitFor } = createPage()
    const error = new Error('Save outcome is unknown')
    goto.mockImplementation(async () => {
      events.emit('requestfailed', request('fetch', '/api/lexis/offer', 'POST'))
      return response()
    })
    waitFor.mockRejectedValue(error)
    await expect(gotoWithRecovery(page, target, { ready })).rejects.toBe(error)
    expect(goto).toHaveBeenCalledTimes(1)
  })

  it('does not retry a programming error or a closed page', async () => {
    const { page, goto } = createPage()
    const error = new Error('Target page, context or browser has been closed')
    goto.mockRejectedValue(error)
    await expect(gotoWithRecovery(page, target)).rejects.toBe(error)
    expect(goto).toHaveBeenCalledTimes(1)
  })
})
