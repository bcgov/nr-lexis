import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchFederalApplicationDetail,
  fetchProvincialApplicationDetail,
  fetchProvincialExemptionDetail,
  fetchProvincialOfferDetail,
  fetchProvincialPermitDetail,
  releaseOfferEditLock,
} from '@/service/lexis-detail-service'

const { getCachedResponseMock, postMock, registerRecordVersionMock } = vi.hoisted(() => ({
  getCachedResponseMock: vi.fn(),
  postMock: vi.fn(),
  registerRecordVersionMock: vi.fn(),
}))

vi.mock('@/service/api-service', () => ({
  default: {
    getCachedResponse: getCachedResponseMock,
    getAxiosInstance: () => ({ post: postMock }),
    registerRecordVersion: registerRecordVersionMock,
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
          applicationDate: '2026-04-10',
          receivedDate: '2026-04-15',
          permitVolume: 120,
        }),
      )
      .mockResolvedValueOnce(response({ approvedExemptionVolume: '250.5' }))
      .mockResolvedValueOnce(response({ exemptionVolumeRemaining: 130 }))
      .mockResolvedValueOnce(
        response({
          exemptionTypeDescription: 'Blanket OIC',
          blanketOic: true,
        }),
      )

    const result = await fetchProvincialPermitDetail('777')

    expect(getCachedResponseMock).toHaveBeenCalledTimes(4)
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
    expect(getCachedResponseMock).toHaveBeenNthCalledWith(4, '/lexis/exemptions/EX-9', undefined, {
      ttlMs: 30_000,
    })
    expect(result).toMatchObject({
      permitNumber: 777,
      exemptionNumber: 'EX-9',
      applicationDate: '2026-04-10',
      receivedDate: '2026-04-15',
      approvedExemptionVolume: 250.5,
      exemptionVolumeRemaining: 130,
      exemptionTypeDescription: 'Blanket OIC',
      blanketOic: true,
    })
    expect(registerRecordVersionMock).toHaveBeenCalledWith(
      'permit',
      '777',
      expect.objectContaining({ data: expect.objectContaining({ permitNumber: 777 }) }),
      '/lexis/permits/777',
    )
  })

  it('registers application and exemption detail versions against their authoritative URLs', async () => {
    getCachedResponseMock
      .mockResolvedValueOnce(response({ applicationNumber: 46079 }))
      .mockResolvedValueOnce(response({ exemptionNumber: 'EX-9' }))

    await fetchProvincialApplicationDetail('46079')
    await fetchProvincialExemptionDetail('EX-9')

    expect(registerRecordVersionMock).toHaveBeenNthCalledWith(
      1,
      'application',
      '46079',
      expect.any(Object),
      '/lexis/applications/46079',
    )
    expect(registerRecordVersionMock).toHaveBeenNthCalledWith(
      2,
      'exemption',
      'EX-9',
      expect.any(Object),
      '/lexis/exemptions/EX-9',
    )
  })

  it.each([
    '/lexis/rpc/permit-details/approved-exemption-volume',
    '/lexis/rpc/permit-details/exemption-volume-remaining',
    '/lexis/exemptions/EX-9',
  ])('rejects permit detail when required exemption context fails at %s', async (failedPath) => {
    getCachedResponseMock.mockImplementation((path: string) => {
      if (path === failedPath) {
        return Promise.reject(new Error(`unavailable: ${path}`))
      }
      if (path === '/lexis/permits/777') {
        return Promise.resolve(response({ permitNumber: 777, exemptionNumber: 'EX-9' }))
      }
      if (path.endsWith('/approved-exemption-volume')) {
        return Promise.resolve(response({ approvedExemptionVolume: 250 }))
      }
      if (path.endsWith('/exemption-volume-remaining')) {
        return Promise.resolve(response({ exemptionVolumeRemaining: 125 }))
      }
      return Promise.resolve(
        response({ exemptionTypeDescription: 'Ministerial', blanketOic: false }),
      )
    })

    await expect(fetchProvincialPermitDetail('777')).rejects.toThrow(`unavailable: ${failedPath}`)
  })

  it('rejects permit detail when a required exemption context endpoint returns no content', async () => {
    getCachedResponseMock
      .mockResolvedValueOnce(response({ permitNumber: 777, exemptionNumber: 'EX-9' }))
      .mockResolvedValueOnce(response(undefined, 204))
      .mockResolvedValueOnce(response({ exemptionVolumeRemaining: 125 }))
      .mockResolvedValueOnce(
        response({ exemptionTypeDescription: 'Ministerial', blanketOic: false }),
      )

    await expect(fetchProvincialPermitDetail('777')).rejects.toThrow(/service unavailable/i)
  })

  it('rejects permit detail when the exemption type cannot be verified', async () => {
    getCachedResponseMock
      .mockResolvedValueOnce(response({ permitNumber: 777, exemptionNumber: 'EX-9' }))
      .mockResolvedValueOnce(response({ approvedExemptionVolume: 250 }))
      .mockResolvedValueOnce(response({ exemptionVolumeRemaining: 125 }))
      .mockResolvedValueOnce(response({ exemptionTypeDescription: 'Blanket OIC' }))

    await expect(fetchProvincialPermitDetail('777')).rejects.toThrow(
      /invalid permit exemption context/i,
    )
  })

  it('always bypasses the federal detail cache and preserves explicit lock state', async () => {
    getCachedResponseMock.mockResolvedValue(
      response({
        applicationNumber: 700123,
        locked: false,
        lockHeldByCurrentUser: true,
        lockedBy: null,
        lockMessage: null,
      }),
    )

    const result = await fetchFederalApplicationDetail('700123')

    expect(getCachedResponseMock).toHaveBeenCalledWith(
      '/lexis/federal/applications/700123',
      undefined,
      { ttlMs: 0 },
    )
    expect(result).toMatchObject({
      locked: false,
      lockHeldByCurrentUser: true,
      lockedBy: null,
      lockMessage: null,
    })
    expect(registerRecordVersionMock).toHaveBeenCalledWith(
      'federal-application',
      '700123',
      expect.any(Object),
      '/lexis/federal/applications/700123',
    )
  })

  it('fails federal detail editing closed when lock state is absent', async () => {
    getCachedResponseMock.mockResolvedValue(response({ applicationNumber: 700123 }))

    const result = await fetchFederalApplicationDetail('700123')

    expect(result).toMatchObject({
      locked: true,
      lockHeldByCurrentUser: false,
      lockedBy: null,
      lockMessage:
        'Application edit lock state could not be verified. Editing is unavailable until the application is reloaded.',
    })
  })

  it('bypasses the offer detail cache and preserves an explicit lock state', async () => {
    getCachedResponseMock.mockResolvedValue(
      response({
        offerNumber: 81001,
        canEditScheduleDates: true,
        canEditOfferRemarks: true,
        canEditOfferDetails: true,
        canEditWithdrawFields: true,
        locked: false,
        lockedBy: null,
        lockMessage: null,
      }),
    )

    const result = await fetchProvincialOfferDetail('81001')

    expect(getCachedResponseMock).toHaveBeenCalledWith('/lexis/purchase-offers/81001', undefined, {
      ttlMs: 0,
    })
    expect(result).toMatchObject({
      locked: false,
      canEditOfferDetails: true,
      lockMessage: null,
    })
    expect(registerRecordVersionMock).toHaveBeenCalledWith(
      'offer',
      '81001',
      expect.any(Object),
      '/lexis/purchase-offers/81001',
    )
  })

  it('fails closed when the offer detail omits lock state', async () => {
    getCachedResponseMock.mockResolvedValue(
      response({
        offerNumber: 81001,
        canEditScheduleDates: true,
        canEditOfferRemarks: true,
        canEditOfferDetails: true,
        canEditWithdrawFields: true,
      }),
    )

    const result = await fetchProvincialOfferDetail('81001')

    expect(result).toMatchObject({
      locked: true,
      canEditScheduleDates: false,
      canEditOfferRemarks: false,
      canEditOfferDetails: false,
      canEditWithdrawFields: false,
    })
    expect(result?.lockMessage).toContain('could not be verified')
  })

  it('releases the offer edit lock as best-effort cleanup', async () => {
    postMock.mockResolvedValue(response({ release: 'ok' }))

    await releaseOfferEditLock('81001')

    expect(postMock).toHaveBeenCalledWith('/lexis/rpc/offer-details/release-lock', null, {
      params: { offerNumber: '81001' },
    })
  })
})
