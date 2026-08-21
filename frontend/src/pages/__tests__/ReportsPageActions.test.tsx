import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import ReportsPageRoute, { ReportsPageContent as ReportsPage } from '@/pages/Reports'
import { ReportRequestError, runReport } from '@/service/report-service'
import {
  fetchReportOptions,
  fetchProvincialApplicationOptions,
  fetchProvincialExemptionOptions,
  fetchProvincialPermitOptions,
} from '@/service/search-options-service'
import { createTestAuthContext } from '@/test-utils/auth'
import { businessDateParts, formatIsoDateParts } from '@/utils/date'
import { triggerBrowserDownload } from '@/utils/download'

vi.mock('@/context/auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/service/report-service', () => ({
  ReportRequestError: class ReportRequestError extends Error {
    constructor(message: string) {
      super(message)
      this.name = 'ReportRequestError'
    }
  },
  runReport: vi.fn(),
}))

vi.mock('@/service/search-options-service', () => ({
  fetchReportOptions: vi.fn(),
  fetchProvincialApplicationOptions: vi.fn(),
  fetchProvincialExemptionOptions: vi.fn(),
  fetchProvincialPermitOptions: vi.fn(),
}))

vi.mock('@/utils/download', () => ({
  triggerBrowserDownload: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)
const mockedRunReport = vi.mocked(runReport)
const mockedFetchReportOptions = vi.mocked(fetchReportOptions)
const mockedFetchProvincialApplicationOptions = vi.mocked(fetchProvincialApplicationOptions)
const mockedFetchProvincialExemptionOptions = vi.mocked(fetchProvincialExemptionOptions)
const mockedFetchProvincialPermitOptions = vi.mocked(fetchProvincialPermitOptions)
const mockedTriggerBrowserDownload = vi.mocked(triggerBrowserDownload)

const mockReportPermissions = (canPerform: (action: string) => boolean = () => true): void => {
  mockedUseAuth.mockReturnValue(createTestAuthContext({ canPerform }))
}

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

const legacyTenureDefaultDates = (): { fromDate: string; toDate: string } => {
  const today = businessDateParts()
  const previousMonth = new Date(Date.UTC(today.year, today.month - 1, 0))
  return {
    fromDate: formatIsoDateParts(today.year - 1, today.month, 1),
    toDate: formatIsoDateParts(
      previousMonth.getUTCFullYear(),
      previousMonth.getUTCMonth() + 1,
      previousMonth.getUTCDate(),
    ),
  }
}

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const getComboBox = (labelText: string): HTMLElement =>
  screen.getByRole('combobox', { name: new RegExp(`^${escapeRegExp(labelText)}`) })

const chooseComboBoxOption = async (labelText: string, optionName: string): Promise<void> => {
  const combobox = getComboBox(labelText)
  await userEvent.click(combobox)
  fireEvent.change(combobox, { target: { value: optionName } })
  const listboxId = combobox.getAttribute('aria-controls')
  const listbox = listboxId ? document.getElementById(listboxId) : null
  const options = listbox
    ? await within(listbox).findAllByRole('option', { name: optionName })
    : await screen.findAllByRole('option', { name: optionName })
  await userEvent.click(options.find((option) => option.tagName === 'LI') ?? options[0])
}

Element.prototype.scrollIntoView = vi.fn()

describe('Reports Page Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedFetchProvincialApplicationOptions.mockResolvedValue({
      exemptionTypes: [],
      exemptionReasons: [],
      applicationStatuses: [],
      productTypes: [],
      growthTypes: [],
      regions: [],
      currentSchedules: [],
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
  })

  it('hides report controls when no report actions are granted', async () => {
    mockReportPermissions(() => false)

    render(
      <MemoryRouter initialEntries={['/reports']}>
        <Routes>
          <Route path="/reports" element={<ReportsPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await screen.findByRole('heading', { name: 'Reports' })
    expect(
      screen.getByText('Generate and download the reports available to your session.'),
    ).toBeVisible()
    expect(screen.getByRole('heading', { name: 'No reports available' })).toBeInTheDocument()
    expect(
      screen.getByText('No report actions are available for the current session.'),
    ).toBeVisible()
    expect(screen.queryByLabelText('Report variant')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Generate report' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Accessible reports:/)).not.toBeInTheDocument()
    expect(screen.queryByText('Not Granted')).not.toBeInTheDocument()
  })

  it('renders the first accessible report when no report is selected', async () => {
    mockReportPermissions((action: string) => action === '/exemptionReport')

    render(
      <MemoryRouter initialEntries={['/reports']}>
        <Routes>
          <Route path="/reports" element={<ReportsPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await screen.findByRole('heading', { name: 'Exemption Report' })

    expect(screen.getByRole('heading', { name: 'Exemption Report' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Exemption Report' })).toHaveClass(
      'report-config-panel',
    )
    const reportActions = screen.getByRole('group', { name: 'Report actions' })
    expect(
      within(reportActions)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Clear all', 'Generate report'])
    expect(within(reportActions).getByRole('button', { name: 'Clear all' })).toHaveClass(
      'cds--btn--tertiary',
      'cds--btn--md',
    )
    expect(within(reportActions).getByRole('button', { name: 'Generate report' })).toHaveClass(
      'cds--btn--primary',
      'cds--btn--md',
    )
    expect(screen.getByText('Exemption volumes, balances, and status.')).toBeVisible()
    expect(screen.queryByText('Application Report')).not.toBeInTheDocument()
    expect(screen.queryByText('Offer Report')).not.toBeInTheDocument()
    expect(screen.queryByText(/Accessible reports:/)).not.toBeInTheDocument()
    expect(screen.queryByText('Not Granted')).not.toBeInTheDocument()
  })

  it.each([
    '/reports/permitLedgerReport?action=generate',
    '/reports/approvedExemptionReport?action=generate',
  ])('denies an explicitly requested report that is not granted: %s', async (path) => {
    mockReportPermissions((action: string) => action === '/offerReport')

    render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/reports" element={<ReportsPageRoute />} />
          <Route path="/reports/:reportId" element={<ReportsPageRoute />} />
          <Route path="/unauthorized" element={<div>Forbidden report</div>} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText('Forbidden report')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Offer Report' })).not.toBeInTheDocument()
  })

  it.each([
    '/reports/applicationReport?action=generate',
    '/reports/teacReport?action=generate',
    '/reports/exemptionReport?action=generate',
    '/reports/feeReport?action=generate',
    '/reports?report=applicationReport&action=generate',
    '/reports?report=teacReport&action=generate',
    '/reports?report=exemptionReport&action=generate',
    '/reports?report=feeReport&action=generate',
  ])('redirects retired report links without generating: %s', async (path) => {
    mockReportPermissions((action: string) => action === '/offerReport')

    render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/reports" element={<ReportsPageRoute />} />
          <Route path="/reports/:reportId" element={<ReportsPageRoute />} />
          <Route path="/unauthorized" element={<div>Forbidden report</div>} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: 'Offer Report' })).toBeInTheDocument()
    expect(mockedRunReport).not.toHaveBeenCalled()
  })

  it('denies the reports route when only retired report actions are granted', async () => {
    mockReportPermissions((action: string) => action === '/applicationReport')

    render(
      <MemoryRouter initialEntries={['/reports/applicationReport?action=generate']}>
        <Routes>
          <Route path="/reports/:reportId" element={<ReportsPageRoute />} />
          <Route path="/unauthorized" element={<div>Forbidden report</div>} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText('Forbidden report')).toBeInTheDocument()
    expect(mockedRunReport).not.toHaveBeenCalled()
  })

  it('preserves deep-linked report values in the selected configuration panel', async () => {
    mockReportPermissions((action: string) => action === '/exemptionReport')
    const values = encodeURIComponent(
      JSON.stringify({ clientNumber: '00012345', listingFromDate: '2026-01-15' }),
    )

    render(
      <MemoryRouter initialEntries={[`/reports/exemptionReport?values=${values}&action=generate`]}>
        <Routes>
          <Route path="/reports/:reportId" element={<ReportsPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await screen.findByRole('region', { name: 'Exemption Report' })
    expect(screen.getByLabelText('Client number')).toHaveValue('00012345')
    expect(screen.getByLabelText('Listing from date')).toHaveValue('2026-01-15')
    expect(screen.getByLabelText('Listing from date')).toHaveAttribute('placeholder', 'YYYY-MM-DD')
  })

  it('rejects invalid report dates in the shared Carbon date field', async () => {
    mockReportPermissions((action: string) => action === '/exemptionReport')
    const values = encodeURIComponent(JSON.stringify({ listingFromDate: '2026-02-30' }))

    render(
      <MemoryRouter initialEntries={[`/reports/exemptionReport?values=${values}`]}>
        <Routes>
          <Route path="/reports/:reportId" element={<ReportsPage />} />
        </Routes>
      </MemoryRouter>,
    )

    const listingFromDate = await screen.findByLabelText('Listing from date')
    expect(listingFromDate).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Date must be YYYY-MM-DD')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Generate report' })).toBeDisabled()

    await userEvent.clear(listingFromDate)
    await userEvent.type(listingFromDate, '2026-02-28')

    await waitFor(() => {
      expect(listingFromDate).not.toHaveAttribute('aria-invalid', 'true')
      expect(screen.getByRole('button', { name: 'Generate report' })).toBeEnabled()
    })
  })

  it('loads report field options from the report options endpoint only', async () => {
    mockReportPermissions()
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
      <MemoryRouter initialEntries={['/reports/exemptionReport']}>
        <Routes>
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/reports/:reportId" element={<ReportsPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Exemption Report' })).toBeInTheDocument()
    })
    await waitFor(() => {
      expect(mockedFetchReportOptions).toHaveBeenCalledTimes(1)
    })
    expect(mockedFetchProvincialApplicationOptions).not.toHaveBeenCalled()
    expect(mockedFetchProvincialExemptionOptions).not.toHaveBeenCalled()
    expect(mockedFetchProvincialPermitOptions).not.toHaveBeenCalled()

    expect(mockedFetchProvincialExemptionOptions).not.toHaveBeenCalled()
    expect(mockedFetchProvincialPermitOptions).not.toHaveBeenCalled()
    expect(mockedFetchReportOptions).toHaveBeenCalledTimes(1)
    await chooseComboBoxOption('Exemption reason', 'Section 128')
    await chooseComboBoxOption('Growth type', 'Old Growth')
    await userEvent.click(screen.getByRole('button', { name: 'Generate report' }))

    await waitFor(() => {
      expect(mockedRunReport).toHaveBeenCalledWith({
        reportId: 'exemptionReport',
        actionMapping: 'generate',
        values: {
          region: '12',
          regionLabel: 'Coast',
          exemptionReason: 'SEC128',
          exemptionReasonLabel: 'Section 128',
          growthType: 'O',
          growthTypeLabel: 'Old Growth',
        },
      })
    })
  })

  it('fails closed and notifies when authoritative report options cannot be loaded', async () => {
    mockReportPermissions()
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockedFetchReportOptions.mockRejectedValueOnce(new Error('503 Service Unavailable'))

    render(
      <MemoryRouter initialEntries={['/reports/exemptionReport']}>
        <Routes>
          <Route path="/reports/:reportId" element={<ReportsPage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText('Report options unavailable')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Authoritative report options could not be loaded. Affected controls and report generation are disabled. Reload the page to try again.',
      ),
    ).toBeInTheDocument()
    expect(getComboBox('Region')).toBeDisabled()
    expect(getComboBox('Exemption reason')).toBeDisabled()
    expect(getComboBox('Output format')).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Generate report' })).toBeDisabled()
    expect(mockedRunReport).not.toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('preserves legitimate empty report option lists without static replacement choices', async () => {
    mockReportPermissions()
    mockedFetchReportOptions.mockResolvedValueOnce(emptyReportOptions())

    render(
      <MemoryRouter initialEntries={['/reports/exemptionReport']}>
        <Routes>
          <Route path="/reports/:reportId" element={<ReportsPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(mockedFetchReportOptions).toHaveBeenCalledTimes(1)
      expect(getComboBox('Exemption reason')).toBeDisabled()
    })
    expect(getComboBox('Exemption reason')).toHaveValue('')
    expect(getComboBox('Growth type')).toBeDisabled()
    expect(screen.queryByText('Report options unavailable')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Generate report' })).toBeEnabled()
    await userEvent.click(screen.getByRole('button', { name: 'Generate report' }))
    await waitFor(() => {
      expect(mockedRunReport).toHaveBeenCalledWith({
        reportId: 'exemptionReport',
        actionMapping: 'generate',
        values: {},
      })
    })
  })

  it('loads TEAC report selects and submits selected jurisdiction and schedule ids', async () => {
    mockReportPermissions()
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
    await userEvent.click(screen.getByRole('button', { name: 'Generate report' }))

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
    mockReportPermissions()
    mockedFetchReportOptions.mockResolvedValueOnce({
      ...emptyReportOptions(),
      currentSchedules: [
        { value: '1001', label: '2026-06-15' },
        { value: '1002', label: '2026-06-29' },
      ],
      teacJurisdictions: [
        { value: 'P', label: 'Provincial' },
        { value: 'F', label: 'Federal' },
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
    await userEvent.click(screen.getByRole('button', { name: 'Generate report' }))

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

  it('submits every TEAC region when no default or explicit region is selected', async () => {
    mockReportPermissions()
    mockedFetchReportOptions.mockResolvedValueOnce({
      ...emptyReportOptions(),
      regions: [
        { value: '1903', label: 'Cariboo Natural Resource Region' },
        { value: '1904', label: 'Kootenay-Boundary Natural Resource Region' },
      ],
      teacJurisdictions: [
        { value: 'P', label: 'Provincial' },
        { value: 'F', label: 'Federal' },
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
    await userEvent.click(screen.getByRole('button', { name: 'Generate report' }))

    await waitFor(() => {
      expect(mockedRunReport).toHaveBeenCalledWith({
        reportId: 'teacReport',
        actionMapping: 'generate',
        values: {
          region: '1903,1904',
          regionLabel: 'Cariboo Natural Resource Region, Kootenay-Boundary Natural Resource Region',
          exportJurisdictionCode: 'P',
          exportJurisdictionCodeLabel: 'Provincial',
          exportSchedule: '1001',
          exportScheduleLabel: '2026-06-15',
        },
      })
    })
  })

  it('blocks the application report when only the legacy all-regions sentinel is selected', async () => {
    mockReportPermissions()
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
    await userEvent.click(screen.getByRole('button', { name: 'Generate report' }))

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
    mockReportPermissions()
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
    await userEvent.click(screen.getByRole('button', { name: 'Generate report' }))

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

  it('shows selected report regions in the default Carbon multi-select', async () => {
    mockReportPermissions()
    mockedFetchReportOptions.mockResolvedValueOnce({
      ...emptyReportOptions(),
      regions: [
        { value: '1903', label: 'Cariboo Natural Resource Region' },
        { value: '1904', label: 'Kootenay-Boundary Natural Resource Region' },
      ],
    })

    render(
      <MemoryRouter initialEntries={['/reports?report=offerReport']}>
        <Routes>
          <Route path="/reports" element={<ReportsPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await screen.findByRole('heading', { name: 'Offer Report' })

    await chooseComboBoxOption('Region', 'Cariboo Natural Resource Region')
    await chooseComboBoxOption('Region', 'Kootenay-Boundary Natural Resource Region')

    expect(
      await screen.findByRole('combobox', { name: /^Region\s*Total items selected:\s*2/ }),
    ).toBeVisible()
    expect(screen.queryByRole('list', { name: 'Selected regions' })).not.toBeInTheDocument()
  })

  it('defaults species and grade permit status to complete like legacy Struts', async () => {
    mockReportPermissions()
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
    await userEvent.click(screen.getByRole('button', { name: 'Generate report' }))

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

  it('submits every species and grade region when none is selected', async () => {
    mockReportPermissions()
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
    await userEvent.click(screen.getByRole('button', { name: 'Generate report' }))

    await waitFor(() => {
      expect(mockedRunReport).toHaveBeenCalledWith({
        reportId: 'speciesGradeReport',
        actionMapping: 'generate',
        values: {
          region: '1903,1904',
          regionLabel: 'Cariboo Natural Resource Region, Kootenay-Boundary Natural Resource Region',
          permitStatus: 'COM',
          permitStatusLabel: 'Complete',
        },
      })
    })
  })

  it('keeps species timber mark and forest file filters mutually exclusive like legacy JavaScript', async () => {
    mockReportPermissions()

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

    await userEvent.click(screen.getByRole('button', { name: 'Generate report' }))

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
    mockReportPermissions()
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
    await userEvent.click(getComboBox('Jurisdiction'))
    expect(screen.queryByRole('option', { name: 'Reserve' })).not.toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    await chooseComboBoxOption('Jurisdiction', 'Federal Legacy')
    await chooseComboBoxOption('Final destination country', 'New Zealand')
    await chooseComboBoxOption('Customs port of export', 'Vancouver')
    await chooseComboBoxOption('Permit status', 'Complete')
    await userEvent.click(screen.getByRole('button', { name: 'Generate report' }))

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
    mockReportPermissions()
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
    await userEvent.click(getComboBox('Report variant'))
    expect(screen.queryByRole('option', { name: 'Forest file report' })).not.toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.getByLabelText('Issued from date')).toHaveValue(defaultDates.fromDate)
    expect(screen.getByLabelText('Issued to date')).toHaveValue(defaultDates.toDate)
    expect(getComboBox('Client type')).toHaveValue('Permit holder')
    await chooseComboBoxOption('Exemption type', 'Ministerial')
    await chooseComboBoxOption('Output format', 'XLS')
    await userEvent.click(screen.getByRole('button', { name: 'Generate report' }))

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
          outputFormat: 'XLS',
        },
      })
    })
  })

  it('updates tenure issued to date from issued from date like legacy JavaScript', async () => {
    mockReportPermissions()

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

    await userEvent.click(screen.getByRole('button', { name: 'Generate report' }))

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
    mockReportPermissions()
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
    await userEvent.click(screen.getByRole('button', { name: 'Generate report' }))

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

  it.each([
    ['Permit details report', 'generatePermitReport'],
    ['Tenure types report', 'generateTenureReport'],
    ['Timber marks report', 'generateMarkReport'],
  ])('submits the %s tenure variant distinctly', async (variantLabel, actionMapping) => {
    mockReportPermissions()

    render(
      <MemoryRouter initialEntries={['/reports?report=tenureReport']}>
        <Routes>
          <Route path="/reports" element={<ReportsPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await screen.findByRole('heading', { name: 'Tenure Analysis Report' })
    if (variantLabel !== 'Permit details report') {
      await chooseComboBoxOption('Report variant', variantLabel)
    }
    await userEvent.click(screen.getByRole('button', { name: 'Generate report' }))

    await waitFor(() => {
      expect(mockedRunReport).toHaveBeenCalledWith(
        expect.objectContaining({
          reportId: 'tenureReport',
          actionMapping,
        }),
      )
    })
  })

  it('uses legacy biweekly jurisdiction options for application-style reports', async () => {
    mockReportPermissions()
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
    await userEvent.click(screen.getByRole('button', { name: 'Generate report' }))

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

  it('uses only the filtered advertising list report action', async () => {
    mockReportPermissions()
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
    render(
      <MemoryRouter initialEntries={['/reports/biweeklyListing']}>
        <Routes>
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/reports/:reportId" element={<ReportsPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await screen.findByRole('heading', { name: 'Advertising List' })

    expect(screen.queryByLabelText('Report variant')).not.toBeInTheDocument()
    await chooseComboBoxOption('Output format', 'CSV')
    await userEvent.type(screen.getByLabelText('Listing from date'), '2026-06-01')
    await userEvent.type(screen.getByLabelText('Listing to date'), '2026-06-30')
    await userEvent.click(screen.getByRole('button', { name: 'Generate report' }))

    await waitFor(() => {
      expect(mockedRunReport).toHaveBeenCalledWith({
        reportId: 'biweeklyListing',
        actionMapping: 'generate',
        values: {
          outputFormat: 'CSV',
          region: '1903,1904',
          regionLabel: 'Cariboo Natural Resource Region, Kootenay-Boundary Natural Resource Region',
          fromDate: '2026-06-01',
          toDate: '2026-06-30',
        },
      })
    })
    expect(mockedTriggerBrowserDownload).toHaveBeenCalledWith(
      expect.any(Blob),
      'biweeklyListing.csv',
    )
  })

  it('applies the authoritative current advertising period without including the next list day', async () => {
    mockReportPermissions()
    mockedFetchReportOptions.mockResolvedValueOnce({
      ...emptyReportOptions(),
      currentSchedules: [
        { value: '1001', label: '2026-07-02' },
        { value: '1002', label: '2026-07-08' },
      ],
    })

    render(
      <MemoryRouter initialEntries={['/reports?report=biweeklyListing']}>
        <Routes>
          <Route path="/reports" element={<ReportsPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await screen.findByRole('heading', { name: 'Advertising List' })
    expect(screen.getByLabelText('Listing from date')).toHaveValue('')
    expect(screen.getByLabelText('Listing to date')).toHaveValue('')

    await userEvent.click(screen.getByRole('button', { name: 'Use current advertising period' }))

    expect(screen.getByLabelText('Listing from date')).toHaveValue('2026-07-02')
    expect(screen.getByLabelText('Listing to date')).toHaveValue('2026-07-07')
    await userEvent.click(screen.getByRole('button', { name: 'Generate report' }))

    await waitFor(() => {
      expect(mockedRunReport).toHaveBeenCalledWith({
        reportId: 'biweeklyListing',
        actionMapping: 'generate',
        values: {
          fromDate: '2026-07-02',
          toDate: '2026-07-07',
        },
      })
    })
  })

  it('allows explicit blank advertising list dates to use legacy schedule defaults', async () => {
    mockReportPermissions()
    mockedFetchReportOptions.mockResolvedValueOnce({
      ...emptyReportOptions(),
      currentSchedules: [
        { value: '1001', label: '2026-07-02' },
        { value: '1002', label: '2026-07-08' },
      ],
    })

    render(
      <MemoryRouter initialEntries={['/reports?report=biweeklyListing']}>
        <Routes>
          <Route path="/reports" element={<ReportsPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await screen.findByRole('heading', { name: 'Advertising List' })
    const fromDate = screen.getByLabelText('Listing from date')
    const toDate = screen.getByLabelText('Listing to date')
    await userEvent.type(fromDate, '2026-07-02')
    await userEvent.clear(fromDate)
    await userEvent.type(toDate, '2026-07-07')
    await userEvent.clear(toDate)
    await userEvent.click(screen.getByRole('button', { name: 'Generate report' }))

    await waitFor(() => {
      expect(mockedRunReport).toHaveBeenCalledWith({
        reportId: 'biweeklyListing',
        actionMapping: 'generate',
        values: {
          fromDate: '',
          toDate: '',
        },
      })
    })
    expect(screen.queryByText(/Choose a Listing from date/i)).not.toBeInTheDocument()
  })

  it('allows BCEID advertising-list-only users to use current list dates', async () => {
    mockReportPermissions((action: string) => action === 'mofrListing')
    mockedRunReport.mockResolvedValueOnce({
      source: 'api',
      blob: new Blob(['report']),
      filename: 'biweeklyListing.csv',
      contentType: 'text/csv',
    })
    mockedFetchReportOptions.mockResolvedValueOnce({
      ...emptyReportOptions(),
      currentSchedules: [
        { value: '1001', label: '2026-07-02' },
        { value: '1002', label: '2026-07-08' },
      ],
    })
    render(
      <MemoryRouter initialEntries={['/reports?report=biweeklyListing']}>
        <Routes>
          <Route path="/reports" element={<ReportsPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await screen.findByRole('heading', { name: 'Advertising List' })
    expect(screen.queryByText('Application Report')).not.toBeInTheDocument()
    expect(screen.queryByText('Offer Report')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Report variant')).not.toBeInTheDocument()
    expect(screen.queryByText('Required action:')).not.toBeInTheDocument()
    expect(screen.queryByText('mofrListing')).not.toBeInTheDocument()

    await chooseComboBoxOption('Output format', 'CSV')
    await userEvent.click(screen.getByRole('button', { name: 'Use current advertising period' }))
    await userEvent.click(screen.getByRole('button', { name: 'Generate report' }))

    await waitFor(() => {
      expect(mockedRunReport).toHaveBeenCalledWith({
        reportId: 'biweeklyListing',
        actionMapping: 'generate',
        values: {
          outputFormat: 'CSV',
          fromDate: '2026-07-02',
          toDate: '2026-07-07',
        },
      })
    })
    expect(mockedTriggerBrowserDownload).toHaveBeenCalledWith(
      expect.any(Blob),
      'biweeklyListing.csv',
    )
  })

  it('submits every biweekly listing region when none is selected', async () => {
    mockReportPermissions()
    mockedFetchReportOptions.mockResolvedValueOnce({
      ...emptyReportOptions(),
      regions: [
        { value: '1903', label: 'Cariboo Natural Resource Region' },
        { value: '1904', label: 'Kootenay-Boundary Natural Resource Region' },
      ],
      biweeklyJurisdictions: [
        { value: '', label: 'All' },
        { value: 'P', label: 'Provincial' },
        { value: 'F', label: 'Federal' },
      ],
    })

    render(
      <MemoryRouter initialEntries={['/reports/biweeklyListing']}>
        <Routes>
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/reports/:reportId" element={<ReportsPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await screen.findByRole('heading', { name: 'Advertising List' })

    expect(screen.queryByLabelText('Report variant')).not.toBeInTheDocument()
    await chooseComboBoxOption('Jurisdiction', 'Federal')
    await userEvent.type(screen.getByLabelText('Listing from date'), '2026-06-01')
    await userEvent.type(screen.getByLabelText('Listing to date'), '2026-06-30')
    await userEvent.click(screen.getByRole('button', { name: 'Generate report' }))

    await waitFor(() => {
      expect(mockedRunReport).toHaveBeenCalledWith({
        reportId: 'biweeklyListing',
        actionMapping: 'generate',
        values: {
          region: '1903,1904',
          regionLabel: 'Cariboo Natural Resource Region, Kootenay-Boundary Natural Resource Region',
          exportJurisdictionCode: 'F',
          exportJurisdictionCodeLabel: 'Federal',
          fromDate: '2026-06-01',
          toDate: '2026-06-30',
        },
      })
    })
  })

  it('shows backend report validation messages when generation is rejected', async () => {
    mockReportPermissions()
    const error = new ReportRequestError(
      'Choose a Listing from date and Listing to date before generating the Advertising List.',
    )
    mockedRunReport.mockRejectedValueOnce(error)

    render(
      <MemoryRouter initialEntries={['/reports?report=biweeklyListing']}>
        <Routes>
          <Route path="/reports" element={<ReportsPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await screen.findByRole('heading', { name: 'Advertising List' })
    await userEvent.click(screen.getByRole('button', { name: 'Generate report' }))

    await waitFor(() => {
      expect(
        screen.getByText(
          'Choose a Listing from date and Listing to date before generating the Advertising List.',
        ),
      ).toBeInTheDocument()
    })
  })

  it('marks the report panel busy and disables competing actions while generating', async () => {
    mockReportPermissions()
    let resolveReport: ((value: Awaited<ReturnType<typeof runReport>>) => void) | undefined
    mockedRunReport.mockReset()
    mockedRunReport.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveReport = resolve
        }),
    )

    render(
      <MemoryRouter initialEntries={['/reports']}>
        <Routes>
          <Route path="/reports" element={<ReportsPage />} />
        </Routes>
      </MemoryRouter>,
    )

    const reportPanel = await screen.findByRole('region', { name: 'Application Report' })
    await userEvent.type(screen.getByLabelText('Received from date'), '2026-01-01')
    const generateButton = screen.getByRole('button', { name: 'Generate report' })
    await waitFor(() => expect(generateButton).toBeEnabled())
    await userEvent.click(generateButton)

    await waitFor(() => expect(mockedRunReport).toHaveBeenCalledTimes(1))
    expect(reportPanel).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('button', { name: 'Generating report…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Clear all' })).toBeDisabled()

    resolveReport?.({
      source: 'api',
      blob: new Blob(['report']),
      filename: 'report.pdf',
      contentType: 'application/pdf',
    })

    await waitFor(() => expect(reportPanel).toHaveAttribute('aria-busy', 'false'))
    expect(screen.getByRole('button', { name: 'Generate report' })).toBeEnabled()
  })

  it('validates advertising list date range before generating the filtered report', async () => {
    mockReportPermissions()

    render(
      <MemoryRouter initialEntries={['/reports?report=biweeklyListing']}>
        <Routes>
          <Route path="/reports" element={<ReportsPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await screen.findByRole('heading', { name: 'Advertising List' })
    await userEvent.click(screen.getByRole('button', { name: 'Generate report' }))

    expect(mockedRunReport).not.toHaveBeenCalled()
    expect(
      await screen.findByText(
        'Choose a Listing from date and Listing to date before generating the Advertising List.',
      ),
    ).toBeInTheDocument()
  })

  it('keeps exemption approval date fields hidden like the legacy report form', async () => {
    mockReportPermissions()

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
    await userEvent.click(screen.getByRole('button', { name: 'Generate report' }))

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
    mockReportPermissions()
    render(
      <MemoryRouter initialEntries={['/reports']}>
        <Routes>
          <Route path="/reports" element={<ReportsPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await screen.findByRole('heading', { name: 'Application Report' })
    await userEvent.type(screen.getByLabelText('Received from date'), '2026-01-01')
    await chooseComboBoxOption('Output format', 'CSV')
    await userEvent.click(screen.getByRole('button', { name: 'Generate report' }))

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
    expect(mockedTriggerBrowserDownload).toHaveBeenCalledWith(expect.any(Blob), 'report.pdf')
  })

  it('downloads PDF reports with the response filename', async () => {
    mockReportPermissions()
    render(
      <MemoryRouter initialEntries={['/reports']}>
        <Routes>
          <Route path="/reports" element={<ReportsPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await screen.findByRole('heading', { name: 'Application Report' })
    await userEvent.type(screen.getByLabelText('Received from date'), '2026-01-01')
    await userEvent.click(screen.getByRole('button', { name: 'Generate report' }))

    await waitFor(() => {
      expect(mockedTriggerBrowserDownload).toHaveBeenCalledWith(expect.any(Blob), 'report.pdf')
    })
  })
})
