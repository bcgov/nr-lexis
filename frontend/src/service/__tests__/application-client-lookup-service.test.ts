import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchApplicationClientData,
  fetchApplicationClientContacts,
  fetchApplicationClientLocations,
  fetchExemptionClientData,
  fetchExemptionClientLocations,
} from '@/service/application-client-lookup-service'

const { getCachedDataMock } = vi.hoisted(() => ({
  getCachedDataMock: vi.fn(),
}))

vi.mock('@/service/api-service', () => ({
  default: {
    getCachedData: getCachedDataMock,
  },
}))

describe('application-client-lookup-service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads and parses owner client locations', async () => {
    getCachedDataMock.mockResolvedValue([
      { locationCode: '00', locationName: '00', selected: false },
      { locationCode: '01', locationName: '01 - MAIN LOCATION', selected: true },
      { locationCode: ' ', locationName: 'Bad Code', selected: false },
      { locationCode: '02', locationName: ' ', selected: false },
    ])

    const result = await fetchApplicationClientLocations(' 00011111 ')

    expect(getCachedDataMock).toHaveBeenCalledWith(
      '/lexis/rpc/application-details/client-locations',
      {
        params: {
          applicantType: 'owner',
          clientNumber: '00011111',
        },
      },
      {
        cacheKey: 'application-client-locations:owner:00011111',
        ttlMs: 300000,
      },
    )
    expect(result).toEqual([
      { locationCode: '00', locationName: '00', selected: false },
      { locationCode: '01', locationName: '01 - MAIN LOCATION', selected: true },
    ])
  })

  it('loads agent client locations with agent lookup context', async () => {
    getCachedDataMock.mockResolvedValue([
      { locationCode: '01', locationName: '01 - AGENT LOCATION', selected: true },
    ])

    const result = await fetchApplicationClientLocations(' 00033333 ', 'agent')

    expect(getCachedDataMock).toHaveBeenCalledWith(
      '/lexis/rpc/application-details/client-locations',
      {
        params: {
          applicantType: 'agent',
          clientNumber: '00033333',
        },
      },
      {
        cacheKey: 'application-client-locations:agent:00033333',
        ttlMs: 300000,
      },
    )
    expect(result).toEqual([
      { locationCode: '01', locationName: '01 - AGENT LOCATION', selected: true },
    ])
  })

  it('includes the parent application when loading related client locations', async () => {
    getCachedDataMock.mockResolvedValue([
      { locationCode: '01', locationName: '01 - AGENT LOCATION', selected: true },
    ])

    await fetchApplicationClientLocations('00033333', 'agent', '321')

    expect(getCachedDataMock).toHaveBeenCalledWith(
      '/lexis/rpc/application-details/client-locations',
      {
        params: {
          applicantType: 'agent',
          applicationNumber: '321',
          clientNumber: '00033333',
        },
      },
      {
        cacheKey: 'application-client-locations:agent:00033333:321',
        ttlMs: 300000,
      },
    )
  })

  it('loads and parses client data for a selected location', async () => {
    getCachedDataMock.mockResolvedValue({
      clientNumber: ' 00011111 ',
      companyName: ' Example Lumber ',
      address: ' 123 Forest Road ',
      city: ' Victoria ',
      province: ' BC ',
      postalCode: ' V8V 1A1 ',
      country: ' Canada ',
      phone: ' 250-555-0101 ',
      fax: ' 250-555-0102 ',
      email: ' contact@example.test ',
      notfound: ' ',
    })

    const result = await fetchApplicationClientData(' 00011111 ', ' 01 ')

    expect(getCachedDataMock).toHaveBeenCalledWith(
      '/lexis/rpc/application-details/client-data',
      {
        params: {
          clientLocationCode: '01',
          clientNumber: '00011111',
        },
      },
      {
        cacheKey: 'application-client-data:00011111:01',
        ttlMs: 300000,
      },
    )
    expect(result).toEqual({
      clientNumber: '00011111',
      companyName: 'Example Lumber',
      address: '123 Forest Road',
      city: 'Victoria',
      province: 'BC',
      postalCode: 'V8V 1A1',
      country: 'Canada',
      phone: '250-555-0101',
      fax: '250-555-0102',
      email: 'contact@example.test',
      notfound: '',
    })
  })

  it('uses exemption-authorized endpoints for exemption client details', async () => {
    getCachedDataMock
      .mockResolvedValueOnce({
        clientNumber: '00011111',
        companyName: 'Example Lumber',
      })
      .mockResolvedValueOnce([
        { locationCode: '03', locationName: '03 - WOODLANDS', selected: true },
      ])

    await fetchExemptionClientData(' 00011111 ', ' 03 ')
    await fetchExemptionClientLocations(' 00011111 ')

    expect(getCachedDataMock).toHaveBeenNthCalledWith(
      1,
      '/lexis/rpc/exemption-details/client-data',
      {
        params: {
          clientLocationCode: '03',
          clientNumber: '00011111',
        },
      },
      {
        cacheKey: 'exemption-client-data:00011111:03',
        ttlMs: 300000,
      },
    )
    expect(getCachedDataMock).toHaveBeenNthCalledWith(
      2,
      '/lexis/rpc/exemption-details/client-locations',
      {
        params: {
          clientNumber: '00011111',
        },
      },
      {
        cacheKey: 'exemption-client-locations:00011111',
        ttlMs: 300000,
      },
    )
  })

  it('does not call the client data API without a client number and location code', async () => {
    await expect(fetchApplicationClientData('', '01')).resolves.toBeNull()
    await expect(fetchApplicationClientData('00011111', '')).resolves.toBeNull()

    expect(getCachedDataMock).not.toHaveBeenCalled()
  })

  it('keeps an explicit not-found client response distinct from an unavailable response', async () => {
    getCachedDataMock.mockResolvedValue({ notfound: 'true' })

    await expect(fetchApplicationClientData('00011111', '01')).resolves.toBeNull()
  })

  it('rejects a malformed not-found client response', async () => {
    getCachedDataMock.mockResolvedValue({ notfound: 'false' })

    await expect(fetchApplicationClientData('00011111', '01')).rejects.toThrow(
      'empty or malformed response',
    )
  })

  it('scopes related client data lookups to their parent record', async () => {
    getCachedDataMock.mockResolvedValue({
      clientNumber: '00022222',
      companyName: 'Related Agent',
    })

    await fetchApplicationClientData('00022222', '01', {
      applicationNumber: '321',
    })
    await fetchApplicationClientData('00022222', '01', {
      permitNumber: '9020431',
    })

    expect(getCachedDataMock).toHaveBeenNthCalledWith(
      1,
      '/lexis/rpc/application-details/client-data',
      {
        params: {
          applicationNumber: '321',
          clientLocationCode: '01',
          clientNumber: '00022222',
        },
      },
      {
        cacheKey: 'application-client-data:00022222:01:application:321',
        ttlMs: 300000,
      },
    )
    expect(getCachedDataMock).toHaveBeenNthCalledWith(
      2,
      '/lexis/rpc/application-details/client-data',
      {
        params: {
          permitNumber: '9020431',
          clientLocationCode: '01',
          clientNumber: '00022222',
        },
      },
      {
        cacheKey: 'application-client-data:00022222:01:permit:9020431',
        ttlMs: 300000,
      },
    )
  })

  it('does not call the API when client number is blank', async () => {
    const result = await fetchApplicationClientLocations('  ')

    expect(result).toEqual([])
    expect(getCachedDataMock).not.toHaveBeenCalled()
  })

  it('propagates endpoint failures so callers can distinguish unavailable from no data', async () => {
    const error = new Error('network')
    const lookups = [
      () => fetchApplicationClientData('00011111', '01'),
      () => fetchExemptionClientData('00011111', '01'),
      () => fetchApplicationClientLocations('00011111'),
      () => fetchExemptionClientLocations('00011111'),
      () => fetchApplicationClientContacts('00011111', '01'),
    ]

    for (const lookup of lookups) {
      getCachedDataMock.mockRejectedValueOnce(error)
      await expect(lookup()).rejects.toBe(error)
    }
  })

  it('rejects empty successful responses so a 204 is not treated as no client data', async () => {
    const lookups = [
      () => fetchApplicationClientData('00011111', '01'),
      () => fetchExemptionClientData('00011111', '01'),
      () => fetchApplicationClientLocations('00011111'),
      () => fetchExemptionClientLocations('00011111'),
      () => fetchApplicationClientContacts('00011111', '01'),
    ]

    for (const lookup of lookups) {
      getCachedDataMock.mockResolvedValueOnce(undefined)
      await expect(lookup()).rejects.toThrow('empty or malformed response')
    }

    getCachedDataMock.mockResolvedValueOnce({})
    await expect(fetchApplicationClientData('00011111', '01')).rejects.toThrow(
      'empty or malformed response',
    )
  })

  it('loads and parses contacts for a client location', async () => {
    getCachedDataMock.mockResolvedValue([
      { contactName: 'Owner Contact', contactId: '-1' },
      { contactName: 'Alternate Contact', contactId: '12' },
      { contactName: 'No contacts on file for this location', contactId: '0' },
      { contactName: ' ', contactId: '99' },
    ])

    const result = await fetchApplicationClientContacts(' 00011111 ', ' 01 ', 'owner', '321')

    expect(getCachedDataMock).toHaveBeenCalledWith(
      '/lexis/rpc/application-details/contacts-for-location',
      {
        params: {
          applicantType: 'owner',
          applicationNumber: '321',
          clientLocationCode: '01',
          clientNumber: '00011111',
        },
      },
      {
        cacheKey: 'application-client-contacts:owner:00011111:01:321',
        ttlMs: 300000,
      },
    )
    expect(result).toEqual([
      { contactName: 'Owner Contact', contactId: '-1' },
      { contactName: 'Alternate Contact', contactId: '12' },
    ])
  })

  it('does not call the contacts API without a client number and location code', async () => {
    await expect(fetchApplicationClientContacts('', '01')).resolves.toEqual([])
    await expect(fetchApplicationClientContacts('00011111', '')).resolves.toEqual([])

    expect(getCachedDataMock).not.toHaveBeenCalled()
  })
})
