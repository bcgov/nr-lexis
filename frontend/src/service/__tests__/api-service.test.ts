import type { AxiosRequestConfig, AxiosResponse } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SESSION_EXPIRED_EVENT } from '@/context/auth/session-expiry'
import {
  buildPageDataCacheKey,
  clearAllPageDataCache,
  getPageDataCache,
  getPageDataCacheGeneration,
  setPageDataCache,
} from '@/pages/shared/page-data-cache'
import apiService from '@/service/api-service'
import {
  clearActiveForestClientNumber,
  FOREST_CLIENT_SELECTION_HEADER,
  setActiveForestClientNumber,
} from '@/service/forest-client-selection'
import {
  OPTIMISTIC_CONFLICT_EVENT,
  RECORD_VERSION_HEADER,
  type OptimisticConflictEvent,
} from '@/service/optimistic-conflict'

type RequestInterceptor = (
  config: AxiosRequestConfig,
) => AxiosRequestConfig | Promise<AxiosRequestConfig>
type ResponseRejectedInterceptor = (error: unknown) => Promise<AxiosResponse<unknown>>

const {
  axiosClientMock,
  fetchAuthSessionMock,
  getRegisteredRequestInterceptor,
  getRegisteredResponseResolvedInterceptor,
  getRegisteredResponseRejectedInterceptor,
  getMock,
  reloadPageIgnoringUnsavedChangesMock,
  requestMock,
} = vi.hoisted(() => {
  const getMock = vi.fn()
  const requestMock = vi.fn()
  let registeredRequestInterceptor: RequestInterceptor | undefined
  let registeredResponseResolvedInterceptor:
    | ((response: AxiosResponse<unknown>) => AxiosResponse<unknown>)
    | undefined
  let registeredResponseRejectedInterceptor: ResponseRejectedInterceptor | undefined
  const requestInterceptorUseMock = vi.fn((interceptor: RequestInterceptor) => {
    registeredRequestInterceptor = interceptor
  })
  const responseInterceptorUseMock = vi.fn(
    (
      resolved: (response: AxiosResponse<unknown>) => AxiosResponse<unknown>,
      rejected: ResponseRejectedInterceptor,
    ) => {
      registeredResponseResolvedInterceptor = resolved
      registeredResponseRejectedInterceptor = rejected
    },
  )

  return {
    fetchAuthSessionMock: vi.fn(),
    getRegisteredRequestInterceptor: () => registeredRequestInterceptor,
    getRegisteredResponseResolvedInterceptor: () => registeredResponseResolvedInterceptor,
    getRegisteredResponseRejectedInterceptor: () => registeredResponseRejectedInterceptor,
    getMock,
    reloadPageIgnoringUnsavedChangesMock: vi.fn(),
    requestMock,
    axiosClientMock: {
      get: getMock,
      request: requestMock,
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

vi.mock('@/utils/page-unload', () => ({
  reloadPageIgnoringUnsavedChanges: reloadPageIgnoringUnsavedChangesMock,
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

const registeredResponseResolvedInterceptor = () => {
  const responseResolvedInterceptor = getRegisteredResponseResolvedInterceptor()
  expect(responseResolvedInterceptor).toBeInstanceOf(Function)

  if (!responseResolvedInterceptor) {
    throw new Error('Expected API service to register a response interceptor.')
  }

  return responseResolvedInterceptor
}

describe('api-service cached GET support', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getMock.mockReset()
    requestMock.mockReset()
    fetchAuthSessionMock.mockReset()
    apiService.clearCachedGetData()
    apiService.clearRecordVersions()
    clearAllPageDataCache()
    clearActiveForestClientNumber()
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

  it('does not cache a 204 GET response', async () => {
    getMock
      .mockResolvedValueOnce({
        ...buildResponse(undefined),
        status: 204,
        statusText: 'No Content',
      })
      .mockResolvedValueOnce(buildResponse({ count: 2 }))

    await expect(apiService.getCachedData<unknown>('/lexis/example')).resolves.toBeUndefined()
    await expect(apiService.getCachedData<{ count: number }>('/lexis/example')).resolves.toEqual({
      count: 2,
    })

    expect(getMock).toHaveBeenCalledTimes(2)
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
    'clears cached GET and page data when a %s request starts',
    async (method) => {
      apiService.clearCachedGetData()
      getMock.mockReset()
      const pageCacheKey = buildPageDataCacheKey('status-search', 'user-1', { status: 'APP' })
      setPageDataCache(pageCacheKey, { rows: ['cached'] }, getPageDataCacheGeneration())
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

      expect(getPageDataCache(pageCacheKey)).toBeNull()
      await expect(apiService.getCachedData<{ count: number }>('/lexis/example')).resolves.toEqual({
        count: 2,
      })

      expect(getMock).toHaveBeenCalledTimes(2)
    },
  )

  it('attaches the active detail record version only to a matching mutation request', async () => {
    const previousPath = window.location.pathname
    window.history.replaceState({}, '', '/provincial/application/999000001')
    apiService.registerRecordVersion(
      'application',
      '999000001',
      {
        headers: { [RECORD_VERSION_HEADER]: 'version-2' },
        data: { applicationNumber: '999000001', remarks: 'Original remarks' },
      } as unknown as AxiosResponse<unknown>,
      '/lexis/applications/999000001',
    )

    const result = await registeredRequestInterceptor()({
      method: 'put',
      url: '/lexis/rpc/application-details/application-summary',
      data: new URLSearchParams({ applicationNumber: '999000001' }),
      headers: {},
    })

    expect(result.headers).toEqual(
      expect.objectContaining({ [RECORD_VERSION_HEADER]: 'version-2' }),
    )
    window.history.replaceState({}, '', previousPath)
  })

  it('does not attach a detail version to unrelated writes or another record', async () => {
    const previousPath = window.location.pathname
    window.history.replaceState({}, '', '/provincial/application/999000001')
    apiService.registerRecordVersion(
      'application',
      '999000001',
      {
        headers: { [RECORD_VERSION_HEADER]: 'version-2' },
        data: { applicationNumber: '999000001' },
      } as unknown as AxiosResponse<unknown>,
      '/lexis/applications/999000001',
    )

    const unrelated = await registeredRequestInterceptor()({
      method: 'post',
      url: '/lexis/reports/application-report',
      data: { applicationNumber: '99999' },
      headers: {},
    })
    const anotherApplication = await registeredRequestInterceptor()({
      method: 'post',
      url: '/lexis/rpc/application-details/remark',
      data: new URLSearchParams({ applicationNumber: '999000002' }),
      headers: {},
    })

    expect(unrelated.headers).not.toEqual(
      expect.objectContaining({ [RECORD_VERSION_HEADER]: expect.anything() }),
    )
    expect(anotherApplication.headers).not.toEqual(
      expect.objectContaining({ [RECORD_VERSION_HEADER]: expect.anything() }),
    )
    window.history.replaceState({}, '', previousPath)
  })

  it.each([
    {
      route: '/federal/application/700123',
      recordType: 'federal-application' as const,
      recordId: '700123',
      request: { method: 'post', url: '/lexis/federal/applications/700123/status' },
    },
    {
      route: '/provincial/exemption/EX-9',
      recordType: 'exemption' as const,
      recordId: 'EX-9',
      request: {
        method: 'post',
        url: '/lexis/rpc/exemption-details/exemption/update',
        data: new URLSearchParams({ legacyExemptionNumber: 'EX-9' }),
      },
    },
    {
      route: '/provincial/permit/777',
      recordType: 'permit' as const,
      recordId: '777',
      request: {
        method: 'post',
        url: '/lexis/rpc/permit-details/update-shipping',
        data: new URLSearchParams({ permitNumber: '777' }),
      },
    },
    {
      route: '/provincial/offers/81001',
      recordType: 'offer' as const,
      recordId: '81001',
      request: {
        method: 'post',
        url: '/lexis/rpc/offer-details/offer/update',
        data: new URLSearchParams({ exportPurchaseOfferNumber: '81001' }),
      },
    },
  ])('attaches the $recordType detail version to its matching mutation', async (testCase) => {
    const previousPath = window.location.pathname
    window.history.replaceState({}, '', testCase.route)
    apiService.registerRecordVersion(
      testCase.recordType,
      testCase.recordId,
      {
        headers: { [RECORD_VERSION_HEADER]: `${testCase.recordType}-version` },
        data: {},
      } as unknown as AxiosResponse<unknown>,
      '/detail',
    )

    const result = await registeredRequestInterceptor()({
      ...testCase.request,
      headers: {},
    })

    expect(result.headers).toEqual(
      expect.objectContaining({
        [RECORD_VERSION_HEADER]: `${testCase.recordType}-version`,
      }),
    )
    window.history.replaceState({}, '', previousPath)
  })

  it('keeps the primary detail version when a supplemental source is newer', async () => {
    const previousPath = window.location.pathname
    window.history.replaceState({}, '', '/provincial/permit/777')
    const mutation = {
      method: 'post',
      url: '/lexis/rpc/permit-details/update-permit',
      data: new URLSearchParams({ permitNumber: '777' }),
      headers: {},
    }

    apiService.registerRecordVersion(
      'permit',
      '777',
      {
        headers: { [RECORD_VERSION_HEADER]: 'primary-version-1' },
        data: { permitNumber: '777', permitStatus: 'ACT' },
      } as unknown as AxiosResponse<unknown>,
      '/lexis/permits/777',
    )
    apiService.registerRecordVersion(
      'permit',
      '777',
      {
        headers: {},
        data: { overrideEnabled: true },
      } as unknown as AxiosResponse<unknown>,
      '/lexis/rpc/permit-details/edit-context',
      { params: { permitNumber: '777' } },
    )

    const staleMainFormMutation = await registeredRequestInterceptor()(mutation)
    expect(staleMainFormMutation.headers).toEqual(
      expect.objectContaining({ [RECORD_VERSION_HEADER]: 'primary-version-1' }),
    )

    apiService.registerRecordVersion(
      'permit',
      '777',
      {
        headers: { [RECORD_VERSION_HEADER]: 'primary-version-3' },
        data: { permitNumber: '777', permitStatus: 'COM' },
      } as unknown as AxiosResponse<unknown>,
      '/lexis/permits/777',
    )
    apiService.registerRecordVersion(
      'permit',
      '777',
      {
        headers: { [RECORD_VERSION_HEADER]: 'supplemental-version-4' },
        data: { overrideEnabled: false },
      } as unknown as AxiosResponse<unknown>,
      '/lexis/rpc/permit-details/edit-context',
      { params: { permitNumber: '777' } },
    )

    const refreshedMainFormMutation = await registeredRequestInterceptor()({
      ...mutation,
      headers: {},
    })
    expect(refreshedMainFormMutation.headers).toEqual(
      expect.objectContaining({ [RECORD_VERSION_HEADER]: 'primary-version-3' }),
    )

    window.history.replaceState({}, '', previousPath)
  })

  it('updates a snapshot only from a successful matching mutation response', async () => {
    const previousPath = window.location.pathname
    window.history.replaceState({}, '', '/provincial/permit/777')
    apiService.registerRecordVersion(
      'permit',
      '777',
      {
        headers: { [RECORD_VERSION_HEADER]: 'permit-version-1' },
        data: { permitNumber: '777' },
      } as unknown as AxiosResponse<unknown>,
      '/lexis/permits/777',
    )

    registeredResponseResolvedInterceptor()({
      ...buildResponse({ exemptionNumber: 'EX-9' }),
      headers: { [RECORD_VERSION_HEADER]: 'exemption-version-9' },
      config: { method: 'get', url: '/lexis/exemptions/EX-9' },
    } as unknown as AxiosResponse<unknown>)

    const firstMutation = await registeredRequestInterceptor()({
      method: 'post',
      url: '/lexis/rpc/permit-details/update-permit',
      data: new URLSearchParams({ permitNumber: '777' }),
      headers: {},
    })
    expect(firstMutation.headers).toEqual(
      expect.objectContaining({ [RECORD_VERSION_HEADER]: 'permit-version-1' }),
    )

    registeredResponseResolvedInterceptor()({
      ...buildResponse({ success: true }),
      headers: { [RECORD_VERSION_HEADER]: 'permit-version-2' },
      config: {
        method: 'post',
        url: '/lexis/rpc/permit-details/update-permit',
        data: 'permitNumber=777',
      },
    } as unknown as AxiosResponse<unknown>)

    const secondMutation = await registeredRequestInterceptor()({
      method: 'post',
      url: '/lexis/rpc/permit-details/update-shipping',
      data: new URLSearchParams({ permitNumber: '777' }),
      headers: {},
    })
    expect(secondMutation.headers).toEqual(
      expect.objectContaining({ [RECORD_VERSION_HEADER]: 'permit-version-2' }),
    )
    window.history.replaceState({}, '', previousPath)
  })

  it('refetches cached status-filtered page data after a write starts', async () => {
    type StatusSearchResponse = { rows: Array<{ applicationNumber: string; status: string }> }

    const pageCacheKey = buildPageDataCacheKey('federal-application-search', 'user-1', {
      applicationStatus: 'APP',
    })
    const search = vi
      .fn<() => Promise<StatusSearchResponse>>()
      .mockResolvedValueOnce({ rows: [{ applicationNumber: '1001', status: 'APP' }] })
      .mockResolvedValueOnce({ rows: [] })
    const loadStatusSearch = async (): Promise<StatusSearchResponse> => {
      const pageCacheGeneration = getPageDataCacheGeneration()
      const cached = getPageDataCache<StatusSearchResponse>(pageCacheKey)
      if (cached) {
        return cached
      }
      const response = await search()
      setPageDataCache(pageCacheKey, response, pageCacheGeneration)
      return response
    }

    await expect(loadStatusSearch()).resolves.toEqual({
      rows: [{ applicationNumber: '1001', status: 'APP' }],
    })
    await expect(loadStatusSearch()).resolves.toEqual({
      rows: [{ applicationNumber: '1001', status: 'APP' }],
    })
    expect(search).toHaveBeenCalledTimes(1)

    await registeredRequestInterceptor()({ method: 'post', headers: {} })

    await expect(loadStatusSearch()).resolves.toEqual({ rows: [] })
    expect(search).toHaveBeenCalledTimes(2)
  })

  it('does not let an in-flight search repopulate page data after a write starts', async () => {
    type StatusSearchResponse = { rows: Array<{ applicationNumber: string; status: string }> }

    const pageCacheKey = buildPageDataCacheKey('federal-application-search', 'user-1', {
      applicationStatus: 'APP',
    })
    const pageCacheGeneration = getPageDataCacheGeneration()
    let resolveSearch: (response: StatusSearchResponse) => void = () => {}
    const search = new Promise<StatusSearchResponse>((resolve) => {
      resolveSearch = resolve
    })
    const commitResults = vi.fn()
    const cacheSearchResult = search.then((response) => {
      if (pageCacheGeneration !== getPageDataCacheGeneration()) {
        return false
      }
      const cacheUpdated = setPageDataCache(pageCacheKey, response, pageCacheGeneration)
      if (cacheUpdated) {
        commitResults(response)
      }
      return cacheUpdated
    })

    await registeredRequestInterceptor()({ method: 'post', headers: {} })
    resolveSearch({ rows: [{ applicationNumber: '1001', status: 'APP' }] })

    await expect(cacheSearchResult).resolves.toBe(false)
    expect(getPageDataCache(pageCacheKey)).toBeNull()
    expect(commitResults).not.toHaveBeenCalled()
  })

  it('refetches status-filtered page data when its 30-second TTL expires', async () => {
    type StatusSearchResponse = { rows: Array<{ applicationNumber: string; status: string }> }

    const pageCacheKey = buildPageDataCacheKey('federal-application-search', 'user-1', {
      applicationStatus: 'APP',
    })
    const search = vi
      .fn<() => Promise<StatusSearchResponse>>()
      .mockResolvedValueOnce({ rows: [{ applicationNumber: '1001', status: 'APP' }] })
      .mockResolvedValueOnce({ rows: [] })
    const loadStatusSearch = async (currentTime: number): Promise<StatusSearchResponse> => {
      const pageCacheGeneration = getPageDataCacheGeneration()
      const cached = getPageDataCache<StatusSearchResponse>(pageCacheKey, currentTime)
      if (cached) {
        return cached
      }
      const response = await search()
      setPageDataCache(pageCacheKey, response, pageCacheGeneration, currentTime)
      return response
    }

    await expect(loadStatusSearch(1_000)).resolves.toEqual({
      rows: [{ applicationNumber: '1001', status: 'APP' }],
    })
    await expect(loadStatusSearch(30_999)).resolves.toEqual({
      rows: [{ applicationNumber: '1001', status: 'APP' }],
    })
    await expect(loadStatusSearch(31_000)).resolves.toEqual({ rows: [] })
    expect(search).toHaveBeenCalledTimes(2)
  })

  it('does not restore stale cached data when a dispatched write fails ambiguously', async () => {
    const pageCacheKey = buildPageDataCacheKey('status-search', 'user-1', { status: 'APP' })
    setPageDataCache(pageCacheKey, { rows: ['cached'] }, getPageDataCacheGeneration())
    getMock
      .mockResolvedValueOnce(buildResponse({ count: 1 }))
      .mockResolvedValueOnce(buildResponse({ count: 2 }))

    await expect(apiService.getCachedData<{ count: number }>('/lexis/example')).resolves.toEqual({
      count: 1,
    })
    await registeredRequestInterceptor()({ method: 'post', headers: {} })

    const failedWrite = { config: { method: 'post' }, response: { status: 500 } }
    await expect(registeredResponseRejectedInterceptor()(failedWrite)).rejects.toBe(failedWrite)

    expect(getPageDataCache(pageCacheKey)).toBeNull()
    await expect(apiService.getCachedData<{ count: number }>('/lexis/example')).resolves.toEqual({
      count: 2,
    })
    expect(getMock).toHaveBeenCalledTimes(2)
  })

  it.each(['get', 'head', 'options'])(
    'preserves page data when a %s request starts',
    async (method) => {
      const pageCacheKey = buildPageDataCacheKey('status-search', 'user-1', { status: 'APP' })
      setPageDataCache(pageCacheKey, { rows: ['cached'] }, getPageDataCacheGeneration())

      await registeredRequestInterceptor()({ method, headers: {} })

      expect(getPageDataCache(pageCacheKey)).toEqual({ rows: ['cached'] })
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

  it('adds the active forest client to every API request', async () => {
    setActiveForestClientNumber('00067890')

    const result = await registeredRequestInterceptor()({
      method: 'get',
      headers: {},
    })

    expect(result.headers).toEqual(
      expect.objectContaining({
        [FOREST_CLIENT_SELECTION_HEADER]: '00067890',
      }),
    )
  })

  it('keeps cached GET responses separated by active forest client', async () => {
    getMock
      .mockResolvedValueOnce(buildResponse({ client: '00012345' }))
      .mockResolvedValueOnce(buildResponse({ client: '00067890' }))

    setActiveForestClientNumber('00012345')
    await expect(
      apiService.getCachedData<{ client: string }>('/lexis/example', undefined, {
        cacheKey: 'client-scoped',
      }),
    ).resolves.toEqual({ client: '00012345' })

    setActiveForestClientNumber('00067890')
    await expect(
      apiService.getCachedData<{ client: string }>('/lexis/example', undefined, {
        cacheKey: 'client-scoped',
      }),
    ).resolves.toEqual({ client: '00067890' })

    expect(getMock).toHaveBeenCalledTimes(2)
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

  it('emits a session-expired event and clears cached GETs on API 401 responses', async () => {
    const listener = vi.fn()
    window.addEventListener(SESSION_EXPIRED_EVENT, listener)
    getMock
      .mockResolvedValueOnce(buildResponse({ count: 1 }))
      .mockResolvedValueOnce(buildResponse({ count: 2 }))

    await expect(apiService.getCachedData<{ count: number }>('/lexis/example')).resolves.toEqual({
      count: 1,
    })

    const unauthorizedError = { response: { status: 401 } }
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
  })

  it('preserves the authenticated session and cached GETs on API 403 responses', async () => {
    const listener = vi.fn()
    window.addEventListener(SESSION_EXPIRED_EVENT, listener)
    getMock.mockResolvedValueOnce(buildResponse({ count: 1 }))

    await expect(apiService.getCachedData<{ count: number }>('/lexis/example')).resolves.toEqual({
      count: 1,
    })

    const forbiddenError = { response: { status: 403 } }
    await expect(registeredResponseRejectedInterceptor()(forbiddenError)).rejects.toBe(
      forbiddenError,
    )

    await expect(apiService.getCachedData<{ count: number }>('/lexis/example')).resolves.toEqual({
      count: 1,
    })
    expect(getMock).toHaveBeenCalledTimes(1)
    expect(listener).not.toHaveBeenCalled()

    window.removeEventListener(SESSION_EXPIRED_EVENT, listener)
  })

  it('requires refresh for stale-record conflicts and never resubmits the stale request', async () => {
    let receivedConflict: OptimisticConflictEvent['detail'] | undefined
    const conflictListener = (event: Event) => {
      const conflictEvent = event as OptimisticConflictEvent
      event.preventDefault()
      receivedConflict = conflictEvent.detail
    }
    window.addEventListener(OPTIMISTIC_CONFLICT_EVENT, conflictListener)
    const staleError = {
      config: {
        method: 'put',
        url: '/lexis/applications/999000001',
        data: { remarks: 'My saved draft' },
        headers: { 'If-Match': 'v1' },
      },
      response: {
        status: 409,
        data: {
          code: 'STALE_RECORD',
          detail: 'This application was changed by another user.',
          currentVersion: 'v2',
          changedFields: [{ field: 'remarks', currentValue: 'Newer remarks' }],
        },
      },
    }

    const conflictPromise = registeredResponseRejectedInterceptor()(staleError)

    await vi.waitFor(() => expect(receivedConflict).toBeDefined())
    expect(receivedConflict?.problem).toEqual(
      expect.objectContaining({
        code: 'STALE_RECORD',
        currentVersion: 'v2',
      }),
    )
    expect(receivedConflict).not.toHaveProperty('overwrite')
    expect(receivedConflict?.refresh).toBeTypeOf('function')
    expect(requestMock).not.toHaveBeenCalled()

    const rejectedConflict = expect(conflictPromise).rejects.toBe(staleError)
    receivedConflict?.refresh()
    await rejectedConflict
    expect(reloadPageIgnoringUnsavedChangesMock).toHaveBeenCalledTimes(1)

    window.removeEventListener(OPTIMISTIC_CONFLICT_EVENT, conflictListener)
  })

  it('requires refresh when an existing mutation is missing its record version', async () => {
    let receivedConflict: OptimisticConflictEvent['detail'] | undefined
    const conflictListener = (event: Event) => {
      const conflictEvent = event as OptimisticConflictEvent
      event.preventDefault()
      receivedConflict = conflictEvent.detail
    }
    window.addEventListener(OPTIMISTIC_CONFLICT_EVENT, conflictListener)

    void registeredResponseRejectedInterceptor()({
      config: {
        method: 'put',
        url: '/lexis/applications/999000001',
        data: { remarks: 'Unsaved draft' },
      },
      response: {
        status: 428,
        data: {
          code: 'RECORD_VERSION_REQUIRED',
          detail: 'A current record version is required before saving.',
        },
      },
    })

    await vi.waitFor(() => expect(receivedConflict).toBeDefined())
    expect(receivedConflict?.problem).toEqual({
      code: 'RECORD_VERSION_REQUIRED',
      detail: 'A current record version is required before saving.',
      currentVersion: undefined,
      changedFields: undefined,
      savedAt: undefined,
      updatedBy: undefined,
    })
    expect(receivedConflict).not.toHaveProperty('overwrite')
    expect(requestMock).not.toHaveBeenCalled()

    window.removeEventListener(OPTIMISTIC_CONFLICT_EVENT, conflictListener)
  })

  it('compares the retained detail snapshot with a fresh detail response on conflict', async () => {
    const previousPath = window.location.pathname
    window.history.replaceState({}, '', '/provincial/application/999000001')
    apiService.registerRecordVersion(
      'application',
      '999000001',
      {
        headers: { [RECORD_VERSION_HEADER]: 'version-1' },
        data: {
          applicationNumber: '999000001',
          remarks: 'Original remarks',
          updateTimestamp: '2026-07-15T09:00:00-07:00',
          updateUserId: 'IDIR\\FIRST',
        },
      } as unknown as AxiosResponse<unknown>,
      '/lexis/applications/999000001',
    )
    getMock.mockResolvedValueOnce({
      ...buildResponse({
        applicationNumber: '999000001',
        remarks: 'Newer remarks',
        updateTimestamp: '2026-07-15T09:10:00-07:00',
        updateUserId: 'IDIR\\SECOND',
      }),
      headers: { [RECORD_VERSION_HEADER]: 'version-2' },
    })
    let receivedProblem: OptimisticConflictEvent['detail']['problem'] | undefined
    const conflictListener = (event: Event) => {
      const conflictEvent = event as OptimisticConflictEvent
      event.preventDefault()
      receivedProblem = conflictEvent.detail.problem
    }
    window.addEventListener(OPTIMISTIC_CONFLICT_EVENT, conflictListener)

    void registeredResponseRejectedInterceptor()({
      config: {
        method: 'put',
        url: '/lexis/applications/999000001',
        headers: { [RECORD_VERSION_HEADER]: 'version-1' },
      },
      response: {
        status: 409,
        data: { code: 'STALE_RECORD', currentVersion: 'version-1.5' },
      },
    })

    await vi.waitFor(() => expect(receivedProblem).toBeDefined())

    expect(getMock).toHaveBeenCalledWith('/lexis/applications/999000001', {
      headers: { 'Cache-Control': 'no-cache' },
      signal: expect.any(AbortSignal),
    })
    expect(receivedProblem).toEqual(
      expect.objectContaining({
        currentVersion: 'version-2',
        savedAt: '2026-07-15T09:10:00-07:00',
        updatedBy: 'IDIR\\SECOND',
        changedFields: expect.arrayContaining([
          { field: 'remarks', currentValue: 'Newer remarks' },
        ]),
      }),
    )

    window.removeEventListener(OPTIMISTIC_CONFLICT_EVENT, conflictListener)
    window.history.replaceState({}, '', previousPath)
  })

  it('allows a slow DEV detail response to summarize a conflict before the deadline', async () => {
    vi.useFakeTimers()
    const previousPath = window.location.pathname
    window.history.replaceState({}, '', '/provincial/application/999000001')
    let receivedProblem: OptimisticConflictEvent['detail']['problem'] | undefined
    const conflictListener = (event: Event) => {
      const conflictEvent = event as OptimisticConflictEvent
      event.preventDefault()
      receivedProblem = conflictEvent.detail.problem
    }
    window.addEventListener(OPTIMISTIC_CONFLICT_EVENT, conflictListener)

    try {
      apiService.registerRecordVersion(
        'application',
        '999000001',
        {
          headers: { [RECORD_VERSION_HEADER]: 'version-1' },
          data: { applicationNumber: '999000001', remarks: 'Original remarks' },
        } as unknown as AxiosResponse<unknown>,
        '/lexis/applications/999000001',
      )
      getMock.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            window.setTimeout(
              () =>
                resolve({
                  ...buildResponse({
                    applicationNumber: '999000001',
                    remarks: 'Newer remarks',
                  }),
                  headers: { [RECORD_VERSION_HEADER]: 'version-2' },
                }),
              4_000,
            )
          }),
      )

      void registeredResponseRejectedInterceptor()({
        config: {
          method: 'put',
          url: '/lexis/applications/999000001',
          headers: {
            [RECORD_VERSION_HEADER]: 'version-1',
            Authorization: 'Bearer existing-request-token',
          },
        },
        response: {
          status: 409,
          data: { code: 'STALE_RECORD', currentVersion: 'version-1.5' },
        },
      })

      await vi.advanceTimersByTimeAsync(4_000)

      expect(receivedProblem).toEqual(
        expect.objectContaining({
          currentVersion: 'version-2',
          changedFields: expect.arrayContaining([
            { field: 'remarks', currentValue: 'Newer remarks' },
          ]),
        }),
      )
      expect(getMock).toHaveBeenCalledWith('/lexis/applications/999000001', {
        headers: {
          Authorization: 'Bearer existing-request-token',
          'Cache-Control': 'no-cache',
        },
        signal: expect.any(AbortSignal),
      })
    } finally {
      window.removeEventListener(OPTIMISTIC_CONFLICT_EVENT, conflictListener)
      window.history.replaceState({}, '', previousPath)
      vi.useRealTimers()
    }
  })

  it('includes newer values from a supplemental edit-context snapshot', async () => {
    const previousPath = window.location.pathname
    window.history.replaceState({}, '', '/provincial/permit/777')
    apiService.registerRecordVersion(
      'permit',
      '777',
      {
        headers: { [RECORD_VERSION_HEADER]: 'version-1' },
        data: { permitNumber: '777', permitStatus: 'ACT' },
      } as unknown as AxiosResponse<unknown>,
      '/lexis/permits/777',
    )
    apiService.registerRecordVersion(
      'permit',
      '777',
      {
        headers: {},
        data: { overrideEnabled: false, overrideComment: '' },
      } as unknown as AxiosResponse<unknown>,
      '/lexis/rpc/permit-details/edit-context',
      { params: { permitNumber: '777' } },
    )
    apiService.registerRecordVersion(
      'permit',
      '777',
      {
        headers: { [RECORD_VERSION_HEADER]: 'version-1' },
        data: { permitNumber: '777', permitStatus: 'ACT' },
      } as unknown as AxiosResponse<unknown>,
      '/lexis/permits/777',
    )
    getMock.mockImplementation((url: string) => {
      if (url === '/lexis/permits/777') {
        return Promise.resolve({
          ...buildResponse({ permitNumber: '777', permitStatus: 'COM' }),
          headers: { [RECORD_VERSION_HEADER]: 'primary-version-2' },
        })
      }
      return Promise.resolve({
        ...buildResponse({ overrideEnabled: true, overrideComment: 'Reviewed' }),
        headers: { [RECORD_VERSION_HEADER]: 'supplemental-version-3' },
      })
    })
    let receivedProblem: OptimisticConflictEvent['detail']['problem'] | undefined
    const conflictListener = (event: Event) => {
      const conflictEvent = event as OptimisticConflictEvent
      event.preventDefault()
      receivedProblem = conflictEvent.detail.problem
    }
    window.addEventListener(OPTIMISTIC_CONFLICT_EVENT, conflictListener)

    void registeredResponseRejectedInterceptor()({
      config: {
        method: 'post',
        url: '/lexis/rpc/permit-details/update-permit',
        data: 'permitNumber=777',
      },
      response: {
        status: 409,
        data: { code: 'STALE_RECORD', currentVersion: 'version-2' },
      },
    })

    await vi.waitFor(() => expect(receivedProblem).toBeDefined())

    expect(getMock).toHaveBeenNthCalledWith(1, '/lexis/permits/777', {
      headers: { 'Cache-Control': 'no-cache' },
      signal: expect.any(AbortSignal),
    })
    expect(getMock).toHaveBeenNthCalledWith(2, '/lexis/rpc/permit-details/edit-context', {
      params: { permitNumber: '777' },
      headers: { 'Cache-Control': 'no-cache' },
      signal: expect.any(AbortSignal),
    })
    expect(receivedProblem?.currentVersion).toBe('primary-version-2')
    expect(receivedProblem?.changedFields).toEqual(
      expect.arrayContaining([
        { field: 'overrideEnabled', currentValue: true },
        { field: 'overrideComment', currentValue: 'Reviewed' },
      ]),
    )

    window.removeEventListener(OPTIMISTIC_CONFLICT_EVENT, conflictListener)
    window.history.replaceState({}, '', previousPath)
  })

  it('falls back to the server conflict when detail enrichment exceeds its deadline', async () => {
    vi.useFakeTimers()
    const previousPath = window.location.pathname
    window.history.replaceState({}, '', '/provincial/application/999000001')
    let receivedProblem: OptimisticConflictEvent['detail']['problem'] | undefined
    const conflictListener = (event: Event) => {
      const conflictEvent = event as OptimisticConflictEvent
      event.preventDefault()
      receivedProblem = conflictEvent.detail.problem
    }
    window.addEventListener(OPTIMISTIC_CONFLICT_EVENT, conflictListener)

    try {
      apiService.registerRecordVersion(
        'application',
        '999000001',
        {
          headers: { [RECORD_VERSION_HEADER]: 'version-1' },
          data: { applicationNumber: '999000001', remarks: 'Original remarks' },
        } as unknown as AxiosResponse<unknown>,
        '/lexis/applications/999000001',
      )
      getMock.mockImplementationOnce(
        () =>
          new Promise(() => {
            // Simulates work that stalls before Axios can observe the AbortSignal,
            // such as an asynchronous request interceptor.
          }),
      )

      void registeredResponseRejectedInterceptor()({
        config: {
          method: 'put',
          url: '/lexis/applications/999000001',
          headers: { [RECORD_VERSION_HEADER]: 'version-1' },
        },
        response: {
          status: 409,
          data: {
            code: 'STALE_RECORD',
            detail: 'This application was changed by another user.',
            currentVersion: 'version-2',
          },
        },
      })

      await vi.advanceTimersByTimeAsync(10_000)

      expect(receivedProblem).toEqual(
        expect.objectContaining({
          code: 'STALE_RECORD',
          detail: 'This application was changed by another user.',
          currentVersion: 'version-2',
        }),
      )
      expect(getMock).toHaveBeenCalledWith(
        '/lexis/applications/999000001',
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      )
    } finally {
      window.removeEventListener(OPTIMISTIC_CONFLICT_EVENT, conflictListener)
      window.history.replaceState({}, '', previousPath)
      vi.useRealTimers()
    }
  })

  it('leaves ordinary 409 responses on the existing error path', async () => {
    const listener = vi.fn()
    window.addEventListener(OPTIMISTIC_CONFLICT_EVENT, listener)
    const validationConflict = {
      config: { method: 'put', url: '/lexis/applications/999000001' },
      response: { status: 409, data: { code: 'DUPLICATE_APPLICATION' } },
    }

    await expect(registeredResponseRejectedInterceptor()(validationConflict)).rejects.toBe(
      validationConflict,
    )
    expect(listener).not.toHaveBeenCalled()
    expect(requestMock).not.toHaveBeenCalled()

    window.removeEventListener(OPTIMISTIC_CONFLICT_EVENT, listener)
  })

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

  it('invalidates a GET cached while a write is pending when the write succeeds', async () => {
    let resolveStaleGet: (response: ReturnType<typeof buildResponse>) => void = () => {}
    getMock
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveStaleGet = resolve
        }),
      )
      .mockResolvedValueOnce(buildResponse({ count: 2 }))

    await registeredRequestInterceptor()({
      method: 'post',
      headers: {},
    })

    const staleRequest = apiService.getCachedData<{ count: number }>('/lexis/example')
    await vi.waitFor(() => {
      expect(getMock).toHaveBeenCalledTimes(1)
    })

    resolveStaleGet(buildResponse({ count: 1 }))
    await expect(staleRequest).resolves.toEqual({ count: 1 })
    await expect(apiService.getCachedData<{ count: number }>('/lexis/example')).resolves.toEqual({
      count: 1,
    })

    const pageCacheKey = buildPageDataCacheKey('status-search', 'user-1', { status: 'APP' })
    setPageDataCache(pageCacheKey, { rows: ['stale'] }, getPageDataCacheGeneration())

    registeredResponseResolvedInterceptor()({
      ...buildResponse({ success: true }),
      config: { method: 'post' },
    } as unknown as AxiosResponse<unknown>)

    expect(getPageDataCache(pageCacheKey)).toBeNull()
    await expect(apiService.getCachedData<{ count: number }>('/lexis/example')).resolves.toEqual({
      count: 2,
    })
    expect(getMock).toHaveBeenCalledTimes(2)
  })
})
