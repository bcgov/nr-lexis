import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, MemoryRouter, Route, RouterProvider, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import type { ProvincialExemptionDetail } from '@/interfaces/LexisDetails'
import ProvincialExemptionDetailsPage from '@/pages/ProvincialExemptionDetails'
import { fetchProvincialExemptionDetail } from '@/service/lexis-detail-service'
import { fetchProvincialExemptionOptions } from '@/service/search-options-service'
import {
  addApplicationToExemption,
  approveExemptions,
  fetchExemptionApplications,
  fetchExemptionBlanketOicTotals,
  fetchExemptionEditContext,
  fetchExemptionPermits,
  sendExemptionApprovalEmails,
  updateExemption,
} from '@/service/provincial-exemption-detail-service'
import { ReportRequestError, runReport } from '@/service/report-service'
import { triggerBrowserDownload } from '@/utils/download'
import { createTestAuthContext, createTestCapabilities } from '@/test-utils/auth'

vi.mock('@/context/auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/service/lexis-detail-service', () => ({
  fetchProvincialExemptionDetail: vi.fn(),
}))

vi.mock('@/service/provincial-exemption-documents-service', () => ({
  fetchExemptionDocuments: vi.fn().mockResolvedValue({ rows: [], source: 'api' }),
  openExemptionDocument: vi.fn(),
  removeExemptionDocument: vi.fn(),
}))

vi.mock('@/service/search-options-service', () => ({
  fetchProvincialExemptionOptions: vi.fn(),
}))

