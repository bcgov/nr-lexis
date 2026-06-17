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
      reportId: 'offerReport',
      actionMapping: 'generate',
      values: {
        clientNumber: '123',
        region: '11,12',
      },
    })

    expect(result.filename).toBe('permit-report.pdf')
    expect(result.contentType).toBe('application/pdf')

    const [path, payload] = postMock.mock.calls[0]
    expect(path).toBe('/lexis/reports/offerReport')
    expect(payload).toEqual(
      expect.objectContaining({
        format: 'PDF',
        parameters: {
          legacyActionMapping: 'generate',
          clientNumber: '00000123',
          region: '11,12',
        },
      }),
    )
  })

  it('preserves application and exemption report client numbers because legacy did not pad those forms', async () => {
    postMock.mockResolvedValue({
      data: new Blob(['report']),
      headers: {},
    })

    await runReport({
      reportId: 'applicationReport',
      actionMapping: 'generate',
      values: {
        clientNumber: '123',
      },
    })
    await runReport({
      reportId: 'exemptionReport',
      actionMapping: 'generate',
      values: {
        clientNumber: '456',
      },
    })

    expect(postMock.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        parameters: {
          legacyActionMapping: 'generate',
          clientNumber: '123',
        },
      }),
    )
    expect(postMock.mock.calls[1][1]).toEqual(
      expect.objectContaining({
        parameters: {
          legacyActionMapping: 'generate',
          clientNumber: '456',
        },
      }),
    )
  })

  it('pads client numbers for legacy report forms that used validateClientNumber', async () => {
    postMock.mockResolvedValue({
      data: new Blob(['report']),
      headers: {},
    })

    await runReport({
      reportId: 'permitLedgerReport',
      actionMapping: 'generate',
      values: {
        clientNumber: '123',
      },
    })
    await runReport({
      reportId: 'tenureReport',
      actionMapping: 'generatePermitReport',
      values: {
        clientNumber: '456',
      },
    })
    await runReport({
      reportId: 'offerReport',
      actionMapping: 'generate',
      values: {
        clientNumber: '123.4',
      },
    })

    expect(postMock.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        parameters: {
          legacyActionMapping: 'generate',
          clientNumber: '00000123',
        },
      }),
    )
    expect(postMock.mock.calls[1][1]).toEqual(
      expect.objectContaining({
        parameters: {
          legacyActionMapping: 'generatePermitReport',
          clientNumber: '00000456',
        },
      }),
    )
    expect(postMock.mock.calls[2][1]).toEqual(
      expect.objectContaining({
        parameters: {
          legacyActionMapping: 'generate',
          clientNumber: '000123.4',
        },
      }),
    )
  })

  it('uppercases report fields that legacy JavaScript uppercased', async () => {
    postMock.mockResolvedValue({
      data: new Blob(['report']),
      headers: {},
    })

    await runReport({
      reportId: 'speciesGradeReport',
      actionMapping: 'generate',
      values: {
        timberMark: ' tm-a ',
        forestFileId: ' ff-b ',
      },
    })
    await runReport({
      reportId: 'permitLedgerReport',
      actionMapping: 'generate',
      values: {
        timberMark: ' tm-c ',
      },
    })
    await runReport({
      reportId: 'tenureReport',
      actionMapping: 'generateFileReport',
      values: {
        forestFileId: ' ff-d ',
      },
    })

    expect(postMock.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        parameters: {
          legacyActionMapping: 'generate',
          timberMark: 'TM-A',
          forestFileId: 'FF-B',
        },
      }),
    )
    expect(postMock.mock.calls[1][1]).toEqual(
      expect.objectContaining({
        parameters: {
          legacyActionMapping: 'generate',
          timberMark: 'TM-C',
        },
      }),
    )
    expect(postMock.mock.calls[2][1]).toEqual(
      expect.objectContaining({
        parameters: {
          legacyActionMapping: 'generateFileReport',
          forestFileId: 'FF-D',
        },
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
      reportId: 'biweeklyListing',
      actionMapping: 'generateIndustryCSV',
      values: {
        outputFormat: 'CSV',
      },
    })

    expect(result.filename).toBe('lexis-biweeklyListing.csv')

    const [path, payload] = postMock.mock.calls[0]
    expect(path).toBe('/lexis/rpc/reports/biweeklyListing')
    expect(payload).toEqual({ parameters: {}, format: 'CSV' })
  })

  it('surfaces plain text report validation errors from blob responses', async () => {
    postMock.mockRejectedValue({
      isAxiosError: true,
      response: {
        data: new Blob([
          'Choose a Listing from date and Listing to date before generating the Advertising List.',
        ]),
      },
    })

    await expect(
      runReport({
        reportId: 'biweeklyListing',
        actionMapping: 'generate',
        values: {},
      }),
    ).rejects.toMatchObject({
      name: 'ReportRequestError',
      message:
        'Choose a Listing from date and Listing to date before generating the Advertising List.',
    })
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
        format: 'PDF',
        parameters: {
          legacyActionMapping: 'generateTenureReport',
          tenureType1: 'AA1',
          tenureType2: 'BB2',
          timberMark1: 'TM1',
          timberMark2: 'TM2',
        },
      }),
    )
  })

  it('keeps tenure XLS requests as spreadsheet output', async () => {
    postMock.mockResolvedValue({
      data: new Blob(['report']),
      headers: {},
    })

    const result = await runReport({
      reportId: 'tenureReport',
      actionMapping: 'generatePermitReport',
      values: {
        outputFormat: 'XLS',
      },
    })

    expect(result.filename).toBe('lexis-tenureReport.xlsx')

    const [, payload] = postMock.mock.calls[0]
    expect(payload).toEqual(
      expect.objectContaining({
        format: 'XLS',
        parameters: {
          legacyActionMapping: 'generatePermitReport',
        },
      }),
    )
  })

  it('maps the legacy tenure CSV option value to spreadsheet output', async () => {
    postMock.mockResolvedValue({
      data: new Blob(['report']),
      headers: {},
    })

    const result = await runReport({
      reportId: 'tenureReport',
      actionMapping: 'generatePermitReport',
      values: {
        outputFormat: 'CSV',
      },
    })

    expect(result.filename).toBe('lexis-tenureReport.xlsx')

    const [, payload] = postMock.mock.calls[0]
    expect(payload).toEqual(
      expect.objectContaining({
        format: 'XLS',
        parameters: {
          legacyActionMapping: 'generatePermitReport',
        },
      }),
    )
  })

  it('keeps prompt-only Jasper reports as PDF even when CSV is requested', async () => {
    postMock.mockResolvedValue({
      data: new Blob(['report']),
      headers: {},
    })

    const approvedResult = await runReport({
      reportId: 'approvedExemptionReport',
      actionMapping: 'generate',
      values: {
        exemptionNumber: 'E-12345',
        outputFormat: 'CSV',
      },
    })
    const permitResult = await runReport({
      reportId: 'permitReport',
      actionMapping: 'generateCsv',
      values: {
        permitNumber: '900100',
      },
    })

    expect(approvedResult.filename).toBe('lexis-approvedExemptionReport.pdf')
    expect(permitResult.filename).toBe('lexis-permitReport.pdf')
    expect(postMock.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        format: 'PDF',
        parameters: {
          legacyActionMapping: 'generate',
          exemptionNumber: 'E-12345',
        },
      }),
    )
    expect(postMock.mock.calls[1][1]).toEqual(
      expect.objectContaining({
        format: 'PDF',
        parameters: {
          legacyActionMapping: 'generateCsv',
          permitNumber: '900100',
        },
      }),
    )
  })

  it('compacts and normalizes legacy tenure type and timber mark fields', async () => {
    postMock.mockResolvedValue({
      data: new Blob(['report']),
      headers: {},
    })

    await runReport({
      reportId: 'tenureReport',
      actionMapping: 'generateMarkReport',
      values: {
        tenureType2: ' aa1 ',
        tenureType4: ' bb2 ',
        timberMark3: ' tm1 ',
      },
    })

    const [, payload] = postMock.mock.calls[0]
    expect(payload).toEqual(
      expect.objectContaining({
        format: 'PDF',
        parameters: {
          legacyActionMapping: 'generateMarkReport',
          tenureType1: 'AA1',
          tenureType2: 'BB2',
          timberMark1: 'TM1',
        },
      }),
    )
    expect(payload.parameters).not.toHaveProperty('tenureType4')
    expect(payload.parameters).not.toHaveProperty('timberMark3')
  })
})
