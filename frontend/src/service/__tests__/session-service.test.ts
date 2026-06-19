import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchSessionCapabilities, performLogoff } from '@/service/session-service'

const { getCachedResponseMock, getMock, postMock } = vi.hoisted(() => ({
  getCachedResponseMock: vi.fn(),
  getMock: vi.fn(),
  postMock: vi.fn(),
}))

vi.mock('@/service/api-service', () => ({
  default: {
    getCachedResponse: getCachedResponseMock,
    getAxiosInstance: () => ({
      get: getMock,
      post: postMock,
    }),
  },
}))

describe('session-service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches session capabilities from backend contract path', async () => {
    const payload = {
      authenticated: true,
      principal: 'idir\\tester',
      roles: ['READ_ONLY'],
      welcomeTarget: 'readOnly',
      legacyPath: null,
      grantedActions: ['/applicationSearch'],
    }
    getCachedResponseMock.mockResolvedValue({ data: payload })

    const result = await fetchSessionCapabilities()

    expect(getCachedResponseMock).toHaveBeenCalledWith('/lexis/session/capabilities', undefined, {
      cacheKey: 'session-capabilities',
      ttlMs: 5_000,
    })
    expect(getMock).not.toHaveBeenCalled()
    expect(result).toEqual(payload)
  })

  it('posts logoff request to backend contract path', async () => {
    postMock.mockResolvedValue({
      data: {
        invalidated: true,
      },
    })

    const result = await performLogoff()

    expect(postMock).toHaveBeenCalledWith('/lexis/session/logoff')
    expect(result).toEqual({ invalidated: true })
  })

  it('propagates backend errors to callers', async () => {
    const backendError = new Error('backend unavailable')
    getCachedResponseMock.mockRejectedValue(backendError)

    await expect(fetchSessionCapabilities()).rejects.toThrow('backend unavailable')
  })
})
