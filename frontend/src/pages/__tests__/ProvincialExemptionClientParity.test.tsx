import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import type { ProvincialExemptionDetail } from '@/interfaces/LexisDetails'
import ProvincialExemptionDetailsPage from '@/pages/ProvincialExemptionDetails'
import {
  fetchApplicationClientData,
  fetchApplicationClientLocations,
} from '@/service/application-client-lookup-service'
import { fetchProvincialExemptionDetail } from '@/service/lexis-detail-service'
import {
  fetchExemptionApplications,
  fetchExemptionEditContext,
  fetchExemptionPermits,
} from '@/service/provincial-exemption-detail-service'
import { createTestAuthContext } from '@/test-utils/auth'
import type * as ExemptionDetailService from '@/service/provincial-exemption-detail-service'

vi.mock('@/context/auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/service/lexis-detail-service', () => ({
  fetchProvincialExemptionDetail: vi.fn(),
}))

vi.mock('@/service/application-client-lookup-service', () => ({
  fetchApplicationClientData: vi.fn(),
  fetchApplicationClientLocations: vi.fn(),
}))

vi.mock('@/service/provincial-exemption-documents-service', () => ({
  fetchExemptionDocuments: vi.fn().mockResolvedValue({ rows: [], source: 'api' }),
  openExemptionDocument: vi.fn(),
  removeExemptionDocument: vi.fn(),
}))

