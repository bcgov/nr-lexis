import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import RTMEmsLogAmvPage from '@/pages/RTMEmsLogAmv'
import { fetchApplicationSpeciesCodes } from '@/service/provincial-application-items-service'
import { saveRtmEmsLogAmv, searchRtmEmsLogAmv } from '@/service/rtm-emslogamv-service'
import { createTestAuthContext } from '@/test-utils/auth'
import { formatLocalIsoDate } from '@/utils/date'

vi.mock('@/context/auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/service/provincial-application-items-service', () => ({
  fetchApplicationSpeciesCodes: vi.fn(),
}))

vi.mock('@/service/rtm-emslogamv-service', () => ({
  previewRtmEmsLogAmvUpload: vi.fn(),
  uploadRtmEmsLogAmv: vi.fn(),
  saveRtmEmsLogAmv: vi.fn(),
  searchRtmEmsLogAmv: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)
const mockedFetchApplicationSpeciesCodes = vi.mocked(fetchApplicationSpeciesCodes)
const mockedSearchRtmEmsLogAmv = vi.mocked(searchRtmEmsLogAmv)
const mockedSaveRtmEmsLogAmv = vi.mocked(saveRtmEmsLogAmv)

const chooseComboBoxElementOption = async (
  combobox: HTMLElement,
  optionName: string,
): Promise<void> => {
  await userEvent.click(combobox)
  fireEvent.change(combobox, { target: { value: optionName } })
  const listboxId = combobox.getAttribute('aria-controls')
  const listbox = listboxId ? document.getElementById(listboxId) : null
  const options = listbox
    ? await within(listbox).findAllByRole('option', { name: optionName })
    : await screen.findAllByRole('option', { name: optionName })
  await userEvent.click(options.find((option) => option.tagName === 'LI') ?? options[0])
}

const chooseComboBoxOption = async (
  labelText: string,
  optionName: string,
  index: number,
): Promise<void> => {
  const combobox = screen.getAllByRole('combobox', { name: labelText })[index]
  await chooseComboBoxElementOption(combobox, optionName)
}

const chooseFirstComboBoxOption = async (labelText: string, optionName: string): Promise<void> => {
  await chooseComboBoxOption(labelText, optionName, 0)
}

describe('RTM EMS Log AMV actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.config = {}
    mockedUseAuth.mockReturnValue(createTestAuthContext({ canPerform: () => true }))
    mockedSearchRtmEmsLogAmv.mockResolvedValue([])
    mockedSaveRtmEmsLogAmv.mockResolvedValue({
      status: 'accepted',
      message: 'Average monthly value row saved.',
      errors: [],
      rows: [],
    })
    mockedFetchApplicationSpeciesCodes.mockResolvedValue([
      { code: 'FI', description: 'Douglas-fir' },
    ])
  })

  it('prefills search and manual date fields to the current date', async () => {
    const today = formatLocalIsoDate(new Date())

    render(<RTMEmsLogAmvPage />)

    await screen.findByRole('heading', { name: 'Average Monthly Values' })

    expect(screen.getAllByLabelText('Retrieval date')[0]).toHaveValue(today)
    expect(screen.getByLabelText('Update date')).toHaveValue(today)
    expect(screen.getAllByLabelText('Retrieval date')[1]).toHaveValue(today)
    expect(screen.getByRole('link', { name: 'Download template' })).toHaveAttribute(
      'download',
      'rtm-ems-log-amv-template.xlsx',
    )
    expect(screen.getByRole('button', { name: 'Preview data' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Apply upload' })).toBeDisabled()
  })

  it('shows only upload controls in production RTM-only mode', async () => {
    window.config = { VITE_LEXIS_PROD_RTM_ONLY: 'true' }

    render(<RTMEmsLogAmvPage />)

    await screen.findByRole('heading', { name: 'Average Monthly Values' })

    expect(screen.queryByRole('heading', { name: 'Query rows' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Manual entry' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Upload Excel Spreadsheet' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Data Preview' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Search' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save row' })).not.toBeInTheDocument()
    expect(mockedSearchRtmEmsLogAmv).not.toHaveBeenCalled()
  })

  it('searches average monthly values with retrieval and update dates from the query form', async () => {
    render(<RTMEmsLogAmvPage />)

    await screen.findByRole('heading', { name: 'Average Monthly Values' })

    await chooseFirstComboBoxOption('Species', 'FI - Douglas-fir')
    await chooseFirstComboBoxOption('Growth indicator', 'O - Old growth')
    fireEvent.change(screen.getAllByLabelText('Retrieval date')[0], {
      target: { value: '2026-05-01' },
    })
    fireEvent.change(screen.getByLabelText('Update date'), {
      target: { value: '2026-06-01' },
    })
    await userEvent.click(screen.getByRole('button', { name: 'Search' }))

    await waitFor(() => {
      expect(mockedSearchRtmEmsLogAmv).toHaveBeenCalledWith({
        species: 'FI',
        growthIndicator: 'O',
        retrievalDate: '2026-05-01',
        updateDate: '2026-06-01',
      })
    })
  })

  it('loads existing row dates into the manual update form', async () => {
    mockedSearchRtmEmsLogAmv.mockResolvedValueOnce([
      {
        species: 'FI',
        grade: '1',
        growthIndicator: 'O',
        retrievalDate: '2026-05-01',
        updateDate: '2026-06-01',
        currentValue: 123.45,
        newValue: 456.78,
        returnCode: null,
      },
    ])

    render(<RTMEmsLogAmvPage />)

    await screen.findByRole('heading', { name: 'Average Monthly Values' })

    await chooseFirstComboBoxOption('Species', 'FI - Douglas-fir')
    fireEvent.change(screen.getAllByLabelText('Retrieval date')[0], {
      target: { value: '2026-05-01' },
    })
    await userEvent.click(screen.getByRole('button', { name: 'Search' }))

    await screen.findByText('456.78')
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))

    expect(screen.getByLabelText('Grade')).toHaveValue('1')
    expect(screen.getByLabelText('Save mode')).toHaveValue('update')
    expect(screen.getAllByLabelText('Retrieval date')[1]).toHaveValue('2026-05-01')
    expect(screen.getAllByLabelText('Update date')[1]).toHaveValue('2026-06-01')
    expect(screen.getByLabelText('New value')).toHaveValue('456.78')
  })

  it('saves manual average monthly values with retrieval and update dates', async () => {
    render(<RTMEmsLogAmvPage />)

    await screen.findByRole('heading', { name: 'Average Monthly Values' })

    const manualEntry = screen.getByRole('heading', { name: 'Manual entry' }).closest('.cds--tile')
    expect(manualEntry).not.toBeNull()
    const manualControls = within(manualEntry as HTMLElement)

    await chooseComboBoxElementOption(
      manualControls.getByRole('combobox', { name: 'Species' }),
      'FI - Douglas-fir',
    )
    await userEvent.type(manualControls.getByLabelText('Grade'), '1')
    await chooseComboBoxElementOption(
      manualControls.getByRole('combobox', { name: 'Growth indicator' }),
      'O - Old growth',
    )
    fireEvent.change(manualControls.getByLabelText('Retrieval date'), {
      target: { value: '2026-05-01' },
    })
    fireEvent.change(manualControls.getByLabelText('Save mode'), {
      target: { value: 'update' },
    })
    fireEvent.change(manualControls.getByLabelText('Update date'), {
      target: { value: '2026-06-01' },
    })
    await userEvent.clear(manualControls.getByLabelText('New value'))
    await userEvent.type(manualControls.getByLabelText('New value'), '456.78')
    await userEvent.click(manualControls.getByRole('button', { name: 'Save row' }))

    await waitFor(() => {
      expect(mockedSaveRtmEmsLogAmv).toHaveBeenCalledWith({
        species: 'FI',
        grade: '1',
        growthIndicator: 'O',
        retrievalDate: '2026-05-01',
        updateDate: '2026-06-01',
        newValue: 456.78,
        saveMode: 'update',
      })
    })
    expect(await manualControls.findByText('Average monthly value row saved.')).toBeInTheDocument()
  })
})
