import type { APIResponse, Page } from '@playwright/test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  deleteWithCsrf,
  getWithAuth,
  postWithCsrf,
  putWithCsrf,
} from '../../../e2e/utils/regression-auth'

const successfulResponse = { status: () => 200 } as APIResponse

type PageWithGetOptions = {
  accessToken?: string
  accessTokenAfterReload?: () => string | undefined
  advanceTimersWhenWaiting?: boolean
}

const accessTokenExpiringAt = (expiresAtSeconds: number, subject: string): string =>
  [
    Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url'),
    Buffer.from(
      JSON.stringify({ exp: expiresAtSeconds, sub: subject, token_use: 'access' }),
    ).toString('base64url'),
    'unsigned',
  ].join('.')

const unauthorizedResponse = () => {
  const dispose = vi.fn().mockResolvedValue(undefined)
  return {
    dispose,
    response: { dispose, status: () => 401 } as unknown as APIResponse,
  }
}

const pageWithGet = (get: ReturnType<typeof vi.fn>, options: PageWithGetOptions = {}) => {
  let accessToken = options.accessToken
  const waitForTimeout = vi.fn().mockImplementation(async (timeoutMs: number) => {
    if (options.advanceTimersWhenWaiting) {
      vi.advanceTimersByTime(timeoutMs)
    }
  })
  const reload = vi.fn().mockImplementation(async () => {
    accessToken = options.accessTokenAfterReload?.() ?? accessToken
  })
  const page = {
    context: () => ({ cookies: vi.fn().mockResolvedValue([]) }),
    evaluate: vi.fn().mockImplementation(async () => ({
      accessToken,
      cookieCandidateCount: 0,
      storageCandidateCount: accessToken ? 1 : 0,
    })),
    reload,
    request: { get },
    waitForTimeout,
  } as unknown as Page

  return {
    page,
    reload,
    setAccessToken: (nextAccessToken: string) => {
      accessToken = nextAccessToken
    },
    waitForTimeout,
  }
}

