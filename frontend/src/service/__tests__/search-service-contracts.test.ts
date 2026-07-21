import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  countApplicationReviews,
  previewApplicationReviews,
  searchApplicationReviews,
} from '@/service/application-review-search-service'
import {
  requireParsedSearchResponse,
  uniqueSearchItemsByKey,
} from '@/service/cached-search-service'
import {
  countFederalApplications,
  searchFederalApplications,
} from '@/service/federal-application-search-service'
import {
  countProvincialApplications,
  searchProvincialApplicationNumberOptions,
  searchProvincialApplications,
} from '@/service/provincial-application-search-service'
import {
  countProvincialExemptions,
  searchProvincialExemptions,
} from '@/service/provincial-exemption-search-service'
import {
  countProvincialOffers,
  searchProvincialOffers,
} from '@/service/provincial-offer-search-service'
import {
  countProvincialPermits,
  searchProvincialPermits,
} from '@/service/provincial-permit-search-service'

const { getCachedResponseMock } = vi.hoisted(() => ({
  getCachedResponseMock: vi.fn(),
}))

vi.mock('@/service/api-service', () => ({
  default: {
    getCachedResponse: getCachedResponseMock,
  },
}))

const applicationRequest = {
  filters: {
    applicationNumber: '101',
    packageNumber: 'PKG-1',
    exemptionType: 'GEN',
    exemptionNumber: 'EX-1',
    applicationStatus: 'NEW',
    productTypeCode: 'LUM',
    region: ['12'],
    receivedFromDate: '2025-12-01',
    receivedToDate: '2025-12-31',
    listingFromDate: '2026-01-01',
    listingToDate: '2026-01-31',
    exportScheduleId: '31916',
    applicantClientNumber: '00012345',
    ownerClientNumber: '00054321',
  },
  page: 1,
  pageSize: 20,
  sortField: 'applicationNumber' as const,
  sortDirection: 'desc' as const,
}

const exemptionRequest = {
  filters: {
    applicationNumber: '201',
    packageNumber: 'PKG-2',
    exemptionNumber: 'EX-2',
    region: ['22'],
    approvalFromDate: '2026-01-01',
    approvalToDate: '2026-01-31',
    listFromDate: '2026-02-01',
    listToDate: '2026-02-28',
    exemptionTypeCode: 'LOG',
    exemptionStatusCode: 'NEW',
    applicantClientNumber: '00099887',
    ownerClientNumber: '00077889',
  },
  page: 0,
  pageSize: 10,
  sortField: 'exemptionNumber' as const,
  sortDirection: 'asc' as const,
}

const federalRequest = {
  filters: {
    applicationNumber: '301',
    packageNumber: 'PKG-3',
    applicationStatus: 'OPEN',
    clientNumber: '00011122',
    receivedFromDate: '2026-03-01',
    receivedToDate: '2026-03-31',
    listingFromDate: '2026-03-01',
    listingToDate: '2026-03-31',
  },
  page: 0,
  pageSize: 15,
}

const offerRequest = {
  filters: {
    applicationNumber: '',
    packageNumber: '',
    clientNumber: '',
    listingFromDate: '',
    listingToDate: '',
    region: [],
    withdrawalFromDate: '',
    withdrawalToDate: '',
  },
  page: 0,
  pageSize: 10,
  sortField: 'offerNumber' as const,
  sortDirection: 'asc' as const,
}

const permitRequest = {
  filters: {
    applicationNumber: '',
    packageNumber: '',
    region: [],
    issuedFromDate: '',
    issuedToDate: '',
    permitStatus: '',
    permitNumber: '',
    invoiceNumber: '',
    ownerClientNumber: '',
    applicantClientNumber: '',
  },
  page: 0,
  pageSize: 10,
  sortField: 'permitNumber' as const,
  sortDirection: 'asc' as const,
}

const reviewRequest = {
  filters: {
    applicationNumber: '',
    productTypeCode: '',
    region: [],
    receivedFromDate: '',
    receivedToDate: '',
    listingFromDate: '',
    listingToDate: '',
  },
  page: 0,
  pageSize: 10,
  sortField: 'applicationNumber' as const,
  sortDirection: 'asc' as const,
}

const readParams = (callIndex = 0): URLSearchParams => {
  const [, config, options] = getCachedResponseMock.mock.calls[callIndex]
  expect(config).toBeDefined()
  expect(config.params).toBeInstanceOf(URLSearchParams)
  expect(options).toEqual({ ttlMs: 10_000 })
  return config.params as URLSearchParams
}

