import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import type { ProvincialExemptionDetail } from '@/interfaces/LexisDetails'
import ProvincialExemptionDetailsPage from '@/pages/ProvincialExemptionDetails'
import { fetchProvincialExemptionDetail } from '@/service/lexis-detail-service'
import {
  fetchExemptionApplications,
  fetchExemptionBlanketOicTotals,
  fetchExemptionEditContext,
  fetchExemptionPermits,
} from '@/service/provincial-exemption-detail-service'
import { createPermitFromExemption } from '@/service/provincial-permit-documents-invoices-service'
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
  fetchProvincialExemptionOptions: vi.fn().mockResolvedValue({
    exemptionTypes: [{ value: 'M', label: 'Ministerial' }],
    exemptionStatuses: [{ value: 'ACT', label: 'Active' }],
    regions: [],
  }),
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

vi.mock('@/service/provincial-permit-documents-invoices-service', () => ({
  createPermitFromExemption: vi.fn(),
}))

vi.mock('@/service/report-service', () => ({
  ReportRequestError: class ReportRequestError extends Error {},
  runReport: vi.fn(),
}))

const activeMinisterialExemption: ProvincialExemptionDetail = {
  exemptionNumber: 'EX-205',
  exemptionTypeCode: 'M',
  exemptionTypeDescription: 'Ministerial',
  exemptionStatusCode: 'ACT',
  exemptionStatusDescription: 'Active',
  ownerClientNumber: '00012345',
  agentClientNumber: '00067890',
  applicationNumber: 1000456,
  applicationStatus: 'EXE',
  approvalDate: '2026-02-01',
  expiryDate: '2026-12-31',
  approvedVolume: 500,
  usedVolume: 0,
  remainingVolume: 500,
  otherConditions: null,
  blanketOic: false,
  permitNumbers: [],
  remarks: [],
}

const mockRole = (roles: string[], allowedActions = ['createPermit']) => {
  vi.mocked(useAuth).mockReturnValue(
    createTestAuthContext({
      capabilities: createTestCapabilities({ roles }),
      canPerform: vi.fn((action: string) => allowedActions.includes(action)),
    }),
  )
}

const renderPage = (detail: ProvincialExemptionDetail, initialSearch = '') => {
  vi.mocked(fetchProvincialExemptionDetail).mockResolvedValue(detail)
  const router = createMemoryRouter(
    [
      {
        path: '/provincial/exemption/:exemptionNumber',
        element: <ProvincialExemptionDetailsPage />,
      },
      {
        path: '/provincial/permit/:permitNumber',
        element: <p>New permit destination</p>,
      },
    ],
    { initialEntries: [`/provincial/exemption/${detail.exemptionNumber}${initialSearch}`] },
  )
  render(<RouterProvider router={router} />)
  return router
}

const openPermitsTab = async () => {
  await userEvent.click(await screen.findByRole('tab', { name: 'Permits' }))
}

