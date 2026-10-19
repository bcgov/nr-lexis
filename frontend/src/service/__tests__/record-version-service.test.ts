import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchCurrentApplicationRecordVersion,
  fetchCurrentExemptionRecordVersion,
  recordVersionLoadedAt,
} from '@/service/record-version-service'

const { getMock, markRecordVersionLoadedMock, recordVersionLoadedAtMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  markRecordVersionLoadedMock: vi.fn(),
  recordVersionLoadedAtMock: vi.fn(),
}))

vi.mock('@/service/api-service', () => ({
  default: {
    getAxiosInstance: () => ({ get: getMock }),
    markRecordVersionLoaded: markRecordVersionLoadedMock,
    recordVersionLoadedAt: recordVersionLoadedAtMock,
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

  it('notes the server time of the response for the record whose version it loaded', async () => {
    const headers = {
      'x-lexis-record-version': 'application-version-7',
      date: 'Tue, 06 Oct 2026 21:00:00 GMT',
    }
    getMock.mockResolvedValueOnce({ headers })

    await fetchCurrentApplicationRecordVersion(' 999000001 ')

    expect(markRecordVersionLoadedMock).toHaveBeenCalledWith('application', '999000001', headers)
  })

  it('does not note a load when the version could not be loaded', async () => {
    getMock.mockResolvedValueOnce({ headers: { date: 'Tue, 06 Oct 2026 21:00:00 GMT' } })
    getMock.mockRejectedValueOnce(new Error('Network Error'))

    await expect(fetchCurrentExemptionRecordVersion('TEST-EX-001')).rejects.toThrow()
    await expect(fetchCurrentExemptionRecordVersion('TEST-EX-001')).rejects.toThrow()

    expect(markRecordVersionLoadedMock).not.toHaveBeenCalled()
  })

  it('reads the load time of a record from the api service by record type and number', () => {
    recordVersionLoadedAtMock.mockReturnValueOnce(Date.parse('2026-10-06T22:00:00Z'))

    expect(recordVersionLoadedAt('permit', '9021022')).toBe(Date.parse('2026-10-06T22:00:00Z'))
    expect(recordVersionLoadedAtMock).toHaveBeenCalledWith('permit', '9021022')
  })
})
