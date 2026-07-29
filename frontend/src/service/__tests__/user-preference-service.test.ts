import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchUserPreferences, updateUserPreferences } from '@/service/user-preference-service'

const { getMock, putMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  putMock: vi.fn(),
}))

vi.mock('@/service/api-service', () => ({
  default: {
    getAxiosInstance: () => ({
      get: getMock,
      put: putMock,
    }),
  },
}))

describe('user-preference-service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads the current users default region', async () => {
    getMock.mockResolvedValue({ data: { defaultRegion: 'RCO' } })

    await expect(fetchUserPreferences()).resolves.toEqual({ defaultRegion: 'RCO' })
    expect(getMock).toHaveBeenCalledWith('/lexis/session/preferences')
  })

  it('updates or clears the default region without sending a user identifier', async () => {
    putMock.mockResolvedValue({ data: { defaultRegion: null } })

    await expect(updateUserPreferences(null)).resolves.toEqual({ defaultRegion: null })
    expect(putMock).toHaveBeenCalledWith('/lexis/session/preferences', {
      defaultRegion: null,
    })
  })

  it('rejects unsupported region values from the backend contract', async () => {
    getMock.mockResolvedValue({ data: { defaultRegion: 'UNKNOWN' } })

    await expect(fetchUserPreferences()).rejects.toThrow(
      'User preferences response is unavailable.',
    )
  })
})
