import type { AxiosRequestConfig } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SESSION_EXPIRED_EVENT } from '@/context/auth/session-expiry'
import apiService from '@/service/api-service'

type RequestInterceptor = (
  config: AxiosRequestConfig,
) => AxiosRequestConfig | Promise<AxiosRequestConfig>
type ResponseRejectedInterceptor = (error: unknown) => Promise<never>

const {
  axiosClientMock,
  fetchAuthSessionMock,
  getRegisteredRequestInterceptor,
  getRegisteredResponseRejectedInterceptor,
  getMock,
} = vi.hoisted(() => {
  const getMock = vi.fn()
  let registeredRequestInterceptor: RequestInterceptor | undefined
  let registeredResponseRejectedInterceptor: ResponseRejectedInterceptor | undefined
  const requestInterceptorUseMock = vi.fn((interceptor: RequestInterceptor) => {
    registeredRequestInterceptor = interceptor
  })
  const responseInterceptorUseMock = vi.fn(
    (_resolved: unknown, rejected: ResponseRejectedInterceptor) => {
      registeredResponseRejectedInterceptor = rejected
    },
  )

  return {
    fetchAuthSessionMock: vi.fn(),
    getRegisteredRequestInterceptor: () => registeredRequestInterceptor,
    getRegisteredResponseRejectedInterceptor: () => registeredResponseRejectedInterceptor,
    getMock,
    axiosClientMock: {
      get: getMock,
      interceptors: {
        request: {
          use: requestInterceptorUseMock,
        },
        response: {
          use: responseInterceptorUseMock,
        },
      },
    },
  }
})

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => axiosClientMock),
  },
}))

vi.mock('aws-amplify/auth', () => ({
  fetchAuthSession: fetchAuthSessionMock,
}))

const buildResponse = (data: unknown) => ({
  data,
  status: 200,
  statusText: 'OK',
  headers: {},
  config: {},
})

const buildSession = ({
  sub = 'user-1',
  username = 'USER1',
  clientId = 'lexis',
  token = 'token',
  includePayload = true,
} = {}) => ({
  tokens: {
    accessToken: {
      payload: includePayload
        ? {
            sub,
            username,
            client_id: clientId,
          }
        : undefined,
      toString: () => token,
    },
  },
})

const registeredRequestInterceptor = (): RequestInterceptor => {
  const requestInterceptor = getRegisteredRequestInterceptor()
  expect(requestInterceptor).toBeInstanceOf(Function)

  if (!requestInterceptor) {
    throw new Error('Expected API service to register a request interceptor.')
  }

  return requestInterceptor
}

const registeredResponseRejectedInterceptor = (): ResponseRejectedInterceptor => {
  const responseRejectedInterceptor = getRegisteredResponseRejectedInterceptor()
  expect(responseRejectedInterceptor).toBeInstanceOf(Function)

  if (!responseRejectedInterceptor) {
    throw new Error('Expected API service to register a response rejected interceptor.')
  }

  return responseRejectedInterceptor
}

