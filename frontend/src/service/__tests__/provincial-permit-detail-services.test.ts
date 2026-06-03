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

  it('loads permit detail tab endpoints sequentially', async () => {
    let resolveItems: (value: ReturnType<typeof response>) => void = () => {}
    getCachedResponseMock
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveItems = resolve
        }),
      )
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(response([]))

    const resultPromise = fetchProvincialPermitDetailTabs('P-777')
    await Promise.resolve()

    expect(getCachedResponseMock).toHaveBeenCalledTimes(1)
    expect(getCachedResponseMock).toHaveBeenNthCalledWith(
      1,
      '/lexis/permits/P-777/items',
      undefined,
      { ttlMs: 30_000 },
    )

    resolveItems(response([]))
    const result = await resultPromise

    expect(getCachedResponseMock).toHaveBeenNthCalledWith(
      2,
      '/lexis/permits/P-777/fees',
      undefined,
      { ttlMs: 30_000 },
    )
    expect(getCachedResponseMock).toHaveBeenNthCalledWith(
      3,
      '/lexis/permits/P-777/gbms',
      undefined,
      { ttlMs: 30_000 },
    )
    expect(getCachedResponseMock).toHaveBeenNthCalledWith(
      4,
      '/lexis/permits/P-777/oic-items',
      undefined,
      { ttlMs: 30_000 },
    )
    expect(getCachedResponseMock).toHaveBeenNthCalledWith(
      5,
      '/lexis/permits/P-777/boic-items',
      undefined,
      { ttlMs: 30_000 },
    )
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
