import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import AdminUploadsPage from '@/pages/AdminUploads'
import { submitAdminUpload, validateLexisXmlUpload } from '@/service/admin-upload-service'
import { searchProvincialExemptionNumberOptions } from '@/service/provincial-exemption-search-service'
import { searchProvincialApplicationNumberOptions } from '@/service/provincial-application-search-service'
import { searchProvincialPermitNumberOptions } from '@/service/provincial-permit-search-service'

vi.mock('@/context/auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/service/admin-upload-service', () => ({
  submitAdminUpload: vi.fn(),
  validateLexisXmlUpload: vi.fn(),
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
const mockedValidateLexisXmlUpload = vi.mocked(validateLexisXmlUpload)
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
        <Route
          path="/provincial/application/upload"
          element={
            <AdminUploadsPage
              lockedWorkflowType="lexisXml"
              pageTitle="Upload Application Submission"
            />
          }
        />
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
    mockedValidateLexisXmlUpload.mockResolvedValue({})
    mockedSearchProvincialApplicationNumberOptions.mockResolvedValue([])
    mockedSearchProvincialExemptionNumberOptions.mockResolvedValue([])
    mockedSearchProvincialPermitNumberOptions.mockResolvedValue([])
  })

  it('submits permit upload with query-prefilled number', async () => {
    mockedUseAuth.mockReturnValue({
      canPerform: (action: string) => action === '/filePermitUpload',
    } as any)

    renderPage('/admin/uploads?type=permit&permitNumber=5001')

    expect(screen.getByRole('combobox', { name: 'Permit number' })).toHaveValue('5001')
    expect(screen.getByText('Allowed')).toBeInTheDocument()

    const file = new File(['permit upload'], 'permit.pdf', { type: 'application/pdf' })
    await userEvent.upload(screen.getByLabelText('Document File'), file)
    expect(screen.getByRole('columnheader', { name: 'Target' })).toBeInTheDocument()
    expect(screen.getAllByText('Permit 5001').length).toBeGreaterThan(0)
    expect(screen.getByText(/PDF \| 13 B \| Added/)).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Document description'), 'Permit evidence')
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

    expect(screen.getByText('Upload submitted')).toBeInTheDocument()
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
      name: 'Application number',
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
      name: 'Exemption number',
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
      name: 'Permit number',
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
    await userEvent.type(screen.getByLabelText('Invoice number'), 'INV123')
    await userEvent.type(screen.getByLabelText('Export value (CAD)'), '1000')
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

    expect(screen.getByRole('heading', { name: 'Data preview' })).toBeInTheDocument()
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

    expect(screen.getAllByText('permit.pdf').length).toBeGreaterThan(0)
    expect(screen.getAllByText('scale.csv').length).toBeGreaterThan(0)
    expect(screen.getByText('Showing 2 of 2 files')).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('Filter queued files'), 'scale')

    expect(screen.queryByText('permit.pdf')).not.toBeInTheDocument()
    expect(screen.getAllByText('scale.csv').length).toBeGreaterThan(0)
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
    await userEvent.type(screen.getByLabelText('Invoice number'), '1234567890')
    await userEvent.type(screen.getByLabelText('Export value (CAD)'), '0')
    await userEvent.clear(screen.getByLabelText('Conversion rate'))
    await userEvent.type(screen.getByLabelText('Conversion rate'), '0')
    await userEvent.clear(screen.getByLabelText('Fee in lieu'))
    await userEvent.type(screen.getByLabelText('Fee in lieu'), '0')

    await userEvent.click(screen.getByRole('button', { name: 'Submit Upload' }))

    expect(screen.getByText('Invoice number must be 9 characters or fewer.')).toBeInTheDocument()
    expect(screen.getAllByText('Use a positive numeric value.').length).toBeGreaterThanOrEqual(3)
    expect(mockedSubmitAdminUpload).not.toHaveBeenCalled()
  })

  it('validates LEXIS XML before submitting an application import', async () => {
    mockedUseAuth.mockReturnValue({
      canPerform: (action: string) => action === 'createApplication',
    } as any)
    mockedValidateLexisXmlUpload.mockResolvedValue({
      message:
        'LEXIS application submission validated for package TEST23-652-7D-2 with 3 scale rows.',
      packageNumber: 'TEST23-652-7D-2',
      scaleRows: 3,
      submissionSummary: {
        ownerClientNumber: '1074',
        ownerClientLocationCode: '03',
        ownerContactName: 'CUSTOMER SERVICE',
        jurisdictionCode: 'P',
        orgUnitNumber: 1909,
        productTypeCode: 'H',
        productLocation: 'Ten Mile Lake',
        applicationVolume: 525,
        averageLogVolume: 0.3,
        averageLength: 6.7,
        averageDiameter: 12.8,
        speciesCodes: ['HE', 'FI'],
        endUseCode: 'PL',
      },
      userReference: 'CLIENT-REF-1',
    })
    mockedSubmitAdminUpload.mockResolvedValue({
      message:
        'LEXIS import created application 9001 with package TEST23-652-7D-2 and 3 scale rows.',
      applicationNumber: 9001,
      packageNumber: 'TEST23-652-7D-2',
      scaleRows: 3,
      userReference: 'CLIENT-REF-1',
    })

    renderPage('/admin/uploads?type=lexisXml')

    expect(screen.getByText('Allowed')).toBeInTheDocument()
    expect(screen.getByText('Upload Application Submissions')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Submission summary' })).toBeInTheDocument()
    expect(screen.getByText('No application submissions selected')).toBeInTheDocument()
    expect(screen.queryByLabelText('Application number')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Document description')).not.toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('User reference'), 'CLIENT-REF-1')
    const file = new File(['<xml />'], 'submission.xml', { type: 'application/xml' })
    await userEvent.upload(screen.getByLabelText('Application submission file'), file)
    expect(screen.getAllByText('Creates a new application').length).toBeGreaterThan(0)
    expect(screen.getByText(/XML \| 7 B \| Added/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Validate submissions' }))

    await waitFor(() => {
      expect(mockedValidateLexisXmlUpload).toHaveBeenCalledWith(
        expect.objectContaining({
          file,
          fileDescription: '',
          userReference: 'CLIENT-REF-1',
        }),
      )
    })
    expect(mockedSubmitAdminUpload).not.toHaveBeenCalled()
    expect(screen.getByText('Submission validated')).toBeInTheDocument()
    expect(screen.getByText('Application Summary')).toBeInTheDocument()
    expect(screen.getByText('1074-03')).toBeInTheDocument()
    expect(screen.getByText('CUSTOMER SERVICE')).toBeInTheDocument()
    expect(screen.getAllByText('525.0').length).toBeGreaterThan(0)
    expect(screen.getByText('HE, FI')).toBeInTheDocument()
    expect(screen.getAllByText('CLIENT-REF-1').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Package TEST23-652-7D-2/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/3 scale rows/).length).toBeGreaterThan(0)

    await userEvent.click(screen.getByRole('button', { name: 'Submit applications' }))

    await waitFor(() => {
      expect(mockedSubmitAdminUpload).toHaveBeenCalledWith(
        'lexisXml',
        expect.objectContaining({
          file,
          fileDescription: '',
          userReference: 'CLIENT-REF-1',
        }),
      )
    })

    expect(screen.getByText('Application submission complete')).toBeInTheDocument()
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
    mockedValidateLexisXmlUpload.mockResolvedValue({
      packageNumber: 'TEST23-652-7D-2',
      scaleRows: 3,
      warnings: ['Imported payload/6-652-7.xml from ZIP archive submission.zip.'],
    })

    renderPage('/admin/uploads?type=lexisXml')

    const file = new File(['zip-data'], 'submission.zip', { type: 'application/zip' })
    await userEvent.upload(screen.getByLabelText('Application submission file'), file)
    await userEvent.click(screen.getByRole('button', { name: 'Validate submissions' }))

    expect(await screen.findByText('Submission validated')).toBeInTheDocument()
    expect(
      screen.getAllByText(/Imported payload\/6-652-7.xml from ZIP archive submission.zip/).length,
    ).toBeGreaterThan(0)
    expect(mockedSubmitAdminUpload).not.toHaveBeenCalled()
  })

  it('previews safe structure from queued LEXIS XML files before submit', async () => {
    mockedUseAuth.mockReturnValue({
      canPerform: (action: string) => action === 'createApplication',
    } as any)

    renderPage('/admin/uploads?type=lexisXml')

    const file = new File([XML_PREVIEW_FIXTURE], 'submission.xml', { type: 'application/xml' })
    await userEvent.upload(screen.getByLabelText('Application submission file'), file)

    expect(
      (await screen.findAllByText('Preview: LEXIS XML structure detected, 2 scale rows.')).length,
    ).toBeGreaterThan(0)
  })

  it('previews safe structure from queued LEXIS GeoJSON files before submit', async () => {
    mockedUseAuth.mockReturnValue({
      canPerform: (action: string) => action === 'createApplication',
    } as any)

    renderPage('/admin/uploads?type=lexisXml')

    const file = new File(
      [
        JSON.stringify({
          type: 'FeatureCollection',
          lexis: { applicant: {}, applicationDetail: {}, productDetail: {} },
          features: [
            {
              type: 'Feature',
              geometry: null,
              properties: { lexisEntityType: 'HARVESTED_TIMBER' },
            },
          ],
        }),
      ],
      'submission.geojson',
      { type: 'application/geo+json' },
    )
    await userEvent.upload(screen.getByLabelText('Application submission file'), file)

    expect(
      (await screen.findAllByText('Preview: LEXIS GeoJSON structure detected, 1 scale row.'))
        .length,
    ).toBeGreaterThan(0)
  })

  it('does not echo XML preview fields that contain nested markup', async () => {
    mockedUseAuth.mockReturnValue({
      canPerform: (action: string) => action === 'createApplication',
    } as any)

    renderPage('/admin/uploads?type=lexisXml')

    const xmlWithMarkupInPreviewField = XML_PREVIEW_FIXTURE.replace(
      '<lexis:boomNumber>TEST23-652-7D-2</lexis:boomNumber>',
      '<lexis:boomNumber><script>alert(1)</script></lexis:boomNumber>',
    )
    const file = new File([xmlWithMarkupInPreviewField], 'submission.xml', {
      type: 'application/xml',
    })
    await userEvent.upload(screen.getByLabelText('Application submission file'), file)

    expect(
      (await screen.findAllByText('Preview: LEXIS XML structure detected, 2 scale rows.')).length,
    ).toBeGreaterThan(0)
    expect(screen.queryByText(/Package alert/)).not.toBeInTheDocument()
    expect(screen.queryByText(/alert\(1\)/)).not.toBeInTheDocument()
  })

  it('previews queued ZIP files as server-validated XML archives before submit', async () => {
    mockedUseAuth.mockReturnValue({
      canPerform: (action: string) => action === 'createApplication',
    } as any)

    renderPage('/admin/uploads?type=lexisXml')

    const file = new File(['zip-data'], 'submission.zip', { type: 'application/zip' })
    await userEvent.upload(screen.getByLabelText('Application submission file'), file)

    expect(
      (await screen.findAllByText('ZIP archive will be unpacked and validated on upload.')).length,
    ).toBeGreaterThan(0)
  })

  it('submits queued XML files one at a time', async () => {
    mockedUseAuth.mockReturnValue({
      canPerform: (action: string) => action === 'createApplication',
    } as any)
    mockedValidateLexisXmlUpload
      .mockResolvedValueOnce({
        message: 'First XML validated.',
        packageNumber: 'FIRST-PKG',
        scaleRows: 1,
      })
      .mockResolvedValueOnce({
        message: 'Second XML validated.',
        packageNumber: 'SECOND-PKG',
        scaleRows: 1,
      })
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
    await userEvent.upload(screen.getByLabelText('Application submission file'), [
      firstFile,
      secondFile,
    ])
    await userEvent.click(screen.getByRole('button', { name: 'Validate submissions' }))

    await waitFor(() => {
      expect(mockedValidateLexisXmlUpload).toHaveBeenCalledTimes(2)
    })
    expect(mockedSubmitAdminUpload).not.toHaveBeenCalled()
    expect(
      screen.getByText(
        '2 application submissions validated. Review the file summary and submit applications.',
      ),
    ).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Submit applications' }))

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
      screen.getByText(
        '2 application submissions imported. Verify the created application and package details.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getAllByText('First XML import created application 9001.').length,
    ).toBeGreaterThan(0)
    expect(
      screen.getAllByText('Second XML import created application 9002.').length,
    ).toBeGreaterThan(0)
  })

  it('shows per-file review details for mixed XML upload results', async () => {
    mockedUseAuth.mockReturnValue({
      canPerform: (action: string) => action === 'createApplication',
    } as any)
    mockedValidateLexisXmlUpload
      .mockResolvedValueOnce({
        packageNumber: 'TEST23-652-7D-2',
        scaleRows: 3,
      })
      .mockResolvedValueOnce({
        packageNumber: 'SECOND-PKG',
        scaleRows: 1,
      })
    mockedSubmitAdminUpload
      .mockResolvedValueOnce({
        applicationNumber: 9001,
        packageNumber: 'TEST23-652-7D-2',
        scaleRows: 3,
        warnings: ['Imported payload/first.xml from ZIP archive first.zip.'],
      })
      .mockRejectedValueOnce({
        response: {
          status: 422,
          data: {
            message: 'LEXIS XML import rejected.',
            errors: ['Line: 53 Column: 7: boomNumber is required.'],
          },
        },
      })

    renderPage('/admin/uploads?type=lexisXml')

    const firstFile = new File(['<xml />'], 'first.xml', { type: 'application/xml' })
    const secondFile = new File(['<xml />'], 'second.xml', { type: 'application/xml' })
    await userEvent.upload(screen.getByLabelText('Application submission file'), [
      firstFile,
      secondFile,
    ])
    await userEvent.click(screen.getByRole('button', { name: 'Validate submissions' }))

    await waitFor(() => {
      expect(mockedValidateLexisXmlUpload).toHaveBeenCalledTimes(2)
    })

    await userEvent.click(screen.getByRole('button', { name: 'Submit applications' }))

    await waitFor(() => {
      expect(mockedSubmitAdminUpload).toHaveBeenCalledTimes(2)
    })

    expect(await screen.findByText('File Review')).toBeInTheDocument()
    expect(screen.getByText('1 file failed. Review the queue for details.')).toBeInTheDocument()
    expect(screen.getAllByText('first.xml').length).toBeGreaterThan(0)
    expect(screen.getAllByText('second.xml').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Application 9001/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Package TEST23-652-7D-2/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/3 scale rows/).length).toBeGreaterThan(0)
    expect(
      screen.getAllByText(/Imported payload\/first.xml from ZIP archive first.zip/).length,
    ).toBeGreaterThan(0)
    expect(
      screen.getAllByText(/Line: 53 Column: 7: boomNumber is required/).length,
    ).toBeGreaterThan(0)
  })

  it('blocks unsupported files in the LEXIS import queue', async () => {
    const user = userEvent.setup({ applyAccept: false })

    mockedUseAuth.mockReturnValue({
      canPerform: (action: string) => action === 'createApplication',
    } as any)

    renderPage('/admin/uploads?type=lexisXml')

    const file = new File(['not xml'], 'submission.pdf', { type: 'application/pdf' })
    await user.upload(screen.getByLabelText('Application submission file'), file)

    expect(screen.getAllByText('Invalid').length).toBeGreaterThan(0)
    expect(
      screen.getAllByText(
        'LEXIS application submissions must use a .xml, .zip, .geojson, or .json file.',
      ).length,
    ).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: 'Validate submissions' }))

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

    expect(screen.getAllByText('Invalid').length).toBeGreaterThan(0)
    expect(
      screen.getAllByText(
        'Document uploads need a file extension so LEXIS can resolve the file type.',
      ).length,
    ).toBeGreaterThan(0)

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
    await userEvent.upload(screen.getByLabelText('Application submission file'), file)

    expect(screen.getAllByText('Invalid').length).toBeGreaterThan(0)
    expect(screen.getAllByText('File is empty.').length).toBeGreaterThan(0)

    await userEvent.click(screen.getByRole('button', { name: 'Validate submissions' }))

    expect(
      screen.getAllByText('1 queued file needs attention before upload.').length,
    ).toBeGreaterThan(0)
    expect(mockedSubmitAdminUpload).not.toHaveBeenCalled()
  })

  it('shows LEXIS XML validation rejection details from a 422 response', async () => {
    mockedUseAuth.mockReturnValue({
      canPerform: (action: string) => action === 'createApplication',
    } as any)
    mockedValidateLexisXmlUpload.mockRejectedValue({
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
    await userEvent.upload(screen.getByLabelText('Application submission file'), file)
    await userEvent.click(screen.getByRole('button', { name: 'Validate submissions' }))

    expect(await screen.findByText('Upload error')).toBeInTheDocument()
    expect(screen.getAllByText('Package TEST23-652-7D-2 already exists.').length).toBeGreaterThan(0)
    expect(mockedSubmitAdminUpload).not.toHaveBeenCalled()
  })

  it('opens LEXIS application import as a locked application upload route', async () => {
    mockedUseAuth.mockReturnValue({
      canPerform: (action: string) => action === 'createApplication',
    } as any)

    renderPage('/provincial/application/upload')

    expect(
      screen.getByRole('heading', { name: 'Upload Application Submission' }),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('Upload type')).not.toBeInTheDocument()
    expect(screen.getByText('Upload Application Submissions')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Submission summary' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Validate submissions' })).toBeInTheDocument()
    expect(screen.getByLabelText('Application submission file')).toBeInTheDocument()
    expect(screen.getByLabelText('User reference')).toBeInTheDocument()
  })
})
