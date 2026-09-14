import { EventEmitter } from 'node:events'
import { errors, type Locator, type Page, type Request, type Response } from '@playwright/test'
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

const failRequest = (events: EventEmitter, resource: Request) => {
  events.emit('request', resource)
  events.emit('requestfailed', resource)
}

const receiveResponse = (events: EventEmitter, result: Response) => {
  events.emit('request', result.request())
  events.emit('response', result)
}

const createPage = (rootText = 'An application page') => {
  const events = new EventEmitter()
  const goto = vi.fn().mockResolvedValue(response())
  const waitForTimeout = vi.fn(async (delay: number) => vi.advanceTimersByTime(delay))
  const waitFor = vi.fn().mockResolvedValue(undefined)
  const root = document.createElement('div')
  root.textContent = rootText
  const rootLocator = {
    count: vi.fn().mockResolvedValue(1),
    evaluate: vi.fn(async (evaluate: (element: HTMLElement) => unknown) => evaluate(root)),
  }
  const page = Object.assign(events, {
    goto,
    waitForTimeout,
    locator: () => rootLocator,
  }) as unknown as Page
  return {
    page,
    events,
    goto,
    waitForTimeout,
    waitFor,
    root,
    rootLocator,
    ready: { waitFor } as unknown as Locator,
  }
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
      failRequest(events, request('script', '/config.js'))
      return response()
    })
    waitFor.mockRejectedValueOnce(new errors.TimeoutError('Expected heading did not render'))

    await gotoWithRecovery(page, target, { ready })
    expect(goto).toHaveBeenCalledTimes(2)
    expect(waitForTimeout).toHaveBeenCalledWith(5_000)
    expect(events.eventNames()).toEqual([])
  })

  it('recovers a stalled empty shell even before a resource failure is reported', async () => {
    const { page, goto, ready, waitFor, waitForTimeout } = createPage('')
    waitFor.mockRejectedValueOnce(new errors.TimeoutError('App shell remained empty'))
    await gotoWithRecovery(page, target, { ready })
    expect(goto).toHaveBeenCalledTimes(2)
    expect(waitForTimeout).toHaveBeenCalledWith(5_000)
  })

  it.each(['net::ERR_CONNECTION_REFUSED', 'net::ERR_FAILED'])(
    'recovers a lazy module with %s after the surrounding application renders',
    async (errorText) => {
      const { page, events, goto, ready, waitFor } = createPage('Side navigation')
      goto.mockImplementationOnce(async () => {
        failRequest(events, request('script', '/assets/federal.js', 'GET', errorText))
        events.emit('pageerror', new Error('Failed to fetch dynamically imported module'))
        return response()
      })
      waitFor.mockRejectedValueOnce(new errors.TimeoutError('Expected heading did not render'))
      await gotoWithRecovery(page, target, { ready })
      expect(goto).toHaveBeenCalledTimes(2)
    },
  )

  it.each([
    { resourceType: 'script', failure: 'transport', readiness: 'visible' },
    { resourceType: 'script', failure: 'transport', readiness: 'omitted' },
    { resourceType: 'stylesheet', failure: 'transport', readiness: 'visible' },
    { resourceType: 'stylesheet', failure: 'transport', readiness: 'omitted' },
    { resourceType: 'script', failure: 'gateway', readiness: 'visible' },
    { resourceType: 'script', failure: 'gateway', readiness: 'omitted' },
    { resourceType: 'stylesheet', failure: 'gateway', readiness: 'visible' },
    { resourceType: 'stylesheet', failure: 'gateway', readiness: 'omitted' },
  ])(
    'recovers $resourceType $failure failure with readiness $readiness',
    async ({ resourceType, failure, readiness }) => {
      const { page, events, goto, ready } = createPage()
      goto.mockImplementationOnce(async () => {
        const resource = request(resourceType, '/assets/frontend')
        if (failure === 'transport') failRequest(events, resource)
        else receiveResponse(events, response(503, resource))
        return response()
      })

      await gotoWithRecovery(page, target, readiness === 'visible' ? { ready } : {})
      expect(goto).toHaveBeenCalledTimes(2)
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('frontend resource transport failure'),
      )
      expect(events.eventNames()).toEqual([])
    },
  )

  it.each(['visible', 'empty'])(
    'reports an unexplained module error with a %s shell',
    async (shell) => {
      const { page, events, goto, ready, waitFor, waitForTimeout } = createPage(
        shell === 'empty' ? '' : 'Side navigation',
      )
      const error = new Error('Failed to fetch dynamically imported module')
      goto.mockImplementationOnce(async () => {
        events.emit('pageerror', error)
        return response()
      })
      if (shell === 'empty')
        waitFor.mockRejectedValue(new errors.TimeoutError('Expected heading did not render'))

      await expect(gotoWithRecovery(page, target, { ready })).rejects.toBe(error)
      expect(goto).toHaveBeenCalledTimes(1)
      expect(waitForTimeout).not.toHaveBeenCalled()
    },
  )

  it('reports non-transient frontend request failures despite successful readiness', async () => {
    const { page, events, goto, ready, waitForTimeout } = createPage()
    goto.mockImplementationOnce(async () => {
      failRequest(events, request('script', '/assets/app.js', 'GET', 'net::ERR_BLOCKED_BY_CLIENT'))
      return response()
    })

    await expect(gotoWithRecovery(page, target, { ready })).rejects.toThrow(
      'net::ERR_BLOCKED_BY_CLIENT',
    )
    expect(goto).toHaveBeenCalledTimes(1)
    expect(waitForTimeout).not.toHaveBeenCalled()
  })

  it.each([false, true])(
    'handles gateway response followed by an abort of a different resource: %s',
    async (differentResource) => {
      const { page, events, goto, ready } = createPage()
      goto.mockImplementationOnce(async () => {
        const stylesheet = request('stylesheet', '/assets/app.css', 'GET', 'net::ERR_ABORTED')
        receiveResponse(events, response(503, stylesheet))
        failRequest(
          events,
          differentResource
            ? request('script', '/assets/app.js', 'GET', 'net::ERR_ABORTED')
            : stylesheet,
        )
        return response()
      })

      if (differentResource) {
        await expect(gotoWithRecovery(page, target, { ready })).rejects.toThrow('net::ERR_ABORTED')
        expect(goto).toHaveBeenCalledTimes(1)
      } else {
        await gotoWithRecovery(page, target, { ready })
        expect(goto).toHaveBeenCalledTimes(2)
      }
    },
  )

  it('does not let an interrupted stylesheet hide a module error', async () => {
    const { page, events, goto, ready } = createPage()
    const error = new Error('Failed to fetch dynamically imported module')
    goto.mockImplementationOnce(async () => {
      failRequest(events, request('stylesheet', '/assets/app.css'))
      events.emit('pageerror', error)
      return response()
    })

    await expect(gotoWithRecovery(page, target, { ready })).rejects.toBe(error)
    expect(goto).toHaveBeenCalledTimes(1)
  })

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
        receiveResponse(events, response(status, request('script', '/assets/app.js')))
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
    const error = new errors.TimeoutError('Expected Federal heading is missing')
    waitFor.mockRejectedValue(error)
    await expect(gotoWithRecovery(page, target, { ready })).rejects.toBe(error)
    expect(goto).toHaveBeenCalledTimes(1)
    expect(events.eventNames()).toEqual([])
  })

  it.each(['pageerror', 'missing-script', 'denied-route'])(
    'does not retry an empty shell after %s',
    async (failure) => {
      const { page, events, goto, ready, waitFor } = createPage('')
      const error = new errors.TimeoutError('Expected page is missing')
      goto.mockImplementation(async () => {
        if (failure === 'pageerror') events.emit('pageerror', new Error('Application crashed'))
        else
          receiveResponse(
            events,
            response(failure === 'denied-route' ? 403 : 404, request('script', '/assets/app.js')),
          )
        return response()
      })
      waitFor.mockRejectedValue(error)
      await expect(gotoWithRecovery(page, target, { ready })).rejects.toThrow(
        failure === 'pageerror'
          ? 'Application crashed'
          : failure === 'denied-route'
            ? 'HTTP 403'
            : 'HTTP 404',
      )
      expect(goto).toHaveBeenCalledTimes(1)
    },
  )

  it('preserves an application error when document navigation also times out', async () => {
    const { page, events, goto, waitForTimeout } = createPage()
    const error = new Error('Application crashed')
    goto.mockImplementation(async () => {
      events.emit('pageerror', error)
      throw new errors.TimeoutError('page.goto: Timeout 10000ms exceeded')
    })

    await expect(gotoWithRecovery(page, target)).rejects.toBe(error)
    expect(goto).toHaveBeenCalledTimes(1)
    expect(waitForTimeout).not.toHaveBeenCalled()
  })

  it('preserves an application error without inspecting the failed page', async () => {
    const { page, events, goto, ready, waitFor, rootLocator } = createPage('')
    const error = new Error('Application crashed')
    waitFor.mockImplementation(async () => {
      events.emit('pageerror', error)
      throw new errors.TimeoutError('Expected page is missing')
    })
    rootLocator.count.mockRejectedValue(new Error('Target page has been closed'))

    await expect(gotoWithRecovery(page, target, { ready })).rejects.toBe(error)
    expect(goto).toHaveBeenCalledTimes(1)
    expect(rootLocator.count).not.toHaveBeenCalled()
  })

  it('does not retry invalid readiness selectors on an empty shell', async () => {
    const { page, goto, ready, waitFor } = createPage('')
    const error = new Error('Unexpected token while parsing css selector')
    waitFor.mockRejectedValue(error)

    await expect(gotoWithRecovery(page, target, { ready })).rejects.toBe(error)
    expect(goto).toHaveBeenCalledTimes(1)
  })

  it('does not mistake rendered elements without text for an empty shell', async () => {
    const { page, goto, ready, waitFor, root } = createPage('')
    root.innerHTML = '<span role="progressbar" aria-label="Loading"></span>'
    const error = new errors.TimeoutError('Expected page is missing')
    waitFor.mockRejectedValue(error)

    await expect(gotoWithRecovery(page, target, { ready })).rejects.toBe(error)
    expect(goto).toHaveBeenCalledTimes(1)
  })

  it('does not use failed API writes as a reason to reload', async () => {
    const { page, events, goto, ready, waitFor } = createPage()
    const error = new Error('Save outcome is unknown')
    goto.mockImplementation(async () => {
      failRequest(events, request('fetch', '/api/lexis/offer', 'POST'))
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

  it.each(['document', 'script', 'stylesheet'])(
    'ignores a late %s abort from a timed-out attempt',
    async (resourceType) => {
      const { page, events, goto, ready } = createPage()
      const previousRequest = request(resourceType, '/frontend', 'GET', 'net::ERR_ABORTED')
      goto
        .mockImplementationOnce(async () => {
          events.emit('request', previousRequest)
          vi.advanceTimersByTime(10_000)
          throw new errors.TimeoutError('page.goto: Timeout 10000ms exceeded')
        })
        .mockImplementationOnce(async () => {
          events.emit('requestfailed', previousRequest)
          return response()
        })

      await gotoWithRecovery(page, target, { ready })
      expect(goto).toHaveBeenCalledTimes(2)
      expect(events.eventNames()).toEqual([])
    },
  )

  it.each([404, 503])(
    'ignores a late HTTP %s response from a timed-out attempt',
    async (status) => {
      const { page, events, goto, ready } = createPage()
      const previousRequest = request('script', '/assets/app.js')
      goto
        .mockImplementationOnce(async () => {
          events.emit('request', previousRequest)
          vi.advanceTimersByTime(10_000)
          throw new errors.TimeoutError('page.goto: Timeout 10000ms exceeded')
        })
        .mockImplementationOnce(async () => {
          events.emit('response', response(status, previousRequest))
          return response()
        })

      await gotoWithRecovery(page, target, { ready })
      expect(goto).toHaveBeenCalledTimes(2)
    },
  )

  it('still reports a new request failure when an earlier attempt used the same URL', async () => {
    const { page, events, goto, ready } = createPage()
    const previousRequest = request('script', '/assets/app.js', 'GET', 'net::ERR_ABORTED')
    goto
      .mockImplementationOnce(async () => {
        events.emit('request', previousRequest)
        throw new errors.TimeoutError('page.goto: Timeout 10000ms exceeded')
      })
      .mockImplementationOnce(async () => {
        events.emit('requestfailed', previousRequest)
        receiveResponse(events, response(404, request('script', '/assets/app.js')))
        return response()
      })

    await expect(gotoWithRecovery(page, target, { ready })).rejects.toThrow('HTTP 404')
    expect(goto).toHaveBeenCalledTimes(2)
    expect(events.eventNames()).toEqual([])
  })
})
