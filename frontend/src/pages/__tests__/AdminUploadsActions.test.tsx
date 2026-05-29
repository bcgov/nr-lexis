import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import AdminUploadsPage from '@/pages/AdminUploads'
import {
  previewScaleXmlUpload,
  submitAdminUpload,
  submitScaleXmlUpload,
} from '@/service/admin-upload-service'

vi.mock('@/context/auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/service/admin-upload-service', () => ({
  previewScaleXmlUpload: vi.fn(),
  submitAdminUpload: vi.fn(),
  submitScaleXmlUpload: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)
const mockedSubmitAdminUpload = vi.mocked(submitAdminUpload)
const mockedPreviewScaleXmlUpload = vi.mocked(previewScaleXmlUpload)
const mockedSubmitScaleXmlUpload = vi.mocked(submitScaleXmlUpload)

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
    mockedSubmitAdminUpload.mockResolvedValue(undefined)
    mockedPreviewScaleXmlUpload.mockResolvedValue({
      fileName: 'scales.xml',
      totalRows: 1,
      validRows: 1,
      totalPieces: 12,
      totalVolume: 10.5,
      errors: [],
      warnings: [],
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
          permitNumber: 7000123,
          valid: true,
          errors: [],
          warnings: [],
        },
      ],
    })
    mockedSubmitScaleXmlUpload.mockResolvedValue({
      success: true,
      message: '1 scale row(s) saved successfully.',
      submittedRows: 1,
      permitNumber: 7000123,
      errors: [],
      warnings: [],
      rows: [],
    })
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

  it('previews and submits scale XML rows after user review', async () => {
    mockedUseAuth.mockReturnValue({
      canPerform: (action: string) => action === 'savePermit',
    } as any)

    renderPage('/admin/uploads?type=scaleXml&permitNumber=7000123&packageNumber=PKG-903')

    expect(screen.getByLabelText('Permit Number')).toHaveValue('7000123')
    expect(screen.getByLabelText('Package Number')).toHaveValue('PKG-903')

    const file = new File(['<scales />'], 'scales.xml', { type: 'application/xml' })
    await userEvent.upload(screen.getByLabelText('Scale XML File'), file)
    await userEvent.click(screen.getByRole('button', { name: 'Preview XML' }))

    await waitFor(() => {
      expect(mockedPreviewScaleXmlUpload).toHaveBeenCalledWith({
        permitNumber: '7000123',
        packageNumber: 'PKG-903',
        file,
      })
    })
    expect(screen.getByText('Hemlock')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Submit Reviewed Scales' }))
    await waitFor(() => {
      expect(mockedSubmitScaleXmlUpload).toHaveBeenCalledWith(
        expect.objectContaining({
          permitNumber: '7000123',
          rows: expect.arrayContaining([expect.objectContaining({ timberMark: 'TM1' })]),
        }),
      )
    })
    expect(screen.getByText('Upload Submitted')).toBeInTheDocument()
  })
})
