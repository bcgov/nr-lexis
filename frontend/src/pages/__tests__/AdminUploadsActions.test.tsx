import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import AdminUploadsPage from '@/pages/AdminUploads'
import { submitAdminUpload } from '@/service/admin-upload-service'
import { searchProvincialExemptionNumberOptions } from '@/service/provincial-exemption-search-service'
import { searchProvincialApplicationNumberOptions } from '@/service/provincial-application-search-service'
import { searchProvincialPermitNumberOptions } from '@/service/provincial-permit-search-service'

vi.mock('@/context/auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/service/admin-upload-service', () => ({
  submitAdminUpload: vi.fn(),
}))

vi.mock('@/service/provincial-application-search-service', () => ({
  searchProvincialApplicationNumberOptions: vi.fn(),
}))

vi.mock('@/service/provincial-exemption-search-service', () => ({
  searchProvincialExemptionNumberOptions: vi.fn(),
}))

vi.mock('@/service/provincial-permit-search-service', () => ({
  searchProvincialPermitNumberOptions: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)
const mockedSubmitAdminUpload = vi.mocked(submitAdminUpload)
const mockedSearchProvincialApplicationNumberOptions = vi.mocked(
  searchProvincialApplicationNumberOptions,
)
const mockedSearchProvincialExemptionNumberOptions = vi.mocked(
  searchProvincialExemptionNumberOptions,
)
const mockedSearchProvincialPermitNumberOptions = vi.mocked(searchProvincialPermitNumberOptions)

const renderPage = (path = '/admin/uploads?type=permit') => {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin/uploads" element={<AdminUploadsPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

const XML_PREVIEW_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<esf:ESFSubmission xmlns:esf="http://www.for.gov.bc.ca/schema/esf" xmlns:lexis="http://www.for.gov.bc.ca/schema/lexis">
  <esf:submissionContent>
    <lexis:LexisSubmission>
      <lexis:applicant>
        <lexis:applicantDetails>
          <lexis:clientNumber>1074</lexis:clientNumber>
        </lexis:applicantDetails>
      </lexis:applicant>
      <lexis:applicationDetail>
        <lexis:bcForestRegionCode>RSC</lexis:bcForestRegionCode>
      </lexis:applicationDetail>
      <lexis:productDetail>
        <lexis:boomNumber>TEST23-652-7D-2</lexis:boomNumber>
        <lexis:speciesEndUseSort>HE/PL</lexis:speciesEndUseSort>
        <lexis:harvestedTimber />
        <lexis:harvestedTimber />
      </lexis:productDetail>
    </lexis:LexisSubmission>
  </esf:submissionContent>
</esf:ESFSubmission>`

describe('Admin upload workflow smoke', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedSubmitAdminUpload.mockResolvedValue({})
    mockedSearchProvincialApplicationNumberOptions.mockResolvedValue([])
    mockedSearchProvincialExemptionNumberOptions.mockResolvedValue([])
    mockedSearchProvincialPermitNumberOptions.mockResolvedValue([])
  })

  it('submits permit upload with query-prefilled number', async () => {
    mockedUseAuth.mockReturnValue({
      canPerform: (action: string) => action === '/filePermitUpload',
    } as any)

    renderPage('/admin/uploads?type=permit&permitNumber=5001')

    expect(screen.getByRole('combobox', { name: 'Permit Number' })).toHaveValue('5001')
    expect(screen.getByText('Allowed')).toBeInTheDocument()

    const file = new File(['permit upload'], 'permit.pdf', { type: 'application/pdf' })
    await userEvent.upload(screen.getByLabelText('Document File'), file)
    expect(screen.getByRole('columnheader', { name: 'Target' })).toBeInTheDocument()
    expect(screen.getAllByText('Permit 5001').length).toBeGreaterThan(0)
    expect(screen.getByText(/PDF \| 13 B \| Added/)).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Document Description'), 'Permit evidence')
    await userEvent.click(screen.getByRole('button', { name: 'Submit Upload' }))

    await waitFor(() => {
      expect(mockedSubmitAdminUpload).toHaveBeenCalledWith(
        'permit',
        expect.objectContaining({
          permitNumber: '5001',
          file,
          fileDescription: 'Permit evidence',
        }),
      )
    })

    expect(screen.getByText('Upload Submitted')).toBeInTheDocument()
  })

  it('searches application numbers for application document uploads', async () => {
    mockedUseAuth.mockReturnValue({
      canPerform: (action: string) => action === '/fileApplicationUpload',
    } as any)
    mockedSearchProvincialApplicationNumberOptions.mockResolvedValue([
      {
        value: '45963',
        label: '45963 - New - Owner 00001012 - Region RSI',
        status: 'New',
        applicantClientNumber: '',
        ownerClientNumber: '00001012',
        region: 'RSI',
        listingDate: '2026-06-10',
        exemptionNumber: '',
      },
    ])

    renderPage('/admin/uploads?type=application')

    const applicationNumberInput = screen.getByRole('combobox', {
      name: 'Application Number',
    })
    await userEvent.type(applicationNumberInput, '45963')

    await waitFor(() => {
      expect(mockedSearchProvincialApplicationNumberOptions).toHaveBeenLastCalledWith('45963')
    })

    await userEvent.click(
      await screen.findByRole('option', {
        name: '45963 - New - Owner 00001012 - Region RSI',
      }),
    )

    const file = new File(['application upload'], 'application.pdf', { type: 'application/pdf' })
    await userEvent.upload(screen.getByLabelText('Document File'), file)
    await userEvent.click(screen.getByRole('button', { name: 'Submit Upload' }))

    await waitFor(() => {
      expect(mockedSubmitAdminUpload).toHaveBeenCalledWith(
        'application',
        expect.objectContaining({
          applicationNumber: '45963',
          file,
        }),
      )
    })
  })

  it('searches exemption numbers for exemption document uploads', async () => {
    mockedUseAuth.mockReturnValue({
      canPerform: (action: string) => action === '/fileExemptionUpload',
    } as any)
    mockedSearchProvincialExemptionNumberOptions.mockResolvedValue([
      {
        value: 'EX-555',
        label: 'EX-555 - Active - Owner 00001012 - Region RSC',
        status: 'Active',
        type: 'Ministerial',
        ownerClientNumber: '00001012',
        region: 'RSC',
        listingDate: '2026-06-10',
        applicationNumber: '45963',
      },
    ])

    renderPage('/admin/uploads?type=exemption')

    const exemptionNumberInput = screen.getByRole('combobox', {
      name: 'Exemption Number',
    })
    await userEvent.type(exemptionNumberInput, 'EX-555')

    await waitFor(() => {
      expect(mockedSearchProvincialExemptionNumberOptions).toHaveBeenLastCalledWith('EX-555')
    })

    await userEvent.click(
      await screen.findByRole('option', {
        name: 'EX-555 - Active - Owner 00001012 - Region RSC',
      }),
    )

    const file = new File(['exemption upload'], 'exemption.pdf', { type: 'application/pdf' })
    await userEvent.upload(screen.getByLabelText('Document File'), file)
    await userEvent.click(screen.getByRole('button', { name: 'Submit Upload' }))

    await waitFor(() => {
      expect(mockedSubmitAdminUpload).toHaveBeenCalledWith(
        'exemption',
        expect.objectContaining({
          exemptionNumber: 'EX-555',
          file,
        }),
      )
    })
  })

  it('searches permit numbers for invoice uploads', async () => {
    mockedUseAuth.mockReturnValue({
      canPerform: (action: string) => action === '/fileInvoiceUpload',
    } as any)
    mockedSearchProvincialPermitNumberOptions.mockResolvedValue([
      {
        value: '7000123',
        label: '7000123 - Active - Owner 00001012 - Region RSC',
        status: 'Active',
        applicantClientNumber: '00001012',
        ownerClientNumber: '00001012',
        totalVolume: 25,
        issueDate: '2026-06-10',
        region: 'RSC',
      },
    ])

    renderPage('/admin/uploads?type=invoice')

    const permitNumberInput = screen.getByRole('combobox', {
      name: 'Permit Number',
    })
    await userEvent.type(permitNumberInput, '7000123')

    await waitFor(() => {
      expect(mockedSearchProvincialPermitNumberOptions).toHaveBeenLastCalledWith('7000123')
    })

    await userEvent.click(
      await screen.findByRole('option', {
        name: '7000123 - Active - Owner 00001012 - Region RSC',
      }),
    )

    const file = new File(['invoice upload'], 'invoice.pdf', { type: 'application/pdf' })
    await userEvent.upload(screen.getByLabelText('Document File'), file)
    await userEvent.type(screen.getByLabelText('Invoice Number'), 'INV123')
    await userEvent.type(screen.getByLabelText('Export Value (CAD)'), '1000')
    await userEvent.click(screen.getByRole('button', { name: 'Submit Upload' }))

    await waitFor(() => {
      expect(mockedSubmitAdminUpload).toHaveBeenCalledWith(
        'invoice',
        expect.objectContaining({
          permitNumber: '7000123',
          salesInvoiceNumber: 'INV123',
          file,
        }),
      )
    })
  })

  it('blocks invoice workflow when upload action is not granted', () => {
    mockedUseAuth.mockReturnValue({
      canPerform: () => false,
    } as any)

    renderPage('/admin/uploads?type=invoice')

    expect(screen.getByText('Not Granted')).toBeInTheDocument()
    expect(
      screen.getByText('Attach an invoice file and invoice values to an existing permit.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Submit Upload' })).toBeDisabled()
  })

  it('shows a data preview empty state before files are selected', () => {
    mockedUseAuth.mockReturnValue({
      canPerform: (action: string) => action === '/filePermitUpload',
    } as any)

    renderPage('/admin/uploads?type=permit&permitNumber=5001')

    expect(screen.getByRole('heading', { name: 'Data Preview' })).toBeInTheDocument()
    expect(screen.getByText('No data uploaded yet')).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'File' })).not.toBeInTheDocument()
  })

  it('filters queued files in the data preview table', async () => {
    mockedUseAuth.mockReturnValue({
      canPerform: (action: string) => action === '/filePermitUpload',
    } as any)

    renderPage('/admin/uploads?type=permit&permitNumber=5001')

    const permitDocument = new File(['permit upload'], 'permit.pdf', { type: 'application/pdf' })
    const scaleDocument = new File(['scale upload'], 'scale.csv', { type: 'text/csv' })
    await userEvent.upload(screen.getByLabelText('Document File'), [permitDocument, scaleDocument])

    expect(screen.getByText('permit.pdf')).toBeInTheDocument()
    expect(screen.getByText('scale.csv')).toBeInTheDocument()
    expect(screen.getByText('Showing 2 of 2 files')).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('Filter queued files'), 'scale')

    expect(screen.queryByText('permit.pdf')).not.toBeInTheDocument()
    expect(screen.getByText('scale.csv')).toBeInTheDocument()
    expect(screen.getByText('Showing 1 of 2 files')).toBeInTheDocument()

    await userEvent.clear(screen.getByLabelText('Filter queued files'))
    await userEvent.type(screen.getByLabelText('Filter queued files'), 'missing')

    expect(screen.getByText('No queued files match the current filter.')).toBeInTheDocument()
    expect(screen.getByText('Showing 0 of 2 files')).toBeInTheDocument()
  })

  it('shows field validation for missing permit upload inputs', async () => {
    mockedUseAuth.mockReturnValue({
      canPerform: (action: string) => action === '/filePermitUpload',
    } as any)

    renderPage('/admin/uploads?type=permit')

    await userEvent.click(screen.getByRole('button', { name: 'Submit Upload' }))

    expect(screen.getByText('Permit number is required.')).toBeInTheDocument()
    expect(screen.getByText('Choose at least one file to upload.')).toBeInTheDocument()
    expect(mockedSubmitAdminUpload).not.toHaveBeenCalled()
  })

  it('blocks invoice uploads that fail legacy invoice validation rules', async () => {
    mockedUseAuth.mockReturnValue({
      canPerform: (action: string) => action === '/fileInvoiceUpload',
    } as any)

    renderPage('/admin/uploads?type=invoice&permitNumber=5001')

    const file = new File(['invoice upload'], 'invoice.pdf', { type: 'application/pdf' })
    await userEvent.upload(screen.getByLabelText('Document File'), file)
    await userEvent.type(screen.getByLabelText('Invoice Number'), '1234567890')
    await userEvent.type(screen.getByLabelText('Export Value (CAD)'), '0')
    await userEvent.clear(screen.getByLabelText('Conversion Rate'))
    await userEvent.type(screen.getByLabelText('Conversion Rate'), '0')
    await userEvent.clear(screen.getByLabelText('Fee In Lieu'))
    await userEvent.type(screen.getByLabelText('Fee In Lieu'), '0')

    await userEvent.click(screen.getByRole('button', { name: 'Submit Upload' }))

    expect(screen.getByText('Invoice number must be 9 characters or fewer.')).toBeInTheDocument()
    expect(screen.getAllByText('Use a positive numeric value.').length).toBeGreaterThanOrEqual(3)
    expect(mockedSubmitAdminUpload).not.toHaveBeenCalled()
  })

  it('submits LEXIS XML import without a target number', async () => {
    mockedUseAuth.mockReturnValue({
      canPerform: (action: string) => action === 'createApplication',
    } as any)
    mockedSubmitAdminUpload.mockResolvedValue({
      message:
        'LEXIS XML import created application 9001 with package TEST23-652-7D-2 and 3 scale rows.',
      applicationNumber: 9001,
      packageNumber: 'TEST23-652-7D-2',
      scaleRows: 3,
    })

    renderPage('/admin/uploads?type=lexisXml')

    expect(screen.getByText('Allowed')).toBeInTheDocument()
    expect(screen.getByText('Upload LEXIS XML Submissions')).toBeInTheDocument()
    expect(screen.queryByLabelText('Application Number')).not.toBeInTheDocument()

    const file = new File(['<xml />'], 'submission.xml', { type: 'application/xml' })
    await userEvent.upload(screen.getByLabelText('LEXIS XML or ZIP File'), file)
    expect(
      screen.getAllByText('Creates application, package, species, and scales').length,
    ).toBeGreaterThan(0)
    expect(screen.getByText(/XML \| 7 B \| Added/)).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Document Description'), 'LEXIS XML')
    await userEvent.click(screen.getByRole('button', { name: 'Submit Upload' }))

    await waitFor(() => {
      expect(mockedSubmitAdminUpload).toHaveBeenCalledWith(
        'lexisXml',
        expect.objectContaining({
          file,
          fileDescription: 'LEXIS XML',
        }),
      )
    })

    expect(screen.getByText('Upload Submitted')).toBeInTheDocument()
    expect(screen.getAllByText(/Application 9001/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Package TEST23-652-7D-2/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/3 scale rows/).length).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: 'Open Application' })).toHaveAttribute(
      'href',
      '/provincial/application/9001',
    )
  })

  it('shows structured XML warning details in the upload queue', async () => {
    mockedUseAuth.mockReturnValue({
      canPerform: (action: string) => action === 'createApplication',
    } as any)
    mockedSubmitAdminUpload.mockResolvedValue({
      applicationNumber: 9001,
      packageNumber: 'TEST23-652-7D-2',
      scaleRows: 3,
      warnings: ['Imported payload/6-652-7.xml from ZIP archive submission.zip.'],
    })

    renderPage('/admin/uploads?type=lexisXml')

    const file = new File(['zip-data'], 'submission.zip', { type: 'application/zip' })
    await userEvent.upload(screen.getByLabelText('LEXIS XML or ZIP File'), file)
    await userEvent.click(screen.getByRole('button', { name: 'Submit Upload' }))

    expect(await screen.findByText('Upload Submitted')).toBeInTheDocument()
    expect(screen.getAllByText(/Application 9001/).length).toBeGreaterThan(0)
    expect(
      screen.getAllByText(/Imported payload\/6-652-7.xml from ZIP archive submission.zip/).length,
    ).toBeGreaterThan(0)
  })

  it('previews useful fields from queued LEXIS XML files before submit', async () => {
    mockedUseAuth.mockReturnValue({
      canPerform: (action: string) => action === 'createApplication',
    } as any)

    renderPage('/admin/uploads?type=lexisXml')

    const file = new File([XML_PREVIEW_FIXTURE], 'submission.xml', { type: 'application/xml' })
    await userEvent.upload(screen.getByLabelText('LEXIS XML or ZIP File'), file)

    expect(
      await screen.findByText(
        'Preview: Package TEST23-652-7D-2, Region RSC, Species/end use HE/PL, Client 1074, 2 scale rows.',
      ),
    ).toBeInTheDocument()
  })

  it('previews queued ZIP files as server-validated XML archives before submit', async () => {
    mockedUseAuth.mockReturnValue({
      canPerform: (action: string) => action === 'createApplication',
    } as any)

    renderPage('/admin/uploads?type=lexisXml')

    const file = new File(['zip-data'], 'submission.zip', { type: 'application/zip' })
    await userEvent.upload(screen.getByLabelText('LEXIS XML or ZIP File'), file)

    expect(
      await screen.findByText('ZIP archive will be unpacked and validated on upload.'),
    ).toBeInTheDocument()
  })

  it('submits queued XML files one at a time', async () => {
    mockedUseAuth.mockReturnValue({
      canPerform: (action: string) => action === 'createApplication',
    } as any)
    mockedSubmitAdminUpload
      .mockResolvedValueOnce({
        message: 'First XML import created application 9001.',
      })
      .mockResolvedValueOnce({
        message: 'Second XML import created application 9002.',
      })

    renderPage('/admin/uploads?type=lexisXml')

    const firstFile = new File(['<xml />'], 'first.xml', { type: 'application/xml' })
    const secondFile = new File(['<xml />'], 'second.xml', { type: 'application/xml' })
    await userEvent.upload(screen.getByLabelText('LEXIS XML or ZIP File'), [firstFile, secondFile])
    await userEvent.click(screen.getByRole('button', { name: 'Submit Upload' }))

    await waitFor(() => {
      expect(mockedSubmitAdminUpload).toHaveBeenCalledTimes(2)
    })

    expect(mockedSubmitAdminUpload).toHaveBeenNthCalledWith(
      1,
      'lexisXml',
      expect.objectContaining({ file: firstFile }),
    )
    expect(mockedSubmitAdminUpload).toHaveBeenNthCalledWith(
      2,
      'lexisXml',
      expect.objectContaining({ file: secondFile }),
    )
    expect(
      screen.getByText('2 files uploaded. Verify updates in the target details view.'),
    ).toBeInTheDocument()
    expect(screen.getByText('First XML import created application 9001.')).toBeInTheDocument()
    expect(screen.getByText('Second XML import created application 9002.')).toBeInTheDocument()
  })

  it('blocks non-XML files in the LEXIS XML queue', async () => {
    const user = userEvent.setup({ applyAccept: false })

    mockedUseAuth.mockReturnValue({
      canPerform: (action: string) => action === 'createApplication',
    } as any)

    renderPage('/admin/uploads?type=lexisXml')

    const file = new File(['not xml'], 'submission.pdf', { type: 'application/pdf' })
    await user.upload(screen.getByLabelText('LEXIS XML or ZIP File'), file)

    expect(screen.getByText('Invalid')).toBeInTheDocument()
    expect(screen.getByText('LEXIS XML uploads must use a .xml or .zip file.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Submit Upload' }))

    expect(
      screen.getAllByText('1 queued file needs attention before upload.').length,
    ).toBeGreaterThan(0)
    expect(mockedSubmitAdminUpload).not.toHaveBeenCalled()
  })

  it('blocks document uploads without a file extension', async () => {
    mockedUseAuth.mockReturnValue({
      canPerform: (action: string) => action === '/filePermitUpload',
    } as any)

    renderPage('/admin/uploads?type=permit&permitNumber=5001')

    const file = new File(['permit upload'], 'permit', { type: 'application/pdf' })
    await userEvent.upload(screen.getByLabelText('Document File'), file)

    expect(screen.getByText('Invalid')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Document uploads need a file extension so LEXIS can resolve the file type.',
      ),
    ).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Submit Upload' }))

    expect(
      screen.getAllByText('1 queued file needs attention before upload.').length,
    ).toBeGreaterThan(0)
    expect(mockedSubmitAdminUpload).not.toHaveBeenCalled()
  })

  it('blocks empty files before submit', async () => {
    mockedUseAuth.mockReturnValue({
      canPerform: (action: string) => action === 'createApplication',
    } as any)

    renderPage('/admin/uploads?type=lexisXml')

    const file = new File([], 'empty.xml', { type: 'application/xml' })
    await userEvent.upload(screen.getByLabelText('LEXIS XML or ZIP File'), file)

    expect(screen.getByText('Invalid')).toBeInTheDocument()
    expect(screen.getByText('File is empty.')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Submit Upload' }))

    expect(
      screen.getAllByText('1 queued file needs attention before upload.').length,
    ).toBeGreaterThan(0)
    expect(mockedSubmitAdminUpload).not.toHaveBeenCalled()
  })

  it('shows LEXIS XML import rejection details from a 422 response', async () => {
    mockedUseAuth.mockReturnValue({
      canPerform: (action: string) => action === 'createApplication',
    } as any)
    mockedSubmitAdminUpload.mockRejectedValue({
      response: {
        status: 422,
        data: {
          message: 'LEXIS XML import rejected.',
          errors: ['Package TEST23-652-7D-2 already exists.'],
        },
      },
    })

    renderPage('/admin/uploads?type=lexisXml')

    const file = new File(['<xml />'], 'submission.xml', { type: 'application/xml' })
    await userEvent.upload(screen.getByLabelText('LEXIS XML or ZIP File'), file)
    await userEvent.click(screen.getByRole('button', { name: 'Submit Upload' }))

    expect(await screen.findByText('Upload Error')).toBeInTheDocument()
    expect(screen.getByText('Package TEST23-652-7D-2 already exists.')).toBeInTheDocument()
  })
})
