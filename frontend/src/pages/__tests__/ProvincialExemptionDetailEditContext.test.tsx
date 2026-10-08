import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, MemoryRouter, Route, RouterProvider, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  allowedRegions,
  normalizeAction,
  normalizeActionRegions,
  type RecordOrgUnits,
  withinRegions,
} from '@/context/auth/region-utils'
import { useAuth } from '@/context/auth/useAuth'
import type { ProvincialExemptionDetail } from '@/interfaces/LexisDetails'
import ProvincialExemptionDetailsPage from '@/pages/ProvincialExemptionDetails'
import { fetchProvincialExemptionDetail } from '@/service/lexis-detail-service'
import { fetchProvincialExemptionOptions } from '@/service/search-options-service'
import {
  addApplicationToExemption,
  approveExemptions,
  fetchExemptionApplications,
  fetchExemptionApprovalRecipients,
  fetchExemptionBlanketOicTotals,
  fetchExemptionEditContext,
  fetchExemptionPermits,
  sendExemptionApprovalNotifications,
  updateExemption,
} from '@/service/provincial-exemption-detail-service'
import { fetchCurrentExemptionRecordVersion } from '@/service/record-version-service'
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
  fetchExemptionApprovalRecipients: vi.fn(),
  fetchExemptionApplications: vi.fn(),
  fetchExemptionBlanketOicTotals: vi.fn(),
  fetchExemptionEditContext: vi.fn(),
  fetchExemptionPermits: vi.fn(),
  removeApplicationFromExemption: vi.fn(),
  sendExemptionApprovalNotifications: vi.fn(),
  updateExemption: vi.fn(),
}))