vi.mock('@/service/provincial-exemption-detail-service', async (importOriginal) => ({
  formatFeeRate: (await importOriginal<typeof ExemptionDetailService>()).formatFeeRate,
  addApplicationToExemption: vi.fn(),
  approveExemptions: vi.fn(),
  fetchExemptionApplications: vi.fn(),
  fetchExemptionEditContext: vi.fn(),
  fetchExemptionPermits: vi.fn(),
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
          ownerContactName: 'OWNER PERSON',
          agentContactName: 'EXPORT PERSON',
          ownerCompanyName: 'SAMPLE OWNER LTD',
          agentCompanyName: 'SAMPLE AGENT LTD',
          removable: true,
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
    vi.mocked(fetchApplicationClientLocations).mockImplementation(async (clientNumber) =>
      clientNumber === '00001074'
        ? [{ locationCode: '03', locationName: 'WOODLANDS SERVICES', selected: true }]
        : [{ locationCode: '12', locationName: 'EXPORT BILLING', selected: true }],
    )
    vi.mocked(fetchApplicationClientData).mockImplementation(async (clientNumber) =>
      clientNumber === '00001074'
        ? {
            clientNumber,
            companyName: 'Client lookup owner name',
            clientAcronym: 'SOL',
            locationName: 'AUTHORITATIVE OWNER LOCATION',
            address: 'ATTN ACCOUNTS PAYABLE SUITE 100 100 SAMPLE STREET PO BOX 100',
            city: 'VANCOUVER',
            province: 'BC',
            postalCode: 'A1A1A1',
            country: 'CANADA',
            phone: '6045550100',
            fax: '6045550101',
            email: 'Not on file',
            notfound: '',
          }
        : {
            clientNumber,
            companyName: 'Client lookup agent name',
            clientAcronym: '',
            locationName: 'AUTHORITATIVE AGENT LOCATION',
            address: 'C/O ACCOUNTS MANAGER PO BOX 200 TOWER 1 SAMPLE CENTRE 200 SAMPLE AVENUE',
            city: 'PORTLAND',
            province: 'OR',
            postalCode: '73611',
            country: 'USA',
            phone: '6045550102',
            fax: '6045550103',
            email: 'Not on file',
            notfound: '',
          },
    )
  })

  it('shows the author only once the exemption has loaded', async () => {
    const detail = await vi.mocked(fetchProvincialExemptionDetail)('26-8758')
    let resolveDetail: (value: typeof detail) => void = () => undefined
    vi.mocked(fetchProvincialExemptionDetail).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveDetail = resolve
      }),
    )
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

    await waitFor(() => expect(fetchProvincialExemptionDetail).toHaveBeenCalledTimes(2))
    expect(screen.queryByText(/^Author:/)).not.toBeInTheDocument()
    resolveDetail(detail)
    expect(await screen.findByText(/^Author: /)).toBeInTheDocument()
  })

  it('shows the applicant card as loading before its client lookup starts', async () => {
    const lookupData = vi.mocked(fetchApplicationClientData).getMockImplementation()
    const cardTextWhenLookupStarted: string[] = []
    vi.mocked(fetchApplicationClientData).mockImplementation(async (...args) => {
      const heading = screen.queryByRole('heading', { name: 'Applicant details', level: 2 })
      cardTextWhenLookupStarted.push(heading?.closest('.cds--tile')?.textContent ?? '')
      return lookupData ? lookupData(...args) : null
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

    await screen.findByRole('heading', { name: 'Applicant details', level: 2 })
    await waitFor(() => expect(cardTextWhenLookupStarted.length).toBeGreaterThan(0))
    // The card rendered before the lookup started, and it showed the loading state then.
    expect(cardTextWhenLookupStarted[0]).toContain('Loading…')
  })

  it('opens on Applicant without first showing tabs that lack it', async () => {
    const applications = await vi.mocked(fetchExemptionApplications)('26-8758')
    let resolveApplications: (value: typeof applications) => void = () => undefined
    vi.mocked(fetchExemptionApplications).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveApplications = resolve
      }),
    )
    const selectedTabs: string[] = []
    const observer = new MutationObserver(() => {
      const selected = document.querySelector('[role="tab"][aria-selected="true"]')
      const label = selected?.textContent ?? ''
      if (label && selectedTabs.at(-1) !== label) selectedTabs.push(label)
    })
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['aria-selected'],
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

    await waitFor(() => expect(fetchProvincialExemptionDetail).toHaveBeenCalled())
    resolveApplications(applications)
    expect(await screen.findByRole('tab', { name: 'Applicant' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    observer.disconnect()
    expect(selectedTabs[0]).toBe('Applicant')
  })

  it('shows eligible applicant and agent details together on Applicant', async () => {
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
      'Applicant',
      'Exemption details',
      'Applications',
      'Documents',
      'Permits',
    ])
    // Figma puts a Carbon icon on each exemption detail tab and card title.
    screen
      .getAllByRole('tab')
      .forEach((tab) => expect(tab.querySelector('svg')).toBeInTheDocument())

    expect(screen.getByRole('tab', { name: 'Applicant' })).toHaveAttribute('aria-selected', 'true')
    const ownerHeading = await screen.findByRole('heading', {
      name: 'Applicant details',
      level: 2,
    })
    expect(ownerHeading.querySelector('svg')).toBeInTheDocument()
    const ownerTile = ownerHeading.closest('.cds--tile')
    expect(ownerTile).toBeTruthy()
    expect(
      within(ownerTile as HTMLElement).getByText('03 - WOODLANDS SERVICES'),
    ).toBeInTheDocument()
    expect(within(ownerTile as HTMLElement).getByText('OWNER PERSON')).toBeInTheDocument()
    expect(
      within(ownerTile as HTMLElement).getByText('SAMPLE OWNER LTD (SOL) · 00001074'),
    ).toBeInTheDocument()
    expect(
      within(ownerTile as HTMLElement).getByText(
        'ATTN ACCOUNTS PAYABLE SUITE 100 100 SAMPLE STREET PO BOX 100',
      ),
    ).toBeInTheDocument()
    expect(within(ownerTile as HTMLElement).getAllByText('Agent')).not.toHaveLength(0)
    expect(within(ownerTile as HTMLElement).getByText('(604) 555-0100')).toBeInTheDocument()
    expect(within(ownerTile as HTMLElement).getByText('(604) 555-0101')).toBeInTheDocument()
    expect(within(ownerTile as HTMLElement).queryByText('6045550100')).not.toBeInTheDocument()

    // The agent section has the application page's title.
    const agentTile = (
      await screen.findByRole('heading', { name: 'Agent information', level: 3 })
    ).closest('section')
    expect(agentTile).toBeTruthy()
    // The agent is a section of the applicant card, not a second full-height card.
    expect(agentTile?.closest('.cds--tile')).toBe(ownerTile)
    expect(within(agentTile as HTMLElement).getByText('12 - EXPORT BILLING')).toBeInTheDocument()
    expect(within(agentTile as HTMLElement).getByText('EXPORT PERSON')).toBeInTheDocument()
    expect(
      within(agentTile as HTMLElement).getByText(/SAMPLE AGENT LTD.*00002176/),
    ).toBeInTheDocument()
    expect(
      within(agentTile as HTMLElement).getByText(
        'C/O ACCOUNTS MANAGER PO BOX 200 TOWER 1 SAMPLE CENTRE 200 SAMPLE AVENUE',
      ),
    ).toBeInTheDocument()
    expect(within(agentTile as HTMLElement).getByText('(604) 555-0102')).toBeInTheDocument()
    expect(within(agentTile as HTMLElement).getByText('(604) 555-0103')).toBeInTheDocument()

    // Both parties are looked up through the linked application.
    await waitFor(() => {
      expect(fetchApplicationClientData).toHaveBeenCalledWith('00001074', '03', {
        applicationNumber: '45242',
      })
      expect(fetchApplicationClientData).toHaveBeenCalledWith('00002176', '12', {
        applicationNumber: '45242',
      })
      expect(fetchApplicationClientLocations).toHaveBeenCalledWith('00001074', 'owner', '45242')
      expect(fetchApplicationClientLocations).toHaveBeenCalledWith('00002176', 'agent', '45242')
    })
  })

  it.each([false, true])(
    'uses the selected client-data location name when options contain only codes: %s',
    async (codeOnly) => {
      vi.mocked(fetchApplicationClientLocations).mockImplementation(async (clientNumber) => {
        const locationCode = clientNumber === '00001074' ? '03' : '12'
        return codeOnly ? [{ locationCode, locationName: locationCode, selected: true }] : []
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
      expect(await screen.findByText('03 - AUTHORITATIVE OWNER LOCATION')).toBeInTheDocument()
      expect(await screen.findByText('12 - AUTHORITATIVE AGENT LOCATION')).toBeInTheDocument()
      expect(fetchApplicationClientData).toHaveBeenCalledWith('00001074', '03', {
        applicationNumber: '45242',
      })
      expect(fetchApplicationClientData).toHaveBeenCalledWith('00002176', '12', {
        applicationNumber: '45242',
      })
    },
  )

  it("keeps one party's details when the other party's lookup fails", async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const forbidden = { response: { status: 403 } }
    const lookupData = vi.mocked(fetchApplicationClientData).getMockImplementation()
    vi.mocked(fetchApplicationClientData).mockImplementation(async (...args) => {
      if (args[0] === '00001074') throw forbidden
      return lookupData ? lookupData(...args) : null
    })
    vi.mocked(fetchApplicationClientLocations).mockImplementation(async (clientNumber) => {
      if (clientNumber === '00001074') throw forbidden
      return [{ locationCode: '12', locationName: 'EXPORT BILLING', selected: true }]
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

    const ownerTile = (
      await screen.findByRole('heading', { name: 'Applicant details', level: 2 })
    ).closest('.cds--tile') as HTMLElement
    const agentSection = (
      await screen.findByRole('heading', { name: 'Agent information', level: 3 })
    ).closest('section') as HTMLElement
    expect(
      await within(agentSection).findByText(
        'C/O ACCOUNTS MANAGER PO BOX 200 TOWER 1 SAMPLE CENTRE 200 SAMPLE AVENUE',
      ),
    ).toBeInTheDocument()
    expect(within(agentSection).getByText('12 - EXPORT BILLING')).toBeInTheDocument()
    expect(within(agentSection).queryByText('Client details unavailable')).not.toBeInTheDocument()

    // The owner keeps the linked application's saved values and says the rest didn't load.
    expect(within(ownerTile).getByText('OWNER PERSON')).toBeInTheDocument()
    expect(within(ownerTile).getByText('SAMPLE OWNER LTD · 00001074')).toBeInTheDocument()
    expect(within(ownerTile).getAllByText('Client details unavailable')).toHaveLength(1)
    expect(screen.queryByRole('heading', { name: 'Client details unavailable' })).toBeNull()
    expect(screen.queryByRole('tab', { name: 'Agent' })).not.toBeInTheDocument()

    consoleError.mockRestore()
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
          ownerContactName: 'OWNER PERSON',
          agentContactName: 'STALE AGENT',
          ownerCompanyName: 'SAMPLE OWNER LTD',
          agentCompanyName: 'STALE AGENT COMPANY',
          removable: true,
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

    expect(await screen.findByRole('tab', { name: 'Applicant' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.queryByRole('tab', { name: 'Agent' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Applicant details', level: 2 })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: 'Exemption details' }))
    expect(screen.getByRole('heading', { name: 'Exemption details', level: 2 })).toBeInTheDocument()
    expect(screen.queryByText('Agent client number')).not.toBeInTheDocument()

    await waitFor(() => {
      expect(fetchApplicationClientData).toHaveBeenCalledWith('00001074', '03', {
        applicationNumber: '45242',
      })
    })
    expect(fetchApplicationClientData).not.toHaveBeenCalledWith(
      '00002176',
      expect.anything(),
      expect.anything(),
    )
    expect(fetchApplicationClientLocations).not.toHaveBeenCalledWith(
      '00002176',
      expect.anything(),
      expect.anything(),
    )
  })

  it('keeps OIC client tabs hidden while showing the linked application owner in the summary', async () => {
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

    expect(await screen.findByRole('tab', { name: 'Exemption details' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.queryByRole('tab', { name: 'Applicant' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Agent' })).not.toBeInTheDocument()
    const summaryTile = (
      await screen.findByRole('heading', { name: 'Exemption details', level: 2 })
    ).closest('.cds--tile')
    expect(summaryTile).toBeTruthy()
    const exemptionHolderLabel = within(summaryTile as HTMLElement).getByText('Exemption holder')
    expect(
      within(exemptionHolderLabel.closest('.record-field') as HTMLElement).getByText('00001074'),
    ).toBeInTheDocument()
  })

  it('keeps client tabs hidden for Blanket OIC even with linked application context', async () => {
    vi.mocked(fetchProvincialExemptionDetail).mockResolvedValue({
      ...exemptionDetail,
      exemptionNumber: 'BOIC-205',
      exemptionTypeCode: 'B',
      exemptionTypeDescription: 'Blanket OIC',
      ownerClientNumber: null,
      agentClientNumber: null,
      blanketOic: true,
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

    expect(await screen.findByRole('tab', { name: 'Exemption details' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.queryByRole('tab', { name: 'Applicant' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Agent' })).not.toBeInTheDocument()
  })
})
