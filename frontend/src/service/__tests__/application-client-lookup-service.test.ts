import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchApplicationClientLocations } from '@/service/application-client-lookup-service'

const { getCachedDataMock } = vi.hoisted(() => ({
  getCachedDataMock: vi.fn(),
}))

vi.mock('@/service/api-service', () => ({
  default: {
    getCachedData: getCachedDataMock,
  },
}))

describe('application-client-lookup-service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads and parses owner client locations', async () => {
    getCachedDataMock.mockResolvedValue([
      { locationCode: '00', locationName: '00', selected: false },
      { locationCode: '01', locationName: '01 - MAIN LOCATION', selected: true },
      { locationCode: ' ', locationName: 'Bad Code', selected: false },
      { locationCode: '02', locationName: ' ', selected: false },
    ])

    const result = await fetchApplicationClientLocations(' 00011111 ')

    expect(getCachedDataMock).toHaveBeenCalledWith(
      '/lexis/rpc/application-details/client-locations',
      {
        params: {
          applicantType: 'owner',
          clientNumber: '00011111',
        },
      },
      {
        cacheKey: 'application-client-locations:owner:00011111',
        ttlMs: 300000,
      },
    )
    expect(result).toEqual([
      { locationCode: '00', locationName: '00', selected: false },
      { locationCode: '01', locationName: '01 - MAIN LOCATION', selected: true },
    ])
  })

  it('loads agent client locations with agent lookup context', async () => {
    getCachedDataMock.mockResolvedValue([
      { locationCode: '01', locationName: '01 - AGENT LOCATION', selected: true },
    ])

    const result = await fetchApplicationClientLocations(' 00033333 ', 'agent')

    expect(getCachedDataMock).toHaveBeenCalledWith(
      '/lexis/rpc/application-details/client-locations',
      {
        params: {
          applicantType: 'agent',
          clientNumber: '00033333',
        },
      },
      {
        cacheKey: 'application-client-locations:agent:00033333',
        ttlMs: 300000,
      },
    )
    expect(result).toEqual([
      { locationCode: '01', locationName: '01 - AGENT LOCATION', selected: true },
    ])
  })

  it('does not call the API when client number is blank', async () => {
    const result = await fetchApplicationClientLocations('  ')

    expect(result).toEqual([])
    expect(getCachedDataMock).not.toHaveBeenCalled()
  })

  it('returns an empty list when the endpoint fails', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    getCachedDataMock.mockRejectedValue(new Error('network'))

    const result = await fetchApplicationClientLocations('00011111')

    expect(result).toEqual([])
    expect(warnSpy).toHaveBeenCalledTimes(1)
    warnSpy.mockRestore()
  })
})
