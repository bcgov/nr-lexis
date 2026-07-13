import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchExemptionBlanketOicTotals,
  fetchExemptionEditContext,
  fetchExemptionPermits,
} from '@/service/provincial-exemption-detail-service'

const getMock = vi.fn()

vi.mock('@/service/api-service', () => ({
  default: {
    getAxiosInstance: () => ({
      get: getMock,
    }),
  },
}))

describe('provincial exemption detail service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects an empty edit-context response instead of treating it as editable state', async () => {
    getMock.mockResolvedValue({ data: undefined, status: 204 })

    await expect(fetchExemptionEditContext('BOIC-205')).rejects.toThrow(
      'Unexpected exemption edit context payload.',
    )
  })

  it('parses a complete edit-context response', async () => {
    getMock.mockResolvedValue({
      data: {
        rateOverrideEnabled: false,
        fixedFeeRate: '',
        regionNumbers: [1903, 1904],
        locked: false,
        lockMessage: '',
      },
    })

    await expect(fetchExemptionEditContext(' BOIC-205 ')).resolves.toEqual({
      rateOverrideEnabled: false,
      fixedFeeRate: '',
      regionNumbers: ['1903', '1904'],
      locked: false,
      lockMessage: '',
    })
    expect(getMock).toHaveBeenCalledWith('/lexis/rpc/exemption-details/edit-context', {
      params: { exemptionNumber: 'BOIC-205' },
    })
  })

  it('parses authoritative permit rows including record-specific visibility', async () => {
    getMock.mockResolvedValue({
      data: [
        {
          permitNumber: 900101,
          permitVolume: '25.5',
          permitStatus: 'Active',
          permitIssueDate: '12-Jul-2026',
          canViewPermit: true,
        },
        {
          permitNumber: 900102,
          permitVolume: '14.0',
          permitStatus: 'Complete',
          permitIssueDate: '10-Jul-2026',
          canViewPermit: false,
        },
      ],
    })

    await expect(fetchExemptionPermits(' EX-777 ')).resolves.toEqual([
      {
        permitNumber: '900101',
        permitVolume: '25.5',
        permitStatus: 'Active',
        permitIssueDate: '12-Jul-2026',
        canViewPermit: true,
      },
      {
        permitNumber: '900102',
        permitVolume: '14.0',
        permitStatus: 'Complete',
        permitIssueDate: '10-Jul-2026',
        canViewPermit: false,
      },
    ])
    expect(getMock).toHaveBeenCalledWith('/lexis/rpc/exemption-details/permits', {
      params: { exemptionNumber: 'EX-777' },
    })
  })

  it('rejects permit rows without an explicit visibility decision', async () => {
    getMock.mockResolvedValue({
      data: [{ permitNumber: 900101, permitStatus: 'Active' }],
    })

    await expect(fetchExemptionPermits('EX-777')).rejects.toThrow(
      'Unexpected exemption permit payload.',
    )
  })

  it('parses Blanket OIC permit volume totals', async () => {
    getMock.mockResolvedValue({
      data: { requestedVolume: '500.0', completedVolume: 125.5 },
    })

    await expect(fetchExemptionBlanketOicTotals(' BOIC-205 ')).resolves.toEqual({
      requestedVolume: '500.0',
      completedVolume: '125.5',
    })
    expect(getMock).toHaveBeenCalledWith('/lexis/rpc/exemption-details/blanket-oic-totals', {
      params: { exemptionNumber: 'BOIC-205' },
    })
  })
})
