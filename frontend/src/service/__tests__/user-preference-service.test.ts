import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchUserPreferences,
  resolveDefaultZoneRegionIds,
  subscribeToUserPreferences,
  updateUserPreferences,
} from '@/service/user-preference-service'

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

  it("loads the current user's default zone from the legacy API field", async () => {
    getMock.mockResolvedValue({ data: { defaultRegion: 'RCO' } })

    await expect(fetchUserPreferences()).resolves.toEqual({ defaultRegion: 'RCO' })
    expect(getMock).toHaveBeenCalledWith('/lexis/session/preferences')
  })

  it('updates or clears the default zone without sending a user identifier', async () => {
    putMock.mockResolvedValue({ data: { defaultRegion: null } })

    await expect(updateUserPreferences(null)).resolves.toEqual({ defaultRegion: null })
    expect(putMock).toHaveBeenCalledWith('/lexis/session/preferences', {
      defaultRegion: null,
    })
  })

  it('rejects unsupported zone values from the backend contract', async () => {
    getMock.mockResolvedValue({ data: { defaultRegion: 'UNKNOWN' } })

    await expect(fetchUserPreferences()).rejects.toThrow(
      'User preferences response is unavailable.',
    )
  })

  it.each([
    ['RCO', ['1909', '1910']],
    ['RNI', ['1905', '1906', '1908']],
    ['RSI', ['1903', '1904', '1907']],
  ] as const)('maps %s to its Natural Resource Regions', (zone, expectedRegionIds) => {
    const availableRegionIds = ['1903', '1904', '1905', '1906', '1907', '1908', '1909', '1910']

    expect(resolveDefaultZoneRegionIds(zone, availableRegionIds)).toEqual(expectedRegionIds)
  })

  it('leaves regions unfiltered when no usable preference exists', () => {
    expect(resolveDefaultZoneRegionIds(null, ['1903', '1904'])).toEqual([])
    expect(resolveDefaultZoneRegionIds('RCO', ['1903', '1904'])).toEqual([])
  })

  it('notifies active consumers after a preference is saved', async () => {
    putMock.mockResolvedValue({ data: { defaultRegion: 'RNI' } })
    const listener = vi.fn()
    const unsubscribe = subscribeToUserPreferences(listener)

    await updateUserPreferences('RNI')

    expect(listener).toHaveBeenCalledWith({ defaultRegion: 'RNI' })
    unsubscribe()
  })
})
