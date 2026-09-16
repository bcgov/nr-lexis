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
})
