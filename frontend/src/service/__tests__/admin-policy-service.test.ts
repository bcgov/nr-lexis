import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchFeePolicies, upsertFeePolicy } from '@/service/admin-policy-service'

const { deleteMock, getCachedResponseMock, getMock, postMock, putMock } = vi.hoisted(() => ({
  deleteMock: vi.fn(),
  getCachedResponseMock: vi.fn(),
  getMock: vi.fn(),
  postMock: vi.fn(),
  putMock: vi.fn(),
}))

vi.mock('@/service/api-service', () => ({
  default: {
    getCachedResponse: getCachedResponseMock,
    getAxiosInstance: () => ({
      get: getMock,
      post: postMock,
      put: putMock,
      delete: deleteMock,
    }),
  },
}))

describe('admin-policy-service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('normalizes fee policy API rows', async () => {
    getCachedResponseMock.mockResolvedValue({
      data: [
        {
          policyId: 'fee-1',
          policyEffectiveDate: '2026-02-01',
          regionCode: 'co',
          regionName: 'Coast',
          feeIncreasePercentage: '3.5',
          entryUser: 'idir\\admin',
          entryDateTime: '2026-02-01T00:00:00.000Z',
          updateUser: 'idir\\admin',
          updateDateTime: '2026-02-01T00:00:00.000Z',
        },
      ],
    })

    const result = await fetchFeePolicies()

    expect(getCachedResponseMock).toHaveBeenCalledWith('/lexis/admin/policies/fee', undefined, {
      cacheKey: 'admin-policies:fee',
      ttlMs: 30_000,
    })
    expect(getMock).not.toHaveBeenCalled()
    expect(result).toEqual([
      expect.objectContaining({
        id: 'fee-1',
        effectiveDate: '2026-02-01',
        orgUnitCode: 'CO',
        orgUnitName: 'Coast',
        policyPercentage: '3.5',
      }),
    ])
  })

  it('throws API errors when fee policy API request fails', async () => {
    const apiError = { response: { status: 500 } }
    getCachedResponseMock.mockRejectedValue(apiError)

    await expect(fetchFeePolicies()).rejects.toBe(apiError)
  })

  it('throws API errors when fee policy upsert fails', async () => {
    postMock.mockRejectedValue({ response: { status: 404 } })

    await expect(
      upsertFeePolicy({
        effectiveDate: '2026-04-01',
        orgUnitCode: ' 12 ',
        orgUnitName: ' Coast ',
        policyPercentage: ' 5.0 ',
      }),
    ).rejects.toEqual({ response: { status: 404 } })
  })
})
