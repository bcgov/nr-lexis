import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ProvincialApplicationCreatePage from '@/pages/ProvincialApplicationCreate'
import ProvincialExemptionCreatePage from '@/pages/ProvincialExemptionCreate'
import ProvincialOfferCreatePage from '@/pages/ProvincialOfferCreate'
import {
  submitProvincialApplicationCreate,
  submitProvincialExemptionCreate,
  submitProvincialOfferCreate,
  type CreateSubmissionResult,
} from '@/service/create-submit-service'
import {
  fetchProvincialApplicationOptions,
  fetchProvincialExemptionOptions,
  fetchProvincialOfferOptions,
} from '@/service/search-options-service'

const mockNavigate = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...(actual as object),
    useNavigate: () => mockNavigate,
  }
})

vi.mock('@/service/search-options-service', () => ({
  fetchProvincialApplicationOptions: vi.fn(),
  fetchProvincialExemptionOptions: vi.fn(),
  fetchProvincialOfferOptions: vi.fn(),
}))

vi.mock('@/service/create-submit-service', () => ({
  submitProvincialApplicationCreate: vi.fn(),
  submitProvincialExemptionCreate: vi.fn(),
  submitProvincialOfferCreate: vi.fn(),
}))

const mockedFetchProvincialApplicationOptions = vi.mocked(fetchProvincialApplicationOptions)
const mockedFetchProvincialExemptionOptions = vi.mocked(fetchProvincialExemptionOptions)
const mockedFetchProvincialOfferOptions = vi.mocked(fetchProvincialOfferOptions)
const mockedSubmitProvincialApplicationCreate = vi.mocked(submitProvincialApplicationCreate)
const mockedSubmitProvincialExemptionCreate = vi.mocked(submitProvincialExemptionCreate)
const mockedSubmitProvincialOfferCreate = vi.mocked(submitProvincialOfferCreate)

const successfulCreate = (createdId: string): CreateSubmissionResult => ({
  success: true,
  message: 'ok',
  createdId,
  errors: [],
  warnings: [],
})

