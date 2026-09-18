import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchExemptionClientData,
  fetchExemptionClientLocations,
} from '@/service/application-client-lookup-service'
import { searchForestClients } from '@/service/client-search-service'
import { addPermitDetail } from '@/service/provincial-permit-documents-invoices-service'
import { fetchShippingReferenceOptions } from '@/service/shipping-reference-service'
import BlanketOicPermitCreateForm from './BlanketOicPermitCreateForm'

vi.mock('@/service/application-client-lookup-service', () => ({
  fetchExemptionClientData: vi.fn(),
  fetchExemptionClientLocations: vi.fn(),
}))

vi.mock('@/service/client-search-service', () => ({
  searchForestClients: vi.fn(),
}))

vi.mock('@/service/provincial-permit-documents-invoices-service', () => ({
  addPermitDetail: vi.fn(),
}))

vi.mock('@/service/shipping-reference-service', () => ({
  fetchShippingReferenceOptions: vi.fn(),
  formatShippingReferenceOption: (option: { code: string; name: string }) =>
    `${option.name} (${option.code})`,
}))

const shippingReferences = {
  countries: [
    { code: 'CA', name: 'Canada' },
    { code: 'US', name: 'United States Of America' },
    { code: 'JP', name: 'Japan' },
    { code: 'CN', name: 'China' },
    { code: 'NZ', name: 'New Zealand' },
    { code: 'GB', name: 'United Kingdom' },
    { code: 'AD', name: 'Andorra' },
  ],
  transportTypes: [{ code: 'B', name: 'Barge' }],
  ports: [{ code: 'CB', name: 'Cowichan Bay' }],
}

const clientDetails = (clientNumber: string, locationCode: string) => ({
  clientNumber,
  companyName: `Resolved client ${clientNumber}`,
  address: `Address ${locationCode}`,
  city: 'Test city',
  province: 'BC',
  postalCode: 'V0A 0A0',
  country: 'Canada',
  phone: `Phone ${locationCode}`,
  fax: '',
  email: `contact-${locationCode}@example.com`,
  notfound: '',
})

const renderForm = () => {
  const onCreated = vi.fn()
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: (
          <BlanketOicPermitCreateForm
            exemptionNumber="TEST13E2"
            regionOptions={[
              { id: '1909', text: 'South Coast Natural Resource Region' },
              { id: '1910', text: 'Coast Mountains Natural Resource Region' },
              { id: '1905', text: 'Northern Interior Resource Region' },
            ]}
            defaultRegionNumbers={['1909']}
            onCancel={() => void router.navigate('/elsewhere')}
            onCreated={onCreated}
            onUnknownOutcome={vi.fn()}
          />
        ),
      },
      { path: '/elsewhere', element: <p>Another page</p> },
    ],
    { initialEntries: ['/'] },
  )

  render(<RouterProvider router={router} />)
  return { onCreated, router }
}

const fillRequiredPermitAndShippingFields = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.type(screen.getByLabelText('Permit request pieces'), '0')
  await user.type(screen.getByLabelText('Permit request volume (m³)'), '0')
  await user.click(screen.getByRole('tab', { name: /^Shipping(?:,|$)/ }))
  await user.click(screen.getByLabelText('Purchaser'))
  await user.paste('Test purchaser')
  await user.click(screen.getByLabelText('Transport name'))
  await user.paste('Test barge')
  await user.type(screen.getByLabelText('Estimated shipping date'), '2099-01-01')
}

const selectForestClient = async (
  user: ReturnType<typeof userEvent.setup>,
  label: string,
  clientNumber: string,
) => {
  await user.type(screen.getByRole('combobox', { name: label }), clientNumber)
  await user.click(await screen.findByRole('option', { name: `Test client · ${clientNumber}` }))
}

describe('BlanketOicPermitCreateForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(searchForestClients).mockImplementation(async (query) => [
      { clientNumber: query, companyName: 'Test client', clientAcronym: '' },
    ])
    vi.mocked(fetchShippingReferenceOptions).mockResolvedValue(shippingReferences)
    vi.mocked(fetchExemptionClientLocations).mockResolvedValue([
      { locationCode: '00', locationName: 'Test location', selected: true },
    ])
    vi.mocked(fetchExemptionClientData).mockResolvedValue({
      clientNumber: '12345678',
      companyName: 'Test client',
      address: '',
      city: '',
      province: '',
      postalCode: '',
      country: '',
      phone: '',
      fax: '',
      email: '',
      notfound: '',
    })
    vi.mocked(addPermitDetail).mockResolvedValue({
      success: true,
      message: 'The permit was saved successfully.',
      errors: [],
      warnings: [],
      source: 'api',
      permitNumber: '9001',
    })
  })

  it('shows the permit details and tab icons before validation is requested', async () => {
    renderForm()

    await waitFor(() => expect(screen.getByRole('button', { name: 'Save permit' })).toBeEnabled())
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Permit',
      'Applicant',
      'Shipping',
      'Scale',
      'Documents',
      'Fees',
    ])
    expect(screen.getByRole('heading', { name: 'Permit details' })).toBeInTheDocument()
    expect(screen.getByText('TEST13E2')).toBeInTheDocument()
    expect(screen.getByText('Blanket OIC')).toBeInTheDocument()
    expect(screen.getAllByText('—')).toHaveLength(2)
    expect(screen.getByText('0/250')).toBeInTheDocument()
    for (const tab of screen.getAllByRole('tab')) expect(tab.querySelector('svg')).not.toBeNull()
    expect(screen.queryByRole('group', { name: 'Permit needs attention' })).not.toBeInTheDocument()
  })

  it('requires blank request totals and updates the tab as explicit zeros are entered', async () => {
    const user = userEvent.setup()
    renderForm()

    await waitFor(() => expect(screen.getByRole('button', { name: 'Save permit' })).toBeEnabled())

    await user.click(screen.getByRole('button', { name: 'Save permit' }))

    const summary = await screen.findByRole('group', { name: 'Permit needs attention' })
    expect(within(summary).getByText('Permit request pieces is required.')).toBeInTheDocument()
    expect(within(summary).getByText('Permit request volume is required.')).toBeInTheDocument()
    expect(within(summary).getByText('Purchaser is required.')).toBeInTheDocument()
    expect(summary).toHaveFocus()
    expect(
      screen.queryByText(/The permit number is assigned after a successful save/),
    ).not.toBeInTheDocument()
    expect(
      screen
        .getByRole('tab', { name: 'Permit, 2 required fields outstanding' })
        .querySelector('svg'),
    ).toBeNull()
    expect(
      screen.getByRole('tab', { name: 'Applicant, 2 required fields outstanding' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('tab', { name: 'Shipping, 3 required fields outstanding' }),
    ).toBeInTheDocument()
    expect(addPermitDetail).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Save permit' }))
    expect(summary).toHaveFocus()

    await user.type(screen.getByLabelText('Permit request pieces'), '0')
    expect(
      screen.getByRole('tab', { name: 'Permit, 1 required field outstanding' }),
    ).toBeInTheDocument()
    await user.type(screen.getByLabelText('Permit request volume (m³)'), '0')
    expect(screen.getByRole('tab', { name: 'Permit' }).querySelector('svg')).not.toBeNull()
  })

  it('saves explicit zero request totals after correcting the required fields', async () => {
    const user = userEvent.setup()
    const { onCreated } = renderForm()

    await user.click(screen.getByRole('button', { name: 'Save permit' }))
    await screen.findByRole('group', { name: 'Permit needs attention' })
    await fillRequiredPermitAndShippingFields(user)
    await user.click(screen.getByRole('tab', { name: /^Applicant,/ }))
    await selectForestClient(user, 'Applicant client number', '12345678')
    await waitFor(() => expect(screen.getByLabelText('Applicant location')).toHaveValue('00'))

    await user.click(screen.getByRole('tab', { name: 'Shipping' }))
    expect(screen.queryByRole('group', { name: 'Permit needs attention' })).not.toBeInTheDocument()
    expect(
      screen.getByText(/The permit number is assigned after a successful save/),
    ).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Shipping' }).querySelector('svg')).not.toBeNull()
    await user.click(screen.getByRole('button', { name: 'Save permit' }))

    await waitFor(() => expect(addPermitDetail).toHaveBeenCalledTimes(1))
    expect(addPermitDetail).toHaveBeenCalledWith(
      expect.objectContaining({
        oicPermitTotalPieces: '0',
        oicPermitTotalVolume: '0',
        orgUnitNumber: '1909',
      }),
    )
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('9001'))
  })

  it('keeps Save available while reference options load and reports errors without submitting', async () => {
    const user = userEvent.setup()
    let resolveReferences!: (value: typeof shippingReferences) => void
    vi.mocked(fetchShippingReferenceOptions).mockReturnValue(
      new Promise((resolve) => {
        resolveReferences = resolve
      }),
    )
    renderForm()

    expect(screen.getByRole('button', { name: 'Save permit' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Save permit' }))

    const summary = screen.getByRole('group', { name: 'Permit needs attention' })
    expect(summary).toHaveFocus()
    expect(
      within(summary).getByText(/Shipping reference options are still loading/),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save permit' })).toBeEnabled()
    expect(addPermitDetail).not.toHaveBeenCalled()

    await act(async () => resolveReferences(shippingReferences))
    expect(
      screen.queryByText(/Shipping reference options are still loading/),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('tab', { name: 'Shipping, 3 required fields outstanding' }),
    ).toBeInTheDocument()
  })

  it('treats late shipping defaults as initial values when the user reverts an earlier edit', async () => {
    const user = userEvent.setup()
    let resolveReferences!: (value: typeof shippingReferences) => void
    vi.mocked(fetchShippingReferenceOptions).mockReturnValue(
      new Promise((resolve) => {
        resolveReferences = resolve
      }),
    )
    const { router } = renderForm()

    await user.type(screen.getByLabelText('Remarks'), 'Temporary draft')
    await act(async () => resolveReferences(shippingReferences))
    await user.clear(screen.getByLabelText('Remarks'))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(router.state.location.pathname).toBe('/elsewhere')
    expect(screen.queryByRole('dialog', { name: 'Unsaved changes' })).not.toBeInTheDocument()
    expect(addPermitDetail).not.toHaveBeenCalled()
  })

  it('reveals Agent information only when the applicant identifies as an agent', async () => {
    const user = userEvent.setup()
    renderForm()

    await waitFor(() => expect(screen.getByRole('button', { name: 'Save permit' })).toBeEnabled())
    await user.click(screen.getByRole('tab', { name: 'Applicant' }))

    expect(screen.queryByRole('heading', { name: 'Agent information' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: "I'm an agent" }))

    expect(screen.getByRole('heading', { name: 'Agent information' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Agent client number' })).toBeInTheDocument()
    expect(screen.getByLabelText('Agent location')).toBeInTheDocument()
    await selectForestClient(user, 'Agent client number', '12345678')
    expect(await screen.findByRole('region', { name: 'Agent details' })).toHaveTextContent(
      'Test client',
    )

    await user.click(screen.getByRole('checkbox', { name: "I'm an agent" }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: "I'm an agent" }))
    expect(screen.getByRole('combobox', { name: 'Agent client number' })).toHaveValue('')
    expect(screen.getByLabelText('Agent location')).toHaveValue('')
    expect(screen.queryByRole('region', { name: 'Agent details' })).not.toBeInTheDocument()
  })

  it.each(['Applicant', 'Agent'])(
    'shows read-only %s contact details and refreshes them for a changed location',
    async (kind) => {
      const user = userEvent.setup()
      vi.mocked(fetchExemptionClientLocations).mockResolvedValue([
        { locationCode: '01', locationName: 'First location', selected: true },
        { locationCode: '02', locationName: 'Second location', selected: false },
      ])
      vi.mocked(fetchExemptionClientData).mockImplementation(async (clientNumber, locationCode) =>
        clientDetails(clientNumber, locationCode),
      )
      renderForm()

      await user.click(screen.getByRole('tab', { name: 'Applicant' }))
      if (kind === 'Agent') await user.click(screen.getByRole('checkbox', { name: "I'm an agent" }))
      await selectForestClient(user, `${kind} client number`, '12345678')
      const firstDetails = await screen.findByRole('region', { name: `${kind} details` })
      expect(firstDetails).toHaveTextContent('Resolved client 12345678')
      expect(firstDetails).toHaveTextContent('Address 01')
      expect(within(firstDetails).queryByRole('textbox')).not.toBeInTheDocument()

      await user.selectOptions(screen.getByLabelText(`${kind} location`), '02')
      expect(await screen.findByRole('region', { name: `${kind} details` })).toHaveTextContent(
        'Address 02',
      )
      expect(screen.getByRole('region', { name: `${kind} details` })).toHaveTextContent('Phone 02')
      expect(fetchExemptionClientData).toHaveBeenCalledWith('12345678', '02')
      expect(screen.queryByText('Address 01')).not.toBeInTheDocument()
    },
  )

  it('clears contact details when the client changes and ignores a stale location response', async () => {
    const user = userEvent.setup()
    vi.mocked(fetchExemptionClientLocations).mockResolvedValue([
      { locationCode: '01', locationName: 'First location', selected: true },
      { locationCode: '02', locationName: 'Second location', selected: false },
    ])
    let resolveOldLocation!: (value: ReturnType<typeof clientDetails>) => void
    vi.mocked(fetchExemptionClientData).mockImplementation((clientNumber, locationCode) =>
      clientNumber === '12345678' && locationCode === '02'
        ? new Promise((resolve) => {
            resolveOldLocation = resolve
          })
        : Promise.resolve(clientDetails(clientNumber, locationCode)),
    )
    renderForm()

    await user.click(screen.getByRole('tab', { name: 'Applicant' }))
    await selectForestClient(user, 'Applicant client number', '12345678')
    await screen.findByText('Address 01')
    await user.selectOptions(screen.getByLabelText('Applicant location'), '02')
    expect(screen.queryByRole('region', { name: 'Applicant details' })).not.toBeInTheDocument()
    await user.clear(screen.getByRole('combobox', { name: 'Applicant client number' }))
    expect(screen.getByLabelText('Applicant location')).toHaveValue('')
    await selectForestClient(user, 'Applicant client number', '87654321')
    expect(await screen.findByRole('region', { name: 'Applicant details' })).toHaveTextContent(
      'Resolved client 87654321',
    )

    await act(async () => resolveOldLocation(clientDetails('12345678', '02')))
    expect(screen.getByRole('region', { name: 'Applicant details' })).toHaveTextContent(
      'Resolved client 87654321',
    )
    expect(screen.queryByText('Address 02')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Applicant location')).toHaveValue('01')
  })

  it('uses selectable applicant and agent locations when the lookup also returns synthetic rows', async () => {
    const user = userEvent.setup()
    vi.mocked(fetchExemptionClientLocations).mockImplementation(async (clientNumber) =>
      clientNumber === '12345678'
        ? [
            { locationCode: '0', locationName: 'Synthetic applicant', selected: true },
            { locationCode: '01', locationName: 'Applicant location', selected: false },
          ]
        : [
            { locationCode: '0', locationName: 'Synthetic agent', selected: true },
            { locationCode: '02', locationName: 'Agent location', selected: false },
          ],
    )
    vi.mocked(fetchExemptionClientData).mockImplementation(async (clientNumber) => ({
      clientNumber,
      companyName: 'Test client',
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
    const { onCreated } = renderForm()

    await waitFor(() => expect(screen.getByRole('button', { name: 'Save permit' })).toBeEnabled())
    await user.click(screen.getByRole('tab', { name: 'Applicant' }))
    await selectForestClient(user, 'Applicant client number', '12345678')
    await waitFor(() => expect(screen.getByLabelText('Applicant location')).toHaveValue('01'))
    expect(
      screen.getByLabelText('Applicant location').querySelector('option[value="0"]'),
    ).toBeNull()

    await user.click(screen.getByRole('checkbox', { name: "I'm an agent" }))
    await selectForestClient(user, 'Agent client number', '87654321')
    await waitFor(() => expect(screen.getByLabelText('Agent location')).toHaveValue('02'))
    expect(screen.getByLabelText('Agent location').querySelector('option[value="0"]')).toBeNull()

    await user.click(screen.getByRole('tab', { name: 'Permit' }))
    await fillRequiredPermitAndShippingFields(user)
    await user.click(screen.getByRole('button', { name: 'Save permit' }))

    await waitFor(() => expect(addPermitDetail).toHaveBeenCalledTimes(1))
    expect(addPermitDetail).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerClientLocation: '01',
        agentClientLocation: '02',
      }),
    )
    expect(fetchExemptionClientData).not.toHaveBeenCalledWith('12345678', '0')
    expect(fetchExemptionClientData).not.toHaveBeenCalledWith('87654321', '0')
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('9001'))
  })

  it.each([
    {
      kind: 'applicant',
      blockedClientNumber: '12345678',
      locationLabel: 'Applicant location',
      errorMessage: 'No verified locations were found for this applicant.',
    },
    {
      kind: 'agent',
      blockedClientNumber: '87654321',
      locationLabel: 'Agent location',
      errorMessage: 'No verified locations were found for this agent.',
    },
  ])('does not submit a permit with only a synthetic $kind location', async (scenario) => {
    const user = userEvent.setup()
    vi.mocked(fetchExemptionClientLocations).mockImplementation(async (clientNumber) =>
      clientNumber === scenario.blockedClientNumber
        ? [{ locationCode: '0', locationName: 'Synthetic location', selected: true }]
        : [{ locationCode: '01', locationName: 'Verified location', selected: true }],
    )
    renderForm()

    await waitFor(() => expect(screen.getByRole('button', { name: 'Save permit' })).toBeEnabled())
    await user.click(screen.getByRole('tab', { name: 'Applicant' }))
    if (scenario.kind === 'agent') {
      await selectForestClient(user, 'Applicant client number', '12345678')
      await waitFor(() => expect(screen.getByLabelText('Applicant location')).toHaveValue('01'))
      await user.click(screen.getByRole('checkbox', { name: "I'm an agent" }))
      await selectForestClient(user, 'Agent client number', scenario.blockedClientNumber)
    } else {
      await selectForestClient(user, 'Applicant client number', scenario.blockedClientNumber)
    }

    await waitFor(() => expect(screen.getByText(scenario.errorMessage)).toBeInTheDocument())
    expect(screen.getByLabelText(scenario.locationLabel)).toBeDisabled()
    expect(
      screen.getByLabelText(scenario.locationLabel).querySelector('option[value="0"]'),
    ).toBeNull()

    await user.click(screen.getByRole('tab', { name: 'Permit' }))
    await fillRequiredPermitAndShippingFields(user)
    await user.click(screen.getByRole('button', { name: 'Save permit' }))

    await screen.findAllByText(
      `${scenario.kind === 'applicant' ? 'Applicant' : 'Agent'} location is required.`,
    )
    expect(addPermitDetail).not.toHaveBeenCalled()
    expect(fetchExemptionClientData).not.toHaveBeenCalledWith(scenario.blockedClientNumber, '0')
  })
})
