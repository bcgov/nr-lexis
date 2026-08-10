import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import RtmEmsLogAmvUploadPage from '@/pages/RTMEmsLogAmv/LegacyUploadWorkflow'
import { previewRtmEmsLogAmvUpload, saveRtmEmsLogAmvBatch } from '@/service/rtm-emslogamv-service'
import { createTestAuthContext } from '@/test-utils/auth'

vi.mock('@/context/auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/service/rtm-emslogamv-service', () => ({
  previewRtmEmsLogAmvUpload: vi.fn(),
  saveRtmEmsLogAmvBatch: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)
const mockedPreviewUpload = vi.mocked(previewRtmEmsLogAmvUpload)
const mockedSaveBatch = vi.mocked(saveRtmEmsLogAmvBatch)

describe('RTM EMS Log AMV spreadsheet upload actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseAuth.mockReturnValue(createTestAuthContext({ canPerform: () => true }))
    mockedSaveBatch.mockResolvedValue({
      status: 'accepted',
      message: 'Values saved.',
      errors: [],
      rows: [],
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders the empty Average market values design and month context', () => {
    render(<RtmEmsLogAmvUploadPage />)

    expect(screen.getByRole('heading', { name: 'Average market values', level: 1 })).toBeVisible()
    expect(screen.getByText(/domestic log values that become the fee in lieu/i)).toBeVisible()
    const monthSummary = screen.getByLabelText('Average market value month details')
    expect(within(monthSummary).queryByRole('combobox')).not.toBeInTheDocument()
    expect(within(monthSummary).getByText(/^[A-Z][a-z]+ \d{4}$/)).toBeVisible()
    expect(within(monthSummary).getByText('Values take effect')).toBeVisible()
    expect(within(monthSummary).getByText(/^[A-Z][a-z]+ 1, \d{4}$/)).toBeVisible()
    expect(within(monthSummary).queryByText('Compared against')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Values', level: 2 })).toBeVisible()
    expect(screen.getByText('Accepted format: .xlsx, up to 20 MB.')).toBeVisible()
    expect(screen.getByRole('link', { name: 'Download template' })).toHaveAttribute(
      'href',
      '/templates/rtm-ems-log-amv-template.xlsx',
    )
    expect(screen.queryByRole('button', { name: 'Review' })).not.toBeInTheDocument()
    expect(document.title).toBe('Average market values | NR LEXIS')
  })

  it('advances to the next editable month and clears the prior workflow at rollover', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-01T06:59:30Z'))
    mockedPreviewUpload.mockResolvedValue({
      status: 'accepted',
      fileName: 'Filename.xlsx',
      fileSize: 1,
      message: 'Spreadsheet is valid.',
      rowCount: 1,
      retrievalDate: '2026-08-01',
      updateDate: '2026-09-01',
      errors: [],
      warnings: [],
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
      ],
    })

    render(<RtmEmsLogAmvUploadPage />)
    expect(
      within(screen.getByLabelText('Average market value month details')).getByText(
        'September 2026',
      ),
    ).toBeVisible()

    const workbook = new File([new Uint8Array([1])], 'Filename.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    fireEvent.change(screen.getByLabelText('Average monthly values upload spreadsheet'), {
      target: { files: [workbook] },
    })
    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.getByRole('table', { name: 'Balsam average market value review' })).toBeVisible()

    vi.setSystemTime(new Date('2026-09-01T07:00:30Z'))
    act(() => vi.advanceTimersByTime(1_000))

    const monthSummary = screen.getByLabelText('Average market value month details')
    expect(within(monthSummary).getByText('October 2026')).toBeVisible()
    expect(within(monthSummary).getByText('October 1, 2026')).toBeVisible()
    expect(
      screen.queryByRole('table', { name: 'Balsam average market value review' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByText('Filename.xlsx')).not.toBeInTheDocument()
    expect(screen.getByText('Drag and drop your file here or click to upload')).toBeVisible()
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

  it('shows one server validation issue in a compact rejected-file row', async () => {
    mockedPreviewUpload.mockResolvedValue({
      status: 'validation_failed',
      fileName: 'Filename.xlsx',
      fileSize: 1,
      message: 'Upload template validation failed.',
      rowCount: 0,
      errors: ['The file has no numeric values. Please check your file and try again.'],
      warnings: [],
      rows: [],
    })
    render(<RtmEmsLogAmvUploadPage />)
    const workbook = new File([new Uint8Array([1])], 'Filename.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })

    await userEvent.upload(
      screen.getByLabelText('Average monthly values upload spreadsheet'),
      workbook,
    )

    const rejectedFile = await screen.findByRole('alert', {
      name: 'Rejected average monthly values upload file',
    })
    expect(within(rejectedFile).getByText('Filename.xlsx')).toBeVisible()
    expect(
      within(rejectedFile).getByText(
        'The file has no numeric values. Please check your file and try again.',
      ),
    ).toBeVisible()
    expect(screen.queryByText('1 validation issue found')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('table', { name: 'Upload validation issues' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('tablist', { name: 'Species' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Download template' })).toBeVisible()

    await userEvent.click(within(rejectedFile).getByRole('button', { name: 'Clear selected file' }))

    expect(
      screen.queryByRole('alert', { name: 'Rejected average monthly values upload file' }),
    ).not.toBeInTheDocument()
    expect(screen.getByText('Drag and drop your file here or click to upload')).toBeVisible()
    expect(mockedSaveBatch).not.toHaveBeenCalled()
  })

  it('lists multiple server validation issues inside the rejected-file row', async () => {
    const errors = [
      'The file has no numeric values.',
      'Error 2 can be listed here.',
      'Error 3 can be listed here.',
      'Error 4 can be listed here.',
    ]
    mockedPreviewUpload.mockResolvedValue({
      status: 'validation_failed',
      fileName: 'Filename.xlsx',
      fileSize: 1,
      message: 'Upload template validation failed.',
      rowCount: 0,
      errors,
      warnings: [],
      rows: [],
    })
    render(<RtmEmsLogAmvUploadPage />)
    const workbook = new File([new Uint8Array([1])], 'Filename.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })

    await userEvent.upload(
      screen.getByLabelText('Average monthly values upload spreadsheet'),
      workbook,
    )

    const rejectedFile = await screen.findByRole('alert', {
      name: 'Rejected average monthly values upload file',
    })
    expect(
      within(rejectedFile).getByText(
        "This file can't be used. Fix these issues in your spreadsheet, then upload it again:",
      ),
    ).toBeVisible()
    const issueList = within(rejectedFile).getByRole('list', {
      name: 'Upload validation issues',
    })
    expect(within(issueList).getAllByRole('listitem')).toHaveLength(4)
    for (const error of errors) {
      expect(within(issueList).getByText(error)).toBeVisible()
    }
    expect(screen.queryByText('4 validation issues found')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('table', { name: 'Upload validation issues' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('tablist', { name: 'Species' })).not.toBeInTheDocument()
  })

  it('shows a retryable system notice when upload validation is unavailable', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockedPreviewUpload
      .mockRejectedValueOnce(new Error('Service unavailable'))
      .mockResolvedValueOnce({
        status: 'validation_failed',
        fileName: 'Filename.xlsx',
        fileSize: 1,
        message: 'Upload template validation failed.',
        rowCount: 0,
        errors: ['The file has no numeric values.'],
        warnings: [],
        rows: [],
      })
    render(<RtmEmsLogAmvUploadPage />)
    const workbook = new File([new Uint8Array([1])], 'Filename.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })

    await userEvent.upload(
      screen.getByLabelText('Average monthly values upload spreadsheet'),
      workbook,
    )

    expect(await screen.findByText('Upload could not be completed')).toBeVisible()
    expect(
      screen.getByText(
        'Something went wrong on our end. Please try again. If the problem persists, contact...',
      ),
    ).toBeVisible()
    expect(screen.queryByText('Filename.xlsx')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('alert', { name: 'Rejected average monthly values upload file' }),
    ).not.toBeInTheDocument()
    expect(screen.getByText('Drag and drop your file here or click to upload')).toBeVisible()
    expect(screen.getByRole('link', { name: 'Download template' })).toBeVisible()
    expect(
      (screen.getByLabelText('Average monthly values upload spreadsheet') as HTMLInputElement)
        .value,
    ).toBe('')

    await userEvent.upload(
      screen.getByLabelText('Average monthly values upload spreadsheet'),
      workbook,
    )

    expect(mockedPreviewUpload).toHaveBeenCalledTimes(2)
    expect(await screen.findByText('The file has no numeric values.')).toBeVisible()
    expect(screen.queryByText('Upload could not be completed')).not.toBeInTheDocument()
    consoleError.mockRestore()
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
      rowCount: 4,
      retrievalDate: '2026-07-01',
      updateDate: '2026-09-01',
      errors: [],
      warnings: [],
      rows: [
        {
          species: 'BA',
          grade: 'D',
          growthIndicator: 'O',
          retrievalDate: '2026-07-01',
          updateDate: '2026-09-01',
          currentValue: 75.29,
          newValue: 78.14,
          returnCode: '0',
        },
        {
          species: 'HE',
          grade: 'A',
          growthIndicator: 'O',
          retrievalDate: '2026-07-01',
          updateDate: '2026-09-01',
          currentValue: null,
          newValue: 120,
          returnCode: '0',
        },
        {
          species: 'HE',
          grade: 'H',
          growthIndicator: 'O',
          retrievalDate: '2026-07-01',
          updateDate: '2026-09-01',
          currentValue: 81.4,
          newValue: null,
          returnCode: '0',
        },
        {
          species: 'CE',
          grade: 'B',
          growthIndicator: 'O',
          retrievalDate: '2026-07-01',
          updateDate: '2026-09-01',
          currentValue: 200,
          newValue: null,
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

    expect(await screen.findByText('3 cells need a look before you save')).toBeVisible()
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
    expect(
      within(balsamTable).getByRole('columnheader', { name: 'Last entered (July 2026)' }),
    ).toBeVisible()
    expect(within(balsamTable).getByRole('columnheader', { name: 'September 2026' })).toBeVisible()
    expect(within(balsamTable).getByRole('row', { name: /D.*75\.29.*78\.14/ })).toBeVisible()

    await userEvent.click(screen.getByRole('tab', { name: /Hemlock/ }))
    const hemlockTable = screen.getByRole('table', {
      name: 'Hemlock average market value review',
    })
    const newHemlockCombination = within(hemlockTable).getByLabelText(
      'Hemlock grade A September 2026 value',
    )
    expect(newHemlockCombination).toHaveValue('120.00')
    expect(
      within(hemlockTable).getByText(
        'July had none. Confirm this species and grade combination is valid.',
      ),
    ).toBeVisible()
    expect(
      within(hemlockTable).getByText('July had 81.40. Enter a value, or 0 for none.'),
    ).toBeVisible()
    expect(screen.getByText('Fixed values are not shown here')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Save values' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled()

    const missingHemlockValue = within(hemlockTable).getByLabelText(
      'Hemlock grade H September 2026 value',
    )
    await userEvent.clear(newHemlockCombination)
    await userEvent.type(newHemlockCombination, '0')
    await userEvent.type(missingHemlockValue, '81.43')

    expect(await screen.findByText('1 cell needs a look before you save')).toBeVisible()
    expect(
      screen.getByText('In Hemlock and Cedar, highlighted below. You can save either way.'),
    ).toBeVisible()
    expect(document.querySelectorAll('.rtm-amv-species-tab__status--warning')).toHaveLength(1)
    expect(
      screen
        .getByRole('tab', { name: /Hemlock/ })
        .querySelector('.rtm-amv-species-tab__status--complete'),
    ).toBeInTheDocument()
    expect(newHemlockCombination).toHaveValue('0')
    expect(missingHemlockValue).toHaveValue('81.43')
    expect(
      within(hemlockTable).queryByText(
        'July had none. Confirm this species and grade combination is valid.',
      ),
    ).not.toBeInTheDocument()
    expect(
      within(hemlockTable).queryByText('July had 81.40. Enter a value, or 0 for none.'),
    ).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Save values' }))
    await waitFor(() => {
      expect(mockedSaveBatch).toHaveBeenCalledTimes(1)
    })
    expect(mockedSaveBatch.mock.calls[0][0].values).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ species: 'HE', grade: 'A', newValue: 0 }),
        expect.objectContaining({ species: 'HE', grade: 'H', newValue: 81.43 }),
      ]),
    )

    expect(hemlockTable).toBeVisible()
    expect(screen.getByText('Values saved')).toBeVisible()
    expect(screen.getByText(/\d+ values will take effect on [A-Z][a-z]+ 1, \d{4}\./)).toBeVisible()
    expect(screen.getByText('Last saved')).toBeVisible()
    expect(screen.getByText(/by idir\\admin$/)).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Values', level: 2 })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Uploaded average monthly values file')).not.toBeInTheDocument()
    expect(screen.getByText('Edit a value to save again.')).toBeVisible()
    const savedSaveButton = screen.getByRole('button', { name: 'Save values' })
    const savedCancelButton = screen.getByRole('button', { name: 'Cancel' })
    expect(savedSaveButton).not.toBeDisabled()
    expect(savedSaveButton).toHaveAttribute('aria-disabled', 'true')
    expect(savedSaveButton).toHaveAccessibleDescription('Edit a value to save again.')
    expect(savedSaveButton.tabIndex).toBe(0)
    expect(savedCancelButton).not.toBeDisabled()
    expect(savedCancelButton).toHaveAttribute('aria-disabled', 'true')
    expect(savedCancelButton).toHaveAccessibleDescription('Edit a value to save again.')
    expect(savedCancelButton.tabIndex).toBe(0)

    await userEvent.click(screen.getByRole('button', { name: 'Save values' }))
    expect(mockedSaveBatch).toHaveBeenCalledTimes(1)

    await userEvent.clear(missingHemlockValue)
    await userEvent.type(missingHemlockValue, '82.15')
    expect(screen.queryByText('Values saved')).not.toBeInTheDocument()
    expect(screen.queryByText('Edit a value to save again.')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save values' })).not.toHaveAttribute('aria-disabled')
    expect(screen.getByRole('button', { name: 'Cancel' })).not.toHaveAttribute('aria-disabled')

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    const savedChangesDialog = screen.getByRole('dialog', { name: 'Discard these values?' })
    expect(savedChangesDialog).toHaveAccessibleDescription(
      "The values you changed since your last save will be cleared. Your saved values won't change.",
    )
    expect(within(savedChangesDialog).getByRole('button', { name: 'Discard changes' })).toHaveClass(
      'cds--btn--tertiary',
    )
    expect(within(savedChangesDialog).getByRole('button', { name: 'Save changes' })).toHaveClass(
      'cds--btn--primary',
    )

    await userEvent.click(
      within(savedChangesDialog).getByRole('button', { name: 'Discard changes' }),
    )
    expect(missingHemlockValue).toHaveValue('81.43')
    expect(screen.getByText('Changes discarded')).toBeVisible()
    expect(screen.getByText('Values are back to your last save.')).toBeVisible()
    expect(screen.getByText('Edit a value to save again.')).toBeVisible()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus())

    await userEvent.clear(missingHemlockValue)
    await userEvent.type(missingHemlockValue, '82.15')
    expect(screen.queryByText('Changes discarded')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await userEvent.click(
      within(screen.getByRole('dialog', { name: 'Discard these values?' })).getByRole('button', {
        name: 'Save changes',
      }),
    )

    await waitFor(() => {
      expect(mockedSaveBatch).toHaveBeenCalledTimes(2)
    })
    expect(mockedSaveBatch.mock.calls[1][0].values).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ species: 'HE', grade: 'H', newValue: 82.15 }),
      ]),
    )
    expect(screen.getByRole('button', { name: 'Save values' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    expect(screen.getByText('Values saved')).toBeVisible()
  })

  it('shows a clean editable review and confirms before discarding or removing it', async () => {
    mockedPreviewUpload.mockResolvedValue({
      status: 'accepted',
      fileName: 'Filename.xlsx',
      fileSize: 7,
      message: 'Spreadsheet is valid.',
      rowCount: 7,
      retrievalDate: '2026-08-01',
      updateDate: '2026-09-01',
      errors: [],
      warnings: [],
      rows: ['BA', 'HE', 'CE', 'CY', 'FI', 'SP', 'PINE'].map((species, index) => ({
        species,
        grade: 'D',
        growthIndicator: 'O',
        retrievalDate: '2026-08-01',
        updateDate: '2026-09-01',
        currentValue: 100 + index,
        newValue: 101 + index,
        returnCode: '0',
      })),
    })
    render(<RtmEmsLogAmvUploadPage />)
    const workbook = new File([new Uint8Array([1])], 'Filename.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })

    await userEvent.upload(
      screen.getByLabelText('Average monthly values upload spreadsheet'),
      workbook,
    )

    expect(await screen.findByRole('tab', { name: /Cedar/ })).toBeVisible()
    expect(screen.queryByText(/cells? need a look before you save/)).not.toBeInTheDocument()
    expect(document.querySelectorAll('.rtm-amv-species-tab__status--warning')).toHaveLength(0)
    expect(document.querySelectorAll('.rtm-amv-species-tab__status--complete')).toHaveLength(7)

    await userEvent.click(screen.getByRole('tab', { name: /Cedar/ }))
    const cedarTable = screen.getByRole('table', {
      name: 'Cedar average market value review',
    })
    const cedarRow = within(cedarTable).getByRole('row', { name: /D.*102\.00.*103\.00/ })
    expect(cedarRow).not.toHaveClass('has-warning')
    const cedarValue = within(cedarTable).getByLabelText('Cedar grade D September 2026 value')
    expect(cedarValue).toBeEnabled()
    expect(screen.getByText('Fixed values are not shown here')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Save values' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled()

    await userEvent.clear(cedarValue)
    await userEvent.type(cedarValue, '109.25')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    const dialog = screen.getByRole('dialog', { name: 'Discard these values?' })
    expect(dialog).toHaveAccessibleDescription(
      'The file and all values on screen will be cleared. Nothing has been saved.',
    )
    expect(within(dialog).getByRole('button', { name: 'Keep editing' })).toHaveClass(
      'cds--btn--tertiary',
    )
    expect(within(dialog).getByRole('button', { name: 'Discard values' })).toHaveClass(
      'cds--btn--danger',
    )

    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep editing' }))
    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: 'Discard these values?' }),
      ).not.toBeInTheDocument()
    })
    expect(cedarValue).toHaveValue('109.25')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus())

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await userEvent.click(screen.getByRole('button', { name: 'Discard values' }))

    await waitFor(() => {
      expect(
        screen.queryByRole('table', { name: 'Cedar average market value review' }),
      ).not.toBeInTheDocument()
    })
    expect(screen.getByText('Drag and drop your file here or click to upload')).toBeVisible()
    expect(mockedSaveBatch).not.toHaveBeenCalled()

    await userEvent.upload(
      screen.getByLabelText('Average monthly values upload spreadsheet'),
      workbook,
    )
    await userEvent.click(await screen.findByRole('tab', { name: /Cedar/ }))
    const reuploadedCedarTable = screen.getByRole('table', {
      name: 'Cedar average market value review',
    })
    const reuploadedCedarValue = within(reuploadedCedarTable).getByLabelText(
      'Cedar grade D September 2026 value',
    )
    await userEvent.clear(reuploadedCedarValue)
    await userEvent.type(reuploadedCedarValue, '110.50')
    await userEvent.click(screen.getByRole('button', { name: 'Clear selected file' }))

    const removeDialog = screen.getByRole('dialog', {
      name: 'Are you sure you want to remove this file?',
    })
    expect(removeDialog).toHaveAccessibleDescription(
      'The values on screen will be cleared. Nothing has been saved.',
    )
    expect(within(removeDialog).getByRole('button', { name: 'Keep file' })).toHaveClass(
      'cds--btn--tertiary',
    )
    expect(within(removeDialog).getByRole('button', { name: 'Remove file' })).toHaveClass(
      'cds--btn--danger',
    )

    await userEvent.click(within(removeDialog).getByRole('button', { name: 'Keep file' }))
    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: 'Are you sure you want to remove this file?' }),
      ).not.toBeInTheDocument()
    })
    expect(reuploadedCedarValue).toHaveValue('110.50')
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Clear selected file' })).toHaveFocus(),
    )

    await userEvent.click(screen.getByRole('button', { name: 'Clear selected file' }))
    await userEvent.click(screen.getByRole('button', { name: 'Remove file' }))

    await waitFor(() => {
      expect(
        screen.queryByRole('table', { name: 'Cedar average market value review' }),
      ).not.toBeInTheDocument()
    })
    expect(screen.getByText('Drag and drop your file here or click to upload')).toBeVisible()
    expect(mockedSaveBatch).not.toHaveBeenCalled()
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
    render(<RtmEmsLogAmvUploadPage />)
    const workbook = new File([new Uint8Array([1])], 'rtm-values.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })

    await userEvent.upload(
      screen.getByLabelText('Average monthly values upload spreadsheet'),
      workbook,
    )
    expect(mockedPreviewUpload).toHaveBeenCalledWith(
      workbook,
      expect.stringMatching(/^\d{4}-\d{2}-01$/),
    )
    await userEvent.click(await screen.findByRole('tab', { name: /Pine/ }))

    const table = screen.getByRole('table', { name: 'Pine average market value review' })
    expect(
      within(table).getByRole('columnheader', { name: 'Last entered (June 2026)' }),
    ).toBeVisible()
    expect(within(table).getByRole('columnheader', { name: 'July 2026' })).toBeVisible()
    expect(within(table).getByRole('row', { name: /A.*9\.00.*10\.00/ })).toBeVisible()
    expect(within(table).queryByRole('row', { name: /W.*4\.00/ })).not.toBeInTheDocument()
    expect(within(table).queryByRole('row', { name: /BLANK.*5\.00/ })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Save values' }))
    await waitFor(() => {
      expect(mockedSaveBatch).toHaveBeenCalledTimes(1)
    })
    const request = mockedSaveBatch.mock.calls[0][0]
    expect(request.values).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ species: 'PINE', grade: 'A', newValue: 10 }),
        expect.objectContaining({ species: 'PINE', grade: 'BLANK', newValue: 1 }),
      ]),
    )
    expect(request.values).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ grade: 'W' })]),
    )
  })

  it('keeps review visible and re-enables its actions when submission fails', async () => {
    let rejectSave: (reason: Error) => void = () => undefined
    mockedPreviewUpload.mockResolvedValue({
      status: 'accepted',
      fileName: 'rtm-values.xlsx',
      fileSize: 1,
      message: 'Spreadsheet is valid.',
      rowCount: 1,
      retrievalDate: '2026-06-01',
      updateDate: '2026-07-01',
      errors: [],
      warnings: [],
      rows: [
        {
          species: 'BA',
          grade: 'D',
          growthIndicator: 'O',
          retrievalDate: '2026-06-01',
          updateDate: '2026-07-01',
          currentValue: 75.29,
          newValue: 78.14,
          returnCode: '0',
        },
      ],
    })
    mockedSaveBatch.mockImplementation(
      () =>
        new Promise((_, reject) => {
          rejectSave = reject
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
    const reviewTable = await screen.findByRole('table', {
      name: 'Balsam average market value review',
    })
    await userEvent.click(screen.getByRole('button', { name: 'Save values' }))

    expect(screen.getByRole('button', { name: 'Saving values' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()

    await act(async () => rejectSave(new Error('unavailable')))

    expect(await screen.findByText('Unable to apply average monthly value upload.')).toBeVisible()
    expect(reviewTable).toBeVisible()
    expect(screen.getByRole('button', { name: 'Save values' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled()
  })
})