describe('Create Page Core Flows', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mockedFetchProvincialApplicationOptions.mockResolvedValue({
      productTypes: [{ value: 'LOG', label: 'Logs' }],
      exemptionTypes: [{ value: 'SECTION_1', label: 'Section 1' }],
      applicationStatuses: [],
      regions: [{ value: '11', label: 'Cariboo' }],
    } as any)
    mockedFetchProvincialExemptionOptions.mockResolvedValue({
      exemptionTypes: [{ value: 'SECTION_1', label: 'Section 1' }],
      exemptionStatuses: [{ value: 'NEW', label: 'New' }],
      regions: [{ value: '11', label: 'Cariboo' }],
    } as any)
    mockedFetchProvincialOfferOptions.mockResolvedValue({
      regions: [{ value: '11', label: 'Cariboo' }],
    })
  })

  it('submits provincial application prefilled form and navigates to details', async () => {
    mockedSubmitProvincialApplicationCreate.mockResolvedValue(successfulCreate('901'))

    render(
      <MemoryRouter
        initialEntries={[
          '/provincial/application/create?applicationNumber=1001&packageNumber=PKG-55&ownerClientNumber=00011111&ownerClientLocationCode=00&ownerContactName=Owner%20Contact&applicantClientNumber=00022222&productTypeCode=LOG&exemptionType=SECTION_1&region=11&applicationDate=2026-01-09&applicationTermDays=30&receivedDate=2026-01-10&listingDate=2026-01-11&productLocation=Camp%201&applicationVolume=125.5&comments=Ready',
        ]}
      >
        <Routes>
          <Route
            path="/provincial/application/create"
            element={<ProvincialApplicationCreatePage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    const submitButton = await screen.findByRole('button', { name: 'Submit' })
    expect(submitButton).toBeEnabled()
    await userEvent.click(submitButton)

    expect(mockedSubmitProvincialApplicationCreate).toHaveBeenCalledWith({
      applicationNumber: '1001',
      packageNumber: 'PKG-55',
      ownerClientNumber: '00011111',
      ownerClientLocationCode: '00',
      ownerContactName: 'Owner Contact',
      applicantClientNumber: '00022222',
      productTypeCode: 'LOG',
      exemptionType: 'SECTION_1',
      region: '11',
      applicationDate: '2026-01-09',
      applicationTermDays: '30',
      receivedDate: '2026-01-10',
      listingDate: '2026-01-11',
      productLocation: 'Camp 1',
      applicationVolume: '125.5',
      comments: 'Ready',
    })
    expect(mockNavigate).toHaveBeenCalledWith('/provincial/application/901')
  })

  it('blocks provincial application submit when owner location code is too long', async () => {
    render(
      <MemoryRouter
        initialEntries={[
          '/provincial/application/create?applicationNumber=1001&packageNumber=PKG-55&ownerClientNumber=00011111&ownerClientLocationCode=12345678&ownerContactName=Owner%20Contact&applicantClientNumber=00022222&productTypeCode=LOG&exemptionType=SECTION_1&region=11&applicationDate=2026-01-09&applicationTermDays=30&receivedDate=2026-01-10&listingDate=2026-01-11&productLocation=Camp%201&applicationVolume=125.5&comments=Ready',
        ]}
      >
        <Routes>
          <Route
            path="/provincial/application/create"
            element={<ProvincialApplicationCreatePage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    const submitButton = await screen.findByRole('button', { name: 'Submit' })
    await userEvent.click(submitButton)

    expect(
      await screen.findByText('Owner client location code must be 2 characters or fewer.'),
    ).toBeInTheDocument()
    expect(mockedSubmitProvincialApplicationCreate).not.toHaveBeenCalled()
  })

  it('submits provincial exemption with linked applications and navigates to details', async () => {
    mockedSubmitProvincialExemptionCreate.mockResolvedValue(successfulCreate('EX-777'))

    render(
      <MemoryRouter
        initialEntries={[
          '/provincial/exemption/create?applications=321,654&ownerClientNumber=00033333&applicantClientNumber=00044444',
        ]}
      >
        <Routes>
          <Route path="/provincial/exemption/create" element={<ProvincialExemptionCreatePage />} />
        </Routes>
      </MemoryRouter>,
    )

    await screen.findByText('Create Provincial Exemption')
    await userEvent.type(screen.getByLabelText('Exemption Number (required)'), 'EX-777')
    await userEvent.selectOptions(screen.getByLabelText('Exemption Type (required)'), 'SECTION_1')
    await userEvent.type(screen.getByLabelText('Approval Date (YYYY-MM-DD)'), '2026-02-01')
    await userEvent.type(screen.getByLabelText('Expiry Date (YYYY-MM-DD)'), '2026-12-31')
    await userEvent.type(screen.getByLabelText(/Approved Volume/i), '500')

    const submitButton = screen.getByRole('button', { name: 'Submit' })
    expect(submitButton).toBeEnabled()
    await userEvent.click(submitButton)

    expect(mockedSubmitProvincialExemptionCreate).toHaveBeenCalledWith({
      exemptionNumber: 'EX-777',
      applicationNumber: '321',
      linkedApplicationNumbers: ['321', '654'],
      exemptionTypeCode: 'SECTION_1',
      exemptionStatusCode: '',
      ownerClientNumber: '00033333',
      applicantClientNumber: '00044444',
      approvalDate: '2026-02-01',
      expiryDate: '2026-12-31',
      approvedVolume: '500',
      otherConditions: 'Linked applications: 321, 654',
    })
    expect(mockNavigate).toHaveBeenCalledWith('/provincial/exemption/EX-777')
  })

  it('submits provincial offer form and navigates to details', async () => {
    mockedSubmitProvincialOfferCreate.mockResolvedValue(successfulCreate('8080'))

    render(
      <MemoryRouter
        initialEntries={[
          '/provincial/offers/create?applicationNumber=2001&packageNumber=PKG-9&offeringClientNumber=00099999&region=11',
        ]}
      >
        <Routes>
          <Route path="/provincial/offers/create" element={<ProvincialOfferCreatePage />} />
        </Routes>
      </MemoryRouter>,
    )

    await screen.findByText('Create Provincial Offer')
    await userEvent.type(screen.getByLabelText('Offer Number (required)'), '8080')
    await userEvent.type(screen.getByLabelText('Company Name (required)'), 'Example Lumber')
    await userEvent.type(screen.getByLabelText('Contact Name (required)'), 'Alex Example')
    await userEvent.type(screen.getByLabelText('Offer Amount (required)'), '25000')
    await userEvent.type(screen.getByLabelText('Offer Date (YYYY-MM-DD) (required)'), '2026-03-10')
    await userEvent.type(screen.getByLabelText('Withdrawal Date (YYYY-MM-DD)'), '2026-03-20')
    await userEvent.type(
      screen.getByLabelText('Withdraw Reason (required when withdrawn)'),
      'Withdrawn by buyer',
    )
    await userEvent.type(screen.getByLabelText('Pickup Location (required)'), 'Yard A')
    await userEvent.type(screen.getByLabelText('Offer Conditions / Remarks'), 'No partial loads')

    const submitButton = screen.getByRole('button', { name: 'Submit' })
    expect(submitButton).toBeEnabled()
    await userEvent.click(submitButton)

    await waitFor(() => {
      expect(mockedSubmitProvincialOfferCreate).toHaveBeenCalledWith({
        offerNumber: '8080',
        applicationNumber: '2001',
        packageNumber: 'PKG-9',
        offeringClientNumber: '00099999',
        companyName: 'Example Lumber',
        contactName: 'Alex Example',
        region: '11',
        purchaseOfferAmount: '25000',
        purchaseOfferDate: '2026-03-10',
        offerEndDate: '2026-03-20',
        withdrawReason: 'Withdrawn by buyer',
        pickupLocation: 'Yard A',
        offerCondition: 'No partial loads',
      })
    })
    expect(mockNavigate).toHaveBeenCalledWith('/provincial/offers/8080')
  })
})
