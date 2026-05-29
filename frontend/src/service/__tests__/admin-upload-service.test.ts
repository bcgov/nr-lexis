import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  previewScaleXmlUpload,
  submitAdminUpload,
  submitScaleXmlUpload,
} from '@/service/admin-upload-service'

const postMock = vi.fn()

vi.mock('@/service/api-service', () => ({
  default: {
    getAxiosInstance: () => ({
      post: postMock,
    }),
  },
}))

describe('admin-upload-service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    postMock.mockResolvedValue({ data: {} })
  })

  it('posts application uploads to the application endpoint with required form fields', async () => {
    const file = new File(['application-data'], 'application.pdf', { type: 'application/pdf' })

    await submitAdminUpload('application', {
      applicationNumber: '1001',
      file,
      fileDescription: 'Application evidence',
    })

    expect(postMock).toHaveBeenCalledTimes(1)
    const [path, payload, config] = postMock.mock.calls[0]

    expect(path).toBe('/lexis/admin/uploads/applications')
    expect(config).toEqual(
      expect.objectContaining({
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }),
    )

    const formData = payload as FormData
    expect(formData.get('applicationNumber')).toBe('1001')
    expect(formData.get('fileDescription')).toBe('Application evidence')
    const uploadedFile = formData.get('formFile') as File
    expect(uploadedFile.name).toBe('application.pdf')
  })

  it('posts exemption uploads to the exemption endpoint', async () => {
    const file = new File(['exemption-data'], 'exemption.pdf', { type: 'application/pdf' })

    await submitAdminUpload('exemption', {
      exemptionNumber: 'EX-200',
      file,
      fileDescription: 'Exemption document',
    })

    const [path, payload] = postMock.mock.calls[0]

    expect(path).toBe('/lexis/admin/uploads/exemptions')
    const formData = payload as FormData
    expect(formData.get('exemptionNumber')).toBe('EX-200')
    expect(formData.get('fileDescription')).toBe('Exemption document')
  })

  it('posts invoice uploads with full invoice field set', async () => {
    const file = new File(['invoice-data'], 'invoice.pdf', { type: 'application/pdf' })

    await submitAdminUpload('invoice', {
      permitNumber: '5001',
      salesInvoiceNumber: 'INV-9',
      invoiceExportValue: '100.00',
      invoiceConversionRate: '1.25',
      invoiceFeeInLieu: '100.00',
      file,
      fileDescription: 'Invoice attachment',
    })

    const [path, payload] = postMock.mock.calls[0]

    expect(path).toBe('/lexis/admin/uploads/invoices')
    const formData = payload as FormData
    expect(formData.get('permitNumber')).toBe('5001')
    expect(formData.get('salesInvoiceNumber')).toBe('INV-9')
    expect(formData.get('invoiceExportValue')).toBe('100.00')
    expect(formData.get('invoiceConversionRate')).toBe('1.25')
    expect(formData.get('invoiceFeeInLieu')).toBe('100.00')
    expect(formData.get('fileDescription')).toBe('Invoice attachment')
  })

  it('posts scale XML preview uploads to the preview endpoint', async () => {
    const file = new File(['<scales />'], 'scales.xml', { type: 'application/xml' })
    postMock.mockResolvedValue({ data: { rows: [] } })

    await previewScaleXmlUpload({
      applicationNumber: '1000456',
      packageNumber: 'PKG-903',
      file,
    })

    const [path, payload, config] = postMock.mock.calls[0]
    expect(path).toBe('/lexis/rpc/application-details/scale-upload/preview')
    expect(config).toEqual(
      expect.objectContaining({
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }),
    )
    const formData = payload as FormData
    expect(formData.get('applicationNumber')).toBe('1000456')
    expect(formData.get('packageNumber')).toBe('PKG-903')
    expect((formData.get('file') as File).name).toBe('scales.xml')
  })

  it('posts reviewed scale rows to the submit endpoint', async () => {
    postMock.mockResolvedValue({ data: { success: true } })

    await submitScaleXmlUpload({
      applicationNumber: '1000456',
      rows: [
        {
          lineNumber: 1,
          timberMark: 'TM1',
          speciesCode: 'HEM',
          speciesDescription: 'Hemlock',
          gradeCode: 'J',
          gradeDescription: 'Grade J',
          pieces: 12,
          volume: 10.5,
          packageNumber: 'PKG-903',
          applicationNumber: 1000456,
          valid: true,
          errors: [],
          warnings: [],
        },
        {
          lineNumber: 2,
          timberMark: 'TM2',
          speciesCode: 'CED',
          speciesDescription: 'Cedar',
          gradeCode: 'K',
          gradeDescription: 'Grade K',
          pieces: 8,
          volume: 5,
          packageNumber: 'PKG-903',
          applicationNumber: 1000456,
          valid: true,
          errors: [],
          warnings: [],
        },
      ],
    })

    const [path, payload] = postMock.mock.calls[0]
    expect(path).toBe('/lexis/rpc/application-details/scale-upload/submit')
    expect(payload).toEqual({
      applicationNumber: 1000456,
      rows: [
        {
          lineNumber: 1,
          timberMark: 'TM1',
          speciesCode: 'HEM',
          gradeCode: 'J',
          pieces: 12,
          volume: 10.5,
          packageNumber: 'PKG-903',
          applicationNumber: 1000456,
        },
        {
          lineNumber: 2,
          timberMark: 'TM2',
          speciesCode: 'CED',
          gradeCode: 'K',
          pieces: 8,
          volume: 5,
          packageNumber: 'PKG-903',
          applicationNumber: 1000456,
        },
      ],
    })
  })
})
