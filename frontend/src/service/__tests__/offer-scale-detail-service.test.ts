import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchOfferScaleDetails } from '@/service/offer-scale-detail-service'

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }))
vi.mock('@/service/api-service', () => ({
  default: { getAxiosInstance: () => ({ get: getMock }) },
}))

describe('offer scale detail service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.each([{ offerNumber: '81001' }, { packageNumber: 'PKG-9' }])(
    'requests only the selected authorization context %j without caching',
    async (target) => {
      const rows = [
        {
          timberMark: 'TM-9',
          pieces: 8,
          species: 'HE',
          grade: 'J',
          volume: '95.0',
          cascadeSplitCode: 'E',
        },
      ]
      getMock.mockResolvedValue({ data: rows })
      const { signal } = new AbortController()
      expect(await fetchOfferScaleDetails(target, signal)).toEqual(rows)
      expect(getMock).toHaveBeenCalledWith('/lexis/rpc/offer-details/package-scales', {
        params: target,
        signal,
      })
    },
  )

  it('propagates a denied request so it cannot look like an empty scale table', async () => {
    getMock.mockRejectedValue(new Error('Forbidden'))
    await expect(
      fetchOfferScaleDetails({ offerNumber: '81001' }, new AbortController().signal),
    ).rejects.toThrow('Forbidden')
  })
})
