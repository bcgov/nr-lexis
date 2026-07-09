import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import RTMEmsLogAmvPage from '@/pages/RTMEmsLogAmv'
import {
  saveRtmEmsLogAmv,
  searchRtmEmsLogAmv,
  type RtmEmsLogAmvRow,
} from '@/service/rtm-emslogamv-service'
import { createTestAuthContext } from '@/test-utils/auth'

vi.mock('@/context/auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/service/rtm-emslogamv-service', () => ({
  saveRtmEmsLogAmv: vi.fn(),
  searchRtmEmsLogAmv: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)
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

const confirmDailyWarningSave = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(await screen.findByRole('button', { name: 'Save warned changes' }))
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
    expect(await screen.findByText('Confirm daily value changes')).toBeVisible()
    expect(mockedSave).not.toHaveBeenCalled()
    await confirmDailyWarningSave(user)

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
      message: 'Past effective dates are read-only.',
      errors: ['Past effective dates are read-only.'],
      rows: [],
    })

    render(<RTMEmsLogAmvPage />)
    await selectTargetDate()

    await user.type(screen.getByLabelText('Balsam grade A'), '11')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await confirmDailyWarningSave(user)

    expect(await screen.findByText(/Past effective dates are read-only/)).toBeVisible()
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
    await confirmDailyWarningSave(user)

    expect(await screen.findByText('Second growth row could not be saved.')).toBeVisible()
    await waitFor(() => {
      expect(input).toHaveValue('12')
      expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled()
    })
    expect(mockedSave).toHaveBeenCalledTimes(2)
  })

  it('does not show daily warnings or confirmation for future dates', async () => {
    const user = userEvent.setup()
    mockSearchRows({ current: [], previous: [] })

    render(<RTMEmsLogAmvPage />)
    await selectTargetDate(FUTURE_DATE)

    await user.type(screen.getByLabelText('Balsam grade A'), '11')
    expect(screen.queryByRole('heading', { name: 'Warnings' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(mockedSave).toHaveBeenCalledTimes(2))
    expect(screen.queryByText('Confirm daily value changes')).not.toBeInTheDocument()
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

  it('locks table inputs for past effective dates', async () => {
    const user = userEvent.setup()
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
    expect(input).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(mockedSave).not.toHaveBeenCalled()
  })
})
