import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchApplicationReviewOptions,
  fetchFederalApplicationOptions,
  fetchProvincialApplicationOptions,
} from '@/service/search-options-service'

const { getCachedDataMock } = vi.hoisted(() => ({
  getCachedDataMock: vi.fn(),
}))

vi.mock('@/service/api-service', () => ({
  default: {
    getCachedData: getCachedDataMock,
  },
}))

describe('search-options-service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('parses provincial application options and ignores invalid entries', async () => {
    getCachedDataMock.mockResolvedValue({
      exemptionTypes: [
        { code: 'A', name: 'Type A' },
        { code: '   ', name: 'Bad Code' },
        { code: 'B', name: 'Type B' },
      ],
      applicationStatuses: [{ code: 'NEW', name: 'New' }],
      productTypes: [{ code: 'LOG', name: 'Logs' }],
      regions: [{ code: '11', name: 'Cariboo' }, { code: '12' }],
    })

    const result = await fetchProvincialApplicationOptions()

    expect(getCachedDataMock).toHaveBeenCalledWith(
      '/lexis/applications/search/options',
      undefined,
      {
        cacheKey: 'search-options:/lexis/applications/search/options',
        ttlMs: 300000,
      },
    )
    expect(result).toEqual({
      exemptionTypes: [
        { value: 'A', label: 'Type A' },
        { value: 'B', label: 'Type B' },
      ],
      applicationStatuses: [{ value: 'NEW', label: 'New' }],
      productTypes: [{ value: 'LOG', label: 'Logs' }],
      regions: [{ value: '11', label: 'Cariboo' }],
    })
  })

  it('returns empty option lists for non-object payloads', async () => {
    getCachedDataMock.mockResolvedValue('unexpected')

    const result = await fetchFederalApplicationOptions()

    expect(getCachedDataMock).toHaveBeenCalledWith(
      '/lexis/federal/applications/search/options',
      undefined,
      {
        cacheKey: 'search-options:/lexis/federal/applications/search/options',
        ttlMs: 300000,
      },
    )
    expect(result).toEqual({ applicationStatuses: [] })
  })

  it('returns empty option lists when options endpoint throws', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    getCachedDataMock.mockRejectedValue(new Error('network'))

    const result = await fetchApplicationReviewOptions()

    expect(getCachedDataMock).toHaveBeenCalledWith(
      '/lexis/application-reviews/search/options',
      undefined,
      {
        cacheKey: 'search-options:/lexis/application-reviews/search/options',
        ttlMs: 300000,
      },
    )
    expect(result).toEqual({
      productTypes: [],
      regions: [],
      reviewStatuses: [],
    })
    expect(warnSpy).toHaveBeenCalledTimes(1)

    warnSpy.mockRestore()
  })
})
