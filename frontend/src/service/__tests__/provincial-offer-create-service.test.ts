import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchOfferApplicationDetails,
  fetchOfferApplicationVolume,
  fetchOfferClientData,
  fetchOfferPackageList,
  validateOfferApplication,
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
      region: ' Cariboo Natural Resource Region ',
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
      region: 'Cariboo Natural Resource Region',
    })
  })

  it('returns the offer eligibility validation result', async () => {
    getCachedDataMock.mockResolvedValue({
      isValid: false,
      errors: ['Application 45970 does not have a valid jurisdiction to accept offers'],
    })

    const result = await validateOfferApplication('45970')

    expect(getCachedDataMock).toHaveBeenCalledWith(
      '/lexis/rpc/offer-details/validate-application-number',
      {
        params: { applicationNumber: '45970' },
      },
      {
        cacheKey: 'offer-application-validation:45970',
        ttlMs: 30_000,
      },
    )
    expect(result).toEqual({
      isValid: false,
      errors: ['Application 45970 does not have a valid jurisdiction to accept offers'],
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

  it('loads the authoritative offering company from the default client location', async () => {
    getCachedDataMock.mockResolvedValue({
      clientNumber: ' 00077881 ',
      companyName: ' Authoritative Buyer Ltd. ',
      notfound: null,
    })

    const result = await fetchOfferClientData(' 00077881 ')

    expect(getCachedDataMock).toHaveBeenCalledWith(
      '/lexis/rpc/offer-details/client-data',
      {
        params: {
          clientNumber: '00077881',
          clientLocationCode: '00',
        },
      },
      {
        cacheKey: 'offer-client-data:00077881:00',
        ttlMs: 30_000,
      },
    )
    expect(result).toEqual({
      clientNumber: '00077881',
      companyName: 'Authoritative Buyer Ltd.',
    })
  })

  it('fails closed when authoritative offering company data is not found', async () => {
    getCachedDataMock.mockResolvedValue({ notfound: 'true' })

    await expect(fetchOfferClientData('00077881')).resolves.toBeNull()
  })

  it('returns blank application volume for non-object RPC payloads', async () => {
    getCachedDataMock.mockResolvedValue('unexpected')

    await expect(fetchOfferApplicationVolume('45970')).resolves.toBe('')
  })
})
