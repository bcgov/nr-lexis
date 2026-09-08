import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchSummaryApplications,
  fetchSummaryExemptions,
  fetchSummaryFees,
  fetchSummaryOffers,
  fetchSummaryOffersPlaced,
  fetchSummaryPermits,
} from '@/service/summary-service'

const { getCachedDataMock } = vi.hoisted(() => ({
  getCachedDataMock: vi.fn(),
}))

vi.mock('@/service/api-service', () => ({
  default: {
    getCachedData: getCachedDataMock,
  },
}))

describe('summary-service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getCachedDataMock.mockResolvedValue({ results: [], total: 0, page: 2, size: 25 })
  })

  it.each([
    ['applications', fetchSummaryApplications],
    ['offers', fetchSummaryOffers],
    ['exemptions', fetchSummaryExemptions],
    ['permits', fetchSummaryPermits],
    ['fees', fetchSummaryFees],
    ['offers-placed', fetchSummaryOffersPlaced],
  ] as const)('loads the %s client summary page', async (section, loadPage) => {
    await expect(loadPage(2, 25)).resolves.toEqual({
      results: [],
      total: 0,
      page: 2,
      size: 25,
    })

    expect(getCachedDataMock).toHaveBeenCalledWith(
      `/lexis/summary/${section}`,
      { params: { page: 2, size: 25 } },
      { cacheKey: `summary:${section}:2:25` },
    )
  })

  it.each([
    ['applications', fetchSummaryApplications, 'packageNumber ASC'],
    ['offers', fetchSummaryOffers, 'listingDate DESC'],
    ['exemptions', fetchSummaryExemptions, 'exemptionApprovalDate ASC'],
    ['permits', fetchSummaryPermits, 'exemptionNumber DESC'],
    ['fees', fetchSummaryFees, 'permitNumber ASC'],
    ['offers-placed', fetchSummaryOffersPlaced, 'applicationNumber DESC'],
  ] as const)(
    'includes the %s sort in the request and cache identity',
    async (section, loadPage, sortField) => {
      await loadPage(1, 10, sortField)

      expect(getCachedDataMock).toHaveBeenCalledWith(
        `/lexis/summary/${section}`,
        { params: { page: 1, size: 10, sortField } },
        { cacheKey: `summary:${section}:1:10:${sortField}` },
      )
    },
  )
})