describe('Ministerial permit creation from an exemption', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRole(['LEXIS_APPLICATION_APPROVER'])
    vi.mocked(fetchExemptionApplications).mockResolvedValue({
      applications: [],
      containsUnmanu: false,
      ownerNumber: '00012345',
    })
    vi.mocked(fetchExemptionPermits).mockResolvedValue([])
    vi.mocked(fetchExemptionBlanketOicTotals).mockResolvedValue({
      requestedVolume: '0',
      completedVolume: '0',
    })
    vi.mocked(fetchExemptionEditContext).mockResolvedValue({
      rateOverrideEnabled: false,
      fixedFeeRate: '',
      regionNumbers: [],
      locked: false,
      lockMessage: '',
    })
  })

  it.each(['LEXIS_APPLICATION_APPROVER', 'LEXIS_ADMIN'])(
    'shows the action for %s',
    async (role) => {
      mockRole([role])
      renderPage(activeMinisterialExemption)

      await openPermitsTab()
      expect(screen.getByRole('button', { name: 'Apply for new permit' })).toBeInTheDocument()
    },
  )

  it('confirms the shell behavior and navigates to a newly created permit', async () => {
    vi.mocked(createPermitFromExemption).mockResolvedValue({
      success: true,
      message: 'The permit was created successfully.',
      errors: [],
      warnings: [],
      source: 'api',
      permitNumber: '98765',
    })
    const router = renderPage(activeMinisterialExemption, '?permitFilter=987')

    await openPermitsTab()
    await userEvent.click(screen.getByRole('button', { name: 'Apply for new permit' }))

    const dialog = screen.getByRole('dialog', { name: 'Apply for new permit' })
    expect(
      within(dialog).getByText(/creates a new active permit for Ministerial exemption EX-205/i),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByText(
        /Eligible application scales from this exemption will be added automatically/i,
      ),
    ).toBeInTheDocument()
    expect(dialog.querySelector('.permit-creation-confirmation-modal__actions')).toBeInTheDocument()
    expect(dialog.querySelector('.cds--modal-footer')).not.toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create permit' }))

    await waitFor(() => expect(createPermitFromExemption).toHaveBeenCalledWith('EX-205'))
    await waitFor(() => expect(router.state.location.pathname).toBe('/provincial/permit/98765'))
    expect(router.state.location.search).toBe('?permitFilter=987')
    expect(await screen.findByText('New permit destination')).toBeInTheDocument()
  })

  it('shows the authoritative creation error and stays on the exemption', async () => {
    vi.mocked(createPermitFromExemption).mockResolvedValue({
      success: false,
      message: 'Unable to create permit.',
      errors: ['The exemption is no longer eligible.'],
      warnings: [],
      source: 'api',
      permitNumber: '',
    })
    const router = renderPage(activeMinisterialExemption)

    await openPermitsTab()
    await userEvent.click(screen.getByRole('button', { name: 'Apply for new permit' }))
    await userEvent.click(
      within(screen.getByRole('dialog', { name: 'Apply for new permit' })).getByRole('button', {
        name: 'Create permit',
      }),
    )

    expect(await screen.findByText('The exemption is no longer eligible.')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/provincial/exemption/EX-205')
  })

  it('treats a transport failure as an unknown outcome instead of inviting a retry', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.mocked(createPermitFromExemption).mockRejectedValue(new Error('connection lost'))
    const router = renderPage(activeMinisterialExemption)

    await openPermitsTab()
    await userEvent.click(screen.getByRole('button', { name: 'Apply for new permit' }))
    await userEvent.click(
      within(screen.getByRole('dialog', { name: 'Apply for new permit' })).getByRole('button', {
        name: 'Create permit',
      }),
    )

    expect(
      await screen.findByText(
        'The permit request outcome could not be confirmed. Reload this exemption and check Related permits before trying again.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Apply for new permit' })).not.toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/provincial/exemption/EX-205')
    consoleError.mockRestore()
  })

  it('requires a reload when creation succeeds without a usable permit number', async () => {
    vi.mocked(createPermitFromExemption).mockResolvedValue({
      success: true,
      message: 'The permit was created successfully.',
      errors: [],
      warnings: [],
      source: 'api',
      permitNumber: '',
    })
    const router = renderPage(activeMinisterialExemption)

    await openPermitsTab()
    await userEvent.click(screen.getByRole('button', { name: 'Apply for new permit' }))
    await userEvent.click(
      within(screen.getByRole('dialog', { name: 'Apply for new permit' })).getByRole('button', {
        name: 'Create permit',
      }),
    )

    expect(
      await screen.findByText(
        'The permit response did not include a valid permit number. Reload before trying again.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Apply for new permit' })).not.toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/provincial/exemption/EX-205')
  })

  it('blocks navigation while permit creation is still in progress', async () => {
    const pendingCreation = new Promise<Awaited<ReturnType<typeof createPermitFromExemption>>>(
      () => undefined,
    )
    vi.mocked(createPermitFromExemption).mockReturnValue(pendingCreation)
    const router = renderPage(activeMinisterialExemption)

    await openPermitsTab()
    await userEvent.click(screen.getByRole('button', { name: 'Apply for new permit' }))
    await userEvent.click(
      within(screen.getByRole('dialog', { name: 'Apply for new permit' })).getByRole('button', {
        name: 'Create permit',
      }),
    )
    await waitFor(() => expect(createPermitFromExemption).toHaveBeenCalledOnce())

    void router.navigate('/provincial/permit/12345')

    expect(await screen.findByRole('dialog', { name: 'Change in progress' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/provincial/exemption/EX-205')
  })

  it('hides the action while the exemption is being edited', async () => {
    mockRole(['LEXIS_APPLICATION_APPROVER'], ['createPermit', 'saveExemption'])
    renderPage(activeMinisterialExemption)

    await userEvent.click(await screen.findByRole('button', { name: 'Edit exemption' }))
    await openPermitsTab()

    expect(screen.queryByRole('button', { name: 'Apply for new permit' })).not.toBeInTheDocument()
    expect(createPermitFromExemption).not.toHaveBeenCalled()
  })

  it('hides the action while an application relationship is drafted', async () => {
    mockRole(['LEXIS_APPLICATION_APPROVER'], ['createPermit', 'saveExemption'])
    renderPage(activeMinisterialExemption)

    await userEvent.click(await screen.findByRole('tab', { name: 'Applications' }))
    await userEvent.type(screen.getByLabelText('Application number'), '1000457')
    await openPermitsTab()

    expect(screen.queryByRole('button', { name: 'Apply for new permit' })).not.toBeInTheDocument()
    expect(createPermitFromExemption).not.toHaveBeenCalled()
  })

  it.each([
    {
      caseName: 'a Provincial Submitter',
      roles: ['LEXIS_PROVINCIAL_SUBMITTER_00012345'],
      detail: activeMinisterialExemption,
      locked: false,
    },
    {
      caseName: 'a Blanket OIC exemption',
      roles: ['LEXIS_APPLICATION_APPROVER'],
      detail: { ...activeMinisterialExemption, exemptionTypeCode: 'B', blanketOic: true },
      locked: false,
    },
    {
      caseName: 'an OIC exemption',
      roles: ['LEXIS_APPLICATION_APPROVER'],
      detail: { ...activeMinisterialExemption, exemptionTypeCode: 'O' },
      locked: false,
    },
    {
      caseName: 'an inactive Ministerial exemption',
      roles: ['LEXIS_APPLICATION_APPROVER'],
      detail: { ...activeMinisterialExemption, exemptionStatusCode: 'NEW' },
      locked: false,
    },
    {
      caseName: 'an edit-locked Ministerial exemption',
      roles: ['LEXIS_APPLICATION_APPROVER'],
      detail: activeMinisterialExemption,
      locked: true,
    },
  ])('does not expose the action for $caseName', async ({ roles, detail, locked }) => {
    mockRole(roles)
    vi.mocked(fetchExemptionEditContext).mockResolvedValue({
      rateOverrideEnabled: false,
      fixedFeeRate: '',
      regionNumbers: [],
      locked,
      lockMessage: locked ? 'Locked by another user.' : '',
    })
    renderPage(detail as ProvincialExemptionDetail)

    await openPermitsTab()
    expect(screen.queryByRole('button', { name: 'Apply for new permit' })).not.toBeInTheDocument()
    expect(createPermitFromExemption).not.toHaveBeenCalled()
  })
})
