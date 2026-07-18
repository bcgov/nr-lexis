import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import RTMEmsLogAmvPage from '@/pages/RTMEmsLogAmv'
import {
  saveRtmEmsLogAmvBatch,
  searchLatestRtmEmsLogAmv,
  searchRtmEmsLogAmv,
  type RtmEmsLogAmvRow,
} from '@/service/rtm-emslogamv-service'
import { createTestAuthContext } from '@/test-utils/auth'
import { formatBusinessIsoDate } from '@/utils/date'

vi.mock('@/context/auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/service/rtm-emslogamv-service', () => ({
  saveRtmEmsLogAmvBatch: vi.fn(),
  searchLatestRtmEmsLogAmv: vi.fn(),
  searchRtmEmsLogAmv: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)
const mockedSaveBatch = vi.mocked(saveRtmEmsLogAmvBatch)
const mockedSearchLatest = vi.mocked(searchLatestRtmEmsLogAmv)
const mockedSearch = vi.mocked(searchRtmEmsLogAmv)

const CURRENT_MONTH = `${formatBusinessIsoDate().slice(0, 7)}-01`

const monthOffset = (dateValue: string, offset: number) => {
  const [year, month] = dateValue.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1 + offset, 1)).toISOString().slice(0, 10)
}

const PREVIOUS_MONTH = monthOffset(CURRENT_MONTH, -1)

const row = (
  species: string,
  grade: string,
  growthIndicator: string,
  retrievalDate: string,
  value: number | null,
): RtmEmsLogAmvRow => ({
  species,
  grade,
  growthIndicator,
  retrievalDate,
  updateDate: retrievalDate,
  currentValue: value,
  newValue: value,
  returnCode: '0',
})

const mockRows = (
  currentRows: RtmEmsLogAmvRow[] = [],
  previousRows: RtmEmsLogAmvRow[] = [],
  currentDate = CURRENT_MONTH,
) => {
  const previousDate = monthOffset(currentDate, -1)
  mockedSearch.mockImplementation(async (filters) => {
    if (filters.retrievalDate === currentDate) {
      return currentRows
    }
    if (filters.retrievalDate === previousDate) {
      return previousRows
    }
    return []
  })
}

const waitForMonthLoad = async (date = CURRENT_MONTH) => {
  await waitFor(() =>
    expect(mockedSearch).toHaveBeenCalledWith({
      species: '',
      growthIndicator: 'O',
      retrievalDate: date,
      updateDate: date,
    }),
  )
  await waitFor(() => expect(screen.getByRole('button', { name: 'Reload' })).toBeEnabled())
}

const amvCell = (speciesLabel: string, grade: string) =>
  screen.getByLabelText(`${speciesLabel} grade ${grade}`)

