import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ProvincialOfferCreatePage from '@/pages/ProvincialOfferCreate'
import { useAuth } from '@/context/auth/useAuth'
import {
  submitProvincialOfferCreate,
  type OfferSubmissionResult,
} from '@/service/create-submit-service'
import {
  fetchOfferApplicationDetails,
  fetchOfferApplicationVolume,
  fetchOfferClientData,
  fetchOfferPackageList,
  fetchOfferPackageVolume,
  validateOfferApplication,
} from '@/service/provincial-offer-create-service'
import { createTestAuthContext, createTestCapabilities } from '@/test-utils/auth'
import { formatBusinessIsoDate } from '@/utils/date'

const mockNavigate = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...(actual as object),
    useNavigate: () => mockNavigate,
  }
})

vi.mock('@/service/create-submit-service', () => ({
  submitProvincialOfferCreate: vi.fn(),
}))

vi.mock('@/service/provincial-offer-create-service', () => ({
  fetchOfferApplicationDetails: vi.fn(),
  fetchOfferApplicationVolume: vi.fn(),
  fetchOfferClientData: vi.fn(),
  fetchOfferPackageList: vi.fn(),
  fetchOfferPackageVolume: vi.fn(),
  validateOfferApplication: vi.fn(),
}))

vi.mock('@/context/auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/service/offer-scale-detail-service', () => ({
  fetchOfferScaleDetails: vi.fn(),
}))

Element.prototype.scrollIntoView = vi.fn()

const mockedUseAuth = vi.mocked(useAuth)
const mockedSubmit = vi.mocked(submitProvincialOfferCreate)
const mockedValidate = vi.mocked(validateOfferApplication)
const mockedPackageList = vi.mocked(fetchOfferPackageList)

const approverAuth = () =>
  createTestAuthContext({
    capabilities: createTestCapabilities({
      principal: 'idir\\approver',
      roles: ['APPLICATION_APPROVER'],
    }),
  })

const submitterAuth = () =>
  createTestAuthContext({
    capabilities: createTestCapabilities({
      principal: 'bceid\\buyer',
      roles: ['PROVINCIAL_SUBMITTER_00077881'],
      forestClientNumber: '77881',
    }),
  })

const savedResult = (overrides: Partial<OfferSubmissionResult> = {}): OfferSubmissionResult => ({
  success: true,
  message: 'The purchase offer was saved successfully.',
  createdId: '455',
  errors: [],
  warnings: [],
  emailRequired: true,
  applicantEmailFound: true,
  ...overrides,
})

const renderCreatePage = (query = '') =>
  render(
    <MemoryRouter initialEntries={[`/provincial/offers/create${query ? `?${query}` : ''}`]}>
      <Routes>
        <Route path="/provincial/offers/create" element={<ProvincialOfferCreatePage />} />
      </Routes>
    </MemoryRouter>,
  )

const applicationNumberInput = () => screen.getByRole('textbox', { name: /Application number/ })

const recordValue = (label: string) => {
  const term = screen.getByText(label, { selector: 'dt' })
  return term.nextElementSibling?.textContent ?? ''
}

