import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import ReportsPage from '@/pages/Reports'
import { runReport } from '@/service/report-service'
import {
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
  fetchProvincialApplicationOptions: vi.fn(),
  fetchProvincialExemptionOptions: vi.fn(),
  fetchProvincialPermitOptions: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)
const mockedRunReport = vi.mocked(runReport)
const mockedFetchProvincialApplicationOptions = vi.mocked(fetchProvincialApplicationOptions)
const mockedFetchProvincialExemptionOptions = vi.mocked(fetchProvincialExemptionOptions)
const mockedFetchProvincialPermitOptions = vi.mocked(fetchProvincialPermitOptions)

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

  it('hides report variant selector for single-action reports and blocks generation without access', async () => {
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
    expect(screen.queryByLabelText('Report Variant')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Generate Report' })).toBeDisabled()
  })

  it('uses the selected report variant when generating reports', async () => {
    mockedUseAuth.mockReturnValue({
      canPerform: () => true,
    } as any)

    render(
      <MemoryRouter initialEntries={['/reports']}>
        <Routes>
          <Route path="/reports" element={<ReportsPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await screen.findByText('MOFR Listing Export')
    const reportRow = screen.getByText('MOFR Listing Export').closest('tr')
    expect(reportRow).not.toBeNull()
    await userEvent.click(
      within(reportRow as HTMLElement).getByRole('button', { name: 'Configure' }),
    )

    await userEvent.selectOptions(screen.getByLabelText('Report Variant'), 'generateIndustryCSV')
    await userEvent.click(screen.getByRole('button', { name: 'Generate Report' }))

    await waitFor(() => {
      expect(mockedRunReport).toHaveBeenCalledWith({
        reportId: 'mofrListing',
        actionMapping: 'generateIndustryCSV',
        values: {},
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
    await userEvent.selectOptions(screen.getByLabelText('Output Format'), 'CSV')
    await userEvent.click(screen.getByRole('button', { name: 'Generate Report' }))

    await waitFor(() => {
      expect(mockedRunReport).toHaveBeenCalledWith({
        reportId: 'applicationReport',
        actionMapping: 'generate',
        values: { outputFormat: 'CSV' },
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
