import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import AdminUploadsPage from '@/pages/AdminUploads'
import {
  submitAdminUpload,
  validateApplicationSubmissionUpload,
} from '@/service/admin-upload-service'
import { searchProvincialExemptionNumberOptions } from '@/service/provincial-exemption-search-service'
import { searchProvincialApplicationNumberOptions } from '@/service/provincial-application-search-service'
import { searchProvincialPermitNumberOptions } from '@/service/provincial-permit-search-service'
import { createTestAuthContext } from '@/test-utils/auth'

vi.mock('@/context/auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/service/admin-upload-service', () => ({
  submitAdminUpload: vi.fn(),
  validateApplicationSubmissionUpload: vi.fn(),
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
const mockedValidateApplicationSubmissionUpload = vi.mocked(validateApplicationSubmissionUpload)
const mockedSearchProvincialApplicationNumberOptions = vi.mocked(
  searchProvincialApplicationNumberOptions,
)
const mockedSearchProvincialExemptionNumberOptions = vi.mocked(
  searchProvincialExemptionNumberOptions,
)
const mockedSearchProvincialPermitNumberOptions = vi.mocked(searchProvincialPermitNumberOptions)

const pendingValidation = (): Promise<never> => new Promise(() => {})

const mockUploadAccess = (allowedAction: string | null): void => {
  mockedUseAuth.mockReturnValue(
    createTestAuthContext({
      canPerform: (action: string) => action === allowedAction,
    }),
  )
}

const renderPage = (path = '/admin/uploads?type=permit') => {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin/uploads" element={<AdminUploadsPage />} />
        <Route
          path="/provincial/application/upload"
          element={
            <AdminUploadsPage
              lockedWorkflowType="applicationSubmission"
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
    mockedValidateApplicationSubmissionUpload.mockResolvedValue({})
    mockedSearchProvincialApplicationNumberOptions.mockResolvedValue([])
    mockedSearchProvincialExemptionNumberOptions.mockResolvedValue([])
    mockedSearchProvincialPermitNumberOptions.mockResolvedValue([])
  })

  it('submits permit upload with query-prefilled number', async () => {
    mockUploadAccess('/filePermitUpload')

    renderPage('/admin/uploads?type=permit&permitNumber=5001')

    expect(screen.getByRole('combobox', { name: 'Permit number' })).toHaveValue('5001')
    expect(screen.getByRole('button', { name: 'Choose files for Upload documents' })).toBeVisible()

    const file = new File(['permit upload'], 'permit.pdf', { type: 'application/pdf' })
    await userEvent.upload(screen.getByLabelText('Document File'), file)
    expect(screen.getByRole('columnheader', { name: 'Target' })).toBeInTheDocument()
    expect(screen.getAllByText('Permit 5001').length).toBeGreaterThan(0)
    expect(screen.getByText(/PDF \| 13 B \| Added/)).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Document description'), 'Permit evidence')
    await userEvent.click(screen.getByRole('button', { name: 'Review upload' }))
    await userEvent.click(screen.getByRole('button', { name: 'Submit upload' }))

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

  it('shows every loaded permit number option for short result lists', async () => {
    mockUploadAccess('/filePermitUpload')
    mockedSearchProvincialPermitNumberOptions.mockResolvedValue([
      {
        value: '5001',
        label: '5001 - Active - Owner 00016245 - Region RKB',
        status: 'Active',
        applicantClientNumber: '',
        ownerClientNumber: '00016245',
        totalVolume: 10,
        issueDate: '2026-06-01',
        region: 'RKB',
      },
      {
        value: '5002',
        label: '5002 - Issued - Owner 00016245 - Region RKB',
        status: 'Issued',
        applicantClientNumber: '',
        ownerClientNumber: '00016245',
        totalVolume: 20,
        issueDate: '2026-06-02',
        region: 'RKB',
      },
    ])

    renderPage('/admin/uploads?type=permit&permitNumber=5001')

    await waitFor(() => {
      expect(mockedSearchProvincialPermitNumberOptions).toHaveBeenLastCalledWith('5001')
    })

    const input = screen.getByRole('combobox', { name: 'Permit number' })
    await userEvent.click(input)

    const listboxId = input.getAttribute('aria-controls')
    const listbox = listboxId ? document.getElementById(listboxId) : null

    expect(listbox).not.toBeNull()
    expect(
      within(listbox as HTMLElement).getByRole('option', {
        name: '5001 - Active - Owner 00016245 - Region RKB',
      }),
    ).toBeVisible()
    expect(
      within(listbox as HTMLElement).getByRole('option', {
        name: '5002 - Issued - Owner 00016245 - Region RKB',
      }),
    ).toBeVisible()
  })

  it('searches application numbers for application document uploads', async () => {
    mockUploadAccess('/fileApplicationUpload')
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
    await userEvent.click(screen.getByRole('button', { name: 'Review upload' }))
    await userEvent.click(screen.getByRole('button', { name: 'Submit upload' }))

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
    mockUploadAccess('/fileExemptionUpload')
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
    await userEvent.click(screen.getByRole('button', { name: 'Review upload' }))
    await userEvent.click(screen.getByRole('button', { name: 'Submit upload' }))

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
    mockUploadAccess('/fileInvoiceUpload')
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
    await userEvent.click(screen.getByRole('button', { name: 'Review upload' }))
    await userEvent.click(screen.getByRole('button', { name: 'Submit upload' }))

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
    mockUploadAccess(null)

    renderPage('/admin/uploads?type=invoice')

    expect(
      screen.getByText('Attach an invoice file and invoice values to an existing permit.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Review upload' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Submit upload' })).not.toBeInTheDocument()
  })

  it('keeps the review area collapsed before files are selected', () => {
    mockUploadAccess('/filePermitUpload')

    renderPage('/admin/uploads?type=permit&permitNumber=5001')

    expect(screen.queryByRole('heading', { name: 'Validation status' })).not.toBeInTheDocument()
    expect(screen.queryByText('No data uploaded yet')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Review upload' })).toBeDisabled()
    expect(screen.queryByRole('columnheader', { name: 'File' })).not.toBeInTheDocument()
  })

  it('keeps application submissions out of the generic document upload route', () => {
    mockUploadAccess('/fileApplicationUpload')

    renderPage('/admin/uploads?type=lexisXml')

    expect(screen.getByRole('heading', { name: 'Data Upload' })).toBeInTheDocument()
    expect(screen.getByText('Application upload')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Upload type' })).toBeInTheDocument()
    expect(screen.getByLabelText('Document File')).toBeInTheDocument()
    expect(screen.queryByText('Application submission upload')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Application submission file')).not.toBeInTheDocument()
  })

  it('filters queued files in the data preview table', async () => {
    mockUploadAccess('/filePermitUpload')

    renderPage('/admin/uploads?type=permit&permitNumber=5001')

    const permitDocument = new File(['permit upload'], 'permit.pdf', { type: 'application/pdf' })
    const scaleDocument = new File(['scale upload'], 'scale.csv', { type: 'text/csv' })
    await userEvent.upload(screen.getByLabelText('Document File'), [permitDocument, scaleDocument])

    expect(screen.getAllByText('permit.pdf').length).toBeGreaterThan(0)
    expect(screen.getAllByText('scale.csv').length).toBeGreaterThan(0)
    expect(screen.queryByText('Showing 2 of 2 files')).not.toBeInTheDocument()
    const workflowProgress = screen.getByRole('list', { name: 'Upload queue workflow progress' })
    expect(
      within(workflowProgress).getByText('1. Upload').closest('[role="listitem"]'),
    ).toHaveAttribute('aria-current', 'step')
    expect(screen.queryByLabelText('Filter queued files')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Review upload' }))
    expect(screen.getByText('Showing 2 of 2 files')).toBeInTheDocument()
    expect(
      within(workflowProgress).getByText('2. Review').closest('[role="listitem"]'),
    ).toHaveAttribute('aria-current', 'step')
    await userEvent.type(screen.getByLabelText('Filter queued files'), 'scale')

    expect(screen.queryByText('permit.pdf')).not.toBeInTheDocument()
    expect(screen.getAllByText('scale.csv').length).toBeGreaterThan(0)
    expect(screen.getByText('Showing 1 of 2 files')).toBeInTheDocument()

    await userEvent.clear(screen.getByLabelText('Filter queued files'))
    await userEvent.type(screen.getByLabelText('Filter queued files'), 'missing')

    expect(screen.getByText('No queued files match the current filter.')).toBeInTheDocument()
    expect(screen.getByText('Showing 0 of 2 files')).toBeInTheDocument()
  })

  it('replaces queued document uploads with the same file name', async () => {
    mockUploadAccess('/filePermitUpload')

    renderPage('/admin/uploads?type=permit&permitNumber=5001')

    const firstFile = new File(['first permit upload'], 'permit.pdf', {
      type: 'application/pdf',
    })
    const replacementFile = new File(['replacement permit upload'], 'permit.pdf', {
      type: 'application/pdf',
    })

    await userEvent.upload(screen.getByLabelText('Document File'), firstFile)
    await userEvent.click(screen.getByRole('button', { name: 'Review upload' }))
    expect(screen.getByText('Showing 1 of 1 file')).toBeInTheDocument()

    await userEvent.upload(screen.getByLabelText('Document File'), replacementFile)

    expect(screen.queryByText('Showing 1 of 1 file')).not.toBeInTheDocument()
    const workflowProgress = screen.getByRole('list', { name: 'Upload queue workflow progress' })
    expect(
      within(workflowProgress).getByText('1. Upload').closest('[role="listitem"]'),
    ).toHaveAttribute('aria-current', 'step')
    expect(screen.getByText(/PDF \| 25 B \| Added/)).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('Document description'), 'Permit evidence')
    await userEvent.click(screen.getByRole('button', { name: 'Review upload' }))
    expect(screen.getByText('Showing 1 of 1 file')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Submit upload' }))

    await waitFor(() => {
      expect(mockedSubmitAdminUpload).toHaveBeenCalledWith(
        'permit',
        expect.objectContaining({
          permitNumber: '5001',
          file: replacementFile,
          fileDescription: 'Permit evidence',
        }),
      )
    })
    expect(mockedSubmitAdminUpload).toHaveBeenCalledTimes(1)
  })

  it('shows target field validation before submitting permit upload review', async () => {
    mockUploadAccess('/filePermitUpload')

    renderPage('/admin/uploads?type=permit')

    const file = new File(['permit upload'], 'permit.pdf', { type: 'application/pdf' })
    await userEvent.upload(screen.getByLabelText('Document File'), file)
    await userEvent.click(screen.getByRole('button', { name: 'Review upload' }))
    await userEvent.click(screen.getByRole('button', { name: 'Submit upload' }))

    expect(screen.getAllByText('Permit number is required.').length).toBeGreaterThan(0)
    expect(mockedSubmitAdminUpload).not.toHaveBeenCalled()
  })

  it('blocks invoice uploads that fail legacy invoice validation rules', async () => {
    mockUploadAccess('/fileInvoiceUpload')

    renderPage('/admin/uploads?type=invoice&permitNumber=5001')

    const file = new File(['invoice upload'], 'invoice.pdf', { type: 'application/pdf' })
    await userEvent.upload(screen.getByLabelText('Document File'), file)
    await userEvent.type(screen.getByLabelText('Invoice number'), '1234567890')
    await userEvent.type(screen.getByLabelText('Export value (CAD)'), '0')
    await userEvent.clear(screen.getByLabelText('Conversion rate'))
    await userEvent.type(screen.getByLabelText('Conversion rate'), '0')
    await userEvent.clear(screen.getByLabelText('Fee in lieu'))
    await userEvent.type(screen.getByLabelText('Fee in lieu'), '0')

    await userEvent.click(screen.getByRole('button', { name: 'Review upload' }))
    await userEvent.click(screen.getByRole('button', { name: 'Submit upload' }))

    expect(screen.getByText('Invoice number must be 9 characters or fewer.')).toBeInTheDocument()
    expect(screen.getAllByText('Use a positive numeric value.').length).toBeGreaterThanOrEqual(3)
    expect(mockedSubmitAdminUpload).not.toHaveBeenCalled()
  })

  it('validates LEXIS XML before submitting an application submission', async () => {
    mockUploadAccess('uploadApplicationSubmission')
    mockedValidateApplicationSubmissionUpload.mockResolvedValue({
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
        sourceApplicationStatusCode: 'SUB',
        exemptionReasonCode: 'U',
        applicantTypeCode: 'O',
        productTypeCode: 'H',
        productLocation: 'Ten Mile Lake',
        ageClass: 'M',
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
        'LEXIS application submission created application 9001 with package TEST23-652-7D-2 and 3 scale rows.',
      applicationNumber: 9001,
      packageNumber: 'TEST23-652-7D-2',
      scaleRows: 3,
      userReference: 'CLIENT-REF-1',
    })

    renderPage('/provincial/application/upload')

    expect(screen.getByText('Application submission upload')).toBeInTheDocument()
    expect(screen.getByText('Upload application submissions')).toBeInTheDocument()
    expect(screen.getByText('Queued submissions')).toBeInTheDocument()
    const workflowProgress = screen.getByRole('list', {
      name: 'Application submission upload workflow progress',
    })
    expect(within(workflowProgress).getByText('1. Upload')).toBeInTheDocument()
    expect(within(workflowProgress).getByText('2. Review')).toBeInTheDocument()
    expect(
      within(workflowProgress).getByText('1. Upload').closest('[role="listitem"]'),
    ).toHaveAttribute('aria-current', 'step')
    expect(screen.queryByRole('heading', { name: 'Validation status' })).not.toBeInTheDocument()
    expect(screen.queryByText('No application submissions selected')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Review submissions' })).toBeDisabled()
    expect(screen.queryByRole('heading', { name: 'Submission summary' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Application number')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Document description')).not.toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('User reference'), 'CLIENT-REF-1')
    const file = new File(['<xml />'], 'submission.xml', { type: 'application/xml' })
    await userEvent.upload(screen.getByLabelText('Application submission file'), file)
    expect(screen.getAllByText('Creates a new application').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Cancel submission' })).toBeInTheDocument()
    expect(
      screen.queryByText('Review 1 selected submission before submitting.'),
    ).not.toBeInTheDocument()

    await waitFor(() => {
      expect(mockedValidateApplicationSubmissionUpload).toHaveBeenCalledWith(
        expect.objectContaining({
          file,
          userReference: 'CLIENT-REF-1',
        }),
      )
    })
    expect(mockedSubmitAdminUpload).not.toHaveBeenCalled()
    expect(screen.getByText('Submission validated')).toBeInTheDocument()
    const reviewButton = screen.getByRole('button', { name: 'Review submission' })
    await waitFor(() => expect(reviewButton).toBeEnabled())
    expect(screen.queryByRole('heading', { name: 'Submission review' })).not.toBeInTheDocument()

    await userEvent.click(reviewButton)

    expect(screen.getByRole('heading', { name: 'Submission summary' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Filter queued submissions' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Submission type' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Submission file' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Submission review' })).toBeInTheDocument()
    expect(screen.getByText('File name')).toBeInTheDocument()
    expect(screen.getByText('File size')).toBeInTheDocument()
    expect(screen.getByText('Submission timestamp')).toBeInTheDocument()
    expect(screen.getAllByText('submission.xml').length).toBeGreaterThan(0)
    expect(screen.getByText('7 B')).toBeInTheDocument()
    expect(screen.getByText('Application summary')).toBeInTheDocument()
    const applicationDetailsTable = screen.getByRole('table', {
      name: 'Application details review',
    })
    expect(
      within(applicationDetailsTable).getByRole('rowheader', { name: 'Owner client' }),
    ).toBeInTheDocument()
    expect(within(applicationDetailsTable).getByText('1074-03')).toBeInTheDocument()
    expect(within(applicationDetailsTable).getByText('CUSTOMER SERVICE')).toBeInTheDocument()
    expect(
      within(applicationDetailsTable).getByRole('rowheader', { name: 'Source status' }),
    ).toBeInTheDocument()
    expect(within(applicationDetailsTable).getByText('SUB')).toBeInTheDocument()
    expect(
      within(applicationDetailsTable).getByRole('rowheader', { name: 'Exemption reason' }),
    ).toBeInTheDocument()
    const productDetailsTable = screen.getByRole('table', { name: 'Product details review' })
    expect(
      within(productDetailsTable).getByRole('columnheader', { name: 'Product type' }),
    ).toBeInTheDocument()
    expect(
      within(productDetailsTable).getByRole('columnheader', { name: 'Species' }),
    ).toBeInTheDocument()
    expect(within(productDetailsTable).getByText('HE, FI')).toBeInTheDocument()
    expect(within(productDetailsTable).getByText('PL')).toBeInTheDocument()
    expect(screen.getByText('U')).toBeInTheDocument()
    expect(screen.getByText('Applicant type')).toBeInTheDocument()
    expect(screen.getByText('O')).toBeInTheDocument()
    expect(screen.getByText('Age class')).toBeInTheDocument()
    expect(screen.getByText('M')).toBeInTheDocument()
    expect(screen.getAllByText('525.0').length).toBeGreaterThan(0)
    expect(screen.getByText('HE, FI')).toBeInTheDocument()
    expect(screen.getAllByText('CLIENT-REF-1').length).toBeGreaterThan(0)
    expect(screen.getByLabelText('User reference')).toBeDisabled()
    expect(screen.getByLabelText('Application submission file')).toBeEnabled()
    expect(screen.getAllByText(/Package TEST23-652-7D-2/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/3 scale rows/).length).toBeGreaterThan(0)

    await userEvent.click(screen.getByRole('button', { name: 'Submit submission' }))

    await waitFor(() => {
      expect(mockedSubmitAdminUpload).toHaveBeenCalledWith(
        'applicationSubmission',
        expect.objectContaining({
          file,
          userReference: 'CLIENT-REF-1',
        }),
      )
    })

    expect(screen.getByText('Application submission complete')).toBeInTheDocument()
    expect(screen.getAllByText(/Application 9001/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Package TEST23-652-7D-2/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/3 scale rows/).length).toBeGreaterThan(0)
    expect(screen.queryByText('No application submissions selected')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Review submissions' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Cancel submission' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Open Application 9001' })).not.toBeInTheDocument()
  })

  it('replaces application submissions with the same file name while validation is pending', async () => {
    mockUploadAccess('uploadApplicationSubmission')
    mockedValidateApplicationSubmissionUpload
      .mockReturnValueOnce(pendingValidation())
      .mockResolvedValueOnce({
        message:
          'LEXIS application submission validated for package TEST23-652-7D-2 with 3 scale rows.',
        packageNumber: 'TEST23-652-7D-2',
        scaleRows: 3,
      })

    renderPage('/provincial/application/upload')

    const firstFile = new File(['<xml />'], 'submission.xml', { type: 'application/xml' })
    const replacementFile = new File([XML_PREVIEW_FIXTURE], 'submission.xml', {
      type: 'application/xml',
    })

    await userEvent.upload(screen.getByLabelText('Application submission file'), firstFile)
    await waitFor(() => {
      expect(mockedValidateApplicationSubmissionUpload).toHaveBeenCalledWith(
        expect.objectContaining({
          file: firstFile,
        }),
      )
    })

    await userEvent.upload(screen.getByLabelText('Application submission file'), replacementFile)

    expect(screen.getAllByText('submission.xml').length).toBeGreaterThan(0)
    expect(screen.getByRole('heading', { name: 'Validation status' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Submission summary' })).not.toBeInTheDocument()

    await waitFor(() => {
      expect(mockedValidateApplicationSubmissionUpload).toHaveBeenCalledTimes(2)
    })
    expect(mockedValidateApplicationSubmissionUpload).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        file: replacementFile,
      }),
    )
    expect(mockedSubmitAdminUpload).not.toHaveBeenCalled()
  })

  it('cancels a validated application submission and clears review state', async () => {
    mockUploadAccess('uploadApplicationSubmission')
    mockedValidateApplicationSubmissionUpload.mockResolvedValue({
      message:
        'LEXIS application submission validated for package TEST23-652-7D-2 with 3 scale rows.',
      packageNumber: 'TEST23-652-7D-2',
      scaleRows: 3,
    })

    renderPage('/provincial/application/upload')

    const file = new File(['<xml />'], 'submission.xml', { type: 'application/xml' })
    await userEvent.upload(screen.getByLabelText('Application submission file'), file)

    expect(await screen.findByText('Submission validated')).toBeInTheDocument()
    expect(screen.getByLabelText('Application submission file')).not.toBeDisabled()
    expect(screen.getByRole('button', { name: 'Review submission' })).toBeEnabled()

    await userEvent.click(screen.getByRole('button', { name: 'Cancel submission' }))

    expect(screen.queryByText('Submission validated')).not.toBeInTheDocument()
    expect(screen.queryByText('No application submissions selected')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Review submissions' })).toBeDisabled()
    expect(screen.getByLabelText('Application submission file')).not.toBeDisabled()
    expect(
      screen.queryByText(
        'Current application submissions are submitting or complete. Wait for the upload to finish before choosing more files.',
      ),
    ).not.toBeInTheDocument()
    expect(mockedSubmitAdminUpload).not.toHaveBeenCalled()
  })

  it('validates LEXIS XML content when the file extension does not identify the format', async () => {
    const user = userEvent.setup({ applyAccept: false })

    mockUploadAccess('uploadApplicationSubmission')
    mockedValidateApplicationSubmissionUpload.mockResolvedValue({
      message:
        'LEXIS application submission validated for package TEST23-652-7D-2 with 2 scale rows.',
      packageNumber: 'TEST23-652-7D-2',
      scaleRows: 2,
    })

    renderPage('/provincial/application/upload')

    const file = new File([XML_PREVIEW_FIXTURE], 'submission.dat', {
      type: 'application/octet-stream',
    })
    await user.upload(screen.getByLabelText('Application submission file'), file)

    await waitFor(() => {
      expect(mockedValidateApplicationSubmissionUpload).toHaveBeenCalledWith(
        expect.objectContaining({
          file,
        }),
      )
    })
    expect(screen.getAllByText('submission.dat').length).toBeGreaterThan(0)
    expect(screen.getByText('Submission validated')).toBeInTheDocument()
    expect(screen.getAllByText(/Package TEST23-652-7D-2/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/2 scale rows/).length).toBeGreaterThan(0)
    expect(mockedSubmitAdminUpload).not.toHaveBeenCalled()
  })

  it('shows structured XML warning details in the upload queue', async () => {
    mockUploadAccess('uploadApplicationSubmission')
    mockedValidateApplicationSubmissionUpload.mockResolvedValue({
      packageNumber: 'TEST23-652-7D-2',
      scaleRows: 3,
      warnings: ['Loaded payload/6-652-7.xml from ZIP archive submission.zip.'],
    })

    renderPage('/provincial/application/upload')

    const file = new File(['zip-data'], 'submission.zip', { type: 'application/zip' })
    await userEvent.upload(screen.getByLabelText('Application submission file'), file)

    expect(await screen.findByText('Submission validated')).toBeInTheDocument()
    expect(
      screen.getAllByText(/Loaded payload\/6-652-7.xml from ZIP archive submission.zip/).length,
    ).toBeGreaterThan(0)
    expect(mockedSubmitAdminUpload).not.toHaveBeenCalled()
  })

  it('previews safe structure from queued LEXIS XML files before submit', async () => {
    mockUploadAccess('uploadApplicationSubmission')
    mockedValidateApplicationSubmissionUpload.mockReturnValue(pendingValidation())

    renderPage('/provincial/application/upload')

    const file = new File([XML_PREVIEW_FIXTURE], 'submission.xml', { type: 'application/xml' })
    await userEvent.upload(screen.getByLabelText('Application submission file'), file)

    expect(
      (await screen.findAllByText('Preview: LEXIS XML structure detected, 2 scale rows.')).length,
    ).toBeGreaterThan(0)
  })

  it('previews safe structure from queued LEXIS GeoJSON files before submit', async () => {
    mockUploadAccess('uploadApplicationSubmission')
    mockedValidateApplicationSubmissionUpload.mockReturnValue(pendingValidation())

    renderPage('/provincial/application/upload')

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
    mockUploadAccess('uploadApplicationSubmission')
    mockedValidateApplicationSubmissionUpload.mockReturnValue(pendingValidation())

    renderPage('/provincial/application/upload')

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
    mockUploadAccess('uploadApplicationSubmission')
    mockedValidateApplicationSubmissionUpload.mockReturnValue(pendingValidation())

    renderPage('/provincial/application/upload')

    const file = new File(['zip-data'], 'submission.zip', { type: 'application/zip' })
    await userEvent.upload(screen.getByLabelText('Application submission file'), file)

    expect(
      (await screen.findAllByText('ZIP archive will be unpacked and validated on upload.')).length,
    ).toBeGreaterThan(0)
  })

  it('submits queued XML files one at a time', async () => {
    mockUploadAccess('uploadApplicationSubmission')
    mockedValidateApplicationSubmissionUpload
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
        message: 'First XML application submission created application 9001.',
      })
      .mockResolvedValueOnce({
        message: 'Second XML application submission created application 9002.',
      })

    renderPage('/provincial/application/upload')

    const firstFile = new File(['<xml />'], 'first.xml', { type: 'application/xml' })
    const secondFile = new File(['<xml />'], 'second.xml', { type: 'application/xml' })
    await userEvent.upload(screen.getByLabelText('Application submission file'), [
      firstFile,
      secondFile,
    ])

    await waitFor(() => {
      expect(mockedValidateApplicationSubmissionUpload).toHaveBeenCalledTimes(2)
    })
    expect(mockedSubmitAdminUpload).not.toHaveBeenCalled()
    expect(
      screen.getByText(
        '2 application submissions validated. Review the submission summary and submit submissions.',
      ),
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Review submissions' }))
    expect(screen.getByRole('heading', { name: 'Submission summary' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Submit submissions' }))

    await waitFor(() => {
      expect(mockedSubmitAdminUpload).toHaveBeenCalledTimes(2)
    })

    expect(mockedSubmitAdminUpload).toHaveBeenNthCalledWith(
      1,
      'applicationSubmission',
      expect.objectContaining({ file: firstFile }),
    )
    expect(mockedSubmitAdminUpload).toHaveBeenNthCalledWith(
      2,
      'applicationSubmission',
      expect.objectContaining({ file: secondFile }),
    )
    expect(
      screen.getByText(
        '2 application submissions created. Verify the created application and package details.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText('No application submissions selected')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Review submissions' })).toBeDisabled()
  })

  it('shows per-file review details for mixed XML upload results', async () => {
    mockUploadAccess('uploadApplicationSubmission')
    mockedValidateApplicationSubmissionUpload
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
        warnings: ['Loaded payload/first.xml from ZIP archive first.zip.'],
      })
      .mockRejectedValueOnce({
        response: {
          status: 422,
          data: {
            message: 'LEXIS application submission rejected.',
            errors: ['Line: 53 Column: 7: boomNumber is required.'],
          },
        },
      })

    renderPage('/provincial/application/upload')

    const firstFile = new File(['<xml />'], 'first.xml', { type: 'application/xml' })
    const secondFile = new File(['<xml />'], 'second.xml', { type: 'application/xml' })
    await userEvent.upload(screen.getByLabelText('Application submission file'), [
      firstFile,
      secondFile,
    ])

    await waitFor(() => {
      expect(mockedValidateApplicationSubmissionUpload).toHaveBeenCalledTimes(2)
    })

    await userEvent.click(screen.getByRole('button', { name: 'Review submissions' }))
    await userEvent.click(screen.getByRole('button', { name: 'Submit submissions' }))

    await waitFor(() => {
      expect(mockedSubmitAdminUpload).toHaveBeenCalledTimes(2)
    })

    expect(await screen.findByText('Submission review')).toBeInTheDocument()
    expect(
      screen.getByText('1 submission failed. Review the queue for details.'),
    ).toBeInTheDocument()
    expect(screen.getAllByText('first.xml').length).toBeGreaterThan(0)
    expect(screen.getAllByText('second.xml').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Application 9001/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Package TEST23-652-7D-2/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/3 scale rows/).length).toBeGreaterThan(0)
    expect(
      screen.getAllByText(/Loaded payload\/first.xml from ZIP archive first.zip/).length,
    ).toBeGreaterThan(0)
    expect(
      screen.getAllByText(/Line: 53 Column: 7: boomNumber is required/).length,
    ).toBeGreaterThan(0)
  })

  it('shows duplicate package conflict when submitted after another validated submission wins', async () => {
    mockUploadAccess('uploadApplicationSubmission')
    mockedValidateApplicationSubmissionUpload.mockResolvedValue({
      message:
        'LEXIS application submission validated for package TEST23-652-7D-2 with 3 scale rows.',
      packageNumber: 'TEST23-652-7D-2',
      scaleRows: 3,
    })
    mockedSubmitAdminUpload.mockRejectedValue({
      response: {
        status: 422,
        data: {
          message: 'LEXIS application submission rejected.',
          errors: ['Package TEST23-652-7D-2 already exists.'],
        },
      },
    })

    renderPage('/provincial/application/upload')

    const file = new File(['<xml />'], 'submission.xml', { type: 'application/xml' })
    await userEvent.upload(screen.getByLabelText('Application submission file'), file)

    await waitFor(() => {
      expect(mockedValidateApplicationSubmissionUpload).toHaveBeenCalledWith(
        expect.objectContaining({
          file,
        }),
      )
    })
    expect(screen.getByText('Submission validated')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Review submission' }))

    await userEvent.click(screen.getByRole('button', { name: 'Submit submission' }))

    await waitFor(() => {
      expect(mockedSubmitAdminUpload).toHaveBeenCalledWith(
        'applicationSubmission',
        expect.objectContaining({
          file,
        }),
      )
    })

    expect(
      screen.getByText('1 submission failed. Review the queue for details.'),
    ).toBeInTheDocument()
    expect(screen.getAllByText('Package TEST23-652-7D-2 already exists.').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Failed').length).toBeGreaterThan(0)
    expect(screen.queryByText('Application submission complete')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Open Application/ })).not.toBeInTheDocument()
  })

  it('shows server validation details for unsupported LEXIS submission files', async () => {
    const user = userEvent.setup({ applyAccept: false })

    mockUploadAccess('uploadApplicationSubmission')
    mockedValidateApplicationSubmissionUpload.mockRejectedValue({
      response: {
        status: 422,
        data: {
          message: 'LEXIS application submission rejected.',
          errors: [
            'The LEXIS application submission file must be an XML, GeoJSON, JSON, or ZIP file.',
          ],
        },
      },
    })

    renderPage('/provincial/application/upload')

    const file = new File(['not xml'], 'submission.pdf', { type: 'application/pdf' })
    await user.upload(screen.getByLabelText('Application submission file'), file)

    await waitFor(() => {
      expect(mockedValidateApplicationSubmissionUpload).toHaveBeenCalledWith(
        expect.objectContaining({
          file,
        }),
      )
    })
    expect(
      screen.getAllByText(
        'The LEXIS application submission file must be an XML, GeoJSON, JSON, or ZIP file.',
      ).length,
    ).toBeGreaterThan(0)
    expect(mockedSubmitAdminUpload).not.toHaveBeenCalled()
  })

  it('shows resolved validation rejection details for unsupported schema versions', async () => {
    mockUploadAccess('uploadApplicationSubmission')
    mockedValidateApplicationSubmissionUpload.mockResolvedValue({
      status: 'rejected',
      message: 'LEXIS application submission rejected.',
      errors: [
        'The XML schema location must use supported LEXIS schema version http://www.for.gov.bc.ca/schema/lexis/2/xsd/MOF/mof-lexis.xsd.',
      ],
    })

    renderPage('/provincial/application/upload')

    const file = new File(['<xml />'], '06-fail-unsupported-schema-version.xml', {
      type: 'application/xml',
    })
    await userEvent.upload(screen.getByLabelText('Application submission file'), file)

    await waitFor(() => {
      expect(mockedValidateApplicationSubmissionUpload).toHaveBeenCalledWith(
        expect.objectContaining({
          file,
        }),
      )
    })

    expect(screen.getAllByText('Failed').length).toBeGreaterThan(0)
    expect(
      screen.getAllByText(
        'The XML schema location must use supported LEXIS schema version http://www.for.gov.bc.ca/schema/lexis/2/xsd/MOF/mof-lexis.xsd.',
      ).length,
    ).toBeGreaterThan(0)
    expect(screen.queryByText('Submission validated')).not.toBeInTheDocument()
    expect(mockedSubmitAdminUpload).not.toHaveBeenCalled()
  })

  it('blocks document uploads without a file extension', async () => {
    mockUploadAccess('/filePermitUpload')

    renderPage('/admin/uploads?type=permit&permitNumber=5001')

    const file = new File(['permit upload'], 'permit', { type: 'application/pdf' })
    await userEvent.upload(screen.getByLabelText('Document File'), file)

    expect(screen.getAllByText('Invalid').length).toBeGreaterThan(0)
    expect(
      screen.getAllByText(
        'Document uploads need a file extension so LEXIS can resolve the file type.',
      ).length,
    ).toBeGreaterThan(0)

    expect(screen.getByText('1 selected file needs attention before review.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Review upload' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Submit upload' })).not.toBeInTheDocument()
    expect(mockedSubmitAdminUpload).not.toHaveBeenCalled()
  })

  it('blocks empty files before submit', async () => {
    mockUploadAccess('uploadApplicationSubmission')

    renderPage('/provincial/application/upload')

    const file = new File([], 'empty.xml', { type: 'application/xml' })
    await userEvent.upload(screen.getByLabelText('Application submission file'), file)

    expect(screen.getAllByText('Invalid').length).toBeGreaterThan(0)
    expect(screen.getAllByText('File is empty.').length).toBeGreaterThan(0)

    expect(screen.getByRole('button', { name: 'Review submission' })).toBeDisabled()
    expect(mockedSubmitAdminUpload).not.toHaveBeenCalled()
  })

  it('shows LEXIS XML validation rejection details from a 422 response', async () => {
    mockUploadAccess('uploadApplicationSubmission')
    mockedValidateApplicationSubmissionUpload.mockRejectedValue({
      response: {
        status: 422,
        data: {
          message: 'LEXIS application submission rejected.',
          errors: ['Package TEST23-652-7D-2 already exists.'],
        },
      },
    })

    renderPage('/provincial/application/upload')

    const file = new File(['<xml />'], 'submission.xml', { type: 'application/xml' })
    await userEvent.upload(screen.getByLabelText('Application submission file'), file)

    expect(await screen.findByText('Upload error')).toBeInTheDocument()
    expect(screen.getAllByText('Package TEST23-652-7D-2 already exists.').length).toBeGreaterThan(0)
    expect(mockedSubmitAdminUpload).not.toHaveBeenCalled()
  })

  it('opens LEXIS application submission as a locked application upload route', async () => {
    mockUploadAccess('uploadApplicationSubmission')

    renderPage('/provincial/application/upload')

    expect(
      screen.getByRole('heading', { name: 'Upload Application Submission' }),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('Upload type')).not.toBeInTheDocument()
    expect(screen.getByText('Upload application submissions')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Validation status' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Submission summary' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Review submissions' })).toBeDisabled()
    expect(screen.getByLabelText('Application submission file')).toBeInTheDocument()
    expect(screen.getByLabelText('User reference')).toBeInTheDocument()
  })
})
