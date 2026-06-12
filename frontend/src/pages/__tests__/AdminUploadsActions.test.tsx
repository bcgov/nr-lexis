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
    expect(screen.getByText('/fileInvoiceUpload')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Submit Upload' })).toBeDisabled()
  })

  it('shows field validation for missing permit upload inputs', async () => {
    mockedUseAuth.mockReturnValue({
      canPerform: (action: string) => action === '/filePermitUpload',
    } as any)

    renderPage('/admin/uploads?type=permit')

    await userEvent.click(screen.getByRole('button', { name: 'Submit Upload' }))

    expect(screen.getByText('Permit number is required.')).toBeInTheDocument()
    expect(screen.getByText('Choose a file to upload.')).toBeInTheDocument()
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
    expect(screen.getByText('createApplication')).toBeInTheDocument()
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
    expect(screen.getByText(/created application 9001/)).toBeInTheDocument()
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