describe('api-service cached GET support', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getMock.mockReset()
    fetchAuthSessionMock.mockReset()
    apiService.clearCachedGetData()
    fetchAuthSessionMock.mockResolvedValue(buildSession())
  })

  it('coalesces matching in-flight cached GET requests', async () => {
    let resolveGet: (response: ReturnType<typeof buildResponse>) => void = () => {}
    getMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveGet = resolve
      }),
    )

    const firstRequest = apiService.getCachedData<{ rows: string[] }>('/lexis/example', {
      params: {
        b: '2',
        a: '1',
      },
    })
    const secondRequest = apiService.getCachedData<{ rows: string[] }>('/lexis/example', {
      params: new URLSearchParams('a=1&b=2'),
    })

    await vi.waitFor(() => {
      expect(getMock).toHaveBeenCalledTimes(1)
    })

    resolveGet(buildResponse({ rows: ['ok'] }))

    await expect(Promise.all([firstRequest, secondRequest])).resolves.toEqual([
      { rows: ['ok'] },
      { rows: ['ok'] },
    ])
  })

  it('serves matching cached GETs within the ttl', async () => {
    getMock.mockResolvedValueOnce(buildResponse({ count: 1 }))

    await expect(
      apiService.getCachedData<{ count: number }>('/lexis/example', {
        params: {
          id: '123',
        },
      }),
    ).resolves.toEqual({ count: 1 })

    await expect(
      apiService.getCachedData<{ count: number }>('/lexis/example', {
        params: {
          id: '123',
        },
      }),
    ).resolves.toEqual({ count: 1 })

    expect(getMock).toHaveBeenCalledTimes(1)
  })

  it('uses the resolved auth token on cached GET requests', async () => {
    getMock.mockResolvedValueOnce(buildResponse({ count: 1 }))

    await expect(apiService.getCachedData<{ count: number }>('/lexis/example')).resolves.toEqual({
      count: 1,
    })

    expect(getMock).toHaveBeenCalledWith(
      '/lexis/example',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer token',
        }),
      }),
    )
  })

  it('keeps custom cached GET keys separated by authenticated user', async () => {
    fetchAuthSessionMock
      .mockResolvedValueOnce(buildSession({ sub: 'user-1', username: 'USER1', token: 'token-1' }))
      .mockResolvedValueOnce(buildSession({ sub: 'user-2', username: 'USER2', token: 'token-2' }))
      .mockResolvedValueOnce(buildSession({ sub: 'user-1', username: 'USER1', token: 'token-1' }))
    getMock
      .mockResolvedValueOnce(buildResponse({ count: 1 }))
      .mockResolvedValueOnce(buildResponse({ count: 2 }))

    await expect(
      apiService.getCachedData<{ count: number }>('/lexis/example', undefined, {
        cacheKey: 'shared-key',
      }),
    ).resolves.toEqual({ count: 1 })
    await expect(
      apiService.getCachedData<{ count: number }>('/lexis/example', undefined, {
        cacheKey: 'shared-key',
      }),
    ).resolves.toEqual({ count: 2 })
    await expect(
      apiService.getCachedData<{ count: number }>('/lexis/example', undefined, {
        cacheKey: 'shared-key',
      }),
    ).resolves.toEqual({ count: 1 })

    expect(getMock).toHaveBeenCalledTimes(2)
  })

  it('keeps cached GET keys separated by token when auth claims are unavailable', async () => {
    fetchAuthSessionMock
      .mockResolvedValueOnce(buildSession({ token: 'opaque-token-1', includePayload: false }))
      .mockResolvedValueOnce(buildSession({ token: 'opaque-token-2', includePayload: false }))
      .mockResolvedValueOnce(buildSession({ token: 'opaque-token-1', includePayload: false }))
    getMock
      .mockResolvedValueOnce(buildResponse({ count: 1 }))
      .mockResolvedValueOnce(buildResponse({ count: 2 }))

    await expect(
      apiService.getCachedData<{ count: number }>('/lexis/example', undefined, {
        cacheKey: 'shared-key',
      }),
    ).resolves.toEqual({ count: 1 })
    await expect(
      apiService.getCachedData<{ count: number }>('/lexis/example', undefined, {
        cacheKey: 'shared-key',
      }),
    ).resolves.toEqual({ count: 2 })
    await expect(
      apiService.getCachedData<{ count: number }>('/lexis/example', undefined, {
        cacheKey: 'shared-key',
      }),
    ).resolves.toEqual({ count: 1 })

    expect(getMock).toHaveBeenCalledTimes(2)
  })

  it('does not cache GETs when the auth cache scope cannot be resolved', async () => {
    fetchAuthSessionMock.mockRejectedValue(new Error('session unavailable'))
    getMock
      .mockResolvedValueOnce(buildResponse({ count: 1 }))
      .mockResolvedValueOnce(buildResponse({ count: 2 }))

    await expect(apiService.getCachedData<{ count: number }>('/lexis/example')).resolves.toEqual({
      count: 1,
    })
    await expect(apiService.getCachedData<{ count: number }>('/lexis/example')).resolves.toEqual({
      count: 2,
    })

    expect(getMock).toHaveBeenCalledTimes(2)
  })

  it('does not cache GETs with an explicit authorization header', async () => {
    getMock
      .mockResolvedValueOnce(buildResponse({ count: 1 }))
      .mockResolvedValueOnce(buildResponse({ count: 2 }))

    const config = {
      headers: {
        Authorization: 'Bearer external-token',
      },
    }

    await expect(
      apiService.getCachedData<{ count: number }>('/lexis/example', config),
    ).resolves.toEqual({
      count: 1,
    })
    await expect(
      apiService.getCachedData<{ count: number }>('/lexis/example', config),
    ).resolves.toEqual({
      count: 2,
    })

    expect(getMock).toHaveBeenCalledTimes(2)
  })

  it('does not cache GETs with an explicit authorization header on AxiosHeaders-style objects', async () => {
    getMock
      .mockResolvedValueOnce(buildResponse({ count: 1 }))
      .mockResolvedValueOnce(buildResponse({ count: 2 }))

    const config: AxiosRequestConfig = {
      headers: {
        get: (name: string) =>
          name.toLowerCase() === 'authorization' ? 'Bearer external-token' : undefined,
        has: (name: string) => name.toLowerCase() === 'authorization',
        toJSON: () => ({}),
      } as unknown as AxiosRequestConfig['headers'],
    }

    await expect(
      apiService.getCachedData<{ count: number }>('/lexis/example', config),
    ).resolves.toEqual({
      count: 1,
    })
    await expect(
      apiService.getCachedData<{ count: number }>('/lexis/example', config),
    ).resolves.toEqual({
      count: 2,
    })

    expect(getMock).toHaveBeenCalledTimes(2)
  })

  it('refetches cached GETs after the ttl expires', async () => {
    const dateNowSpy = vi.spyOn(Date, 'now')
    dateNowSpy.mockReturnValue(1_000)
    getMock
      .mockResolvedValueOnce(buildResponse({ count: 1 }))
      .mockResolvedValueOnce(buildResponse({ count: 2 }))

    await expect(
      apiService.getCachedData<{ count: number }>('/lexis/example', undefined, { ttlMs: 5 }),
    ).resolves.toEqual({ count: 1 })

    dateNowSpy.mockReturnValue(1_004)
    await expect(
      apiService.getCachedData<{ count: number }>('/lexis/example', undefined, { ttlMs: 5 }),
    ).resolves.toEqual({ count: 1 })

    dateNowSpy.mockReturnValue(1_006)
    await expect(
      apiService.getCachedData<{ count: number }>('/lexis/example', undefined, { ttlMs: 5 }),
    ).resolves.toEqual({ count: 2 })

    expect(getMock).toHaveBeenCalledTimes(2)
    dateNowSpy.mockRestore()
  })

  it('evicts the least recently used cached GET when the cache is full', async () => {
    getMock.mockImplementation((path: string) => Promise.resolve(buildResponse({ path })))

    for (let index = 0; index < 150; index += 1) {
      await expect(
        apiService.getCachedData<{ path: string }>(`/lexis/example/${index}`),
      ).resolves.toEqual({
        path: `/lexis/example/${index}`,
      })
    }

    await expect(apiService.getCachedData<{ path: string }>('/lexis/example/0')).resolves.toEqual({
      path: '/lexis/example/0',
    })
    await expect(apiService.getCachedData<{ path: string }>('/lexis/example/150')).resolves.toEqual(
      {
        path: '/lexis/example/150',
      },
    )
    await expect(apiService.getCachedData<{ path: string }>('/lexis/example/1')).resolves.toEqual({
      path: '/lexis/example/1',
    })

    expect(getMock).toHaveBeenCalledTimes(152)
  })

  it.each(['post', 'put', 'patch', 'delete'])(
    'clears cached GET data when a %s request goes through the shared client',
    async (method) => {
      apiService.clearCachedGetData()
      getMock.mockReset()
      getMock
        .mockResolvedValueOnce(buildResponse({ count: 1 }))
        .mockResolvedValueOnce(buildResponse({ count: 2 }))

      await expect(apiService.getCachedData<{ count: number }>('/lexis/example')).resolves.toEqual({
        count: 1,
      })

      await registeredRequestInterceptor()({
        method,
        headers: {},
      })

      await expect(apiService.getCachedData<{ count: number }>('/lexis/example')).resolves.toEqual({
        count: 2,
      })

      expect(getMock).toHaveBeenCalledTimes(2)
    },
  )

  it('adds auth headers when the request interceptor receives a config without headers', async () => {
    const result = await registeredRequestInterceptor()({
      method: 'get',
    })

    expect(result.headers).toEqual(
      expect.objectContaining({
        Authorization: 'Bearer token',
      }),
    )
  })

  it('emits a session-expired event when an auth token cannot be resolved', async () => {
    const listener = vi.fn()
    window.addEventListener(SESSION_EXPIRED_EVENT, listener)
    fetchAuthSessionMock.mockRejectedValueOnce(new Error('session unavailable'))

    const result = await registeredRequestInterceptor()({
      method: 'get',
      headers: {},
    })

    expect(result.headers).toEqual({})
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        detail: { reason: 'token-unavailable' },
      }),
    )

    window.removeEventListener(SESSION_EXPIRED_EVENT, listener)
  })

  it.each([401, 403])(
    'emits a session-expired event and clears cached GETs on API %s responses',
    async (status) => {
      const listener = vi.fn()
      window.addEventListener(SESSION_EXPIRED_EVENT, listener)
      getMock
        .mockResolvedValueOnce(buildResponse({ count: 1 }))
        .mockResolvedValueOnce(buildResponse({ count: 2 }))

      await expect(apiService.getCachedData<{ count: number }>('/lexis/example')).resolves.toEqual({
        count: 1,
      })

      const unauthorizedError = { response: { status } }
      await expect(registeredResponseRejectedInterceptor()(unauthorizedError)).rejects.toBe(
        unauthorizedError,
      )

      await expect(apiService.getCachedData<{ count: number }>('/lexis/example')).resolves.toEqual({
        count: 2,
      })
      expect(listener).toHaveBeenCalledTimes(1)
      expect(listener.mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({
          detail: { reason: 'api-unauthorized' },
        }),
      )

      window.removeEventListener(SESSION_EXPIRED_EVENT, listener)
    },
  )

  it('adds auth headers through AxiosHeaders-style setters when available', async () => {
    const headerValues: Record<string, string> = {}

    await registeredRequestInterceptor()({
      method: 'get',
      headers: {
        get: (name: string) => headerValues[name],
        has: (name: string) => Object.prototype.hasOwnProperty.call(headerValues, name),
        set: (name: string, value: string) => {
          headerValues[name] = value
        },
        toJSON: () => headerValues,
      } as unknown as AxiosRequestConfig['headers'],
    })

    expect(headerValues.Authorization).toBe('Bearer token')
  })

  it('keeps cached GET data when another GET request goes through the shared client', async () => {
    getMock
      .mockResolvedValueOnce(buildResponse({ count: 1 }))
      .mockResolvedValueOnce(buildResponse({ count: 2 }))

    await expect(apiService.getCachedData<{ count: number }>('/lexis/example')).resolves.toEqual({
      count: 1,
    })

    await registeredRequestInterceptor()({
      method: 'get',
      headers: {},
    })

    await expect(apiService.getCachedData<{ count: number }>('/lexis/example')).resolves.toEqual({
      count: 1,
    })

    expect(getMock).toHaveBeenCalledTimes(1)
  })

  it('does not cache an in-flight GET that resolves after a write clears the cache', async () => {
    let resolveStaleGet: (response: ReturnType<typeof buildResponse>) => void = () => {}
    getMock
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveStaleGet = resolve
        }),
      )
      .mockResolvedValueOnce(buildResponse({ count: 2 }))

    const staleRequest = apiService.getCachedData<{ count: number }>('/lexis/example')

    await vi.waitFor(() => {
      expect(getMock).toHaveBeenCalledTimes(1)
    })

    await registeredRequestInterceptor()({
      method: 'post',
      headers: {},
    })

    resolveStaleGet(buildResponse({ count: 1 }))

    await expect(staleRequest).resolves.toEqual({ count: 1 })
    await expect(apiService.getCachedData<{ count: number }>('/lexis/example')).resolves.toEqual({
      count: 2,
    })

    expect(getMock).toHaveBeenCalledTimes(2)
  })
})
