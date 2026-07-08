import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchProvincialPermitDetail } from '@/service/lexis-detail-service'

const { getCachedResponseMock } = vi.hoisted(() => ({
  getCachedResponseMock: vi.fn(),
}))

vi.mock('@/service/api-service', () => ({
  default: {
    getCachedResponse: getCachedResponseMock,
  },
}))

const response = (data: unknown, status = 200) => ({
  data,
  status,
})

describe('lexis detail service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads provincial permit detail with legacy exemption volume totals', async () => {
    getCachedResponseMock
      .mockResolvedValueOnce(
        response({
          permitNumber: 777,
          exemptionNumber: 'EX-9',
          permitVolume: 120,
        }),
      )
      .mockResolvedValueOnce(response({ approvedExemptionVolume: '250.5' }))
      .mockResolvedValueOnce(response({ exemptionVolumeRemaining: 130 }))

    const result = await fetchProvincialPermitDetail('777')

    expect(getCachedResponseMock).toHaveBeenCalledTimes(3)
    expect(getCachedResponseMock).toHaveBeenNthCalledWith(1, '/lexis/permits/777', undefined, {
      ttlMs: 30_000,
    })
    expect(getCachedResponseMock).toHaveBeenNthCalledWith(
      2,
      '/lexis/rpc/permit-details/approved-exemption-volume',
      { params: { exemptionNumber: 'EX-9' } },
      { ttlMs: 30_000 },
    )
    expect(getCachedResponseMock).toHaveBeenNthCalledWith(
      3,
      '/lexis/rpc/permit-details/exemption-volume-remaining',
      { params: { exemptionNumber: 'EX-9' } },
      { ttlMs: 30_000 },
    )
    expect(result).toMatchObject({
      permitNumber: 777,
      exemptionNumber: 'EX-9',
      approvedExemptionVolume: 250.5,
      exemptionVolumeRemaining: 130,
    })
  })
})
