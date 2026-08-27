import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { APP_NOTIFICATION_REGION_ID } from '@/components/AppNotification'
import { useAuth } from '@/context/auth/useAuth'
import RtmEmsLogAmvUploadPage from '@/pages/RTMEmsLogAmv/LegacyUploadWorkflow'
import {
  getRtmEmsLogAmvLastSaved,
  previewRtmEmsLogAmvUpload,
  saveRtmEmsLogAmvBatch,
  searchLatestRtmEmsLogAmv,
  searchRtmEmsLogAmv,
} from '@/service/rtm-emslogamv-service'
import { createTestAuthContext } from '@/test-utils/auth'
import { formatBusinessIsoDate } from '@/utils/date'

vi.mock('@/context/auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/service/rtm-emslogamv-service', () => ({
  getRtmEmsLogAmvLastSaved: vi.fn(),
  previewRtmEmsLogAmvUpload: vi.fn(),
  saveRtmEmsLogAmvBatch: vi.fn(),
  searchLatestRtmEmsLogAmv: vi.fn(),
  searchRtmEmsLogAmv: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)
const mockedLastSaved = vi.mocked(getRtmEmsLogAmvLastSaved)
const mockedPreviewUpload = vi.mocked(previewRtmEmsLogAmvUpload)
const mockedSaveBatch = vi.mocked(saveRtmEmsLogAmvBatch)
const mockedSearchLatest = vi.mocked(searchLatestRtmEmsLogAmv)
const mockedSearch = vi.mocked(searchRtmEmsLogAmv)

const monthOffset = (dateValue: string, offset: number) => {
  const [year, month] = dateValue.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1 + offset, 1)).toISOString().slice(0, 10)
}

const monthLabel = (dateValue: string) =>
  new Intl.DateTimeFormat('en-CA', { month: 'long', timeZone: 'UTC', year: 'numeric' }).format(
    new Date(`${dateValue}T00:00:00Z`),
  )

const renderUploadPage = async () => {
  await act(async () => {
    render(<RtmEmsLogAmvUploadPage />)
  })
}

