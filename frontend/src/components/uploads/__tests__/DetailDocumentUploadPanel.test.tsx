import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DetailDocumentUploadPanel from '../DetailDocumentUploadPanel'
import { submitAdminUpload, validateAdminUpload } from '@/service/admin-upload-service'

vi.mock('@/service/admin-upload-service', () => ({
  submitAdminUpload: vi.fn(),
  validateAdminUpload: vi.fn(),
}))

const mockedSubmitAdminUpload = vi.mocked(submitAdminUpload)
const mockedValidateAdminUpload = vi.mocked(validateAdminUpload)

const openUploadModal = async (label = 'Add document'): Promise<void> => {
  await userEvent.click(screen.getByRole('button', { name: label }))
}

describe('DetailDocumentUploadPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedValidateAdminUpload.mockResolvedValue({
      status: 'validated',
      message: 'File passed validation and virus scanning.',
    })
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

    expect(screen.getByRole('button', { name: 'Add document' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Add document' })).toHaveAttribute(
      'title',
      'Upload access is read only.',
    )
    expect(screen.queryByLabelText('Document File')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Add document' })).not.toBeInTheDocument()
  })

  it('uses a modal and discards staged files when cancelled', async () => {
    const file = new File(['document upload'], 'application-document.pdf', {
      type: 'application/pdf',
    })
    render(
      <DetailDocumentUploadPanel
        workflowType="application"
        targetNumber="321"
        inputId="applicationDocuments"
      />,
    )

    expect(screen.queryByLabelText(/Document description/)).not.toBeInTheDocument()
    await openUploadModal()
    const dialog = screen.getByRole('dialog', { name: 'Add document' })
    expect(dialog).toBeInTheDocument()
    expect(dialog.querySelector('.required-label__marker')).toBeNull()
    expect(screen.getByLabelText('Document File')).toHaveAttribute('aria-required', 'true')
    expect(screen.queryByText(/US-ASCII|250 bytes/i)).not.toBeInTheDocument()

    await userEvent.upload(screen.getByLabelText('Document File'), file)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Remove' })).toBeEnabled())
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog', { name: 'Add document' })).not.toBeInTheDocument()
    await openUploadModal()
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument()
    expect(screen.getByLabelText(/Document description/)).toHaveValue('')
  })

  it('keeps Review upload enabled and shows the required file error on click', async () => {
    render(
      <DetailDocumentUploadPanel
        workflowType="application"
        targetNumber="321"
        inputId="applicationDocuments"
      />,
    )

    await openUploadModal()
    const reviewButton = screen.getByRole('button', { name: 'Review upload' })
    expect(reviewButton).toBeEnabled()

    await userEvent.click(reviewButton)

    expect(screen.getAllByText('Choose at least one file to upload.').length).toBeGreaterThan(0)
    expect(screen.getByRole('dialog', { name: 'Add document' })).toBeInTheDocument()
    expect(mockedValidateAdminUpload).not.toHaveBeenCalled()
    expect(mockedSubmitAdminUpload).not.toHaveBeenCalled()
  })

  it('does not focus the close button when the upload modal opens', async () => {
    render(
      <DetailDocumentUploadPanel
        workflowType="application"
        targetNumber="321"
        inputId="applicationDocuments"
      />,
    )

    await openUploadModal()

    await waitFor(() => {
      expect(document.getElementById('applicationDocumentsUploadModalContent')).toHaveFocus()
    })
    expect(screen.getByRole('button', { name: 'Close' })).not.toHaveFocus()
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

    await openUploadModal()
    await userEvent.upload(screen.getByLabelText('Document File'), file)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Review upload' })).toBeEnabled()
    })
    await userEvent.click(screen.getByRole('button', { name: 'Review upload' }))
    await userEvent.click(screen.getByRole('button', { name: 'Submit upload' }))

    expect(mockedValidateAdminUpload).toHaveBeenCalledWith(
      'application',
      expect.objectContaining({
        applicationNumber: '321',
        file,
      }),
    )
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

  it('replaces selected documents with the same file name before submitting', async () => {
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

    await openUploadModal()
    await userEvent.upload(screen.getByLabelText('Document File'), firstFile)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Review upload' })).toBeEnabled()
    })
    await userEvent.click(screen.getByRole('button', { name: 'Review upload' }))
    expect(screen.getByRole('heading', { name: 'File review' })).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Upload type' })).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Choose files for Add more documents' }),
    ).toBeVisible()
    expect(screen.getByLabelText('Document File')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Submit upload' })).toBeEnabled()

    await userEvent.upload(screen.getByLabelText('Document File'), replacementFile)

    expect(screen.getByRole('heading', { name: 'File review' })).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Submit upload' })).toBeEnabled()
    })
    expect(screen.getAllByText('Validated').length).toBeGreaterThan(0)

    await userEvent.click(screen.getByRole('button', { name: 'Submit upload' }))

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
    mockedValidateAdminUpload.mockResolvedValue({
      status: 'validated',
      message: 'File passed validation and virus scanning.',
    })

    render(
      <DetailDocumentUploadPanel
        workflowType="application"
        targetNumber="321"
        inputId="applicationDocuments"
      />,
    )

    await openUploadModal()
    await userEvent.upload(screen.getByLabelText('Document File'), file)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Review upload' })).toBeEnabled()
    })
    await userEvent.click(screen.getByRole('button', { name: 'Review upload' }))
    await userEvent.click(screen.getByRole('button', { name: 'Submit upload' }))

    expect(await screen.findByText('Upload error')).toBeInTheDocument()
    expect(screen.getByText('1 file failed. Review the queue for details.')).toBeInTheDocument()
    expect(
      screen.getAllByText(
        'The selected file is too large. Choose a smaller file and try again.',
      )[0],
    ).toBeInTheDocument()
  })

  it('runs document validation automatically before review', async () => {
    const file = new File(['infected document upload'], 'eicar-application-upload.pdf', {
      type: 'application/pdf',
    })
    mockedValidateAdminUpload.mockRejectedValue({
      response: {
        status: 422,
        data: {
          message: 'The uploaded file failed virus scanning.',
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

    await openUploadModal()
    await userEvent.upload(screen.getByLabelText('Document File'), file)

    await waitFor(() => {
      expect(mockedValidateAdminUpload).toHaveBeenCalledWith(
        'application',
        expect.objectContaining({
          applicationNumber: '321',
          file,
        }),
      )
    })
    expect(await screen.findByText('Upload error')).toBeInTheDocument()
    expect(
      screen.getByText('1 file failed validation. Review the queue for details.'),
    ).toBeInTheDocument()
    expect(screen.getAllByText('Failed').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Review upload' })).toBeEnabled()
    await userEvent.click(screen.getByRole('button', { name: 'Review upload' }))
    expect(screen.getByText('1 queued file needs attention before review.')).toBeInTheDocument()
    expect(mockedSubmitAdminUpload).not.toHaveBeenCalled()
  })

  it('clears the queue attention error and shows the empty queue error after removing the last invalid file', async () => {
    const file = new File(['infected document upload'], 'eicar-application-upload.pdf', {
      type: 'application/pdf',
    })
    mockedValidateAdminUpload.mockRejectedValue({
      response: {
        status: 422,
        data: {
          message: 'The uploaded file failed virus scanning.',
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

    await openUploadModal()
    await userEvent.upload(screen.getByLabelText('Document File'), file)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Review upload' })).toBeEnabled())
    await userEvent.click(screen.getByRole('button', { name: 'Review upload' }))
    expect(screen.getByText('1 queued file needs attention before review.')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Remove' }))

    expect(
      screen.queryByText('1 queued file needs attention before review.'),
    ).not.toBeInTheDocument()
    expect(screen.getByText('Choose at least one file to upload.')).toBeInTheDocument()
  })

  it('allows review after removing an invalid file from a mixed queue', async () => {
    const invalidFile = new File(['infected document upload'], 'eicar-application-upload.pdf', {
      type: 'application/pdf',
    })
    const validFile = new File(['valid document upload'], 'valid-application-upload.pdf', {
      type: 'application/pdf',
    })
    mockedValidateAdminUpload
      .mockRejectedValueOnce({
        response: {
          status: 422,
          data: {
            message: 'The uploaded file failed virus scanning.',
          },
        },
      })
      .mockResolvedValueOnce({
        status: 'validated',
        message: 'File passed validation and virus scanning.',
      })

    render(
      <DetailDocumentUploadPanel
        workflowType="application"
        targetNumber="321"
        inputId="applicationDocuments"
      />,
    )

    await openUploadModal()
    await userEvent.upload(screen.getByLabelText('Document File'), [invalidFile, validFile])
    await waitFor(() => expect(mockedValidateAdminUpload).toHaveBeenCalledTimes(2))
    expect(
      screen.getByText('1 file failed validation. Review the queue for details.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('1 queued file needs attention and will be excluded from review.'),
    ).toBeInTheDocument()

    const invalidRow = screen.getByText(invalidFile.name).closest('tr')
    expect(invalidRow).toBeTruthy()
    await userEvent.click(within(invalidRow as HTMLElement).getByRole('button', { name: 'Remove' }))

    expect(
      screen.queryByText('1 queued file needs attention and will be excluded from review.'),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText('1 file failed validation. Review the queue for details.'),
    ).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Review upload' }))
    expect(screen.getByRole('heading', { name: 'File review' })).toBeInTheDocument()
    expect(screen.getAllByText(validFile.name).length).toBeGreaterThan(0)
    expect(screen.queryByText(invalidFile.name)).not.toBeInTheDocument()
  })

  it('clears queue validation messages when cancelling a queued upload', async () => {
    const file = new File(['infected document upload'], 'eicar-application-upload.pdf', {
      type: 'application/pdf',
    })
    mockedValidateAdminUpload.mockRejectedValue({
      response: {
        status: 422,
        data: {
          message: 'The uploaded file failed virus scanning.',
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

    await openUploadModal()
    await userEvent.upload(screen.getByLabelText('Document File'), file)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Review upload' })).toBeEnabled())
    await userEvent.click(screen.getByRole('button', { name: 'Review upload' }))
    expect(screen.getByText('1 queued file needs attention before review.')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await openUploadModal()

    expect(
      screen.queryByText('1 queued file needs attention before review.'),
    ).not.toBeInTheDocument()
    expect(screen.queryByText('Choose at least one file to upload.')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument()
  })

  it('allows review and submit when at least one selected document validates', async () => {
    const infectedFile = new File(['infected document upload'], 'eicar-application-upload.pdf', {
      type: 'application/pdf',
    })
    const validFile = new File(['valid document upload'], 'valid-application-upload.pdf', {
      type: 'application/pdf',
    })
    mockedValidateAdminUpload
      .mockRejectedValueOnce({
        response: {
          status: 422,
          data: {
            message: 'The uploaded file failed virus scanning.',
          },
        },
      })
      .mockResolvedValueOnce({
        status: 'validated',
        message: 'File passed validation and virus scanning.',
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

    await openUploadModal()
    await userEvent.upload(screen.getByLabelText('Document File'), [infectedFile, validFile])

    await waitFor(() => {
      expect(mockedValidateAdminUpload).toHaveBeenCalledTimes(2)
    })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Review upload' })).toBeEnabled()
    })
    expect(
      screen.getByText('1 queued file needs attention and will be excluded from review.'),
    ).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Review upload' }))

    expect(screen.getByRole('heading', { name: 'File review' })).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Upload type' })).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Choose files for Add more documents' }),
    ).toBeVisible()
    expect(screen.getByLabelText('Document File')).toBeInTheDocument()
    expect(screen.getAllByText('valid-application-upload.pdf').length).toBeGreaterThan(0)
    expect(screen.queryByText('eicar-application-upload.pdf')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Submit upload' }))

    await waitFor(() => {
      expect(mockedSubmitAdminUpload).toHaveBeenCalledWith(
        'application',
        expect.objectContaining({
          applicationNumber: '321',
          file: validFile,
        }),
      )
    })
    expect(mockedSubmitAdminUpload).toHaveBeenCalledTimes(1)
  })

  it('reports queued-upload dirty and submission busy state to its parent', async () => {
    let resolveSubmit: ((result: { status: string; message: string }) => void) | undefined
    mockedSubmitAdminUpload.mockReturnValue(
      new Promise((resolve) => {
        resolveSubmit = resolve
      }),
    )
    const onDirtyChange = vi.fn()
    const onBusyChange = vi.fn()
    const file = new File(['document upload'], 'queued-document.pdf', {
      type: 'application/pdf',
    })

    render(
      <DetailDocumentUploadPanel
        workflowType="application"
        targetNumber="321"
        inputId="applicationDocuments"
        onDirtyChange={onDirtyChange}
        onBusyChange={onBusyChange}
      />,
    )

    expect(onDirtyChange).toHaveBeenLastCalledWith(false)
    expect(onBusyChange).toHaveBeenLastCalledWith(false)
    await openUploadModal()
    await userEvent.upload(screen.getByLabelText('Document File'), file)
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(true))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Review upload' })).toBeEnabled())
    await userEvent.click(screen.getByRole('button', { name: 'Review upload' }))
    await userEvent.click(screen.getByRole('button', { name: 'Submit upload' }))
    await waitFor(() => expect(onBusyChange).toHaveBeenLastCalledWith(true))

    await act(async () => {
      resolveSubmit?.({
        status: 'success',
        message: 'Application document upload submitted.',
      })
    })

    await waitFor(() => expect(onBusyChange).toHaveBeenLastCalledWith(false))
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(false))
  })

  it('returns invoice conversion-rate dirty state to its displayed baseline', async () => {
    const onDirtyChange = vi.fn()
    render(
      <DetailDocumentUploadPanel
        workflowType="invoice"
        targetNumber="777"
        inputId="invoiceDocuments"
        initialInvoiceConversionRate="1.25"
        onDirtyChange={onDirtyChange}
      />,
    )

    await openUploadModal('Add invoice')
    expect(
      screen.getByRole('dialog', { name: 'Add invoice' }).querySelector('.required-label__marker'),
    ).toBeNull()
    const conversionRate = screen.getByLabelText('Upload invoice conversion rate')
    expect(conversionRate).toHaveValue('1.25')
    expect(onDirtyChange).toHaveBeenLastCalledWith(false)
    await userEvent.clear(conversionRate)
    await userEvent.type(conversionRate, '1.30')
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(true))
    await userEvent.clear(conversionRate)
    await userEvent.type(conversionRate, '1.25')
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(false))
  })

  it('blocks invoice review when values cannot fit Oracle storage', async () => {
    const file = new File(['invoice upload'], 'invoice.pdf', { type: 'application/pdf' })
    render(
      <DetailDocumentUploadPanel
        workflowType="invoice"
        targetNumber="777"
        inputId="invoiceDocuments"
      />,
    )

    await openUploadModal('Add invoice')
    await userEvent.type(screen.getByLabelText('Upload invoice number'), 'é'.repeat(9))
    await userEvent.type(screen.getByLabelText('Upload invoice export value'), '10000000')
    await userEvent.clear(screen.getByLabelText('Upload invoice conversion rate'))
    await userEvent.type(screen.getByLabelText('Upload invoice conversion rate'), '10')
    await userEvent.clear(screen.getByLabelText('Upload invoice fee in lieu'))
    await userEvent.type(screen.getByLabelText('Upload invoice fee in lieu'), '10000000')
    await userEvent.upload(screen.getByLabelText('Document File'), file)

    expect(
      screen.getByText(
        'Invoice number contains unsupported characters. Use unaccented letters, numbers, spaces, or standard punctuation.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Invoice export value must round to 9999999.99 or less.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Invoice conversion rate must round to 9.99999 or less.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Invoice fee in lieu must round to 9999999.99 or less.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Review upload' })).toBeEnabled()
    await userEvent.click(screen.getByRole('button', { name: 'Review upload' }))
    expect(screen.getByRole('dialog', { name: 'Add invoice' })).toBeInTheDocument()
    expect(mockedValidateAdminUpload).not.toHaveBeenCalled()
    expect(mockedSubmitAdminUpload).not.toHaveBeenCalled()
  })
})
