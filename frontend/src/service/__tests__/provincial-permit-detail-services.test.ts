import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addApplicationsToPermit,
  addBlanketOicPackage,
  addBlanketOicScale,
  deleteBlanketOicPackage,
  deleteBlanketOicScale,
  fetchBlanketOicPackageEditContext,
  fetchAvailablePermitApplications,
  fetchProvincialPermitDetailTabs,
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
    getCachedResponseMock
      .mockResolvedValueOnce(response({ applicationList: ['1000456'] }))
      .mockResolvedValueOnce(response({ packageList: ['PKG-100'] }))
      .mockResolvedValueOnce(
        response({
          region: 'Coast',
          enduse: 'FI/PL',
          ageclass: 'Second growth',
          volume: '34.5',
          length: '7.1',
          diameter: '16.2',
          productType: 'Unmanufactured',
        }),
      )
      .mockResolvedValueOnce(
        response({
          scaleList: [
            {
              id: 'SCALE-1',
              timbermark: 'TM-1',
              species: 'Fir',
              grade: 'A',
              pieces: 12,
              volume: '34.5',
              permit: 'P-777',
            },
            {
              id: 'SCALE-2',
              timbermark: 'TM-2',
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
        }),
      )
      .mockResolvedValueOnce(
        response({
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
        }),
      )
      .mockResolvedValueOnce(
        response([
          {
            gbmsInvoiceNumber: 'GBMS-1',
            invoiceAmount: '$123.45',
            printedDate: '2026-06-01',
          },
        ]),
      )

    const result = await fetchProvincialPermitDetailTabs({
      permitNumber: 'P-777',
      receiptNumber: 'RCPT-1',
    })

    expect(getCachedResponseMock).toHaveBeenCalledTimes(6)
    expect(getCachedResponseMock).toHaveBeenNthCalledWith(
      1,
      '/lexis/rpc/permit-details/application-list',
      { params: { permitNumber: 'P-777' } },
      { ttlMs: 30_000 },
    )
    expect(getCachedResponseMock).toHaveBeenNthCalledWith(
      2,
      '/lexis/rpc/permit-details/package-list',
      { params: { permitNumber: 'P-777' } },
      { ttlMs: 30_000 },
    )
    expect(getCachedResponseMock).toHaveBeenNthCalledWith(
      3,
      '/lexis/rpc/permit-details/package-info',
      { params: { packageNumber: 'PKG-100', permitNumber: 'P-777' } },
      { ttlMs: 30_000 },
    )
    expect(getCachedResponseMock).toHaveBeenNthCalledWith(
      4,
      '/lexis/rpc/permit-details/scales-for-package',
      { params: { packageNumber: 'PKG-100', permitNumber: 'P-777' } },
      { ttlMs: 30_000 },
    )
    expect(getCachedResponseMock).toHaveBeenNthCalledWith(
      5,
      '/lexis/rpc/permit-details/scale-fees-for-package',
      {
        params: {
          packageNumber: 'PKG-100',
          permitNumber: 'P-777',
        },
      },
      { ttlMs: 30_000 },
    )
    expect(getCachedResponseMock).toHaveBeenNthCalledWith(
      6,
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
          mfPercent: '1.5',
          amount: 123.45,
          amountDisplay: '$123.45',
        },
      ],
      gbmsEvents: [
        {
          id: 'GBMS-1',
          eventDate: '2026-06-01',
          eventType: 'GBMS Invoice',
          status: 'Current',
          reference: 'GBMS-1',
          notes: 'Amount $123.45',
        },
      ],
      oicItems: [],
      boicItems: [],
    })
  })

  it('loads Blanket OIC package rows from the legacy OIC permit endpoints', async () => {
    getCachedResponseMock
      .mockResolvedValueOnce(response({ applicationList: [] }))
      .mockResolvedValueOnce(response({ packageList: ['BOIC-100'] }))
      .mockResolvedValueOnce(
        response({
          region: 'Coast',
          enduse: 'HE/PL',
          ageclass: 'Old growth',
          volume: '40.0',
          length: '7.5',
          diameter: '18.0',
          productType: 'Unmanufactured',
        }),
      )
      .mockResolvedValueOnce(
        response({
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
        }),
      )
      .mockResolvedValueOnce(
        response({
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
              mf: '2.0',
              fee: '$10.50',
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        response({
          volume: '38.5',
          status: 'APP',
          statusDesc: 'Approved',
          reprocessed: 'N',
          comments: 'Current OIC package',
          ageClass: 'Second growth',
        }),
      )

    const result = await fetchProvincialPermitDetailTabs({
      permitNumber: 'P-888',
      blanketOic: true,
    })

    expect(getCachedResponseMock).toHaveBeenCalledTimes(6)
    expect(getCachedResponseMock).toHaveBeenNthCalledWith(
      1,
      '/lexis/rpc/permit-details/application-list',
      { params: { permitNumber: 'P-888' } },
      { ttlMs: 30_000 },
    )
    expect(getCachedResponseMock).toHaveBeenNthCalledWith(
      2,
      '/lexis/rpc/permit-details/oic-package-list',
      { params: { permitNumber: 'P-888' } },
      { ttlMs: 30_000 },
    )
    expect(getCachedResponseMock).toHaveBeenNthCalledWith(
      3,
      '/lexis/rpc/permit-details/package-info',
      { params: { packageNumber: 'BOIC-100', permitNumber: 'P-888' } },
      { ttlMs: 30_000 },
    )
    expect(getCachedResponseMock).toHaveBeenNthCalledWith(
      4,
      '/lexis/rpc/permit-details/scales-for-package',
      { params: { packageNumber: 'BOIC-100', permitNumber: 'P-888' } },
      { ttlMs: 30_000 },
    )
    expect(getCachedResponseMock).toHaveBeenNthCalledWith(
      5,
      '/lexis/rpc/permit-details/scale-fees-for-package',
      {
        params: {
          packageNumber: 'BOIC-100',
          permitNumber: 'P-888',
        },
      },
      { ttlMs: 30_000 },
    )
    expect(getCachedResponseMock).toHaveBeenNthCalledWith(
      6,
      '/lexis/rpc/permit-details/package-details',
      { params: { packageNumber: 'BOIC-100', permitNumber: 'P-888' } },
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
        mfPercent: '2.0',
        amount: 10.5,
        amountDisplay: '$10.50',
      },
    ])
  })

  const requiredPermitTabResponse = (path: string) => {
    switch (path) {
      case '/lexis/rpc/permit-details/application-list':
        return response({ applicationList: ['1000456'] })
      case '/lexis/rpc/permit-details/package-list':
      case '/lexis/rpc/permit-details/oic-package-list':
        return response({ packageList: ['PKG-100'] })
      case '/lexis/rpc/permit-details/package-info':
        return response({ region: 'Coast', volume: '12.5' })
      case '/lexis/rpc/permit-details/package-details':
        return response({ status: 'ACT', volume: '12.5' })
      case '/lexis/rpc/permit-details/scales-for-package':
      case '/lexis/rpc/permit-details/scale-fees-for-package':
        return response({ scaleList: [] })
      case '/lexis/rpc/permit-details/gbms-invoice-history':
        return response([])
      default:
        throw new Error(`Unexpected permit tab path: ${path}`)
    }
  }

  const requiredPermitTabDependencies = [
    {
      label: 'application list',
      path: '/lexis/rpc/permit-details/application-list',
      blanketOic: false,
    },
    {
      label: 'package list',
      path: '/lexis/rpc/permit-details/package-list',
      blanketOic: false,
    },
    {
      label: 'package information',
      path: '/lexis/rpc/permit-details/package-info',
      blanketOic: false,
    },
    {
      label: 'package details',
      path: '/lexis/rpc/permit-details/package-details',
      blanketOic: true,
    },
    {
      label: 'scale list',
      path: '/lexis/rpc/permit-details/scales-for-package',
      blanketOic: false,
    },
    {
      label: 'scale fee list',
      path: '/lexis/rpc/permit-details/scale-fees-for-package',
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
        return Promise.resolve(requiredPermitTabResponse(path))
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
          path === testCase.path ? response(undefined, 204) : requiredPermitTabResponse(path),
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

  it.each([
    '/lexis/rpc/permit-details/application-list',
    '/lexis/rpc/permit-details/package-list',
    '/lexis/rpc/permit-details/scales-for-package',
    '/lexis/rpc/permit-details/scale-fees-for-package',
  ])('rejects malformed required permit tab data from %s', async (malformedPath) => {
    getCachedResponseMock.mockImplementation((path: string) => {
      return Promise.resolve(
        path === malformedPath ? response({}) : requiredPermitTabResponse(path),
      )
    })

    await expect(fetchProvincialPermitDetailTabs('P-777')).rejects.toThrow('Invalid')
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
  ])(
    'keeps display-only GBMS history optional on $label when required permit tables load',
    async (testCase) => {
      getCachedResponseMock.mockImplementation((path: string) => {
        if (path === '/lexis/rpc/permit-details/gbms-invoice-history') {
          return testCase.gbmsResult()
        }
        return Promise.resolve(requiredPermitTabResponse(path))
      })

      const result = await fetchProvincialPermitDetailTabs({
        permitNumber: 'P-777',
        receiptNumber: 'RCPT-1',
      })

      expect(result.applications).toEqual(['1000456'])
      expect(result.packages).toHaveLength(1)
      expect(result.gbmsEvents).toEqual([])
    },
  )

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
