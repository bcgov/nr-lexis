import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addBlanketOicScale,
  deleteBlanketOicScale,
  fetchProvincialPermitDetailTabs,
  updatePermitScaleAttachment,
} from '@/service/provincial-permit-detail-tabs-service'
import {
  addPermitInvoice,
  fetchPermitInvoices,
} from '@/service/provincial-permit-documents-invoices-service'

const { getCachedResponseMock, postMock } = vi.hoisted(() => ({
  getCachedResponseMock: vi.fn(),
  postMock: vi.fn(),
}))

vi.mock('@/service/api-service', () => ({
  default: {
    getCachedResponse: getCachedResponseMock,
    getAxiosInstance: () => ({
      get: vi.fn(),
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
              fil: 'FIL',
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

    expect(getCachedResponseMock).toHaveBeenCalledTimes(5)
    expect(getCachedResponseMock).toHaveBeenNthCalledWith(
      1,
      '/lexis/rpc/permit-details/package-list',
      { params: { permitNumber: 'P-777' } },
      { ttlMs: 30_000 },
    )
    expect(getCachedResponseMock).toHaveBeenNthCalledWith(
      2,
      '/lexis/rpc/permit-details/package-info',
      { params: { packageNumber: 'PKG-100' } },
      { ttlMs: 30_000 },
    )
    expect(getCachedResponseMock).toHaveBeenNthCalledWith(
      3,
      '/lexis/rpc/permit-details/scales-for-package',
      { params: { packageNumber: 'PKG-100' } },
      { ttlMs: 30_000 },
    )
    expect(getCachedResponseMock).toHaveBeenNthCalledWith(
      4,
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
      5,
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
          feeCode: 'FIL',
          feeDescription: 'TM-1 / Fir / A',
          amount: 123.45,
          status: '',
          invoiceNumber: '',
          receiptNumber: '',
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
              fil: 'FIL',
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

    expect(getCachedResponseMock).toHaveBeenCalledTimes(5)
    expect(getCachedResponseMock).toHaveBeenNthCalledWith(
      1,
      '/lexis/rpc/permit-details/oic-package-list',
      { params: { permitNumber: 'P-888' } },
      { ttlMs: 30_000 },
    )
    expect(getCachedResponseMock).toHaveBeenNthCalledWith(
      2,
      '/lexis/rpc/permit-details/package-info',
      { params: { packageNumber: 'BOIC-100' } },
      { ttlMs: 30_000 },
    )
    expect(getCachedResponseMock).toHaveBeenNthCalledWith(
      3,
      '/lexis/rpc/permit-details/scales-for-package',
      { params: { packageNumber: 'BOIC-100' } },
      { ttlMs: 30_000 },
    )
    expect(getCachedResponseMock).toHaveBeenNthCalledWith(
      4,
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
      5,
      '/lexis/rpc/permit-details/package-details',
      { params: { packageNumber: 'BOIC-100' } },
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
        feeCode: 'FIL',
        feeDescription: 'TM-OIC / Hemlock / B',
        amount: 10.5,
        status: '',
        invoiceNumber: '',
        receiptNumber: '',
      },
    ])
  })

  it('returns empty permit detail tab rows when optional RPC tables are unavailable', async () => {
    getCachedResponseMock
      .mockRejectedValueOnce(new Error('package list unavailable'))
      .mockRejectedValueOnce(new Error('gbms unavailable'))

    const result = await fetchProvincialPermitDetailTabs({
      permitNumber: 'P-777',
      receiptNumber: 'RCPT-1',
    })

    expect(result).toEqual({
      packages: [],
      items: [],
      fees: [],
      gbmsEvents: [],
      oicItems: [],
      boicItems: [],
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
})
