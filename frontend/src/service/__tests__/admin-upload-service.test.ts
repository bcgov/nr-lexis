import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  submitAdminUpload,
  validateAdminUpload,
  validateApplicationSubmissionUpload,
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

  it('posts application submissions to the application submission endpoint', async () => {
    const file = new File(['<xml />'], 'submission.xml', { type: 'application/xml' })

    await submitAdminUpload('applicationSubmission', {
      file,
      userReference: 'CLIENT-REF-1',
    })

    const [path, payload] = postMock.mock.calls[0]

    expect(path).toBe('/lexis/application-submissions')
    const formData = payload as FormData
    expect(formData.has('fileDescription')).toBe(false)
    expect(formData.get('userReference')).toBe('CLIENT-REF-1')
    const uploadedFile = formData.get('formFile') as File
    expect(uploadedFile.name).toBe('submission.xml')
  })

  it('posts document upload validation to the document validation endpoint', async () => {
    const file = new File(['application-data'], 'application.pdf', { type: 'application/pdf' })

    await validateAdminUpload('application', {
      applicationNumber: '1001',
      file,
      fileDescription: 'Application evidence',
    })

    const [path, payload] = postMock.mock.calls[0]

    expect(path).toBe('/lexis/admin/uploads/applications/validation')
    const formData = payload as FormData
    expect(formData.get('applicationNumber')).toBe('1001')
    expect(formData.get('fileDescription')).toBe('Application evidence')
    const uploadedFile = formData.get('formFile') as File
    expect(uploadedFile.name).toBe('application.pdf')
  })

  it('posts application submission validation to the validation endpoint', async () => {
    const file = new File(['<xml />'], 'submission.xml', { type: 'application/xml' })

    await validateApplicationSubmissionUpload({
      file,
      userReference: 'CLIENT-REF-1',
    })

    const [path, payload] = postMock.mock.calls[0]

    expect(path).toBe('/lexis/application-submissions/validation')
    const formData = payload as FormData
    expect(formData.has('fileDescription')).toBe(false)
    expect(formData.get('userReference')).toBe('CLIENT-REF-1')
    const uploadedFile = formData.get('formFile') as File
    expect(uploadedFile.name).toBe('submission.xml')
  })
})
