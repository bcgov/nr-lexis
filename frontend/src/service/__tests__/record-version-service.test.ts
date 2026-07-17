import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchCurrentApplicationRecordVersion,
  fetchCurrentExemptionRecordVersion,
} from '@/service/record-version-service'

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }))

vi.mock('@/service/api-service', () => ({
  default: {
    getAxiosInstance: () => ({ get: getMock }),
  },
}))

describe('record version service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads the current application version without using a cached detail response', async () => {
    getMock.mockResolvedValue({
      headers: { 'x-lexis-record-version': ' application-version-7 ' },
    })

    await expect(fetchCurrentApplicationRecordVersion(' 999000001 ')).resolves.toBe(
      'application-version-7',
    )
    expect(getMock).toHaveBeenCalledWith('/lexis/record-versions/application', {
      headers: { 'Cache-Control': 'no-cache' },
      params: { applicationNumber: '999000001' },
    })
  })

  it('loads an encoded exemption version and fails closed when the header is absent', async () => {
    getMock.mockResolvedValueOnce({
      headers: { 'X-Lexis-Record-Version': 'exemption-version-9' },
    })

    await expect(fetchCurrentExemptionRecordVersion(' TEST/001 ')).resolves.toBe(
      'exemption-version-9',
    )
    expect(getMock).toHaveBeenCalledWith('/lexis/record-versions/exemption', {
      headers: { 'Cache-Control': 'no-cache' },
      params: { exemptionNumber: 'TEST/001' },
    })

    getMock.mockResolvedValueOnce({ headers: {} })
    await expect(fetchCurrentExemptionRecordVersion('TEST-EX-001')).rejects.toThrow(
      'The current record version could not be loaded.',
    )
  })
})
