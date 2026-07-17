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
import { formatBusinessIsoDate } from '@/utils/date'

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
      growthIndicator: '',
      retrievalDate: date,
      updateDate: date,
    }),
  )
  await waitFor(() => expect(screen.getByRole('button', { name: 'Reload' })).toBeEnabled())
}

const oldGrowthCell = (speciesLabel: string, grade: string) =>
  screen.getByLabelText(`${speciesLabel} grade ${grade}, Old growth`)

const secondGrowthCell = (speciesLabel: string, grade: string) =>
  screen.getByLabelText(`${speciesLabel} grade ${grade}, Second growth`)

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
    mockRows()
  })

  it('renders the monthly physical-key matrix with legacy grades and explicit growth selection', async () => {
    render(<RTMEmsLogAmvPage />)
    await waitForMonthLoad()

    expect(screen.getByLabelText('Effective month')).toHaveAttribute('type', 'month')
    expect(screen.getByLabelText('Effective month')).toHaveValue(CURRENT_MONTH.slice(0, 7))
    expect(screen.getByRole('radio', { name: 'Old growth' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Second growth' })).not.toBeChecked()
    expect(
      screen.getByText(
        'Maintain one monthly value for each physical species, grade, and growth type.',
      ),
    ).toBeVisible()

    const table = screen.getByRole('table', {
      name: 'Old growth average monthly value table',
    })
    ;[
      'Balsam (BA)',
      'Hemlock (HE)',
      'Cedar (CE)',
      'Cypress (CY)',
      'Fir (FI)',
      'Spruce (SP)',
      'Western white pine (WH)',
      'Lodgepole pine (LO)',
      'Yellow pine (YE)',
    ].forEach((label) => {
      expect(within(table).getByRole('columnheader', { name: label })).toBeVisible()
    })
    expect(within(table).queryByRole('columnheader', { name: 'Pine' })).not.toBeInTheDocument()
    expect(within(table).getAllByRole('row')).toHaveLength(26)
    expect(oldGrowthCell('Balsam (BA)', 'W')).toBeVisible()
    expect(oldGrowthCell('Balsam (BA)', 'BLANK')).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Upload' })).not.toBeInTheDocument()

    expect(mockedSearch).toHaveBeenCalledWith(
      expect.objectContaining({ retrievalDate: PREVIOUS_MONTH, updateDate: PREVIOUS_MONTH }),
    )
    expect(mockedSearchLatest).toHaveBeenCalledWith(CURRENT_MONTH)
  })

  it('saves one selected physical old-growth key without collapsing pine or overwriting growth', async () => {
    const user = userEvent.setup()
    mockRows([
      row('WH', 'A', 'O', CURRENT_MONTH, 10),
      row('WH', 'A', 'S', CURRENT_MONTH, 11),
      row('LO', 'A', 'O', CURRENT_MONTH, 20),
      row('LO', 'A', 'S', CURRENT_MONTH, 21),
      row('YE', 'A', 'O', CURRENT_MONTH, 30),
      row('YE', 'A', 'S', CURRENT_MONTH, 31),
    ])

    render(<RTMEmsLogAmvPage />)
    await waitForMonthLoad()

    const westernWhitePine = oldGrowthCell('Western white pine (WH)', 'A')
    expect(westernWhitePine).toHaveValue('10')
    expect(oldGrowthCell('Lodgepole pine (LO)', 'A')).toHaveValue('20')
    expect(oldGrowthCell('Yellow pine (YE)', 'A')).toHaveValue('30')
    await user.clear(westernWhitePine)
    await user.type(westernWhitePine, '12.5')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(mockedSave).toHaveBeenCalledTimes(1))
    expect(mockedSave).toHaveBeenCalledWith({
      species: 'WH',
      grade: 'A',
      growthIndicator: 'O',
      retrievalDate: CURRENT_MONTH,
      updateDate: CURRENT_MONTH,
      newValue: 12.5,
      saveMode: 'update',
    })
  })

  it('shows and saves the independent second-growth value only after it is selected', async () => {
    const user = userEvent.setup()
    mockRows([
      row('WH', 'A', 'O', CURRENT_MONTH, 10),
      row('WH', 'A', 'S', CURRENT_MONTH, 17),
      row('LO', 'A', 'O', CURRENT_MONTH, 20),
      row('LO', 'A', 'S', CURRENT_MONTH, 27),
      row('YE', 'A', 'O', CURRENT_MONTH, 30),
      row('YE', 'A', 'S', CURRENT_MONTH, 37),
    ])

    render(<RTMEmsLogAmvPage />)
    await waitForMonthLoad()
    await user.click(screen.getByRole('radio', { name: 'Second growth' }))

    expect(secondGrowthCell('Western white pine (WH)', 'A')).toHaveValue('17')
    expect(secondGrowthCell('Lodgepole pine (LO)', 'A')).toHaveValue('27')
    expect(secondGrowthCell('Yellow pine (YE)', 'A')).toHaveValue('37')
    const westernWhitePine = secondGrowthCell('Western white pine (WH)', 'A')
    await user.clear(westernWhitePine)
    await user.type(westernWhitePine, '18')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(mockedSave).toHaveBeenCalledTimes(1))
    expect(mockedSave).toHaveBeenCalledWith(
      expect.objectContaining({
        species: 'WH',
        grade: 'A',
        growthIndicator: 'S',
        newValue: 18,
      }),
    )
  })

  it('keeps an explicit edit on its growth view until it is saved or reset', async () => {
    const user = userEvent.setup()
    mockRows([row('WH', 'A', 'O', CURRENT_MONTH, 10), row('WH', 'A', 'S', CURRENT_MONTH, 17)])

    render(<RTMEmsLogAmvPage />)
    await waitForMonthLoad()
    const oldGrowthValue = oldGrowthCell('Western white pine (WH)', 'A')
    await user.clear(oldGrowthValue)
    await user.type(oldGrowthValue, '12')
    expect(screen.getByRole('radio', { name: 'Second growth' })).toBeDisabled()
    expect(screen.getByLabelText('Effective month')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Previous month' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Reload' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Reset' }))
    expect(oldGrowthValue).toHaveValue('10')
    expect(screen.getByRole('radio', { name: 'Second growth' })).toBeEnabled()
    expect(screen.getByLabelText('Effective month')).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Previous month' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Reload' })).toBeEnabled()
    await user.click(screen.getByRole('radio', { name: 'Second growth' }))
    expect(secondGrowthCell('Western white pine (WH)', 'A')).toHaveValue('17')
  })

  it('uses month-only navigation and sends the first day for every query', async () => {
    const user = userEvent.setup()
    render(<RTMEmsLogAmvPage />)
    await waitForMonthLoad()

    await user.click(screen.getByRole('button', { name: 'Previous month' }))
    await waitFor(() =>
      expect(screen.getByLabelText('Effective month')).toHaveValue(PREVIOUS_MONTH.slice(0, 7)),
    )
    await waitFor(() =>
      expect(mockedSearch).toHaveBeenCalledWith(
        expect.objectContaining({ retrievalDate: PREVIOUS_MONTH, updateDate: PREVIOUS_MONTH }),
      ),
    )

    fireEvent.change(screen.getByLabelText('Effective month'), { target: { value: '2000-02' } })
    await waitFor(() =>
      expect(mockedSearch).toHaveBeenCalledWith(
        expect.objectContaining({ retrievalDate: '2000-02-01', updateDate: '2000-02-01' }),
      ),
    )
    expect(mockedSearch).toHaveBeenCalledWith(
      expect.objectContaining({ retrievalDate: '2000-01-01', updateDate: '2000-01-01' }),
    )
    expect(mockedSearchLatest).toHaveBeenCalledWith('2000-02-01')

    await waitFor(() => expect(screen.getByRole('button', { name: 'Current month' })).toBeEnabled())
    await user.click(screen.getByRole('button', { name: 'Current month' }))
    await waitFor(() =>
      expect(screen.getByLabelText('Effective month')).toHaveValue(CURRENT_MONTH.slice(0, 7)),
    )
  })

  it('uses the legacy historical grade set before the April 2006 rollover', async () => {
    render(<RTMEmsLogAmvPage />)
    await waitForMonthLoad()

    fireEvent.change(screen.getByLabelText('Effective month'), { target: { value: '2006-03' } })
    await waitForMonthLoad('2006-03-01')

    const historicTable = screen.getByRole('table', {
      name: 'Old growth average monthly value table',
    })
    expect(within(historicTable).getAllByRole('row')).toHaveLength(22)
    expect(oldGrowthCell('Balsam (BA)', 'X')).toBeVisible()
    expect(oldGrowthCell('Balsam (BA)', 'Y')).toBeVisible()
    expect(oldGrowthCell('Balsam (BA)', '3')).toBeVisible()
    expect(oldGrowthCell('Balsam (BA)', 'BLANK')).toBeVisible()
    ;['W', 'Z', '1', '2'].forEach((grade) => {
      expect(
        screen.queryByLabelText(`Balsam (BA) grade ${grade}, Old growth`),
      ).not.toBeInTheDocument()
    })
    expect(screen.getByText(/The historical grade set applies before April 2006/)).toBeVisible()

    fireEvent.change(screen.getByLabelText('Effective month'), { target: { value: '2006-04' } })
    await waitForMonthLoad('2006-04-01')
    ;['W', 'Z', '1', '2'].forEach((grade) => {
      expect(oldGrowthCell('Balsam (BA)', grade)).toBeVisible()
    })
  })

  it('round-trips legacy W and blank grades through explicit API grade values', async () => {
    const user = userEvent.setup()
    mockRows([row('BA', 'W', 'O', CURRENT_MONTH, 4), row('BA', ' ', 'O', CURRENT_MONTH, 5)])

    render(<RTMEmsLogAmvPage />)
    await waitForMonthLoad()
    expect(oldGrowthCell('Balsam (BA)', 'W')).toHaveValue('4')
    const blankGrade = oldGrowthCell('Balsam (BA)', 'BLANK')
    expect(blankGrade).toHaveValue('5')
    await user.clear(blankGrade)
    await user.type(blankGrade, '6')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(mockedSave).toHaveBeenCalledTimes(1))
    expect(mockedSave).toHaveBeenCalledWith({
      species: 'BA',
      grade: 'BLANK',
      growthIndicator: 'O',
      retrievalDate: CURRENT_MONTH,
      updateDate: CURRENT_MONTH,
      newValue: 6,
      saveMode: 'update',
    })
  })

  it('updates from the selected previous-month physical row without growth fan-out', async () => {
    const user = userEvent.setup()
    mockRows([], [row('BA', 'A', 'O', PREVIOUS_MONTH, 10.25)])

    render(<RTMEmsLogAmvPage />)
    await waitForMonthLoad()
    const input = oldGrowthCell('Balsam (BA)', 'A')
    expect(input).toHaveValue('')
    await user.type(input, '11')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(mockedSave).toHaveBeenCalledTimes(1))
    expect(mockedSave).toHaveBeenCalledWith({
      species: 'BA',
      grade: 'A',
      growthIndicator: 'O',
      retrievalDate: PREVIOUS_MONTH,
      updateDate: CURRENT_MONTH,
      newValue: 11,
      saveMode: 'update',
    })
  })

  it('carries forward only visible selected-growth keys', async () => {
    const user = userEvent.setup()
    const sourceMonth = monthOffset(CURRENT_MONTH, -2)
    mockedSearchLatest.mockResolvedValue([
      row('WH', 'A', 'O', sourceMonth, 10),
      row('WH', 'A', 'S', sourceMonth, 40),
    ])

    render(<RTMEmsLogAmvPage />)
    await waitForMonthLoad()
    expect(oldGrowthCell('Western white pine (WH)', 'A')).toHaveValue('10')
    expect(screen.getByRole('heading', { name: 'Starting values copied' })).toBeVisible()
    expect(
      screen.getByText(/latest available earlier value for each species, grade, and growth key/i),
    ).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(mockedSave).toHaveBeenCalledTimes(1))
    expect(mockedSave).toHaveBeenCalledWith({
      species: 'WH',
      grade: 'A',
      growthIndicator: 'O',
      retrievalDate: CURRENT_MONTH,
      updateDate: CURRENT_MONTH,
      newValue: 10,
      saveMode: 'create',
    })
  })

  it('blocks blank, over-precise, and out-of-range edits before save', async () => {
    const user = userEvent.setup()
    mockRows([row('BA', 'A', 'O', CURRENT_MONTH, 10.25)])

    render(<RTMEmsLogAmvPage />)
    await waitForMonthLoad()
    const input = oldGrowthCell('Balsam (BA)', 'A')
    await user.clear(input)
    expect(screen.getByText('Balsam (BA) grade A is required.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()

    await user.type(input, '10.123')
    expect(screen.getByText(/must be a number from 0 to 9999.99/)).toBeVisible()
    await user.clear(input)
    await user.type(input, '10000')
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
    expect(mockedSave).not.toHaveBeenCalled()
  })

  it('requires confirmation before updating a past month', async () => {
    const user = userEvent.setup()
    mockRows([], [], '2000-01-01')
    render(<RTMEmsLogAmvPage />)
    await waitForMonthLoad()

    fireEvent.change(screen.getByLabelText('Effective month'), { target: { value: '2000-01' } })
    await waitForMonthLoad('2000-01-01')
    expect(screen.getByRole('heading', { name: 'Past month selected' })).toBeVisible()
    await user.type(oldGrowthCell('Balsam (BA)', 'A'), '11')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(mockedSave).not.toHaveBeenCalled()
    expect(await screen.findByText('Confirm AMV changes')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Confirm and save' }))

    await waitFor(() => expect(mockedSave).toHaveBeenCalledTimes(1))
    expect(mockedSave).toHaveBeenCalledWith(
      expect.objectContaining({
        retrievalDate: '2000-01-01',
        updateDate: '2000-01-01',
        growthIndicator: 'O',
      }),
    )
  })

  it('keeps the matrix read-only without the admin authority', async () => {
    mockedUseAuth.mockReturnValue(createTestAuthContext({ canPerform: () => false }))
    mockRows([row('BA', 'A', 'O', CURRENT_MONTH, 10.25)])

    render(<RTMEmsLogAmvPage />)
    await waitForMonthLoad()
    expect(oldGrowthCell('Balsam (BA)', 'A')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
  })

  it('fails closed when the selected month cannot be loaded authoritatively', async () => {
    const user = userEvent.setup()
    mockedSearch.mockRejectedValue(new Error('Oracle unavailable'))

    render(<RTMEmsLogAmvPage />)

    expect(await screen.findByText('Unable to load average monthly values.')).toBeVisible()
    const input = oldGrowthCell('Balsam (BA)', 'A')
    expect(input).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
    await user.click(input)
    await user.keyboard('11')
    expect(input).toHaveValue('')
    expect(mockedSave).not.toHaveBeenCalled()
  })

  it('ignores an older month response that arrives after a newer load', async () => {
    let resolveOlderMonth: (rows: RtmEmsLogAmvRow[]) => void = () => undefined
    const olderMonthRows = new Promise<RtmEmsLogAmvRow[]>((resolve) => {
      resolveOlderMonth = resolve
    })

    render(<RTMEmsLogAmvPage />)
    await waitForMonthLoad()

    mockedSearch.mockImplementation(async (filters) => {
      if (filters.retrievalDate === '2020-01-01') {
        return olderMonthRows
      }
      if (filters.retrievalDate === '2020-03-01') {
        return [row('BA', 'A', 'O', '2020-03-01', 22)]
      }
      return []
    })

    const effectiveMonth = screen.getByLabelText('Effective month')
    fireEvent.change(effectiveMonth, { target: { value: '2020-01' } })
    fireEvent.change(screen.getByLabelText('Effective month'), { target: { value: '2020-03' } })

    await waitForMonthLoad('2020-03-01')
    await waitFor(() => expect(oldGrowthCell('Balsam (BA)', 'A')).toHaveValue('22'))

    resolveOlderMonth([row('BA', 'A', 'O', '2020-01-01', 11)])
    await waitFor(() => expect(screen.getByLabelText('Effective month')).toHaveValue('2020-03'))
    expect(oldGrowthCell('Balsam (BA)', 'A')).toHaveValue('22')
  })

  it('surfaces rejected physical-key saves without reporting success', async () => {
    const user = userEvent.setup()
    mockedSave.mockResolvedValue({
      status: 'validation_failed',
      message: 'Average monthly value validation failed.',
      errors: ['The exact physical key was rejected.'],
      rows: [],
    })

    render(<RTMEmsLogAmvPage />)
    await waitForMonthLoad()
    await user.type(oldGrowthCell('Balsam (BA)', 'A'), '11')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText(/The exact physical key was rejected/)).toBeVisible()
    expect(mockedSave).toHaveBeenCalledTimes(1)
  })

  it('reloads accepted exact keys while retaining only failed keys for retry', async () => {
    const user = userEvent.setup()
    let persistedRows = [
      row('BA', 'A', 'O', CURRENT_MONTH, 10),
      row('HE', 'A', 'O', CURRENT_MONTH, 20),
    ]
    mockedSearch.mockImplementation(async (filters) =>
      filters.retrievalDate === CURRENT_MONTH ? persistedRows : [],
    )
    mockedSave
      .mockImplementationOnce(async () => {
        persistedRows = [
          row('BA', 'A', 'O', CURRENT_MONTH, 11),
          row('HE', 'A', 'O', CURRENT_MONTH, 20),
        ]
        return {
          status: 'accepted',
          message: 'Average monthly value row saved.',
          errors: [],
          rows: [],
        }
      })
      .mockResolvedValueOnce({
        status: 'validation_failed',
        message: 'Hemlock key could not be saved.',
        errors: ['Hemlock key could not be saved.'],
        rows: [],
      })

    render(<RTMEmsLogAmvPage />)
    await waitForMonthLoad()
    const balsam = oldGrowthCell('Balsam (BA)', 'A')
    const hemlock = oldGrowthCell('Hemlock (HE)', 'A')
    await user.clear(balsam)
    await user.type(balsam, '11')
    await user.clear(hemlock)
    await user.type(hemlock, '21')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Hemlock key could not be saved.')).toBeVisible()
    await waitFor(() => {
      expect(balsam).toHaveValue('11')
      expect(hemlock).toHaveValue('21')
      expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled()
    })
    expect(mockedSave).toHaveBeenCalledTimes(2)
  })

  it('serializes physical-key saves to avoid flooding Oracle connections', async () => {
    const user = userEvent.setup()
    let activeSaves = 0
    let maximumActiveSaves = 0
    mockRows([row('BA', 'A', 'O', CURRENT_MONTH, 1), row('HE', 'A', 'O', CURRENT_MONTH, 2)])
    mockedSave.mockImplementation(async () => {
      activeSaves++
      maximumActiveSaves = Math.max(maximumActiveSaves, activeSaves)
      await new Promise((resolve) => setTimeout(resolve, 10))
      activeSaves--
      return {
        status: 'accepted',
        message: 'Average monthly value row saved.',
        errors: [],
        rows: [],
      }
    })

    render(<RTMEmsLogAmvPage />)
    await waitForMonthLoad()
    await user.clear(oldGrowthCell('Balsam (BA)', 'A'))
    await user.type(oldGrowthCell('Balsam (BA)', 'A'), '11')
    await user.clear(oldGrowthCell('Hemlock (HE)', 'A'))
    await user.type(oldGrowthCell('Hemlock (HE)', 'A'), '12')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(mockedSave).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.getByText('Saved 2 table cells.')).toBeVisible())
    expect(maximumActiveSaves).toBe(1)
  })

  it('stops the remaining save queue after a transport failure', async () => {
    const user = userEvent.setup()
    mockedSave.mockRejectedValueOnce(new Error('Oracle unavailable'))

    render(<RTMEmsLogAmvPage />)
    await waitForMonthLoad()
    await user.type(oldGrowthCell('Balsam (BA)', 'A'), '11')
    await user.type(oldGrowthCell('Hemlock (HE)', 'A'), '12')
    await user.type(oldGrowthCell('Cedar (CE)', 'A'), '13')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Unable to save average monthly values.')).toBeVisible()
    expect(mockedSave).toHaveBeenCalledTimes(1)
    expect(oldGrowthCell('Balsam (BA)', 'A')).toHaveValue('11')
    expect(oldGrowthCell('Hemlock (HE)', 'A')).toHaveValue('12')
    expect(oldGrowthCell('Cedar (CE)', 'A')).toHaveValue('13')
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled()
  })
})