vi.mock('@/service/record-version-service', () => ({
  fetchCurrentExemptionRecordVersion: vi.fn(),
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
const mockedSendExemptionApprovalNotifications = vi.mocked(sendExemptionApprovalNotifications)

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
    vi.mocked(fetchCurrentExemptionRecordVersion).mockResolvedValue('"current-version"')
    vi.mocked(fetchExemptionApprovalRecipients).mockResolvedValue([
      {
        exemptionNumber: 'EX-205',
        ownerEmail: 'owner@example.test',
        agentEmail: '',
        agentApplicable: false,
        sendable: true,
        message: '',
      },
    ])
    mockedSendExemptionApprovalNotifications.mockResolvedValue({
      outcomes: [{ exemptionNumber: 'EX-205', queued: true, message: 'Queued.' }],
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
      within(pageHeader as HTMLElement).getByText('Author: idir\\exemption-author'),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to Application review' })).toHaveAttribute(
      'href',
      '/provincial/review',
    )
    expect(within(pageHeader as HTMLElement).getByText('Active')).toHaveAttribute(
      'data-status-variant',
      'positive',
    )
    const summaryCard = (
      await screen.findByRole('heading', { name: 'Exemption details', level: 2 })
    ).closest('.cds--tile')
    expect(screen.getByRole('tab', { name: 'Exemption details' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(summaryCard).toBeTruthy()
    expect(within(summaryCard as HTMLElement).getByText('Status')).toBeInTheDocument()
    expect(within(summaryCard as HTMLElement).getByText('Region')).toBeInTheDocument()
    expect(within(summaryCard as HTMLElement).getByText('Blanket OIC')).toBeInTheDocument()

    for (const [label, value] of [
      ['Approval date', '2026-02-01'],
      ['Expiry date', '2026-12-31'],
    ]) {
      const field = within(summaryCard as HTMLElement)
        .getByText(label)
        .closest('.record-field') as HTMLElement
      expect(within(field).getByText(value)).toBeInTheDocument()
    }

    const exemptionHolderLabel = within(summaryCard as HTMLElement).getByText('Exemption holder')
    expect(
      within(exemptionHolderLabel.closest('.record-field') as HTMLElement).getByText('Blanket OIC'),
    ).toBeInTheDocument()
    expect(within(summaryCard as HTMLElement).getByText('Conditions')).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Applications' })).not.toBeInTheDocument()

    await userEvent.click(await screen.findByRole('tab', { name: 'Fees' }))
    const feesCard = (await screen.findByRole('heading', { name: 'Fees', level: 2 })).closest(
      '.cds--tile',
    ) as HTMLElement
    const overrideLabel = within(feesCard).getByText('Override fee rate?')
    expect(
      within(overrideLabel.closest('.record-field') as HTMLElement).getByText('No'),
    ).toBeInTheDocument()
    expect(within(feesCard).queryByText('Fee rate ($/m³)')).not.toBeInTheDocument()
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

    await userEvent.click(await screen.findByRole('tab', { name: 'Fees' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Edit fee override' }))
    const feeRate = screen.getByLabelText('Fee rate ($/m³)')
    await userEvent.clear(feeRate)
    await userEvent.type(feeRate, '999.99')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() =>
      expect(vi.mocked(updateExemption)).toHaveBeenCalledWith(
        expect.objectContaining({
          exemptionNumber: 'BOIC-205',
          enableRateOverride: true,
          feeRate: '999.99',
        }),
      ),
    )
    expect(
      (await screen.findByText(/^(Exemption details|Fees) saved\.$/)).closest(
        '.cds--inline-notification',
      ),
    ).toHaveClass('cds--inline-notification--success')
  })

  it('edits the fee override in its own Fees section and saves only the fee fields', async () => {
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

    // Editing Exemption details does not open fee controls, and an unchanged edit ends quietly
    // when the user moves to another tab.
    await userEvent.click(await screen.findByRole('button', { name: 'Edit exemption details' }))
    // Conditions and the edit actions sit in the one Exemption details card.
    const detailsCard = screen
      .getByRole('heading', { level: 2, name: 'Exemption details' })
      .closest('.cds--tile') as HTMLElement
    expect(within(detailsCard).getByLabelText('Conditions')).toBeInTheDocument()
    expect(within(detailsCard).getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(within(detailsCard).getByRole('button', { name: 'Save changes' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 2, name: 'Conditions' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: 'Fees' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('radiogroup', { name: 'Override fee rate?' })).not.toBeInTheDocument()

    await userEvent.click(await screen.findByRole('button', { name: 'Edit fee override' }))
    await userEvent.click(screen.getByRole('radio', { name: 'Yes' }))
    const feeRate = screen.getByLabelText('Fee rate ($/m³)')
    expect(feeRate).not.toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByText('Fee rate is required')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(feeRate).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Fee rate is required')).toBeVisible()
    await waitFor(() => expect(feeRate).toHaveFocus())
    expect(screen.queryByText('Review exemption values')).not.toBeInTheDocument()
    expect(vi.mocked(updateExemption)).not.toHaveBeenCalled()

    await userEvent.type(feeRate, '12.50')
    expect(screen.queryByText('Fee rate is required')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(vi.mocked(updateExemption)).toHaveBeenCalledTimes(1))
    expect(vi.mocked(updateExemption)).toHaveBeenCalledWith({
      exemptionNumber: 'BOIC-205',
      previousExemptionNumber: 'BOIC-205',
      approvedVolume: '500.0',
      approvalDate: '2026-02-01',
      expiryDate: '2026-12-31',
      otherConditions: 'Existing conditions',
      exemptionTypeCode: 'B',
      exemptionStatusCode: 'ACT',
      manageFeeRate: true,
      enableRateOverride: true,
      feeRate: '12.50',
      regionNumbers: ['1903', '1904'],
    })
    expect(await screen.findByRole('button', { name: 'Edit fee override' })).toBeInTheDocument()
  })

  it('saves a fee override when a stored detail value breaks a rule that section does not edit', async () => {
    vi.mocked(fetchProvincialExemptionDetail).mockResolvedValue({
      ...exemptionDetail,
      otherConditions: 'Résumé',
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

    await userEvent.click(await screen.findByRole('tab', { name: 'Fees' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Edit fee override' }))
    await userEvent.click(screen.getByRole('radio', { name: 'Yes' }))
    await userEvent.type(screen.getByLabelText('Fee rate ($/m³)'), '12.50')
    expect(screen.queryByText('Review exemption values')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() =>
      expect(vi.mocked(updateExemption)).toHaveBeenCalledWith(
        expect.objectContaining({
          otherConditions: 'Résumé',
          enableRateOverride: true,
          feeRate: '12.50',
        }),
      ),
    )
  })

  it('saves exemption details while the stored fee override has no rate', async () => {
    vi.mocked(fetchExemptionEditContext).mockResolvedValue({
      rateOverrideEnabled: true,
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

    await userEvent.click(await screen.findByRole('button', { name: 'Edit exemption details' }))
    const conditions = screen.getByLabelText('Conditions')
    await userEvent.clear(conditions)
    await userEvent.type(conditions, 'Updated conditions')
    expect(screen.queryByText('Fee rate is required')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    // The details save sends the stored fee values unchanged; the server keeps the rate as is.
    await waitFor(() =>
      expect(vi.mocked(updateExemption)).toHaveBeenCalledWith(
        expect.objectContaining({
          otherConditions: 'Updated conditions',
          enableRateOverride: true,
          feeRate: '',
        }),
      ),
    )
  })

  it('discards a fee override draft when the Fees section is cancelled', async () => {
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

    await userEvent.click(await screen.findByRole('tab', { name: 'Fees' }))
    const feesCard = (await screen.findByRole('heading', { name: 'Fees', level: 2 })).closest(
      '.cds--tile',
    ) as HTMLElement
    expect(within(feesCard).getByText('25.00')).toBeInTheDocument()
    await userEvent.click(within(feesCard).getByRole('button', { name: 'Edit fee override' }))
    await userEvent.click(screen.getByRole('radio', { name: 'No' }))
    expect(screen.queryByLabelText('Fee rate ($/m³)')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await userEvent.click(
      within(await screen.findByRole('dialog', { name: 'Discard changes?' })).getByRole('button', {
        name: 'Discard changes',
      }),
    )

    const restoredCard = screen
      .getByRole('heading', { name: 'Fees', level: 2 })
      .closest('.cds--tile') as HTMLElement
    expect(within(restoredCard).getByText('Yes')).toBeInTheDocument()
    expect(within(restoredCard).getByText('25.00')).toBeInTheDocument()
    expect(vi.mocked(updateExemption)).not.toHaveBeenCalled()
  })

  it('replaces a previous action result and stays dismissed after rerender', async () => {
    vi.mocked(fetchExemptionEditContext).mockResolvedValue({
      rateOverrideEnabled: false,
      fixedFeeRate: '',
      regionNumbers: ['1903', '1904'],
      locked: false,
      lockMessage: '',
    })
    vi.mocked(updateExemption)
      .mockResolvedValueOnce({
        success: false,
        message: 'The exemption could not be updated.',
        exemptionNumber: 'BOIC-205',
        errors: ['The first save failed.'],
        warnings: [],
      })
      .mockResolvedValueOnce({
        success: true,
        message: 'The exemption was updated successfully.',
        exemptionNumber: 'BOIC-205',
        errors: [],
        warnings: [],
      })

    const page = (
      <MemoryRouter initialEntries={['/provincial/exemption/BOIC-205']}>
        <Routes>
          <Route
            path="/provincial/exemption/:exemptionNumber"
            element={<ProvincialExemptionDetailsPage />}
          />
        </Routes>
      </MemoryRouter>
    )
    const { rerender } = render(page)

    await userEvent.click(await screen.findByRole('button', { name: 'Edit exemption details' }))
    const conditions = screen.getByLabelText('Conditions')
    await userEvent.type(conditions, ' first edit')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('The first save failed.')).toBeInTheDocument()

    await userEvent.clear(conditions)
    await userEvent.type(conditions, 'Second edit')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    const success = await screen.findByText(/^(Exemption details|Fees) saved\.$/)
    expect(success).toBeInTheDocument()
    expect(screen.queryByText('The first save failed.')).not.toBeInTheDocument()
    expect(screen.queryByText('Action failed')).not.toBeInTheDocument()

    await userEvent.click(
      within(success.closest('.cds--inline-notification') as HTMLElement).getByRole('button', {
        name: 'close notification',
      }),
    )
    rerender(page)
    expect(screen.queryByText(/^(Exemption details|Fees) saved\.$/)).not.toBeInTheDocument()
    expect(screen.queryByText('The first save failed.')).not.toBeInTheDocument()
  })

  it('confirms a newly created exemption after its first load and drops the notice from history', async () => {
    vi.mocked(fetchExemptionEditContext).mockResolvedValue({
      rateOverrideEnabled: false,
      fixedFeeRate: '',
      regionNumbers: ['1903', '1904'],
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
      {
        initialEntries: [
          {
            pathname: '/provincial/exemption/BOIC-205',
            state: { exemptionCreationNotice: { exemptionNumber: 'BOIC-205' } },
          },
        ],
      },
    )

    render(<RouterProvider router={router} />)

    await screen.findByRole('heading', { name: 'Exemption BOIC-205', level: 1 })
    expect(await screen.findByText('The exemption was saved.')).toBeInTheDocument()
    await waitFor(() => expect(router.state.location.state).toBeNull())
    expect(screen.getByText('The exemption was saved.')).toBeInTheDocument()
  })

  it('names the source applications when the created exemption was filled in from them', async () => {
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
      {
        initialEntries: [
          {
            pathname: '/provincial/exemption/BOIC-205',
            state: {
              exemptionCreationNotice: {
                exemptionNumber: 'BOIC-205',
                applicationNumbers: ['108597', '108594'],
              },
            },
          },
        ],
      },
    )

    render(<RouterProvider router={router} />)

    expect(await screen.findByText('Exemption BOIC-205 created.')).toBeInTheDocument()
    expect(
      screen.getByText('Details were filled in from applications 108597 and 108594.'),
    ).toBeInTheDocument()
  })

  it('renames an ordinary OIC and refreshes the saved number while retaining the return context', async () => {
    vi.mocked(fetchProvincialExemptionDetail).mockImplementation(async (number) => ({
      ...ministerialExemptionDetail,
      exemptionNumber: number,
    }))
    vi.mocked(fetchProvincialExemptionOptions).mockResolvedValue({
      exemptionTypes: [{ value: 'O', label: 'Order in Council' }],
      exemptionStatuses: [{ value: 'ACT', label: 'Active' }],
      regions: [],
    })
    vi.mocked(fetchExemptionEditContext).mockResolvedValue({
      rateOverrideEnabled: false,
      fixedFeeRate: '',
      regionNumbers: [],
      locked: false,
      lockMessage: '',
    })
    let resolveSave!: (value: Awaited<ReturnType<typeof updateExemption>>) => void
    vi.mocked(updateExemption).mockReturnValue(
      new Promise((resolve) => {
        resolveSave = resolve
      }),
    )
    const returnState = {
      returnTo: { label: 'Provincial exemption search', to: '/provincial/exemption?status=ACT' },
    }
    const router = createMemoryRouter(
      [
        {
          path: '/provincial/exemption/:exemptionNumber',
          element: <ProvincialExemptionDetailsPage />,
        },
      ],
      {
        initialEntries: [
          {
            pathname: '/provincial/exemption/EX-205',
            search: '?permitFilter=700',
            state: returnState,
          },
        ],
      },
    )
    render(<RouterProvider router={router} />)

    await userEvent.click(await screen.findByRole('button', { name: 'Edit exemption details' }))
    const number = screen.getByRole('textbox', { name: /Exemption number/ })
    expect(number).toBeEnabled()
    expect(number).toHaveValue('EX-205')
    expect(number).toHaveAttribute('maxlength', '8')
    await userEvent.clear(number)
    await userEvent.type(number, 'ex/206')
    expect(number).toHaveValue('EX/206')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    const tabs = screen
      .getByRole('tab', { name: 'Exemption details' })
      .closest('.application-detail-tabs-column')
    expect(tabs).toHaveAttribute('inert')
    expect(tabs).toHaveAttribute('aria-busy', 'true')
    await act(async () => {
      resolveSave({
        success: true,
        message: 'The exemption was updated successfully.',
        exemptionNumber: 'EX/206',
        errors: [],
        warnings: [],
      })
    })

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/provincial/exemption/EX%2F206'),
    )
    expect(router.state.historyAction).toBe('REPLACE')
    expect(router.state.location.search).toBe('?permitFilter=700')
    expect(router.state.location.state).toEqual(returnState)
    expect(vi.mocked(updateExemption)).toHaveBeenCalledWith(
      expect.objectContaining({
        exemptionNumber: 'EX/206',
        previousExemptionNumber: 'EX-205',
      }),
    )
    await waitFor(() =>
      expect(vi.mocked(fetchExemptionEditContext)).toHaveBeenLastCalledWith('EX/206'),
    )
    expect(vi.mocked(fetchProvincialExemptionDetail).mock.calls.map(([value]) => value)).toEqual([
      'EX-205',
      'EX/206',
    ])
    expect(vi.mocked(fetchExemptionApplications)).toHaveBeenLastCalledWith('EX/206')
    expect(vi.mocked(fetchExemptionPermits)).toHaveBeenLastCalledWith('EX/206')
    expect(screen.queryByRole('dialog', { name: 'Unsaved changes' })).not.toBeInTheDocument()
    await userEvent.click(await screen.findByRole('button', { name: 'Edit exemption details' }))
    expect(screen.getByRole('textbox', { name: /Exemption number/ })).toHaveValue('EX/206')
  })

  it('retains a rejected OIC number correction and restores it when cancelled', async () => {
    vi.mocked(fetchProvincialExemptionDetail).mockResolvedValue(ministerialExemptionDetail)
    vi.mocked(fetchProvincialExemptionOptions).mockResolvedValue({
      exemptionTypes: [{ value: 'O', label: 'Order in Council' }],
      exemptionStatuses: [{ value: 'ACT', label: 'Active' }],
      regions: [],
    })
    vi.mocked(fetchExemptionEditContext).mockResolvedValue({
      rateOverrideEnabled: false,
      fixedFeeRate: '',
      regionNumbers: [],
      locked: false,
      lockMessage: '',
    })
    vi.mocked(updateExemption).mockResolvedValue({
      success: false,
      message: 'Unable to update exemption.',
      exemptionNumber: 'EX-205',
      errors: ['Exemption number is already assigned.'],
      warnings: [],
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

    await userEvent.click(await screen.findByRole('button', { name: 'Edit exemption details' }))
    const number = screen.getByRole('textbox', { name: /Exemption number/ })
    await userEvent.clear(number)
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(screen.getByText('Exemption number is required')).toBeInTheDocument()
    expect(vi.mocked(updateExemption)).not.toHaveBeenCalled()
    await userEvent.type(number, 'EX-206')
    expect(screen.queryByText('Exemption number is required')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Exemption number is already assigned.')).toBeInTheDocument()
    expect(number).toHaveValue('EX-206')
    expect(router.state.location.pathname).toBe('/provincial/exemption/EX-205')
    expect(vi.mocked(fetchProvincialExemptionDetail)).toHaveBeenCalledTimes(1)
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await userEvent.click(
      within(await screen.findByRole('dialog', { name: 'Discard changes?' })).getByRole('button', {
        name: 'Discard changes',
      }),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Edit exemption details' }))
    expect(screen.getByRole('textbox', { name: /Exemption number/ })).toHaveValue('EX-205')
  })

  it('asks to discard an application draft before correcting the exemption number', async () => {
    vi.mocked(useAuth).mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({ roles: ['LEXIS_APPLICATION_APPROVER'] }),
        canPerform: vi.fn((action: string) => action === 'saveExemption'),
      }),
    )
    vi.mocked(fetchProvincialExemptionDetail).mockResolvedValue(ministerialExemptionDetail)
    vi.mocked(fetchProvincialExemptionOptions).mockResolvedValue({
      exemptionTypes: [{ value: 'O', label: 'Order in Council' }],
      exemptionStatuses: [{ value: 'ACT', label: 'Active' }],
      regions: [],
    })
    vi.mocked(fetchExemptionEditContext).mockResolvedValue({
      rateOverrideEnabled: false,
      fixedFeeRate: '',
      regionNumbers: [],
      locked: false,
      lockMessage: '',
    })
    vi.mocked(updateExemption).mockResolvedValue({
      success: true,
      message: 'Saved.',
      exemptionNumber: 'EX-205',
      errors: [],
      warnings: [],
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
    await userEvent.click(await screen.findByRole('tab', { name: 'Applications' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Add application' }))
    await userEvent.type(await screen.findByLabelText('Application number'), '12345')

    await userEvent.click(screen.getByRole('tab', { name: 'Exemption details' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Keep editing' }))
    expect(screen.getByRole('tab', { name: 'Applications' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByLabelText('Application number')).toHaveValue('12345')
    expect(vi.mocked(updateExemption)).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('tab', { name: 'Exemption details' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Discard changes' }))
    expect(screen.queryByLabelText('Application number')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Edit exemption details' }))
    await userEvent.type(screen.getByLabelText('Conditions'), ' updated')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(vi.mocked(updateExemption)).toHaveBeenCalledTimes(1))
    expect(vi.mocked(updateExemption)).toHaveBeenCalledWith(
      expect.objectContaining({ exemptionNumber: 'EX-205' }),
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Edit exemption details' }))
    await userEvent.clear(screen.getByRole('textbox', { name: /Exemption number/ }))
    await userEvent.type(screen.getByRole('textbox', { name: /Exemption number/ }), 'EX-206')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(vi.mocked(updateExemption)).toHaveBeenCalledTimes(2))
    expect(vi.mocked(updateExemption)).toHaveBeenLastCalledWith(
      expect.objectContaining({ exemptionNumber: 'EX-206', previousExemptionNumber: 'EX-205' }),
    )
    expect(router.state.location.pathname).toBe('/provincial/exemption/EX-205')
  }, 15_000)

  it('asks before leaving the exemption with an unsaved number correction', async () => {
    vi.mocked(fetchProvincialExemptionDetail).mockResolvedValue(ministerialExemptionDetail)
    vi.mocked(fetchProvincialExemptionOptions).mockResolvedValue({
      exemptionTypes: [{ value: 'O', label: 'Order in Council' }],
      exemptionStatuses: [{ value: 'ACT', label: 'Active' }],
      regions: [],
    })
    vi.mocked(fetchExemptionEditContext).mockResolvedValue({
      rateOverrideEnabled: false,
      fixedFeeRate: '',
      regionNumbers: [],
      locked: false,
      lockMessage: '',
    })
    vi.mocked(updateExemption).mockResolvedValue({
      success: true,
      message: 'Saved.',
      exemptionNumber: 'EX-206',
      errors: [],
      warnings: [],
    })
    const router = createMemoryRouter(
      [
        {
          path: '/provincial/exemption/:exemptionNumber',
          element: <ProvincialExemptionDetailsPage />,
        },
        { path: '/provincial/exemption', element: <h1>Exemption search destination</h1> },
      ],
      { initialEntries: ['/provincial/exemption/EX-205'] },
    )
    render(<RouterProvider router={router} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Edit exemption details' }))
    await userEvent.clear(screen.getByRole('textbox', { name: /Exemption number/ }))
    await userEvent.type(screen.getByRole('textbox', { name: /Exemption number/ }), 'EX-206')
    await act(async () => {
      await router.navigate('/provincial/exemption?status=ACT')
    })
    const dialog = await screen.findByRole('dialog', { name: 'Discard changes?' })
    expect(within(dialog).getByText('Your changes will be lost.')).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: /Save/ })).not.toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep editing' }))

    expect(router.state.location.pathname).toBe('/provincial/exemption/EX-205')
    expect(screen.getByRole('textbox', { name: /Exemption number/ })).toHaveValue('EX-206')

    await act(async () => {
      await router.navigate('/provincial/exemption?status=ACT')
    })
    await userEvent.click(
      within(await screen.findByRole('dialog', { name: 'Discard changes?' })).getByRole('button', {
        name: 'Discard changes',
      }),
    )

    expect(
      await screen.findByRole('heading', { name: 'Exemption search destination' }),
    ).toBeInTheDocument()
    expect(router.state.location.search).toBe('?status=ACT')
    expect(vi.mocked(updateExemption)).not.toHaveBeenCalled()
  })

  it('does not retain the old edit context when the renamed OIC cannot be reloaded', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.mocked(fetchProvincialExemptionDetail)
      .mockResolvedValueOnce(ministerialExemptionDetail)
      .mockRejectedValueOnce(new Error('Detail refresh failed'))
    vi.mocked(fetchProvincialExemptionOptions).mockResolvedValue({
      exemptionTypes: [{ value: 'O', label: 'Order in Council' }],
      exemptionStatuses: [{ value: 'ACT', label: 'Active' }],
      regions: [],
    })
    vi.mocked(fetchExemptionEditContext).mockResolvedValue({
      rateOverrideEnabled: false,
      fixedFeeRate: '',
      regionNumbers: [],
      locked: false,
      lockMessage: '',
    })
    vi.mocked(updateExemption).mockResolvedValue({
      success: true,
      message: 'Saved.',
      exemptionNumber: 'EX-206',
      errors: [],
      warnings: [],
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
    await userEvent.click(await screen.findByRole('button', { name: 'Edit exemption details' }))
    await userEvent.clear(screen.getByRole('textbox', { name: /Exemption number/ }))
    await userEvent.type(screen.getByRole('textbox', { name: /Exemption number/ }), 'EX-206')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(
      await screen.findByText('Unable to retrieve provincial exemption detail.'),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/provincial/exemption/EX-206')
    expect(screen.queryByRole('button', { name: 'Edit exemption details' })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: /Exemption number/ })).not.toBeInTheDocument()
    expect(vi.mocked(fetchExemptionEditContext)).toHaveBeenCalledTimes(1)
    consoleError.mockRestore()
  })

  it.each([
    ['M', 'Ministerial Order'],
    ['B', 'Blanket Order in Council'],
  ])('keeps %s exemption identifiers fixed when editing', async (type, description) => {
    vi.mocked(fetchProvincialExemptionDetail).mockResolvedValue({
      ...exemptionDetail,
      exemptionTypeCode: type,
      exemptionTypeDescription: description,
      blanketOic: type === 'B',
    })
    vi.mocked(fetchProvincialExemptionOptions).mockResolvedValue({
      exemptionTypes: [{ value: type, label: description }],
      exemptionStatuses: [{ value: 'ACT', label: 'Active' }],
      regions: [{ value: '1903', label: 'Region 1903' }],
    })
    vi.mocked(fetchExemptionEditContext).mockResolvedValue({
      rateOverrideEnabled: false,
      fixedFeeRate: '',
      regionNumbers: ['1903'],
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
    await userEvent.click(await screen.findByRole('button', { name: 'Edit exemption details' }))
    expect(screen.queryByRole('textbox', { name: /Exemption number/ })).not.toBeInTheDocument()
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

    await userEvent.click(await screen.findByRole('button', { name: 'Edit exemption details' }))
    const expiryDate = screen.getByLabelText('Expiry date')
    fireEvent.change(expiryDate, { target: { value: '2026-02-01' } })
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(screen.getByText('Expiry date must be after the approval date')).toBeInTheDocument()
    expect(vi.mocked(updateExemption)).not.toHaveBeenCalled()

    fireEvent.change(expiryDate, { target: { value: '2026-02-02' } })
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() =>
      expect(vi.mocked(updateExemption)).toHaveBeenCalledWith(
        expect.objectContaining({
          approvalDate: '2026-02-01',
          expiryDate: '2026-02-02',
        }),
      ),
    )
  })

  it('rejects impossible dates instead of silently preserving stored values', async () => {
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

    await userEvent.click(await screen.findByRole('button', { name: 'Edit exemption details' }))
    fireEvent.change(screen.getByLabelText('Approval date'), {
      target: { value: '2026-02-31' },
    })
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(screen.getAllByText('Approval date must be YYYY-MM-DD').length).toBeGreaterThan(0)
    expect(screen.queryByText('Review exemption values')).not.toBeInTheDocument()
    expect(vi.mocked(updateExemption)).not.toHaveBeenCalled()
  })

  it('rejects exemption conditions that Oracle cannot store', async () => {
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

    await userEvent.click(await screen.findByRole('button', { name: 'Edit exemption details' }))
    const conditions = screen.getByLabelText('Conditions')
    fireEvent.change(conditions, { target: { value: 'Résumé' } })
    expect(
      conditions.closest('.cds--form-item')?.querySelector('.cds--text-area__label-counter'),
    ).toHaveTextContent('6/250')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(
      await screen.findByText(
        'Conditions contain unsupported characters. Use unaccented letters, numbers, spaces, or standard punctuation.',
      ),
    ).toBeInTheDocument()
    expect(vi.mocked(updateExemption)).not.toHaveBeenCalled()
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

    await userEvent.click(await screen.findByRole('button', { name: 'Edit exemption details' }))
    const approvedVolume = screen.getByLabelText('Approval volume (m³)')
    await userEvent.clear(approvedVolume)
    await userEvent.type(approvedVolume, '9999999.99')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

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

    await userEvent.click(await screen.findByRole('button', { name: 'Edit exemption details' }))
    const approvedVolume = screen.getByLabelText('Approval volume (m³)')
    await userEvent.clear(approvedVolume)
    await userEvent.type(approvedVolume, '250.999')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(
      screen.getByText(
        'Approval volume must be greater than 0, at most 9,999,999.99, and have at most two decimal places',
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

    await userEvent.click(await screen.findByRole('button', { name: 'Edit exemption details' }))
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

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await userEvent.click(
      within(await screen.findByRole('dialog', { name: 'Discard changes?' })).getByRole('button', {
        name: 'Discard changes',
      }),
    )
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
    expect(screen.queryByRole('button', { name: 'Edit exemption details' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument()
    expect(document.querySelector('.detail-page-error')).not.toBeInTheDocument()
    expect(vi.mocked(updateExemption)).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('tab', { name: 'Fees' }))
    expect(
      await screen.findByRole('heading', { name: 'Fee rate unavailable', level: 3 }),
    ).toBeInTheDocument()
  })

  it('stops an exemption save when authoritative options fail', async () => {
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
    await userEvent.click(screen.getByRole('button', { name: 'Edit exemption details' }))
    expect(screen.queryByRole('combobox', { name: 'Exemption type' })).not.toBeInTheDocument()
    expect(
      screen.getByText('Exemption type', { selector: 'dt' }).nextElementSibling,
    ).toHaveTextContent('Blanket Order in Council')
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled()
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(
      screen.getByText(
        'Authoritative exemption options must load before these changes can be saved.',
      ),
    ).toBeInTheDocument()
    expect(vi.mocked(updateExemption)).not.toHaveBeenCalled()
  })

  it('distinguishes configured-empty options while still stopping exemption saves', async () => {
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
    await userEvent.click(screen.getByRole('button', { name: 'Edit exemption details' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(
      screen.getByText(
        'Authoritative exemption options must load before these changes can be saved.',
      ),
    ).toBeInTheDocument()
    expect(vi.mocked(updateExemption)).not.toHaveBeenCalled()
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

    await userEvent.click(await screen.findByRole('button', { name: 'Edit exemption details' }))
    await userEvent.type(screen.getByLabelText('Conditions'), ' Updated')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(vi.mocked(updateExemption)).toHaveBeenCalledTimes(1))
    expect(
      await screen.findByText(
        'Exemption edit settings could not be loaded. Editing is unavailable until the data can be retrieved.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit exemption details' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument()
    expect(
      screen
        .getByText(/The exemption was updated successfully.*could not be refreshed/)
        .closest('.cds--inline-notification'),
    ).toHaveClass('cds--inline-notification--warning')
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

    await userEvent.click(await screen.findByRole('button', { name: 'Edit exemption details' }))
    await userEvent.type(screen.getByLabelText('Conditions'), ' Updated')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(vi.mocked(fetchExemptionEditContext)).toHaveBeenCalledTimes(2))
    expect(
      screen.queryByText(
        'Exemption edit settings could not be loaded. Editing is unavailable until the data can be retrieved.',
      ),
    ).not.toBeInTheDocument()

    await act(async () => {
      resolveRefreshedEditContext(editContext)
    })

    expect(await screen.findByText(/^(Exemption details|Fees) saved\.$/)).toBeInTheDocument()
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

    expect(
      await screen.findByRole('button', { name: 'Edit exemption details' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByText(
        'Exemption edit settings could not be loaded. Editing is unavailable until the data can be retrieved.',
      ),
    ).not.toBeInTheDocument()
  })

  it('ends an unchanged exemption edit when another tab opens', async () => {
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
    expect(screen.queryByRole('button', { name: 'Edit exemption details' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: 'Exemption details' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Edit exemption details' }))

    expect(screen.getByRole('tab', { name: 'Exemption details' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByRole('heading', { name: 'Exemption details', level: 2 })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: 'Permits' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Permits' })).toHaveAttribute('aria-selected', 'true')
    await userEvent.click(screen.getByRole('tab', { name: 'Exemption details' }))
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit exemption details' })).toBeInTheDocument()

    expect(screen.queryByRole('tab', { name: 'Remarks' })).not.toBeInTheDocument()
  })

  it('shows locked exemption type, holder and approval date as the same text in view and edit', async () => {
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

    const lockedFields = ['Exemption type', 'Exemption holder', 'Approval date']
    const fieldValue = (label: string) =>
      screen.getByText(label, { selector: 'dt' }).nextElementSibling?.textContent
    const editButton = await screen.findByRole('button', { name: 'Edit exemption details' })
    const viewValues = lockedFields.map(fieldValue)
    expect(viewValues).toEqual(['Blanket Order in Council', 'Blanket OIC', '2026-02-01'])

    await userEvent.click(editButton)

    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument()
    expect(lockedFields.map(fieldValue)).toEqual(viewValues)
    expect(screen.queryByRole('combobox', { name: /Exemption type/ })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Approval date/)).not.toBeInTheDocument()
    expect(screen.getByLabelText(/Expiry date/)).toBeEnabled()
  })

  it('asks before a tab switch drops exemption changes and protects relationship drafts', async () => {
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

    await userEvent.click(await screen.findByRole('button', { name: 'Edit exemption details' }))
    await userEvent.clear(screen.getByLabelText('Conditions'))
    await userEvent.type(screen.getByLabelText('Conditions'), 'Unsaved conditions')
    await userEvent.click(screen.getByRole('tab', { name: 'Applications' }))
    await userEvent.click(
      within(await screen.findByRole('dialog', { name: 'Discard changes?' })).getByRole('button', {
        name: 'Keep editing',
      }),
    )
    expect(screen.getByRole('tab', { name: 'Exemption details' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByLabelText('Conditions')).toHaveValue('Unsaved conditions')

    await userEvent.click(screen.getByRole('tab', { name: 'Applications' }))
    await userEvent.click(
      within(await screen.findByRole('dialog', { name: 'Discard changes?' })).getByRole('button', {
        name: 'Discard changes',
      }),
    )
    expect(screen.getByRole('tab', { name: 'Applications' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Add application' }))
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
      exemptionTypeCode: 'M',
      exemptionTypeDescription: 'Ministerial',
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
    expect(screen.getByRole('dialog', { name: 'Approve exemption EX-205' })).toBeInTheDocument()
    await act(async () => {
      await router.navigate('/provincial/exemption/EX-206')
    })

    await waitFor(() => expect(router.state.location.pathname).toContain('EX-206'))
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Approve exemption EX-205' }),
      ).not.toBeInTheDocument(),
    )
    expect(
      await screen.findByRole('heading', { name: 'Exemption EX-206', level: 1 }),
    ).toBeInTheDocument()
    expect(vi.mocked(approveExemptions)).not.toHaveBeenCalled()
  })

  it('holds navigation until an in-flight approval notification finishes', async () => {
    vi.mocked(useAuth).mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({ roles: ['LEXIS_EXEMPTION_APPROVER'] }),
        canPerform: (action: string) => action === 'saveExemption' || action === 'approveExemption',
      }),
    )
    vi.mocked(fetchProvincialExemptionDetail).mockImplementation(async (exemptionNumber) => ({
      ...ministerialExemptionDetail,
      exemptionTypeCode: 'M',
      exemptionTypeDescription: 'Ministerial',
      exemptionNumber,
      exemptionStatusCode: 'NEW',
      exemptionStatusDescription: 'New',
    }))
    vi.mocked(fetchExemptionApprovalRecipients).mockImplementation(async (numbers) =>
      numbers.map((exemptionNumber) => ({
        exemptionNumber,
        ownerEmail: 'owner@example.test',
        agentEmail: '',
        agentApplicable: false,
        sendable: true,
        message: '',
      })),
    )
    vi.mocked(fetchExemptionEditContext).mockResolvedValue({
      rateOverrideEnabled: false,
      fixedFeeRate: '',
      regionNumbers: ['1903'],
      locked: false,
      lockMessage: '',
    })
    let resolveQueue:
      | ((value: Awaited<ReturnType<typeof sendExemptionApprovalNotifications>>) => void)
      | undefined
    mockedSendExemptionApprovalNotifications.mockImplementationOnce(
      () =>
        new Promise<Awaited<ReturnType<typeof sendExemptionApprovalNotifications>>>((resolve) => {
          resolveQueue = resolve
        }),
    )
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
    const oldDialog = screen.getByRole('dialog', { name: 'Approve exemption EX-205' })
    await within(oldDialog).findByRole('button', { name: 'Edit recipients' })
    await userEvent.click(
      within(oldDialog).getByRole('checkbox', {
        name: 'I certify that this exemption has been approved',
      }),
    )
    await userEvent.click(within(oldDialog).getByRole('button', { name: 'Approve and send email' }))
    await waitFor(() => expect(mockedSendExemptionApprovalNotifications).toHaveBeenCalledTimes(1))

    await act(async () => {
      await router.navigate('/provincial/exemption/EX-206')
    })
    expect(router.state.location.pathname).toBe('/provincial/exemption/EX-205')
    expect(
      await screen.findByText(/A change to this exemption is still being completed/),
    ).toBeVisible()

    await act(async () => {
      resolveQueue?.({
        outcomes: [{ exemptionNumber: 'EX-205', queued: true, message: 'Queued.' }],
      })
    })
    expect(await screen.findByText('Exemption approved and now Active.')).toBeInTheDocument()
    expect(screen.getByText(/^Approval email sent to the owner \(/)).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/provincial/exemption/EX-205')
    expect(
      screen.queryByRole('dialog', { name: 'Approve exemption EX-205' }),
    ).not.toBeInTheDocument()
  })

  it('withholds approval while an application relationship draft is open', async () => {
    vi.mocked(useAuth).mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({
          roles: ['LEXIS_APPLICATION_APPROVER', 'LEXIS_EXEMPTION_APPROVER'],
        }),
        canPerform: (action: string) => action === 'saveExemption' || action === 'approveExemption',
      }),
    )
    vi.mocked(fetchProvincialExemptionDetail).mockResolvedValue({
      ...ministerialExemptionDetail,
      exemptionTypeCode: 'M',
      exemptionTypeDescription: 'Ministerial',
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

    expect(await screen.findByRole('button', { name: 'Approve exemption' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: 'Applications' }))
    await userEvent.click(screen.getByRole('button', { name: 'Add application' }))
    expect(screen.queryByRole('button', { name: 'Approve exemption' })).not.toBeInTheDocument()
    await userEvent.type(await screen.findByLabelText('Application number'), '12345')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await userEvent.click(
      within(await screen.findByRole('dialog', { name: 'Discard changes?' })).getByRole('button', {
        name: 'Discard changes',
      }),
    )
    expect(await screen.findByRole('button', { name: 'Approve exemption' })).toBeInTheDocument()
    expect(vi.mocked(approveExemptions)).not.toHaveBeenCalled()
  })

  it('clears a previous approval failure when reopening the confirmation', async () => {
    vi.mocked(useAuth).mockReturnValue(
      createTestAuthContext({ canPerform: (action: string) => action === 'approveExemption' }),
    )
    vi.mocked(fetchProvincialExemptionDetail).mockResolvedValue({
      ...ministerialExemptionDetail,
      exemptionTypeCode: 'M',
      exemptionTypeDescription: 'Ministerial',
      exemptionStatusCode: 'NEW',
      exemptionStatusDescription: 'New',
    })
    vi.mocked(approveExemptions).mockResolvedValue({
      success: true,
      valid: false,
      sendGrid: [],
      errorMessage: 'The exemption could not be approved.',
      errors: [],
      warnings: [],
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
    const dialog = screen.getByRole('dialog', { name: 'Approve exemption EX-205' })
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Send approval email' }))
    await userEvent.click(
      within(dialog).getByRole('checkbox', {
        name: 'I certify that this exemption has been approved',
      }),
    )
    await userEvent.click(within(dialog).getByRole('button', { name: 'Approve exemption' }))
    expect(
      await within(dialog).findByText('The exemption could not be approved.'),
    ).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByText('The exemption could not be approved.')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Approve exemption' }))
    expect(screen.queryByText('The exemption could not be approved.')).not.toBeInTheDocument()
    expect(
      within(screen.getByRole('dialog', { name: 'Approve exemption EX-205' })).getByRole(
        'checkbox',
        { name: 'I certify that this exemption has been approved' },
      ),
    ).not.toBeChecked()
    expect(approveExemptions).toHaveBeenCalledTimes(1)
  })

  it('offers approval on the record only for a Ministerial exemption', async () => {
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

    await screen.findByRole('heading', { name: 'Exemption EX-205', level: 1 })
    expect(screen.queryByRole('button', { name: 'Approve exemption' })).not.toBeInTheDocument()
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
      exemptionTypeCode: 'M',
      exemptionTypeDescription: 'Ministerial',
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
    const firstDialog = screen.getByRole('dialog', { name: 'Approve exemption EX-205' })
    await userEvent.click(
      within(firstDialog).getByRole('checkbox', { name: 'Send approval email' }),
    )
    const firstCertification = within(firstDialog).getByRole('checkbox', {
      name: 'I certify that this exemption has been approved',
    })
    const firstConfirm = within(firstDialog).getByRole('button', { name: 'Approve exemption' })
    expect(firstCertification).not.toBeChecked()
    expect(firstConfirm).toBeEnabled()
    expect(firstConfirm).toHaveClass('cds--btn--primary')
    expect(firstConfirm).not.toHaveClass('cds--btn--danger')
    expect(firstConfirm.parentElement).toHaveClass('cds--modal-footer')
    await userEvent.click(firstConfirm)
    expect(
      within(firstDialog).getByText('Confirm that you certify this exemption has been approved'),
    ).toBeVisible()
    expect(vi.mocked(approveExemptions)).not.toHaveBeenCalled()

    await userEvent.click(firstCertification)
    expect(
      within(firstDialog).queryByText('Confirm that you certify this exemption has been approved'),
    ).not.toBeInTheDocument()
    await userEvent.click(within(firstDialog).getByRole('button', { name: 'Cancel' }))
    await userEvent.click(screen.getByRole('button', { name: 'Approve exemption' }))

    const reopenedDialog = screen.getByRole('dialog', { name: 'Approve exemption EX-205' })
    await userEvent.click(
      within(reopenedDialog).getByRole('checkbox', { name: 'Send approval email' }),
    )
    const reopenedCertification = within(reopenedDialog).getByRole('checkbox', {
      name: 'I certify that this exemption has been approved',
    })
    const reopenedConfirm = within(reopenedDialog).getByRole('button', {
      name: 'Approve exemption',
    })
    expect(reopenedCertification).not.toBeChecked()
    expect(
      within(reopenedDialog).queryByText(
        'Confirm that you certify this exemption has been approved',
      ),
    ).not.toBeInTheDocument()
    await userEvent.click(reopenedCertification)
    await userEvent.click(reopenedConfirm)

    // No explicit version: the request carries the version of the exemption being viewed.
    await waitFor(() => expect(vi.mocked(approveExemptions).mock.calls).toEqual([[['EX-205']]]))
    expect(fetchCurrentExemptionRecordVersion).not.toHaveBeenCalled()
    expect(mockedSendExemptionApprovalNotifications).not.toHaveBeenCalled()
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Approve exemption EX-205' }),
      ).not.toBeInTheDocument(),
    )
    expect(screen.getByText('Exemption approved and now Active.')).toBeInTheDocument()
    expect(
      screen.getByText('No approval email was sent. Notify the applicant another way.'),
    ).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Approve exemption' }))
    const postApprovalDialog = screen.getByRole('dialog', { name: 'Approve exemption EX-205' })
    expect(
      screen.queryByText('Exemption approved. Approval notifications were skipped.'),
    ).not.toBeInTheDocument()
    expect(
      within(postApprovalDialog).getByRole('checkbox', {
        name: 'I certify that this exemption has been approved',
      }),
    ).not.toBeChecked()
  })

  it.each([
    ['without a response', new Error('Network Error')],
    // A gateway error can follow a committed approval.
    ['with a gateway error', { response: { status: 504, data: {} } }],
  ])('reports an approval %s as unconfirmed and reloads the exemption', async (_, failure) => {
    vi.mocked(useAuth).mockReturnValue(
      createTestAuthContext({ canPerform: (action: string) => action === 'approveExemption' }),
    )
    vi.mocked(fetchProvincialExemptionDetail)
      .mockResolvedValueOnce({
        ...ministerialExemptionDetail,
        exemptionTypeCode: 'M',
        exemptionTypeDescription: 'Ministerial',
        exemptionStatusCode: 'NEW',
        exemptionStatusDescription: 'New',
      })
      .mockResolvedValue({ ...ministerialExemptionDetail })
    vi.mocked(fetchExemptionEditContext).mockResolvedValue({
      rateOverrideEnabled: false,
      fixedFeeRate: '',
      regionNumbers: ['1903'],
      locked: false,
      lockMessage: '',
    })
    vi.mocked(approveExemptions).mockRejectedValue(failure)

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
    const dialog = screen.getByRole('dialog', { name: 'Approve exemption EX-205' })
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Send approval email' }))
    await userEvent.click(
      within(dialog).getByRole('checkbox', {
        name: 'I certify that this exemption has been approved',
      }),
    )
    await userEvent.click(within(dialog).getByRole('button', { name: 'Approve exemption' }))

    expect(await within(dialog).findByText('Approval status unconfirmed')).toBeInTheDocument()
    expect(within(dialog).queryByText('Approval failed')).not.toBeInTheDocument()
    expect(
      within(dialog).getByText(
        'The approval status could not be confirmed. Check the exemption’s current status before retrying.',
      ),
    ).toBeInTheDocument()
    await waitFor(() => expect(vi.mocked(fetchProvincialExemptionDetail)).toHaveBeenCalledTimes(2))
    const header = screen.getByRole('heading', { name: 'Exemption EX-205', level: 1 })
    expect(within(header.closest('header') as HTMLElement).getByText('Active')).toBeInTheDocument()
  })

  it('keeps an approval rejected with an error response as a failure', async () => {
    vi.mocked(useAuth).mockReturnValue(
      createTestAuthContext({ canPerform: (action: string) => action === 'approveExemption' }),
    )
    vi.mocked(fetchProvincialExemptionDetail).mockResolvedValue({
      ...ministerialExemptionDetail,
      exemptionTypeCode: 'M',
      exemptionTypeDescription: 'Ministerial',
      exemptionStatusCode: 'NEW',
      exemptionStatusDescription: 'New',
    })
    vi.mocked(approveExemptions).mockRejectedValue({
      response: {
        status: 409,
        data: { code: 'STALE_RECORD', detail: 'This record was saved by another user.' },
      },
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
    const dialog = screen.getByRole('dialog', { name: 'Approve exemption EX-205' })
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Send approval email' }))
    await userEvent.click(
      within(dialog).getByRole('checkbox', {
        name: 'I certify that this exemption has been approved',
      }),
    )
    await userEvent.click(within(dialog).getByRole('button', { name: 'Approve exemption' }))

    expect(await within(dialog).findByText('Approval failed')).toBeInTheDocument()
    expect(
      within(dialog).getByText(
        'This exemption changed after you opened it. Reload the page to see its current status before approving it.',
      ),
    ).toBeInTheDocument()
    expect(within(dialog).queryByText('Approval status unconfirmed')).not.toBeInTheDocument()
    expect(vi.mocked(fetchProvincialExemptionDetail)).toHaveBeenCalledTimes(1)
  })

  it('retries an edited approval notification without approving the exemption again', async () => {
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
      exemptionTypeCode: 'M',
      exemptionTypeDescription: 'Ministerial',
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
    mockedSendExemptionApprovalNotifications
      .mockResolvedValueOnce({
        outcomes: [{ exemptionNumber: 'EX-205', queued: false, message: 'Unavailable.' }],
      })
      .mockResolvedValueOnce({
        outcomes: [{ exemptionNumber: 'EX-205', queued: true, message: 'Queued.' }],
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
    const approvalDialog = screen.getByRole('dialog', { name: 'Approve exemption EX-205' })
    await userEvent.click(
      await within(approvalDialog).findByRole('button', { name: 'Edit recipients' }),
    )
    const recipient = within(approvalDialog).getByLabelText('Owner email')
    expect(recipient).toHaveValue('owner@example.test')
    await userEvent.clear(recipient)
    await userEvent.type(recipient, 'corrected@example.test')
    await userEvent.click(
      within(approvalDialog).getByRole('checkbox', {
        name: 'I certify that this exemption has been approved',
      }),
    )
    await userEvent.click(
      within(approvalDialog).getByRole('button', { name: 'Approve and send email' }),
    )

    await waitFor(() =>
      expect(mockedSendExemptionApprovalNotifications).toHaveBeenCalledWith([
        { exemptionNumber: 'EX-205', ownerEmail: 'corrected@example.test', agentEmail: '' },
      ]),
    )
    const retryDialog = await screen.findByRole('dialog', { name: 'Retry approval notifications' })
    expect(
      within(retryDialog).getByText(/Notifications were not queued for EX-205/),
    ).toBeInTheDocument()
    expect(approveExemptions).toHaveBeenCalledTimes(1)
    await userEvent.click(within(retryDialog).getByRole('button', { name: 'Retry notifications' }))
    await waitFor(() => expect(mockedSendExemptionApprovalNotifications).toHaveBeenCalledTimes(2))
    expect(approveExemptions).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('Exemption approved and now Active.')).toBeInTheDocument()
    expect(screen.getByText(/^Approval email sent to the owner \(/)).toBeInTheDocument()
  })

  it('retains the refresh warning after approval and notification', async () => {
    vi.mocked(useAuth).mockReturnValue(
      createTestAuthContext({ canPerform: (action: string) => action === 'approveExemption' }),
    )
    vi.mocked(fetchProvincialExemptionDetail).mockResolvedValue({
      ...ministerialExemptionDetail,
      exemptionTypeCode: 'M',
      exemptionTypeDescription: 'Ministerial',
      exemptionStatusCode: 'NEW',
      exemptionStatusDescription: 'New',
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
    const dialog = screen.getByRole('dialog', { name: 'Approve exemption EX-205' })
    await within(dialog).findByRole('button', { name: 'Edit recipients' })
    vi.mocked(fetchProvincialExemptionDetail).mockRejectedValueOnce(new Error('Refresh failed'))
    await userEvent.click(
      within(dialog).getByRole('checkbox', {
        name: 'I certify that this exemption has been approved',
      }),
    )
    await userEvent.click(within(dialog).getByRole('button', { name: 'Approve and send email' }))

    expect(
      await screen.findByText(
        /^Approval email sent to the owner \(.+\)\. Refresh the page to see the latest status\.$/,
      ),
    ).toBeInTheDocument()
    expect(approveExemptions).toHaveBeenCalledTimes(1)
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
    expect(screen.queryByRole('button', { name: 'Edit exemption details' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: 'Documents' }))
    expect(await screen.findByRole('button', { name: 'Add documents' })).toBeInTheDocument()
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

  it.each([
    { type: 'B', missingDates: false },
    { type: 'B', missingDates: true },
    { type: 'O', missingDates: true },
    { type: 'M', missingDates: true },
  ])(
    'allows a cancelled $type exemption to reopen without changing locked fields (missing dates: $missingDates)',
    async ({ type, missingDates }) => {
      const cancelledDetail = {
        ...exemptionDetail,
        exemptionTypeCode: type,
        blanketOic: type === 'B',
        approvalDate: missingDates ? null : exemptionDetail.approvalDate,
        expiryDate: missingDates ? null : exemptionDetail.expiryDate,
        exemptionStatusCode: 'CAN',
        exemptionStatusDescription: 'Cancelled',
      }
      vi.mocked(fetchProvincialExemptionDetail).mockResolvedValue({
        ...cancelledDetail,
      })
      vi.mocked(fetchProvincialExemptionOptions).mockResolvedValue({
        exemptionTypes: [{ value: type, label: type }],
        exemptionStatuses: [
          { value: 'NEW', label: 'New' },
          { value: 'ACT', label: 'Active' },
          { value: 'CAN', label: 'Cancelled' },
        ],
        regions: [
          { value: '1903', label: 'Region 1903' },
          { value: '1904', label: 'Region 1904' },
        ],
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

      await userEvent.click(await screen.findByRole('button', { name: 'Edit exemption details' }))
      if (type === 'O') {
        expect(screen.getByRole('textbox', { name: /Exemption number/ })).toBeDisabled()
      }
      expect(screen.getByLabelText('Approval volume (m³)')).toBeDisabled()
      expect(screen.queryByLabelText('Approval date')).not.toBeInTheDocument()
      expect(
        screen.getByText('Approval date', { selector: 'dt' }).nextElementSibling,
      ).toHaveTextContent(cancelledDetail.approvalDate ?? 'Not approved')
      expect(screen.getByLabelText('Expiry date')).toBeDisabled()
      expect(screen.getByLabelText('Expiry date')).not.toHaveAttribute('aria-invalid', 'true')
      expect(screen.getByLabelText('Conditions')).toBeDisabled()
      await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
      expect(vi.mocked(updateExemption)).not.toHaveBeenCalled()
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Edit exemption details' })).toHaveFocus(),
      )
      await userEvent.click(screen.getByRole('button', { name: 'Edit exemption details' }))

      const status = screen.getByRole('combobox', { name: 'Status' })
      expect(status).toBeEnabled()
      await userEvent.click(status)
      const listboxId = status.getAttribute('aria-controls')
      const listbox = listboxId ? document.getElementById(listboxId) : null
      expect(listbox).not.toBeNull()
      await userEvent.click(within(listbox as HTMLElement).getByRole('option', { name: 'New' }))
      expect(
        screen.queryByText('Select New to reopen this cancelled exemption'),
      ).not.toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

      await waitFor(() =>
        expect(vi.mocked(updateExemption)).toHaveBeenCalledWith(
          expect.objectContaining({
            exemptionNumber: 'BOIC-205',
            exemptionStatusCode: 'NEW',
            exemptionTypeCode: type,
            approvalDate: cancelledDetail.approvalDate ?? '',
            expiryDate: cancelledDetail.expiryDate ?? '',
            approvedVolume: '500.0',
            otherConditions: 'Existing conditions',
          }),
        ),
      )
    },
  )
})

describe('regional exemption controls', () => {
  // A Ministerial exemption without stored regions, linked to applications in two regions.
  const linkedExemption: ProvincialExemptionDetail = {
    ...exemptionDetail,
    exemptionNumber: 'test-exemption',
    exemptionTypeCode: 'M',
    exemptionTypeDescription: 'Ministerial',
    exemptionStatusCode: 'NEW',
    exemptionStatusDescription: 'New',
    expiryDate: '2099-12-31',
    blanketOic: false,
  }

  // canPerform applies record regions the way AuthProvider does.
  const mockRegionalAuth = (roles: string[], actionRegions: Record<string, string[]>) => {
    const capabilities = createTestCapabilities({
      roles,
      grantedActions: Object.keys(actionRegions),
      actionRegions: normalizeActionRegions(actionRegions),
    })
    const granted = new Set(capabilities.grantedActions.map(normalizeAction))
    vi.mocked(useAuth).mockReturnValue(
      createTestAuthContext({
        capabilities,
        canPerform: vi.fn(
          (action: string, ...recordOrgUnits: [recordOrgUnits?: RecordOrgUnits]) =>
            granted.has(normalizeAction(action)) &&
            (recordOrgUnits.length === 0 ||
              withinRegions(allowedRegions(capabilities, action), recordOrgUnits[0])),
        ),
      }),
    )
  }

  const applicationApproverIn = (regions: string[]) =>
    mockRegionalAuth(['LEXIS_APPLICATION_APPROVER'], {
      '/exemptionDetails': regions,
      '/createExemption': regions,
      saveExemption: regions,
      '/fileExemptionUpload': regions,
    })

  const renderLinkedExemption = (accessRegionNumbers: string[]) => {
    vi.mocked(fetchProvincialExemptionDetail).mockResolvedValue(linkedExemption)
    vi.mocked(fetchExemptionEditContext).mockResolvedValue({
      rateOverrideEnabled: false,
      fixedFeeRate: '',
      regionNumbers: [],
      accessRegionNumbers,
      locked: false,
      lockMessage: '',
    })
    render(
      <MemoryRouter initialEntries={['/provincial/exemption/test-exemption']}>
        <Routes>
          <Route
            path="/provincial/exemption/:exemptionNumber"
            element={<ProvincialExemptionDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fetchProvincialExemptionOptions).mockResolvedValue({
      exemptionTypes: [{ value: 'M', label: 'Ministerial' }],
      exemptionStatuses: [
        { value: 'NEW', label: 'New' },
        { value: 'ACT', label: 'Active' },
      ],
      regions: [
        { value: '1903', label: 'Region 1903' },
        { value: '1908', label: 'Region 1908' },
      ],
    })
    vi.mocked(fetchExemptionApplications).mockResolvedValue({
      applications: [],
      containsUnmanu: false,
      ownerNumber: '00012345',
    })
    vi.mocked(fetchExemptionPermits).mockResolvedValue([])
  })

  it.each([
    [['1903', '1908'], true],
    [['1903'], false],
  ])(
    'offers editing and linking to an application approver in %j only when they hold every linked application region',
    async (grantedRegions, offered) => {
      applicationApproverIn(grantedRegions)
      renderLinkedExemption(['1903', '1908'])

      await screen.findByRole('heading', { name: 'Exemption test-exemption', level: 1 })
      await waitFor(() => expect(fetchExemptionEditContext).toHaveBeenCalled())
      if (offered) {
        expect(
          await screen.findByRole('button', { name: 'Edit exemption details' }),
        ).toBeInTheDocument()
        await userEvent.click(screen.getByRole('tab', { name: 'Applications' }))
        await userEvent.click(screen.getByRole('button', { name: 'Add application' }))
        expect(await screen.findByLabelText('Application number')).toBeInTheDocument()
      } else {
        expect(
          screen.queryByRole('button', { name: 'Edit exemption details' }),
        ).not.toBeInTheDocument()
        await userEvent.click(screen.getByRole('tab', { name: 'Applications' }))
        expect(screen.queryByLabelText('Application number')).not.toBeInTheDocument()
      }
    },
  )

  it.each([
    [['1908'], true],
    [['1903', '1908'], false],
  ])(
    'offers approval to a regional exemption approver for linked application regions %j only when they hold them all',
    async (accessRegionNumbers, offered) => {
      mockRegionalAuth(['LEXIS_EXEMPTION_APPROVER'], {
        '/exemptionDetails': ['1908'],
        saveExemption: ['1908'],
        approveExemption: ['1908'],
      })
      renderLinkedExemption(accessRegionNumbers)

      await screen.findByRole('heading', { name: 'Exemption test-exemption', level: 1 })
      await waitFor(() => expect(fetchExemptionEditContext).toHaveBeenCalled())
      if (offered) {
        expect(await screen.findByRole('button', { name: 'Approve exemption' })).toBeInTheDocument()
      } else {
        expect(screen.queryByRole('button', { name: 'Approve exemption' })).not.toBeInTheDocument()
      }
    },
  )

  it('saves only the stored regions, never the linked application regions', async () => {
    applicationApproverIn(['1903', '1908'])
    vi.mocked(updateExemption).mockResolvedValue({
      success: true,
      message: 'The exemption was updated successfully.',
      exemptionNumber: 'test-exemption',
      errors: [],
      warnings: [],
    })
    renderLinkedExemption(['1903', '1908'])

    await userEvent.click(await screen.findByRole('button', { name: 'Edit exemption details' }))
    await userEvent.clear(screen.getByLabelText('Conditions'))
    await userEvent.type(screen.getByLabelText('Conditions'), 'Updated conditions')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() =>
      expect(vi.mocked(updateExemption)).toHaveBeenCalledWith(
        expect.objectContaining({
          exemptionNumber: 'test-exemption',
          otherConditions: 'Updated conditions',
          regionNumbers: [],
        }),
      ),
    )
  })
})