describe('Create offer, application first', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseAuth.mockReturnValue(approverAuth())
    vi.mocked(fetchOfferApplicationDetails).mockResolvedValue({
      success: true,
      speciesGradeCode: 'HE/PL',
      advertisingDate: '2026-10-21',
      teacReviewDate: '2026-12-04',
      region: 'Coast',
    })
    vi.mocked(fetchOfferApplicationVolume).mockResolvedValue('525')
    vi.mocked(fetchOfferClientData).mockResolvedValue({
      clientNumber: '00077881',
      companyName: 'Example Lumber Ltd.',
    })
    mockedPackageList.mockResolvedValue(['T1020-1654-13'])
    vi.mocked(fetchOfferPackageVolume).mockResolvedValue('525')
    mockedValidate.mockResolvedValue({ isValid: true, errors: [] })
    mockedSubmit.mockResolvedValue(savedResult())
  })

  it('opens with only the application number and its helper', () => {
    renderCreatePage()

    expect(screen.getByRole('heading', { name: 'Create new offer' })).toBeInTheDocument()
    expect(
      screen.getByText('Make an offer to buy timber advertised on the Advertising List.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Once the application is found, you can fill in your offer.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Application details' })).toBeInTheDocument()
    expect(screen.queryByText('Package number')).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Offering company details' })).toBeNull()
    expect(screen.queryByRole('group', { name: 'Offer details' })).toBeNull()
    expect(screen.queryByRole('group', { name: 'Approval' })).toBeNull()
    expect(screen.queryByRole('group', { name: 'Offer withdrawals' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Save offer' })).toBeEnabled()
  })

  it('checks the application, then shows the offer and announces it without moving focus', async () => {
    let resolveValidation: (value: { isValid: boolean; errors: string[] }) => void = () => {}
    mockedValidate.mockReturnValue(
      new Promise((resolve) => {
        resolveValidation = resolve
      }),
    )
    const user = userEvent.setup()
    renderCreatePage()

    await user.type(applicationNumberInput(), '46989')
    expect(await screen.findByText('Checking application…')).toBeInTheDocument()
    resolveValidation({ isValid: true, errors: [] })

    expect(await screen.findByRole('group', { name: 'Offer details' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Offering company details' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Approval' })).toBeInTheDocument()
    expect(
      screen.getByText('Application 46989 found. Enter the offer details.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Checking application…')).not.toBeInTheDocument()
    expect(applicationNumberInput()).toHaveFocus()
  })

  it('shows why an application cannot take offers on its field and nothing else', async () => {
    mockedValidate.mockResolvedValue({
      isValid: false,
      errors: ['Application 45000 is no longer accepting offers.'],
    })
    const user = userEvent.setup()
    renderCreatePage()

    await user.type(applicationNumberInput(), '45000')

    expect(
      await screen.findByText('Application 45000 is no longer accepting offers'),
    ).toBeInTheDocument()
    expect(applicationNumberInput()).toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByRole('group', { name: 'Offer details' })).toBeNull()
  })

  it('requires an application number on Save and focuses it', async () => {
    const user = userEvent.setup()
    renderCreatePage()

    await user.click(screen.getByRole('button', { name: 'Save offer' }))

    expect(await screen.findByText('Application number is required')).toBeInTheDocument()
    expect(screen.getByText('Offer not saved.')).toBeInTheDocument()
    expect(
      screen.getByText('Some fields have errors. Correct them and save again.'),
    ).toBeInTheDocument()
    await waitFor(() => expect(applicationNumberInput()).toHaveFocus())
    expect(screen.queryByRole('group', { name: 'Offer details' })).toBeNull()
    expect(mockedSubmit).not.toHaveBeenCalled()
  })

  it('shows the offer without errors once found after a save without an application', async () => {
    const user = userEvent.setup()
    renderCreatePage()

    await user.click(screen.getByRole('button', { name: 'Save offer' }))
    expect(await screen.findByText('Application number is required')).toBeInTheDocument()
    await user.type(applicationNumberInput(), '46989')

    expect(await screen.findByRole('group', { name: 'Offer details' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /Contact name/ })).not.toHaveAttribute(
      'aria-invalid',
      'true',
    )
    expect(screen.queryByText('Contact name is required')).toBeNull()
    expect(screen.queryByText('Application number is required')).toBeNull()
  })

  it('keeps the offer and its typed values when the application number becomes invalid', async () => {
    const user = userEvent.setup()
    renderCreatePage('applicationNumber=46989')

    const pickupLocation = await screen.findByRole('textbox', { name: /Pickup location/ })
    await user.type(pickupLocation, 'Menzies Bay')
    mockedValidate.mockResolvedValue({
      isValid: false,
      errors: ['Application 46988 does not exist.'],
    })
    await user.clear(applicationNumberInput())
    await user.type(applicationNumberInput(), '46988')

    expect(await screen.findByText('Application 46988 does not exist')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Offer details' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /Pickup location/ })).toHaveValue('Menzies Bay')
    expect(recordValue('Species/grade')).toContain('Not provided')

    await user.click(screen.getByRole('button', { name: 'Save offer' }))
    expect(await screen.findByText('Offer not saved.')).toBeInTheDocument()
    expect(screen.queryByText('Contact name is required')).toBeNull()
    expect(screen.queryByText('Offer amount is required')).toBeNull()
    await waitFor(() => expect(applicationNumberInput()).toHaveFocus())
    expect(mockedSubmit).not.toHaveBeenCalled()
  })

  it('shows the values filled in from the application as text, with dates as YYYY-MM-DD', async () => {
    renderCreatePage('applicationNumber=46989')

    await screen.findByRole('group', { name: 'Offer details' })
    await waitFor(() => expect(recordValue('Application/package volume (m³)')).toBe('525.0'))
    expect(recordValue('Species/grade')).toBe('HE/PL')
    expect(recordValue('List date')).toBe('2026-10-21')
    expect(recordValue('Offer received date')).toBe(formatBusinessIsoDate())
    expect(screen.queryByText('Listing date')).not.toBeInTheDocument()
    expect(screen.queryByText('Offer in effect until')).not.toBeInTheDocument()
    expect(screen.queryByText('Set automatically when the offer is saved.')).toBeNull()
    expect(screen.queryByText('Author')).not.toBeInTheDocument()
  })

  it('selects the first package and offers its scale detail', async () => {
    renderCreatePage('applicationNumber=46989')

    expect(await screen.findByRole('combobox', { name: /Package number/ })).toHaveValue(
      'T1020-1654-13',
    )
    expect(screen.getByRole('button', { name: 'See scale detail' })).toBeInTheDocument()
  })

  it('says an application without packages has no packages and offers no scale detail', async () => {
    mockedPackageList.mockResolvedValue([])
    renderCreatePage('applicationNumber=46989')

    await screen.findByRole('group', { name: 'Offer details' })
    await waitFor(() => expect(recordValue('Package number')).toBe('No packages'))
    expect(recordValue('Application/package volume (m³)')).toBe('525.0')
    expect(screen.queryByRole('button', { name: 'See scale detail' })).toBeNull()
  })

  it('preselects No, Yes and No for the approval indicators', async () => {
    renderCreatePage('applicationNumber=46989')

    const approval = await screen.findByRole('group', { name: 'Approval' })
    expect(
      within(within(approval).getByRole('group', { name: 'Fair market value' })).getByRole(
        'radio',
        { name: 'No' },
      ),
    ).toBeChecked()
    expect(
      within(within(approval).getByRole('group', { name: 'Valid offer' })).getByRole('radio', {
        name: 'Yes',
      }),
    ).toBeChecked()
    expect(
      within(within(approval).getByRole('group', { name: 'Offer approved' })).getByRole('radio', {
        name: 'No',
      }),
    ).toBeChecked()
    expect(screen.queryByRole('combobox', { name: 'Fair market value' })).toBeNull()
  })

  it('limits each text area to 250 characters with a counter', async () => {
    renderCreatePage('applicationNumber=46989')

    for (const name of [/Pickup location/, /Offer conditions\/remarks/, /Offer remarks/]) {
      expect(await screen.findByRole('textbox', { name })).toHaveAttribute('maxlength', '250')
    }
    expect(screen.getAllByText('0/250')).toHaveLength(3)
  })

  it('names each required field in its error', async () => {
    const user = userEvent.setup()
    renderCreatePage('applicationNumber=46989')

    await screen.findByRole('group', { name: 'Offer details' })
    await waitFor(() => expect(recordValue('Application/package volume (m³)')).toBe('525.0'))
    await user.click(screen.getByRole('button', { name: 'Save offer' }))

    expect(await screen.findByText('Company is required')).toBeInTheDocument()
    expect(screen.getByText('Contact name is required')).toBeInTheDocument()
    expect(screen.getByText('Offer amount is required')).toBeInTheDocument()
    expect(screen.getByText('Pickup location is required')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('textbox', { name: /Company/ })).toHaveFocus())
  })

  it('shows the client their company as text and the approval defaults as text', async () => {
    mockedUseAuth.mockReturnValue(submitterAuth())
    renderCreatePage('applicationNumber=46989')

    await screen.findByRole('group', { name: 'Offer details' })
    await waitFor(() => expect(recordValue('Company')).toBe('Example Lumber Ltd.'))
    expect(screen.queryByRole('textbox', { name: /Company/ })).toBeNull()
    expect(screen.queryByText('Loaded from your authenticated forest client.')).toBeNull()
    expect(recordValue('Fair market value')).toBe('No')
    expect(recordValue('Valid offer')).toBe('Yes')
    expect(recordValue('Offer approved')).toBe('No')
    expect(screen.queryByText('TEAC review date')).toBeNull()
    expect(screen.queryByText('Offer remarks')).toBeNull()
  })

  it("says why a client's company stops the save", async () => {
    mockedUseAuth.mockReturnValue(submitterAuth())
    vi.mocked(fetchOfferClientData).mockResolvedValue({
      clientNumber: '00077881',
      companyName: 'Société Forestière',
    })
    const user = userEvent.setup()
    renderCreatePage(
      'applicationNumber=46989&contactName=Buyer&purchaseOfferAmount=10&pickupLocation=Yard',
    )

    await screen.findByRole('group', { name: 'Offer details' })
    await waitFor(() => expect(recordValue('Company')).toBe('Société Forestière'))
    await waitFor(() => expect(recordValue('Application/package volume (m³)')).toBe('525.0'))
    await user.click(screen.getByRole('button', { name: 'Save offer' }))

    expect(await screen.findByText('Offer not saved.')).toBeInTheDocument()
    expect(screen.getByText(/^Company contains unsupported characters/)).toBeInTheDocument()
    expect(mockedSubmit).not.toHaveBeenCalled()
  })

  it('disables Cancel and Save offer while the offer saves', async () => {
    mockedSubmit.mockReturnValue(new Promise(() => {}))
    const user = userEvent.setup()
    renderCreatePage(
      'applicationNumber=46989&companyName=Example&contactName=Buyer&purchaseOfferAmount=10&pickupLocation=Yard',
    )

    await screen.findByRole('group', { name: 'Offer details' })
    await waitFor(() => expect(recordValue('Application/package volume (m³)')).toBe('525.0'))
    await user.click(screen.getByRole('button', { name: 'Save offer' }))

    expect(await screen.findByRole('button', { name: 'Saving…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  })

  it('opens the saved offer with a notice that names no email address', async () => {
    mockedSubmit.mockResolvedValue(savedResult({ applicantEmailFound: false }))
    const user = userEvent.setup()
    renderCreatePage(
      'applicationNumber=46989&companyName=Example&contactName=Buyer&purchaseOfferAmount=10&pickupLocation=Yard',
    )

    await screen.findByRole('group', { name: 'Offer details' })
    await waitFor(() => expect(recordValue('Application/package volume (m³)')).toBe('525.0'))
    await user.click(screen.getByRole('button', { name: 'Save offer' }))

    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith('/provincial/offers/455', {
        state: {
          offerCreationNotice: {
            kind: 'warning',
            title: 'Offer saved.',
            message:
              'No email was sent. Let the applicant and the regional office know about your offer another way.',
          },
        },
      }),
    )
  })
})
