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

  it('uses configured report api base and preserves actionMapping without runtime configuration', async () => {
    vi.stubEnv('VITE_LEXIS_REPORT_API_BASE', '/lexis/rpc/reports/')
    postMock.mockResolvedValue({
      data: new Blob(['report']),
      headers: {},
    })

    const result = await runReport({
      reportId: 'biweeklyListing',
      actionMapping: 'generate',
      values: {
        outputFormat: 'CSV',
      },
    })

    expect(result.filename).toBe('advertising-list.csv')

    const [path, payload] = postMock.mock.calls[0]
    expect(path).toBe('/lexis/rpc/reports/biweeklyListing')
    expect(payload).toEqual({
      parameters: { legacyActionMapping: 'generate' },
      format: 'CSV',
    })
  })

  it.each([
    'generatePermitReport',
    'generateTenureReport',
    'generateMarkReport',
    'generateFileReport',
  ])(
    'always sends the %s tenure variant under default deployed configuration',
    async (actionMapping) => {
      postMock.mockResolvedValue({
        data: new Blob(['report']),
        headers: {},
      })

      await runReport({
        reportId: 'tenureReport',
        actionMapping,
        values: {},
      })

      expect(postMock).toHaveBeenCalledWith(
        '/lexis/reports/tenureReport',
        expect.objectContaining({
          parameters: { legacyActionMapping: actionMapping },
        }),
        expect.any(Object),
      )
    },
  )

  it('omits explicit blank biweekly listing dates so backend legacy schedule defaults apply', async () => {
    postMock.mockResolvedValue({
      data: new Blob(['report']),
      headers: {},
    })

    await runReport({
      reportId: 'biweeklyListing',
      actionMapping: 'generate',
      values: {
        fromDate: '',
        toDate: '',
      },
    })

    expect(postMock.mock.calls[0][1]).toEqual({
      parameters: {
        legacyActionMapping: 'generate',
      },
      format: 'PDF',
    })
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

  it('extracts detail, message, and title from problem JSON blob responses', async () => {
    const cases = [
      {
        problem: { detail: 'The report date range is invalid.', message: 'Ignored message' },
        expected: 'The report date range is invalid.',
      },
      {
        problem: { detail: '  ', message: 'The report parameters are invalid.' },
        expected: 'The report parameters are invalid.',
      },
      {
        problem: { title: 'Report generation failed' },
        expected: 'Report generation failed',
      },
    ]

    for (const testCase of cases) {
      postMock.mockRejectedValueOnce({
        isAxiosError: true,
        response: {
          data: new Blob([JSON.stringify(testCase.problem)]),
          headers: { 'content-type': 'application/problem+json; charset=UTF-8' },
        },
      })

      await expect(
        runReport({
          reportId: 'approvedExemptionReport',
          values: { exemptionNumber: 'EX-205' },
        }),
      ).rejects.toMatchObject({
        name: 'ReportRequestError',
        message: testCase.expected,
      })
    }
  })

  it('does not expose serialized JSON when a problem response has no user-safe message', async () => {
    postMock.mockRejectedValue({
      isAxiosError: true,
      response: {
        data: new Blob([JSON.stringify({ status: 500, traceId: 'internal-trace' })]),
        headers: { 'content-type': 'application/problem+json' },
      },
    })

    await expect(
      runReport({
        reportId: 'approvedExemptionReport',
        values: { exemptionNumber: 'EX-205' },
      }),
    ).rejects.toMatchObject({
      name: 'ReportRequestError',
      message: 'Unable to generate report. Check values and try again.',
    })
  })

  it('rejects a no-content report instead of opening an empty file', async () => {
    postMock.mockResolvedValue({
      status: 204,
      data: new Blob([]),
      headers: {},
    })

    await expect(
      runReport({
        reportId: 'offerReport',
        actionMapping: 'generate',
        values: {},
      }),
    ).rejects.toMatchObject({
      name: 'ReportRequestError',
      message: 'No report data matched the selected criteria.',
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

  it('keeps tenure XLS requests as legacy spreadsheet output', async () => {
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

    expect(result.filename).toBe('tenure-analysis-report.xls')

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

    expect(result.filename).toBe('tenure-analysis-report.xls')

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

    expect(approvedResult.filename).toBe('approved-exemption.pdf')
    expect(permitResult.filename).toBe('permit.pdf')
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
