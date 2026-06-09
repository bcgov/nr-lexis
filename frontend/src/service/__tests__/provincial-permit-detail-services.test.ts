import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchProvincialPermitDetailTabs } from '@/service/provincial-permit-detail-tabs-service'
import { fetchPermitInvoices } from '@/service/provincial-permit-documents-invoices-service'

const { getCachedResponseMock } = vi.hoisted(() => ({
  getCachedResponseMock: vi.fn(),
}))

vi.mock('@/service/api-service', () => ({
  default: {
    getCachedResponse: getCachedResponseMock,
    getAxiosInstance: () => ({
      get: vi.fn(),
      post: vi.fn(),
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
          scaleList: [
            {
              id: 'SCALE-1',
              timbermark: 'TM-1',
              species: 'Fir',
              grade: 'A',
              pieces: 12,
              volume: '34.5',
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

    expect(getCachedResponseMock).toHaveBeenCalledTimes(3)
    expect(getCachedResponseMock).toHaveBeenNthCalledWith(
      1,
      '/lexis/rpc/permit-details/package-list',
      { params: { permitNumber: 'P-777' } },
      { ttlMs: 30_000 },
    )
    expect(getCachedResponseMock).toHaveBeenNthCalledWith(
      2,
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
      3,
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
      items: [
        {
          id: 'SCALE-1',
          timberMark: 'TM-1',
          species: 'Fir',
          grade: 'A',
          pieces: 12,
          volume: 34.5,
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

  it('returns empty permit detail tab rows when optional RPC tables are unavailable', async () => {
    getCachedResponseMock
      .mockRejectedValueOnce(new Error('package list unavailable'))
      .mockRejectedValueOnce(new Error('gbms unavailable'))

    const result = await fetchProvincialPermitDetailTabs({
      permitNumber: 'P-777',
      receiptNumber: 'RCPT-1',
    })

    expect(result).toEqual({
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
})
