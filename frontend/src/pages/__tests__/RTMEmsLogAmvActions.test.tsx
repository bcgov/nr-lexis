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

const TARGET_DATE = '2099-07-09'
const PREVIOUS_MONTH_DATE = '2099-06-01'

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
  row('BA', 'A', 'O', PREVIOUS_MONTH_DATE, 10.25),
  row('BA', 'A', 'S', PREVIOUS_MONTH_DATE, 10.25),
  row('WH', 'A', 'O', PREVIOUS_MONTH_DATE, 30.75),
  row('LO', 'A', 'O', PREVIOUS_MONTH_DATE, 30.75),
  row('YE', 'A', 'O', PREVIOUS_MONTH_DATE, 30.75),
  row('WH', 'A', 'S', PREVIOUS_MONTH_DATE, 30.75),
  row('LO', 'A', 'S', PREVIOUS_MONTH_DATE, 30.75),
  row('YE', 'A', 'S', PREVIOUS_MONTH_DATE, 30.75),
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
    if (filters.retrievalDate === PREVIOUS_MONTH_DATE) {
      return previous
    }
    return []
  })
}

const selectTargetDate = async () => {
  fireEvent.change(await screen.findByLabelText('Effective date'), {
    target: { value: TARGET_DATE },
  })
  await waitFor(() =>
    expect(mockedSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        retrievalDate: TARGET_DATE,
        updateDate: TARGET_DATE,
      }),
    ),
  )
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
    expect(screen.getByText(/Balsam grade A had a previous month value/)).toBeVisible()
    expect(screen.getByText(/Hemlock grade A is newly populated/)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
  })

  it('saves edited cells for both growth types using the previous month row when available', async () => {
    const user = userEvent.setup()
    mockSearchRows({
      current: [],
      previous: [
        row('BA', 'A', 'O', PREVIOUS_MONTH_DATE, 10.25),
        row('BA', 'A', 'S', PREVIOUS_MONTH_DATE, 10.25),
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
      retrievalDate: PREVIOUS_MONTH_DATE,
      updateDate: TARGET_DATE,
      newValue: 11,
      saveMode: 'update',
    })
    expect(mockedSave).toHaveBeenNthCalledWith(2, {
      species: 'BA',
      grade: 'A',
      growthIndicator: 'S',
      retrievalDate: PREVIOUS_MONTH_DATE,
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
    expect(screen.getByText('Past date selected')).toBeVisible()
    const input = screen.getByLabelText('Balsam grade A')
    expect(input).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(mockedSave).not.toHaveBeenCalled()
  })
})
