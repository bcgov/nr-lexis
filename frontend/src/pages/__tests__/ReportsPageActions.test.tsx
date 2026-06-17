import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import ReportsPage from '@/pages/Reports'
import { runReport } from '@/service/report-service'
import {
  fetchReportOptions,
  fetchProvincialApplicationOptions,
  fetchProvincialExemptionOptions,
  fetchProvincialPermitOptions,
} from '@/service/search-options-service'

vi.mock('@/context/auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/service/report-service', () => ({
  runReport: vi.fn(),
}))

vi.mock('@/service/search-options-service', () => ({
  fetchReportOptions: vi.fn(),
  fetchProvincialApplicationOptions: vi.fn(),
  fetchProvincialExemptionOptions: vi.fn(),
  fetchProvincialPermitOptions: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)
const mockedRunReport = vi.mocked(runReport)
const mockedFetchReportOptions = vi.mocked(fetchReportOptions)
const mockedFetchProvincialApplicationOptions = vi.mocked(fetchProvincialApplicationOptions)
const mockedFetchProvincialExemptionOptions = vi.mocked(fetchProvincialExemptionOptions)
const mockedFetchProvincialPermitOptions = vi.mocked(fetchProvincialPermitOptions)

const emptyReportOptions = (): Awaited<ReturnType<typeof fetchReportOptions>> => ({
  currentSchedules: [],
  defaultRegion: '',
  regions: [],
  reportJurisdictions: [],
  biweeklyJurisdictions: [],
  teacJurisdictions: [],
  exemptionTypes: [],
  tenureExemptionTypes: [],
  exemptionReasons: [],
  exemptionStatuses: [],
  growthTypes: [],
  permitStatuses: [],
  destinationCountries: [],
  allDestinationCountries: [],
  portsOfExport: [],
})

const formatLocalDate = (date: Date): string => {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

const legacyTenureDefaultDates = (): { fromDate: string; toDate: string } => {
  const today = new Date()
  return {
    fromDate: formatLocalDate(new Date(today.getFullYear() - 1, today.getMonth(), 1)),
    toDate: formatLocalDate(new Date(today.getFullYear(), today.getMonth(), 0)),
  }
}

const getComboBox = (labelText: string): HTMLElement =>
  screen.getByRole('combobox', { name: labelText })

const chooseComboBoxOption = async (labelText: string, optionName: string): Promise<void> => {
  const combobox = getComboBox(labelText)
  await userEvent.click(combobox)
  fireEvent.change(combobox, { target: { value: optionName } })
  const options = await screen.findAllByRole('option', { name: optionName })
  await userEvent.click(options.find((option) => option.tagName === 'LI') ?? options[0])
}

Element.prototype.scrollIntoView = vi.fn()

describe('Reports Page Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedFetchProvincialApplicationOptions.mockResolvedValue({
      exemptionTypes: [],
      applicationStatuses: [],
      productTypes: [],
      regions: [],
    })
    mockedFetchProvincialExemptionOptions.mockResolvedValue({
      exemptionTypes: [],
      exemptionStatuses: [],
      regions: [],
    })
    mockedFetchProvincialPermitOptions.mockResolvedValue({
      permitStatuses: [],
      regions: [],
    })
    mockedFetchReportOptions.mockResolvedValue(emptyReportOptions())
    mockedRunReport.mockResolvedValue({
      source: 'api',
      blob: new Blob(['report']),
      filename: 'report.pdf',
      contentType: 'application/pdf',
    })
    vi.spyOn(window, 'open').mockReturnValue({} as Window)
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:report')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  })

  it('hides report controls when no report actions are granted', async () => {
    mockedUseAuth.mockReturnValue({
      canPerform: () => false,
    } as any)

    render(
      <MemoryRouter initialEntries={['/reports']}>
        <Routes>
          <Route path="/reports" element={<ReportsPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await screen.findByRole('heading', { name: 'Reports' })
    expect(screen.getByRole('heading', { name: 'No reports available' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Report variant')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Generate Report' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Accessible reports:/)).not.toBeInTheDocument()
    expect(screen.queryByText('Not Granted')).not.toBeInTheDocument()
  })

  it('lists only reports granted to the current session', async () => {
    mockedUseAuth.mockReturnValue({
      canPerform: (action: string) => action === '/exemptionReport',
    } as any)

    render(
      <MemoryRouter initialEntries={['/reports']}>
        <Routes>
          <Route path="/reports" element={<ReportsPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await screen.findByRole('heading', { name: 'Exemption Report' })

    expect(screen.getAllByText('Exemption Report')).toHaveLength(2)
    expect(screen.queryByText('Application Report')).not.toBeInTheDocument()
    expect(screen.queryByText('Offer Report')).not.toBeInTheDocument()
    expect(screen.queryByText(/Accessible reports:/)).not.toBeInTheDocument()
    expect(screen.queryByText('Not Granted')).not.toBeInTheDocument()
  })

  it('loads report field options from the report options endpoint only', async () => {
    mockedUseAuth.mockReturnValue({
      canPerform: () => true,
    } as any)
    mockedFetchReportOptions.mockResolvedValueOnce({
      ...emptyReportOptions(),
      regions: [{ value: '12', label: 'Coast' }],
      exemptionTypes: [{ value: '', label: 'All' }],
      exemptionReasons: [
        { value: '', label: 'All' },
        { value: 'SEC128', label: 'Section 128' },
      ],
      exemptionStatuses: [{ value: '', label: 'All' }],
      growthTypes: [
        { value: '', label: 'All' },
        { value: 'O', label: 'Old Growth' },
      ],
    })

    render(
      <MemoryRouter initialEntries={['/reports']}>
        <Routes>
          <Route path="/reports" element={<ReportsPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Reports' })).toBeInTheDocument()
    })
    await waitFor(() => {
      expect(mockedFetchReportOptions).toHaveBeenCalledTimes(1)
    })
    expect(mockedFetchProvincialApplicationOptions).not.toHaveBeenCalled()
    expect(mockedFetchProvincialExemptionOptions).not.toHaveBeenCalled()
    expect(mockedFetchProvincialPermitOptions).not.toHaveBeenCalled()

    const reportRow = screen.getByText('Exemption Report').closest('tr')
    expect(reportRow).not.toBeNull()
    await userEvent.click(
      within(reportRow as HTMLElement).getByRole('button', { name: 'Configure' }),
    )

    expect(mockedFetchProvincialExemptionOptions).not.toHaveBeenCalled()
    expect(mockedFetchProvincialPermitOptions).not.toHaveBeenCalled()
    expect(mockedFetchReportOptions).toHaveBeenCalledTimes(1)
    await chooseComboBoxOption('Exemption reason', 'Section 128')
    await chooseComboBoxOption('Growth type', 'Old Growth')
    await userEvent.click(screen.getByRole('button', { name: 'Generate Report' }))

    await waitFor(() => {
      expect(mockedRunReport).toHaveBeenCalledWith({
        reportId: 'exemptionReport',
        actionMapping: 'generate',
        values: {
          exemptionReason: 'SEC128',
          exemptionReasonLabel: 'Section 128',
          growthType: 'O',
          growthTypeLabel: 'Old Growth',
        },
      })
    })
  })

  it('loads TEAC report selects and submits selected jurisdiction and schedule ids', async () => {
    mockedUseAuth.mockReturnValue({
      canPerform: () => true,
    } as any)
    mockedFetchReportOptions.mockResolvedValueOnce({
      ...emptyReportOptions(),
      currentSchedules: [
        { value: '1001', label: '2026-06-15' },
        { value: '1002', label: '2026-06-29' },
      ],
      teacJurisdictions: [
        { value: 'P', label: 'Provincial' },
        { value: 'F', label: 'Federal Legacy' },
      ],
    })

    render(
      <MemoryRouter initialEntries={['/reports?report=teacReport']}>
        <Routes>
          <Route path="/reports" element={<ReportsPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await screen.findByRole('heading', {
      name: 'Timber Export Advisory Committee package report',
    })
    await waitFor(() => {
      expect(mockedFetchReportOptions).toHaveBeenCalledTimes(1)
    })
    expect(screen.queryByRole('option', { name: 'Reserve' })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'All values' })).not.toBeInTheDocument()
    await chooseComboBoxOption('Jurisdiction', 'Federal Legacy')
    await chooseComboBoxOption('Advertising date', '2026-06-29')
    await userEvent.click(screen.getByRole('button', { name: 'Generate Report' }))

    await waitFor(() => {
      expect(mockedRunReport).toHaveBeenCalledWith({
        reportId: 'teacReport',
        actionMapping: 'generate',
        values: {
          exportJurisdictionCode: 'F',
          exportJurisdictionCodeLabel: 'Federal Legacy',
          exportSchedule: '1002',
          exportScheduleLabel: '2026-06-29',
        },
      })
    })
    expect(getComboBox('Advertising date')).toHaveValue('2026-06-29')
  })

  it('submits first TEAC select options when unchanged like legacy browser forms', async () => {
    mockedUseAuth.mockReturnValue({
      canPerform: () => true,
    } as any)
    mockedFetchReportOptions.mockResolvedValueOnce({
      ...emptyReportOptions(),
      currentSchedules: [
        { value: '1001', label: '2026-06-15' },
        { value: '1002', label: '2026-06-29' },
      ],
    })

    render(
      <MemoryRouter initialEntries={['/reports?report=teacReport']}>
        <Routes>
          <Route path="/reports" element={<ReportsPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await screen.findByRole('heading', {
      name: 'Timber Export Advisory Committee package report',
    })
    await waitFor(() => {
      expect(getComboBox('Advertising date')).toHaveValue('2026-06-15')
    })
    expect(getComboBox('Jurisdiction')).toHaveValue('Provincial')
    await userEvent.click(screen.getByRole('button', { name: 'Generate Report' }))

    await waitFor(() => {
      expect(mockedRunReport).toHaveBeenCalledWith({
        reportId: 'teacReport',
        actionMapping: 'generate',
        values: {
          exportJurisdictionCode: 'P',
          exportJurisdictionCodeLabel: 'Provincial',
          exportSchedule: '1001',
          exportScheduleLabel: '2026-06-15',
        },
      })
    })
  })

  it('leaves unchanged TEAC region criteria unset instead of submitting every region', async () => {
    mockedUseAuth.mockReturnValue({
      canPerform: () => true,
    } as any)
    mockedFetchReportOptions.mockResolvedValueOnce({
      ...emptyReportOptions(),
      regions: [
        { value: '1903', label: 'Cariboo Natural Resource Region' },
        { value: '1904', label: 'Kootenay-Boundary Natural Resource Region' },
      ],
      currentSchedules: [{ value: '1001', label: '2026-06-15' }],
    })

    render(
      <MemoryRouter initialEntries={['/reports?report=teacReport']}>
        <Routes>
          <Route path="/reports" element={<ReportsPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await screen.findByRole('heading', {
      name: 'Timber Export Advisory Committee package report',
    })
    await waitFor(() => {
      expect(getComboBox('Advertising date')).toHaveValue('2026-06-15')
    })
    await userEvent.click(screen.getByRole('button', { name: 'Generate Report' }))

    await waitFor(() => {
      expect(mockedRunReport).toHaveBeenCalledWith({
        reportId: 'teacReport',
        actionMapping: 'generate',
        values: {
          exportJurisdictionCode: 'P',
          exportJurisdictionCodeLabel: 'Provincial',
          exportSchedule: '1001',
          exportScheduleLabel: '2026-06-15',
        },
      })
    })
  })

  it('blocks the application report when only the legacy all-regions sentinel is selected', async () => {
    mockedUseAuth.mockReturnValue({
      canPerform: () => true,
    } as any)
    mockedFetchReportOptions.mockResolvedValueOnce({
      ...emptyReportOptions(),
      regions: [
        { value: '1903', label: 'Cariboo Natural Resource Region' },
        { value: '1904', label: 'Kootenay-Boundary Natural Resource Region' },
      ],
    })

    render(
      <MemoryRouter initialEntries={['/reports?report=applicationReport']}>
        <Routes>
          <Route path="/reports" element={<ReportsPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await screen.findByRole('heading', { name: 'Application Report' })
    const regionComboBox = getComboBox('Region')
    await userEvent.click(regionComboBox)
    fireEvent.change(regionComboBox, { target: { value: '' } })
    expect(await screen.findByRole('option', { name: 'All' })).toBeInTheDocument()
    expect(
      screen.getByRole('option', { name: 'Cariboo Natural Resource Region' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('option', { name: 'Kootenay-Boundary Natural Resource Region' }),
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Generate Report' }))

    await waitFor(() => {
      expect(
        screen.getByText(
          'Choose at least one Application Report filter before generating: region, jurisdiction, exemption reason, client number, growth type, or received date.',
        ),
      ).toBeInTheDocument()
    })
    expect(mockedRunReport).not.toHaveBeenCalled()
  })

  it('submits the report default region for unchanged legacy multi-select reports', async () => {
    mockedUseAuth.mockReturnValue({
      canPerform: () => true,
    } as any)
    mockedFetchReportOptions.mockResolvedValueOnce({
      ...emptyReportOptions(),
      defaultRegion: '1903',
      regions: [
        { value: '1903', label: 'Cariboo Natural Resource Region' },
        { value: '1904', label: 'Kootenay-Boundary Natural Resource Region' },
      ],
    })

    render(
      <MemoryRouter initialEntries={['/reports?report=exemptionReport']}>
        <Routes>
          <Route path="/reports" element={<ReportsPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await screen.findByRole('heading', { name: 'Exemption Report' })
    await waitFor(() => {
      expect(mockedFetchReportOptions).toHaveBeenCalledTimes(1)
    })
    await userEvent.click(screen.getByRole('button', { name: 'Generate Report' }))

    await waitFor(() => {
      expect(mockedRunReport).toHaveBeenCalledWith({
        reportId: 'exemptionReport',
        actionMapping: 'generate',
        values: {
          region: '1903',
          regionLabel: 'Cariboo Natural Resource Region',
        },
      })
    })
  })

  it('defaults species and grade permit status to complete like legacy Struts', async () => {
    mockedUseAuth.mockReturnValue({
      canPerform: () => true,
    } as any)
    mockedFetchReportOptions.mockResolvedValueOnce({
      ...emptyReportOptions(),
      permitStatuses: [
        { value: '', label: 'All' },
        { value: 'COM', label: 'Complete' },
        { value: 'ACT', label: 'Active' },
      ],
    })

    render(
      <MemoryRouter initialEntries={['/reports?report=speciesGradeReport']}>
        <Routes>
          <Route path="/reports" element={<ReportsPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await screen.findByRole('heading', { name: 'Species and Grade Report' })
    await waitFor(() => {
      expect(getComboBox('Permit status')).toHaveValue('Complete')
    })
    await userEvent.click(screen.getByRole('button', { name: 'Generate Report' }))

    await waitFor(() => {
      expect(mockedRunReport).toHaveBeenCalledWith({
        reportId: 'speciesGradeReport',
        actionMapping: 'generate',
        values: {
          permitStatus: 'COM',
          permitStatusLabel: 'Complete',
        },
      })
    })
  })

  it('leaves unchanged species and grade regions unset instead of submitting every region', async () => {
    mockedUseAuth.mockReturnValue({
      canPerform: () => true,
    } as any)
    mockedFetchReportOptions.mockResolvedValueOnce({
      ...emptyReportOptions(),
      regions: [
        { value: '1903', label: 'Cariboo Natural Resource Region' },
        { value: '1904', label: 'Kootenay-Boundary Natural Resource Region' },
      ],
      permitStatuses: [
        { value: '', label: 'All' },
        { value: 'COM', label: 'Complete' },
      ],
    })

    render(
      <MemoryRouter initialEntries={['/reports?report=speciesGradeReport']}>
        <Routes>
          <Route path="/reports" element={<ReportsPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await screen.findByRole('heading', { name: 'Species and Grade Report' })
    await waitFor(() => {
      expect(getComboBox('Permit status')).toHaveValue('Complete')
    })
    await userEvent.click(screen.getByRole('button', { name: 'Generate Report' }))

    await waitFor(() => {
      expect(mockedRunReport).toHaveBeenCalledWith({
        reportId: 'speciesGradeReport',
        actionMapping: 'generate',
        values: {
          permitStatus: 'COM',
          permitStatusLabel: 'Complete',
        },
      })
    })
  })

  it('keeps species timber mark and forest file filters mutually exclusive like legacy JavaScript', async () => {
    mockedUseAuth.mockReturnValue({
      canPerform: () => true,
    } as any)

    render(
      <MemoryRouter initialEntries={['/reports?report=speciesGradeReport']}>
        <Routes>
          <Route path="/reports" element={<ReportsPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await screen.findByRole('heading', { name: 'Species and Grade Report' })
    await userEvent.type(screen.getByLabelText('Timber mark'), 'tm123')
    expect(screen.getByLabelText('Forest file ID')).toBeDisabled()

    await userEvent.clear(screen.getByLabelText('Timber mark'))
    await userEvent.type(screen.getByLabelText('Forest file ID'), 'ff456')
    expect(screen.getByLabelText('Timber mark')).toBeDisabled()

    await userEvent.click(screen.getByRole('button', { name: 'Generate Report' }))

    await waitFor(() => {
      expect(mockedRunReport).toHaveBeenCalledWith({
        reportId: 'speciesGradeReport',
        actionMapping: 'generate',
        values: {
          permitStatus: 'COM',
          forestFileId: 'ff456',
        },
      })
    })
  })

  it('uses legacy transport destination and port labels while submitting report codes', async () => {
    mockedUseAuth.mockReturnValue({
      canPerform: () => true,
    } as any)
    mockedFetchReportOptions.mockResolvedValueOnce({
      ...emptyReportOptions(),
      destinationCountries: [
        { value: '', label: 'All' },
        { value: 'US', label: 'United States' },
      ],
      allDestinationCountries: [
        { value: 'US', label: 'United States' },
        { value: 'NZ', label: 'New Zealand' },
      ],
      portsOfExport: [
        { value: '', label: 'All' },
        { value: 'VAN', label: 'Vancouver' },
      ],
      reportJurisdictions: [
        { value: '', label: 'All' },
        { value: 'P', label: 'Provincial' },
        { value: 'F', label: 'Federal Legacy' },
        { value: 'I', label: 'Reserve' },
      ],
      permitStatuses: [
        { value: '', label: 'All' },
        { value: 'COM', label: 'Complete' },
      ],
    })

    render(
      <MemoryRouter initialEntries={['/reports?report=transportReport']}>
        <Routes>
          <Route path="/reports" element={<ReportsPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await screen.findByRole('heading', { name: 'Transport Report' })
    await userEvent.click(getComboBox('Final destination country'))
    expect(screen.queryByRole('option', { name: 'New Zealand' })).not.toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    await userEvent.click(screen.getByRole('button', { name: 'More...' }))
    await chooseComboBoxOption('Jurisdiction', 'Federal Legacy')
    await chooseComboBoxOption('Final destination country', 'New Zealand')
    await chooseComboBoxOption('Customs port of export', 'Vancouver')
    await chooseComboBoxOption('Permit status', 'Complete')
    await userEvent.click(screen.getByRole('button', { name: 'Generate Report' }))

    await waitFor(() => {
      expect(mockedRunReport).toHaveBeenCalledWith({
        reportId: 'transportReport',
        actionMapping: 'generate',
        values: {
          jurisdiction: 'F',
          jurisdictionLabel: 'Federal Legacy',
          destinationCountry: 'NZ',
          destinationCountryLabel: 'New Zealand',
          portOfExport: 'VAN',
          portOfExportLabel: 'Vancouver',
          status: 'COM',
          statusLabel: 'Complete',
        },
      })
    })
  })

  it('defaults tenure analysis dates like legacy Struts', async () => {
    mockedUseAuth.mockReturnValue({
      canPerform: () => true,
    } as any)
    const defaultDates = legacyTenureDefaultDates()
    mockedFetchReportOptions.mockResolvedValueOnce({
      ...emptyReportOptions(),
      tenureExemptionTypes: [
        { value: 'M', label: 'Ministerial' },
        { value: '', label: 'All' },
      ],
    })

    render(
      <MemoryRouter initialEntries={['/reports?report=tenureReport']}>
        <Routes>
          <Route path="/reports" element={<ReportsPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await screen.findByRole('heading', { name: 'Tenure Analysis Report' })
    await waitFor(() => {
      expect(getComboBox('Exemption type')).toHaveValue('Ministerial')
    })
    expect(screen.getByLabelText('Issued from date')).toHaveValue(defaultDates.fromDate)
    expect(screen.getByLabelText('Issued to date')).toHaveValue(defaultDates.toDate)
    expect(getComboBox('Client type')).toHaveValue('Permit holder')
    await chooseComboBoxOption('Exemption type', 'Ministerial')
    await chooseComboBoxOption('Output format', 'XLS')
    await userEvent.click(screen.getByRole('button', { name: 'Generate Report' }))

    await waitFor(() => {
      expect(mockedRunReport).toHaveBeenCalledWith({
        reportId: 'tenureReport',
        actionMapping: 'generatePermitReport',
        values: {
          ...defaultDates,
          exemptionType: 'M',
          exemptionTypeLabel: 'Ministerial',
          clientType: 'P',
          clientTypeLabel: 'Permit holder',
          outputFormat: 'CSV',
        },
      })
    })
  })

  it('updates tenure issued to date from issued from date like legacy JavaScript', async () => {
    mockedUseAuth.mockReturnValue({
      canPerform: () => true,
    } as any)

    render(
      <MemoryRouter initialEntries={['/reports?report=tenureReport']}>
        <Routes>
          <Route path="/reports" element={<ReportsPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await screen.findByRole('heading', { name: 'Tenure Analysis Report' })
    await userEvent.clear(screen.getByLabelText('Issued from date'))
    await userEvent.type(screen.getByLabelText('Issued from date'), '2026-02-15')

    expect(screen.getByLabelText('Issued to date')).toHaveValue('2027-02-14')

    await userEvent.click(screen.getByRole('button', { name: 'Generate Report' }))

    await waitFor(() => {
      expect(mockedRunReport).toHaveBeenCalledWith({
        reportId: 'tenureReport',
        actionMapping: 'generatePermitReport',
        values: {
          fromDate: '2026-02-15',
          toDate: '2027-02-14',
          clientType: 'P',
          clientTypeLabel: 'Permit holder',
        },
      })
    })
  })

  it('uses separate tenure type and timber mark fields like the legacy report form', async () => {
    mockedUseAuth.mockReturnValue({
      canPerform: () => true,
    } as any)
    const defaultDates = legacyTenureDefaultDates()

    render(
      <MemoryRouter initialEntries={['/reports?report=tenureReport']}>
        <Routes>
          <Route path="/reports" element={<ReportsPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await screen.findByRole('heading', { name: 'Tenure Analysis Report' })
    expect(screen.getByLabelText('Tenure type 1')).toBeInTheDocument()
    expect(screen.getByLabelText('Tenure type 6')).toBeInTheDocument()
    expect(screen.getByLabelText('Timber mark 1')).toBeInTheDocument()
    expect(screen.getByLabelText('Timber mark 6')).toBeInTheDocument()
    expect(screen.queryByLabelText('Tenure types')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Timber marks')).not.toBeInTheDocument()

    await chooseComboBoxOption('Report variant', 'Timber marks report')
    await userEvent.type(screen.getByLabelText('Timber mark 1'), 'tm-a')
    await userEvent.type(screen.getByLabelText('Timber mark 2'), 'tm-b')
    await userEvent.click(screen.getByRole('button', { name: 'Generate Report' }))

    await waitFor(() => {
      expect(mockedRunReport).toHaveBeenCalledWith({
        reportId: 'tenureReport',
        actionMapping: 'generateMarkReport',
        values: {
          ...defaultDates,
          clientType: 'P',
          clientTypeLabel: 'Permit holder',
          timberMark1: 'tm-a',
          timberMark2: 'tm-b',
        },
      })
    })
  })

  it('uses legacy biweekly jurisdiction options for application-style reports', async () => {
    mockedUseAuth.mockReturnValue({
      canPerform: () => true,
    } as any)
    mockedFetchReportOptions.mockResolvedValueOnce({
      ...emptyReportOptions(),
      biweeklyJurisdictions: [
        { value: '', label: 'All' },
        { value: 'P', label: 'Provincial' },
        { value: 'F', label: 'Federal Legacy' },
      ],
    })

    render(
      <MemoryRouter initialEntries={['/reports']}>
        <Routes>
          <Route path="/reports" element={<ReportsPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await screen.findByRole('heading', { name: 'Application Report' })
    const jurisdictionComboBox = getComboBox('Jurisdiction')
    await userEvent.click(jurisdictionComboBox)
    fireEvent.change(jurisdictionComboBox, { target: { value: '' } })
    expect(await screen.findByRole('option', { name: 'All' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Provincial' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Federal Legacy' })).toBeInTheDocument()

    await chooseComboBoxOption('Jurisdiction', 'Federal Legacy')
    await userEvent.click(screen.getByRole('button', { name: 'Generate Report' }))

    await waitFor(() => {
      expect(mockedRunReport).toHaveBeenCalledWith({
        reportId: 'applicationReport',
        actionMapping: 'generate',
        values: {
          region: '0',
          regionLabel: 'All',
          exportJurisdictionCode: 'F',
          exportJurisdictionCodeLabel: 'Federal Legacy',
        },
      })
    })
  })

  it('uses the selected report variant when generating reports', async () => {
    mockedUseAuth.mockReturnValue({
      canPerform: () => true,
    } as any)
    mockedRunReport.mockResolvedValueOnce({
      source: 'api',
      blob: new Blob(['report']),
      filename: 'biweeklyListing.csv',
      contentType: 'text/csv',
    })
    mockedFetchReportOptions.mockResolvedValueOnce({
      ...emptyReportOptions(),
      regions: [
        { value: '1903', label: 'Cariboo Natural Resource Region' },
        { value: '1904', label: 'Kootenay-Boundary Natural Resource Region' },
      ],
    })
    const anchorClickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {})

    render(
      <MemoryRouter initialEntries={['/reports']}>
        <Routes>
          <Route path="/reports" element={<ReportsPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await screen.findByText('Advertising List')
    const reportRow = screen.getByText('Advertising List').closest('tr')
    expect(reportRow).not.toBeNull()
    await userEvent.click(
      within(reportRow as HTMLElement).getByRole('button', { name: 'Configure' }),
    )

    await chooseComboBoxOption('Report variant', 'Advertising list CSV')
    await userEvent.click(screen.getByRole('button', { name: 'Generate Report' }))

    await waitFor(() => {
      expect(mockedRunReport).toHaveBeenCalledWith({
        reportId: 'biweeklyListing',
        actionMapping: 'generateIndustryCSV',
        values: {},
      })
    })
    expect(anchorClickSpy).toHaveBeenCalled()
    expect(window.open).not.toHaveBeenCalled()
  })

  it('uses the legacy biweekly industry pdf variant without form criteria', async () => {
    mockedUseAuth.mockReturnValue({
      canPerform: () => true,
    } as any)
    mockedFetchReportOptions.mockResolvedValueOnce({
      ...emptyReportOptions(),
      regions: [
        { value: '1903', label: 'Cariboo Natural Resource Region' },
        { value: '1904', label: 'Kootenay-Boundary Natural Resource Region' },
      ],
    })
    const anchorClickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {})

    render(
      <MemoryRouter initialEntries={['/reports']}>
        <Routes>
          <Route path="/reports" element={<ReportsPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await screen.findByText('Advertising List')
    const reportRow = screen.getByText('Advertising List').closest('tr')
    expect(reportRow).not.toBeNull()
    await userEvent.click(
      within(reportRow as HTMLElement).getByRole('button', { name: 'Configure' }),
    )

    await chooseComboBoxOption('Report variant', 'Advertising list PDF')
    await userEvent.click(screen.getByRole('button', { name: 'Generate Report' }))

    await waitFor(() => {
      expect(mockedRunReport).toHaveBeenCalledWith({
        reportId: 'biweeklyListing',
        actionMapping: 'generateIndustryPDF',
        values: {},
      })
    })
    expect(window.open).toHaveBeenCalledWith(
      'blob:report',
      'reportWindow',
      'height=900,width=1280,menubar=0,resizable=1,status=1,scrollbars=1',
    )
    expect(anchorClickSpy).not.toHaveBeenCalled()
  })

  it('does not submit unchanged biweekly listing regions as every region option', async () => {
    mockedUseAuth.mockReturnValue({
      canPerform: () => true,
    } as any)
    mockedFetchReportOptions.mockResolvedValueOnce({
      ...emptyReportOptions(),
      regions: [
        { value: '1903', label: 'Cariboo Natural Resource Region' },
        { value: '1904', label: 'Kootenay-Boundary Natural Resource Region' },
      ],
    })

    render(
      <MemoryRouter initialEntries={['/reports']}>
        <Routes>
          <Route path="/reports" element={<ReportsPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await screen.findByText('Advertising List')
    const reportRow = screen.getByText('Advertising List').closest('tr')
    expect(reportRow).not.toBeNull()
    await userEvent.click(
      within(reportRow as HTMLElement).getByRole('button', { name: 'Configure' }),
    )

    expect(getComboBox('Report variant')).toHaveValue('Generate with filters')
    await chooseComboBoxOption('Jurisdiction', 'Federal')
    await userEvent.type(screen.getByLabelText('Listing from date'), '2026-06-01')
    await userEvent.type(screen.getByLabelText('Listing to date'), '2026-06-30')
    await userEvent.click(screen.getByRole('button', { name: 'Generate Report' }))

    await waitFor(() => {
      expect(mockedRunReport).toHaveBeenCalledWith({
        reportId: 'biweeklyListing',
        actionMapping: 'generate',
        values: {
          exportJurisdictionCode: 'F',
          exportJurisdictionCodeLabel: 'Federal',
          fromDate: '2026-06-01',
          toDate: '2026-06-30',
        },
      })
    })
  })

  it('keeps exemption approval date fields hidden like the legacy report form', async () => {
    mockedUseAuth.mockReturnValue({
      canPerform: () => true,
    } as any)

    render(
      <MemoryRouter initialEntries={['/reports?report=exemptionReport']}>
        <Routes>
          <Route path="/reports" element={<ReportsPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await screen.findByRole('heading', { name: 'Exemption Report' })
    expect(screen.queryByLabelText('Approval From Date')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Approval To Date')).not.toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Listing from date'), '2026-01-01')
    await userEvent.type(screen.getByLabelText('Listing to date'), '2026-01-31')
    await userEvent.click(screen.getByRole('button', { name: 'Generate Report' }))

    await waitFor(() => {
      expect(mockedRunReport).toHaveBeenCalledWith({
        reportId: 'exemptionReport',
        actionMapping: 'generate',
        values: {
          listingFromDate: '2026-01-01',
          listingToDate: '2026-01-31',
        },
      })
    })
  })

  it('downloads CSV reports without opening a popup window', async () => {
    mockedUseAuth.mockReturnValue({
      canPerform: () => true,
    } as any)
    const anchorClickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {})

    render(
      <MemoryRouter initialEntries={['/reports']}>
        <Routes>
          <Route path="/reports" element={<ReportsPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await screen.findByRole('heading', { name: 'Reports' })
    await userEvent.type(screen.getByLabelText('Received from date'), '2026-01-01')
    await chooseComboBoxOption('Output format', 'CSV')
    await userEvent.click(screen.getByRole('button', { name: 'Generate Report' }))

    await waitFor(() => {
      expect(mockedRunReport).toHaveBeenCalledWith({
        reportId: 'applicationReport',
        actionMapping: 'generate',
        values: {
          fromDate: '2026-01-01',
          region: '0',
          regionLabel: 'All',
          outputFormat: 'CSV',
        },
      })
    })
    expect(window.open).not.toHaveBeenCalled()
    expect(anchorClickSpy).toHaveBeenCalled()
  })

  it('falls back to download and shows error when pdf popup is blocked', async () => {
    mockedUseAuth.mockReturnValue({
      canPerform: () => true,
    } as any)
    vi.spyOn(window, 'open').mockReturnValue(null)
    const anchorClickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {})

    render(
      <MemoryRouter initialEntries={['/reports']}>
        <Routes>
          <Route path="/reports" element={<ReportsPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await screen.findByRole('heading', { name: 'Reports' })
    await userEvent.type(screen.getByLabelText('Received from date'), '2026-01-01')
    await userEvent.click(screen.getByRole('button', { name: 'Generate Report' }))

    await waitFor(() => {
      expect(
        screen.getByText(
          'Popup blocked while opening report preview. Downloaded the generated file instead.',
        ),
      ).toBeInTheDocument()
    })
    expect(anchorClickSpy).toHaveBeenCalled()
  })
})
