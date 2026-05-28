import { beforeEach, describe, expect, it, vi } from 'vitest'
import { searchApplicationReviews } from '@/service/application-review-search-service'
import { searchFederalApplications } from '@/service/federal-application-search-service'
import { searchIndianReservePermits } from '@/service/indian-reserve-permit-search-service'
import { searchProvincialApplications } from '@/service/provincial-application-search-service'
import { searchProvincialExemptions } from '@/service/provincial-exemption-search-service'
import { searchProvincialOffers } from '@/service/provincial-offer-search-service'
import { searchProvincialPermits } from '@/service/provincial-permit-search-service'

const getMock = vi.fn()

vi.mock('@/service/api-service', () => ({
  default: {
    getAxiosInstance: () => ({
      get: getMock,
    }),
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

const indigenousRequest = {
  filters: {
    permitNumber: '',
    packageNumber: '',
    fromPermitIssueDate: '',
    toPermitIssueDate: '',
    fromEstimatedShippingDate: '',
    toEstimatedShippingDate: '',
  },
  page: 0,
  pageSize: 10,
  sortField: 'permitNumber' as const,
  sortDirection: 'asc' as const,
}

const readParams = (callIndex = 0): URLSearchParams => {
  const [, config] = getMock.mock.calls[callIndex]
  expect(config).toBeDefined()
  expect(config.params).toBeInstanceOf(URLSearchParams)
  return config.params as URLSearchParams
}

describe('search-service contracts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('maps provincial application results and backend query params', async () => {
    getMock.mockResolvedValue({
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

    expect(getMock).toHaveBeenCalledWith('/lexis/applications/search', expect.any(Object))
    const params = readParams()
    expect(params.get('applicationNumber')).toBe('101')
    expect(params.get('agentClientNumber')).toBe('00012345')
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

  it('maps provincial exemption status fields and approval gate', async () => {
    getMock.mockResolvedValue({
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

    expect(getMock).toHaveBeenCalledWith('/lexis/exemptions/search', expect.any(Object))
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
    getMock.mockResolvedValue({
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

    expect(getMock).toHaveBeenCalledWith('/lexis/federal/applications/search', expect.any(Object))
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
    {
      name: 'indigenous reserve permits',
      run: () => searchIndianReservePermits(indigenousRequest),
      message: 'Backend indigenous reserve permit response did not include results.',
    },
  ])('rejects %s response when results payload is missing', async ({ run, message }) => {
    getMock.mockResolvedValue({ data: { rows: [] } })

    await expect(run()).rejects.toThrow(message)
  })
})
