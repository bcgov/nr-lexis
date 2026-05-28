import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runReport } from '@/service/report-service'

const postMock = vi.fn()

vi.mock('@/service/api-service', () => ({
  default: {
    getAxiosInstance: () => ({
      post: postMock,
    }),
  },
}))

describe('report-service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  it('posts report payload to default endpoint and parses filename from headers', async () => {
    postMock.mockResolvedValue({
      data: new Blob(['report']),
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': 'attachment; filename="permit-report.pdf"',
      },
    })

    const result = await runReport({
      reportId: 'permitReport',
      actionMapping: 'generate',
      values: {
        clientNumber: '123',
        region: '11,12',
      },
    })

    expect(result.filename).toBe('permit-report.pdf')
    expect(result.contentType).toBe('application/pdf')

    const [path, payload] = postMock.mock.calls[0]
    expect(path).toBe('/lexis/reports/permitReport')
    expect(payload).toEqual(
      expect.objectContaining({
        actionMapping: 'generate',
        clientNumber: '00000123',
        region: ['11', '12'],
      }),
    )
  })

  it('uses configured report api base and omits actionMapping when disabled', async () => {
    vi.stubEnv('VITE_LEXIS_REPORT_API_BASE', '/lexis/rpc/reports/')
    vi.stubEnv('VITE_LEXIS_REPORT_INCLUDE_ACTION_MAPPING', 'false')
    postMock.mockResolvedValue({
      data: new Blob(['report']),
      headers: {},
    })

    const result = await runReport({
      reportId: 'mofrListing',
      actionMapping: 'generateIndustryCSV',
      values: {
        outputFormat: 'CSV',
      },
    })

    expect(result.filename).toBe('lexis-mofrListing.csv')

    const [path, payload] = postMock.mock.calls[0]
    expect(path).toBe('/lexis/rpc/reports/mofrListing')
    expect(payload).toEqual({ outputFormat: 'CSV' })
  })

  it('expands tenure and timber mark csv values into modern and legacy fields', async () => {
    postMock.mockResolvedValue({
      data: new Blob(['report']),
      headers: {},
    })

    await runReport({
      reportId: 'tenureReport',
      actionMapping: 'generateTenureReport',
      values: {
        tenureTypes: ' aa1, bb2 ',
        timberMarks: ' tm1, tm2 ',
      },
    })

    const [, payload] = postMock.mock.calls[0]
    expect(payload).toEqual(
      expect.objectContaining({
        actionMapping: 'generateTenureReport',
        tenureTypes: ['AA1', 'BB2'],
        timberMarks: ['TM1', 'TM2'],
        tenureType1: 'AA1',
        tenureType2: 'BB2',
        timberMark1: 'TM1',
        timberMark2: 'TM2',
      }),
    )
  })
})
