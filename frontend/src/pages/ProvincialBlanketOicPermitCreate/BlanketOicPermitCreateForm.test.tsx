import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import { createTestAuthContext, createTestCapabilities } from '@/test-utils/auth'
import {
  fetchApplicationClientData,
  fetchApplicationClientLocations,
} from '@/service/application-client-lookup-service'
import { searchForestClients } from '@/service/client-search-service'
import { addPermitDetail } from '@/service/provincial-permit-documents-invoices-service'
import { fetchShippingReferenceOptions } from '@/service/shipping-reference-service'
import BlanketOicPermitCreateForm from './BlanketOicPermitCreateForm'

vi.mock('@/context/auth/useAuth', () => ({ useAuth: vi.fn() }))

vi.mock('@/service/application-client-lookup-service', () => ({
  fetchApplicationClientData: vi.fn(),
  fetchApplicationClientLocations: vi.fn(),
}))

vi.mock('@/service/client-search-service', () => ({
  searchForestClients: vi.fn(),
}))

vi.mock('@/service/provincial-permit-documents-invoices-service', () => ({
  addPermitDetail: vi.fn(),
}))

vi.mock('@/service/shipping-reference-service', () => ({
  fetchShippingReferenceOptions: vi.fn(),
  formatShippingReferenceOption: (option: { code: string; name: string }) => option.name,
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
  ports: [
    { code: 'CB', name: 'Cowichan Bay' },
    { code: 'OT', name: 'Other' },
  ],
}

const clientDetails = (clientNumber: string, locationCode: string) => ({
  clientNumber,
  companyName: `Resolved client ${clientNumber}`,
  clientAcronym: '',
  address: `Address ${locationCode}`,
  city: `City of ${clientNumber}`,
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

const clientControl = (party: 'owner' | 'agent') =>
  screen.getByLabelText(party === 'agent' ? 'Agent client' : 'Client', {
    selector: `#boic-permit-${party}-client`,
  })

const clientLocationControl = (party: 'owner' | 'agent') =>
  screen.getByLabelText(party === 'agent' ? 'Agent client location' : 'Client location', {
    selector: `#boic-permit-${party}-location`,
  })

const selectForestClient = async (
  user: ReturnType<typeof userEvent.setup>,
  party: 'owner' | 'agent',
  clientNumber: string,
) => {
  await user.type(clientControl(party), clientNumber)
  await user.click(await screen.findByRole('option', { name: `Test client · ${clientNumber}` }))
}

describe('BlanketOicPermitCreateForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue(createTestAuthContext())
    vi.mocked(searchForestClients).mockImplementation(async (query) => [
      { clientNumber: query, companyName: 'Test client', clientAcronym: '' },
    ])
    vi.mocked(fetchShippingReferenceOptions).mockResolvedValue(shippingReferences)
    vi.mocked(fetchApplicationClientLocations).mockResolvedValue([
      { locationCode: '00', locationName: 'Test location', selected: true },
    ])
    vi.mocked(fetchApplicationClientData).mockResolvedValue({
      clientNumber: '12345678',
      companyName: 'Test client',
      clientAcronym: '',
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

  it.each([false, true])(
    'restricts submit, issue and expiry dates by permit review permission (%s)',
    async (canReview) => {
      vi.mocked(useAuth).mockReturnValue(
        createTestAuthContext({ canPerform: (action) => action === '/permitsReview' && canReview }),
      )
      renderForm()

      await waitFor(() => expect(screen.getByRole('button', { name: 'Save permit' })).toBeEnabled())
      for (const label of ['Submit date', 'Issued date', 'Expiry date']) {
        expect(screen.getByLabelText(label)).toHaveProperty('disabled', !canReview)
      }
      expect(screen.getByLabelText('Submit date')).not.toHaveValue('')
    },
  )

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
    for (const [label, value] of [
      ['Current permit pieces', '0'],
      ['Current permit volume (m³)', '0.0'],
    ]) {
      const field = screen.getByText(label).closest('.record-field, .detail-field-item')
      expect(field).toBeTruthy()
      expect(within(field as HTMLElement).getByText(value)).toBeInTheDocument()
    }
    expect(screen.getByText('0/250')).toBeInTheDocument()
    for (const tab of screen.getAllByRole('tab')) expect(tab.querySelector('svg')).not.toBeNull()
    expect(screen.queryByRole('group', { name: 'Permit needs attention' })).not.toBeInTheDocument()
  })

  it('leads each card title with its tab icon and notes the later tabs without a card', async () => {
    const user = userEvent.setup()
    renderForm()

    await waitFor(() => expect(screen.getByRole('button', { name: 'Save permit' })).toBeEnabled())
    expect(
      screen.getByRole('heading', { level: 2, name: 'Permit details' }).querySelector('svg'),
    ).toHaveAttribute('aria-hidden', 'true')
    for (const tab of ['Scale', 'Documents', 'Fees']) {
      await user.click(screen.getByRole('tab', { name: tab }))
      const panel = screen.getByRole('tabpanel', { name: tab })
      expect(panel).toHaveTextContent(/^Available after the permit is saved\.$/)
      expect(panel.querySelector('.cds--tile, h2, svg')).toBeNull()
    }
  })

  it('requires blank request totals and updates the tab as explicit zeros are entered', async () => {
    const user = userEvent.setup()
    renderForm()

    await waitFor(() => expect(screen.getByRole('button', { name: 'Save permit' })).toBeEnabled())

    await user.click(screen.getByRole('button', { name: 'Save permit' }))

    const summary = await screen.findByRole('group', { name: 'Permit needs attention' })
    expect(within(summary).getByText('Cannot save yet.')).toBeInTheDocument()
    expect(
      within(summary).getByText(
        'Complete the required fields in Permit, Applicant and Shipping tabs.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('Permit request pieces is required')).toBeInTheDocument()
    expect(screen.getByText('Permit request volume is required')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Permit needs attention' })).toHaveFocus()
    expect(
      screen.queryByText(/The permit number is assigned when you save/),
    ).not.toBeInTheDocument()
    expect(
      screen
        .getByRole('tab', { name: 'Permit, 2 required fields outstanding' })
        .querySelector('svg'),
    ).toBeNull()
    // Client location waits on a client, so only the client is counted.
    expect(
      screen.getByRole('tab', { name: 'Applicant, 1 required field outstanding' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('tab', { name: 'Shipping, 3 required fields outstanding' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('Client location is required')).not.toBeInTheDocument()
    expect(addPermitDetail).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Save permit' }))
    expect(screen.getByRole('group', { name: 'Permit needs attention' })).toHaveFocus()

    await user.type(screen.getByLabelText('Permit request pieces'), '0')
    expect(
      screen.getByRole('tab', { name: 'Permit, 1 required field outstanding' }),
    ).toBeInTheDocument()
    await user.type(screen.getByLabelText('Permit request volume (m³)'), '0')
    expect(screen.getByRole('tab', { name: 'Permit' }).querySelector('svg')).not.toBeNull()
    expect(
      within(summary).getByText('Complete the required fields in Applicant and Shipping tabs.'),
    ).toBeInTheDocument()
  })

  it.each(['0', '123.456', '1234.5678', '.5', '123456789'])(
    'accepts %s as the permit request volume',
    async (volume) => {
      const user = userEvent.setup()
      renderForm()

      await user.type(screen.getByLabelText('Permit request volume (m³)'), volume)
      await user.click(screen.getByRole('button', { name: 'Save permit' }))

      await screen.findByRole('group', { name: 'Permit needs attention' })
      expect(screen.queryByText(/Permit request volume must be/)).not.toBeInTheDocument()
      expect(screen.queryByText('Permit request volume is required')).not.toBeInTheDocument()
    },
  )

  it.each([
    { volume: '-5', message: 'Permit request volume must be numeric' },
    { volume: '1.2.3', message: 'Permit request volume must be numeric' },
    { volume: '12a', message: 'Permit request volume must be numeric' },
    { volume: '1234567890', message: 'Permit request volume must be 9 characters or fewer' },
  ])('refuses $volume as the permit request volume', async ({ volume, message }) => {
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByLabelText('Permit request volume (m³)'), volume)
    await user.click(screen.getByRole('button', { name: 'Save permit' }))

    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(addPermitDetail).not.toHaveBeenCalled()
  })

  it.each([
    { pieces: '-1', message: 'Permit request pieces must be a whole number' },
    { pieces: '1.5', message: 'Permit request pieces must be a whole number' },
    { pieces: '10000000000', message: 'Permit request pieces must be 9999999999 or less' },
  ])('refuses $pieces as the permit request pieces', async ({ pieces, message }) => {
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByLabelText('Permit request pieces'), pieces)
    await user.click(screen.getByRole('button', { name: 'Save permit' }))

    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(addPermitDetail).not.toHaveBeenCalled()
  })

  it('names the tab of an optional date error and shows the error only on its field', async () => {
    const user = userEvent.setup()
    renderForm()

    await fillRequiredPermitAndShippingFields(user)
    await user.click(screen.getByRole('tab', { name: 'Applicant' }))
    await selectForestClient(user, 'owner', '12345678')
    await waitFor(() => expect(clientLocationControl('owner')).toHaveValue('00'))
    await user.click(screen.getByRole('tab', { name: 'Permit' }))
    await user.type(screen.getByLabelText('Issued date'), '1900-01-01')
    await user.click(screen.getByRole('tab', { name: 'Shipping' }))
    await user.click(screen.getByRole('button', { name: 'Save permit' }))

    const summary = await screen.findByRole('group', { name: 'Permit needs attention' })
    expect(within(summary).getByText('Cannot save yet.')).toBeInTheDocument()
    expect(
      within(summary).getByText('Complete the required fields in the Permit tab.'),
    ).toBeInTheDocument()
    expect(summary).not.toHaveTextContent('Issued date must be after or equal to submit date')
    expect(within(summary).queryByRole('list')).not.toBeInTheDocument()
    expect(
      screen.getByRole('tab', { name: 'Permit, 1 required field outstanding' }),
    ).toHaveAttribute('aria-selected', 'true')
    expect(
      screen.getByText('Issued date must be after or equal to submit date'),
    ).toBeInTheDocument()
    expect(summary).toHaveFocus()
    expect(addPermitDetail).not.toHaveBeenCalled()
  })

  it('shows a malformed date with the shared date format error', async () => {
    const user = userEvent.setup()
    renderForm()

    await waitFor(() => expect(screen.getByRole('button', { name: 'Save permit' })).toBeEnabled())
    await user.type(screen.getByLabelText('Expiry date'), '2026-02-30')
    await user.click(screen.getByRole('button', { name: 'Save permit' }))

    expect(screen.getByText('Date must be YYYY-MM-DD')).toBeInTheDocument()
    expect(screen.queryByText(/must use YYYY-MM-DD/)).not.toBeInTheDocument()
  })

  it('opens Shipping and focuses the error summary when Other port of export is the only missing field', async () => {
    const user = userEvent.setup()
    renderForm()

    await fillRequiredPermitAndShippingFields(user)
    await user.selectOptions(screen.getByLabelText('Customs port of export'), 'OT')
    await user.click(screen.getByRole('tab', { name: 'Applicant' }))
    await selectForestClient(user, 'owner', '12345678')
    await waitFor(() => expect(clientLocationControl('owner')).toHaveValue('00'))
    await user.click(screen.getByRole('tab', { name: 'Permit' }))
    await user.click(screen.getByRole('button', { name: 'Save permit' }))

    const summary = await screen.findByRole('group', { name: 'Permit needs attention' })
    expect(
      within(summary).getByText(/Complete the required fields in the Shipping tab/),
    ).toBeVisible()
    expect(screen.getByRole('tab', { name: /^Shipping,/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('group', { name: 'Permit needs attention' })).toHaveFocus()
    expect(addPermitDetail).not.toHaveBeenCalled()
  })

  it('shows a future submit date on its field and names its tab in the summary', async () => {
    const user = userEvent.setup()
    renderForm()

    await fillRequiredPermitAndShippingFields(user)
    await user.click(screen.getByRole('tab', { name: 'Applicant' }))
    await selectForestClient(user, 'owner', '12345678')
    await waitFor(() => expect(clientLocationControl('owner')).toHaveValue('00'))
    await user.click(screen.getByRole('tab', { name: 'Permit' }))
    await user.clear(screen.getByLabelText('Submit date'))
    await user.type(screen.getByLabelText('Submit date'), '2099-01-01')
    await user.click(screen.getByRole('button', { name: 'Save permit' }))

    const summary = await screen.findByRole('group', { name: 'Permit needs attention' })
    expect(
      within(summary).getByText('Complete the required fields in the Permit tab.'),
    ).toBeInTheDocument()
    expect(summary).not.toHaveTextContent("Submit date can't be in the future")
    expect(screen.getByText("Submit date can't be in the future")).toBeInTheDocument()
    expect(addPermitDetail).not.toHaveBeenCalled()
  })

  it('lists a problem without a field under the summary sentence', async () => {
    const user = userEvent.setup()
    vi.mocked(fetchShippingReferenceOptions).mockRejectedValue(new Error('unavailable'))
    renderForm()

    await user.click(screen.getByRole('button', { name: 'Save permit' }))

    const summary = await screen.findByRole('group', { name: 'Permit needs attention' })
    expect(
      within(summary).getByText(/^Complete the required fields in Permit, Applicant and Shipping/),
    ).toBeInTheDocument()
    const list = within(summary).getByRole('list')
    expect(list).toHaveClass('boic-permit-error-list')
    expect(within(list).getByRole('listitem')).toHaveTextContent(
      'Shipping reference options could not be loaded. Reload before creating a permit.',
    )
  })

  it('saves explicit zero request totals after correcting the required fields', async () => {
    vi.mocked(useAuth).mockReturnValue(createTestAuthContext({ canPerform: () => false }))
    const user = userEvent.setup()
    const { onCreated } = renderForm()

    await user.click(screen.getByRole('button', { name: 'Save permit' }))
    await screen.findByRole('group', { name: 'Permit needs attention' })
    await fillRequiredPermitAndShippingFields(user)
    await user.click(screen.getByRole('tab', { name: /^Applicant,/ }))
    await selectForestClient(user, 'owner', '12345678')
    await waitFor(() => expect(clientLocationControl('owner')).toHaveValue('00'))

    await user.click(screen.getByRole('tab', { name: 'Shipping' }))
    expect(screen.queryByRole('group', { name: 'Permit needs attention' })).not.toBeInTheDocument()
    expect(screen.getByText(/The permit number is assigned when you save/)).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Shipping' }).querySelector('svg')).not.toBeNull()
    await user.click(screen.getByRole('button', { name: 'Save permit' }))

    await waitFor(() => expect(addPermitDetail).toHaveBeenCalledTimes(1))
    expect(addPermitDetail).toHaveBeenCalledWith(
      expect.objectContaining({
        oicPermitTotalPieces: '0',
        oicPermitTotalVolume: '0',
        permitIssueDate: '',
        permitExpiryDate: '',
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
    expect(screen.getByRole('group', { name: 'Permit needs attention' })).toHaveFocus()
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
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(addPermitDetail).not.toHaveBeenCalled()
  })

  it('leaves without asking when only the pre-filled values are present', async () => {
    const user = userEvent.setup()
    const { router } = renderForm()
    await user.click(screen.getByRole('tab', { name: /^Shipping(?:,|$)/ }))
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Transport type' })).toHaveValue('B'),
    )

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/elsewhere'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('asks before discarding an entered permit on Cancel', async () => {
    const user = userEvent.setup()
    const { router } = renderForm()
    const remarks = screen.getByLabelText('Remarks')
    await user.type(remarks, 'Draft remarks')
    const cancel = screen.getByRole('button', { name: 'Cancel' })

    await user.click(cancel)

    const dialog = await screen.findByRole('dialog', { name: 'Discard this permit?' })
    expect(dialog).toHaveTextContent(
      "The permit hasn't been created yet. Everything you've entered will be lost.",
    )
    await user.click(within(dialog).getByRole('button', { name: 'Keep editing' }))
    await waitFor(() => expect(cancel).toHaveFocus())
    expect(router.state.location.pathname).toBe('/')
    expect(remarks).toHaveValue('Draft remarks')

    await user.click(cancel)
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Discard this permit?' })).getByRole(
        'button',
        { name: 'Discard' },
      ),
    )
    await waitFor(() => expect(router.state.location.pathname).toBe('/elsewhere'))
    expect(addPermitDetail).not.toHaveBeenCalled()
  })

  it('keeps entered values when switching tabs without asking', async () => {
    const user = userEvent.setup()
    renderForm()
    await user.type(screen.getByLabelText('Remarks'), 'Draft remarks')

    await user.click(screen.getByRole('tab', { name: /^Shipping(?:,|$)/ }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: /^Permit(?:,|$)/ }))

    expect(screen.getByLabelText('Remarks')).toHaveValue('Draft remarks')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('reveals Agent information only when the applicant identifies as an agent', async () => {
    const user = userEvent.setup()
    renderForm()

    await waitFor(() => expect(screen.getByRole('button', { name: 'Save permit' })).toBeEnabled())
    await user.click(screen.getByRole('tab', { name: 'Applicant' }))

    expect(screen.getByRole('heading', { name: 'Owner' })).toBeInTheDocument()
    expect(
      screen.getByText('Enter name, acronym, or client number (min. 3 characters)'),
    ).toBeInTheDocument()
    expect(clientLocationControl('owner')).toBeDisabled()
    expect(screen.getByText('Available once a client is selected.')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Agent' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: "I'm an agent" }))

    expect(screen.getByRole('heading', { name: 'Agent' })).toBeInTheDocument()
    expect(clientControl('agent')).toBeInTheDocument()
    expect(clientLocationControl('agent')).toBeInTheDocument()
    await selectForestClient(user, 'agent', '12345678')
    // The Client field shows the company name, so the details start at the address.
    const agentSection = screen.getByRole('region', { name: 'Agent' })
    expect(await within(agentSection).findByText('Address')).toBeInTheDocument()
    expect(agentSection).not.toHaveTextContent('Test client')

    await user.click(screen.getByRole('checkbox', { name: "I'm an agent" }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: "I'm an agent" }))
    expect(clientControl('agent')).toHaveValue('')
    expect(clientLocationControl('agent')).toHaveValue('')
    expect(
      within(screen.getByRole('region', { name: 'Agent' })).queryByText('Address'),
    ).not.toBeInTheDocument()
  })

  it.each(['Applicant', 'Agent'])(
    'shows read-only %s contact details and refreshes them for a changed location',
    async (kind) => {
      const user = userEvent.setup()
      vi.mocked(fetchApplicationClientLocations).mockResolvedValue([
        { locationCode: '01', locationName: 'First location', selected: true },
        { locationCode: '02', locationName: 'Second location', selected: false },
      ])
      vi.mocked(fetchApplicationClientData).mockImplementation(async (clientNumber, locationCode) =>
        clientDetails(clientNumber, locationCode),
      )
      renderForm()

      await user.click(screen.getByRole('tab', { name: 'Applicant' }))
      if (kind === 'Agent') await user.click(screen.getByRole('checkbox', { name: "I'm an agent" }))
      const labels =
        kind === 'Agent'
          ? { client: 'Agent client', location: 'Agent client location', section: 'Agent' }
          : { client: 'Client', location: 'Client location', section: 'Applicant' }
      const section = () =>
        kind === 'Agent'
          ? screen.getByRole('region', { name: labels.section })
          : screen.getByRole('group', { name: labels.section })
      expect(within(section()).queryByText('Address')).not.toBeInTheDocument()
      await selectForestClient(user, kind === 'Agent' ? 'agent' : 'owner', '12345678')
      expect(await within(section()).findByText('City of 12345678')).toBeInTheDocument()
      const firstDetails = section()
      expect(firstDetails).toHaveTextContent('City of 12345678')
      expect(firstDetails).not.toHaveTextContent('Resolved client 12345678')
      expect(firstDetails).toHaveTextContent('Phone number')
      expect(firstDetails).toHaveTextContent('Address 01')
      expect(within(firstDetails).queryByRole('textbox')).not.toBeInTheDocument()

      await user.selectOptions(clientLocationControl(kind === 'Agent' ? 'agent' : 'owner'), '02')
      expect(await within(section()).findByText('Address 02')).toBeInTheDocument()
      expect(section()).toHaveTextContent('Phone 02')
      expect(fetchApplicationClientData).toHaveBeenCalledWith('12345678', '02', {
        counterpartyClientNumber: '',
      })
      expect(screen.queryByText('Address 01')).not.toBeInTheDocument()
    },
  )

  it('clears contact details when the client changes and ignores a stale location response', async () => {
    const user = userEvent.setup()
    vi.mocked(fetchApplicationClientLocations).mockResolvedValue([
      { locationCode: '01', locationName: 'First location', selected: true },
      { locationCode: '02', locationName: 'Second location', selected: false },
    ])
    let resolveOldLocation!: (value: ReturnType<typeof clientDetails>) => void
    vi.mocked(fetchApplicationClientData).mockImplementation((clientNumber, locationCode) =>
      clientNumber === '12345678' && locationCode === '02'
        ? new Promise((resolve) => {
            resolveOldLocation = resolve
          })
        : Promise.resolve(clientDetails(clientNumber, locationCode)),
    )
    renderForm()

    await user.click(screen.getByRole('tab', { name: 'Applicant' }))
    await selectForestClient(user, 'owner', '12345678')
    await screen.findByText('Address 01')
    await user.selectOptions(clientLocationControl('owner'), '02')
    expect(screen.queryByText('Address 01')).not.toBeInTheDocument()
    expect(screen.getByText('Address').nextElementSibling).toHaveTextContent('Loading…')
    await user.clear(clientControl('owner'))
    expect(clientLocationControl('owner')).toHaveValue('')
    expect(screen.queryByText('Address')).not.toBeInTheDocument()
    await selectForestClient(user, 'owner', '87654321')
    expect(await screen.findByText('City of 87654321')).toBeInTheDocument()

    await act(async () => resolveOldLocation(clientDetails('12345678', '02')))
    expect(screen.getByText('City of 87654321')).toBeInTheDocument()
    expect(screen.queryByText('Address 02')).not.toBeInTheDocument()
    expect(clientLocationControl('owner')).toHaveValue('01')
  })

  it('uses selectable applicant and agent locations when the lookup also returns synthetic rows', async () => {
    const user = userEvent.setup()
    vi.mocked(fetchApplicationClientLocations).mockImplementation(async (clientNumber) =>
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
    vi.mocked(fetchApplicationClientData).mockImplementation(async (clientNumber) => ({
      clientNumber,
      companyName: 'Test client',
      clientAcronym: '',
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
    await selectForestClient(user, 'owner', '12345678')
    await waitFor(() => expect(clientLocationControl('owner')).toHaveValue('01'))
    expect(clientLocationControl('owner').querySelector('option[value="0"]')).toBeNull()

    await user.click(screen.getByRole('checkbox', { name: "I'm an agent" }))
    await selectForestClient(user, 'agent', '87654321')
    await waitFor(() => expect(clientLocationControl('agent')).toHaveValue('02'))
    expect(clientLocationControl('agent').querySelector('option[value="0"]')).toBeNull()

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
    expect(fetchApplicationClientData).not.toHaveBeenCalledWith('12345678', '0', expect.anything())
    expect(fetchApplicationClientData).not.toHaveBeenCalledWith('87654321', '0', expect.anything())
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('9001'))
  })

  it.each([
    {
      kind: 'applicant',
      blockedClientNumber: '12345678',
      party: 'owner' as const,
      errorMessage: 'No verified locations were found for this applicant',
    },
    {
      kind: 'agent' as const,
      blockedClientNumber: '87654321',
      party: 'agent' as const,
      errorMessage: 'No verified locations were found for this agent',
    },
  ])('does not submit a permit with only a synthetic $kind location', async (scenario) => {
    const user = userEvent.setup()
    vi.mocked(fetchApplicationClientLocations).mockImplementation(async (clientNumber) =>
      clientNumber === scenario.blockedClientNumber
        ? [{ locationCode: '0', locationName: 'Synthetic location', selected: true }]
        : [{ locationCode: '01', locationName: 'Verified location', selected: true }],
    )
    renderForm()

    await waitFor(() => expect(screen.getByRole('button', { name: 'Save permit' })).toBeEnabled())
    await user.click(screen.getByRole('tab', { name: 'Applicant' }))
    if (scenario.kind === 'agent') {
      await selectForestClient(user, 'owner', '12345678')
      await waitFor(() => expect(clientLocationControl('owner')).toHaveValue('01'))
      await user.click(screen.getByRole('checkbox', { name: "I'm an agent" }))
      await selectForestClient(user, 'agent', scenario.blockedClientNumber)
    } else {
      await selectForestClient(user, 'owner', scenario.blockedClientNumber)
    }

    await waitFor(() => expect(screen.getByText(scenario.errorMessage)).toBeInTheDocument())
    expect(clientLocationControl(scenario.kind === 'agent' ? 'agent' : 'owner')).toBeDisabled()
    expect(
      clientLocationControl(scenario.kind === 'agent' ? 'agent' : 'owner').querySelector(
        'option[value="0"]',
      ),
    ).toBeNull()

    await user.click(screen.getByRole('tab', { name: 'Permit' }))
    await fillRequiredPermitAndShippingFields(user)
    await user.click(screen.getByRole('button', { name: 'Save permit' }))

    expect(
      await screen.findByText('Complete the required fields in the Applicant tab.'),
    ).toBeInTheDocument()
    expect(screen.getByText(scenario.errorMessage)).toBeInTheDocument()
    expect(
      screen.getByRole('tab', { name: 'Applicant, 1 required field outstanding' }),
    ).toHaveAttribute('aria-selected', 'true')
    expect(addPermitDetail).not.toHaveBeenCalled()
    expect(fetchApplicationClientData).not.toHaveBeenCalledWith(
      scenario.blockedClientNumber,
      '0',
      expect.anything(),
    )
  })

  describe('for a Provincial Submitter', () => {
    const SUBMITTER_CLIENT = '00001074'
    const OTHER_OWNER = '00002176'

    beforeEach(() => {
      vi.mocked(useAuth).mockReturnValue(
        createTestAuthContext({
          capabilities: createTestCapabilities({
            principal: 'bceid\\submitter',
            roles: ['PROVINCIAL_SUBMITTER'],
            forestClientNumber: SUBMITTER_CLIENT,
          }),
          canPerform: vi.fn((action: string) => action !== '/permitsReview'),
        }),
      )
      vi.mocked(fetchApplicationClientLocations).mockResolvedValue([
        { locationCode: '00', locationName: 'Head office', selected: false },
        { locationCode: '02', locationName: 'Mill', selected: false },
      ])
      vi.mocked(fetchApplicationClientData).mockImplementation(async (clientNumber, locationCode) =>
        clientDetails(clientNumber, locationCode),
      )
    })

    it('preserves resolved acronyms when prefilling the owner and agent', async () => {
      vi.mocked(fetchApplicationClientData).mockImplementation(
        async (clientNumber, locationCode) => ({
          ...clientDetails(clientNumber, locationCode),
          clientAcronym: 'FCC',
        }),
      )
      const user = userEvent.setup()
      renderForm()
      await user.click(screen.getByRole('tab', { name: 'Applicant' }))
      await waitFor(() =>
        expect(clientControl('owner')).toHaveValue(
          `Resolved client ${SUBMITTER_CLIENT} (FCC) · ${SUBMITTER_CLIENT}`,
        ),
      )
      await user.click(screen.getByRole('checkbox', { name: "I'm an agent" }))
      await waitFor(() =>
        expect(clientControl('agent')).toHaveValue(
          `Resolved client ${SUBMITTER_CLIENT} (FCC) · ${SUBMITTER_CLIENT}`,
        ),
      )
    })

    it('shows the agent client in full while its own lookup is still pending', async () => {
      vi.mocked(fetchApplicationClientLocations).mockImplementation((_clientNumber, kind) =>
        kind === 'agent'
          ? new Promise(() => undefined)
          : Promise.resolve([{ locationCode: '00', locationName: 'Head office', selected: false }]),
      )
      const user = userEvent.setup()
      renderForm()
      await user.click(screen.getByRole('tab', { name: 'Applicant' }))
      const fullName = `Resolved client ${SUBMITTER_CLIENT} · ${SUBMITTER_CLIENT}`
      await waitFor(() => expect(clientControl('owner')).toHaveValue(fullName))

      await user.click(screen.getByRole('checkbox', { name: "I'm an agent" }))

      expect(fetchApplicationClientLocations).toHaveBeenCalledWith(
        SUBMITTER_CLIENT,
        'agent',
        '',
        SUBMITTER_CLIENT,
      )
      expect(clientControl('agent')).toHaveValue(fullName)
    })

    it('starts with their own client as an editable owner and leaves without asking', async () => {
      const user = userEvent.setup()
      const { router } = renderForm()

      await user.click(screen.getByRole('tab', { name: 'Applicant' }))
      await waitFor(() => expect(clientLocationControl('owner')).toHaveValue('00'))
      expect(clientControl('owner')).toHaveValue(
        `Resolved client ${SUBMITTER_CLIENT} · ${SUBMITTER_CLIENT}`,
      )
      expect(clientControl('owner')).toBeEnabled()
      expect(fetchApplicationClientLocations).toHaveBeenCalledWith(
        SUBMITTER_CLIENT,
        'owner',
        '',
        '',
      )
      expect(screen.queryByRole('heading', { name: 'Agent' })).not.toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Cancel' }))
      await waitFor(() => expect(router.state.location.pathname).toBe('/elsewhere'))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('saves as the agent for another owner, naming the other client on each lookup', async () => {
      const user = userEvent.setup()
      renderForm()

      await fillRequiredPermitAndShippingFields(user)
      await user.click(screen.getByRole('tab', { name: 'Applicant' }))
      await waitFor(() => expect(clientLocationControl('owner')).toHaveValue('00'))
      // Acting as agent starts with their own client as the agent.
      await user.click(screen.getByRole('checkbox', { name: "I'm an agent" }))
      await waitFor(() => expect(clientLocationControl('agent')).toHaveValue('00'))
      expect(fetchApplicationClientLocations).toHaveBeenCalledWith(
        SUBMITTER_CLIENT,
        'agent',
        '',
        SUBMITTER_CLIENT,
      )

      await user.clear(clientControl('owner'))
      await selectForestClient(user, 'owner', OTHER_OWNER)
      await waitFor(() => expect(clientLocationControl('owner')).toHaveValue('00'))
      expect(vi.mocked(searchForestClients).mock.calls.at(-1)?.slice(0, 2)).toEqual([
        OTHER_OWNER,
        SUBMITTER_CLIENT,
      ])
      expect(fetchApplicationClientLocations).toHaveBeenCalledWith(
        OTHER_OWNER,
        'owner',
        '',
        SUBMITTER_CLIENT,
      )
      expect(fetchApplicationClientData).toHaveBeenCalledWith(OTHER_OWNER, '00', {
        counterpartyClientNumber: SUBMITTER_CLIENT,
      })
      await user.selectOptions(clientLocationControl('owner'), '02')
      expect(fetchApplicationClientData).toHaveBeenLastCalledWith(OTHER_OWNER, '02', {
        counterpartyClientNumber: SUBMITTER_CLIENT,
      })

      await user.click(screen.getByRole('button', { name: 'Save permit' }))
      await waitFor(() => expect(addPermitDetail).toHaveBeenCalledTimes(1))
      expect(addPermitDetail).toHaveBeenCalledWith(
        expect.objectContaining({
          ownerClientNumber: OTHER_OWNER,
          ownerClientLocation: '02',
          agentClientNumber: SUBMITTER_CLIENT,
          agentClientLocation: '00',
        }),
      )
    })

    it('does not save a permit without their client as the owner or the agent', async () => {
      const user = userEvent.setup()
      renderForm()

      await fillRequiredPermitAndShippingFields(user)
      await user.click(screen.getByRole('tab', { name: 'Applicant' }))
      await waitFor(() => expect(clientLocationControl('owner')).toHaveValue('00'))
      await user.click(screen.getByRole('checkbox', { name: "I'm an agent" }))
      await waitFor(() => expect(clientLocationControl('agent')).toHaveValue('00'))
      await user.clear(clientControl('owner'))
      await selectForestClient(user, 'owner', OTHER_OWNER)
      await waitFor(() => expect(clientLocationControl('owner')).toHaveValue('00'))
      await user.click(screen.getByRole('checkbox', { name: "I'm an agent" }))
      await user.click(screen.getByRole('button', { name: 'Save permit' }))

      expect(
        await screen.findByText('Complete the required fields in the Applicant tab.'),
      ).toBeInTheDocument()
      expect(screen.getByText('Your client must be the owner or the agent')).toBeInTheDocument()
      expect(addPermitDetail).not.toHaveBeenCalled()
    })
  })
})