vi.mock('@/service/provincial-exemption-detail-service', () => ({
  addApplicationToExemption: vi.fn(),
  approveExemptions: vi.fn(),
  fetchExemptionApplications: vi.fn(),
  fetchExemptionBlanketOicTotals: vi.fn(),
  fetchExemptionEditContext: vi.fn(),
  fetchExemptionPermits: vi.fn(),
  releaseExemptionEditLock: vi.fn().mockResolvedValue(undefined),
  removeApplicationFromExemption: vi.fn(),
  sendExemptionApprovalEmails: vi.fn(),
  updateExemption: vi.fn(),
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

vi.mock('@/utils/download', () => ({
  triggerBrowserDownload: vi.fn(),
}))

const mockedRunReport = vi.mocked(runReport)
const mockedTriggerBrowserDownload = vi.mocked(triggerBrowserDownload)
const mockedSendExemptionApprovalEmails = vi.mocked(sendExemptionApprovalEmails)

const exemptionDetail: ProvincialExemptionDetail = {
  exemptionNumber: 'BOIC-205',
  exemptionTypeCode: 'B',
  exemptionTypeDescription: 'Blanket Order in Council',
  exemptionStatusCode: 'ACT',
  exemptionStatusDescription: 'Active',
  author: 'idir\\exemption-author',
  ownerClientNumber: '',
  agentClientNumber: '',
  applicationNumber: null,
  applicationStatus: '',
  approvalDate: '2026-02-01',
  expiryDate: '2026-12-31',
  approvedVolume: 500,
  usedVolume: 100,
  remainingVolume: 400,
  otherConditions: 'Existing conditions',
  blanketOic: true,
  permitNumbers: [],
  remarks: [],
}

const ministerialExemptionDetail: ProvincialExemptionDetail = {
  ...exemptionDetail,
  exemptionNumber: 'EX-205',
  exemptionTypeCode: 'O',
  exemptionTypeDescription: 'Order in Council',
  blanketOic: false,
}

describe('Provincial exemption edit context', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue(
      createTestAuthContext({
        canPerform: vi.fn((action: string) => action === 'saveExemption'),
      }),
    )
    vi.mocked(fetchProvincialExemptionDetail).mockResolvedValue(exemptionDetail)
    vi.mocked(fetchProvincialExemptionOptions).mockResolvedValue({
      exemptionTypes: [{ value: 'B', label: 'Blanket Order in Council' }],
      exemptionStatuses: [
        { value: 'NEW', label: 'New' },
        { value: 'ACT', label: 'Active' },
        { value: 'CAN', label: 'Cancelled' },
        { value: 'EXP', label: 'Expired' },
      ],
      regions: [
        { value: '1903', label: 'Region 1903' },
        { value: '1904', label: 'Region 1904' },
      ],
    })
    vi.mocked(fetchExemptionApplications).mockResolvedValue({
      applications: [],
      containsUnmanu: false,
      ownerNumber: 'Blanket OIC',
    })
    vi.mocked(fetchExemptionPermits).mockResolvedValue([])
    vi.mocked(fetchExemptionBlanketOicTotals).mockResolvedValue({
      requestedVolume: '0.0',
      completedVolume: '0.0',
    })
    vi.mocked(addApplicationToExemption).mockResolvedValue({
      success: true,
      message: 'Application linked.',
      exemptionNumber: 'EX-205',
      errors: [],
      warnings: [],
    })
    vi.mocked(approveExemptions).mockResolvedValue({
      success: true,
      valid: true,
      errorMessage: '',
      errors: [],
      warnings: [],
      sendGrid: [],
    })
    mockedSendExemptionApprovalEmails.mockResolvedValue({
      success: true,
      message: 'Approval email sent.',
    })
    mockedRunReport.mockResolvedValue({
      source: 'api',
      blob: new Blob(['approved exemption report']),
      filename: 'approved-exemption.pdf',
      contentType: 'application/pdf',
    })
  })

  it('renders BOIC status and fee empty state with one page heading', async () => {
    vi.mocked(fetchExemptionEditContext).mockResolvedValue({
      rateOverrideEnabled: false,
      fixedFeeRate: '',
      regionNumbers: ['1903', '1904'],
      locked: false,
      lockMessage: '',
    })

    render(
      <MemoryRouter initialEntries={['/provincial/exemption/BOIC-205']}>
        <Routes>
          <Route
            path="/provincial/exemption/:exemptionNumber"
            element={<ProvincialExemptionDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    const heading = await screen.findByRole('heading', {
      name: 'Exemption BOIC-205',
      level: 1,
    })
    const pageHeader = heading.closest('header')
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(pageHeader).toBeTruthy()
    expect(
      within(pageHeader as HTMLElement).getByText('Check and manage this provincial exemption'),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to Your landing page' })).toHaveAttribute(
      'href',
      '/provincial/review',
    )
    expect(within(pageHeader as HTMLElement).getByText('Active')).toHaveAttribute(
      'data-status-variant',
      'positive',
    )
    const summaryCard = (
      await screen.findByRole('heading', { name: 'Exemption summary', level: 2 })
    ).closest('.cds--tile')
    expect(summaryCard).toBeTruthy()
    expect(within(summaryCard as HTMLElement).queryByText('Status')).not.toBeInTheDocument()
    expect(within(summaryCard as HTMLElement).getByText('Author')).toBeInTheDocument()
    expect(
      within(summaryCard as HTMLElement).getByText('idir\\exemption-author'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Applications' })).not.toBeInTheDocument()

    await userEvent.click(await screen.findByRole('tab', { name: 'Fees' }))
    expect(
      await screen.findByRole('heading', { name: 'No fee rate override', level: 3 }),
    ).toBeInTheDocument()
  })

  it('accepts the Oracle maximum fee rate when updating an exemption', async () => {
    vi.mocked(fetchExemptionEditContext).mockResolvedValue({
      rateOverrideEnabled: true,
      fixedFeeRate: '25.00',
      regionNumbers: ['1903', '1904'],
      locked: false,
      lockMessage: '',
    })
    vi.mocked(updateExemption).mockResolvedValue({
      success: true,
      message: 'The exemption was updated successfully.',
      exemptionNumber: 'BOIC-205',
      errors: [],
      warnings: [],
    })

    render(
      <MemoryRouter initialEntries={['/provincial/exemption/BOIC-205']}>
        <Routes>
          <Route
            path="/provincial/exemption/:exemptionNumber"
            element={<ProvincialExemptionDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    await userEvent.click(await screen.findByRole('button', { name: 'Edit exemption' }))
    await userEvent.click(screen.getByRole('tab', { name: 'Fees' }))
    const feeRate = screen.getByLabelText('Fee rate ($/m³)')
    await userEvent.clear(feeRate)
    await userEvent.type(feeRate, '999.99')
    await userEvent.click(screen.getByRole('button', { name: 'Save exemption' }))

    await waitFor(() =>
      expect(vi.mocked(updateExemption)).toHaveBeenCalledWith(
        expect.objectContaining({
          exemptionNumber: 'BOIC-205',
          enableRateOverride: true,
          feeRate: '999.99',
        }),
      ),
    )
  })

  it('requires expiry after approval when updating an exemption', async () => {
    vi.mocked(fetchProvincialExemptionDetail).mockResolvedValue({
      ...exemptionDetail,
      exemptionStatusCode: 'NEW',
      exemptionStatusDescription: 'New',
    })
    vi.mocked(fetchExemptionEditContext).mockResolvedValue({
      rateOverrideEnabled: false,
      fixedFeeRate: '',
      regionNumbers: ['1903', '1904'],
      locked: false,
      lockMessage: '',
    })
    vi.mocked(updateExemption).mockResolvedValue({
      success: true,
      message: 'The exemption was updated successfully.',
      exemptionNumber: 'BOIC-205',
      errors: [],
      warnings: [],
    })

    render(
      <MemoryRouter initialEntries={['/provincial/exemption/BOIC-205']}>
        <Routes>
          <Route
            path="/provincial/exemption/:exemptionNumber"
            element={<ProvincialExemptionDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    await userEvent.click(await screen.findByRole('button', { name: 'Edit exemption' }))
    const expiryDate = screen.getByLabelText('Expiry date')
    fireEvent.change(expiryDate, { target: { value: '2026-02-01' } })
    await userEvent.click(screen.getByRole('button', { name: 'Save exemption' }))

    expect(screen.getByText('Expiry date must be after the approval date.')).toBeInTheDocument()
    expect(vi.mocked(updateExemption)).not.toHaveBeenCalled()

    fireEvent.change(expiryDate, { target: { value: '2026-02-02' } })
    await userEvent.click(screen.getByRole('button', { name: 'Save exemption' }))

    await waitFor(() =>
      expect(vi.mocked(updateExemption)).toHaveBeenCalledWith(
        expect.objectContaining({
          approvalDate: '2026-02-01',
          expiryDate: '2026-02-02',
        }),
      ),
    )
  })

  it('accepts Oracle approved-volume precision when updating an exemption', async () => {
    vi.mocked(fetchProvincialExemptionDetail).mockResolvedValue({
      ...exemptionDetail,
      exemptionStatusCode: 'NEW',
      exemptionStatusDescription: 'New',
    })
    vi.mocked(fetchExemptionEditContext).mockResolvedValue({
      rateOverrideEnabled: false,
      fixedFeeRate: '',
      regionNumbers: ['1903', '1904'],
      locked: false,
      lockMessage: '',
    })
    vi.mocked(updateExemption).mockResolvedValue({
      success: true,
      message: 'The exemption was updated successfully.',
      exemptionNumber: 'BOIC-205',
      errors: [],
      warnings: [],
    })

    render(
      <MemoryRouter initialEntries={['/provincial/exemption/BOIC-205']}>
        <Routes>
          <Route
            path="/provincial/exemption/:exemptionNumber"
            element={<ProvincialExemptionDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    await userEvent.click(await screen.findByRole('button', { name: 'Edit exemption' }))
    const approvedVolume = screen.getByLabelText('Approved volume (m³)')
    await userEvent.clear(approvedVolume)
    await userEvent.type(approvedVolume, '9999999.99')
    await userEvent.click(screen.getByRole('button', { name: 'Save exemption' }))

    await waitFor(() =>
      expect(vi.mocked(updateExemption)).toHaveBeenCalledWith(
        expect.objectContaining({ approvedVolume: '9999999.99' }),
      ),
    )
  })

  it('rejects approved volume with three decimals when updating an exemption', async () => {
    vi.mocked(fetchProvincialExemptionDetail).mockResolvedValue({
      ...exemptionDetail,
      exemptionStatusCode: 'NEW',
      exemptionStatusDescription: 'New',
    })
    vi.mocked(fetchExemptionEditContext).mockResolvedValue({
      rateOverrideEnabled: false,
      fixedFeeRate: '',
      regionNumbers: ['1903', '1904'],
      locked: false,
      lockMessage: '',
    })

    render(
      <MemoryRouter initialEntries={['/provincial/exemption/BOIC-205']}>
        <Routes>
          <Route
            path="/provincial/exemption/:exemptionNumber"
            element={<ProvincialExemptionDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    await userEvent.click(await screen.findByRole('button', { name: 'Edit exemption' }))
    const approvedVolume = screen.getByLabelText('Approved volume (m³)')
    await userEvent.clear(approvedVolume)
    await userEvent.type(approvedVolume, '250.999')
    await userEvent.click(screen.getByRole('button', { name: 'Save exemption' }))

    expect(
      screen.getByText(
        'Approved volume must be greater than 0, at most 9,999,999.99, and have at most two decimal places.',
      ),
    ).toBeInTheDocument()
    expect(vi.mocked(updateExemption)).not.toHaveBeenCalled()
  })

  it('guards unload only after an exemption field differs from its edit baseline', async () => {
    vi.mocked(fetchExemptionEditContext).mockResolvedValue({
      rateOverrideEnabled: false,
      fixedFeeRate: '',
      regionNumbers: ['1903', '1904'],
      locked: false,
      lockMessage: '',
    })

    render(
      <MemoryRouter initialEntries={['/provincial/exemption/BOIC-205']}>
        <Routes>
          <Route
            path="/provincial/exemption/:exemptionNumber"
            element={<ProvincialExemptionDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    await userEvent.click(await screen.findByRole('button', { name: 'Edit exemption' }))
    const unchangedUnload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(unchangedUnload)
    expect(unchangedUnload.defaultPrevented).toBe(false)

    const status = screen.getByRole('combobox', { name: 'Status' })
    await userEvent.click(status)
    const listboxId = status.getAttribute('aria-controls')
    const listbox = listboxId ? document.getElementById(listboxId) : null
    expect(listbox).not.toBeNull()
    await userEvent.click(within(listbox as HTMLElement).getByRole('option', { name: 'Cancelled' }))
    const dirtyUnload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(dirtyUnload)
    expect(dirtyUnload.defaultPrevented).toBe(true)

    await userEvent.click(screen.getByRole('button', { name: 'Cancel edit' }))
    const cancelledUnload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(cancelledUnload)
    expect(cancelledUnload.defaultPrevented).toBe(false)
  })

  it('keeps edit and save actions unavailable when edit context loading fails', async () => {
    vi.mocked(fetchExemptionEditContext).mockRejectedValue(new Error('Oracle unavailable'))

    render(
      <MemoryRouter initialEntries={['/provincial/exemption/BOIC-205']}>
        <Routes>
          <Route
            path="/provincial/exemption/:exemptionNumber"
            element={<ProvincialExemptionDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    expect(
      await screen.findByText(
        'Exemption edit settings could not be loaded. Editing is unavailable until the data can be retrieved.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit exemption' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save exemption' })).not.toBeInTheDocument()
    expect(document.querySelector('.detail-page-error')).not.toBeInTheDocument()
    expect(vi.mocked(updateExemption)).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('tab', { name: 'Fees' }))
    expect(
      await screen.findByRole('heading', { name: 'Fee rate unavailable', level: 3 }),
    ).toBeInTheDocument()
  })

  it('keeps exemption mutation disabled when authoritative options fail', async () => {
    vi.mocked(fetchProvincialExemptionOptions).mockRejectedValueOnce(
      new Error('private lookup failure'),
    )
    vi.mocked(fetchExemptionEditContext).mockResolvedValue({
      rateOverrideEnabled: false,
      fixedFeeRate: '',
      regionNumbers: ['1903', '1904'],
      locked: false,
      lockMessage: '',
    })

    render(
      <MemoryRouter initialEntries={['/provincial/exemption/BOIC-205']}>
        <Routes>
          <Route
            path="/provincial/exemption/:exemptionNumber"
            element={<ProvincialExemptionDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText('Options unavailable')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Edit exemption' }))
    expect(screen.getByRole('button', { name: 'Save exemption' })).toBeDisabled()
    expect(screen.getByRole('combobox', { name: 'Exemption type' })).toBeDisabled()
    expect(vi.mocked(updateExemption)).not.toHaveBeenCalled()
  })

  it('distinguishes configured-empty options while still disabling exemption saves', async () => {
    vi.mocked(fetchProvincialExemptionOptions).mockResolvedValueOnce({
      exemptionTypes: [],
      exemptionStatuses: [],
      regions: [],
    })
    vi.mocked(fetchExemptionEditContext).mockResolvedValue({
      rateOverrideEnabled: false,
      fixedFeeRate: '',
      regionNumbers: ['1903', '1904'],
      locked: false,
      lockMessage: '',
    })

    render(
      <MemoryRouter initialEntries={['/provincial/exemption/BOIC-205']}>
        <Routes>
          <Route
            path="/provincial/exemption/:exemptionNumber"
            element={<ProvincialExemptionDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText('Required exemption options not configured')).toBeInTheDocument()
    expect(screen.queryByText('Options unavailable')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Edit exemption' }))
    expect(screen.getByRole('button', { name: 'Save exemption' })).toBeDisabled()
  })

  it('leaves edit mode when edit context refresh fails after a save', async () => {
    vi.mocked(fetchExemptionEditContext)
      .mockResolvedValueOnce({
        rateOverrideEnabled: false,
        fixedFeeRate: '',
        regionNumbers: ['1903', '1904'],
        locked: false,
        lockMessage: '',
      })
      .mockRejectedValueOnce(new Error('Oracle unavailable'))
    vi.mocked(updateExemption).mockResolvedValue({
      success: true,
      message: 'The exemption was updated successfully.',
      exemptionNumber: 'BOIC-205',
      errors: [],
      warnings: [],
    })

    render(
      <MemoryRouter initialEntries={['/provincial/exemption/BOIC-205']}>
        <Routes>
          <Route
            path="/provincial/exemption/:exemptionNumber"
            element={<ProvincialExemptionDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    await userEvent.click(await screen.findByRole('button', { name: 'Edit exemption' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save exemption' }))

    await waitFor(() => expect(vi.mocked(updateExemption)).toHaveBeenCalledTimes(1))
    expect(
      await screen.findByText(
        'Exemption edit settings could not be loaded. Editing is unavailable until the data can be retrieved.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit exemption' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save exemption' })).not.toBeInTheDocument()
    expect(
      screen.getByText(/The exemption was updated successfully.*could not be refreshed/),
    ).toBeInTheDocument()
    expect(vi.mocked(updateExemption)).toHaveBeenCalledTimes(1)
    const committedUnload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(committedUnload)
    expect(committedUnload.defaultPrevented).toBe(false)
  })

  it('does not show an editing warning while refreshing edit settings after a save', async () => {
    const editContext = {
      rateOverrideEnabled: false,
      fixedFeeRate: '',
      regionNumbers: ['1903', '1904'],
      locked: false,
      lockMessage: '',
    }
    let resolveRefreshedEditContext: (value: typeof editContext) => void = () => undefined
    const refreshedEditContext = new Promise<typeof editContext>((resolve) => {
      resolveRefreshedEditContext = resolve
    })
    vi.mocked(fetchExemptionEditContext)
      .mockResolvedValueOnce(editContext)
      .mockImplementationOnce(() => refreshedEditContext)
    vi.mocked(updateExemption).mockResolvedValue({
      success: true,
      message: 'The exemption was updated successfully.',
      exemptionNumber: 'BOIC-205',
      errors: [],
      warnings: [],
    })

    render(
      <MemoryRouter initialEntries={['/provincial/exemption/BOIC-205']}>
        <Routes>
          <Route
            path="/provincial/exemption/:exemptionNumber"
            element={<ProvincialExemptionDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    await userEvent.click(await screen.findByRole('button', { name: 'Edit exemption' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save exemption' }))

    await waitFor(() => expect(vi.mocked(fetchExemptionEditContext)).toHaveBeenCalledTimes(2))
    expect(
      screen.queryByText(
        'Exemption edit settings could not be loaded. Editing is unavailable until the data can be retrieved.',
      ),
    ).not.toBeInTheDocument()

    await act(async () => {
      resolveRefreshedEditContext(editContext)
    })

    expect(await screen.findByText('The exemption was updated successfully.')).toBeInTheDocument()
    expect(
      screen.queryByText(
        'Exemption edit settings could not be loaded. Editing is unavailable until the data can be retrieved.',
      ),
    ).not.toBeInTheDocument()
  })

  it('does not show an editing warning while initial edit settings load', async () => {
    const editContext = {
      rateOverrideEnabled: false,
      fixedFeeRate: '',
      regionNumbers: ['1903', '1904'],
      locked: false,
      lockMessage: '',
    }
    let resolveEditContext: (value: typeof editContext) => void = () => undefined
    const pendingEditContext = new Promise<typeof editContext>((resolve) => {
      resolveEditContext = resolve
    })
    vi.mocked(fetchExemptionEditContext).mockImplementationOnce(() => pendingEditContext)

    render(
      <MemoryRouter initialEntries={['/provincial/exemption/BOIC-205']}>
        <Routes>
          <Route
            path="/provincial/exemption/:exemptionNumber"
            element={<ProvincialExemptionDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    await screen.findByRole('heading', { name: 'Exemption BOIC-205', level: 1 })
    await waitFor(() => expect(vi.mocked(fetchExemptionEditContext)).toHaveBeenCalledTimes(1))

    expect(
      screen.queryByText(
        'Exemption edit settings could not be loaded. Editing is unavailable until the data can be retrieved.',
      ),
    ).not.toBeInTheDocument()

    await act(async () => {
      resolveEditContext(editContext)
    })

    expect(await screen.findByRole('button', { name: 'Edit exemption' })).toBeInTheDocument()
    expect(
      screen.queryByText(
        'Exemption edit settings could not be loaded. Editing is unavailable until the data can be retrieved.',
      ),
    ).not.toBeInTheDocument()
  })

  it('returns to Summary when editing starts and keeps related permits read-only', async () => {
    vi.mocked(fetchExemptionEditContext).mockResolvedValue({
      rateOverrideEnabled: false,
      fixedFeeRate: '',
      regionNumbers: ['1903', '1904'],
      locked: false,
      lockMessage: '',
    })

    render(
      <MemoryRouter initialEntries={['/provincial/exemption/BOIC-205']}>
        <Routes>
          <Route
            path="/provincial/exemption/:exemptionNumber"
            element={<ProvincialExemptionDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    await userEvent.click(await screen.findByRole('tab', { name: 'Permits' }))
    await userEvent.click(screen.getByRole('button', { name: 'Edit exemption' }))

    expect(screen.getByRole('tab', { name: 'Summary' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('heading', { name: 'Edit exemption', level: 2 })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: 'Permits' }))
    expect(
      screen.getByText(
        'Permit records are read-only. Edit exemption details on the Summary or Fees tab.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save exemption' })).toBeInTheDocument()

    expect(screen.queryByRole('tab', { name: 'Remarks' })).not.toBeInTheDocument()
  })

  it('protects relationship drafts and disables linking while exemption fields are dirty', async () => {
    vi.mocked(useAuth).mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({ roles: ['LEXIS_APPLICATION_APPROVER'] }),
        canPerform: vi.fn((action: string) => action === 'saveExemption'),
      }),
    )
    vi.mocked(fetchProvincialExemptionDetail).mockResolvedValue(ministerialExemptionDetail)
    vi.mocked(fetchExemptionEditContext).mockResolvedValue({
      rateOverrideEnabled: false,
      fixedFeeRate: '',
      regionNumbers: ['1903'],
      locked: false,
      lockMessage: '',
    })

    render(
      <MemoryRouter initialEntries={['/provincial/exemption/EX-205']}>
        <Routes>
          <Route
            path="/provincial/exemption/:exemptionNumber"
            element={<ProvincialExemptionDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    await userEvent.click(await screen.findByRole('button', { name: 'Edit exemption' }))
    await userEvent.clear(screen.getByLabelText('Conditions'))
    await userEvent.type(screen.getByLabelText('Conditions'), 'Unsaved conditions')
    await userEvent.click(screen.getByRole('tab', { name: 'Applications' }))
    expect(screen.queryByLabelText('Application number')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: 'Summary' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel edit' }))
    await userEvent.click(screen.getByRole('tab', { name: 'Applications' }))
    const applicationNumber = await screen.findByLabelText('Application number')
    await userEvent.type(applicationNumber, '12345')

    const unload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(unload)
    expect(unload.defaultPrevented).toBe(true)
  })

  it('closes approval confirmation when the exemption route changes', async () => {
    vi.mocked(useAuth).mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({ roles: ['LEXIS_EXEMPTION_APPROVER'] }),
        canPerform: vi.fn(
          (action: string) => action === 'saveExemption' || action === 'approveExemption',
        ),
      }),
    )
    vi.mocked(fetchProvincialExemptionDetail).mockImplementation(async (exemptionNumber) => ({
      ...ministerialExemptionDetail,
      exemptionNumber,
      exemptionStatusCode: 'NEW',
      exemptionStatusDescription: 'New',
    }))
    vi.mocked(fetchExemptionEditContext).mockResolvedValue({
      rateOverrideEnabled: false,
      fixedFeeRate: '',
      regionNumbers: ['1903'],
      locked: false,
      lockMessage: '',
    })
    const router = createMemoryRouter(
      [
        {
          path: '/provincial/exemption/:exemptionNumber',
          element: <ProvincialExemptionDetailsPage />,
        },
      ],
      { initialEntries: ['/provincial/exemption/EX-205'] },
    )
    render(<RouterProvider router={router} />)

    await userEvent.click(await screen.findByRole('button', { name: 'Approve exemption' }))
    expect(screen.getByRole('dialog', { name: 'Approve exemption' })).toBeInTheDocument()
    await act(async () => {
      await router.navigate('/provincial/exemption/EX-206')
    })

    await waitFor(() => expect(router.state.location.pathname).toContain('EX-206'))
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Approve exemption' })).not.toBeInTheDocument(),
    )
    expect((await screen.findAllByText('EX-206')).length).toBeGreaterThan(0)
    expect(vi.mocked(approveExemptions)).not.toHaveBeenCalled()
  })

  it('requires explicit certification before approving one exemption', async () => {
    vi.mocked(useAuth).mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({ roles: ['LEXIS_EXEMPTION_APPROVER'] }),
        canPerform: vi.fn(
          (action: string) => action === 'saveExemption' || action === 'approveExemption',
        ),
      }),
    )
    vi.mocked(fetchProvincialExemptionDetail).mockResolvedValue({
      ...ministerialExemptionDetail,
      exemptionStatusCode: 'NEW',
      exemptionStatusDescription: 'New',
    })
    vi.mocked(fetchExemptionEditContext).mockResolvedValue({
      rateOverrideEnabled: false,
      fixedFeeRate: '',
      regionNumbers: ['1903'],
      locked: false,
      lockMessage: '',
    })

    render(
      <MemoryRouter initialEntries={['/provincial/exemption/EX-205']}>
        <Routes>
          <Route
            path="/provincial/exemption/:exemptionNumber"
            element={<ProvincialExemptionDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    await userEvent.click(await screen.findByRole('button', { name: 'Approve exemption' }))
    const firstDialog = screen.getByRole('dialog', { name: 'Approve exemption' })
    const firstCertification = within(firstDialog).getByRole('checkbox', {
      name: 'I certify that this exemption has been approved.',
    })
    const firstConfirm = within(firstDialog).getByRole('button', { name: 'Approve exemption' })
    expect(firstCertification).not.toBeChecked()
    expect(firstConfirm).toBeDisabled()
    expect(firstConfirm).toHaveClass('cds--btn--primary')
    expect(firstConfirm).not.toHaveClass('cds--btn--danger')
    expect(firstConfirm.parentElement).toHaveClass('lexis-confirmation-modal__actions')
    await userEvent.click(firstConfirm)
    expect(vi.mocked(approveExemptions)).not.toHaveBeenCalled()

    await userEvent.click(firstCertification)
    expect(firstConfirm).toBeEnabled()
    await userEvent.click(within(firstDialog).getByRole('button', { name: 'Cancel' }))
    await userEvent.click(screen.getByRole('button', { name: 'Approve exemption' }))

    const reopenedDialog = screen.getByRole('dialog', { name: 'Approve exemption' })
    const reopenedCertification = within(reopenedDialog).getByRole('checkbox', {
      name: 'I certify that this exemption has been approved.',
    })
    const reopenedConfirm = within(reopenedDialog).getByRole('button', {
      name: 'Approve exemption',
    })
    expect(reopenedCertification).not.toBeChecked()
    expect(reopenedConfirm).toBeDisabled()
    await userEvent.click(reopenedCertification)
    await userEvent.click(reopenedConfirm)

    await waitFor(() => expect(vi.mocked(approveExemptions)).toHaveBeenCalledWith(['EX-205']))
    expect(mockedSendExemptionApprovalEmails).not.toHaveBeenCalled()
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Approve exemption' })).not.toBeInTheDocument(),
    )
    expect(
      screen.getByText('Exemption approved. No applicant notification recipient was returned.'),
    ).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Approve exemption' }))
    const postApprovalDialog = screen.getByRole('dialog', { name: 'Approve exemption' })
    expect(
      within(postApprovalDialog).getByRole('checkbox', {
        name: 'I certify that this exemption has been approved.',
      }),
    ).not.toBeChecked()
  })

  it('sends an edited approval recipient without treating notification failure as approval failure', async () => {
    vi.mocked(useAuth).mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({ roles: ['LEXIS_EXEMPTION_APPROVER'] }),
        canPerform: vi.fn(
          (action: string) => action === 'saveExemption' || action === 'approveExemption',
        ),
      }),
    )
    vi.mocked(fetchProvincialExemptionDetail).mockResolvedValue({
      ...ministerialExemptionDetail,
      exemptionStatusCode: 'NEW',
      exemptionStatusDescription: 'New',
    })
    vi.mocked(fetchExemptionEditContext).mockResolvedValue({
      rateOverrideEnabled: false,
      fixedFeeRate: '',
      regionNumbers: ['1903'],
      locked: false,
      lockMessage: '',
    })
    vi.mocked(approveExemptions).mockResolvedValue({
      success: true,
      valid: true,
      errorMessage: '',
      errors: [],
      warnings: [],
      sendGrid: [['EX-205', 'owner@example.test']],
    })
    mockedSendExemptionApprovalEmails.mockResolvedValue({
      success: false,
      message: 'The notification service is unavailable.',
    })

    render(
      <MemoryRouter initialEntries={['/provincial/exemption/EX-205']}>
        <Routes>
          <Route
            path="/provincial/exemption/:exemptionNumber"
            element={<ProvincialExemptionDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    await userEvent.click(await screen.findByRole('button', { name: 'Approve exemption' }))
    const approvalDialog = screen.getByRole('dialog', { name: 'Approve exemption' })
    await userEvent.click(
      within(approvalDialog).getByRole('checkbox', {
        name: 'I certify that this exemption has been approved.',
      }),
    )
    await userEvent.click(within(approvalDialog).getByRole('button', { name: 'Approve exemption' }))

    const notificationDialog = await screen.findByRole('dialog', {
      name: 'Send approval notification',
    })
    const recipient = within(notificationDialog).getByLabelText('Recipient for exemption EX-205')
    expect(recipient).toHaveValue('owner@example.test')
    await userEvent.clear(recipient)
    await userEvent.type(recipient, 'corrected@example.test')
    await userEvent.click(within(notificationDialog).getByRole('button', { name: 'Send' }))

    await waitFor(() =>
      expect(mockedSendExemptionApprovalEmails).toHaveBeenCalledWith([
        ['EX-205', 'corrected@example.test'],
      ]),
    )
    expect(await screen.findByText('Action completed')).toBeInTheDocument()
    expect(
      screen.getByText('Exemption approved. The notification service is unavailable.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Action failed')).not.toBeInTheDocument()
  })

  it('keeps expired exemption fields read-only while allowing document uploads', async () => {
    vi.mocked(useAuth).mockReturnValue(
      createTestAuthContext({
        canPerform: (action: string) =>
          action === 'saveExemption' || action === '/fileExemptionUpload',
      }),
    )
    vi.mocked(fetchProvincialExemptionDetail).mockResolvedValue({
      ...exemptionDetail,
      exemptionStatusCode: 'EXP',
      exemptionStatusDescription: 'Expired',
    })
    vi.mocked(fetchExemptionEditContext).mockResolvedValue({
      rateOverrideEnabled: true,
      fixedFeeRate: '25.00',
      regionNumbers: ['1903', '1904'],
      locked: false,
      lockMessage: '',
    })

    render(
      <MemoryRouter initialEntries={['/provincial/exemption/BOIC-205']}>
        <Routes>
          <Route
            path="/provincial/exemption/:exemptionNumber"
            element={<ProvincialExemptionDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    expect(
      await screen.findByRole('heading', { name: 'Exemption BOIC-205', level: 1 }),
    ).toBeInTheDocument()
    expect(screen.getAllByText('Expired')).not.toHaveLength(0)
    expect(screen.queryByRole('button', { name: 'Edit exemption' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: 'Documents' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Edit documents' }))
    expect(await screen.findByRole('button', { name: 'Add document' })).toBeInTheDocument()
    expect(vi.mocked(updateExemption)).not.toHaveBeenCalled()
  })

  it('downloads the approved exemption report with its response filename', async () => {
    vi.mocked(useAuth).mockReturnValue(
      createTestAuthContext({
        canPerform: (action: string) => action === '/approvedExemptionReport',
      }),
    )

    render(
      <MemoryRouter initialEntries={['/provincial/exemption/BOIC-205']}>
        <Routes>
          <Route
            path="/provincial/exemption/:exemptionNumber"
            element={<ProvincialExemptionDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    await userEvent.click(await screen.findByRole('button', { name: 'Print approved exemption' }))

    await waitFor(() => {
      expect(mockedRunReport).toHaveBeenCalledWith({
        reportId: 'approvedExemptionReport',
        values: { exemptionNumber: 'BOIC-205' },
      })
      expect(mockedTriggerBrowserDownload).toHaveBeenCalledWith(
        expect.any(Blob),
        'approved-exemption.pdf',
      )
    })
  })

  it('shows the approved exemption report request error', async () => {
    vi.mocked(useAuth).mockReturnValue(
      createTestAuthContext({
        canPerform: (action: string) => action === '/approvedExemptionReport',
      }),
    )
    mockedRunReport.mockRejectedValue(
      new ReportRequestError('No approved exemption data matched this exemption.'),
    )
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    render(
      <MemoryRouter initialEntries={['/provincial/exemption/BOIC-205']}>
        <Routes>
          <Route
            path="/provincial/exemption/:exemptionNumber"
            element={<ProvincialExemptionDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    await userEvent.click(await screen.findByRole('button', { name: 'Print approved exemption' }))

    expect(
      await screen.findByText('No approved exemption data matched this exemption.'),
    ).toBeInTheDocument()
    expect(mockedTriggerBrowserDownload).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('allows a cancelled exemption to reopen to new without exposing other fields', async () => {
    vi.mocked(fetchProvincialExemptionDetail).mockResolvedValue({
      ...exemptionDetail,
      exemptionStatusCode: 'CAN',
      exemptionStatusDescription: 'Cancelled',
    })
    vi.mocked(fetchExemptionEditContext).mockResolvedValue({
      rateOverrideEnabled: true,
      fixedFeeRate: '25.00',
      regionNumbers: ['1903', '1904'],
      locked: false,
      lockMessage: '',
    })
    vi.mocked(updateExemption).mockResolvedValue({
      success: true,
      message: 'The exemption was updated successfully.',
      exemptionNumber: 'BOIC-205',
      errors: [],
      warnings: [],
    })

    render(
      <MemoryRouter initialEntries={['/provincial/exemption/BOIC-205']}>
        <Routes>
          <Route
            path="/provincial/exemption/:exemptionNumber"
            element={<ProvincialExemptionDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    await userEvent.click(await screen.findByRole('button', { name: 'Edit exemption' }))
    expect(screen.getByLabelText('Approved volume (m³)')).toBeDisabled()
    expect(screen.getByLabelText('Approval date')).toBeDisabled()
    expect(screen.getByLabelText('Expiry date')).toBeDisabled()
    expect(screen.getByLabelText('Conditions')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Save exemption' })).toBeDisabled()

    const status = screen.getByRole('combobox', { name: 'Status' })
    expect(status).toBeEnabled()
    await userEvent.click(status)
    const listboxId = status.getAttribute('aria-controls')
    const listbox = listboxId ? document.getElementById(listboxId) : null
    expect(listbox).not.toBeNull()
    await userEvent.click(within(listbox as HTMLElement).getByRole('option', { name: 'New' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save exemption' }))

    await waitFor(() =>
      expect(vi.mocked(updateExemption)).toHaveBeenCalledWith(
        expect.objectContaining({
          exemptionNumber: 'BOIC-205',
          exemptionStatusCode: 'NEW',
        }),
      ),
    )
  })
})