describe('search-service contracts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('keeps the first search option for each non-empty key', () => {
    const result = uniqueSearchItemsByKey(
      [
        { id: '100', label: 'first' },
        { id: '', label: 'blank' },
        { id: '100', label: 'duplicate' },
        { id: '101', label: 'second' },
      ],
      (item) => item.id,
    )

    expect(result).toEqual([
      { id: '100', label: 'first' },
      { id: '101', label: 'second' },
    ])
  })

  it('requires parsed search responses', () => {
    expect(requireParsedSearchResponse({ content: [] }, 'missing')).toEqual({ content: [] })
    expect(() => requireParsedSearchResponse(null, 'missing')).toThrow('missing')
  })

  it('maps provincial application results and backend query params', async () => {
    getCachedResponseMock.mockResolvedValue({
      data: {
        results: [
          {
            application: 101,
            status: 'New',
            client: '00012345',
            ownerClientNumber: '00054321',
            exemptionNumber: 'EX-1',
            listingDate: '2026-01-02',
            region: '22',
            applicationVolume: 40.5,
            showCheckbox: true,
            locked: false,
          },
        ],
        total: 12,
        page: 1,
        size: 20,
      },
    })

    const result = await searchProvincialApplications(applicationRequest)

    expect(getCachedResponseMock).toHaveBeenCalledWith(
      '/lexis/applications/search',
      expect.any(Object),
      { ttlMs: 10_000 },
    )
    const params = readParams()
    expect(params.get('applicationNumber')).toBe('101')
    expect(params.get('agentClientNumber')).toBe('00012345')
    expect(params.get('region')).toBe('12')
    expect(params.get('receivedFromDate')).toBe('2025-12-01')
    expect(params.get('receivedToDate')).toBe('2025-12-31')
    expect(params.get('exportScheduleId')).toBe('31916')
    expect(params.get('sortField')).toBe('applicationNumber DESC')
    expect(result.page.totalElements).toBe(12)
    expect(result.content[0]).toEqual(
      expect.objectContaining({
        applicationNumber: '101',
        applicantClientNumber: '00012345',
        allowCreateExemption: true,
      }),
    )
  })

  it('fails federal exemption eligibility closed when the backend omits its selectable flag', async () => {
    getCachedResponseMock.mockResolvedValue({
      data: {
        results: [
          {
            applicationNumber: 302,
            federalApplicationNumber: 'FED-302',
            status: 'Approved',
            client: '00011122',
            reason: 'Test reason',
            exemptionNumber: '',
            receivedDate: '2026-03-02',
            listingDate: '2026-03-04',
          },
        ],
        total: 1,
        page: 0,
        size: 15,
      },
    })

    const result = await searchFederalApplications(federalRequest)

    expect(result.content[0].allowCreateExemption).toBe(false)
  })

  it('fails federal exemption eligibility closed when the backend omits lock state', async () => {
    getCachedResponseMock.mockResolvedValue({
      data: {
        results: [
          {
            applicationNumber: 302,
            federalApplicationNumber: 'FED-302',
            status: 'Approved',
            client: '00011122',
            reason: 'Test reason',
            exemptionNumber: '',
            selectable: true,
            receivedDate: '2026-03-02',
            listingDate: '2026-03-04',
          },
        ],
        total: 1,
        page: 0,
        size: 15,
      },
    })

    const result = await searchFederalApplications(federalRequest)

    expect(result.content[0]).toEqual(
      expect.objectContaining({
        eligibleForExemption: true,
        locked: true,
        allowCreateExemption: false,
      }),
    )
  })

  it('loads provincial application number options from application search', async () => {
    getCachedResponseMock.mockResolvedValue({
      data: {
        results: [
          {
            application: 28077,
            status: 'Approved',
            client: '',
            ownerClientNumber: '00016245',
            exemptionNumber: '',
            listingDate: '2012-05-11',
            region: 'RKB',
            applicationVolume: 228,
            showCheckbox: true,
            locked: false,
          },
        ],
        total: 1,
        page: 0,
        size: 20,
      },
    })

    const result = await searchProvincialApplicationNumberOptions('280')

    const params = readParams()
    expect(params.get('applicationNumber')).toBe('280')
    expect(params.get('page')).toBe('0')
    expect(params.get('size')).toBe('20')
    expect(params.get('sortField')).toBe('applicationNumber DESC')
    expect(result).toEqual([
      expect.objectContaining({
        value: '28077',
        label: '28077 - Approved - Owner 00016245 - Region RKB - 2012-05-11',
      }),
    ])
  })

  it('maps provincial exemption status fields and approval gate', async () => {
    getCachedResponseMock.mockResolvedValue({
      data: {
        results: [
          {
            exemptionNumber: 'EX-2',
            exemptionType: 'LOG',
            status: 'New',
            applicantClientNumber: '00099887',
            ownerClientNumber: '00077889',
            listingDate: '2026-02-10',
            expiryDate: '2027-02-10',
            region: '11',
            approvedVolume: 55,
            balanceRemaining: 37.5,
            locked: false,
          },
        ],
        total: 1,
        page: 0,
        size: 10,
      },
    })

    const result = await searchProvincialExemptions(exemptionRequest)

    expect(getCachedResponseMock).toHaveBeenCalledWith(
      '/lexis/exemptions/search',
      expect.any(Object),
      { ttlMs: 10_000 },
    )
    const params = readParams()
    expect(params.get('exemptionStatusCode')).toBe('NEW')
    expect(params.get('region')).toBe('22')
    expect(params.get('approvalFromDate')).toBe('2026-01-01')
    expect(params.get('approvalToDate')).toBe('2026-01-31')
    expect(params.get('sortField')).toBe('exemptionNumber')
    expect(result.content[0]).toEqual(
      expect.objectContaining({
        exemptionNumber: 'EX-2',
        statusCode: 'NEW',
        applicantClientNumber: '00099887',
        balanceRemaining: 37.5,
        expiryDate: '2027-02-10',
        canApprove: true,
      }),
    )
  })

  it('sends supported descending exemption sort fields to the backend', async () => {
    getCachedResponseMock.mockResolvedValue({
      data: { results: [], total: 0, page: 0, size: 10 },
    })

    await searchProvincialExemptions({
      ...exemptionRequest,
      sortField: 'balanceRemaining',
      sortDirection: 'desc',
    })

    expect(readParams().get('sortField')).toBe('balanceRemaining DESC')
  })

  it('rejects exemption rows without an authoritative lock and balance', async () => {
    getCachedResponseMock.mockResolvedValue({
      data: {
        results: [
          {
            exemptionNumber: 'EX-2',
            exemptionType: 'LOG',
            status: 'New',
            applicantClientNumber: '00099887',
            ownerClientNumber: '00077889',
            listingDate: '2026-02-10',
            expiryDate: '2027-02-10',
            region: '11',
            approvedVolume: 55,
          },
        ],
        total: 1,
        page: 0,
        size: 10,
      },
    })

    await expect(searchProvincialExemptions(exemptionRequest)).rejects.toThrow(
      'Backend provincial exemption response did not include results.',
    )
  })

  it('maps federal search data and sends the client filter only to the legacy owner-or-agent param', async () => {
    getCachedResponseMock.mockResolvedValue({
      data: {
        results: [
          {
            applicationNumber: 301,
            federalApplicationNumber: 'FED-301',
            status: 'Open',
            client: '00011122',
            reason: 'Test reason',
            exemptionType: 'A',
            exemptionNumber: '',
            selectable: true,
            locked: false,
            receivedDate: '2026-03-02',
            listingDate: '2026-03-04',
          },
        ],
        total: 9,
        page: 0,
        size: 15,
      },
    })

    const result = await searchFederalApplications(federalRequest)

    expect(getCachedResponseMock).toHaveBeenCalledWith(
      '/lexis/federal/applications/search',
      expect.any(Object),
      { ttlMs: 10_000 },
    )
    const params = readParams()
    expect(params.get('ownerClientNumber')).toBe('00011122')
    expect(params.has('agentClientNumber')).toBe(false)
    expect(params.has('sortField')).toBe(false)
    expect(result.content[0]).toEqual(
      expect.objectContaining({
        federalApplicationNumber: 'FED-301',
        eligibleForExemption: true,
        locked: false,
        allowCreateExemption: true,
      }),
    )
  })

  it.each(['permitStatus', 'permitVolume', 'dateIssued'] as const)(
    'sends the supported provincial permit %s sort key and direction',
    async (sortField) => {
      getCachedResponseMock.mockResolvedValue({
        data: {
          results: [],
          total: 0,
          page: 0,
          size: 10,
        },
      })

      await searchProvincialPermits({
        ...permitRequest,
        sortField,
        sortDirection: 'desc',
      })

      expect(readParams().get('sortField')).toBe(`${sortField} DESC`)
    },
  )

  it('maps the provincial permit invoice number to search and count requests', async () => {
    getCachedResponseMock
      .mockResolvedValueOnce({
        data: {
          results: [],
          total: 0,
          page: 0,
          size: 10,
        },
      })
      .mockResolvedValueOnce({ data: { total: 4 } })
    const request = {
      ...permitRequest,
      filters: {
        ...permitRequest.filters,
        invoiceNumber: ' SI-99881 ',
      },
    }

    await searchProvincialPermits(request)
    await countProvincialPermits(request)

    expect(getCachedResponseMock).toHaveBeenNthCalledWith(
      1,
      '/lexis/permits/search',
      expect.any(Object),
      { ttlMs: 10_000 },
    )
    expect(readParams(0).get('invoiceNumber')).toBe('SI-99881')
    expect(getCachedResponseMock).toHaveBeenNthCalledWith(
      2,
      '/lexis/permits/search/count',
      expect.any(Object),
      { ttlMs: 10_000 },
    )
    const countParams = readParams(1)
    expect(countParams.get('invoiceNumber')).toBe('SI-99881')
    expect(countParams.has('sortField')).toBe(false)
    expect(countParams.has('page')).toBe(false)
    expect(countParams.has('size')).toBe(false)
  })

  it.each([
    {
      name: 'provincial applications',
      endpoint: '/lexis/applications/search',
      run: () => searchProvincialApplications({ ...applicationRequest, page: 2, pageSize: 30 }),
    },
    {
      name: 'provincial exemptions',
      endpoint: '/lexis/exemptions/search',
      run: () => searchProvincialExemptions({ ...exemptionRequest, page: 2, pageSize: 30 }),
    },
    {
      name: 'provincial offers',
      endpoint: '/lexis/purchase-offers/search',
      run: () => searchProvincialOffers({ ...offerRequest, page: 2, pageSize: 30 }),
    },
    {
      name: 'provincial permits',
      endpoint: '/lexis/permits/search',
      run: () => searchProvincialPermits({ ...permitRequest, page: 2, pageSize: 30 }),
    },
    {
      name: 'federal applications',
      endpoint: '/lexis/federal/applications/search',
      run: () => searchFederalApplications({ ...federalRequest, page: 2, pageSize: 30 }),
    },
    {
      name: 'application review',
      endpoint: '/lexis/application-reviews/search',
      run: () => searchApplicationReviews({ ...reviewRequest, page: 2, pageSize: 30 }),
    },
  ])(
    '$name preserves backend pagination metadata and request page params',
    async ({ endpoint, run }) => {
      getCachedResponseMock.mockResolvedValue({
        data: {
          results: [],
          total: 91,
          page: 2,
          size: 30,
        },
      })

      const result = await run()

      expect(getCachedResponseMock).toHaveBeenCalledWith(endpoint, expect.any(Object), {
        ttlMs: 10_000,
      })
      const params = readParams()
      expect(params.get('page')).toBe('2')
      expect(params.get('size')).toBe('30')
      expect(result.content).toEqual([])
      expect(result.page).toEqual({
        number: 2,
        size: 30,
        totalElements: 91,
        totalPages: 4,
      })
    },
  )

  it.each([
    {
      name: 'provincial application',
      run: () =>
        searchProvincialApplications(
          { ...applicationRequest, page: 2, pageSize: 30 },
          { knownTotal: 91 },
        ),
    },
    {
      name: 'provincial exemption',
      run: () =>
        searchProvincialExemptions(
          { ...exemptionRequest, page: 2, pageSize: 30 },
          { knownTotal: 91 },
        ),
    },
    {
      name: 'provincial offer',
      run: () =>
        searchProvincialOffers({ ...offerRequest, page: 2, pageSize: 30 }, { knownTotal: 91 }),
    },
    {
      name: 'provincial permit',
      run: () =>
        searchProvincialPermits({ ...permitRequest, page: 2, pageSize: 30 }, { knownTotal: 91 }),
    },
    {
      name: 'federal application',
      run: () =>
        searchFederalApplications({ ...federalRequest, page: 2, pageSize: 30 }, { knownTotal: 91 }),
    },
    {
      name: 'application review',
      run: () =>
        searchApplicationReviews({ ...reviewRequest, page: 2, pageSize: 30 }, { knownTotal: 91 }),
    },
  ])('$name search can reuse a known total without changing paging metadata', async ({ run }) => {
    getCachedResponseMock.mockResolvedValue({
      data: {
        results: [],
        total: 91,
        page: 2,
        size: 30,
      },
    })

    const result = await run()

    const params = readParams()
    expect(params.get('knownTotal')).toBe('91')
    expect(result.page).toEqual({
      number: 2,
      size: 30,
      totalElements: 91,
      totalPages: 4,
    })
  })
  it.each([
    {
      name: 'provincial applications',
      endpoint: '/lexis/applications/search/count',
      run: () => countProvincialApplications({ ...applicationRequest, page: 2, pageSize: 30 }),
    },
    {
      name: 'provincial exemptions',
      endpoint: '/lexis/exemptions/search/count',
      run: () => countProvincialExemptions({ ...exemptionRequest, page: 2, pageSize: 30 }),
    },
    {
      name: 'provincial offers',
      endpoint: '/lexis/purchase-offers/search/count',
      run: () => countProvincialOffers({ ...offerRequest, page: 2, pageSize: 30 }),
    },
    {
      name: 'provincial permits',
      endpoint: '/lexis/permits/search/count',
      run: () => countProvincialPermits({ ...permitRequest, page: 2, pageSize: 30 }),
    },
    {
      name: 'federal applications',
      endpoint: '/lexis/federal/applications/search/count',
      run: () => countFederalApplications({ ...federalRequest, page: 2, pageSize: 30 }),
    },
    {
      name: 'application review',
      endpoint: '/lexis/application-reviews/search/count',
      run: () => countApplicationReviews({ ...reviewRequest, page: 2, pageSize: 30 }),
    },
  ])('$name count endpoint strips paging params', async ({ endpoint, run }) => {
    getCachedResponseMock.mockResolvedValue({ data: { total: 42 } })

    await expect(run()).resolves.toBe(42)

    expect(getCachedResponseMock).toHaveBeenCalledWith(endpoint, expect.any(Object), {
      ttlMs: 10_000,
    })
    const params = readParams()
    expect(params.has('page')).toBe(false)
    expect(params.has('size')).toBe(false)
    expect(params.has('sortField')).toBe(false)
  })

  it('maps application review preview as a slice response', async () => {
    getCachedResponseMock.mockResolvedValue({
      data: {
        results: [
          {
            applicationNumber: 901,
            volume: 12.5,
            speciesEndUse: 'LOG',
            listingDate: '2026-05-20',
            status: 'NEW',
            region: '22',
            showInfoIcon: false,
          },
        ],
        hasNext: true,
        page: 0,
        size: 5,
      },
    })

    const result = await previewApplicationReviews({ ...reviewRequest, pageSize: 5 })

    expect(getCachedResponseMock).toHaveBeenCalledWith(
      '/lexis/application-reviews/search/preview',
      expect.any(Object),
      { ttlMs: 10_000 },
    )
    const params = readParams()
    expect(params.get('size')).toBe('5')
    expect(result.page).toEqual({ number: 0, size: 5, hasNext: true })
    expect(result.content[0]).toEqual(
      expect.objectContaining({
        applicationNumber: '901',
        speciesEndUse: 'LOG',
      }),
    )
  })

  it('sends application review region filters as numeric backend org unit params', async () => {
    getCachedResponseMock.mockResolvedValue({
      data: {
        results: [],
        total: 0,
        page: 0,
        size: 10,
      },
    })

    await searchApplicationReviews({
      ...reviewRequest,
      filters: {
        ...reviewRequest.filters,
        region: ['1818', 'not-a-region', '0', '1834'],
      },
    })

    const params = readParams()
    expect(params.getAll('region')).toEqual(['1818', '1834'])
  })

  it.each([
    {
      name: 'provincial applications',
      run: () => searchProvincialApplications(applicationRequest),
      message: 'Backend provincial application response did not include results.',
    },
    {
      name: 'provincial exemptions',
      run: () => searchProvincialExemptions(exemptionRequest),
      message: 'Backend provincial exemption response did not include results.',
    },
    {
      name: 'provincial offers',
      run: () => searchProvincialOffers(offerRequest),
      message: 'Backend provincial offer response did not include results.',
    },
    {
      name: 'provincial permits',
      run: () => searchProvincialPermits(permitRequest),
      message: 'Backend provincial permit response did not include results.',
    },
    {
      name: 'federal applications',
      run: () => searchFederalApplications(federalRequest),
      message: 'Backend federal application response did not include results.',
    },
    {
      name: 'application review',
      run: () => searchApplicationReviews(reviewRequest),
      message: 'Backend application review response did not include results.',
    },
  ])('rejects %s response when results payload is missing', async ({ run, message }) => {
    getCachedResponseMock.mockResolvedValue({ data: { rows: [] } })

    await expect(run()).rejects.toThrow(message)
  })
})
