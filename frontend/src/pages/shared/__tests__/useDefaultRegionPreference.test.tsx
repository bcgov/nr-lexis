import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useDefaultRegionPreference } from '@/pages/shared/useDefaultRegionPreference'
import type { UserPreferences } from '@/service/user-preference-service'

const { fetchUserPreferencesMock, subscribeToUserPreferencesMock } = vi.hoisted(() => ({
  fetchUserPreferencesMock: vi.fn(),
  subscribeToUserPreferencesMock: vi.fn(),
}))

vi.mock('@/service/user-preference-service', () => ({
  fetchUserPreferences: fetchUserPreferencesMock,
  subscribeToUserPreferences: subscribeToUserPreferencesMock,
}))

describe('useDefaultRegionPreference', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    subscribeToUserPreferencesMock.mockReturnValue(vi.fn())
  })

  it('loads the preference and receives saves made from the profile panel', async () => {
    let listener: ((preferences: UserPreferences) => void) | undefined
    subscribeToUserPreferencesMock.mockImplementation(
      (nextListener: (preferences: UserPreferences) => void) => {
        listener = nextListener
        return vi.fn()
      },
    )
    fetchUserPreferencesMock.mockResolvedValue({ defaultRegion: 'RCO' })

    const { result } = renderHook(() => useDefaultRegionPreference())

    await waitFor(() => {
      expect(result.current).toEqual({ defaultRegion: 'RCO', preferenceLoading: false })
    })

    act(() => listener?.({ defaultRegion: 'RSI' }))
    expect(result.current.defaultRegion).toBe('RSI')
  })

  it('falls back to no preference when loading fails', async () => {
    fetchUserPreferencesMock.mockRejectedValue(new Error('Unavailable'))

    const { result } = renderHook(() => useDefaultRegionPreference())

    await waitFor(() => {
      expect(result.current).toEqual({ defaultRegion: null, preferenceLoading: false })
    })
  })
})
