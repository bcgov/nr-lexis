import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchApplicationReviewOptions,
  fetchFederalApplicationOptions,
  fetchProvincialApplicationOptions,
} from '@/service/search-options-service'

const getMock = vi.fn()

vi.mock('@/service/api-service', () => ({
  default: {
    getAxiosInstance: () => ({
      get: getMock,
    }),
  },
}))

describe('search-options-service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('parses provincial application options and ignores invalid entries', async () => {
    getMock.mockResolvedValue({
      data: {
        exemptionTypes: [
          { code: 'A', name: 'Type A' },
          { code: '   ', name: 'Bad Code' },
          { code: 'B', name: 'Type B' },
        ],
        applicationStatuses: [{ code: 'NEW', name: 'New' }],
        productTypes: [{ code: 'LOG', name: 'Logs' }],
        regions: [{ code: '11', name: 'Cariboo' }, { code: '12' }],
      },
    })

    const result = await fetchProvincialApplicationOptions()

    expect(getMock).toHaveBeenCalledWith('/lexis/applications/search/options')
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
    getMock.mockResolvedValue({ data: 'unexpected' })

    const result = await fetchFederalApplicationOptions()

    expect(getMock).toHaveBeenCalledWith('/lexis/federal/applications/search/options')
    expect(result).toEqual({ applicationStatuses: [] })
  })

  it('returns empty option lists when options endpoint throws', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    getMock.mockRejectedValue(new Error('network'))

    const result = await fetchApplicationReviewOptions()

    expect(getMock).toHaveBeenCalledWith('/lexis/application-reviews/search/options')
    expect(result).toEqual({
      productTypes: [],
      regions: [],
      reviewStatuses: [],
    })
    expect(warnSpy).toHaveBeenCalledTimes(1)

    warnSpy.mockRestore()
  })
})
