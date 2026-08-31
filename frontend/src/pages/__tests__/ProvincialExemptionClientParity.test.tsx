import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import type { ProvincialExemptionDetail } from '@/interfaces/LexisDetails'
import ProvincialExemptionDetailsPage from '@/pages/ProvincialExemptionDetails'
import {
  fetchExemptionClientData,
  fetchExemptionClientLocations,
} from '@/service/application-client-lookup-service'
import { fetchProvincialExemptionDetail } from '@/service/lexis-detail-service'
import {
  fetchExemptionApplications,
  fetchExemptionEditContext,
  fetchExemptionPermits,
} from '@/service/provincial-exemption-detail-service'
import { createTestAuthContext } from '@/test-utils/auth'

vi.mock('@/context/auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/service/lexis-detail-service', () => ({
  fetchProvincialExemptionDetail: vi.fn(),
}))

vi.mock('@/service/application-client-lookup-service', () => ({
  fetchExemptionClientData: vi.fn(),
  fetchExemptionClientLocations: vi.fn(),
}))

vi.mock('@/service/provincial-exemption-documents-service', () => ({
  fetchExemptionDocuments: vi.fn().mockResolvedValue({ rows: [], source: 'api' }),
  openExemptionDocument: vi.fn(),
  removeExemptionDocument: vi.fn(),
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

vi.mock('@/service/search-options-service', () => ({
  fetchProvincialExemptionOptions: vi.fn().mockResolvedValue({
    exemptionTypes: [{ value: 'M', label: 'Ministerial' }],
    exemptionStatuses: [{ value: 'ACT', label: 'Active' }],
    regions: [],
  }),
}))

const exemptionDetail: ProvincialExemptionDetail = {
  exemptionNumber: '26-8758',
  exemptionTypeCode: 'M',
  exemptionTypeDescription: 'Ministerial',
  exemptionStatusCode: 'ACT',
  exemptionStatusDescription: 'Active',
  ownerClientNumber: '00001074',
  agentClientNumber: '00002176',
  applicationNumber: 45242,
  applicationStatus: 'PER',
  approvalDate: '2026-03-19',
  expiryDate: '2026-09-15',
  approvedVolume: 307.2,
  usedVolume: 307.2,
  remainingVolume: 0,
  otherConditions: null,
  blanketOic: false,
  permitNumbers: ['9020933'],
  remarks: [],
}

describe('Provincial exemption client parity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue(createTestAuthContext())
    vi.mocked(fetchProvincialExemptionDetail).mockResolvedValue(exemptionDetail)
    vi.mocked(fetchExemptionApplications).mockResolvedValue({
      applications: [
        {
          applicationNumber: '45242',
          requestedVolume: '307.2',
          scaleVolume: '',
          locked: false,
          jurisdiction: 'P',
          ownerClientNumber: '00001074',
          agentClientNumber: '00002176',
          ownerClientLocationCode: '03',
          agentClientLocationCode: '12',
          applicantTypeCode: 'A',
          ownerContactName: 'BOB TURMEL',
          agentContactName: 'EXPORT PERSON',
          ownerCompanyName: 'NORSKE SKOG CANADA LIMITED',
          agentCompanyName: 'INTERNATIONAL FOREST PRODUCTS',
        },
      ],
      containsUnmanu: false,
      ownerNumber: '00001074',
    })
    vi.mocked(fetchExemptionEditContext).mockResolvedValue({
      rateOverrideEnabled: false,
      fixedFeeRate: '',
      regionNumbers: [],
      locked: false,
      lockMessage: '',
    })
    vi.mocked(fetchExemptionPermits).mockResolvedValue([])
    vi.mocked(fetchExemptionClientLocations).mockImplementation(async (clientNumber) =>
      clientNumber === '00001074'
        ? [{ locationCode: '03', locationName: 'WOODLANDS SERVICES', selected: true }]
        : [{ locationCode: '12', locationName: 'EXPORT BILLING', selected: true }],
    )
    vi.mocked(fetchExemptionClientData).mockImplementation(async (clientNumber) =>
      clientNumber === '00001074'
        ? {
            clientNumber,
            companyName: 'Client lookup owner name',
            address:
              'ATTN ACCT DEPT JOHANN BOULTER SUITE 2300 1055 WEST GEORGIA STREET PO BOX 11101',
            city: 'VANCOUVER',
            province: 'BC',
            postalCode: 'V6E3P3',
            country: 'CANADA',
            phone: '6046544521',
            fax: '6046544571',
            email: 'Not on file',
            notfound: '',
          }
        : {
            clientNumber,
            companyName: 'Client lookup agent name',
            address:
              'C/O ACCOUNTS MANAGER PO BOX 49114 TOWER 4 BENTALL CENTRE 3500 1055 DUNSMUIR STREET',
            city: 'PORTLAND',
            province: 'OR',
            postalCode: '73611',
            country: 'USA',
            phone: '6046896800',
            fax: '6046816892',
            email: 'Not on file',
            notfound: '',
          },
    )
  })

  it('restores legacy Owner and Agent tabs from the linked application context', async () => {
    render(
      <MemoryRouter initialEntries={['/provincial/exemption/26-8758']}>
        <Routes>
          <Route
            path="/provincial/exemption/:exemptionNumber"
            element={<ProvincialExemptionDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    await screen.findByRole('heading', { name: 'Exemption 26-8758', level: 1 })
    await screen.findByRole('tab', { name: 'Documents' })
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Owner',
      'Agent',
      'Exemption details',
      'Applications',
      'Documents',
      'Permits',
    ])

    expect(screen.getByRole('tab', { name: 'Owner' })).toHaveAttribute('aria-selected', 'true')
    const ownerTile = (
      await screen.findByRole('heading', { name: 'Owner client details', level: 2 })
    ).closest('.cds--tile')
    expect(ownerTile).toBeTruthy()
    expect(
      within(ownerTile as HTMLElement).getByText('03 - WOODLANDS SERVICES'),
    ).toBeInTheDocument()
    expect(within(ownerTile as HTMLElement).getByText('BOB TURMEL')).toBeInTheDocument()
    expect(
      within(ownerTile as HTMLElement).getByText('NORSKE SKOG CANADA LIMITED'),
    ).toBeInTheDocument()
    expect(
      within(ownerTile as HTMLElement).getByText(
        'ATTN ACCT DEPT JOHANN BOULTER SUITE 2300 1055 WEST GEORGIA STREET PO BOX 11101',
      ),
    ).toBeInTheDocument()
    expect(within(ownerTile as HTMLElement).getByText('Yes')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: 'Agent' }))
    const agentTile = (
      await screen.findByRole('heading', { name: 'Agent client details', level: 2 })
    ).closest('.cds--tile')
    expect(agentTile).toBeTruthy()
    expect(within(agentTile as HTMLElement).getByText('12 - EXPORT BILLING')).toBeInTheDocument()
    expect(within(agentTile as HTMLElement).getByText('EXPORT PERSON')).toBeInTheDocument()
    expect(
      within(agentTile as HTMLElement).getByText('INTERNATIONAL FOREST PRODUCTS'),
    ).toBeInTheDocument()
    expect(
      within(agentTile as HTMLElement).getByText(
        'C/O ACCOUNTS MANAGER PO BOX 49114 TOWER 4 BENTALL CENTRE 3500 1055 DUNSMUIR STREET',
      ),
    ).toBeInTheDocument()

    await waitFor(() => {
      expect(fetchExemptionClientData).toHaveBeenCalledWith('00001074', '03')
      expect(fetchExemptionClientData).toHaveBeenCalledWith('00002176', '12')
      expect(fetchExemptionClientLocations).toHaveBeenCalledWith('00001074')
      expect(fetchExemptionClientLocations).toHaveBeenCalledWith('00002176')
    })
  })

  it('hides residual agent data for owner-filed exemption applications', async () => {
    vi.mocked(fetchExemptionApplications).mockResolvedValue({
      applications: [
        {
          applicationNumber: '45242',
          requestedVolume: '307.2',
          scaleVolume: '',
          locked: false,
          jurisdiction: 'P',
          ownerClientNumber: '00001074',
          agentClientNumber: '00002176',
          ownerClientLocationCode: '03',
          agentClientLocationCode: '12',
          applicantTypeCode: 'O',
          ownerContactName: 'BOB TURMEL',
          agentContactName: 'STALE AGENT',
          ownerCompanyName: 'NORSKE SKOG CANADA LIMITED',
          agentCompanyName: 'STALE AGENT COMPANY',
        },
      ],
      containsUnmanu: false,
      ownerNumber: '00001074',
    })

    render(
      <MemoryRouter initialEntries={['/provincial/exemption/26-8758']}>
        <Routes>
          <Route
            path="/provincial/exemption/:exemptionNumber"
            element={<ProvincialExemptionDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByRole('tab', { name: 'Owner' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.queryByRole('tab', { name: 'Agent' })).not.toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Owner client details', level: 2 }),
    ).toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: 'Exemption details' }))
    expect(screen.getByRole('heading', { name: 'Exemption summary', level: 2 })).toBeInTheDocument()
    expect(screen.queryByText('Agent client number')).not.toBeInTheDocument()

    await waitFor(() => {
      expect(fetchExemptionClientData).toHaveBeenCalledWith('00001074', '03')
    })
    expect(fetchExemptionClientData).not.toHaveBeenCalledWith('00002176', '12')
    expect(fetchExemptionClientLocations).not.toHaveBeenCalledWith('00002176')
  })

  it('shows the linked application owner in an OIC exemption summary', async () => {
    vi.mocked(fetchProvincialExemptionDetail).mockResolvedValue({
      ...exemptionDetail,
      exemptionTypeCode: 'O',
      exemptionTypeDescription: 'OIC',
      ownerClientNumber: null,
    })

    render(
      <MemoryRouter initialEntries={['/provincial/exemption/26-8758']}>
        <Routes>
          <Route
            path="/provincial/exemption/:exemptionNumber"
            element={<ProvincialExemptionDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByRole('tab', { name: 'Owner' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await userEvent.click(screen.getByRole('tab', { name: 'Exemption details' }))
    const summaryTile = (
      await screen.findByRole('heading', { name: 'Exemption summary', level: 2 })
    ).closest('.cds--tile')
    expect(summaryTile).toBeTruthy()
    const exemptionHolderLabel = within(summaryTile as HTMLElement).getByText('Exemption holder')
    expect(
      within(exemptionHolderLabel.closest('.detail-field-item') as HTMLElement).getByText(
        '00001074',
      ),
    ).toBeInTheDocument()
  })
})
