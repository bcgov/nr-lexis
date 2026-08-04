import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addApplicationsToPermit,
  addBlanketOicPackage,
  addBlanketOicScale,
  deleteBlanketOicPackage,
  deleteBlanketOicScale,
  fetchBlanketOicPackageEditContext,
  fetchAvailablePermitApplications,
  fetchProvincialPermitGbmsEvents,
  fetchProvincialPermitDetailCoreTabs,
  fetchProvincialPermitDetailTabs,
  fetchProvincialPermitFees,
  removeApplicationFromPermit,
  updateBlanketOicPackage,
  updatePermitScaleAttachment,
} from '@/service/provincial-permit-detail-tabs-service'
import {
  addPermitInvoice,
  createPermitFromExemption,
  fetchPermitApprovalEmailDefault,
  fetchPermitFeeOverrideContext,
  fetchPermitInvoiceConversionRate,
  fetchPermitInvoices,
  releasePermitEditLock,
  sendPermitApprovalEmail,
  sendPermitReviewRequestEmail,
  updatePermitDetail,
} from '@/service/provincial-permit-documents-invoices-service'

const { getCachedResponseMock, getMock, postMock, registerRecordVersionMock } = vi.hoisted(() => ({
  getCachedResponseMock: vi.fn(),
  getMock: vi.fn(),
  postMock: vi.fn(),
  registerRecordVersionMock: vi.fn(),
}))

vi.mock('@/service/api-service', () => ({
  default: {
    getCachedResponse: getCachedResponseMock,
    registerRecordVersion: registerRecordVersionMock,
    getAxiosInstance: () => ({
      get: getMock,
      post: postMock,
      delete: vi.fn(),
    }),
  },
}))

const response = (data: unknown, status = 200) => ({
  data,
  status,
})

