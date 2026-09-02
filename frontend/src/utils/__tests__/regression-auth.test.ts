import type { APIResponse, Page } from '@playwright/test'
import { describe, expect, it, vi } from 'vitest'
import { getWithAuth } from '../../../e2e/utils/regression-auth'

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