describe('RTM EMS Log AMV spreadsheet upload actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseAuth.mockReturnValue(createTestAuthContext({ canPerform: () => true }))
    mockedSaveBatch.mockResolvedValue({
      status: 'accepted',
      message: 'Values saved.',
      errors: [],
      rows: [],
      lastSaved: {
        savedBy: 'IDIR\\MGURJAOD',
        savedAt: '2026-08-11T18:21:00',
      },
    })
    mockedLastSaved.mockResolvedValue(null)
    mockedSearch.mockResolvedValue([])
    mockedSearchLatest.mockResolvedValue([])
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('waits for the saved-value lookup before choosing a workflow state', async () => {
    let finishSearch!: (rows: []) => void
    mockedSearch.mockReturnValue(
      new Promise((resolve) => {
        finishSearch = resolve
      }),
    )

    render(<RtmEmsLogAmvUploadPage />)

    const loadingState = screen.getByRole('status')
    expect(loadingState).toHaveClass('rtm-amv-page-loading')
    expect(within(loadingState).getByRole('img', { name: 'Loading…' })).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Average market values' })).not.toBeInTheDocument()
    expect(screen.queryByText('Upload spreadsheet')).not.toBeInTheDocument()
    expect(screen.queryByRole('tablist', { name: 'Species' })).not.toBeInTheDocument()

    await act(async () => finishSearch([]))

    expect(screen.getByRole('heading', { name: 'Average market values' })).toBeVisible()
    expect(screen.getByText('Upload spreadsheet')).toBeVisible()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('does not fall back to upload when the saved-value lookup fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockedSearch.mockRejectedValue(new Error('Service unavailable'))

    render(<RtmEmsLogAmvUploadPage />)

    expect(await screen.findByText('Average market values could not be loaded')).toBeVisible()
    expect(screen.queryByText('Upload spreadsheet')).not.toBeInTheDocument()
    expect(screen.queryByRole('tablist', { name: 'Species' })).not.toBeInTheDocument()
    consoleError.mockRestore()
  })

  it('renders the empty Average market values design and month context', async () => {
    await renderUploadPage()

    expect(screen.getByRole('heading', { name: 'Average market values', level: 1 })).toBeVisible()
    expect(
      screen.getByText(
        'Set the domestic log values used to calculate export fees for coastal permits.',
      ),
    ).toBeVisible()
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

  it('restores next-month saved values as an editable review without file metadata', async () => {
    const currentMonth = `${formatBusinessIsoDate().slice(0, 7)}-01`
    const nextMonth = monthOffset(currentMonth, 1)
    const comparisonMonth = monthOffset(nextMonth, -2)
    mockedSearch.mockResolvedValue([
      {
        species: 'BA',
        grade: 'D',
        growthIndicator: 'O',
        retrievalDate: nextMonth,
        updateDate: nextMonth,
        currentValue: 78.14,
        newValue: 78.14,
        returnCode: '0',
      },
      {
        species: 'AL',
        grade: 'D',
        growthIndicator: 'O',
        retrievalDate: nextMonth,
        updateDate: nextMonth,
        currentValue: 65,
        newValue: 65,
        returnCode: '0',
      },
      {
        species: 'BA',
        grade: 'Q',
        growthIndicator: 'O',
        retrievalDate: nextMonth,
        updateDate: nextMonth,
        currentValue: 64,
        newValue: 64,
        returnCode: '0',
      },
    ])
    mockedSearchLatest.mockResolvedValue([
      {
        species: 'BA',
        grade: 'D',
        growthIndicator: 'O',
        retrievalDate: comparisonMonth,
        updateDate: comparisonMonth,
        currentValue: 75.29,
        newValue: 75.29,
        returnCode: '0',
      },
    ])
    mockedLastSaved.mockResolvedValue({
      savedBy: 'IDIR\\MGURJAOD',
      savedAt: '2026-08-11T18:21:00',
    })

    await renderUploadPage()

    const table = await screen.findByRole('table', {
      name: 'Balsam average market value review',
    })
    expect(mockedSearch).toHaveBeenCalledWith({
      species: '',
      growthIndicator: '',
      retrievalDate: nextMonth,
      updateDate: nextMonth,
    })
    expect(mockedSearchLatest).toHaveBeenCalledWith(nextMonth)
    expect(mockedLastSaved).toHaveBeenCalledWith(nextMonth)
    expect(
      within(table).getByRole('columnheader', {
        name: `Value in effect (${monthLabel(comparisonMonth)})`,
      }),
    ).toBeVisible()
    const value = within(table).getByLabelText(`Balsam grade D ${monthLabel(nextMonth)} value`)
    expect(value).toHaveValue('78.14')
    expect(screen.getByRole('heading', { name: 'Values', level: 2 })).toBeVisible()
    const replaceFileButton = screen.getByRole('button', { name: 'Replace file' })
    expect(replaceFileButton).toBeVisible()
    expect(replaceFileButton).toHaveClass('cds--btn--md')
    expect(screen.queryByText('Upload spreadsheet')).not.toBeInTheDocument()
    expect(screen.getByText('Last saved')).toBeVisible()
    expect(screen.getByText('August 11, 2026, 6:21 PM by IDIR\\MGURJAOD')).toBeVisible()
    expect(screen.queryByText('Values saved')).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'AL' })).not.toBeInTheDocument()
    expect(within(table).queryByRole('rowheader', { name: 'Q' })).not.toBeInTheDocument()
    expect(screen.getByText('Edit a value to save again.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Save values' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )

    await userEvent.clear(value)
    await userEvent.type(value, '79.25')
    await userEvent.click(screen.getByRole('button', { name: 'Save values' }))

    await waitFor(() => expect(mockedSaveBatch).toHaveBeenCalledTimes(1))
    expect(mockedSaveBatch.mock.calls[0][0].values).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          species: 'BA',
          grade: 'D',
          retrievalDate: comparisonMonth,
          updateDate: nextMonth,
          newValue: 79.25,
        }),
      ]),
    )
    expect(screen.getByText('Values saved')).toBeVisible()
  })

  it('confirms removal of manually edited replacement values and updates only after save', async () => {
    const currentMonth = `${formatBusinessIsoDate().slice(0, 7)}-01`
    const nextMonth = monthOffset(currentMonth, 1)
    const comparisonMonth = monthOffset(nextMonth, -1)
    mockedSearch.mockResolvedValue([
      {
        species: 'BA',
        grade: 'D',
        growthIndicator: 'O',
        retrievalDate: nextMonth,
        updateDate: nextMonth,
        currentValue: 78.14,
        newValue: 78.14,
        returnCode: '0',
      },
    ])
    mockedSearchLatest.mockResolvedValue([
      {
        species: 'BA',
        grade: 'D',
        growthIndicator: 'O',
        retrievalDate: comparisonMonth,
        updateDate: comparisonMonth,
        currentValue: 75.29,
        newValue: 75.29,
        returnCode: '0',
      },
    ])
    mockedPreviewUpload.mockResolvedValue({
      status: 'accepted',
      fileName: 'replacement.xlsx',
      fileSize: 1,
      message: 'Spreadsheet is valid.',
      rowCount: 1,
      retrievalDate: comparisonMonth,
      updateDate: nextMonth,
      errors: [],
      warnings: [],
      rows: [
        {
          species: 'BA',
          grade: 'D',
          growthIndicator: 'O',
          retrievalDate: comparisonMonth,
          updateDate: nextMonth,
          currentValue: 75.29,
          newValue: 91.25,
          returnCode: '0',
        },
      ],
    })

    await renderUploadPage()
    const replacement = new File([new Uint8Array([1])], 'replacement.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })

    const savedValue = screen.getByLabelText(`Balsam grade D ${monthLabel(nextMonth)} value`)
    expect(savedValue).toHaveValue('78.14')
    expect(
      screen.queryByLabelText('Replacement average monthly values spreadsheet'),
    ).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Replace file' }))

    expect(screen.getByText('Selecting a file will replace the values on screen')).toBeVisible()
    expect(
      screen.getByText(
        "Any edits you haven't saved will be lost. Your saved values won't change until you save again.",
      ),
    ).toBeVisible()
    expect(savedValue).toHaveValue('78.14')
    expect(screen.getByRole('button', { name: 'Keep current values' })).toBeVisible()
    expect(screen.getByText('Edit a value to save again.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveAttribute('aria-disabled', 'true')
    expect(mockedPreviewUpload).not.toHaveBeenCalled()
    expect(mockedSaveBatch).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Keep current values' }))
    expect(
      screen.queryByLabelText('Replacement average monthly values spreadsheet'),
    ).not.toBeInTheDocument()
    expect(savedValue).toHaveValue('78.14')

    await userEvent.click(screen.getByRole('button', { name: 'Replace file' }))

    await userEvent.upload(
      screen.getByLabelText('Replacement average monthly values spreadsheet'),
      replacement,
    )

    expect(mockedPreviewUpload).toHaveBeenCalledWith(replacement, nextMonth)
    const replacementValue = await screen.findByLabelText(
      `Balsam grade D ${monthLabel(nextMonth)} value`,
    )
    expect(replacementValue).toHaveValue('91.25')
    expect(
      screen.queryByText('Selecting a file will replace the values on screen'),
    ).not.toBeInTheDocument()
    expect(
      screen.getByLabelText('Uploaded replacement average monthly values file'),
    ).toHaveTextContent('replacement.xlsx')
    expect(
      screen.queryByRole('button', {
        name: 'Choose a replacement average monthly values spreadsheet',
      }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save values' })).not.toHaveAttribute(
      'aria-disabled',
      'true',
    )
    expect(mockedSaveBatch).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Clear selected file' }))
    expect(
      screen.queryByRole('dialog', { name: 'Are you sure you want to remove this file?' }),
    ).not.toBeInTheDocument()
    expect(screen.getByLabelText(`Balsam grade D ${monthLabel(nextMonth)} value`)).toHaveValue(
      '78.14',
    )

    await userEvent.upload(
      screen.getByLabelText('Replacement average monthly values spreadsheet'),
      replacement,
    )
    const editedReplacementValue = await screen.findByLabelText(
      `Balsam grade D ${monthLabel(nextMonth)} value`,
    )
    await userEvent.clear(editedReplacementValue)
    await userEvent.type(editedReplacementValue, '92.50')
    await userEvent.click(screen.getByRole('button', { name: 'Clear selected file' }))

    const removeReplacementDialog = screen.getByRole('dialog', {
      name: 'Are you sure you want to remove this file?',
    })
    expect(removeReplacementDialog).toHaveAccessibleDescription(
      'The values on screen will be cleared. Nothing has been saved.',
    )
    await userEvent.click(
      within(removeReplacementDialog).getByRole('button', { name: 'Keep file' }),
    )
    expect(editedReplacementValue).toHaveValue('92.50')

    await userEvent.click(screen.getByRole('button', { name: 'Clear selected file' }))
    await userEvent.click(screen.getByRole('button', { name: 'Remove file' }))
    expect(screen.getByLabelText(`Balsam grade D ${monthLabel(nextMonth)} value`)).toHaveValue(
      '78.14',
    )
    expect(mockedSaveBatch).not.toHaveBeenCalled()

    await userEvent.upload(
      screen.getByLabelText('Replacement average monthly values spreadsheet'),
      replacement,
    )
    expect(
      await screen.findByLabelText(`Balsam grade D ${monthLabel(nextMonth)} value`),
    ).toHaveValue('91.25')

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    const discardDialog = screen.getByRole('dialog', { name: 'Discard these values?' })
    await userEvent.click(within(discardDialog).getByRole('button', { name: 'Discard changes' }))

    expect(screen.getByLabelText(`Balsam grade D ${monthLabel(nextMonth)} value`)).toHaveValue(
      '78.14',
    )
    expect(screen.getByText('Changes discarded')).toBeVisible()

    await userEvent.click(screen.getByRole('button', { name: 'Replace file' }))
    await userEvent.upload(
      screen.getByLabelText('Replacement average monthly values spreadsheet'),
      replacement,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Save values' }))

    await waitFor(() => expect(mockedSaveBatch).toHaveBeenCalledTimes(1))
    expect(mockedSaveBatch.mock.calls[0][0].values).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          species: 'BA',
          grade: 'D',
          retrievalDate: comparisonMonth,
          updateDate: nextMonth,
          newValue: 91.25,
          saveMode: 'update',
        }),
      ]),
    )
    expect(screen.getByText('Values saved')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Replace file' })).toBeVisible()

    await userEvent.click(screen.getByRole('button', { name: 'Replace file' }))
    expect(screen.queryByText('Values saved')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Keep current values' })).toBeVisible()
  })

  it('keeps saved values on screen when a replacement workbook is rejected', async () => {
    const currentMonth = `${formatBusinessIsoDate().slice(0, 7)}-01`
    const nextMonth = monthOffset(currentMonth, 1)
    const comparisonMonth = monthOffset(nextMonth, -1)
    mockedSearch.mockResolvedValue([
      {
        species: 'BA',
        grade: 'D',
        growthIndicator: 'O',
        retrievalDate: nextMonth,
        updateDate: nextMonth,
        currentValue: 78.14,
        newValue: 78.14,
        returnCode: '0',
      },
    ])
    mockedSearchLatest.mockResolvedValue([
      {
        species: 'BA',
        grade: 'D',
        growthIndicator: 'O',
        retrievalDate: comparisonMonth,
        updateDate: comparisonMonth,
        currentValue: 75.29,
        newValue: 75.29,
        returnCode: '0',
      },
    ])
    mockedPreviewUpload.mockResolvedValue({
      status: 'validation_failed',
      fileName: 'wrong-month.xlsx',
      fileSize: 1,
      message: "This file couldn't be used.",
      rowCount: 0,
      retrievalDate: comparisonMonth,
      updateDate: nextMonth,
      errors: ['The file has no numeric values.'],
      warnings: [],
      rows: [],
    })

    await renderUploadPage()
    const replacement = new File([new Uint8Array([1])], 'wrong-month.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })

    await userEvent.click(screen.getByRole('button', { name: 'Replace file' }))
    await userEvent.upload(
      screen.getByLabelText('Replacement average monthly values spreadsheet'),
      replacement,
    )

    expect(await screen.findByText(/The file has no numeric values/)).toBeVisible()
    expect(screen.getByLabelText(`Balsam grade D ${monthLabel(nextMonth)} value`)).toHaveValue(
      '78.14',
    )
    expect(screen.getByText('wrong-month.xlsx')).toBeVisible()
    expect(screen.getByText('Edit a value to save again.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Keep current values' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveAttribute('aria-disabled', 'true')
    expect(screen.queryByRole('button', { name: 'Replace file' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Replacement average monthly values spreadsheet')).toBeVisible()
    expect(mockedSaveBatch).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Keep current values' }))
    expect(screen.getByRole('button', { name: 'Replace file' })).toBeVisible()
    expect(screen.queryByText('wrong-month.xlsx')).not.toBeInTheDocument()
    expect(screen.getByLabelText(`Balsam grade D ${monthLabel(nextMonth)} value`)).toHaveValue(
      '78.14',
    )
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

    await renderUploadPage()
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
    await act(async () => {
      vi.advanceTimersByTime(1_000)
    })

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
    await renderUploadPage()
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
      message: "This file couldn't be used.",
      rowCount: 0,
      errors: ['The file has no numeric values. Please check your file and try again.'],
      warnings: [],
      rows: [],
    })
    await renderUploadPage()
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

  it('deduplicates and caps server validation issues inside the rejected-file row', async () => {
    const errors = [
      ...Array.from({ length: 12 }, (_, index) => `Problem ${index + 1}.`),
      'Problem 1.',
    ]
    mockedPreviewUpload.mockResolvedValue({
      status: 'validation_failed',
      fileName: 'Filename.xlsx',
      fileSize: 1,
      message: "This file couldn't be used.",
      rowCount: 0,
      errors,
      warnings: [],
      rows: [],
    })
    await renderUploadPage()
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
      within(rejectedFile).getByText("This file couldn't be used — 12 problems found"),
    ).toBeVisible()
    const issueList = within(rejectedFile).getByRole('list', {
      name: 'Upload validation issues',
    })
    expect(within(issueList).getAllByRole('listitem')).toHaveLength(11)
    for (const error of errors.slice(0, 10)) {
      expect(within(issueList).getByText(error)).toBeVisible()
    }
    expect(within(issueList).getByText('and 2 more')).toBeVisible()
    expect(within(issueList).queryByText('Problem 11.')).not.toBeInTheDocument()
    expect(within(issueList).getAllByText('Problem 1.')).toHaveLength(1)
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
        message: "This file couldn't be used.",
        rowCount: 0,
        errors: ['The file has no numeric values.'],
        warnings: [],
        rows: [],
      })
    await renderUploadPage()
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
    await renderUploadPage()
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
          grade: 'B',
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
        {
          species: 'AL',
          grade: 'D',
          growthIndicator: 'O',
          retrievalDate: '2026-07-01',
          updateDate: '2026-09-01',
          currentValue: 65,
          newValue: 66,
          returnCode: '0',
        },
      ],
    })
    await renderUploadPage()
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
    expect(screen.queryByRole('tab', { name: 'AL' })).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Balsam, no warnings' })).toBeVisible()
    expect(screen.getByRole('tab', { name: 'Hemlock, warning' })).toBeVisible()
    expect(screen.getByRole('tab', { name: 'Cedar, warning' })).toBeVisible()
    expect(document.querySelectorAll('.rtm-amv-species-tab__status--warning')).toHaveLength(2)

    const balsamTable = screen.getByRole('table', {
      name: 'Balsam average market value review',
    })
    expect(
      within(balsamTable).getByRole('columnheader', { name: 'Value in effect (July 2026)' }),
    ).toBeVisible()
    expect(within(balsamTable).getByRole('columnheader', { name: 'September 2026' })).toBeVisible()
    expect(within(balsamTable).getByRole('row', { name: /D.*75\.29.*78\.14/ })).toBeVisible()

    await userEvent.click(screen.getByRole('tab', { name: /Hemlock/ }))
    const hemlockTable = screen.getByRole('table', {
      name: 'Hemlock average market value review',
    })
    const newHemlockCombination = within(hemlockTable).getByLabelText(
      'Hemlock grade B September 2026 value',
    )
    expect(newHemlockCombination).toHaveValue('120.00')
    expect(
      within(hemlockTable).getByText(
        'No value has ever been set for this grade. Confirm this species and grade combination is valid.',
      ),
    ).toBeVisible()
    expect(
      within(hemlockTable).getByText('July had 81.40. Enter a value, or 0 for none.'),
    ).toBeVisible()
    expect(screen.getByText('Fixed values are not shown here')).toBeVisible()
    expect(
      screen.getByText(
        'Grades Z, BLANK and 1 to 6 are always $1.00 per cubic metre. They are saved automatically and appear on the permit Fees tab.',
      ),
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'Save values' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled()

    const missingHemlockValue = within(hemlockTable).getByLabelText(
      'Hemlock grade H September 2026 value',
    )
    await userEvent.clear(newHemlockCombination)
    await userEvent.type(newHemlockCombination, '0')
    await userEvent.type(missingHemlockValue, '81.43')

    expect(await screen.findByText('1 cell needs a look before you save')).toBeVisible()
    expect(screen.getByText('In Cedar, highlighted below. You can save either way.')).toBeVisible()
    expect(document.querySelectorAll('.rtm-amv-species-tab__status--warning')).toHaveLength(1)
    expect(
      screen
        .getByRole('tab', { name: 'Hemlock, no warnings' })
        .querySelector('.rtm-amv-species-tab__status--complete'),
    ).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Cedar, warning' })).toBeVisible()
    expect(newHemlockCombination).toHaveValue('0')
    expect(missingHemlockValue).toHaveValue('81.43')
    expect(
      within(hemlockTable).queryByText(
        'No value has ever been set for this grade. Confirm this species and grade combination is valid.',
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
        expect.objectContaining({ species: 'HE', grade: 'B', newValue: 0 }),
        expect.objectContaining({ species: 'HE', grade: 'H', newValue: 81.43 }),
      ]),
    )

    expect(hemlockTable).toBeVisible()
    const savedToastTitle = screen.getByText('Values saved')
    expect(savedToastTitle).toBeVisible()
    const savedToast = savedToastTitle.closest('.cds--toast-notification') as HTMLElement
    expect(savedToast).toHaveClass('cds--toast-notification--success')
    expect(document.getElementById(APP_NOTIFICATION_REGION_ID)).toContainElement(savedToast)
    expect(screen.getByText(/They take effect on [A-Z][a-z]+ 1, \d{4}\./)).toBeVisible()
    expect(screen.getByText('Last saved')).toBeVisible()
    expect(screen.getByText('August 11, 2026, 6:21 PM by IDIR\\MGURJAOD')).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Values', level: 2 })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Replace file' })).toBeVisible()
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
      'The table will return to your last saved values. Changes made since then will be discarded.',
    )
    expect(within(savedChangesDialog).getByRole('button', { name: 'Discard changes' })).toHaveClass(
      'cds--btn--danger--tertiary',
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

  it('blocks malformed or out-of-range review values without misreading commas', async () => {
    mockedPreviewUpload.mockResolvedValue({
      status: 'accepted',
      fileName: 'Filename.xlsx',
      fileSize: 3,
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
    await renderUploadPage()
    const workbook = new File([new Uint8Array([1, 2, 3])], 'Filename.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    await userEvent.upload(
      screen.getByLabelText('Average monthly values upload spreadsheet'),
      workbook,
    )
    const valueInput = await screen.findByLabelText('Balsam grade D September 2026 value')
    const saveButton = screen.getByRole('button', { name: 'Save values' })

    for (const invalidValue of ['1,2', 'abc', '-1', '12.345', '9,999.999', '10000', '00000']) {
      await userEvent.clear(valueInput)
      await userEvent.type(valueInput, invalidValue)
      expect(valueInput).toHaveAttribute('aria-invalid', 'true')
      expect(
        screen.getByText('Enter a number from 0 to 9999.99 with no more than two decimal places.'),
      ).toBeVisible()
      expect(saveButton).toBeDisabled()
    }

    await userEvent.clear(valueInput)
    await userEvent.type(valueInput, '9,999.99')
    expect(valueInput).not.toHaveAttribute('aria-invalid')
    expect(saveButton).toBeEnabled()
    await userEvent.click(saveButton)

    await waitFor(() => expect(mockedSaveBatch).toHaveBeenCalledTimes(1))
    expect(mockedSaveBatch.mock.calls[0][0].values).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ species: 'BA', grade: 'D', newValue: 9999.99 }),
      ]),
    )
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
    await renderUploadPage()
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
      rowCount: 6,
      retrievalDate: '2026-06-01',
      updateDate: '2026-07-01',
      errors: [],
      warnings: [],
      rows: [
        {
          species: 'WH',
          grade: 'B',
          growthIndicator: 'O',
          retrievalDate: '2026-06-01',
          updateDate: '2026-07-01',
          currentValue: 9,
          newValue: 10,
          returnCode: '0',
        },
        {
          species: 'LO',
          grade: 'B',
          growthIndicator: 'O',
          retrievalDate: '2026-06-01',
          updateDate: '2026-07-01',
          currentValue: 9,
          newValue: 10,
          returnCode: '0',
        },
        {
          species: 'YE',
          grade: 'B',
          growthIndicator: 'O',
          retrievalDate: '2026-06-01',
          updateDate: '2026-07-01',
          currentValue: 9,
          newValue: 10,
          returnCode: '0',
        },
        {
          species: 'BA',
          grade: 'A',
          growthIndicator: 'O',
          retrievalDate: '2026-06-01',
          updateDate: '2026-07-01',
          currentValue: 99,
          newValue: 100,
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
    await renderUploadPage()
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
      within(table).getByRole('columnheader', { name: 'Value in effect (June 2026)' }),
    ).toBeVisible()
    expect(within(table).getByRole('columnheader', { name: 'July 2026' })).toBeVisible()
    expect(within(table).getByRole('row', { name: /B.*9\.00.*10\.00/ })).toBeVisible()
    expect(within(table).queryByRole('cell', { name: 'A' })).not.toBeInTheDocument()
    expect(within(table).queryByRole('row', { name: /W.*4\.00/ })).not.toBeInTheDocument()
    expect(within(table).queryByRole('row', { name: /BLANK.*5\.00/ })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Save values' }))
    await waitFor(() => {
      expect(mockedSaveBatch).toHaveBeenCalledTimes(1)
    })
    const request = mockedSaveBatch.mock.calls[0][0]
    expect(request.values).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ species: 'PINE', grade: 'B', newValue: 10 }),
        expect.objectContaining({ species: 'PINE', grade: 'BLANK', newValue: 1 }),
      ]),
    )
    expect(request.values).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ grade: 'A' }),
        expect.objectContaining({ grade: 'W' }),
      ]),
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
    await renderUploadPage()
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

    const savingButton = screen.getByRole('button', { name: 'Saving values' })
    expect(savingButton).toBeDisabled()
    expect(savingButton.querySelector('.cds--loading')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()

    await act(async () => rejectSave(new Error('unavailable')))

    expect(await screen.findByText('Unable to apply average monthly value upload.')).toBeVisible()
    expect(reviewTable).toBeVisible()
    expect(screen.getByRole('button', { name: 'Save values' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled()
  })
})
