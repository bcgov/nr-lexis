import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  deleteFeePolicy,
  deleteFilPolicy,
  fetchFeePolicies,
  fetchFeePolicyPage,
  fetchFilPolicies,
  fetchFilPolicyPage,
  upsertFeePolicy,
  upsertFilPolicy,
} from '@/service/admin-policy-service'

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
          orgUnitNo: 1904,
          orgUnitCode: 'rco',
          orgUnitName: 'Kootenay-Boundary Natural Resource Region',
          feeIncreasePercentage: '4',
          entryUser: 'idir\\admin',
          entryDateTime: '2026-02-01T00:00:00.000Z',
          updateUser: 'idir\\admin',
          updateDateTime: '2026-02-01T00:00:00.000Z',
        },
      ],
    })

    const result = await fetchFeePolicies()

    expect(getCachedResponseMock).toHaveBeenCalledWith(
      '/lexis/admin/policies/fee',
      {
        params: {
          page: 0,
          size: 100,
          sortField: 'effective_date',
          sortDirection: 'desc',
        },
      },
      {
        cacheKey: 'admin-policies:fee:effective_date:desc:0:100',
        ttlMs: 30_000,
      },
    )
    expect(getMock).not.toHaveBeenCalled()
    expect(result).toEqual([
      expect.objectContaining({
        id: 'fee-1',
        effectiveDate: '2026-02-01',
        orgUnitNo: '1904',
        orgUnitCode: 'RCO',
        orgUnitName: 'Kootenay-Boundary Natural Resource Region',
        policyPercentage: '4',
      }),
    ])
  })

  it('normalizes paginated fee policy metadata', async () => {
    getCachedResponseMock.mockResolvedValue({
      data: {
        results: [
          {
            policyId: 'fee-1',
            policyEffectiveDate: '2026-02-01',
            orgUnitNo: 1904,
            regionCode: 'co',
            feeIncreasePercentage: '4',
          },
        ],
        total: 42,
        page: 1,
        size: 20,
      },
    })

    const result = await fetchFeePolicyPage(1, 20)

    expect(getCachedResponseMock).toHaveBeenCalledWith(
      '/lexis/admin/policies/fee',
      {
        params: {
          page: 1,
          size: 20,
          sortField: 'effective_date',
          sortDirection: 'desc',
        },
      },
      {
        cacheKey: 'admin-policies:fee:effective_date:desc:1:20',
        ttlMs: 30_000,
      },
    )
    expect(result).toEqual({
      rows: [
        expect.objectContaining({
          id: 'fee-1',
          orgUnitNo: '1904',
          orgUnitCode: 'CO',
        }),
      ],
      total: 42,
      page: 1,
      size: 20,
    })
  })

  it('normalizes legacy fee policy RPC rows', async () => {
    getCachedResponseMock.mockResolvedValue({
      data: [
        {
          lexisFeePolicyId: 15,
          effectiveDate: '2026-02-01',
          orgUnitNo: 1904,
          orgUnitName: 'Kootenay-Boundary Natural Resource Region',
          percentIncrease: 4,
          entryUserId: 'admin',
          entryTimestamp: '2026-02-01',
          updateUserId: 'admin',
          updateTimestamp: '2026-02-02',
        },
      ],
    })

    const result = await fetchFeePolicies()

    expect(result).toEqual([
      expect.objectContaining({
        id: '15',
        orgUnitNo: '1904',
        orgUnitCode: '',
        orgUnitName: 'Kootenay-Boundary Natural Resource Region',
        policyPercentage: '4',
      }),
    ])
  })

  it('normalizes legacy FIL policy RPC rows', async () => {
    getCachedResponseMock.mockResolvedValue({
      data: [
        {
          lexisFeePolicyId: 21,
          effectiveDate: '2026-03-01',
          filPercent: 12,
          entryUserId: 'admin',
          entryTimestamp: '2026-03-01',
          updateUserId: 'admin',
          updateTimestamp: '2026-03-02',
        },
      ],
    })

    const result = await fetchFilPolicies()

    expect(result).toEqual([
      expect.objectContaining({
        id: '21',
        effectiveDate: '2026-03-01',
        filPercentage: '12',
      }),
    ])
  })

  it('normalizes paginated FIL policy metadata', async () => {
    getCachedResponseMock.mockResolvedValue({
      data: {
        results: [
          {
            policyId: 'fil-1',
            policyEffectiveDate: '2026-03-01',
            policyPercentage: '17',
          },
          {
            lexisFILPolicyId: 22,
            effectiveDate: '2026-02-01',
            filPercent: 16,
          },
        ],
        total: 24,
        page: 2,
        size: 10,
      },
    })

    const result = await fetchFilPolicyPage(2, 10)

    expect(getCachedResponseMock).toHaveBeenCalledWith(
      '/lexis/admin/policies/fil',
      {
        params: {
          page: 2,
          size: 10,
          sortField: 'effective_date',
          sortDirection: 'desc',
        },
      },
      {
        cacheKey: 'admin-policies:fil:effective_date:desc:2:10',
        ttlMs: 30_000,
      },
    )
    expect(result).toEqual({
      rows: [
        expect.objectContaining({
          id: 'fil-1',
          effectiveDate: '2026-03-01',
          filPercentage: '17',
        }),
        expect.objectContaining({
          id: '22',
          effectiveDate: '2026-02-01',
          filPercentage: '16',
        }),
      ],
      total: 24,
      page: 2,
      size: 10,
    })
  })

  it('passes fee policy sorting to the backend and preserves its row order', async () => {
    getCachedResponseMock.mockResolvedValue({
      data: {
        results: [
          { policyId: 'fee-1904', effectiveDate: '2026-01-01', orgUnitNo: 1904 },
          { policyId: 'fee-1905', effectiveDate: '2026-02-01', orgUnitNo: 1905 },
        ],
        total: 2,
        page: 0,
        size: 20,
      },
    })

    const result = await fetchFeePolicyPage(0, 20, 'org_unit_no', 'asc')

    expect(getCachedResponseMock).toHaveBeenCalledWith(
      '/lexis/admin/policies/fee',
      {
        params: {
          page: 0,
          size: 20,
          sortField: 'org_unit_no',
          sortDirection: 'asc',
        },
      },
      {
        cacheKey: 'admin-policies:fee:org_unit_no:asc:0:20',
        ttlMs: 30_000,
      },
    )
    expect(result.rows.map((row) => row.id)).toEqual(['fee-1904', 'fee-1905'])
  })

  it('passes fee-in-lieu sorting to the backend', async () => {
    getCachedResponseMock.mockResolvedValue({
      data: { results: [], total: 0, page: 1, size: 50 },
    })

    await fetchFilPolicyPage(1, 50, 'fil_percent', 'asc')

    expect(getCachedResponseMock).toHaveBeenCalledWith(
      '/lexis/admin/policies/fil',
      {
        params: {
          page: 1,
          size: 50,
          sortField: 'fil_percent',
          sortDirection: 'asc',
        },
      },
      {
        cacheKey: 'admin-policies:fil:fil_percent:asc:1:50',
        ttlMs: 30_000,
      },
    )
  })

  it('throws API errors when fee policy API request fails', async () => {
    const apiError = { response: { status: 500 } }
    getCachedResponseMock.mockRejectedValue(apiError)

    await expect(fetchFeePolicies()).rejects.toBe(apiError)
  })

  it('submits the numeric organization unit without conflating its display code', async () => {
    postMock.mockResolvedValue({ data: { success: true } })
    getCachedResponseMock.mockResolvedValue({ data: [] })

    await upsertFeePolicy({
      effectiveDate: '2026-08-01',
      orgUnitNo: ' 1904 ',
      policyPercentage: ' 5 ',
    })

    expect(postMock).toHaveBeenCalledWith('/lexis/admin/policies/fee', {
      effectiveDate: '2026-08-01',
      orgUnitNo: '1904',
      policyPercentage: '5',
    })
    expect(getCachedResponseMock).not.toHaveBeenCalled()
  })

  it('preserves the numeric organization unit for fee policy edits', async () => {
    putMock.mockResolvedValue({ data: { success: true } })
    getCachedResponseMock.mockResolvedValue({ data: [] })

    await upsertFeePolicy({
      id: '15',
      effectiveDate: '2026-08-01',
      orgUnitNo: '1904',
      policyPercentage: '6',
    })

    expect(putMock).toHaveBeenCalledWith('/lexis/admin/policies/fee/15', {
      effectiveDate: '2026-08-01',
      orgUnitNo: '1904',
      policyPercentage: '6',
    })
    expect(getCachedResponseMock).not.toHaveBeenCalled()
  })

  it('leaves fee-in-lieu and delete page reloads to the current table view', async () => {
    postMock.mockResolvedValue({ data: { success: true } })
    deleteMock.mockResolvedValue({ data: { success: true } })

    await upsertFilPolicy({
      effectiveDate: '2026-08-01',
      filPercentage: '12',
    })
    await deleteFeePolicy('15')
    await deleteFilPolicy('21')

    expect(postMock).toHaveBeenCalledWith('/lexis/admin/policies/fil', {
      effectiveDate: '2026-08-01',
      filPercentage: '12',
    })
    expect(deleteMock).toHaveBeenCalledWith('/lexis/admin/policies/fee/15')
    expect(deleteMock).toHaveBeenCalledWith('/lexis/admin/policies/fil/21')
    expect(getCachedResponseMock).not.toHaveBeenCalled()
  })

  it('throws API errors when fee policy upsert fails', async () => {
    postMock.mockRejectedValue({ response: { status: 404 } })

    await expect(
      upsertFeePolicy({
        effectiveDate: '2026-04-01',
        orgUnitNo: ' 1904 ',
        policyPercentage: ' 5 ',
      }),
    ).rejects.toEqual({ response: { status: 404 } })
  })
})
