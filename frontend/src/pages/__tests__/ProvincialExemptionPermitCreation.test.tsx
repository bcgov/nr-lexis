import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import type { ProvincialExemptionDetail } from '@/interfaces/LexisDetails'
import ProvincialExemptionDetailsPage from '@/pages/ProvincialExemptionDetails'
import { fetchProvincialExemptionDetail } from '@/service/lexis-detail-service'
import {
  fetchExemptionClientData,
  fetchExemptionClientLocations,
} from '@/service/application-client-lookup-service'
import {
  fetchExemptionApplications,
  fetchExemptionBlanketOicTotals,
  fetchExemptionEditContext,
  fetchExemptionPermits,
} from '@/service/provincial-exemption-detail-service'
import {
  addPermitDetail,
  createPermitFromExemption,
} from '@/service/provincial-permit-documents-invoices-service'
import { fetchProvincialExemptionOptions } from '@/service/search-options-service'
import { fetchShippingReferenceOptions } from '@/service/shipping-reference-service'
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
  fetchProvincialExemptionOptions: vi.fn().mockResolvedValue({
    exemptionTypes: [
      { value: 'M', label: 'Ministerial' },
      { value: 'O', label: 'Order in Council' },
    ],
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
  addPermitDetail: vi.fn(),
  createPermitFromExemption: vi.fn(),
}))

