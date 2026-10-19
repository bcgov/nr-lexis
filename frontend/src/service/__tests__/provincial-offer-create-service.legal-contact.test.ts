import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchOfferClientData } from '@/service/provincial-offer-create-service'

const { getCachedDataMock } = vi.hoisted(() => ({
  getCachedDataMock: vi.fn(),
}))

vi.mock('@/service/api-service', () => ({
  default: {
    getCachedData: getCachedDataMock,
  },
}))

describe('fetchOfferClientData legal contact name', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the legal contact name the server sends', async () => {
    getCachedDataMock.mockResolvedValue({
      clientNumber: '00077881',
      companyName: 'Buyer, Jane Quinn',
      legalContactName: ' Jane Quinn ',
      notfound: null,
    })

    await expect(fetchOfferClientData('00077881')).resolves.toEqual({
      clientNumber: '00077881',
      companyName: 'Buyer, Jane Quinn',
      legalContactName: 'Jane Quinn',
    })
  })

  it('leaves the legal contact name out when the client has none', async () => {
    getCachedDataMock.mockResolvedValue({
      clientNumber: '00077881',
      companyName: 'Example Forest Products Ltd.',
      legalContactName: null,
      notfound: null,
    })

    const result = await fetchOfferClientData('00077881')

    expect(result).toEqual({
      clientNumber: '00077881',
      companyName: 'Example Forest Products Ltd.',
    })
    expect(result).not.toHaveProperty('legalContactName')
  })
})
