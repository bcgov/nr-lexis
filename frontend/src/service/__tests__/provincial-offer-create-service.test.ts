import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchOfferApplicationDetails,
  fetchOfferApplicationVolume,
  fetchOfferPackageList,
} from '@/service/provincial-offer-create-service'

const { getCachedDataMock } = vi.hoisted(() => ({
  getCachedDataMock: vi.fn(),
}))

vi.mock('@/service/api-service', () => ({
  default: {
    getCachedData: getCachedDataMock,
  },
}))

describe('provincial-offer-create-service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads offer application details from RPC payload aliases', async () => {
    getCachedDataMock.mockResolvedValue({
      success: true,
      speciesGradeCode: ' HE/PL ',
      advertisingDate: ' 2026-06-15 ',
      teacReviewDate: ' 2026-06-16 ',
    })

    const result = await fetchOfferApplicationDetails('45970')

    expect(getCachedDataMock).toHaveBeenCalledWith(
      '/lexis/rpc/offer-details/application-details',
      {
        params: { applicationNumber: '45970' },
      },
      {
        cacheKey: 'offer-application-details:45970',
        ttlMs: 30_000,
      },
    )
    expect(result).toEqual({
      success: true,
      speciesGradeCode: 'HE/PL',
      advertisingDate: '2026-06-15',
      teacReviewDate: '2026-06-16',
    })
  })

  it('loads offer package list and filters legacy empty sentinel rows', async () => {
    getCachedDataMock.mockResolvedValue({
      packageList: [' PKG-1 ', 'No Packages', 'PKG-2'],
    })

    const result = await fetchOfferPackageList('45970')

    expect(getCachedDataMock).toHaveBeenCalledWith(
      '/lexis/rpc/offer-details/package-list',
      {
        params: { applicationNumber: '45970' },
      },
      {
        cacheKey: 'offer-package-list:45970',
        ttlMs: 30_000,
      },
    )
    expect(result).toEqual(['PKG-1', 'PKG-2'])
  })

  it('returns blank application volume for non-object RPC payloads', async () => {
    getCachedDataMock.mockResolvedValue('unexpected')

    await expect(fetchOfferApplicationVolume('45970')).resolves.toBe('')
  })
})
