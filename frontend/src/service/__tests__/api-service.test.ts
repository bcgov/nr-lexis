import { beforeEach, describe, expect, it, vi } from 'vitest'
import apiService from '@/service/api-service'

const { axiosClientMock, fetchAuthSessionMock, getRegisteredRequestInterceptor, getMock } =
  vi.hoisted(() => {
    const getMock = vi.fn()
    let registeredRequestInterceptor: ((config: any) => Promise<any>) | undefined
    const requestInterceptorUseMock = vi.fn((interceptor) => {
      registeredRequestInterceptor = interceptor
    })
    const responseInterceptorUseMock = vi.fn()

    return {
      fetchAuthSessionMock: vi.fn(),
      getRegisteredRequestInterceptor: () => registeredRequestInterceptor,
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

describe('api-service cached GET support', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiService.clearCachedGetData()
    fetchAuthSessionMock.mockResolvedValue({
      tokens: {
        accessToken: {
          payload: {
            sub: 'user-1',
            username: 'USER1',
            client_id: 'lexis',
          },
          toString: () => 'token',
        },
      },
    })
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

  it('clears cached GET data when a write request goes through the shared client', async () => {
    getMock
      .mockResolvedValueOnce(buildResponse({ count: 1 }))
      .mockResolvedValueOnce(buildResponse({ count: 2 }))

    await expect(apiService.getCachedData<{ count: number }>('/lexis/example')).resolves.toEqual({
      count: 1,
    })

    const requestInterceptor = getRegisteredRequestInterceptor()
    expect(requestInterceptor).toBeInstanceOf(Function)
    await requestInterceptor({
      method: 'post',
      headers: {},
    })

    await expect(apiService.getCachedData<{ count: number }>('/lexis/example')).resolves.toEqual({
      count: 2,
    })

    expect(getMock).toHaveBeenCalledTimes(2)
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

    const requestInterceptor = getRegisteredRequestInterceptor()
    expect(requestInterceptor).toBeInstanceOf(Function)
    await requestInterceptor({
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
