import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, Link, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import type { ProvincialExemptionDetail } from '@/interfaces/LexisDetails'
import ProvincialExemptionDetailsPage from '@/pages/ProvincialExemptionDetails'
import { fetchProvincialExemptionDetail } from '@/service/lexis-detail-service'
import { fetchProvincialExemptionOptions } from '@/service/search-options-service'
import {
  addApplicationToExemption,
  fetchExemptionApplications,
  fetchExemptionBlanketOicTotals,
  fetchExemptionEditContext,
  fetchExemptionPermits,
  updateExemption,
} from '@/service/provincial-exemption-detail-service'
import { createTestAuthContext, createTestCapabilities } from '@/test-utils/auth'

vi.mock('@/context/auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/service/lexis-detail-service', () => ({
  fetchProvincialApplicationDetail: vi.fn(),
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
  removeApplicationFromExemption: vi.fn(),
  updateExemption: vi.fn(),
}))

const blanketOicExemption: ProvincialExemptionDetail = {
  exemptionNumber: 'BOIC-205',
  exemptionTypeCode: 'B',
  exemptionTypeDescription: 'Blanket Order in Council',
  exemptionStatusCode: 'NEW',
  exemptionStatusDescription: 'New',
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

const ministerialExemption: ProvincialExemptionDetail = {
  ...blanketOicExemption,
  exemptionNumber: 'EX-205',
  exemptionTypeCode: 'M',
  exemptionTypeDescription: 'Ministerial',
  blanketOic: false,
}

const renderPage = (exemptionNumber = 'BOIC-205') => {
  const router = createMemoryRouter(
    [
      {
        path: '/provincial/exemption/:exemptionNumber',
        element: (
          <>
            <Link to="/provincial/exemption">Search exemptions</Link>
            <ProvincialExemptionDetailsPage />
          </>
        ),
      },
      { path: '/provincial/exemption', element: <h1>Exemption search page</h1> },
    ],
    { initialEntries: [`/provincial/exemption/${exemptionNumber}`] },
  )
  render(<RouterProvider router={router} />)
  return router
}

const discardDialog = () => screen.findByRole('dialog', { name: 'Discard changes?' })

describe('Provincial exemption detail form behaviour', () => {
  it.each([
    { tab: 'Exemption', edit: 'Edit exemption details' },
    { tab: 'Fees', edit: 'Edit fee override' },
  ])('closes unchanged $tab editing without updating the record', async ({ tab, edit }) => {
    renderPage()
    if (tab === 'Fees') await userEvent.click(await screen.findByRole('tab', { name: tab }))
    await userEvent.click(await screen.findByRole('button', { name: edit }))
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(screen.getByRole('button', { name: edit })).toHaveFocus())
    expect(updateExemption).not.toHaveBeenCalled()
    expect(screen.queryByText('Exemption updated.')).not.toBeInTheDocument()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue(
      createTestAuthContext({
        canPerform: vi.fn((action: string) => action === 'saveExemption'),
      }),
    )
    vi.mocked(fetchProvincialExemptionDetail).mockResolvedValue(blanketOicExemption)
    vi.mocked(fetchProvincialExemptionOptions).mockResolvedValue({
      exemptionTypes: [
        { value: 'B', label: 'Blanket Order in Council' },
        { value: 'M', label: 'Ministerial' },
      ],
      exemptionStatuses: [
        { value: 'NEW', label: 'New' },
        { value: 'ACT', label: 'Active' },
        { value: 'CAN', label: 'Cancelled' },
      ],
      regions: [{ value: '1903', label: 'Region 1903' }],
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
    vi.mocked(fetchExemptionEditContext).mockResolvedValue({
      rateOverrideEnabled: false,
      fixedFeeRate: '',
      regionNumbers: ['1903'],
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
  })

  it('focuses the first field on Edit and returns focus to Edit after Save', async () => {
    renderPage()

    const edit = await screen.findByRole('button', { name: 'Edit exemption details' })
    await userEvent.click(edit)
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Status' })).toHaveFocus())

    await userEvent.type(screen.getByLabelText('Conditions'), ' Updated')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(updateExemption).toHaveBeenCalledOnce())
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Edit exemption details' })).toHaveFocus(),
    )
  })

  it('focuses the checked fee option on Edit and returns focus to Edit after Cancel', async () => {
    renderPage()

    await userEvent.click(await screen.findByRole('tab', { name: 'Fees' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Edit fee override' }))
    await waitFor(() => expect(screen.getByRole('radio', { name: 'No' })).toHaveFocus())

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Edit fee override' })).toHaveFocus(),
    )
  })

  it('keeps Save enabled and shows errors only after a click, focusing the first one', async () => {
    renderPage()

    await userEvent.click(await screen.findByRole('tab', { name: 'Fees' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Edit fee override' }))
    await userEvent.click(screen.getByRole('radio', { name: 'Yes' }))
    const feeRate = screen.getByLabelText('Fee rate ($/m³)')
    await userEvent.type(feeRate, '12.505')
    const save = screen.getByRole('button', { name: 'Save changes' })
    expect(save).toBeEnabled()
    expect(feeRate).not.toHaveAttribute('aria-invalid', 'true')

    await userEvent.click(save)

    const message =
      'Fee rate must be greater than 0, at most 999.99, and have at most two decimal places'
    expect(feeRate).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText(message)).toBeVisible()
    await waitFor(() => expect(feeRate).toHaveFocus())
    expect(updateExemption).not.toHaveBeenCalled()

    await userEvent.type(feeRate, '{backspace}')
    expect(feeRate).not.toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByText(message)).not.toBeInTheDocument()
  })

  it('shows expiry and volume errors on their fields only after Save', async () => {
    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: 'Edit exemption details' }))
    const volume = screen.getByLabelText('Approval volume (m³)')
    await userEvent.clear(volume)
    await userEvent.type(volume, '0')
    fireEvent.change(screen.getByLabelText('Expiry date'), { target: { value: '2026-01-15' } })
    expect(screen.queryByText('Review exemption values')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    const expiry = screen.getByLabelText('Expiry date')
    expect(expiry).toHaveAttribute('aria-invalid', 'true')
    expect(volume).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Expiry date must be after the approval date')).toBeVisible()
    expect(
      screen.getByText(
        'Approval volume must be greater than 0, at most 9,999,999.99, and have at most two decimal places',
      ),
    ).toBeVisible()
    expect(screen.queryByText('Review exemption values')).not.toBeInTheDocument()
    await waitFor(() => expect(expiry).toHaveFocus())
    expect(updateExemption).not.toHaveBeenCalled()

    await userEvent.type(volume, '5')
    expect(volume).not.toHaveAttribute('aria-invalid', 'true')
    expect(expiry).toHaveAttribute('aria-invalid', 'true')
    fireEvent.change(expiry, { target: { value: '2026-08-20' } })
    expect(expiry).not.toHaveAttribute('aria-invalid', 'true')
  })

  it('asks before Cancel drops changes', async () => {
    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: 'Edit exemption details' }))
    const conditions = screen.getByLabelText('Conditions')
    await userEvent.type(conditions, ' updated')
    const cancel = screen.getByRole('button', { name: 'Cancel' })
    await userEvent.click(cancel)

    const dialog = await discardDialog()
    expect(within(dialog).getByText('Your changes will be lost.')).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep editing' }))
    expect(conditions).toHaveValue('Existing conditions updated')
    await waitFor(() => expect(cancel).toHaveFocus())

    await userEvent.click(cancel)
    await userEvent.click(
      within(await discardDialog()).getByRole('button', { name: 'Discard changes' }),
    )
    expect(screen.queryByLabelText('Conditions')).not.toBeInTheDocument()
    expect(screen.getByText('Existing conditions')).toBeInTheDocument()
    expect(updateExemption).not.toHaveBeenCalled()
  })

  it('asks before a tab switch drops one section for another', async () => {
    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: 'Edit exemption details' }))
    await userEvent.type(screen.getByLabelText('Conditions'), ' updated')
    await userEvent.click(screen.getByRole('tab', { name: 'Fees' }))

    await userEvent.click(
      within(await discardDialog()).getByRole('button', { name: 'Keep editing' }),
    )
    expect(screen.getByRole('tab', { name: 'Exemption details' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByLabelText('Conditions')).toHaveValue('Existing conditions updated')

    await userEvent.click(screen.getByRole('tab', { name: 'Fees' }))
    await userEvent.click(
      within(await discardDialog()).getByRole('button', { name: 'Discard changes' }),
    )
    expect(screen.getByRole('tab', { name: 'Fees' })).toHaveAttribute('aria-selected', 'true')
    await userEvent.click(await screen.findByRole('button', { name: 'Edit fee override' }))
    await userEvent.click(screen.getByRole('tab', { name: 'Exemption details' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('Existing conditions')).toBeInTheDocument()
    expect(updateExemption).not.toHaveBeenCalled()
  })

  it('asks before leaving the exemption with changes', async () => {
    const router = renderPage()

    await userEvent.click(await screen.findByRole('button', { name: 'Edit exemption details' }))
    await userEvent.type(screen.getByLabelText('Conditions'), ' updated')
    await userEvent.click(screen.getByRole('link', { name: 'Search exemptions' }))

    await userEvent.click(
      within(await discardDialog()).getByRole('button', { name: 'Keep editing' }),
    )
    expect(router.state.location.pathname).toBe('/provincial/exemption/BOIC-205')
    expect(screen.getByLabelText('Conditions')).toHaveValue('Existing conditions updated')

    await userEvent.click(screen.getByRole('link', { name: 'Search exemptions' }))
    await userEvent.click(
      within(await discardDialog()).getByRole('button', { name: 'Discard changes' }),
    )
    expect(await screen.findByRole('heading', { name: 'Exemption search page' })).toBeVisible()
    expect(updateExemption).not.toHaveBeenCalled()
  })

  it('asks before Escape closes the Add application panel with a typed number', async () => {
    vi.mocked(useAuth).mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({ roles: ['LEXIS_APPLICATION_APPROVER'] }),
        canPerform: vi.fn((action: string) => action === 'saveExemption'),
      }),
    )
    vi.mocked(fetchProvincialExemptionDetail).mockResolvedValue(ministerialExemption)
    renderPage('EX-205')

    await userEvent.click(await screen.findByRole('tab', { name: 'Applications' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Add application' }))
    const applicationNumber = await screen.findByLabelText('Application number')
    await userEvent.type(applicationNumber, '12345')
    await userEvent.keyboard('{Escape}')

    await userEvent.click(
      within(await discardDialog()).getByRole('button', { name: 'Keep editing' }),
    )
    expect(applicationNumber).toHaveValue('12345')

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await userEvent.click(
      within(await discardDialog()).getByRole('button', { name: 'Discard changes' }),
    )
    await waitFor(() =>
      expect(screen.queryByLabelText('Application number')).not.toBeInTheDocument(),
    )
    expect(addApplicationToExemption).not.toHaveBeenCalled()
  })

  it('asks before a tab switch discards an application relationship draft', async () => {
    vi.mocked(useAuth).mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({ roles: ['LEXIS_APPLICATION_APPROVER'] }),
        canPerform: vi.fn((action: string) => action === 'saveExemption'),
      }),
    )
    vi.mocked(fetchProvincialExemptionDetail).mockResolvedValue(ministerialExemption)
    renderPage('EX-205')
    await userEvent.click(await screen.findByRole('tab', { name: 'Applications' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Add application' }))
    const applicationNumber = await screen.findByLabelText('Application number')
    await userEvent.type(applicationNumber, '12345')

    await userEvent.click(screen.getByRole('tab', { name: 'Exemption details' }))
    await userEvent.click(
      within(await discardDialog()).getByRole('button', { name: 'Keep editing' }),
    )
    expect(screen.getByRole('tab', { name: 'Applications' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(applicationNumber).toHaveValue('12345')

    await userEvent.click(screen.getByRole('tab', { name: 'Exemption details' }))
    await userEvent.click(
      within(await discardDialog()).getByRole('button', { name: 'Discard changes' }),
    )
    expect(screen.getByRole('tab', { name: 'Exemption details' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.queryByLabelText('Application number')).not.toBeInTheDocument()
    expect(addApplicationToExemption).not.toHaveBeenCalled()
  })
})