describe('getWithAuth', () => {
  it('retries a transient transport failure before returning the response', async () => {
    const get = vi
      .fn()
      .mockRejectedValueOnce(new Error('apiRequestContext.get: connect ETIMEDOUT'))
      .mockResolvedValue(successfulResponse)
    const { page, waitForTimeout } = pageWithGet(get)

    await expect(getWithAuth(page, '/api/lexis/shipping-reference-options')).resolves.toBe(
      successfulResponse,
    )
    expect(get).toHaveBeenCalledTimes(2)
    expect(waitForTimeout).toHaveBeenCalledTimes(1)
  })

  it('does not retry a non-transport failure', async () => {
    const error = new Error('request payload could not be serialized')
    const get = vi.fn().mockRejectedValue(error)
    const { page, waitForTimeout } = pageWithGet(get)

    await expect(getWithAuth(page, '/api/lexis/shipping-reference-options')).rejects.toBe(error)
    expect(get).toHaveBeenCalledTimes(1)
    expect(waitForTimeout).not.toHaveBeenCalled()
  })

  it('recovers when the fourth authenticated request succeeds', async () => {
    const get = vi
      .fn()
      .mockRejectedValueOnce(new Error('apiRequestContext.get: connect ECONNREFUSED first'))
      .mockRejectedValueOnce(new Error('apiRequestContext.get: connect ECONNREFUSED second'))
      .mockRejectedValueOnce(new Error('apiRequestContext.get: connect ECONNREFUSED third'))
      .mockResolvedValue(successfulResponse)
    const { page, waitForTimeout } = pageWithGet(get)

    await expect(getWithAuth(page, '/api/lexis/shipping-reference-options')).resolves.toBe(
      successfulResponse,
    )
    expect(get).toHaveBeenCalledTimes(4)
    expect(waitForTimeout).toHaveBeenCalledTimes(3)
  })

  it('preserves the final transient error after four attempts', async () => {
    const finalError = new Error('apiRequestContext.get: connect ETIMEDOUT final')
    const get = vi
      .fn()
      .mockRejectedValueOnce(new Error('apiRequestContext.get: connect ETIMEDOUT first'))
      .mockRejectedValueOnce(new Error('apiRequestContext.get: connect ETIMEDOUT second'))
      .mockRejectedValueOnce(new Error('apiRequestContext.get: connect ETIMEDOUT third'))
      .mockRejectedValueOnce(finalError)
    const { page, waitForTimeout } = pageWithGet(get)

    await expect(getWithAuth(page, '/api/lexis/shipping-reference-options')).rejects.toBe(
      finalError,
    )
    expect(get).toHaveBeenCalledTimes(4)
    expect(waitForTimeout).toHaveBeenCalledTimes(3)
  })

  it('refreshes a token whose expiration NumericDate is zero', async () => {
    vi.useFakeTimers()
    try {
      const startTime = new Date('2026-09-02T12:00:00.000Z')
      vi.setSystemTime(startTime)
      const expiredToken = accessTokenExpiringAt(0, 'epoch-expired-token')
      const refreshedToken = accessTokenExpiringAt(
        Math.floor(startTime.getTime() / 1_000) + 300,
        'refreshed-token',
      )
      const get = vi.fn().mockResolvedValue(successfulResponse)
      const { page, reload } = pageWithGet(get, {
        accessToken: expiredToken,
        accessTokenAfterReload: () => refreshedToken,
        advanceTimersWhenWaiting: true,
      })

      await expect(getWithAuth(page, '/api/lexis/probe')).resolves.toBe(successfulResponse)

      expect(reload).toHaveBeenCalledTimes(1)
      expect(get).toHaveBeenCalledWith(
        '/api/lexis/probe',
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: `Bearer ${refreshedToken}` }),
        }),
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('waits through the refresh window before reloading and retrying a near-expiry 401', async () => {
    vi.useFakeTimers()
    try {
      const startTime = new Date('2026-09-02T12:00:00.000Z')
      vi.setSystemTime(startTime)
      const startSeconds = Math.floor(startTime.getTime() / 1_000)
      const expiringToken = accessTokenExpiringAt(startSeconds + 10, 'expiring-token')
      const refreshedToken = accessTokenExpiringAt(startSeconds + 300, 'refreshed-token')
      const unauthorized = unauthorizedResponse()
      const get = vi.fn()
      const { page, reload } = pageWithGet(get, {
        accessToken: expiringToken,
        accessTokenAfterReload: () =>
          Date.now() > (startSeconds + 10) * 1_000 ? refreshedToken : undefined,
        advanceTimersWhenWaiting: true,
      })
      get
        .mockImplementationOnce(async () => {
          vi.advanceTimersByTime(6_000)
          return unauthorized.response
        })
        .mockResolvedValueOnce(successfulResponse)

      await expect(getWithAuth(page, '/api/lexis/probe')).resolves.toBe(successfulResponse)

      expect(reload).toHaveBeenCalledTimes(1)
      expect(get).toHaveBeenNthCalledWith(
        1,
        '/api/lexis/probe',
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: `Bearer ${expiringToken}` }),
        }),
      )
      expect(get).toHaveBeenNthCalledWith(
        2,
        '/api/lexis/probe',
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: `Bearer ${refreshedToken}` }),
        }),
      )
      expect(unauthorized.dispose).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('retries a 401 with a token that rotated while the request was in flight', async () => {
    const nowSeconds = Math.floor(Date.now() / 1_000)
    const rejectedToken = accessTokenExpiringAt(nowSeconds + 300, 'rejected-token')
    const rotatedToken = accessTokenExpiringAt(nowSeconds + 300, 'rotated-token')
    const unauthorized = unauthorizedResponse()
    const get = vi.fn()
    const { page, setAccessToken } = pageWithGet(get, { accessToken: rejectedToken })
    get
      .mockImplementationOnce(async () => {
        setAccessToken(rotatedToken)
        return unauthorized.response
      })
      .mockResolvedValueOnce(successfulResponse)

    await expect(getWithAuth(page, '/api/lexis/probe')).resolves.toBe(successfulResponse)

    expect(get).toHaveBeenNthCalledWith(
      1,
      '/api/lexis/probe',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: `Bearer ${rejectedToken}` }),
      }),
    )
    expect(get).toHaveBeenNthCalledWith(
      2,
      '/api/lexis/probe',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: `Bearer ${rotatedToken}` }),
      }),
    )
    expect(unauthorized.dispose).toHaveBeenCalledTimes(1)
  })

  it('does not retry a 401 when the rejected token is still current and valid', async () => {
    const validToken = accessTokenExpiringAt(Math.floor(Date.now() / 1_000) + 300, 'valid-token')
    const unauthorized = unauthorizedResponse()
    const get = vi.fn().mockResolvedValue(unauthorized.response)
    const { page, reload } = pageWithGet(get, { accessToken: validToken })

    await expect(getWithAuth(page, '/api/lexis/probe')).resolves.toBe(unauthorized.response)

    expect(get).toHaveBeenCalledTimes(1)
    expect(reload).not.toHaveBeenCalled()
    expect(unauthorized.dispose).not.toHaveBeenCalled()
  })
})

