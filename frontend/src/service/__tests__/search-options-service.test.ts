import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchApplicationReviewOptions,
  fetchFederalApplicationOptions,
  fetchProvincialExemptionOptions,
  fetchProvincialApplicationOptions,
  fetchProvincialOfferOptions,
  fetchProvincialPermitOptions,
  fetchReportOptions,
  SearchOptionsUnavailableError,
} from '@/service/search-options-service'

const { getCachedDataMock } = vi.hoisted(() => ({
  getCachedDataMock: vi.fn(),
}))

vi.mock('@/service/api-service', () => ({
  default: {
    getCachedData: getCachedDataMock,
  },
}))

describe('search-options-service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('parses provincial application options', async () => {
    getCachedDataMock.mockResolvedValue({
      exemptionTypes: [
        { code: 'A', name: 'Type A' },
        { code: 'B', name: 'Type B' },
      ],
      exemptionReasons: [{ code: 'U', name: 'Unadvertised' }],
      applicationStatuses: [
        { code: '', name: 'All' },
        { code: 'NEW', name: 'New' },
      ],
      productTypes: [
        { code: '', name: 'All' },
        { code: 'LOG', name: 'Logs' },
      ],
      growthTypes: [{ code: 'O', name: 'Old Growth' }],
      regions: [
        { code: '11', name: 'District' },
        { code: '1903', name: 'Cariboo Natural Resource Region' },
        { code: '1911', name: 'Not Natural Resource Region' },
      ],
      currentSchedules: [
        { code: '987', name: '2026-01-11' },
        { code: '', name: 'Blank' },
      ],
      nextSchedules: [
        { code: '988', name: '2026-01-18' },
        { code: '', name: 'Blank' },
      ],
    })

    const result = await fetchProvincialApplicationOptions()

    expect(getCachedDataMock).toHaveBeenCalledWith(
      '/lexis/applications/search/options',
      undefined,
      {
        cacheKey: 'search-options:/lexis/applications/search/options',
        ttlMs: 300000,
      },
    )
    expect(result).toEqual({
      exemptionTypes: [
        { value: 'A', label: 'Type A' },
        { value: 'B', label: 'Type B' },
      ],
      exemptionReasons: [{ value: 'U', label: 'Unadvertised' }],
      applicationStatuses: [{ value: 'NEW', label: 'New' }],
      productTypes: [{ value: 'LOG', label: 'Logs' }],
      growthTypes: [{ value: 'O', label: 'Old Growth' }],
      regions: [{ value: '1903', label: 'Cariboo Natural Resource Region' }],
      currentSchedules: [
        { value: '987', label: '2026-01-11' },
        { value: '', label: 'Blank' },
      ],
      nextSchedules: [
        { value: '988', label: '2026-01-18' },
        { value: '', label: 'Blank' },
      ],
    })
  })

  it('accepts and removes the legacy All product type from review options', async () => {
    getCachedDataMock.mockResolvedValue({
      productTypes: [
        { code: '', name: 'All' },
        { code: 'LOG', name: 'Logs' },
      ],
      regions: [{ code: '1903', name: 'Cariboo Natural Resource Region' }],
      reviewStatuses: [{ code: 'REJ', name: 'Rejected' }],
    })

    await expect(fetchApplicationReviewOptions()).resolves.toEqual({
      productTypes: [{ value: 'LOG', label: 'Logs' }],
      regions: [{ value: '1903', label: 'Cariboo Natural Resource Region' }],
      reviewStatuses: [{ value: 'REJ', label: 'Rejected' }],
    })
  })

  it('rejects non-object payloads with the public-safe unavailable error', async () => {
    getCachedDataMock.mockResolvedValue('unexpected')

    await expect(fetchFederalApplicationOptions()).rejects.toBeInstanceOf(
      SearchOptionsUnavailableError,
    )
  })

  it('filters disallowed application status options like legacy', async () => {
    getCachedDataMock.mockResolvedValue({
      applicationStatuses: [
        { code: 'NEW', name: 'New' },
        { code: 'DAL', name: 'Disallowed' },
        { code: 'APP', name: 'Approved' },
      ],
    })

    const result = await fetchFederalApplicationOptions()

    expect(result.applicationStatuses).toEqual([
      { value: 'NEW', label: 'New' },
      { value: 'APP', label: 'Approved' },
    ])
  })

  it('parses report options for current schedules', async () => {
    getCachedDataMock.mockResolvedValue({
      currentSchedules: [
        { code: '1001', name: '2026-06-15' },
        { code: '1002', name: '2026-06-29' },
      ],
      defaultRegion: '12',
      regions: [
        { code: '12', name: 'District' },
        { code: '1903', name: 'Cariboo Natural Resource Region' },
        { code: '1908', name: 'Skeena Natural Resource Region' },
      ],
      reportJurisdictions: [
        { code: '', name: 'All' },
        { code: 'P', name: 'Provincial' },
        { code: 'F', name: 'Federal' },
      ],
      biweeklyJurisdictions: [
        { code: '', name: 'All' },
        { code: 'P', name: 'Provincial' },
        { code: 'F', name: 'Federal' },
      ],
      teacJurisdictions: [
        { code: 'P', name: 'Provincial' },
        { code: 'F', name: 'Federal' },
      ],
      exemptionTypes: [
        { code: '', name: 'All' },
        { code: 'OIC', name: 'OIC' },
      ],
      tenureExemptionTypes: [
        { code: 'M', name: 'Ministerial' },
        { code: '', name: 'All' },
      ],
      exemptionReasons: [
        { code: '', name: 'All' },
        { code: 'SEC128', name: 'Section 128' },
      ],
      exemptionStatuses: [
        { code: '', name: 'All' },
        { code: 'A', name: 'Approved' },
      ],
      growthTypes: [
        { code: '', name: 'All' },
        { code: 'O', name: 'Old Growth' },
      ],
      permitStatuses: [
        { code: '', name: 'All' },
        { code: 'ISS', name: 'Issued' },
      ],
      destinationCountries: [
        { code: '', name: 'All' },
        { code: 'US', name: 'United States' },
      ],
      allDestinationCountries: [
        { code: 'US', name: 'United States' },
        { code: 'NZ', name: 'New Zealand' },
      ],
      portsOfExport: [
        { code: '', name: 'All' },
        { code: 'PAC', name: 'Pacific' },
      ],
    })

    const result = await fetchReportOptions()

    expect(getCachedDataMock).toHaveBeenCalledWith('/lexis/reports/options', undefined, {
      cacheKey: 'search-options:/lexis/reports/options',
      ttlMs: 300000,
    })
    expect(result).toEqual({
      currentSchedules: [
        { value: '1001', label: '2026-06-15' },
        { value: '1002', label: '2026-06-29' },
      ],
      defaultRegion: '',
      regions: [
        { value: '1903', label: 'Cariboo Natural Resource Region' },
        { value: '1908', label: 'Skeena Natural Resource Region' },
      ],
      reportJurisdictions: [
        { value: '', label: 'All' },
        { value: 'P', label: 'Provincial' },
        { value: 'F', label: 'Federal' },
      ],
      biweeklyJurisdictions: [
        { value: '', label: 'All' },
        { value: 'P', label: 'Provincial' },
        { value: 'F', label: 'Federal' },
      ],
      teacJurisdictions: [
        { value: 'P', label: 'Provincial' },
        { value: 'F', label: 'Federal' },
      ],
      exemptionTypes: [
        { value: '', label: 'All' },
        { value: 'OIC', label: 'OIC' },
      ],
      tenureExemptionTypes: [
        { value: 'M', label: 'Ministerial' },
        { value: '', label: 'All' },
      ],
      exemptionReasons: [
        { value: '', label: 'All' },
        { value: 'SEC128', label: 'Section 128' },
      ],
      exemptionStatuses: [
        { value: '', label: 'All' },
        { value: 'A', label: 'Approved' },
      ],
      growthTypes: [
        { value: '', label: 'All' },
        { value: 'O', label: 'Old Growth' },
      ],
      permitStatuses: [
        { value: '', label: 'All' },
        { value: 'ISS', label: 'Issued' },
      ],
      destinationCountries: [
        { value: '', label: 'All' },
        { value: 'US', label: 'United States' },
      ],
      allDestinationCountries: [
        { value: 'US', label: 'United States' },
        { value: 'NZ', label: 'New Zealand' },
      ],
      portsOfExport: [
        { value: '', label: 'All' },
        { value: 'PAC', label: 'Pacific' },
      ],
    })
  })

  it('propagates report option request failures instead of returning empty choices', async () => {
    const failure = new Error('503 Service Unavailable')
    getCachedDataMock.mockRejectedValue(failure)

    await expect(fetchReportOptions()).rejects.toBe(failure)
  })

  it('rejects malformed report option payloads instead of treating them as empty data', async () => {
    getCachedDataMock.mockResolvedValue('unexpected')

    await expect(fetchReportOptions()).rejects.toThrow(
      'Search options response from /lexis/reports/options is unavailable.',
    )
  })

  it('rejects partial report option objects instead of treating missing arrays as empty data', async () => {
    getCachedDataMock.mockResolvedValue({ regions: [] })

    await expect(fetchReportOptions()).rejects.toThrow(
      'Search options response from /lexis/reports/options is unavailable.',
    )
  })

  it('maps non-report request failures to one public-safe unavailable error', async () => {
    getCachedDataMock.mockRejectedValue(new Error('network'))

    const request = fetchApplicationReviewOptions()

    expect(getCachedDataMock).toHaveBeenCalledWith(
      '/lexis/application-reviews/search/options',
      undefined,
      {
        cacheKey: 'search-options:/lexis/application-reviews/search/options',
        ttlMs: 300000,
      },
    )
    await expect(request).rejects.toEqual(
      expect.objectContaining({
        name: 'SearchOptionsUnavailableError',
        message:
          'Authoritative options are temporarily unavailable. Fields that require those options are disabled.',
      }),
    )
  })

  it('rejects missing arrays and malformed option rows instead of parsing them as empty', async () => {
    getCachedDataMock
      .mockResolvedValueOnce({ applicationStatuses: [] })
      .mockResolvedValueOnce({
        permitStatuses: [{ code: 'ACT' }],
        regions: [],
      })
      .mockResolvedValueOnce({
        permitStatuses: [{ code: '   ', name: 'Invalid' }],
        regions: [],
      })

    await expect(fetchProvincialApplicationOptions()).rejects.toBeInstanceOf(
      SearchOptionsUnavailableError,
    )
    await expect(fetchProvincialPermitOptions()).rejects.toBeInstanceOf(
      SearchOptionsUnavailableError,
    )
    await expect(fetchProvincialPermitOptions()).rejects.toBeInstanceOf(
      SearchOptionsUnavailableError,
    )
  })

  it('preserves legitimate empty option arrays and endpoint empty-code allowances', async () => {
    getCachedDataMock
      .mockResolvedValueOnce({
        exemptionTypes: [],
        exemptionStatuses: [],
        regions: [],
      })
      .mockResolvedValueOnce({
        exemptionTypes: [],
        exemptionReasons: [],
        applicationStatuses: [],
        productTypes: [],
        growthTypes: [],
        regions: [],
        currentSchedules: [{ code: '', name: 'No current schedule' }],
      })

    await expect(fetchProvincialExemptionOptions()).resolves.toEqual({
      exemptionTypes: [],
      exemptionStatuses: [],
      regions: [],
    })
    await expect(fetchProvincialApplicationOptions()).resolves.toMatchObject({
      currentSchedules: [{ value: '', label: 'No current schedule' }],
    })
  })

  it('filters all region option payloads to natural resource regions', async () => {
    const regionPayload = [
      { code: '12', name: 'District' },
      { code: '1904', name: 'Kootenay-Boundary Natural Resource Region' },
      { code: '1909', name: 'South Coast Natural Resource Region' },
      { code: '1911', name: 'Other Org Unit' },
    ]

    getCachedDataMock
      .mockResolvedValueOnce({
        exemptionTypes: [],
        exemptionStatuses: [],
        regions: regionPayload,
      })
      .mockResolvedValueOnce({
        permitStatuses: [],
        regions: regionPayload,
      })
      .mockResolvedValueOnce({
        regions: regionPayload,
      })
      .mockResolvedValueOnce({
        productTypes: [],
        regions: regionPayload,
        reviewStatuses: [],
      })

    await expect(fetchProvincialExemptionOptions()).resolves.toMatchObject({
      regions: [
        { value: '1904', label: 'Kootenay-Boundary Natural Resource Region' },
        { value: '1909', label: 'South Coast Natural Resource Region' },
      ],
    })
    await expect(fetchProvincialPermitOptions()).resolves.toMatchObject({
      regions: [
        { value: '1904', label: 'Kootenay-Boundary Natural Resource Region' },
        { value: '1909', label: 'South Coast Natural Resource Region' },
      ],
    })
    await expect(fetchProvincialOfferOptions()).resolves.toMatchObject({
      regions: [
        { value: '1904', label: 'Kootenay-Boundary Natural Resource Region' },
        { value: '1909', label: 'South Coast Natural Resource Region' },
      ],
    })
    await expect(fetchApplicationReviewOptions()).resolves.toMatchObject({
      regions: [
        { value: '1904', label: 'Kootenay-Boundary Natural Resource Region' },
        { value: '1909', label: 'South Coast Natural Resource Region' },
      ],
    })
  })

  it('keeps all eight natural resource region codes and filters districts', async () => {
    getCachedDataMock.mockResolvedValue({
      exemptionTypes: [],
      exemptionReasons: [],
      applicationStatuses: [],
      productTypes: [],
      growthTypes: [],
      regions: [
        { code: '1903', name: 'Cariboo Natural Resource Region' },
        { code: '1904', name: 'Kootenay-Boundary Natural Resource Region' },
        { code: '1905', name: 'Northeast Natural Resource Region' },
        { code: '1906', name: 'Omineca Natural Resource Region' },
        { code: '1907', name: 'Thompson-Okanagan Natural Resource Region' },
        { code: '1908', name: 'Skeena Natural Resource Region' },
        { code: '1909', name: 'South Coast Natural Resource Region' },
        { code: '1910', name: 'West Coast Natural Resource Region' },
        { code: '1835', name: 'Coast Area District' },
        { code: '1911', name: 'Not a Natural Resource Region' },
      ],
      currentSchedules: [],
    })

    const result = await fetchProvincialApplicationOptions()

    expect(result.regions).toEqual([
      { value: '1903', label: 'Cariboo Natural Resource Region' },
      { value: '1904', label: 'Kootenay-Boundary Natural Resource Region' },
      { value: '1905', label: 'Northeast Natural Resource Region' },
      { value: '1906', label: 'Omineca Natural Resource Region' },
      { value: '1907', label: 'Thompson-Okanagan Natural Resource Region' },
      { value: '1908', label: 'Skeena Natural Resource Region' },
      { value: '1909', label: 'South Coast Natural Resource Region' },
      { value: '1910', label: 'West Coast Natural Resource Region' },
    ])
  })
})
