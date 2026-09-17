import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchExemptionClientData,
  fetchExemptionClientLocations,
} from '@/service/application-client-lookup-service'
import { addPermitDetail } from '@/service/provincial-permit-documents-invoices-service'
import { fetchShippingReferenceOptions } from '@/service/shipping-reference-service'
import BlanketOicPermitCreateForm from './BlanketOicPermitCreateForm'

vi.mock('@/service/application-client-lookup-service', () => ({
  fetchExemptionClientData: vi.fn(),
  fetchExemptionClientLocations: vi.fn(),
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
            onCancel={vi.fn()}
            onCreated={onCreated}
            onUnknownOutcome={vi.fn()}
          />
        ),
      },
    ],
    { initialEntries: ['/'] },
  )

  render(<RouterProvider router={router} />)
  return { onCreated }
}

const fillRequiredPermitAndShippingFields = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.type(screen.getByLabelText('Permit request pieces'), '0')
  await user.type(screen.getByLabelText('Permit request volume (m³)'), '0')
  await user.click(screen.getByRole('tab', { name: 'Shipping' }))
  await user.type(screen.getByLabelText('Purchaser'), 'Test purchaser')
  await user.type(screen.getByLabelText('Transport name'), 'Test barge')
  await user.type(screen.getByLabelText('Estimated shipping date'), '2099-01-01')
}

describe('BlanketOicPermitCreateForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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

  it('requires blank request totals but accepts explicit zero values when saving', async () => {
    const user = userEvent.setup()
    const { onCreated } = renderForm()

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

    await user.click(screen.getByRole('button', { name: 'Save permit' }))

    expect(await screen.findByText('Permit request pieces is required.')).toBeInTheDocument()
    expect(screen.getByText('Permit request volume is required.')).toBeInTheDocument()
    expect(addPermitDetail).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText('Permit request pieces'), '0')
    await user.type(screen.getByLabelText('Permit request volume (m³)'), '0')
    await user.click(screen.getByRole('tab', { name: 'Applicant' }))
    await user.type(screen.getByLabelText('Applicant client number'), '12345678')
    await user.tab()
    await waitFor(() => expect(screen.getByLabelText('Applicant location')).toHaveValue('00'))

    await user.click(screen.getByRole('tab', { name: 'Shipping' }))
    await user.type(screen.getByLabelText('Purchaser'), 'Test purchaser')
    await user.type(screen.getByLabelText('Transport name'), 'Test barge')
    await user.type(screen.getByLabelText('Estimated shipping date'), '2099-01-01')
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

  it('reveals Agent information only when the applicant identifies as an agent', async () => {
    const user = userEvent.setup()
    renderForm()

    await waitFor(() => expect(screen.getByRole('button', { name: 'Save permit' })).toBeEnabled())
    await user.click(screen.getByRole('tab', { name: 'Applicant' }))

    expect(screen.queryByRole('heading', { name: 'Agent information' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: "I'm an agent" }))

    expect(screen.getByRole('heading', { name: 'Agent information' })).toBeInTheDocument()
    expect(screen.getByLabelText('Agent client number')).toBeInTheDocument()
    expect(screen.getByLabelText('Agent location')).toBeInTheDocument()
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
    await user.type(screen.getByLabelText('Applicant client number'), '12345678')
    await user.tab()
    await waitFor(() => expect(screen.getByLabelText('Applicant location')).toHaveValue('01'))
    expect(
      screen.getByLabelText('Applicant location').querySelector('option[value="0"]'),
    ).toBeNull()

    await user.click(screen.getByRole('checkbox', { name: "I'm an agent" }))
    await user.type(screen.getByLabelText('Agent client number'), '87654321')
    await user.tab()
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
      await user.type(screen.getByLabelText('Applicant client number'), '12345678')
      await user.tab()
      await waitFor(() => expect(screen.getByLabelText('Applicant location')).toHaveValue('01'))
      await user.click(screen.getByRole('checkbox', { name: "I'm an agent" }))
      await user.type(screen.getByLabelText('Agent client number'), scenario.blockedClientNumber)
    } else {
      await user.type(
        screen.getByLabelText('Applicant client number'),
        scenario.blockedClientNumber,
      )
    }
    await user.tab()

    await waitFor(() => expect(screen.getByText(scenario.errorMessage)).toBeInTheDocument())
    expect(screen.getByLabelText(scenario.locationLabel)).toBeDisabled()
    expect(
      screen.getByLabelText(scenario.locationLabel).querySelector('option[value="0"]'),
    ).toBeNull()

    await user.click(screen.getByRole('tab', { name: 'Permit' }))
    await fillRequiredPermitAndShippingFields(user)
    await user.click(screen.getByRole('button', { name: 'Save permit' }))

    await screen.findByText(
      `${scenario.kind === 'applicant' ? 'Applicant' : 'Agent'} location is required.`,
    )
    expect(addPermitDetail).not.toHaveBeenCalled()
    expect(fetchExemptionClientData).not.toHaveBeenCalledWith(scenario.blockedClientNumber, '0')
  })
})
