import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import RTMEmsLogAmvPage from '@/pages/RTMEmsLogAmv'
import {
  saveRtmEmsLogAmv,
  searchLatestRtmEmsLogAmv,
  searchRtmEmsLogAmv,
  type RtmEmsLogAmvRow,
} from '@/service/rtm-emslogamv-service'
import { createTestAuthContext } from '@/test-utils/auth'

vi.mock('@/context/auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/service/rtm-emslogamv-service', () => ({
  saveRtmEmsLogAmv: vi.fn(),
  searchLatestRtmEmsLogAmv: vi.fn(),
  searchRtmEmsLogAmv: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)
const mockedSearchLatest = vi.mocked(searchLatestRtmEmsLogAmv)
const mockedSearch = vi.mocked(searchRtmEmsLogAmv)
const mockedSave = vi.mocked(saveRtmEmsLogAmv)

const toLocalIsoDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

const dateOffsetFromToday = (offset: number) => {
  const date = new Date()
  date.setDate(date.getDate() + offset)
  return toLocalIsoDate(date)
}

const TARGET_DATE = dateOffsetFromToday(0)
const PREVIOUS_DAY_DATE = dateOffsetFromToday(-1)
const FUTURE_DATE = dateOffsetFromToday(1)

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

const previousRows: RtmEmsLogAmvRow[] = [
  row('BA', 'A', 'O', PREVIOUS_DAY_DATE, 10.25),
  row('BA', 'A', 'S', PREVIOUS_DAY_DATE, 10.25),
  row('WH', 'A', 'O', PREVIOUS_DAY_DATE, 30.75),
  row('LO', 'A', 'O', PREVIOUS_DAY_DATE, 30.75),
  row('YE', 'A', 'O', PREVIOUS_DAY_DATE, 30.75),
  row('WH', 'A', 'S', PREVIOUS_DAY_DATE, 30.75),
  row('LO', 'A', 'S', PREVIOUS_DAY_DATE, 30.75),
  row('YE', 'A', 'S', PREVIOUS_DAY_DATE, 30.75),
]

const currentRows: RtmEmsLogAmvRow[] = [
  row('HE', 'A', 'O', TARGET_DATE, 20.5),
  row('HE', 'A', 'S', TARGET_DATE, 20.5),
]

const mockSearchRows = ({
  current = currentRows,
  previous = previousRows,
}: {
  current?: RtmEmsLogAmvRow[]
  previous?: RtmEmsLogAmvRow[]
} = {}) => {
  mockedSearch.mockImplementation(async (filters) => {
    if (filters.retrievalDate === TARGET_DATE) {
      return current
    }
    if (filters.retrievalDate === PREVIOUS_DAY_DATE) {
      return previous
    }
    return []
  })
}

const selectTargetDate = async (date = TARGET_DATE) => {
  fireEvent.change(await screen.findByLabelText('Effective date'), {
    target: { value: date },
  })
  await waitFor(() =>
    expect(mockedSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        retrievalDate: date,
        updateDate: date,
      }),
    ),
  )
}

const confirmAmvSave = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(await screen.findByRole('button', { name: 'Confirm and save' }))
}

