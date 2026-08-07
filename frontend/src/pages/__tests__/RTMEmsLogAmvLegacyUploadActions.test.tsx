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

  it('renders the empty Average market values design and month context', () => {
    render(<RtmEmsLogAmvUploadPage />)

    expect(screen.getByRole('heading', { name: 'Average market values', level: 1 })).toBeVisible()
    expect(screen.getByText(/domestic log values that become the fee in lieu/i)).toBeVisible()
    const monthSelect = screen.getByLabelText('Month') as HTMLSelectElement
    expect(monthSelect.value).toMatch(/^\d{4}-\d{2}-01$/)
    expect(monthSelect).toBeDisabled()
    expect(monthSelect.options).toHaveLength(1)
    expect(monthSelect.selectedOptions[0]).toHaveTextContent(/, next month$/)
    expect(screen.getByText('Values take effect')).toBeVisible()
    expect(screen.getByText('Compared against')).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Values', level: 2 })).toBeVisible()
    expect(screen.getByText('Accepted format: .xlsx, up to 20 MB.')).toBeVisible()
    expect(screen.getByRole('link', { name: 'Download template' })).toHaveAttribute(
      'href',
      '/templates/rtm-ems-log-amv-template.xlsx',
    )
    expect(screen.queryByRole('button', { name: 'Review' })).not.toBeInTheDocument()
    expect(document.title).toBe('Average market values | NR LEXIS')
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

  it('shows the compact filename loading row while the spreadsheet is validated', async () => {
    mockedPreviewUpload.mockImplementation(() => new Promise(() => undefined))
    render(<RtmEmsLogAmvUploadPage />)
    const workbook = new File([new Uint8Array([1])], 'Filename.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })

    await userEvent.upload(
      screen.getByLabelText('Average monthly values upload spreadsheet'),
      workbook,
    )

    expect(screen.getByText('Filename.xlsx')).toBeVisible()
    expect(screen.getByText('Validating Filename.xlsx')).toBeInTheDocument()
    expect(
      screen.queryByLabelText('Selected average monthly values upload file'),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Review' })).not.toBeInTheDocument()
  })

  it('shows species tabs and highlights uploaded values with warnings', async () => {
    mockedPreviewUpload.mockResolvedValue({
      status: 'accepted',
      fileName: 'Filename.xlsx',
      fileSize: 3,
      message: 'Spreadsheet is valid.',
      rowCount: 3,
      retrievalDate: '2026-08-01',
      updateDate: '2026-09-01',
      errors: [],
      warnings: ['Hemlock grade A changed significantly.', 'Cedar grade B changed significantly.'],
      rows: [
        {
          species: 'BA',
          grade: 'D',
          growthIndicator: 'O',
          retrievalDate: '2026-08-01',
          updateDate: '2026-09-01',
          currentValue: 75.29,
          newValue: 78.14,
          returnCode: '0',
        },
        {
          species: 'HE',
          grade: 'A',
          growthIndicator: 'O',
          retrievalDate: '2026-08-01',
          updateDate: '2026-09-01',
          currentValue: 100,
          newValue: 120,
          returnCode: '0',
        },
        {
          species: 'CE',
          grade: 'B',
          growthIndicator: 'O',
          retrievalDate: '2026-08-01',
          updateDate: '2026-09-01',
          currentValue: 200,
          newValue: 240,
          returnCode: '0',
        },
      ],
    })
    render(<RtmEmsLogAmvUploadPage />)
    const workbook = new File([new Uint8Array([1, 2, 3])], 'Filename.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })

    await userEvent.upload(
      screen.getByLabelText('Average monthly values upload spreadsheet'),
      workbook,
    )

    expect(await screen.findByText('2 cells need a look before you save')).toBeVisible()
    expect(
      screen.getByText('In Hemlock and Cedar, highlighted below. You can save either way.'),
    ).toBeVisible()
    expect(screen.getByLabelText('Uploaded average monthly values file')).toHaveTextContent(
      'Filename.xlsx',
    )
    expect(screen.getAllByRole('tab')).toHaveLength(7)
    expect(document.querySelectorAll('.rtm-amv-species-tab__status--warning')).toHaveLength(2)

    const balsamTable = screen.getByRole('table', {
      name: 'Balsam average market value review',
    })
    expect(within(balsamTable).getByRole('columnheader', { name: 'August 2026' })).toBeVisible()
    expect(within(balsamTable).getByRole('columnheader', { name: 'September 2026' })).toBeVisible()
    expect(within(balsamTable).getByRole('row', { name: /D.*75\.29.*78\.14/ })).toBeVisible()

    await userEvent.click(screen.getByRole('tab', { name: /Hemlock/ }))
    const hemlockTable = screen.getByRole('table', {
      name: 'Hemlock average market value review',
    })
    expect(within(hemlockTable).getByText('120.00').closest('td')).toHaveClass('has-warning')
    expect(screen.getByText('Fixed values are not shown here')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Save values' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled()
  })

  it('groups pine and hides fixed legacy grades while preserving the workbook submission', async () => {
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
          currentValue: 9,
          newValue: 10,
          returnCode: '0',
        },
        {
          species: 'LO',
          grade: 'A',
          growthIndicator: 'O',
          retrievalDate: '2026-06-01',
          updateDate: '2026-07-01',
          currentValue: 9,
          newValue: 10,
          returnCode: '0',
        },
        {
          species: 'YE',
          grade: 'A',
          growthIndicator: 'O',
          retrievalDate: '2026-06-01',
          updateDate: '2026-07-01',
          currentValue: 9,
          newValue: 10,
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
    const effectiveMonth = (screen.getByLabelText('Month') as HTMLSelectElement).value
    expect(mockedPreviewUpload).toHaveBeenCalledWith(workbook, effectiveMonth)
    await userEvent.click(await screen.findByRole('tab', { name: /Pine/ }))

    const table = screen.getByRole('table', { name: 'Pine average market value review' })
    expect(within(table).getByRole('columnheader', { name: 'June 2026' })).toBeVisible()
    expect(within(table).getByRole('columnheader', { name: 'July 2026' })).toBeVisible()
    expect(within(table).getByRole('row', { name: /A.*9\.00.*10\.00/ })).toBeVisible()
    expect(within(table).queryByRole('row', { name: /W.*4\.00/ })).not.toBeInTheDocument()
    expect(within(table).queryByRole('row', { name: /BLANK.*5\.00/ })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Save values' }))
    await waitFor(() => {
      expect(mockedUpload).toHaveBeenCalledWith({ file: workbook, effectiveMonth })
    })
  })
})
