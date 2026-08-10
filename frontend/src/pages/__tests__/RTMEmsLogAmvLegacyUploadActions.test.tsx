import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import RtmEmsLogAmvUploadPage from '@/pages/RTMEmsLogAmv/LegacyUploadWorkflow'
import { previewRtmEmsLogAmvUpload, uploadRtmEmsLogAmv } from '@/service/rtm-emslogamv-service'
import { createTestAuthContext } from '@/test-utils/auth'

vi.mock('@/context/auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/service/rtm-emslogamv-service', () => ({
  previewRtmEmsLogAmvUpload: vi.fn(),
  uploadRtmEmsLogAmv: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)
const mockedPreviewUpload = vi.mocked(previewRtmEmsLogAmvUpload)
const mockedUpload = vi.mocked(uploadRtmEmsLogAmv)

describe('RTM EMS Log AMV spreadsheet upload actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseAuth.mockReturnValue(createTestAuthContext({ canPerform: () => true }))
  })

  it('rejects files above 20 MiB before requesting a server preview', async () => {
    render(<RtmEmsLogAmvUploadPage />)
    const oversized = new File(
      [new Uint8Array(20 * 1024 * 1024 + 1)],
      'oversized-rtm-template.xlsx',
      {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
    )

    await userEvent.upload(
      screen.getByLabelText('Average monthly values upload spreadsheet'),
      oversized,
    )

    expect(await screen.findByText('File must be 20 MiB or smaller.')).toBeVisible()
    expect(mockedPreviewUpload).not.toHaveBeenCalled()
  })

  it('hides legacy W and BLANK review rows while preserving the original workbook submission', async () => {
    mockedPreviewUpload.mockResolvedValue({
      status: 'accepted',
      fileName: 'rtm-values.xlsx',
      fileSize: 1,
      message: 'Spreadsheet is valid.',
      rowCount: 5,
      retrievalDate: '2026-06-01',
      updateDate: '2026-07-01',
      errors: [],
      warnings: [],
      rows: [
        {
          species: 'WH',
          grade: 'A',
          growthIndicator: 'O',
          retrievalDate: '2026-06-01',
          updateDate: '2026-07-01',
          currentValue: null,
          newValue: 10,
          returnCode: '0',
        },
        {
          species: 'LO',
          grade: 'A',
          growthIndicator: 'O',
          retrievalDate: '2026-06-01',
          updateDate: '2026-07-01',
          currentValue: null,
          newValue: 20,
          returnCode: '0',
        },
        {
          species: 'YE',
          grade: 'A',
          growthIndicator: 'O',
          retrievalDate: '2026-06-01',
          updateDate: '2026-07-01',
          currentValue: null,
          newValue: 30,
          returnCode: '0',
        },
        {
          species: 'BA',
          grade: 'W',
          growthIndicator: 'O',
          retrievalDate: '2026-06-01',
          updateDate: '2026-07-01',
          currentValue: null,
          newValue: 4,
          returnCode: '0',
        },
        {
          species: 'BA',
          grade: ' ',
          growthIndicator: 'S',
          retrievalDate: '2026-06-01',
          updateDate: '2026-07-01',
          currentValue: null,
          newValue: 5,
          returnCode: '0',
        },
      ],
    })
    mockedUpload.mockResolvedValue({
      status: 'accepted',
      message: 'Spreadsheet uploaded.',
      attemptedRowCount: 5,
      uploadedRowCount: 5,
      errors: [],
      warnings: [],
      rows: [],
    })
    render(<RtmEmsLogAmvUploadPage />)
    const workbook = new File([new Uint8Array([1])], 'rtm-values.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })

    await userEvent.upload(
      screen.getByLabelText('Average monthly values upload spreadsheet'),
      workbook,
    )
    await screen.findByText('Spreadsheet validated')
    await userEvent.click(screen.getByRole('button', { name: 'Review' }))

    const table = screen.getByRole('table', { name: 'Average monthly value upload review' })
    expect(within(table).getByRole('columnheader', { name: 'Western white pine' })).toBeVisible()
    expect(within(table).getByRole('columnheader', { name: 'Lodgepole pine' })).toBeVisible()
    expect(within(table).getByRole('columnheader', { name: 'Yellow pine' })).toBeVisible()
    expect(within(table).queryByRole('columnheader', { name: 'Pine' })).not.toBeInTheDocument()
    expect(within(table).getByRole('row', { name: /A.*10\.00.*20\.00.*30\.00/ })).toBeVisible()
    expect(within(table).queryByRole('row', { name: /W.*4\.00/ })).not.toBeInTheDocument()
    expect(within(table).queryByRole('row', { name: /BLANK.*5\.00/ })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Submit' }))
    await waitFor(() => {
      expect(mockedUpload).toHaveBeenCalledWith({ file: workbook })
    })
  })

  it('keeps review visible and re-enables its actions when submission fails', async () => {
    let rejectUpload: (reason: Error) => void = () => undefined
    mockedPreviewUpload.mockResolvedValue({
      status: 'accepted',
      fileName: 'rtm-values.xlsx',
      fileSize: 1,
      message: 'Spreadsheet is valid.',
      rowCount: 0,
      retrievalDate: '2026-06-01',
      updateDate: '2026-07-01',
      errors: [],
      warnings: [],
      rows: [],
    })
    mockedUpload.mockImplementation(
      () =>
        new Promise((_, reject) => {
          rejectUpload = reject
        }),
    )
    render(<RtmEmsLogAmvUploadPage />)
    const workbook = new File([new Uint8Array([1])], 'rtm-values.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })

    await userEvent.upload(
      screen.getByLabelText('Average monthly values upload spreadsheet'),
      workbook,
    )
    await screen.findByText('Spreadsheet validated')
    await userEvent.click(screen.getByRole('button', { name: 'Review' }))
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }))

    expect(screen.getByRole('button', { name: 'Submitting…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled()
    expect(screen.getByRole('region', { name: 'Review' })).toHaveAttribute('aria-busy', 'true')

    rejectUpload(new Error('unavailable'))

    expect(await screen.findByText('Unable to apply average monthly value upload.')).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Review' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Submit' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Back' })).toBeEnabled()
  })
})
