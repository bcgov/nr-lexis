import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchSessionCapabilities, performLogoff } from '@/service/session-service'

const getMock = vi.fn()
const postMock = vi.fn()

vi.mock('@/service/api-service', () => ({
  default: {
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
      welcomeTarget: '/dashboard',
      legacyPath: null,
      grantedActions: ['/applicationSearch'],
    }
    getMock.mockResolvedValue({ data: payload })

    const result = await fetchSessionCapabilities()

    expect(getMock).toHaveBeenCalledWith('/lexis/session/capabilities')
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
    getMock.mockRejectedValue(backendError)

    await expect(fetchSessionCapabilities()).rejects.toThrow('backend unavailable')
  })
})
