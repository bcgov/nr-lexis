import { beforeEach, describe, expect, it, vi } from 'vitest'
import { searchForestClients } from '../client-search-service'
const { getCachedData } = vi.hoisted(() => ({ getCachedData: vi.fn() }))
vi.mock('@/service/api-service', () => ({ default: { getCachedData } }))

describe('client-search-service', () => {
  beforeEach(() => {
    getCachedData.mockReset()
  })
  it('does not request short terms or overlong numeric identifiers', async () => {
    expect(await searchForestClients(' ab ')).toEqual([])
    expect(await searchForestClients('123456789')).toEqual([])
    expect(getCachedData).not.toHaveBeenCalled()
  })
  it('uses the authorized endpoint with the counterparty and disables cached suggestions', async () => {
    getCachedData.mockResolvedValue([
      { clientNumber: '00012345', companyName: ' Sample ', clientAcronym: ' SFC ' },
    ])
    expect(await searchForestClients(' Sam ', ' 00011111 ')).toEqual([
      { clientNumber: '00012345', companyName: 'Sample', clientAcronym: 'SFC' },
    ])
    expect(getCachedData).toHaveBeenCalledWith(
      '/lexis/client-search',
      { params: { q: 'Sam', counterpartyClientNumber: '00011111' } },
      { ttlMs: 0 },
    )
  })
  it('deduplicates in source order and caps results at fifteen', async () => {
    const entries = Array.from({ length: 18 }, (_, index) => ({
      clientNumber: `${index}`.padStart(8, '0'),
    }))
    getCachedData.mockResolvedValue([entries[0], ...entries])
    const result = await searchForestClients('Sam')
    expect(result).toHaveLength(15)
    expect(result[14].clientNumber).toBe('00000014')
  })
  it.each([{ clientAcronym: null }, {}])(
    'accepts a name/number result with %j',
    async (acronym) => {
      getCachedData.mockResolvedValue([
        { clientNumber: '00012345', companyName: ' Sample ', ...acronym },
      ])
      expect(await searchForestClients('Sam')).toEqual([
        { clientNumber: '00012345', companyName: 'Sample', clientAcronym: '' },
      ])
    },
  )
  it.each([null, {}, [{ clientNumber: '123' }], [null]])(
    'rejects malformed responses %j',
    async (response) => {
      getCachedData.mockResolvedValue(response)
      await expect(searchForestClients('Sam')).rejects.toThrow(/invalid/)
    },
  )
  it('propagates lookup errors instead of reporting no matches', async () => {
    getCachedData.mockRejectedValue(new Error('Unavailable'))
    await expect(searchForestClients('Sam')).rejects.toThrow('Unavailable')
  })
})
