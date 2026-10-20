import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import AdminUploadsPage from '@/pages/AdminUploads'
import { submitAdminUpload } from '@/service/admin-upload-service'
import { searchProvincialExemptionNumberOptions } from '@/service/provincial-exemption-search-service'
import { searchProvincialApplicationNumberOptions } from '@/service/provincial-application-search-service'
import { searchProvincialPermitNumberOptions } from '@/service/provincial-permit-search-service'
import { createTestAuthContext } from '@/test-utils/auth'

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

const mockUploadAccess = (...allowedActions: string[]): void => {
  mockedUseAuth.mockReturnValue(
    createTestAuthContext({
      canPerform: (action: string) => allowedActions.includes(action),
    }),
  )
}

const renderPage = (path = '/admin/uploads?type=permit') => {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin/uploads" element={<AdminUploadsPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Admin upload workflow smoke', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedSubmitAdminUpload.mockResolvedValue({})
    mockedSearchProvincialApplicationNumberOptions.mockResolvedValue([])
    mockedSearchProvincialExemptionNumberOptions.mockResolvedValue([])
    mockedSearchProvincialPermitNumberOptions.mockResolvedValue([])
  })

  it('submits permit upload with query-prefilled number', async () => {
    mockUploadAccess('/filePermitUpload')

    renderPage('/admin/uploads?type=permit&permitNumber=5001')

    expect(screen.getByRole('combobox', { name: 'Permit number' })).toHaveValue('5001')
    expect(screen.getByRole('button', { name: 'Choose files for Upload documents' })).toBeVisible()
    expect(document.querySelector('.required-label__marker')).toBeNull()
    expect(screen.getByLabelText('Document File')).toHaveAttribute('aria-required', 'true')
    expect(
      screen.getByText(
        'Accepted file types: BMP, CSV, DOC, DOCX, JPG, PDF, PNG, RTF, TXT, XLS, XLSX, XML and ZIP. Maximum file size: 20 MB. Multiple files can be queued and saved together.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText(/US-ASCII|250 bytes/i)).not.toBeInTheDocument()

    const file = new File(['permit upload'], 'permit.pdf', { type: 'application/pdf' })
    await userEvent.upload(screen.getByLabelText('Document File'), file)
    expect(screen.getByRole('columnheader', { name: 'Target' })).toBeInTheDocument()
    expect(screen.getAllByText('Permit 5001').length).toBeGreaterThan(0)
    expect(screen.getByText(/PDF \| 13 B \| Added/)).toBeInTheDocument()
    await userEvent.type(
      screen.getByLabelText(/Document description for permit\.pdf/),
      ' Permit evidence ',
    )
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
    expect(screen.queryByText('Choose at least one file to upload.')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Document File')).not.toHaveAttribute('aria-invalid', 'true')
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

  it('rejects malformed application document targets without truncating them', async () => {
    mockUploadAccess('/fileApplicationUpload')
    mockedSearchProvincialApplicationNumberOptions.mockResolvedValue([])
    renderPage('/admin/uploads?type=application')

    const applicationNumberInput = screen.getByRole('combobox', {
      name: 'Application number',
    })
    await userEvent.type(applicationNumberInput, '45963x')
    await userEvent.tab()

    expect(applicationNumberInput).toHaveValue('45963x')
    expect(
      screen.getByText('Application number must be a positive whole number'),
    ).toBeInTheDocument()
    expect(mockedSubmitAdminUpload).not.toHaveBeenCalled()
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

  it('keeps the canonical exemption number when its search label is rendered', async () => {
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
      },
    ])

    renderPage('/admin/uploads?type=exemption')

    const exemptionNumberInput = screen.getByRole('combobox', {
      name: 'Exemption number',
    })
    await userEvent.type(exemptionNumberInput, 'EX-555')

    await waitFor(() => {
      expect(exemptionNumberInput).toHaveValue('EX-555 - Active - Owner 00001012 - Region RSC')
    })

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

  it('keeps the numeric permit value when the selected permit target label is rendered', async () => {
    mockUploadAccess('/filePermitUpload')
    const permitOption = {
      value: '7000123',
      label: '7000123 - Active - Owner 00001012 - Region RSC',
      status: 'Active' as const,
      applicantClientNumber: '00001012',
      ownerClientNumber: '00001012',
      totalVolume: 25,
      issueDate: '2026-06-10',
      region: 'RSC',
    }
    mockedSearchProvincialPermitNumberOptions.mockResolvedValue([permitOption])

    renderPage('/admin/uploads?type=permit')

    const permitNumberInput = screen.getByRole('combobox', {
      name: 'Permit number',
    })
    await userEvent.type(permitNumberInput, permitOption.value)
    await waitFor(() =>
      expect(mockedSearchProvincialPermitNumberOptions).toHaveBeenLastCalledWith(
        permitOption.value,
      ),
    )
    await waitFor(() => expect(permitNumberInput).toHaveValue(permitOption.label))
    await userEvent.tab()

    expect(
      screen.queryByText('Permit number must be a positive whole number'),
    ).not.toBeInTheDocument()
  })

  it('offers no invoice upload in Data upload', async () => {
    mockUploadAccess('/fileInvoiceUpload')

    renderPage(
      '/admin/uploads?type=invoice&permitNumber=5001&salesInvoiceNumber=INV001&invoiceExportValue=100',
    )

    expect(screen.getByRole('heading', { name: 'Application upload' })).toBeInTheDocument()
    for (const label of [
      'Invoice number',
      'Export value (CAD)',
      'Conversion rate',
      'Fee in lieu',
    ]) {
      expect(screen.queryByLabelText(label)).not.toBeInTheDocument()
    }

    const uploadType = screen.getByRole('combobox', { name: 'Upload type' })
    await userEvent.click(uploadType)
    const listboxId = uploadType.getAttribute('aria-controls')
    const listbox = listboxId ? document.getElementById(listboxId) : null
    expect(listbox).not.toBeNull()
    expect(
      within(listbox as HTMLElement)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Application upload', 'Exemption upload', 'Permit upload'])
  })

  it('keeps the review area collapsed before files are selected', () => {
    mockUploadAccess('/filePermitUpload')

    renderPage('/admin/uploads?type=permit&permitNumber=5001')

    expect(screen.queryByLabelText('Upload batch summary')).not.toBeInTheDocument()
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

  it('filters and submits multiple documents with independent descriptions', async () => {
    mockUploadAccess('/filePermitUpload')

    renderPage(
      '/admin/uploads?type=permit&permitNumber=5001&fileDescription=Shared%20query%20description',
    )

    const permitDocument = new File(['permit upload'], 'permit.pdf', { type: 'application/pdf' })
    const scaleDocument = new File(['scale upload'], 'scale.csv', { type: 'text/csv' })
    await userEvent.upload(screen.getByLabelText('Document File'), [permitDocument, scaleDocument])
    expect(screen.getByLabelText(/Document description for permit\.pdf/)).toHaveValue('')
    expect(screen.getByLabelText(/Document description for scale\.csv/)).toHaveValue('')
    await userEvent.type(
      screen.getByLabelText(/Document description for permit\.pdf/),
      ' Permit evidence ',
    )
    await userEvent.type(
      screen.getByLabelText(/Document description for scale\.csv/),
      'Scale evidence',
    )

    expect(screen.getAllByText('permit.pdf').length).toBeGreaterThan(0)
    expect(screen.getAllByText('scale.csv').length).toBeGreaterThan(0)
    const queuedFilesTable = screen.getByRole('table', { name: 'Queued files' })
    for (const header of within(queuedFilesTable).getAllByRole('columnheader')) {
      expect(header).toHaveAttribute('scope', 'col')
    }
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
    await userEvent.clear(screen.getByLabelText('Filter queued files'))
    await userEvent.click(screen.getByRole('button', { name: 'Submit upload' }))
    await waitFor(() => expect(mockedSubmitAdminUpload).toHaveBeenCalledTimes(2))
    expect(mockedSubmitAdminUpload).toHaveBeenNthCalledWith(
      1,
      'permit',
      expect.objectContaining({ file: permitDocument, fileDescription: 'Permit evidence' }),
    )
    expect(mockedSubmitAdminUpload).toHaveBeenNthCalledWith(
      2,
      'permit',
      expect.objectContaining({ file: scaleDocument, fileDescription: 'Scale evidence' }),
    )
  })

  it('validates each document description and retains a corrected value through review', async () => {
    mockUploadAccess('/filePermitUpload')

    renderPage('/admin/uploads?type=permit&permitNumber=5001')

    const file = new File(['permit upload'], 'permit.pdf', { type: 'application/pdf' })
    await userEvent.upload(screen.getByLabelText('Document File'), file)

    const descriptionInput = screen.getByLabelText(/Document description for permit\.pdf/)
    fireEvent.change(descriptionInput, { target: { value: 'x'.repeat(251) } })
    expect(screen.getByText('Document description must be 250 characters or fewer')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Review upload' })).toBeDisabled()

    await userEvent.clear(descriptionInput)
    await userEvent.type(descriptionInput, ' Corrected description ')
    expect(screen.getByRole('button', { name: 'Review upload' })).toBeEnabled()

    await userEvent.click(screen.getByRole('button', { name: 'Review upload' }))
    expect(screen.getByLabelText(/Document description for permit\.pdf/)).toHaveValue(
      ' Corrected description ',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Submit upload' }))

    await waitFor(() => {
      expect(mockedSubmitAdminUpload).toHaveBeenCalledWith(
        'permit',
        expect.objectContaining({ file, fileDescription: 'Corrected description' }),
      )
    })
  })

  it('locks completed file descriptions while allowing a failed file to be corrected and retried', async () => {
    mockUploadAccess('/filePermitUpload')
    mockedSubmitAdminUpload
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('Upload failed'))
    renderPage('/admin/uploads?type=permit&permitNumber=5001')
    const first = new File(['first'], 'first.pdf', { type: 'application/pdf' })
    const second = new File(['second'], 'second.pdf', { type: 'application/pdf' })
    await userEvent.upload(screen.getByLabelText('Document File'), [first, second])
    await userEvent.type(screen.getByLabelText(/Document description for first.pdf/), 'First')
    await userEvent.type(screen.getByLabelText(/Document description for second.pdf/), 'Second')
    await userEvent.click(screen.getByRole('button', { name: 'Review upload' }))
    await userEvent.click(screen.getByRole('button', { name: 'Submit upload' }))
    await waitFor(() =>
      expect(screen.getByLabelText(/Document description for second.pdf/)).toBeEnabled(),
    )
    expect(screen.getByLabelText(/Document description for first.pdf/)).toBeDisabled()
    expect(screen.getByLabelText(/Document description for first.pdf/)).toHaveValue('First')
    await userEvent.clear(screen.getByLabelText(/Document description for second.pdf/))
    await userEvent.type(
      screen.getByLabelText(/Document description for second.pdf/),
      'Corrected second',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByRole('button', { name: 'Review upload' })).toBeEnabled()
    expect(screen.getByLabelText(/Document description for second.pdf/)).toHaveValue(
      'Corrected second',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Review upload' }))
    await userEvent.click(screen.getByRole('button', { name: 'Submit upload' }))
    await waitFor(() => expect(mockedSubmitAdminUpload).toHaveBeenCalledTimes(3))
    expect(mockedSubmitAdminUpload).toHaveBeenLastCalledWith(
      'permit',
      expect.objectContaining({ file: second, fileDescription: 'Corrected second' }),
    )
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

    await userEvent.type(
      screen.getByLabelText(/Document description for permit\.pdf/),
      'Permit evidence',
    )
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

  it('keeps review and submit disabled until the document target is valid', async () => {
    mockUploadAccess('/filePermitUpload')

    renderPage('/admin/uploads?type=permit')

    const file = new File(['permit upload'], 'permit.pdf', { type: 'application/pdf' })
    await userEvent.upload(screen.getByLabelText('Document File'), file)
    expect(screen.getByRole('button', { name: 'Review upload' })).toBeDisabled()
    expect(screen.getByText('Permit number is required')).toBeVisible()

    await userEvent.type(screen.getByRole('combobox', { name: 'Permit number' }), '5001')
    expect(screen.getByRole('button', { name: 'Review upload' })).toBeEnabled()
    await userEvent.click(screen.getByRole('button', { name: 'Review upload' }))
    expect(screen.getByRole('button', { name: 'Submit upload' })).toBeEnabled()

    await userEvent.clear(screen.getByRole('combobox', { name: 'Permit number' }))
    expect(screen.getByRole('button', { name: 'Submit upload' })).toBeDisabled()
    expect(screen.getByText('Permit number is required')).toBeVisible()
    await userEvent.type(screen.getByRole('combobox', { name: 'Permit number' }), 'invalid')
    expect(screen.getByRole('button', { name: 'Submit upload' })).toBeDisabled()
    expect(screen.getByText('Permit number must be a positive whole number')).toBeVisible()

    expect(mockedSubmitAdminUpload).not.toHaveBeenCalled()

    await userEvent.clear(screen.getByRole('combobox', { name: 'Permit number' }))
    await userEvent.type(screen.getByRole('combobox', { name: 'Permit number' }), '5002')
    expect(screen.getByRole('button', { name: 'Submit upload' })).toBeEnabled()
    await userEvent.click(screen.getByRole('button', { name: 'Submit upload' }))
    await waitFor(() =>
      expect(mockedSubmitAdminUpload).toHaveBeenCalledWith(
        'permit',
        expect.objectContaining({ permitNumber: '5002', file }),
      ),
    )
  })

  it('rejects malformed permit document targets without truncating them', async () => {
    mockUploadAccess('/filePermitUpload')
    renderPage('/admin/uploads?type=permit')

    const permitNumberInput = screen.getByRole('combobox', { name: 'Permit number' })
    await userEvent.type(permitNumberInput, '5001abc')
    await userEvent.tab()

    expect(permitNumberInput).toHaveValue('5001abc')
    expect(screen.getByText('Permit number must be a positive whole number')).toBeInTheDocument()
    expect(mockedSubmitAdminUpload).not.toHaveBeenCalled()
  })

  it('rejects permit document targets that exceed the Oracle number boundary', async () => {
    mockUploadAccess('/filePermitUpload')
    renderPage('/admin/uploads?type=permit')

    const permitNumberInput = screen.getByRole('combobox', { name: 'Permit number' })
    await userEvent.type(permitNumberInput, '12345678901')
    await userEvent.tab()

    expect(permitNumberInput).toHaveValue('12345678901')
    expect(screen.getByText('Permit number must be 10 digits or fewer')).toBeInTheDocument()
    expect(mockedSubmitAdminUpload).not.toHaveBeenCalled()
  })

  it('locks document targets and the whole queue while a batch is submitting', async () => {
    mockUploadAccess('/filePermitUpload')
    let completeFirstUpload!: () => void
    mockedSubmitAdminUpload.mockReturnValueOnce(
      new Promise((resolve) => {
        completeFirstUpload = () => resolve({})
      }),
    )
    renderPage('/admin/uploads?type=permit&permitNumber=5001')
    const first = new File(['first'], 'first.pdf', { type: 'application/pdf' })
    const second = new File(['second'], 'second.pdf', { type: 'application/pdf' })
    await userEvent.upload(screen.getByLabelText('Document File'), [first, second])
    await userEvent.click(screen.getByRole('button', { name: 'Review upload' }))
    await userEvent.click(screen.getByRole('button', { name: 'Submit upload' }))

    try {
      expect(screen.getByRole('combobox', { name: 'Upload type' })).toBeDisabled()
      expect(screen.getByRole('combobox', { name: 'Permit number' })).toBeDisabled()
      expect(screen.getByLabelText('Document File')).toBeDisabled()
      const queue = screen.getByRole('table', { name: 'Queued files' })
      for (const button of within(queue).getAllByRole('button', { name: 'Remove' })) {
        expect(button).toBeDisabled()
      }
      expect(screen.getByLabelText(/Document description for second.pdf/)).toBeDisabled()
      expect(mockedSubmitAdminUpload).toHaveBeenCalledTimes(1)
    } finally {
      await act(async () => completeFirstUpload())
    }

    await waitFor(() => expect(mockedSubmitAdminUpload).toHaveBeenCalledTimes(2))
    expect(mockedSubmitAdminUpload).toHaveBeenLastCalledWith(
      'permit',
      expect.objectContaining({ permitNumber: '5001', file: second }),
    )
    expect(screen.getByRole('combobox', { name: 'Permit number' })).toBeEnabled()
    expect(screen.getByLabelText('Document File')).toBeEnabled()
  })

  it('blocks document uploads without a file extension', async () => {
    mockUploadAccess('/filePermitUpload')
    const user = userEvent.setup({ applyAccept: false })

    renderPage('/admin/uploads?type=permit&permitNumber=5001')

    const file = new File(['permit upload'], 'permit', { type: 'application/pdf' })
    await user.upload(screen.getByLabelText('Document File'), file)

    expect(screen.getAllByText('Invalid').length).toBeGreaterThan(0)
    expect(
      screen.getAllByText(
        'File type is not supported. Choose BMP, CSV, DOC, DOCX, JPG, PDF, PNG, RTF, TXT, XLS, XLSX, XML, or ZIP.',
      ).length,
    ).toBeGreaterThan(0)

    expect(screen.getByText('1 selected file needs attention before review.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Review upload' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Submit upload' })).not.toBeInTheDocument()
    expect(mockedSubmitAdminUpload).not.toHaveBeenCalled()
  })
})