describe('mutating regression requests', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-14T21:52:00Z'))
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it.each([
    { method: 'post', send: postWithCsrf },
    { method: 'put', send: putWithCsrf },
    { method: 'delete', send: deleteWithCsrf },
  ])(
    'recovers $method only when the connection was refused before sending',
    async ({ method, send }) => {
      const request = vi
        .fn()
        .mockRejectedValueOnce(new Error(`apiRequestContext.${method}: connect ECONNREFUSED`))
        .mockResolvedValue(successfulResponse)
      const { page } = pageWithGet(vi.fn(), { advanceTimersWhenWaiting: true })
      Object.assign(page.request, { [method]: request })

      await expect(send(page, '/api/lexis/fixture')).resolves.toBe(successfulResponse)
      expect(request).toHaveBeenCalledTimes(2)
      // A redirect must be returned as a response: a failed connection after following it
      // would no longer establish that the original mutation was never sent.
      expect(request).toHaveBeenLastCalledWith(
        '/api/lexis/fixture',
        expect.objectContaining({
          maxRedirects: 0,
          maxRetries: 0,
          failOnStatusCode: false,
        }),
      )
    },
  )

  it('survives the observed connection outage without rerunning the surrounding report test', async () => {
    const start = Date.now()
    const request = vi.fn(async () => {
      if (Date.now() - start < 110_000) {
        vi.advanceTimersByTime(10_000)
        throw new Error('apiRequestContext.post: connect ECONNREFUSED')
      }
      return successfulResponse
    })
    const { page } = pageWithGet(vi.fn(), { advanceTimersWhenWaiting: true })
    Object.assign(page.request, { post: request })
    await expect(postWithCsrf(page, '/api/lexis/reports/transportReport')).resolves.toBe(
      successfulResponse,
    )
    expect(Date.now() - start).toBeGreaterThanOrEqual(110_000)
    expect(Date.now() - start).toBeLessThan(150_000)
  })

  it('fails after the bounded connection-recovery window', async () => {
    const start = Date.now()
    const request = vi
      .fn()
      .mockRejectedValue(new Error('apiRequestContext.post: connect ECONNREFUSED'))
    const { page } = pageWithGet(vi.fn(), { advanceTimersWhenWaiting: true })
    Object.assign(page.request, { post: request })
    await expect(postWithCsrf(page, '/api/lexis/fixture')).rejects.toThrow(
      'did not recover within 150s',
    )
    expect(Date.now() - start).toBe(150_000)
  })

  it.each([
    'apiRequestContext.post: read ECONNRESET',
    'apiRequestContext.post: Timeout 30000ms exceeded.',
    'apiRequestContext.post: socket hang up\nCall log:\n - data: connect ECONNREFUSED',
    'request payload could not be serialized',
  ])('does not replay an ambiguous or non-connection failure: %s', async (message) => {
    const error = new Error(message)
    const request = vi.fn().mockRejectedValue(error)
    const { page, waitForTimeout } = pageWithGet(vi.fn(), { advanceTimersWhenWaiting: true })
    Object.assign(page.request, { post: request })
    await expect(postWithCsrf(page, '/api/lexis/fixture')).rejects.toBe(error)
    expect(request).toHaveBeenCalledTimes(1)
    expect(waitForTimeout).not.toHaveBeenCalled()
  })

  it.each([302, 401, 403, 409, 500, 502, 503])(
    'does not replay an HTTP %s response',
    async (status) => {
      const response = { status: () => status } as APIResponse
      const request = vi.fn().mockResolvedValue(response)
      const { page, waitForTimeout } = pageWithGet(vi.fn(), { advanceTimersWhenWaiting: true })
      Object.assign(page.request, { post: request })
      await expect(postWithCsrf(page, '/api/lexis/fixture')).resolves.toBe(response)
      expect(request).toHaveBeenCalledTimes(1)
      expect(waitForTimeout).not.toHaveBeenCalled()
    },
  )
})
