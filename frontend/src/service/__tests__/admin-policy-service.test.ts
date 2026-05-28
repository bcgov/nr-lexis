import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchFeePolicies, upsertFeePolicy } from '@/service/admin-policy-service'

const getMock = vi.fn()
const postMock = vi.fn()
const putMock = vi.fn()
const deleteMock = vi.fn()

vi.mock('@/service/api-service', () => ({
  default: {
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
    vi.unstubAllEnvs()
    localStorage.clear()
  })

  it('normalizes fee policy API rows', async () => {
    getMock.mockResolvedValue({
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

    expect(getMock).toHaveBeenCalledWith('/lexis/admin/policies/fee')
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

  it('throws API errors when local fallback is disabled (default)', async () => {
    const apiError = { response: { status: 500 } }
    getMock.mockRejectedValue(apiError)

    await expect(fetchFeePolicies()).rejects.toBe(apiError)
  })

  it('uses local fee policies when fallback toggle is enabled', async () => {
    vi.stubEnv('VITE_LEXIS_ENABLE_ADMIN_POLICY_LOCAL_FALLBACK', 'true')
    getMock.mockRejectedValue({ response: { status: 503 } })

    localStorage.setItem(
      'lexis.admin.feePolicies',
      JSON.stringify([
        {
          id: 'older',
          effectiveDate: '2026-01-01',
          orgUnitCode: '11',
          orgUnitName: 'Cariboo',
          policyPercentage: '2.0',
          entryUserId: 'idir\\user',
          entryTimestamp: '2026-01-01T00:00:00.000Z',
          updateUserId: 'idir\\user',
          updateTimestamp: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'newer',
          effectiveDate: '2026-03-01',
          orgUnitCode: '12',
          orgUnitName: 'Coast',
          policyPercentage: '4.0',
          entryUserId: 'idir\\user',
          entryTimestamp: '2026-03-01T00:00:00.000Z',
          updateUserId: 'idir\\user',
          updateTimestamp: '2026-03-01T00:00:00.000Z',
        },
      ]),
    )

    const result = await fetchFeePolicies()

    expect(result.map((row) => row.id)).toEqual(['newer', 'older'])
  })

  it('falls back to local upsert when enabled and API write fails', async () => {
    vi.stubEnv('VITE_LEXIS_ENABLE_ADMIN_POLICY_LOCAL_FALLBACK', 'true')

    postMock.mockRejectedValue({ response: { status: 404 } })

    localStorage.setItem(
      'lexis.admin.feePolicies',
      JSON.stringify([
        {
          id: 'fee-1',
          effectiveDate: '2026-01-01',
          orgUnitCode: '11',
          orgUnitName: 'Cariboo',
          policyPercentage: '2.0',
          entryUserId: 'idir\\user',
          entryTimestamp: '2026-01-01T00:00:00.000Z',
          updateUserId: 'idir\\user',
          updateTimestamp: '2026-01-01T00:00:00.000Z',
        },
      ]),
    )

    const result = await upsertFeePolicy({
      effectiveDate: '2026-04-01',
      orgUnitCode: ' 12 ',
      orgUnitName: ' Coast ',
      policyPercentage: ' 5.0 ',
    })

    expect(result).toHaveLength(2)
    expect(result[0]).toEqual(
      expect.objectContaining({
        effectiveDate: '2026-04-01',
        orgUnitCode: '12',
        orgUnitName: 'Coast',
        policyPercentage: '5.0',
      }),
    )
  })
})