describe('provincial permit detail services', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads permit detail tab rows from permit RPC endpoints', async () => {
    getCachedResponseMock.mockImplementation((path: string) => {
      switch (path) {
        case '/lexis/rpc/permit-details/core-tabs':
          return Promise.resolve(
            response({
              applicationList: ['1000456'],
              packageList: [
                {
                  packageNumber: 'PKG-100',
                  packageInfo: {
                    region: 'Coast',
                    enduse: 'FI/PL',
                    ageclass: 'Second growth',
                    volume: '34.5',
                    length: '7.1',
                    diameter: '16.2',
                    productType: 'Unmanufactured',
                  },
                  packageDetails: null,
                  scaleList: [
                    {
                      id: 'SCALE-1',
                      timbermark: 'TM-1',
                      cascadeSplitCode: 'W',
                      species: 'Fir',
                      grade: 'A',
                      pieces: 12,
                      volume: '34.5',
                      permit: 'P-777',
                    },
                    {
                      id: 'SCALE-2',
                      timbermark: 'TM-2',
                      cascadeSplitCode: 'E',
                      species: 'Cedar',
                      grade: 'B',
                      pieces: 4,
                      volume: '8.5',
                      permit: '',
                    },
                    {
                      id: 'SCALE-OTHER',
                      timbermark: 'TM-OTHER',
                      species: 'Spruce',
                      grade: 'C',
                      pieces: 2,
                      volume: '2.5',
                      permit: 'P-999',
                    },
                  ],
                },
              ],
            }),
          )
        case '/lexis/rpc/permit-details/all-scale-fees':
          return Promise.resolve(
            response({
              packageList: [
                {
                  packageNumber: 'PKG-100',
                  scaleList: [
                    {
                      id: 'SCALE-1',
                      timbermark: 'TM-1',
                      species: 'Fir',
                      grade: 'A',
                      amv: '$125.00',
                      volume: '34.5',
                      ministryUser: true,
                      ewb: '$100.00',
                      fil: '12%',
                      mf: '1.5',
                      fee: '$123.45',
                    },
                  ],
                },
              ],
            }),
          )
        case '/lexis/rpc/permit-details/gbms-invoice-history':
          return Promise.resolve(
            response([
              {
                gbmsInvoiceNumber: 'A006654',
                cancelledByInvoice: 'A007321',
                replacedByInvoice: 'A007322',
                invoiceAmount: '1939.50',
                printedDate: '2020-05-06',
                entryDate: '2020-05-06',
                updateDate: '2022-02-15',
              },
            ]),
          )
        default:
          return Promise.reject(new Error(`Unexpected request ${path}`))
      }
    })

    const result = await fetchProvincialPermitDetailTabs({
      permitNumber: 'P-777',
      receiptNumber: 'RCPT-1',
    })

    expect(getCachedResponseMock).toHaveBeenCalledTimes(3)
    expect(getCachedResponseMock).toHaveBeenCalledWith(
      '/lexis/rpc/permit-details/core-tabs',
      { params: { permitNumber: 'P-777', blanketOic: false } },
      { ttlMs: 30_000 },
    )
    expect(getCachedResponseMock).toHaveBeenCalledWith(
      '/lexis/rpc/permit-details/all-scale-fees',
      {
        params: {
          permitNumber: 'P-777',
        },
      },
      { ttlMs: 30_000 },
    )
    expect(getCachedResponseMock).toHaveBeenCalledWith(
      '/lexis/rpc/permit-details/gbms-invoice-history',
      {
        params: {
          receiptNumber: 'RCPT-1',
          permitNumber: 'P-777',
        },
      },
      { ttlMs: 30_000 },
    )
    expect(result).toEqual({
      applications: ['1000456'],
      packages: [
        {
          packageNumber: 'PKG-100',
          region: 'Coast',
          speciesEndUseSort: 'FI/PL',
          ageClass: 'Second growth',
          packageVolume: '34.5',
          averageLength: '7.1',
          averageTopDiameter: '16.2',
          productType: 'Unmanufactured',
          currentPackageVolume: '',
          status: '',
          reprocessed: '',
          comments: '',
        },
      ],
      items: [
        {
          id: 'SCALE-1',
          timberMark: 'TM-1',
          scaleType: 'C',
          species: 'Fir',
          grade: 'A',
          pieces: 12,
          volume: 34.5,
          packageNumber: 'PKG-100',
          permitNumber: 'P-777',
          includedInPermit: true,
        },
        {
          id: 'SCALE-2',
          timberMark: 'TM-2',
          scaleType: 'I',
          species: 'Cedar',
          grade: 'B',
          pieces: 4,
          volume: 8.5,
          packageNumber: 'PKG-100',
          permitNumber: '',
          includedInPermit: false,
        },
      ],
      fees: [
        {
          id: 'SCALE-1',
          packageNumber: 'PKG-100',
          timberMark: 'TM-1',
          species: 'Fir',
          grade: 'A',
          amv: '$125.00',
          volume: 34.5,
          ministryUser: true,
          ewb: '$100.00',
          filPercent: '12%',
          mfPercent: '1.5%',
          amount: 123.45,
          amountDisplay: '$123.45',
        },
      ],
      gbmsEvents: [
        {
          id: 'A006654',
          gbmsInvoiceNumber: 'A006654',
          cancelledByInvoice: 'A007321',
          replacedByInvoice: 'A007322',
          invoiceAmount: '1939.50',
          printedDate: '2020-05-06',
          entryDate: '2020-05-06',
          updateDate: '2022-02-15',
        },
      ],
      oicItems: [],
      boicItems: [],
    })
  })

  it('loads optional GBMS history while package data is still loading', async () => {
    let resolveCoreTabs: (() => void) | undefined
    getCachedResponseMock.mockImplementation((path: string) => {
      if (path === '/lexis/rpc/permit-details/core-tabs') {
        return new Promise((resolve) => {
          resolveCoreTabs = () =>
            resolve(
              response({
                applicationList: ['1000456'],
                packageList: [
                  {
                    packageNumber: 'PKG-100',
                    packageInfo: { region: 'Coast', volume: '12.5' },
                    packageDetails: null,
                    scaleList: [],
                  },
                ],
              }),
            )
        })
      }
      switch (path) {
        case '/lexis/rpc/permit-details/all-scale-fees':
          return Promise.resolve(response({ packageList: [] }))
        case '/lexis/rpc/permit-details/gbms-invoice-history':
          return Promise.resolve(response([]))
        default:
          return Promise.reject(new Error(`Unexpected request ${path}`))
      }
    })

    const result = fetchProvincialPermitDetailTabs({
      permitNumber: 'P-777',
      receiptNumber: 'RCPT-1',
    })

    await vi.waitFor(() => expect(resolveCoreTabs).toBeTypeOf('function'))
    expect(getCachedResponseMock).toHaveBeenCalledWith(
      '/lexis/rpc/permit-details/gbms-invoice-history',
      {
        params: {
          receiptNumber: 'RCPT-1',
          permitNumber: 'P-777',
        },
      },
      { ttlMs: 30_000 },
    )

    resolveCoreTabs?.()
    await expect(result).resolves.toEqual(
      expect.objectContaining({ applications: ['1000456'], gbmsEvents: [] }),
    )
  })

  it('loads core permit tabs without requesting fee or GBMS rows, then defers each request', async () => {
    getCachedResponseMock.mockImplementation((path: string) => {
      switch (path) {
        case '/lexis/rpc/permit-details/core-tabs':
          return Promise.resolve(
            response({
              applicationList: ['1000456'],
              packageList: [
                {
                  packageNumber: 'PKG-100',
                  packageInfo: { region: 'Coast' },
                  packageDetails: null,
                  scaleList: [],
                },
              ],
            }),
          )
        case '/lexis/rpc/permit-details/gbms-invoice-history':
          return Promise.resolve(response([]))
        case '/lexis/rpc/permit-details/all-scale-fees':
          return Promise.resolve(
            response({
              packageList: [
                {
                  packageNumber: 'PKG-100',
                  scaleList: [
                    {
                      id: 'SCALE-1',
                      timbermark: 'TM-1',
                      species: 'Fir',
                      grade: 'A',
                      amv: '$125.00',
                      volume: '34.5',
                      fee: '$123.45',
                    },
                  ],
                },
              ],
            }),
          )
        case '/lexis/rpc/permit-details/gbms-invoice-history':
          return Promise.resolve(response([]))
        default:
          return Promise.reject(new Error(`Unexpected request ${path}`))
      }
    })

    const core = await fetchProvincialPermitDetailCoreTabs({
      permitNumber: 'P-777',
      receiptNumber: 'RCPT-1',
    })

    expect(core.fees).toEqual([])
    expect(getCachedResponseMock).toHaveBeenCalledWith(
      '/lexis/rpc/permit-details/core-tabs',
      { params: { permitNumber: 'P-777', blanketOic: false } },
      { ttlMs: 30_000 },
    )
    expect(getCachedResponseMock).not.toHaveBeenCalledWith(
      '/lexis/rpc/permit-details/all-scale-fees',
      expect.anything(),
      expect.anything(),
    )
    expect(getCachedResponseMock).not.toHaveBeenCalledWith(
      '/lexis/rpc/permit-details/gbms-invoice-history',
      expect.anything(),
      expect.anything(),
    )

    const gbmsEvents = await fetchProvincialPermitGbmsEvents({
      permitNumber: 'P-777',
      receiptNumber: 'RCPT-1',
    })
    expect(gbmsEvents).toEqual([])
    expect(getCachedResponseMock).toHaveBeenCalledWith(
      '/lexis/rpc/permit-details/gbms-invoice-history',
      {
        params: {
          receiptNumber: 'RCPT-1',
          permitNumber: 'P-777',
        },
      },
      { ttlMs: 30_000 },
    )

    const fees = await fetchProvincialPermitFees({
      permitNumber: 'P-777',
      packageNumbers: core.packages.map((row) => row.packageNumber),
    })

    expect(fees).toEqual([
      expect.objectContaining({
        id: 'SCALE-1',
        packageNumber: 'PKG-100',
        amount: 123.45,
      }),
    ])
    expect(getCachedResponseMock).toHaveBeenLastCalledWith(
      '/lexis/rpc/permit-details/all-scale-fees',
      {
        params: {
          permitNumber: 'P-777',
        },
      },
      { ttlMs: 30_000 },
    )
  })

  it('skips the bulk fee request for an explicitly empty package selection', async () => {
    await expect(
      fetchProvincialPermitFees({
        permitNumber: 'P-777',
        packageNumbers: [],
      }),
    ).resolves.toEqual([])

    expect(getCachedResponseMock).not.toHaveBeenCalled()
  })

  it('loads Blanket OIC package rows from the aggregate permit endpoint', async () => {
    getCachedResponseMock.mockImplementation((path: string) => {
      switch (path) {
        case '/lexis/rpc/permit-details/core-tabs':
          return Promise.resolve(
            response({
              applicationList: [],
              packageList: [
                {
                  packageNumber: 'BOIC-100',
                  packageInfo: {
                    region: 'Coast',
                    enduse: 'HE/PL',
                    ageclass: 'Old growth',
                    volume: '40.0',
                    length: '7.5',
                    diameter: '18.0',
                    productType: 'Unmanufactured',
                  },
                  packageDetails: {
                    volume: '38.5',
                    status: 'APP',
                    statusDesc: 'Approved',
                    reprocessed: 'N',
                    comments: 'Current OIC package',
                    ageClass: 'Second growth',
                  },
                  scaleList: [
                    {
                      id: 'OIC-SCALE-1',
                      timbermark: 'TM-OIC',
                      species: 'Hemlock',
                      grade: 'B',
                      pieces: 5,
                      volume: '12.5',
                    },
                  ],
                },
              ],
            }),
          )
        case '/lexis/rpc/permit-details/all-scale-fees':
          return Promise.resolve(
            response({
              packageList: [
                {
                  packageNumber: 'BOIC-100',
                  scaleList: [
                    {
                      id: 'OIC-FEE-1',
                      timbermark: 'TM-OIC',
                      species: 'Hemlock',
                      grade: 'B',
                      amv: '$80.00',
                      volume: '12.5',
                      ministryUser: false,
                      fil: '10%',
                      mf: 0,
                      fee: '$10.50',
                    },
                  ],
                },
              ],
            }),
          )
        case '/lexis/rpc/permit-details/gbms-invoice-history':
          return Promise.resolve(response([]))
        default:
          return Promise.reject(new Error(`Unexpected request ${path}`))
      }
    })

    const result = await fetchProvincialPermitDetailTabs({
      permitNumber: 'P-888',
      blanketOic: true,
    })

    expect(getCachedResponseMock).toHaveBeenCalledTimes(3)
    expect(getCachedResponseMock).toHaveBeenCalledWith(
      '/lexis/rpc/permit-details/core-tabs',
      { params: { permitNumber: 'P-888', blanketOic: true } },
      { ttlMs: 30_000 },
    )
    expect(getCachedResponseMock).toHaveBeenCalledWith(
      '/lexis/rpc/permit-details/all-scale-fees',
      {
        params: {
          permitNumber: 'P-888',
        },
      },
      { ttlMs: 30_000 },
    )
    expect(getCachedResponseMock).toHaveBeenCalledWith(
      '/lexis/rpc/permit-details/gbms-invoice-history',
      { params: { receiptNumber: '', permitNumber: 'P-888' } },
      { ttlMs: 30_000 },
    )
    expect(result.packages).toEqual([
      {
        packageNumber: 'BOIC-100',
        region: 'Coast',
        speciesEndUseSort: 'HE/PL',
        ageClass: 'Second growth',
        packageVolume: '40.0',
        averageLength: '7.5',
        averageTopDiameter: '18.0',
        productType: 'Unmanufactured',
        currentPackageVolume: '38.5',
        status: 'APP - Approved',
        reprocessed: 'N',
        comments: 'Current OIC package',
      },
    ])
    expect(result.items).toEqual([
      {
        id: 'OIC-SCALE-1',
        timberMark: 'TM-OIC',
        scaleType: '',
        species: 'Hemlock',
        grade: 'B',
        pieces: 5,
        volume: 12.5,
        packageNumber: 'BOIC-100',
        permitNumber: '',
        includedInPermit: false,
      },
    ])
    expect(result.fees).toEqual([
      {
        id: 'OIC-FEE-1',
        packageNumber: 'BOIC-100',
        timberMark: 'TM-OIC',
        species: 'Hemlock',
        grade: 'B',
        amv: '$80.00',
        volume: 12.5,
        ministryUser: false,
        ewb: '',
        filPercent: '10%',
        mfPercent: '0%',
        amount: 10.5,
        amountDisplay: '$10.50',
      },
    ])
  })

  const requiredPermitTabResponse = (path: string, blanketOic = false) => {
    switch (path) {
      case '/lexis/rpc/permit-details/core-tabs':
        return response({
          applicationList: ['1000456'],
          packageList: [
            {
              packageNumber: 'PKG-100',
              packageInfo: { region: 'Coast', volume: '12.5' },
              packageDetails: blanketOic ? { status: 'ACT', volume: '12.5' } : null,
              scaleList: [],
            },
          ],
        })
      case '/lexis/rpc/permit-details/all-scale-fees':
        return response({ packageList: [] })
      case '/lexis/rpc/permit-details/gbms-invoice-history':
        return response([])
      default:
        throw new Error(`Unexpected permit tab path: ${path}`)
    }
  }

  const requiredPermitTabDependencies = [
    {
      label: 'core tab data',
      path: '/lexis/rpc/permit-details/core-tabs',
      blanketOic: false,
    },
    {
      label: 'bulk scale fee list',
      path: '/lexis/rpc/permit-details/all-scale-fees',
      blanketOic: false,
    },
  ]

  it.each(requiredPermitTabDependencies)(
    'rejects permit tab data when the required $label request fails',
    async (testCase) => {
      getCachedResponseMock.mockImplementation((path: string) => {
        if (path === testCase.path) {
          return Promise.reject(new Error(`${testCase.label} unavailable`))
        }
        return Promise.resolve(requiredPermitTabResponse(path, testCase.blanketOic))
      })

      await expect(
        fetchProvincialPermitDetailTabs({
          permitNumber: 'P-777',
          blanketOic: testCase.blanketOic,
        }),
      ).rejects.toThrow(`${testCase.label} unavailable`)
    },
  )

  it.each(requiredPermitTabDependencies)(
    'rejects permit tab data when the required $label returns service-unavailable no-content',
    async (testCase) => {
      getCachedResponseMock.mockImplementation((path: string) =>
        Promise.resolve(
          path === testCase.path
            ? response(undefined, 204)
            : requiredPermitTabResponse(path, testCase.blanketOic),
        ),
      )

      await expect(
        fetchProvincialPermitDetailTabs({
          permitNumber: 'P-777',
          blanketOic: testCase.blanketOic,
        }),
      ).rejects.toThrow(/service unavailable/i)
    },
  )

  it.each(['/lexis/rpc/permit-details/core-tabs', '/lexis/rpc/permit-details/all-scale-fees'])(
    'rejects malformed required permit tab data from %s',
    async (malformedPath) => {
      getCachedResponseMock.mockImplementation((path: string) => {
        return Promise.resolve(
          path === malformedPath ? response({}) : requiredPermitTabResponse(path),
        )
      })

      await expect(fetchProvincialPermitDetailTabs('P-777')).rejects.toThrow('Invalid')
    },
  )

  it('rejects malformed aggregate package data', async () => {
    getCachedResponseMock.mockImplementation((path: string) =>
      Promise.resolve(
        path === '/lexis/rpc/permit-details/core-tabs'
          ? response({
              applicationList: ['1000456'],
              packageList: [{ packageNumber: 'PKG-100', packageInfo: {}, scaleList: null }],
            })
          : requiredPermitTabResponse(path),
      ),
    )

    await expect(fetchProvincialPermitDetailTabs('P-777')).rejects.toThrow('Invalid package data')
  })

  it('rejects a missing Blanket OIC package detail', async () => {
    getCachedResponseMock.mockImplementation((path: string) =>
      Promise.resolve(
        path === '/lexis/rpc/permit-details/core-tabs'
          ? response({
              applicationList: [],
              packageList: [
                {
                  packageNumber: 'PKG-100',
                  packageInfo: {},
                  packageDetails: null,
                  scaleList: [],
                },
              ],
            })
          : requiredPermitTabResponse(path, true),
      ),
    )

    await expect(
      fetchProvincialPermitDetailTabs({ permitNumber: 'P-777', blanketOic: true }),
    ).rejects.toThrow('Invalid Blanket OIC package data')
  })

  it.each([
    {
      label: 'request failure',
      gbmsResult: () => Promise.reject(new Error('gbms unavailable')),
    },
    {
      label: 'service-unavailable no-content response',
      gbmsResult: () => Promise.resolve(response(undefined, 204)),
    },
  ])('reports a GBMS history failure on $label', async (testCase) => {
    getCachedResponseMock.mockImplementation((path: string) => {
      if (path === '/lexis/rpc/permit-details/gbms-invoice-history') {
        return testCase.gbmsResult()
      }
      return Promise.resolve(requiredPermitTabResponse(path))
    })

    await expect(
      fetchProvincialPermitDetailTabs({
        permitNumber: 'P-777',
        receiptNumber: 'RCPT-1',
      }),
    ).rejects.toThrow(
      testCase.label === 'request failure'
        ? 'gbms unavailable'
        : 'No content response from /lexis/rpc/permit-details/gbms-invoice-history',
    )
  })

  it('loads GBMS history by permit when the receipt number is blank', async () => {
    getCachedResponseMock.mockImplementation((path: string) => {
      if (path === '/lexis/rpc/permit-details/gbms-invoice-history') {
        return Promise.resolve(
          response([
            {
              gbmsInvoiceNumber: 'A006654',
              cancelledByInvoice: 'A007321',
              replacedByInvoice: 'A007322',
              invoiceAmount: '123.45',
              printedDate: '2026-06-01',
              entryDate: '2026-06-01',
              updateDate: '2026-06-02',
            },
          ]),
        )
      }
      return Promise.resolve(requiredPermitTabResponse(path))
    })

    await expect(
      fetchProvincialPermitGbmsEvents({ permitNumber: 'P-777', receiptNumber: null }),
    ).resolves.toEqual([
      expect.objectContaining({
        gbmsInvoiceNumber: 'A006654',
        cancelledByInvoice: 'A007321',
        replacedByInvoice: 'A007322',
        printedDate: '2026-06-01',
        entryDate: '2026-06-01',
        updateDate: '2026-06-02',
      }),
    ])
    expect(getCachedResponseMock).toHaveBeenCalledWith(
      '/lexis/rpc/permit-details/gbms-invoice-history',
      { params: { receiptNumber: '', permitNumber: 'P-777' } },
      { ttlMs: 30_000 },
    )
  })

  it('loads available permit applications with the selected application filter', async () => {
    getCachedResponseMock.mockResolvedValue(
      response({
        applicationList: ['1000456', '1000457'],
        errorMessage: '',
      }),
    )

    const result = await fetchAvailablePermitApplications(' EX-700 ', [' 1000455 '])

    expect(getCachedResponseMock).toHaveBeenCalledWith(
      '/lexis/rpc/permit-details/available-application-list',
      {
        params: {
          exemptionNumber: 'EX-700',
          selectedApplications: '1000455',
        },
      },
      { ttlMs: 30_000 },
    )
    expect(result).toEqual({
      applicationList: ['1000456', '1000457'],
      errorMessage: '',
    })
  })

  it('loads permit invoice details sequentially after the invoice list', async () => {
    let resolveFirstInvoice: (value: ReturnType<typeof response>) => void = () => {}
    getCachedResponseMock
      .mockResolvedValueOnce(response({ invoiceList: ['INV-1', 'INV-2'] }))
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFirstInvoice = resolve
        }),
      )
      .mockResolvedValueOnce(
        response({
          invoicefound: true,
          rate: '1.25',
          fee: '12.00',
          value: '200.00',
        }),
      )

    const resultPromise = fetchPermitInvoices('777')
    await Promise.resolve()
    await Promise.resolve()

    expect(getCachedResponseMock).toHaveBeenCalledTimes(2)
    expect(getCachedResponseMock).toHaveBeenNthCalledWith(
      1,
      '/lexis/rpc/permit-details/invoices-for-permit',
      { params: { permitNumber: '777' } },
      { ttlMs: 30_000 },
    )
    expect(getCachedResponseMock).toHaveBeenNthCalledWith(
      2,
      '/lexis/rpc/permit-details/invoice-details',
      {
        params: {
          permitNumber: '777',
          salesInvoiceNumber: 'INV-1',
        },
      },
      { ttlMs: 30_000 },
    )

    resolveFirstInvoice(
      response({
        invoicefound: true,
        rate: '1.20',
        fee: '10.00',
        value: '100.00',
      }),
    )
    const result = await resultPromise

    expect(getCachedResponseMock).toHaveBeenNthCalledWith(
      3,
      '/lexis/rpc/permit-details/invoice-details',
      {
        params: {
          permitNumber: '777',
          salesInvoiceNumber: 'INV-2',
        },
      },
      { ttlMs: 30_000 },
    )
    expect(result.rows).toEqual([
      expect.objectContaining({
        invoiceNumber: 'INV-1',
        exportValueCad: '100.00',
      }),
      expect.objectContaining({
        invoiceNumber: 'INV-2',
        exportValueCad: '200.00',
      }),
    ])
  })

  it('posts permit invoice values as a legacy form request', async () => {
    postMock.mockResolvedValue(
      response({
        valid: true,
        message: 'saved',
        warnings: ['Review invoice value.'],
      }),
    )

    const result = await addPermitInvoice({
      permitNumber: ' 777 ',
      salesInvoiceNumber: ' INV-3 ',
      invoiceExportValue: ' 100.00 ',
      invoiceConversionRate: ' 1.25 ',
      invoiceFeeInLieu: ' 12.50 ',
    })

    expect(postMock).toHaveBeenCalledTimes(1)
    const [path, body, config] = postMock.mock.calls[0]
    expect(path).toBe('/lexis/rpc/permit-details/add-invoice')
    expect(body).toBeInstanceOf(URLSearchParams)
    expect(body.get('permitNumber')).toBe('777')
    expect(body.get('salesInvoiceNumber')).toBe('INV-3')
    expect(body.get('invoiceExportValue')).toBe('100.00')
    expect(body.get('invoiceConversionRate')).toBe('1.25')
    expect(body.get('invoiceFeeInLieu')).toBe('12.50')
    expect(config).toEqual({
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    })
    expect(result).toEqual({
      success: true,
      message: 'saved',
      errors: [],
      warnings: ['Review invoice value.'],
      source: 'api',
    })
  })

  it('preserves authoritative permit status and warnings from a permit update', async () => {
    postMock.mockResolvedValue(
      response({
        success: true,
        message: 'The permit was updated successfully.',
        warnings: ['Missing receipt changed the permit to Payment Pending.'],
        permitStatus: 'PPD',
        permitReceiptNo: null,
      }),
    )

    const result = await updatePermitDetail({
      permitNumber: ' 777 ',
      permitStatus: ' COM ',
      permitIssueDate: '2026-05-20',
      permitExpiryDate: '2026-06-20',
      permitRequestDate: '2026-05-19',
      exemptionNumber: ' EX-9 ',
      permitReceiptNo: '',
      permitRemarks: 'Ready',
      permitTotalVolume: '10.5',
      permitNumberOfPieces: '12',
      oicPermitTotalPieces: ' 250 ',
      oicPermitTotalVolume: ' 125.75 ',
      orgUnitNumber: '1903',
      ownerClientNumber: '00067890',
      ownerClientLocation: '03',
      agentClientNumber: '00012345',
      agentClientLocation: '01',
      destinationCompanyName: 'Acme',
      destinationCountry: ' us ',
      transportType: ' s ',
      transportName: 'Hauler',
      estimatedShippingDate: '2026-05-25',
      portOfExport: ' va ',
      otherPortOfExport: 'Stale other port',
    })

    const [path, body] = postMock.mock.calls[0]
    expect(path).toBe('/lexis/rpc/permit-details/update-permit')
    expect(body).toBeInstanceOf(URLSearchParams)
    expect(body.get('permitNumber')).toBe('777')
    expect(body.get('permitStatus')).toBe('COM')
    expect(body.get('oicPermitTotalPieces')).toBe('250')
    expect(body.get('oicPermitTotalVolume')).toBe('125.75')
    expect(body.get('orgUnitNo')).toBe('1903')
    expect(body.get('region')).toBeNull()
    expect(body.get('destinationCountry')).toBe('US')
    expect(body.get('transportType')).toBe('S')
    expect(body.get('portOfExport')).toBe('VA')
    expect(body.get('otherPortOfExport')).toBeNull()
    expect(result).toEqual({
      success: true,
      message: 'The permit was updated successfully.',
      errors: [],
      warnings: ['Missing receipt changed the permit to Payment Pending.'],
      source: 'api',
      permitStatus: 'PPD',
      permitReceiptNo: '',
    })
  })

  it('creates a permit from only the normalized exemption number', async () => {
    postMock.mockResolvedValue(
      response({
        success: true,
        message: 'The permit was created successfully.',
        permitNumber: 98765,
        warnings: ['Attach applications separately.'],
      }),
    )

    const result = await createPermitFromExemption(' EX-205 ')

    expect(postMock).toHaveBeenCalledTimes(1)
    const [path, body, config] = postMock.mock.calls[0]
    expect(path).toBe('/lexis/rpc/permit-details/create-from-exemption')
    expect(body).toBeInstanceOf(URLSearchParams)
    expect([...body.entries()]).toEqual([['exemptionNumber', 'EX-205']])
    expect(config).toEqual({
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    })
    expect(result).toEqual({
      success: true,
      message: 'The permit was created successfully.',
      errors: [],
      warnings: ['Attach applications separately.'],
      source: 'api',
      permitNumber: '98765',
    })
  })

  it('returns a positive conversion rate only when the backend marks it successful', async () => {
    getCachedResponseMock.mockResolvedValue(response({ success: true, conversionRate: '1.25' }))

    await expect(fetchPermitInvoiceConversionRate()).resolves.toEqual({
      conversionRate: '1.25',
      source: 'api',
    })
  })

  it.each([
    { success: false, conversionRate: '1.25' },
    { success: true, conversionRate: '' },
    { success: true, conversionRate: '0' },
    { success: true, conversionRate: '-1' },
    { success: true, conversionRate: 'not-a-rate' },
  ])('rejects an unavailable or invalid invoice conversion response: %o', async (payload) => {
    getCachedResponseMock.mockResolvedValue(response(payload))

    await expect(fetchPermitInvoiceConversionRate()).rejects.toThrow(
      'A valid currency conversion rate is required to add an invoice.',
    )
  })

  it('posts permit email actions with the legacy client copy and approval recipient', async () => {
    postMock.mockResolvedValue(response({ success: true, message: 'sent' }))

    await sendPermitReviewRequestEmail(' 777 ', ' applicant@example.com ')
    await sendPermitApprovalEmail(' 777 ', ' applicant@example.com ')

    const [requestPath, requestBody] = postMock.mock.calls[0]
    expect(requestPath).toBe('/lexis/rpc/permit-details/request-email')
    expect(requestBody).toBeInstanceOf(URLSearchParams)
    expect(requestBody.get('permitNumber')).toBe('777')
    expect(requestBody.get('copyToEmailAddress')).toBe('applicant@example.com')

    const [approvalPath, approvalBody] = postMock.mock.calls[1]
    expect(approvalPath).toBe('/lexis/rpc/permit-details/approval-email')
    expect(approvalBody).toBeInstanceOf(URLSearchParams)
    expect(approvalBody.get('permitNumber')).toBe('777')
    expect(approvalBody.get('clientEmailAddress')).toBe('applicant@example.com')
  })

  it('loads the server-resolved permit approval recipient without caching', async () => {
    getMock.mockResolvedValue(response({ clientEmailAddress: ' applicant@example.com ' }))

    await expect(fetchPermitApprovalEmailDefault(' 777 ')).resolves.toBe('applicant@example.com')
    expect(getMock).toHaveBeenCalledWith('/lexis/rpc/permit-details/approval-email-default', {
      params: { permitNumber: '777' },
    })
  })

  it('loads the persisted permit fee override context without caching it', async () => {
    getCachedResponseMock.mockResolvedValue(
      response({
        overrideEnabled: true,
        overrideFee: '45.25',
        overrideComment: 'Reviewed calculation',
        locked: false,
        lockMessage: '',
      }),
    )

    const result = await fetchPermitFeeOverrideContext(' 777 ')

    expect(getCachedResponseMock).toHaveBeenCalledWith(
      '/lexis/rpc/permit-details/edit-context',
      { params: { permitNumber: '777' } },
      { ttlMs: 0 },
    )
    expect(result).toEqual({
      overrideEnabled: true,
      overrideFee: '45.25',
      overrideComment: 'Reviewed calculation',
      locked: false,
      lockMessage: '',
    })
    expect(registerRecordVersionMock).toHaveBeenCalledWith(
      'permit',
      '777',
      expect.any(Object),
      '/lexis/rpc/permit-details/edit-context',
      { params: { permitNumber: '777' } },
    )
  })

  it('rejects an empty permit edit context instead of treating it as unlocked', async () => {
    getCachedResponseMock.mockResolvedValue(response(undefined, 204))

    await expect(fetchPermitFeeOverrideContext('777')).rejects.toThrow(
      'Unexpected permit edit context payload.',
    )
  })

  it('rejects a permit edit context without an explicit lock state', async () => {
    getCachedResponseMock.mockResolvedValue(
      response({
        overrideEnabled: false,
        overrideFee: '',
        overrideComment: '',
      }),
    )

    await expect(fetchPermitFeeOverrideContext('777')).rejects.toThrow(
      'Unexpected permit edit context payload.',
    )
  })

  it('calls the permit edit-lock compatibility endpoint during cleanup', async () => {
    postMock.mockResolvedValue(response({ release: 'ok' }))

    await releasePermitEditLock(' 777 ')

    expect(postMock).toHaveBeenCalledWith('/lexis/rpc/permit-details/release-lock', null, {
      params: { permitNumber: '777' },
    })
  })

  it('posts permit scale attachment changes as a legacy form request', async () => {
    postMock.mockResolvedValue(
      response({
        success: true,
        message: 'Scale detail was added to the permit.',
      }),
    )

    const result = await updatePermitScaleAttachment({
      scaleId: ' 123 ',
      permitNumber: ' 777 ',
      attachInd: true,
    })

    expect(postMock).toHaveBeenCalledTimes(1)
    const [path, body, config] = postMock.mock.calls[0]
    expect(path).toBe('/lexis/rpc/permit-details/update-scale-attachment')
    expect(body).toBeInstanceOf(URLSearchParams)
    expect(body.get('scaleId')).toBe('123')
    expect(body.get('permitNumber')).toBe('777')
    expect(body.get('attachInd')).toBe('true')
    expect(config).toEqual({
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    })
    expect(result).toEqual({
      success: true,
      message: 'Scale detail was added to the permit.',
      errors: [],
      warnings: [],
    })
  })

  it('posts permit application adds as a legacy form request', async () => {
    postMock.mockResolvedValue(
      response({
        success: true,
        message: 'Applications were added to the permit.',
      }),
    )

    const result = await addApplicationsToPermit({
      permitNumber: ' 777 ',
      selectedApplications: [' 1000456 ', '1000457'],
    })

    expect(postMock).toHaveBeenCalledTimes(1)
    const [path, body, config] = postMock.mock.calls[0]
    expect(path).toBe('/lexis/rpc/permit-details/add-applications-to-permit')
    expect(body).toBeInstanceOf(URLSearchParams)
    expect(body.get('permitNumber')).toBe('777')
    expect(body.get('selectedApplications')).toBe('1000456,1000457')
    expect(config).toEqual({
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    })
    expect(result).toEqual({
      success: true,
      message: 'Applications were added to the permit.',
      errors: [],
      warnings: [],
    })
  })

  it('posts permit application removals as a legacy form request', async () => {
    postMock.mockResolvedValue(
      response({
        success: true,
        message: 'Application was removed from the permit.',
      }),
    )

    const result = await removeApplicationFromPermit({
      permitNumber: ' 777 ',
      applicationNumber: ' 1000456 ',
    })

    expect(postMock).toHaveBeenCalledTimes(1)
    const [path, body, config] = postMock.mock.calls[0]
    expect(path).toBe('/lexis/rpc/permit-details/remove-application-from-permit')
    expect(body).toBeInstanceOf(URLSearchParams)
    expect(body.get('permitNumber')).toBe('777')
    expect(body.get('applicationNumber')).toBe('1000456')
    expect(config).toEqual({
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    })
    expect(result).toEqual({
      success: true,
      message: 'Application was removed from the permit.',
      errors: [],
      warnings: [],
    })
  })

  it('posts Blanket OIC scale adds as a legacy form request', async () => {
    postMock.mockResolvedValue(
      response({
        success: true,
        message: 'Blanket OIC scale detail was added.',
      }),
    )

    const result = await addBlanketOicScale({
      permitNumber: ' 777 ',
      packageNumber: ' PKG-9 ',
      timberMark: ' TM-1 ',
      scaleVolume: ' 10.5 ',
      scalePieces: ' 12 ',
      speciesCode: ' HE ',
      gradeCode: ' A ',
    })

    expect(postMock).toHaveBeenCalledTimes(1)
    const [path, body, config] = postMock.mock.calls[0]
    expect(path).toBe('/lexis/rpc/permit-details/add-boic-scale')
    expect(body).toBeInstanceOf(URLSearchParams)
    expect(body.get('permitNumber')).toBe('777')
    expect(body.get('packageNumber')).toBe('PKG-9')
    expect(body.get('timberMark')).toBe('TM-1')
    expect(body.get('scaleVolume')).toBe('10.5')
    expect(body.get('scalePieces')).toBe('12')
    expect(body.get('speciesCode')).toBe('HE')
    expect(body.get('gradeCode')).toBe('A')
    expect(config).toEqual({
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    })
    expect(result).toEqual({
      success: true,
      message: 'Blanket OIC scale detail was added.',
      errors: [],
      warnings: [],
    })
  })

  it('posts Blanket OIC scale deletes as a legacy form request', async () => {
    postMock.mockResolvedValue(
      response({
        success: true,
        message: 'Blanket OIC scale detail was removed.',
      }),
    )

    const result = await deleteBlanketOicScale({
      scaleId: ' 123 ',
      permitNumber: ' 777 ',
    })

    expect(postMock).toHaveBeenCalledTimes(1)
    const [path, body, config] = postMock.mock.calls[0]
    expect(path).toBe('/lexis/rpc/permit-details/delete-boic-scale')
    expect(body).toBeInstanceOf(URLSearchParams)
    expect(body.get('scaleId')).toBe('123')
    expect(body.get('permitNumber')).toBe('777')
    expect(config).toEqual({
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    })
    expect(result).toEqual({
      success: true,
      message: 'Blanket OIC scale detail was removed.',
      errors: [],
      warnings: [],
    })
  })

  it('posts Blanket OIC package creates and updates as atomic JSON requests', async () => {
    postMock.mockResolvedValue(
      response({
        success: true,
        message: 'saved',
        permitNumber: 777,
        applicationNumber: 1000456,
        packageNumber: 'PKG-NEW',
        warnings: [],
      }),
    )
    const request = {
      permitNumber: ' 777 ',
      packageNumber: ' PKG-OLD ',
      newPackageNumber: ' PKG-NEW ',
      volume: '100.0',
      averageLength: '10.0',
      averageDiameter: '20.0',
      status: ' ACT ',
      comments: 'Package comment',
      reprocessed: ' N ',
      ageClass: ' O ',
      productType: ' H ',
      endUseCode: ' LU ',
      speciesCodes: [' FI ', 'HE'],
    }

    const createResult = await addBlanketOicPackage(request)
    const updateResult = await updateBlanketOicPackage(request)

    expect(postMock).toHaveBeenNthCalledWith(1, '/lexis/rpc/permit-details/boic-package', {
      permitNumber: 777,
      packageNumber: 'PKG-OLD',
      newPackageNumber: 'PKG-NEW',
      volume: 100,
      averageLength: 10,
      averageDiameter: 20,
      status: 'ACT',
      comments: 'Package comment',
      reprocessed: 'N',
      ageClass: 'O',
      productType: 'H',
      endUseCode: 'LU',
      speciesCodes: ['FI', 'HE'],
    })
    expect(postMock).toHaveBeenNthCalledWith(
      2,
      '/lexis/rpc/permit-details/boic-package/update',
      expect.objectContaining({ packageNumber: 'PKG-OLD', newPackageNumber: 'PKG-NEW' }),
    )
    expect(createResult.applicationNumber).toBe('1000456')
    expect(updateResult.packageNumber).toBe('PKG-NEW')
  })

  it('posts Blanket OIC package deletes with the parent permit', async () => {
    postMock.mockResolvedValue(
      response({
        success: true,
        permitNumber: 777,
        applicationNumber: 1000456,
        packageNumber: 'PKG-1',
      }),
    )

    const result = await deleteBlanketOicPackage(' 777 ', ' PKG-1 ')

    expect(postMock).toHaveBeenCalledWith('/lexis/rpc/permit-details/boic-package/delete', {
      permitNumber: 777,
      packageNumber: 'PKG-1',
    })
    expect(result.success).toBe(true)
    expect(result.packageNumber).toBe('PKG-1')
  })

  it('loads the raw package codes needed by the Blanket OIC edit form', async () => {
    getCachedResponseMock
      .mockResolvedValueOnce(
        response({
          success: true,
          packageNumber: 'PKG-1',
          volume: '100.0',
          length: '10.0',
          diameter: '20.0',
          status: 'ACT',
          comments: 'Current',
          reprocessed: 'N',
          ageClass: 'O',
          productType: 'H',
        }),
      )
      .mockResolvedValueOnce(
        response([
          { species: 'FI', packageEndUse: 'LU' },
          { species: 'HE', packageEndUse: 'LU' },
        ]),
      )

    const result = await fetchBlanketOicPackageEditContext(' PKG-1 ')

    expect(result).toEqual({
      packageNumber: 'PKG-1',
      volume: '100.0',
      averageLength: '10.0',
      averageDiameter: '20.0',
      status: 'ACT',
      comments: 'Current',
      reprocessed: 'N',
      ageClass: 'O',
      productType: 'H',
      endUseCode: 'LU',
      speciesCodes: ['FI', 'HE'],
    })
  })

  it.each([
    ['missing package detail service', response(undefined, 204), response([])],
    [
      'missing package detail record',
      response({ success: false, packageNumber: '' }),
      response([]),
    ],
    [
      'mismatched package detail record',
      response({ success: true, packageNumber: 'PKG-2' }),
      response([]),
    ],
    [
      'missing species service',
      response({ success: true, packageNumber: 'PKG-1' }),
      response(undefined, 204),
    ],
    [
      'malformed species rows',
      response({ success: true, packageNumber: 'PKG-1' }),
      response([{ species: 'FI' }]),
    ],
  ])('fails closed when the Blanket OIC edit context has a %s', async (_, details, species) => {
    getCachedResponseMock.mockResolvedValueOnce(details).mockResolvedValueOnce(species)

    await expect(fetchBlanketOicPackageEditContext('PKG-1')).rejects.toThrow(
      'Unexpected Blanket OIC package edit context payload.',
    )
  })
})