describe('RTM EMS Log AMV actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.config = {}
    mockedUseAuth.mockReturnValue(createTestAuthContext({ canPerform: () => true }))
    mockedSaveBatch.mockResolvedValue({
      status: 'accepted',
      message: 'Average monthly values saved.',
      errors: [],
      rows: [],
    })
    mockedSearchLatest.mockResolvedValue([])
    mockRows()
  })

  it('renders one monthly value table without growth radios, W, or a blank row', async () => {
    render(<RTMEmsLogAmvPage />)
    await waitForMonthLoad()

    expect(screen.getByLabelText('Effective month')).toHaveAttribute('type', 'month')
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    expect(screen.getByText('Maintain one monthly value for each species and grade.')).toBeVisible()
    expect(
      screen.getByText(
        'Each cell represents one species and grade for the selected effective month.',
      ),
    ).toBeVisible()
    expect(screen.queryByText(/old[-\s]+and second[-\s]+growth/i)).not.toBeInTheDocument()

    const table = screen.getByRole('table', { name: 'Average monthly value table' })
    ;[
      'Balsam (BA)',
      'Hemlock (HE)',
      'Cedar (CE)',
      'Cypress (CY)',
      'Fir (FI)',
      'Spruce (SP)',
      'Pine',
    ].forEach((label) => {
      expect(within(table).getByRole('columnheader', { name: label })).toBeVisible()
    })
    expect(
      within(table).queryByRole('columnheader', { name: /white pine|lodgepole|yellow pine/i }),
    ).not.toBeInTheDocument()
    expect(within(table).getAllByRole('row')).toHaveLength(24)
    expect(screen.queryByLabelText('Balsam (BA) grade W')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Balsam (BA) grade BLANK')).not.toBeInTheDocument()
  })

  it('uses the displayed data as the baseline and saves a single atomic batch', async () => {
    const user = userEvent.setup()
    mockRows([
      row('BA', 'A', 'O', CURRENT_MONTH, 10),
      row('BA', 'A', 'S', CURRENT_MONTH, 99),
      row('WH', 'A', 'O', CURRENT_MONTH, 20),
      row('LO', 'A', 'O', CURRENT_MONTH, 20),
      row('YE', 'A', 'O', CURRENT_MONTH, 20),
    ])

    render(<RTMEmsLogAmvPage />)
    await waitForMonthLoad()

    const balsam = amvCell('Balsam (BA)', 'A')
    const pine = amvCell('Pine', 'A')
    expect(balsam).toHaveValue('10')
    expect(pine).toHaveValue('20')

    await user.clear(balsam)
    await user.type(balsam, '12.5')
    await user.clear(pine)
    await user.type(pine, '24')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(mockedSaveBatch).toHaveBeenCalledTimes(1))
    expect(mockedSaveBatch).toHaveBeenCalledWith({
      values: expect.arrayContaining([
        expect.objectContaining({
          species: 'BA',
          grade: 'A',
          growthIndicator: 'O',
          newValue: 12.5,
          saveMode: 'update',
        }),
        expect.objectContaining({
          species: 'PINE',
          grade: 'A',
          growthIndicator: 'O',
          newValue: 24,
          saveMode: 'update',
        }),
      ]),
    })
    expect(screen.getByText('Saved 2 table cells.')).toBeVisible()
  })

  it('treats clearing an existing value as a no-op and omits it from the batch', async () => {
    const user = userEvent.setup()
    mockRows([row('BA', 'A', 'O', CURRENT_MONTH, 10), row('HE', 'A', 'O', CURRENT_MONTH, 20)])

    render(<RTMEmsLogAmvPage />)
    await waitForMonthLoad()

    const balsam = amvCell('Balsam (BA)', 'A')
    const hemlock = amvCell('Hemlock (HE)', 'A')
    await user.clear(balsam)
    await user.type(balsam, '-')

    expect(screen.queryByText(/Balsam \(BA\) grade A is required/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()

    await user.tab()
    expect(balsam).toHaveValue('10')

    await user.clear(hemlock)
    await user.type(hemlock, '21')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(mockedSaveBatch).toHaveBeenCalledTimes(1))
    const [{ values }] = mockedSaveBatch.mock.calls[0]
    expect(values).toEqual([
      expect.objectContaining({
        species: 'HE',
        grade: 'A',
        growthIndicator: 'O',
        newValue: 21,
        saveMode: 'update',
      }),
    ])
  })

  it('treats a dash as an empty starting value instead of an invalid number', async () => {
    const user = userEvent.setup()
    mockedSearchLatest.mockResolvedValue([
      row('BA', 'A', 'O', PREVIOUS_MONTH, 10),
      row('HE', 'A', 'O', PREVIOUS_MONTH, 20),
    ])
    render(<RTMEmsLogAmvPage />)
    await waitForMonthLoad()

    const hemlock = amvCell('Hemlock (HE)', 'A')
    await user.clear(hemlock)
    await user.type(hemlock, '-')

    expect(
      screen.queryByText(/Hemlock \(HE\) grade A must be a number from 0 to 9999.99/i),
    ).not.toBeInTheDocument()
    expect(
      screen.getByText(
        /Hemlock \(HE\) grade A had a value in the starting values and is now blank/i,
      ),
    ).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(mockedSaveBatch).toHaveBeenCalledTimes(1))
    expect(mockedSaveBatch).toHaveBeenCalledWith({
      values: [
        expect.objectContaining({
          species: 'BA',
          grade: 'A',
          growthIndicator: 'O',
          newValue: 10,
          saveMode: 'create',
        }),
      ],
    })
  })

  it('copies only old-growth values into a new month and sends the first day of every month', async () => {
    mockedSearchLatest.mockResolvedValue([
      row('BA', 'A', 'O', PREVIOUS_MONTH, 10.25),
      row('BA', 'A', 'S', PREVIOUS_MONTH, 99),
    ])
    render(<RTMEmsLogAmvPage />)
    await waitForMonthLoad()

    expect(amvCell('Balsam (BA)', 'A')).toHaveValue('10.25')
    expect(amvCell('Balsam (BA)', 'A')).toHaveClass('rtm-amv-cell-input')

    fireEvent.change(screen.getByLabelText('Effective month'), { target: { value: '2000-02' } })
    await waitForMonthLoad('2000-02-01')
    expect(mockedSearch).toHaveBeenCalledWith(
      expect.objectContaining({ retrievalDate: '2000-01-01', updateDate: '2000-01-01' }),
    )
    expect(amvCell('Balsam (BA)', 'Z')).toBeVisible()
    expect(amvCell('Balsam (BA)', '1')).toBeVisible()
    expect(amvCell('Balsam (BA)', '2')).toBeVisible()
  })

  it('blocks invalid values before a batch is sent', async () => {
    const user = userEvent.setup()
    render(<RTMEmsLogAmvPage />)
    await waitForMonthLoad()

    const balsam = amvCell('Balsam (BA)', 'A')
    await user.type(balsam, '-1')
    expect(screen.getByText(/must be a number from 0 to 9999.99/i)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
    expect(mockedSaveBatch).not.toHaveBeenCalled()
  })

  it('keeps edits in place when the atomic batch is rejected', async () => {
    const user = userEvent.setup()
    mockedSaveBatch.mockResolvedValue({
      status: 'validation_failed',
      message: 'Average monthly value validation failed.',
      errors: ['Pine grade A is outside the allowed range.'],
      rows: [],
    })
    render(<RTMEmsLogAmvPage />)
    await waitForMonthLoad()

    const pine = amvCell('Pine', 'A')
    await user.type(pine, '123.45')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(mockedSaveBatch).toHaveBeenCalledTimes(1))
    expect(screen.getByText(/Pine grade A is outside the allowed range/)).toBeVisible()
    expect(pine).toHaveValue('123.45')
  })

  it('keeps the matrix read-only without the admin authority', async () => {
    mockedUseAuth.mockReturnValue(createTestAuthContext({ canPerform: () => false }))
    render(<RTMEmsLogAmvPage />)
    await waitForMonthLoad()

    expect(amvCell('Balsam (BA)', 'A')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
  })
})