describe('RTM EMS Log AMV actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.config = {}
    mockedUseAuth.mockReturnValue(createTestAuthContext({ canPerform: () => true }))
    mockedSave.mockResolvedValue({
      status: 'accepted',
      message: 'Average monthly value row saved.',
      errors: [],
      rows: [],
    })
    mockedSearchLatest.mockResolvedValue([])
    mockSearchRows()
  })

  it('renders the editable average monthly value table without upload controls', async () => {
    render(<RTMEmsLogAmvPage />)
    await selectTargetDate()

    await screen.findByRole('heading', { name: 'Average Monthly Values' })
    expect(
      screen.getByText(
        'Maintain average monthly values directly in the table. Each saved value is persisted for old and second growth.',
      ),
    ).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Upload' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Download template' })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Choose an average monthly values upload spreadsheet' }),
    ).not.toBeInTheDocument()

    const table = screen.getByRole('table', { name: 'Average monthly value table' })
    expect(within(table).getByRole('columnheader', { name: 'Balsam' })).toBeVisible()
    expect(within(table).getByRole('columnheader', { name: 'Pine' })).toBeVisible()
    expect(within(table).getAllByRole('row')).toHaveLength(24)
    expect(screen.getByLabelText('Hemlock grade A')).toHaveValue('20.5')
    expect(screen.getByLabelText('Balsam grade A')).toHaveValue('')
    expect(screen.getByLabelText('Balsam grade A')).toHaveAttribute('placeholder', '-')
    expect(screen.getByText(/Balsam grade A had a value yesterday/)).toBeVisible()
    expect(
      screen.getByText(/Hemlock grade A is newly populated; it was blank yesterday/),
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
  })

  it("saves daily cells for both growth types using yesterday's row when available", async () => {
    const user = userEvent.setup()
    mockSearchRows({
      current: [],
      previous: [
        row('BA', 'A', 'O', PREVIOUS_DAY_DATE, 10.25),
        row('BA', 'A', 'S', PREVIOUS_DAY_DATE, 10.25),
      ],
    })

    render(<RTMEmsLogAmvPage />)
    await selectTargetDate()

    await user.type(screen.getByLabelText('Balsam grade A'), '11')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled())
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await confirmAmvSave(user)

    await waitFor(() => expect(mockedSave).toHaveBeenCalledTimes(2))
    expect(mockedSave).toHaveBeenNthCalledWith(1, {
      species: 'BA',
      grade: 'A',
      growthIndicator: 'O',
      retrievalDate: PREVIOUS_DAY_DATE,
      updateDate: TARGET_DATE,
      newValue: 11,
      saveMode: 'update',
    })
    expect(mockedSave).toHaveBeenNthCalledWith(2, {
      species: 'BA',
      grade: 'A',
      growthIndicator: 'S',
      retrievalDate: PREVIOUS_DAY_DATE,
      updateDate: TARGET_DATE,
      newValue: 11,
      saveMode: 'update',
    })
  })

  it('fans pine edits out to WH, LO and YE for old and second growth', async () => {
    const user = userEvent.setup()
    mockSearchRows({ current: [], previous: [] })

    render(<RTMEmsLogAmvPage />)
    await selectTargetDate()

    await user.type(screen.getByLabelText('Pine grade A'), '30.75')
    expect(screen.getByText(/Pine grade A is newly populated/)).toBeVisible()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled())
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Confirm AMV changes')).toBeVisible()
    expect(screen.getByText('Review the following before saving 1 changed cell.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeVisible()
    expect(mockedSave).not.toHaveBeenCalled()
    await confirmAmvSave(user)

    await waitFor(() => expect(mockedSave).toHaveBeenCalledTimes(6))
    expect(mockedSave.mock.calls.map(([request]) => request)).toEqual([
      {
        species: 'WH',
        grade: 'A',
        growthIndicator: 'O',
        retrievalDate: TARGET_DATE,
        updateDate: TARGET_DATE,
        newValue: 30.75,
        saveMode: 'create',
      },
      {
        species: 'WH',
        grade: 'A',
        growthIndicator: 'S',
        retrievalDate: TARGET_DATE,
        updateDate: TARGET_DATE,
        newValue: 30.75,
        saveMode: 'create',
      },
      {
        species: 'LO',
        grade: 'A',
        growthIndicator: 'O',
        retrievalDate: TARGET_DATE,
        updateDate: TARGET_DATE,
        newValue: 30.75,
        saveMode: 'create',
      },
      {
        species: 'LO',
        grade: 'A',
        growthIndicator: 'S',
        retrievalDate: TARGET_DATE,
        updateDate: TARGET_DATE,
        newValue: 30.75,
        saveMode: 'create',
      },
      {
        species: 'YE',
        grade: 'A',
        growthIndicator: 'O',
        retrievalDate: TARGET_DATE,
        updateDate: TARGET_DATE,
        newValue: 30.75,
        saveMode: 'create',
      },
      {
        species: 'YE',
        grade: 'A',
        growthIndicator: 'S',
        retrievalDate: TARGET_DATE,
        updateDate: TARGET_DATE,
        newValue: 30.75,
        saveMode: 'create',
      },
    ])
  })

  it('shows save failures in the table notification', async () => {
    const user = userEvent.setup()
    mockSearchRows({ current: [], previous: [] })
    mockedSave.mockResolvedValue({
      status: 'validation_failed',
      message: 'Average monthly value validation failed.',
      errors: ['Average monthly value validation failed.'],
      rows: [],
    })

    render(<RTMEmsLogAmvPage />)
    await selectTargetDate()

    await user.type(screen.getByLabelText('Balsam grade A'), '11')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await confirmAmvSave(user)

    expect(await screen.findByText(/Average monthly value validation failed/)).toBeVisible()
  })

  it('reloads partial saves and keeps failed cells ready to retry', async () => {
    const user = userEvent.setup()
    let savedCurrentRows = [row('BA', 'A', 'O', TARGET_DATE, 11)]
    mockedSearch.mockImplementation(async (filters) =>
      filters.retrievalDate === TARGET_DATE ? savedCurrentRows : [],
    )
    mockedSave
      .mockImplementationOnce(async () => {
        savedCurrentRows = [row('BA', 'A', 'O', TARGET_DATE, 12)]
        return {
          status: 'accepted',
          message: 'Average monthly value row saved.',
          errors: [],
          rows: [],
        }
      })
      .mockResolvedValueOnce({
        status: 'validation_failed',
        message: 'Second growth row could not be saved.',
        errors: ['Second growth row could not be saved.'],
        rows: [],
      })

    render(<RTMEmsLogAmvPage />)
    await selectTargetDate()

    const input = screen.getByLabelText('Balsam grade A')
    expect(input).toHaveValue('11')
    await user.clear(input)
    await user.type(input, '12')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await confirmAmvSave(user)

    expect(await screen.findByText('Second growth row could not be saved.')).toBeVisible()
    await waitFor(() => {
      expect(input).toHaveValue('12')
      expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled()
    })
    expect(mockedSave).toHaveBeenCalledTimes(2)
  })

  it('warns and confirms when a future-date value is added to an empty cell', async () => {
    const user = userEvent.setup()
    mockSearchRows({ current: [], previous: [] })

    render(<RTMEmsLogAmvPage />)
    await selectTargetDate(FUTURE_DATE)

    const input = screen.getByLabelText('Balsam grade A')
    await user.type(input, '11')
    expect(screen.getByRole('heading', { name: 'Warnings' })).toBeVisible()
    expect(screen.getByText(/no value is saved for the selected effective date/)).toBeVisible()
    expect(input.closest('td')).toHaveClass('has-warning', 'is-added')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Confirm AMV changes')).toBeVisible()
    expect(mockedSave).not.toHaveBeenCalled()
    await confirmAmvSave(user)
    await waitFor(() => expect(mockedSave).toHaveBeenCalledTimes(2))
  })

  it('keeps ordinary value-to-value edits as standard unsaved changes', async () => {
    const user = userEvent.setup()
    mockSearchRows({
      current: [row('BA', 'A', 'O', TARGET_DATE, 10.25), row('BA', 'A', 'S', TARGET_DATE, 10.25)],
      previous: [
        row('BA', 'A', 'O', PREVIOUS_DAY_DATE, 10.25),
        row('BA', 'A', 'S', PREVIOUS_DAY_DATE, 10.25),
      ],
    })

    render(<RTMEmsLogAmvPage />)
    await selectTargetDate()

    const input = screen.getByLabelText('Balsam grade A')
    await user.clear(input)
    await user.type(input, '11')

    expect(input.closest('td')).toHaveClass('is-dirty', 'is-changed')
    expect(input.closest('td')).not.toHaveClass('has-warning')
    expect(screen.queryByRole('heading', { name: 'Warnings' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(mockedSave).toHaveBeenCalledTimes(2))
    expect(screen.queryByText('Confirm AMV changes')).not.toBeInTheDocument()
  })

  it.each([
    ['today', TARGET_DATE, dateOffsetFromToday(-8)],
    ['an intervening past date', '2000-01-02', '2000-01-01'],
  ])('prefills empty values for %s from the latest earlier entry', async (_, date, sourceDate) => {
    mockSearchRows({ current: [], previous: [] })
    mockedSearchLatest.mockResolvedValue([
      row('BA', 'A', 'O', sourceDate, 10.25),
      row('BA', 'A', 'S', sourceDate, 10.25),
    ])

    render(<RTMEmsLogAmvPage />)
    await selectTargetDate(date)

    await waitFor(() => expect(mockedSearchLatest).toHaveBeenCalledWith(date))
    expect(screen.getByLabelText('Balsam grade A')).toHaveValue('10.25')
    expect(screen.getByRole('heading', { name: 'Starting values copied' })).toBeVisible()
    expect(screen.getByText(/These values are not saved/)).toBeVisible()
    expect(screen.getByLabelText('Balsam grade A').closest('td')).toHaveClass(
      'has-warning',
      'is-added',
    )
    expect(mockedSave).not.toHaveBeenCalled()
  })

  it('prefills an empty future date from the latest values without saving automatically', async () => {
    const user = userEvent.setup()
    const sourceDate = dateOffsetFromToday(-7)
    mockSearchRows({ current: [], previous: [] })
    mockedSearchLatest.mockResolvedValue([
      row('BA', 'A', 'O', sourceDate, 10.25),
      row('BA', 'A', 'S', sourceDate, 10.25),
      row('HE', 'A', 'O', sourceDate, 20.5),
      row('HE', 'A', 'S', sourceDate, 20.5),
    ])

    render(<RTMEmsLogAmvPage />)
    await selectTargetDate(FUTURE_DATE)

    await waitFor(() => expect(mockedSearchLatest).toHaveBeenCalledWith(FUTURE_DATE))
    expect(screen.getByLabelText('Balsam grade A')).toHaveValue('10.25')
    expect(screen.getByLabelText('Hemlock grade A')).toHaveValue('20.5')
    expect(screen.getByRole('heading', { name: 'Starting values copied' })).toBeVisible()
    expect(screen.getByText(/These values are not saved/)).toBeVisible()
    expect(mockedSave).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled()

    const balsamInput = screen.getByLabelText('Balsam grade A')
    await user.clear(balsamInput)
    await user.type(balsamInput, '11')
    await user.click(screen.getByRole('button', { name: 'Reset' }))
    expect(balsamInput).toHaveValue('10.25')
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Confirm AMV changes')).toBeVisible()
    await confirmAmvSave(user)
    await waitFor(() => expect(mockedSave).toHaveBeenCalledTimes(4))
    expect(mockedSave.mock.calls.map(([request]) => request)).toEqual([
      {
        species: 'BA',
        grade: 'A',
        growthIndicator: 'O',
        retrievalDate: FUTURE_DATE,
        updateDate: FUTURE_DATE,
        newValue: 10.25,
        saveMode: 'create',
      },
      {
        species: 'BA',
        grade: 'A',
        growthIndicator: 'S',
        retrievalDate: FUTURE_DATE,
        updateDate: FUTURE_DATE,
        newValue: 10.25,
        saveMode: 'create',
      },
      {
        species: 'HE',
        grade: 'A',
        growthIndicator: 'O',
        retrievalDate: FUTURE_DATE,
        updateDate: FUTURE_DATE,
        newValue: 20.5,
        saveMode: 'create',
      },
      {
        species: 'HE',
        grade: 'A',
        growthIndicator: 'S',
        retrievalDate: FUTURE_DATE,
        updateDate: FUTURE_DATE,
        newValue: 20.5,
        saveMode: 'create',
      },
    ])
  })

  it('blocks blank, over-precise and out-of-range table values before save', async () => {
    const user = userEvent.setup()
    mockSearchRows({
      current: [row('BA', 'A', 'O', TARGET_DATE, 10.25), row('BA', 'A', 'S', TARGET_DATE, 10.25)],
      previous: [],
    })

    render(<RTMEmsLogAmvPage />)
    await selectTargetDate()

    const input = screen.getByLabelText('Balsam grade A')
    await user.clear(input)
    expect(input.closest('td')).toHaveClass('has-warning', 'is-removed')
    expect(screen.getByText(/has a saved value and is now blank/)).toBeVisible()
    expect(screen.getByText('Balsam grade A is required.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()

    await user.type(input, '10.123')
    expect(
      screen.getByText(
        'Balsam grade A must be a number from 0 to 9999.99 with no more than two decimal places.',
      ),
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()

    await user.clear(input)
    await user.type(input, '10000')
    expect(
      screen.getByText(
        'Balsam grade A must be a number from 0 to 9999.99 with no more than two decimal places.',
      ),
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
    expect(mockedSave).not.toHaveBeenCalled()
  })

  it('allows past-date edits after explicit confirmation', async () => {
    const user = userEvent.setup()
    mockSearchRows({ current: [], previous: [] })
    render(<RTMEmsLogAmvPage />)

    fireEvent.change(await screen.findByLabelText('Effective date'), {
      target: { value: '2000-01-01' },
    })

    await waitFor(() =>
      expect(mockedSearch).toHaveBeenCalledWith(
        expect.objectContaining({
          retrievalDate: '2000-01-01',
          updateDate: '2000-01-01',
        }),
      ),
    )
    expect(screen.getByRole('heading', { name: 'Past date selected' })).toBeVisible()
    const input = screen.getByLabelText('Balsam grade A')
    expect(input).toBeEnabled()
    await user.type(input, '11')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(mockedSave).not.toHaveBeenCalled()
    expect(await screen.findByText('Confirm AMV changes')).toBeVisible()
    expect(screen.getByText(/which is in the past/)).toBeVisible()
    await confirmAmvSave(user)

    await waitFor(() => expect(mockedSave).toHaveBeenCalledTimes(2))
    expect(mockedSave.mock.calls.map(([request]) => request)).toEqual([
      {
        species: 'BA',
        grade: 'A',
        growthIndicator: 'O',
        retrievalDate: '2000-01-01',
        updateDate: '2000-01-01',
        newValue: 11,
        saveMode: 'create',
      },
      {
        species: 'BA',
        grade: 'A',
        growthIndicator: 'S',
        retrievalDate: '2000-01-01',
        updateDate: '2000-01-01',
        newValue: 11,
        saveMode: 'create',
      },
    ])
  })
})
