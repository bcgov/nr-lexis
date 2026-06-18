import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchApplicationReviewOptions,
  fetchFederalApplicationOptions,
  fetchProvincialApplicationOptions,
  fetchReportOptions,
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

  it('parses provincial application options and ignores invalid entries', async () => {
    getCachedDataMock.mockResolvedValue({
      exemptionTypes: [
        { code: 'A', name: 'Type A' },
        { code: '   ', name: 'Bad Code' },
        { code: 'B', name: 'Type B' },
      ],
      exemptionReasons: [
        { code: 'U', name: 'Unadvertised' },
        { code: ' ', name: 'Bad Reason' },
      ],
      applicationStatuses: [{ code: 'NEW', name: 'New' }],
      productTypes: [{ code: 'LOG', name: 'Logs' }],
      growthTypes: [{ code: 'O', name: 'Old Growth' }],
      regions: [{ code: '11', name: 'Cariboo' }, { code: '12' }],
      currentSchedules: [
        { code: '987', name: '2026-01-11' },
        { code: '', name: 'Bad Schedule' },
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
      regions: [{ value: '11', label: 'Cariboo' }],
      currentSchedules: [{ value: '987', label: '2026-01-11' }],
    })
  })

  it('returns empty option lists for non-object payloads', async () => {
    getCachedDataMock.mockResolvedValue('unexpected')

    const result = await fetchFederalApplicationOptions()

    expect(getCachedDataMock).toHaveBeenCalledWith(
      '/lexis/federal/applications/search/options',
      undefined,
      {
        cacheKey: 'search-options:/lexis/federal/applications/search/options',
        ttlMs: 300000,
      },
    )
    expect(result).toEqual({ applicationStatuses: [] })
  })

  it('parses report options for current schedules', async () => {
    getCachedDataMock.mockResolvedValue({
      currentSchedules: [
        { code: '1001', name: '2026-06-15' },
        { code: '1002', name: '2026-06-29' },
      ],
      defaultRegion: '12',
      regions: [
        { code: '12', name: 'Coast' },
        { code: '24', name: 'Skeena' },
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
      defaultRegion: '12',
      regions: [
        { value: '12', label: 'Coast' },
        { value: '24', label: 'Skeena' },
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

  it('returns empty option lists when options endpoint throws', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    getCachedDataMock.mockRejectedValue(new Error('network'))

    const result = await fetchApplicationReviewOptions()

    expect(getCachedDataMock).toHaveBeenCalledWith(
      '/lexis/application-reviews/search/options',
      undefined,
      {
        cacheKey: 'search-options:/lexis/application-reviews/search/options',
        ttlMs: 300000,
      },
    )
    expect(result).toEqual({
      productTypes: [],
      regions: [],
      reviewStatuses: [],
    })
    expect(warnSpy).toHaveBeenCalledTimes(1)

    warnSpy.mockRestore()
  })
})
