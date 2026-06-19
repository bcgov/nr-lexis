import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  countApplicationReviews,
  previewApplicationReviews,
  searchApplicationReviews,
} from '@/service/application-review-search-service'
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
    listingFromDate: '2026-01-01',
    listingToDate: '2026-01-31',
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
  sortField: 'federalApplicationNumber' as const,
  sortDirection: 'asc' as const,
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
            applicationNumber: 201,
            exemptionNumber: 'EX-2',
            exemptionType: 'LOG',
            status: 'New',
            ownerClientNumber: '00077889',
            listingDate: '2026-02-10',
            region: '11',
            approvedVolume: 55,
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
    expect(result.content[0]).toEqual(
      expect.objectContaining({
        exemptionNumber: 'EX-2',
        statusCode: 'NEW',
        canApprove: true,
      }),
    )
  })

  it('maps federal search data and sends client filter to owner and agent params', async () => {
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
            showCheckbox: true,
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
    expect(params.get('agentClientNumber')).toBe('00011122')
    expect(result.content[0]).toEqual(
      expect.objectContaining({
        federalApplicationNumber: 'FED-301',
        allowCreateExemption: true,
      }),
    )
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

  it('provincial permit search can reuse a known total without changing paging metadata', async () => {
    getCachedResponseMock.mockResolvedValue({
      data: {
        results: [],
        total: 91,
        page: 2,
        size: 30,
      },
    })

    const result = await searchProvincialPermits(
      { ...permitRequest, page: 2, pageSize: 30 },
      { knownTotal: 91 },
    )

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