vi.mock('@/service/shipping-reference-service', () => ({
  fetchShippingReferenceOptions: vi.fn().mockResolvedValue({
    countries: [{ code: 'US', name: 'United States Of America' }],
    transportTypes: [{ code: 'B', name: 'Barge' }],
    ports: [{ code: 'CB', name: 'Cowichan Bay' }],
  }),
  formatShippingReferenceOption: (option: { code: string; name: string }) =>
    `${option.name} (${option.code})`,
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

const activeBlanketOicExemption: ProvincialExemptionDetail = {
  ...activeMinisterialExemption,
  exemptionNumber: 'TEST13E2',
  exemptionTypeCode: 'B',
  exemptionTypeDescription: 'Blanket OIC',
  ownerClientNumber: null,
  agentClientNumber: null,
  applicationNumber: null,
  applicationStatus: null,
  expiryDate: '2099-12-31',
  approvedVolume: 9_999_999.9,
  remainingVolume: 9_999_999.9,
  blanketOic: true,
}

const activeOicExemption: ProvincialExemptionDetail = {
  ...activeMinisterialExemption,
  exemptionNumber: 'OIC-205',
  exemptionTypeCode: 'O',
  exemptionTypeDescription: 'Order in Council',
  ownerClientNumber: null,
  agentClientNumber: null,
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

const configureBlanketOicCreationDependencies = () => {
  vi.mocked(fetchExemptionEditContext).mockResolvedValue({
    rateOverrideEnabled: false,
    fixedFeeRate: '',
    regionNumbers: ['1909'],
    locked: false,
    lockMessage: '',
  })
  vi.mocked(fetchProvincialExemptionOptions).mockResolvedValue({
    exemptionTypes: [{ value: 'B', label: 'Blanket OIC' }],
    exemptionStatuses: [{ value: 'ACT', label: 'Active' }],
    regions: [{ value: '1909', label: 'South Coast Natural Resource Region' }],
  })
  vi.mocked(fetchExemptionClientLocations).mockResolvedValue([
    {
      locationCode: '00',
      locationName: 'WOODLANDS SERVICES',
      selected: true,
    },
  ])
  vi.mocked(fetchExemptionClientData).mockImplementation(async (clientNumber) => ({
    clientNumber: clientNumber.padStart(8, '0'),
    companyName: 'Test Client',
    address: '',
    city: '',
    province: '',
    postalCode: '',
    country: '',
    phone: '',
    fax: '',
    email: '',
    notfound: '',
  }))
  vi.mocked(fetchShippingReferenceOptions).mockResolvedValue({
    countries: [{ code: 'US', name: 'United States Of America' }],
    transportTypes: [{ code: 'B', name: 'Barge' }],
    ports: [{ code: 'CB', name: 'Cowichan Bay' }],
  })
}

const fillRequiredBlanketOicFields = async (dialog: HTMLElement) => {
  await userEvent.type(within(dialog).getByLabelText('Permit Request Pieces'), '4')
  await userEvent.type(within(dialog).getByLabelText('Permit Request Volume (m³)'), '4')
  await userEvent.type(within(dialog).getByLabelText('Owner client number'), '1074')
  await userEvent.type(within(dialog).getByLabelText('Destination company'), 'test destination')
  await waitFor(() => expect(within(dialog).getByLabelText('Owner location')).toHaveValue('00'))
  expect(within(dialog).getByLabelText('Owner client number')).toHaveValue('00001074')
  await userEvent.type(within(dialog).getByLabelText('Transport name'), 'test barge')
  await userEvent.type(within(dialog).getByLabelText('Estimated shipping date'), '2099-01-01')
  await userEvent.type(within(dialog).getByLabelText('Remarks'), 'test blanket permit')
}

describe('permit creation from an exemption', () => {
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

  it.each([
    'LEXIS_APPLICATION_APPROVER',
    'LEXIS_ADMIN',
    'LEXIS_PROVINCIAL_SUBMITTER',
    'LEXIS_PROVINCIAL_SUBMITTER_00012345',
  ])('shows the action for %s', async (role) => {
    mockRole([role])
    renderPage(activeMinisterialExemption)

    await openPermitsTab()
    expect(screen.getByRole('button', { name: 'Apply for new permit' })).toBeInTheDocument()
  })

  it.each([
    'LEXIS_APPLICATION_APPROVER',
    'LEXIS_ADMIN',
    'LEXIS_PROVINCIAL_SUBMITTER',
    'LEXIS_PROVINCIAL_SUBMITTER_00012345',
  ])('shows the Blanket OIC action for %s with both permit actions', async (role) => {
    mockRole([role], ['createPermit', 'savePermit'])
    renderPage(activeBlanketOicExemption)

    await openPermitsTab()
    expect(screen.getByRole('button', { name: 'Apply for new permit' })).toBeInTheDocument()
  })

  it.each(['LEXIS_EXEMPTION_APPROVER', 'LEXIS_READ_ONLY'])(
    'does not expose Blanket OIC permit creation to %s even if permit actions are present',
    async (role) => {
      mockRole([role], ['createPermit', 'savePermit'])
      renderPage(activeBlanketOicExemption)

      await openPermitsTab()
      expect(screen.queryByRole('button', { name: 'Apply for new permit' })).not.toBeInTheDocument()
      expect(addPermitDetail).not.toHaveBeenCalled()
    },
  )

  it('matches legacy permit totals and marks active permits as pending', async () => {
    vi.mocked(fetchExemptionApplications).mockResolvedValue({
      applications: [
        {
          applicationNumber: '1000456',
          requestedVolume: '307.2',
          scaleVolume: '',
          locked: false,
          jurisdiction: 'P',
          ownerClientNumber: '',
          agentClientNumber: '',
          ownerClientLocationCode: '',
          agentClientLocationCode: '',
          applicantTypeCode: '',
          ownerContactName: '',
          agentContactName: '',
          ownerCompanyName: '',
          agentCompanyName: '',
        },
      ],
      containsUnmanu: false,
      ownerNumber: '00012345',
    })
    vi.mocked(fetchExemptionPermits).mockResolvedValue([
      {
        permitNumber: '9020934',
        permitVolume: '0.0',
        permitStatus: 'Active',
        permitIssueDate: '',
        canViewPermit: true,
      },
      {
        permitNumber: '9020933',
        permitVolume: '307.2',
        permitStatus: 'Complete',
        permitIssueDate: '2026-03-19',
        canViewPermit: true,
      },
    ])
    renderPage({
      ...activeMinisterialExemption,
      approvedVolume: 307.2,
      usedVolume: 307.2,
      remainingVolume: 0,
    })

    await openPermitsTab()

    const totals = screen.getByLabelText('Exemption permit volume totals')
    expect(within(totals).getByText('Requested volume (m³)')).toBeInTheDocument()
    expect(within(totals).getByText('Approved volume (m³)')).toBeInTheDocument()
    expect(within(totals).getByText('Sum of application scales (m³)')).toBeInTheDocument()
    expect(within(totals).getByText('Balance remaining (m³)')).toBeInTheDocument()
    expect(within(totals).getAllByText('307.2')).toHaveLength(3)
    expect(within(totals).getByText('0.0')).toBeInTheDocument()
    expect(screen.getByText('9020934 (Pending)')).toBeInTheDocument()
    expect(screen.getByText('9020933')).toBeInTheDocument()
  })

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

  it('creates an Order in Council permit through the application-backed flow', async () => {
    vi.mocked(createPermitFromExemption).mockResolvedValue({
      success: true,
      message: 'The permit was created successfully.',
      errors: [],
      warnings: [],
      source: 'api',
      permitNumber: '98766',
    })
    const router = renderPage(activeOicExemption)

    await openPermitsTab()
    await userEvent.click(screen.getByRole('button', { name: 'Apply for new permit' }))

    const dialog = screen.getByRole('dialog', { name: 'Apply for new permit' })
    expect(
      within(dialog).getByText(
        /creates a new active permit for Order in Council exemption OIC-205/i,
      ),
    ).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create permit' }))

    await waitFor(() => expect(createPermitFromExemption).toHaveBeenCalledWith('OIC-205'))
    await waitFor(() => expect(router.state.location.pathname).toBe('/provincial/permit/98766'))
  })

  it('collects and saves the required Blanket OIC permit fields before navigating', async () => {
    mockRole(['LEXIS_APPLICATION_APPROVER'], ['createPermit', 'savePermit'])
    configureBlanketOicCreationDependencies()
    vi.mocked(addPermitDetail).mockResolvedValue({
      success: true,
      message: 'The permit was saved successfully.',
      errors: [],
      warnings: [],
      source: 'api',
      permitNumber: '9020948',
    })
    const router = renderPage(activeBlanketOicExemption)

    await openPermitsTab()
    await userEvent.click(screen.getByRole('button', { name: 'Apply for new permit' }))

    const dialog = screen.getByRole('dialog', { name: 'Apply for new Blanket OIC permit' })
    expect(
      within(dialog).getByText(/permit number is assigned only after a successful save/i),
    ).toBeInTheDocument()
    await fillRequiredBlanketOicFields(dialog)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create permit' }))

    await waitFor(() => expect(addPermitDetail).toHaveBeenCalledOnce())
    expect(addPermitDetail).toHaveBeenCalledWith(
      expect.objectContaining({
        permitNumber: '',
        permitStatus: 'ACT',
        exemptionNumber: 'TEST13E2',
        permitExpiryDate: '2099-12-31',
        oicPermitTotalPieces: '4',
        oicPermitTotalVolume: '4',
        orgUnitNumber: '1909',
        ownerClientNumber: '00001074',
        ownerClientLocation: '00',
        destinationCompanyName: 'test destination',
        destinationCountry: 'US',
        transportType: 'B',
        transportName: 'test barge',
        estimatedShippingDate: '2099-01-01',
        portOfExport: 'CB',
      }),
    )
    await waitFor(() => expect(router.state.location.pathname).toBe('/provincial/permit/9020948'))
  })

  it('preserves a verified Blanket OIC client selection when a refresh fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockRole(['LEXIS_APPLICATION_APPROVER'], ['createPermit', 'savePermit'])
    configureBlanketOicCreationDependencies()
    renderPage(activeBlanketOicExemption)

    await openPermitsTab()
    await userEvent.click(screen.getByRole('button', { name: 'Apply for new permit' }))
    const dialog = screen.getByRole('dialog', { name: 'Apply for new Blanket OIC permit' })
    const ownerClientNumber = within(dialog).getByLabelText('Owner client number')
    await userEvent.type(ownerClientNumber, '1074')
    await userEvent.tab()
    await waitFor(() => expect(within(dialog).getByLabelText('Owner location')).toHaveValue('00'))

    vi.mocked(fetchExemptionClientLocations).mockRejectedValueOnce(
      new Error('client endpoint unavailable'),
    )
    await userEvent.click(ownerClientNumber)
    await userEvent.tab()

    expect(
      await within(dialog).findByText(
        'Client details could not be retrieved. Existing selections were preserved. Please try again.',
      ),
    ).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Owner client number')).toHaveValue('00001074')
    expect(within(dialog).getByLabelText('Owner location')).toHaveValue('00')

    consoleError.mockRestore()
  })

  it('keeps another Blanket OIC client lookup failure visible after a successful retry', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockRole(['LEXIS_APPLICATION_APPROVER'], ['createPermit', 'savePermit'])
    configureBlanketOicCreationDependencies()
    const lookupAttempts = new Map<string, number>()
    vi.mocked(fetchExemptionClientLocations).mockImplementation((clientNumber) => {
      const attempt = (lookupAttempts.get(clientNumber) ?? 0) + 1
      lookupAttempts.set(clientNumber, attempt)
      return attempt === 1
        ? Promise.reject(new Error('client endpoint unavailable'))
        : Promise.resolve([
            {
              locationCode: '00',
              locationName: 'WOODLANDS SERVICES',
              selected: true,
            },
          ])
    })
    renderPage(activeBlanketOicExemption)

    await openPermitsTab()
    await userEvent.click(screen.getByRole('button', { name: 'Apply for new permit' }))
    const dialog = screen.getByRole('dialog', { name: 'Apply for new Blanket OIC permit' })
    const ownerClientNumber = within(dialog).getByLabelText('Owner client number')
    await userEvent.type(ownerClientNumber, '11111111')
    await userEvent.tab()
    expect(await within(dialog).findByText('Client details unavailable')).toBeInTheDocument()

    await userEvent.click(
      within(dialog).getByRole('checkbox', { name: 'An agent is acting for the owner' }),
    )
    const agentClientNumber = within(dialog).getByLabelText('Agent client number')
    await userEvent.type(agentClientNumber, '22222222')
    await userEvent.tab()
    await waitFor(() => expect(lookupAttempts.get('22222222')).toBe(1))

    await userEvent.click(ownerClientNumber)
    await userEvent.tab()
    await waitFor(() => expect(within(dialog).getByLabelText('Owner location')).toHaveValue('00'))
    expect(within(dialog).getByText('Client details unavailable')).toBeInTheDocument()

    await userEvent.click(agentClientNumber)
    await userEvent.tab()
    await waitFor(() => expect(within(dialog).getByLabelText('Agent location')).toHaveValue('00'))
    expect(within(dialog).queryByText('Client details unavailable')).not.toBeInTheDocument()

    consoleError.mockRestore()
  })

  it('ignores a late Blanket OIC client lookup after the client number changes', async () => {
    mockRole(['LEXIS_APPLICATION_APPROVER'], ['createPermit', 'savePermit'])
    configureBlanketOicCreationDependencies()
    let resolveFirstLookup: (
      locations: Awaited<ReturnType<typeof fetchExemptionClientLocations>>,
    ) => void = () => undefined
    const firstLookup = new Promise<Awaited<ReturnType<typeof fetchExemptionClientLocations>>>(
      (resolve) => {
        resolveFirstLookup = resolve
      },
    )
    vi.mocked(fetchExemptionClientLocations).mockImplementation((clientNumber) =>
      clientNumber === '11111111'
        ? firstLookup
        : Promise.resolve([
            {
              locationCode: '22',
              locationName: 'SECOND CLIENT LOCATION',
              selected: true,
            },
          ]),
    )
    renderPage(activeBlanketOicExemption)

    await openPermitsTab()
    await userEvent.click(screen.getByRole('button', { name: 'Apply for new permit' }))
    const dialog = screen.getByRole('dialog', { name: 'Apply for new Blanket OIC permit' })
    const ownerClientNumber = within(dialog).getByLabelText('Owner client number')
    const ownerLocation = within(dialog).getByLabelText('Owner location')

    await userEvent.type(ownerClientNumber, '11111111')
    await userEvent.tab()
    await waitFor(() => expect(fetchExemptionClientLocations).toHaveBeenCalledWith('11111111'))

    await userEvent.click(ownerClientNumber)
    await userEvent.clear(ownerClientNumber)
    await userEvent.type(ownerClientNumber, '22222222')
    await userEvent.tab()
    await waitFor(() => expect(ownerLocation).toHaveValue('22'))

    resolveFirstLookup([
      {
        locationCode: '11',
        locationName: 'FIRST CLIENT LOCATION',
        selected: true,
      },
    ])
    await firstLookup
    await Promise.resolve()

    expect(ownerClientNumber).toHaveValue('22222222')
    expect(ownerLocation).toHaveValue('22')
    expect(
      within(ownerLocation).queryByRole('option', { name: /FIRST CLIENT LOCATION/ }),
    ).toBeNull()
  })

  it('validates the Blanket OIC form before calling the server', async () => {
    mockRole(['LEXIS_APPLICATION_APPROVER'], ['createPermit', 'savePermit'])
    configureBlanketOicCreationDependencies()
    renderPage(activeBlanketOicExemption)

    await openPermitsTab()
    await userEvent.click(screen.getByRole('button', { name: 'Apply for new permit' }))

    const dialog = screen.getByRole('dialog', { name: 'Apply for new Blanket OIC permit' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create permit' }))

    expect(
      await within(dialog).findAllByText('Owner client number must be exactly 8 digits.'),
    ).not.toHaveLength(0)
    expect(addPermitDetail).not.toHaveBeenCalled()
  })

  it('shows an authoritative Blanket OIC rejection without navigating', async () => {
    mockRole(['LEXIS_APPLICATION_APPROVER'], ['createPermit', 'savePermit'])
    configureBlanketOicCreationDependencies()
    vi.mocked(addPermitDetail).mockResolvedValue({
      success: false,
      message: 'Unable to create permit.',
      errors: ['The exemption is no longer eligible.'],
      warnings: [],
      source: 'api',
      permitNumber: '',
    })
    const router = renderPage(activeBlanketOicExemption)

    await openPermitsTab()
    await userEvent.click(screen.getByRole('button', { name: 'Apply for new permit' }))
    const dialog = screen.getByRole('dialog', { name: 'Apply for new Blanket OIC permit' })
    await fillRequiredBlanketOicFields(dialog)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create permit' }))

    expect(
      await within(dialog).findByText('The exemption is no longer eligible.'),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/provincial/exemption/TEST13E2')
  })

  it('requires a reload after an unknown Blanket OIC creation outcome', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockRole(['LEXIS_APPLICATION_APPROVER'], ['createPermit', 'savePermit'])
    configureBlanketOicCreationDependencies()
    vi.mocked(addPermitDetail).mockRejectedValue(new Error('connection lost'))
    const router = renderPage(activeBlanketOicExemption)

    await openPermitsTab()
    await userEvent.click(screen.getByRole('button', { name: 'Apply for new permit' }))
    const dialog = screen.getByRole('dialog', { name: 'Apply for new Blanket OIC permit' })
    await fillRequiredBlanketOicFields(dialog)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create permit' }))

    expect(
      await screen.findByText(
        'The permit request outcome could not be confirmed. Reload this exemption and check Related permits before trying again.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Apply for new permit' })).not.toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/provincial/exemption/TEST13E2')
    consoleError.mockRestore()
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
