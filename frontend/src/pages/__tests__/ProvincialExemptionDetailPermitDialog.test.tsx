import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import type { ProvincialExemptionDetail } from '@/interfaces/LexisDetails'
import ProvincialExemptionDetailsPage from '@/pages/ProvincialExemptionDetails'
import { fetchProvincialExemptionDetail } from '@/service/lexis-detail-service'
import {
  fetchExemptionApplications,
  fetchExemptionEditContext,
  fetchExemptionPermits,
} from '@/service/provincial-exemption-detail-service'
import { createPermitFromExemption } from '@/service/provincial-permit-documents-invoices-service'
import { fetchProvincialExemptionOptions } from '@/service/search-options-service'
import { createTestAuthContext, createTestCapabilities } from '@/test-utils/auth'

vi.mock('@/context/auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/service/lexis-detail-service', () => ({
  fetchProvincialExemptionDetail: vi.fn(),
}))

vi.mock('@/service/application-client-lookup-service', () => ({
  fetchApplicationClientData: vi.fn().mockResolvedValue(null),
  fetchApplicationClientLocations: vi.fn().mockResolvedValue([]),
  fetchExemptionClientData: vi.fn().mockResolvedValue(null),
  fetchExemptionClientLocations: vi.fn().mockResolvedValue([]),
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
  fetchExemptionEditContext: vi.fn(),
  fetchExemptionPermits: vi.fn(),
  removeApplicationFromExemption: vi.fn(),
  updateExemption: vi.fn(),
}))

vi.mock('@/service/provincial-permit-documents-invoices-service', () => ({
  createPermitFromExemption: vi.fn(),
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

const renderExemption = () =>
  render(
    <MemoryRouter initialEntries={['/provincial/exemption/EX-205']}>
      <Routes>
        <Route
          path="/provincial/exemption/:exemptionNumber"
          element={<ProvincialExemptionDetailsPage />}
        />
        <Route path="/provincial/permit/:permitNumber" element={<p>New permit destination</p>} />
      </Routes>
    </MemoryRouter>,
  )

describe('exemption details page dialogs and focus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({ roles: ['LEXIS_APPLICATION_APPROVER'] }),
        canPerform: vi.fn(
          (action: string) => action === '/permitDetails' || action === 'createPermit',
        ),
      }),
    )
    vi.mocked(fetchProvincialExemptionDetail).mockResolvedValue(activeMinisterialExemption)
    vi.mocked(fetchExemptionApplications).mockResolvedValue({
      applications: [],
      containsUnmanu: false,
      ownerNumber: '00012345',
    })
    vi.mocked(fetchExemptionPermits).mockResolvedValue([])
    vi.mocked(fetchExemptionEditContext).mockResolvedValue({
      rateOverrideEnabled: false,
      fixedFeeRate: '',
      regionNumbers: [],
      locked: false,
      lockMessage: '',
    })
    vi.mocked(fetchProvincialExemptionOptions).mockResolvedValue({
      exemptionTypes: [{ value: 'M', label: 'Ministerial' }],
      exemptionStatuses: [{ value: 'ACT', label: 'Active' }],
      regions: [],
    })
  })

  it('focuses the heading when an exemption opens from a link', async () => {
    renderExemption()

    const heading = await screen.findByRole('heading', { name: 'Exemption EX-205', level: 1 })
    await waitFor(() => expect(heading).toHaveFocus())
  })

  it('disables the permit dialog close icon while the permit is being created', async () => {
    let finishCreation: (
      value: Awaited<ReturnType<typeof createPermitFromExemption>>,
    ) => void = () => undefined
    vi.mocked(createPermitFromExemption).mockReturnValueOnce(
      new Promise((resolve) => {
        finishCreation = resolve
      }),
    )
    renderExemption()

    await userEvent.click(await screen.findByRole('tab', { name: 'Permits' }))
    await userEvent.click(screen.getByRole('button', { name: 'Apply for new permit' }))
    const dialog = screen.getByRole('dialog', { name: 'Apply for new permit' })
    const closeIcon = dialog.querySelector<HTMLButtonElement>('.cds--modal-close')
    expect(closeIcon).not.toBeNull()
    expect(closeIcon).toBeEnabled()

    await userEvent.click(within(dialog).getByRole('button', { name: 'Create permit' }))
    await waitFor(() => expect(closeIcon).toBeDisabled())

    await act(async () =>
      finishCreation({
        success: false,
        message: 'Unable to create permit.',
        errors: ['The exemption is no longer eligible.'],
        warnings: [],
        source: 'api',
        permitNumber: '',
      }),
    )
    expect(await screen.findByText('The exemption is no longer eligible.')).toBeInTheDocument()
    expect(closeIcon).toBeEnabled()
  })
})
