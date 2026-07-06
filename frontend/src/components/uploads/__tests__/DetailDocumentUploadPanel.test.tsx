import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DetailDocumentUploadPanel from '../DetailDocumentUploadPanel'
import { submitAdminUpload } from '@/service/admin-upload-service'

vi.mock('@/service/admin-upload-service', () => ({
  submitAdminUpload: vi.fn(),
}))

const mockedSubmitAdminUpload = vi.mocked(submitAdminUpload)

describe('DetailDocumentUploadPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('disables file selection when upload access is not available', () => {
    render(
      <DetailDocumentUploadPanel
        workflowType="application"
        targetNumber="321"
        inputId="applicationDocuments"
        disabled
        disabledReason="Upload access is read only."
      />,
    )

    expect(screen.getByLabelText('Document File')).toBeDisabled()
    expect(screen.getByText('Browse files')).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByText('Upload access is read only.')).toBeInTheDocument()
    const workflowProgress = screen.getByRole('list', { name: 'Upload queue workflow progress' })
    expect(
      within(workflowProgress).getByText('1. Upload').closest('[role="listitem"]'),
    ).toHaveAttribute('aria-current', 'step')
    expect(screen.getByRole('button', { name: 'Save upload' })).toBeDisabled()
  })

  it('shows a visible refresh error after a successful upload when refresh fails', async () => {
    const refreshDocuments = vi.fn().mockRejectedValue(new Error('refresh failed'))
    const file = new File(['document upload'], 'application-document.pdf', {
      type: 'application/pdf',
    })
    mockedSubmitAdminUpload.mockResolvedValue({
      status: 'success',
      message: 'Application document upload submitted.',
    })

    render(
      <DetailDocumentUploadPanel
        workflowType="application"
        targetNumber="321"
        inputId="applicationDocuments"
        onUploadComplete={refreshDocuments}
      />,
    )

    await userEvent.upload(screen.getByLabelText('Document File'), file)
    await userEvent.click(screen.getByRole('button', { name: 'Save upload' }))

    await waitFor(() => {
      expect(mockedSubmitAdminUpload).toHaveBeenCalledWith(
        'application',
        expect.objectContaining({
          applicationNumber: '321',
          file,
        }),
      )
    })
    await waitFor(() => {
      expect(refreshDocuments).toHaveBeenCalledTimes(1)
    })

    expect(await screen.findByText('Upload error')).toBeInTheDocument()
    expect(
      screen.getByText('Documents uploaded, but the document list could not refresh.'),
    ).toBeInTheDocument()
  })

  it('replaces selected documents with the same file name before saving', async () => {
    const firstFile = new File(['first document upload'], 'application-document.pdf', {
      type: 'application/pdf',
    })
    const replacementFile = new File(['replacement document upload'], 'application-document.pdf', {
      type: 'application/pdf',
    })
    mockedSubmitAdminUpload.mockResolvedValue({
      status: 'success',
      message: 'Application document upload submitted.',
    })

    render(
      <DetailDocumentUploadPanel
        workflowType="application"
        targetNumber="321"
        inputId="applicationDocuments"
      />,
    )

    await userEvent.upload(screen.getByLabelText('Document File'), firstFile)
    await userEvent.upload(screen.getByLabelText('Document File'), replacementFile)

    expect(screen.getByText('Showing 1 of 1 file')).toBeInTheDocument()
    const workflowProgress = screen.getByRole('list', { name: 'Upload queue workflow progress' })
    expect(
      within(workflowProgress).getByText('2. Review').closest('[role="listitem"]'),
    ).toHaveAttribute('aria-current', 'step')
    expect(screen.getAllByText('Validated').length).toBeGreaterThan(0)

    await userEvent.click(screen.getByRole('button', { name: 'Save upload' }))

    await waitFor(() => {
      expect(mockedSubmitAdminUpload).toHaveBeenCalledWith(
        'application',
        expect.objectContaining({
          applicationNumber: '321',
          file: replacementFile,
        }),
      )
    })
    expect(mockedSubmitAdminUpload).toHaveBeenCalledTimes(1)
  })

  it('shows plain-language backend upload errors in the queue', async () => {
    const file = new File(['oversized document upload'], 'oversized-application-document.pdf', {
      type: 'application/pdf',
    })
    mockedSubmitAdminUpload.mockRejectedValue({
      response: {
        status: 413,
        data: {
          message: 'The selected file is too large. Choose a smaller file and try again.',
          errors: ['The selected file is too large. Choose a smaller file and try again.'],
        },
      },
    })

    render(
      <DetailDocumentUploadPanel
        workflowType="application"
        targetNumber="321"
        inputId="applicationDocuments"
      />,
    )

    await userEvent.upload(screen.getByLabelText('Document File'), file)
    await userEvent.click(screen.getByRole('button', { name: 'Save upload' }))

    expect(await screen.findByText('Upload error')).toBeInTheDocument()
    expect(screen.getByText('1 file failed. Review the queue for details.')).toBeInTheDocument()
    expect(
      screen.getAllByText(
        'The selected file is too large. Choose a smaller file and try again.',
      )[0],
    ).toBeInTheDocument()
  })
})
