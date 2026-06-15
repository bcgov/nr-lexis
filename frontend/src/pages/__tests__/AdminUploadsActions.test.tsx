import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import AdminUploadsPage from '@/pages/AdminUploads'
import { submitAdminUpload } from '@/service/admin-upload-service'

vi.mock('@/context/auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/service/admin-upload-service', () => ({
  submitAdminUpload: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)
const mockedSubmitAdminUpload = vi.mocked(submitAdminUpload)

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
  })

  it('submits permit upload with query-prefilled number', async () => {
    mockedUseAuth.mockReturnValue({
      canPerform: (action: string) => action === '/filePermitUpload',
    } as any)

    renderPage('/admin/uploads?type=permit&permitNumber=5001')

    expect(screen.getByLabelText('Permit Number')).toHaveValue('5001')
    expect(screen.getByText('Allowed')).toBeInTheDocument()

    const file = new File(['permit upload'], 'permit.pdf', { type: 'application/pdf' })
    await userEvent.upload(screen.getByLabelText('Document File'), file)
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
    expect(screen.getAllByText(/created application 9001/).length).toBeGreaterThan(0)
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
