import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ProvincialApplicationCreatePage from '@/pages/ProvincialApplicationCreate'
import ProvincialExemptionCreatePage from '@/pages/ProvincialExemptionCreate'
import ProvincialOfferCreatePage from '@/pages/ProvincialOfferCreate'
import {
  fetchProvincialExemptionCreatePreview,
  submitProvincialApplicationCreate,
  submitProvincialExemptionCreate,
  submitProvincialOfferCreate,
  type CreateSubmissionResult,
} from '@/service/create-submit-service'
import {
  fetchProvincialApplicationOptions,
  fetchProvincialExemptionOptions,
} from '@/service/search-options-service'
import {
  fetchApplicationClientData,
  fetchApplicationClientContacts,
  fetchApplicationClientLocations,
} from '@/service/application-client-lookup-service'
import {
  fetchApplicationEndUsesForSpeciesRegion,
  fetchApplicationRemainingSpecies,
} from '@/service/provincial-application-items-service'
import {
  fetchOfferApplicationDetails,
  fetchOfferApplicationVolume,
  fetchOfferClientData,
  fetchOfferPackageList,
  fetchOfferPackageVolume,
  validateOfferApplication,
} from '@/service/provincial-offer-create-service'
import { searchProvincialApplicationNumberOptions } from '@/service/provincial-application-search-service'
import { formatBusinessIsoDate } from '@/utils/date'
import { useAuth } from '@/context/auth/useAuth'
import { createTestAuthContext, createTestCapabilities } from '@/test-utils/auth'

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
}))

vi.mock('@/service/create-submit-service', () => ({
  fetchProvincialExemptionCreatePreview: vi.fn(),
  submitProvincialApplicationCreate: vi.fn(),
  submitProvincialExemptionCreate: vi.fn(),
  submitProvincialOfferCreate: vi.fn(),
}))

vi.mock('@/service/application-client-lookup-service', () => ({
  fetchApplicationClientData: vi.fn(),
  fetchApplicationClientContacts: vi.fn(),
  fetchApplicationClientLocations: vi.fn(),
}))

vi.mock('@/service/provincial-application-items-service', () => ({
  fetchApplicationEndUsesForSpeciesRegion: vi.fn(),
  fetchApplicationRemainingSpecies: vi.fn(),
}))

vi.mock('@/service/provincial-offer-create-service', () => ({
  fetchOfferApplicationDetails: vi.fn(),
  fetchOfferApplicationVolume: vi.fn(),
  fetchOfferClientData: vi.fn(),
  fetchOfferPackageList: vi.fn(),
  fetchOfferPackageVolume: vi.fn(),
  validateOfferApplication: vi.fn(),
}))

vi.mock('@/service/provincial-application-search-service', () => ({
  searchProvincialApplicationNumberOptions: vi.fn(),
}))

vi.mock('@/context/auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

Element.prototype.scrollIntoView = vi.fn()

const mockedFetchProvincialApplicationOptions = vi.mocked(fetchProvincialApplicationOptions)
const mockedFetchProvincialExemptionOptions = vi.mocked(fetchProvincialExemptionOptions)
const mockedSubmitProvincialApplicationCreate = vi.mocked(submitProvincialApplicationCreate)
const mockedFetchProvincialExemptionCreatePreview = vi.mocked(fetchProvincialExemptionCreatePreview)
const mockedSubmitProvincialExemptionCreate = vi.mocked(submitProvincialExemptionCreate)
const mockedSubmitProvincialOfferCreate = vi.mocked(submitProvincialOfferCreate)
const mockedFetchApplicationClientData = vi.mocked(fetchApplicationClientData)
const mockedFetchApplicationClientContacts = vi.mocked(fetchApplicationClientContacts)
const mockedFetchApplicationClientLocations = vi.mocked(fetchApplicationClientLocations)
const mockedFetchApplicationRemainingSpecies = vi.mocked(fetchApplicationRemainingSpecies)
const mockedFetchApplicationEndUsesForSpeciesRegion = vi.mocked(
  fetchApplicationEndUsesForSpeciesRegion,
)
const mockedFetchOfferApplicationDetails = vi.mocked(fetchOfferApplicationDetails)
const mockedFetchOfferApplicationVolume = vi.mocked(fetchOfferApplicationVolume)
const mockedFetchOfferClientData = vi.mocked(fetchOfferClientData)
const mockedFetchOfferPackageList = vi.mocked(fetchOfferPackageList)
const mockedFetchOfferPackageVolume = vi.mocked(fetchOfferPackageVolume)
const mockedValidateOfferApplication = vi.mocked(validateOfferApplication)
const mockedSearchProvincialApplicationNumberOptions = vi.mocked(
  searchProvincialApplicationNumberOptions,
)
const mockedUseAuth = vi.mocked(useAuth)

const successfulCreate = (createdId: string): CreateSubmissionResult => ({
  success: true,
  message: 'ok',
  createdId,
  errors: [],
  warnings: [],
})

const chooseComboBoxOption = async (combobox: HTMLElement, optionName: string) => {
  await userEvent.click(combobox)
  await userEvent.clear(combobox)
  await userEvent.type(combobox, optionName)
  const options = await screen.findAllByRole('option', { name: optionName })
  await userEvent.click(options.find((option) => option.tagName === 'LI') ?? options[0])
}

const clearComboBox = async (combobox: HTMLElement) => {
  const clearButton = combobox
    .closest('.cds--combo-box')
    ?.querySelector<HTMLButtonElement>(
      'button[aria-label="Clear selected item"], button[title="Clear selected item"]',
    )
  expect(clearButton).toBeTruthy()
  await userEvent.click(clearButton as HTMLButtonElement)
}

const selectApplicationCreateTab = async (name: string) => {
  await userEvent.click(await screen.findByRole('tab', { name }))
}

describe('Create Page Core Flows', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({ principal: 'idir\\admin' }),
      }),
    )
    mockedFetchProvincialApplicationOptions.mockResolvedValue({
      productTypes: [
        { value: 'LOG', label: 'Logs' },
        { value: 'H', label: 'Harvested Timber' },
        { value: 'S', label: 'Standing Timber' },
        { value: 'T', label: 'Timber' },
      ],
      exemptionTypes: [{ value: 'SECTION_1', label: 'Section 1' }],
      exemptionReasons: [{ value: 'U', label: 'Unadvertised' }],
      applicationStatuses: [],
      growthTypes: [{ value: 'O', label: 'Old Growth' }],
      regions: [{ value: '11', label: 'Cariboo' }],
      currentSchedules: [{ value: '987', label: '2026-01-11' }],
    } satisfies Awaited<ReturnType<typeof fetchProvincialApplicationOptions>>)
    mockedFetchProvincialExemptionOptions.mockResolvedValue({
      exemptionTypes: [
        { value: 'M', label: 'Ministerial' },
        { value: 'O', label: 'Order in Council' },
        { value: 'B', label: 'Blanket OIC' },
        { value: 'SECTION_1', label: 'Section 1' },
      ],
      exemptionStatuses: [
        { value: 'NEW', label: 'New' },
        { value: 'ACT', label: 'Active' },
      ],
      regions: [
        { value: '1903', label: 'Cariboo Natural Resource Region' },
        { value: '1908', label: 'Skeena Natural Resource Region' },
      ],
    } satisfies Awaited<ReturnType<typeof fetchProvincialExemptionOptions>>)
    mockedFetchProvincialExemptionCreatePreview.mockImplementation(async (applicationNumbers) => ({
      exemptionTypeCode: 'M',
      exemptionStatusCode: 'NEW',
      approvedVolume: '250.5',
      expiryDate: '2026-06-30',
      applicationNumbers,
    }))
    mockedFetchApplicationClientLocations.mockResolvedValue([
      { locationCode: '00', locationName: '00', selected: false },
      { locationCode: '01', locationName: '01 - MAIN LOCATION', selected: false },
    ])
    mockedFetchApplicationClientContacts.mockImplementation(
      async (_clientNumber, _clientLocationCode, applicantType) =>
        applicantType === 'agent'
          ? [
              { contactName: 'Agent Contact', contactId: '-1' },
              { contactName: 'Agent Alternate Contact', contactId: '22' },
            ]
          : [
              { contactName: 'Owner Contact', contactId: '-1' },
              { contactName: 'Owner Alternate Contact', contactId: '11' },
            ],
    )
    mockedFetchApplicationClientData.mockImplementation(async (clientNumber) => {
      const confirmedClientNumber = /^\d{1,8}$/.test(clientNumber)
        ? clientNumber.padStart(8, '0')
        : clientNumber
      const isAgent = ['00002176', '00033333'].includes(confirmedClientNumber)
      return {
        clientNumber: confirmedClientNumber,
        companyName: isAgent ? 'Agent Export Services' : 'Owner Forestry Ltd.',
        address: isAgent ? '456 Export Road' : '123 Timber Road',
        city: isAgent ? 'Nanaimo' : 'Victoria',
        province: 'BC',
        postalCode: isAgent ? 'V9R 1A1' : 'V8V 1A1',
        country: 'Canada',
        phone: isAgent ? '250-555-0200' : '250-555-0100',
        fax: isAgent ? '250-555-0201' : '250-555-0101',
        email: isAgent ? 'agent@example.test' : 'owner@example.test',
        notfound: '',
      }
    })
    mockedFetchApplicationRemainingSpecies.mockResolvedValue([
      { code: 'HE', description: 'Hemlock' },
      { code: 'BA', description: 'Balsam' },
    ])
    mockedFetchApplicationEndUsesForSpeciesRegion.mockResolvedValue([
      { code: 'SA', description: 'Sawlog' },
    ])
    mockedFetchOfferApplicationDetails.mockResolvedValue({
      success: true,
      speciesGradeCode: 'H/SA',
      advertisingDate: '03/01/2026',
      teacReviewDate: '',
      region: 'Cariboo Natural Resource Region',
    })
    mockedFetchOfferApplicationVolume.mockResolvedValue('100.0')
    mockedFetchOfferClientData.mockResolvedValue({
      clientNumber: '00077881',
      companyName: 'Authoritative Buyer Ltd.',
    })
    mockedFetchOfferPackageList.mockResolvedValue(['PKG-9'])
    mockedFetchOfferPackageVolume.mockResolvedValue('95.0')
    mockedValidateOfferApplication.mockResolvedValue({ isValid: true, errors: [] })
    mockedSearchProvincialApplicationNumberOptions.mockResolvedValue([
      {
        value: '321',
        label: '321 - Approved - Owner 00033333 - Region RKB',
        status: 'Approved',
        applicantClientNumber: '00044444',
        ownerClientNumber: '00033333',
        region: 'RKB',
        listingDate: '2026-01-10',
        exemptionNumber: '',
      },
      {
        value: '2001',
        label: '2001 - Approved - Owner 00099999 - Region Cariboo',
        status: 'Approved',
        applicantClientNumber: '',
        ownerClientNumber: '00099999',
        region: 'Cariboo',
        listingDate: '2026-03-01',
        exemptionNumber: '',
      },
    ])
  })

  it('submits provincial application prefilled form and navigates to details', async () => {
    mockedSubmitProvincialApplicationCreate.mockResolvedValue(successfulCreate('901'))

    render(
      <MemoryRouter
        initialEntries={[
          '/provincial/application/create?ownerClientNumber=11111&ownerClientLocationCode=00&ownerContactName=Owner%20Contact&productTypeCode=LOG&exemptionReason=U&region=11&applicationDate=2026-01-09&applicationTermDays=30&receivedDate=2026-01-10&listingDate=2026-01-11&productLocation=Camp%201&applicationVolume=125.5&averageLogVolume=1.2&speciesCodes=HE&endUseCode=SA&comments=Ready',
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

    expect(
      screen.getByRole('heading', { level: 1, name: 'Create provincial application' }),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('region', { name: 'Owner' })).toBeInTheDocument()
    const applicationFormActions = screen.getByRole('group', {
      name: 'Application form actions',
    })
    expect(
      within(applicationFormActions)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Cancel', 'Save'])
    expect(within(applicationFormActions).getByRole('button', { name: 'Cancel' })).toHaveAttribute(
      'type',
      'button',
    )
    expect(within(applicationFormActions).getByRole('button', { name: 'Save' })).toHaveAttribute(
      'type',
      'button',
    )
    expect(screen.queryByRole('group', { name: 'New application state' })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: /application number/i })).not.toBeInTheDocument()
    for (const tabName of [
      'Owner',
      'Application',
      'Items',
      'Documents',
      'Remarks',
      'Offers',
      'Review',
    ]) {
      expect(screen.getByRole('tab', { name: tabName })).toBeInTheDocument()
    }
    expect(screen.queryByRole('tab', { name: 'Agent' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Permits' })).not.toBeInTheDocument()

    await selectApplicationCreateTab('Review')
    expect(screen.getByRole('textbox', { name: 'Application status' })).toHaveValue('New')
    expect(screen.getByRole('textbox', { name: 'Application status' })).toHaveAttribute('readonly')
    expect(screen.getByRole('textbox', { name: 'Remarks' })).toBeDisabled()
    expect(
      screen.getByText(
        'Save the application before changing its review status or adding review remarks.',
      ),
    ).toBeInTheDocument()

    await selectApplicationCreateTab('Application')
    const applicationSection = screen.getByRole('region', { name: 'Application' })
    expect(
      Array.from(applicationSection.querySelectorAll('input')).map((input) => input.id),
    ).toEqual([
      'region',
      'productTypeCode',
      'exemptionType',
      'applicationDate',
      'receivedDate',
      'exportScheduleId',
      'applicationTermDays',
    ])

    await selectApplicationCreateTab('Documents')
    expect(screen.getByRole('button', { name: 'Add document' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Add document' })).toHaveAttribute(
      'title',
      'Save the application before uploading documents.',
    )
    expect(screen.queryByRole('button', { name: 'Submit' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save Draft' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Back to Search' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()

    const submitButton = await screen.findByRole('button', { name: 'Save' })
    await waitFor(() => expect(submitButton).toBeEnabled())
    await userEvent.click(submitButton)
    expect(screen.queryByRole('dialog', { name: 'Confirm application accuracy' })).toBeNull()

    expect(mockedFetchApplicationClientData).toHaveBeenCalledWith('11111', '00')
    expect(mockedFetchApplicationClientLocations).toHaveBeenCalledWith('00011111', 'owner')
    expect(mockedSubmitProvincialApplicationCreate).toHaveBeenCalledWith({
      ownerClientNumber: '00011111',
      ownerClientLocationCode: '00',
      ownerContactName: 'Owner Contact',
      agentClientNumber: '',
      agentClientLocationCode: '',
      agentContactName: '',
      applicantTypeCode: 'O',
      productTypeCode: 'LOG',
      ageClass: '',
      exemptionType: 'U',
      region: '11',
      applicationDate: '2026-01-09',
      applicationTermDays: '30',
      receivedDate: '2026-01-10',
      exportScheduleId: '987',
      listingDate: '2026-01-11',
      productLocation: 'Camp 1',
      applicationVolume: '125.5',
      averageLogVolume: '1.2',
      speciesCodes: ['HE'],
      endUseCode: 'SA',
      comments: 'Ready',
    })
    expect(mockNavigate).toHaveBeenCalledWith('/provincial/application/901', {
      state: {
        applicationCreationNotice: {
          applicationNumber: '901',
        },
      },
    })
  }, 20_000)

  it('leads with package creation while requiring the application to be saved first', async () => {
    render(
      <MemoryRouter
        initialEntries={[
          '/provincial/application/create?ownerClientNumber=00011111&ownerClientLocationCode=00&ownerContactName=Owner%20Contact&productTypeCode=H&ageClass=O&exemptionReason=U&region=11&applicationDate=2026-01-09&applicationTermDays=30&receivedDate=2026-01-10&listingDate=2026-01-11&productLocation=Camp%201&applicationVolume=125.5&averageLogVolume=1.2&speciesCodes=HE&endUseCode=SA',
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

    await selectApplicationCreateTab('Items')
    const createPackageHeading = await screen.findByRole('heading', {
      name: 'Create Package',
    })
    const createPackageCard = createPackageHeading.closest('section')
    expect(createPackageCard).toHaveClass('application-items-card')
    expect(createPackageCard).toHaveClass('application-items-section--create-package')
    expect(createPackageCard?.parentElement).toHaveClass('application-items-grid')
    expect(screen.queryByRole('heading', { name: 'Package Details' })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Selected Package' })).not.toBeInTheDocument()
    expect(
      screen.getByText(
        'Save the application before creating a package or adding Summary of Scale entries.',
      ),
    ).toBeInTheDocument()

    const createPackageButton = screen.getByRole('button', { name: 'Create Package' })
    await userEvent.click(createPackageButton)

    const dialog = screen.getByRole('dialog', { name: 'Application not saved' })
    expect(
      within(dialog).getByText('Please save this application before adding packages.'),
    ).toBeInTheDocument()
    expect(dialog.querySelector('.cds--modal-footer')).not.toBeInTheDocument()
    const acknowledgeButton = within(dialog).getByRole('button', { name: 'OK' })
    expect(acknowledgeButton).toHaveClass('cds--btn--primary')
    expect(acknowledgeButton.parentElement).toHaveClass(
      'application-create-package-save-prompt__actions',
    )
    expect(mockedSubmitProvincialApplicationCreate).not.toHaveBeenCalled()
    const modalRoot = dialog.closest('.cds--modal')
    expect(modalRoot).not.toBeNull()

    await userEvent.click(acknowledgeButton)

    await waitFor(() => {
      expect(modalRoot).not.toHaveClass('is-visible')
      expect(createPackageButton).toHaveFocus()
    })
  })

  it('removes selected application species independently', async () => {
    render(
      <MemoryRouter
        initialEntries={[
          '/provincial/application/create?productTypeCode=H&ageClass=O&region=11&speciesCodes=HE%2CBA&endUseCode=SA',
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

    await selectApplicationCreateTab('Items')
    const speciesCandidate = await screen.findByRole('combobox', { name: 'Species list' })
    expect(speciesCandidate).not.toHaveAttribute('aria-required', 'true')
    const selectedSpeciesGroup = screen.getByRole('group', {
      name: 'Selected species',
    })
    expect(selectedSpeciesGroup).toHaveAccessibleDescription('At least one species is required.')
    const selectedSpecies = within(selectedSpeciesGroup).getByRole('list', {
      name: 'Selected species',
    })
    const removeHemlock = within(selectedSpecies).getByRole('button', {
      name: 'Remove HE from application',
    })
    expect(
      within(selectedSpecies).getByRole('button', { name: 'Remove BA from application' }),
    ).toBeInTheDocument()

    await userEvent.click(removeHemlock)

    expect(
      screen.queryByRole('button', { name: 'Remove HE from application' }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove BA from application' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Remove BA from application' }))

    expect(
      screen.queryByRole('button', { name: 'Remove BA from application' }),
    ).not.toBeInTheDocument()
    expect(
      await screen.findByText('At least one species is required.', {
        selector: '.legacy-search-error',
      }),
    ).toBeVisible()
    expect(selectedSpeciesGroup).toHaveAccessibleDescription('At least one species is required.')
    expect(mockedSubmitProvincialApplicationCreate).not.toHaveBeenCalled()
  }, 20_000)

  it('requires and resets application accuracy confirmation for a provincial submitter', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({
          principal: 'bceid\\submitter',
          roles: ['PROVINCIAL_SUBMITTER_00077881'],
          forestClientNumber: '00077881',
          orgUnitNo: '11',
        }),
      }),
    )
    mockedSubmitProvincialApplicationCreate.mockResolvedValue(successfulCreate('906'))

    render(
      <MemoryRouter
        initialEntries={[
          '/provincial/application/create?ownerContactName=Owner%20Contact&productTypeCode=LOG&exemptionReason=U&applicationDate=2026-01-09&applicationTermDays=30&receivedDate=2026-01-10&listingDate=2026-01-11&productLocation=Camp%201&applicationVolume=125.5&averageLogVolume=1.2&speciesCodes=HE&endUseCode=SA&comments=Ready',
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

    const saveButton = await screen.findByRole('button', { name: 'Save' })
    await waitFor(() => expect(saveButton).toBeEnabled())
    await userEvent.click(saveButton)

    const firstDialog = screen.getByRole('dialog', { name: 'Confirm application accuracy' })
    const firstAcknowledgement = within(firstDialog).getByRole('checkbox', { name: 'I Agree' })
    const firstConfirm = within(firstDialog).getByRole('button', { name: 'Save application' })
    expect(firstAcknowledgement).not.toBeChecked()
    expect(firstConfirm).toBeDisabled()
    await userEvent.click(firstConfirm)
    expect(mockedSubmitProvincialApplicationCreate).not.toHaveBeenCalled()

    await userEvent.click(firstAcknowledgement)
    expect(firstConfirm).toBeEnabled()
    await userEvent.click(within(firstDialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Confirm application accuracy' }),
      ).not.toBeInTheDocument(),
    )

    await userEvent.click(saveButton)
    const reopenedDialog = screen.getByRole('dialog', { name: 'Confirm application accuracy' })
    const reopenedAcknowledgement = within(reopenedDialog).getByRole('checkbox', {
      name: 'I Agree',
    })
    expect(reopenedAcknowledgement).not.toBeChecked()
    await userEvent.click(reopenedAcknowledgement)
    await userEvent.click(within(reopenedDialog).getByRole('button', { name: 'Save application' }))

    await waitFor(() => expect(mockedSubmitProvincialApplicationCreate).toHaveBeenCalledTimes(1))
    expect(mockNavigate).toHaveBeenCalledWith('/provincial/application/906', {
      state: {
        applicationCreationNotice: {
          applicationNumber: '906',
        },
      },
    })
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Confirm application accuracy' }),
      ).not.toBeInTheDocument(),
    )

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    const postSaveDialog = screen.getByRole('dialog', { name: 'Confirm application accuracy' })
    const postSaveAcknowledgement = within(postSaveDialog).getByRole('checkbox', {
      name: 'I Agree',
    })
    expect(postSaveAcknowledgement).not.toBeChecked()

    mockedSubmitProvincialApplicationCreate.mockResolvedValueOnce({
      success: false,
      message: '',
      createdId: undefined,
      errors: ['Application agent location does not exist.'],
      warnings: [],
    })
    await userEvent.click(postSaveAcknowledgement)
    await userEvent.click(within(postSaveDialog).getByRole('button', { name: 'Save application' }))

    expect(await screen.findByText('Save Failed')).toBeVisible()
    expect(screen.getByText('Application agent location does not exist.')).toBeVisible()
    expect(postSaveDialog).toBeVisible()
    expect(within(postSaveDialog).getByRole('button', { name: 'Save application' })).toBeEnabled()
  }, 20_000)

  it('uses one application term field and submits its day value directly', async () => {
    mockedSubmitProvincialApplicationCreate.mockResolvedValue(successfulCreate('904'))

    render(
      <MemoryRouter
        initialEntries={[
          '/provincial/application/create?ownerClientNumber=00011111&ownerClientLocationCode=00&ownerContactName=Owner%20Contact&productTypeCode=LOG&exemptionReason=U&region=11&applicationDate=2026-01-09&applicationTermDays=5&applicationTermMonths=2&applicationTermYears=1&receivedDate=2026-01-10&listingDate=2026-01-11&productLocation=Camp%201&applicationVolume=125.5&averageLogVolume=1.2&speciesCodes=HE&endUseCode=SA',
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

    await selectApplicationCreateTab('Application')
    expect(screen.getByRole('spinbutton', { name: 'Exemption term (days)' })).toHaveValue(5)
    expect(screen.queryByLabelText('Exemption term (months)')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Exemption term (years)')).not.toBeInTheDocument()

    const submitButton = await screen.findByRole('button', { name: 'Save' })
    await waitFor(() => expect(submitButton).toBeEnabled())
    await userEvent.click(submitButton)

    expect(mockedSubmitProvincialApplicationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationTermDays: '5',
      }),
    )
    const submittedForm = mockedSubmitProvincialApplicationCreate.mock.calls[0]?.[0]
    expect(submittedForm).not.toHaveProperty('applicationTermMonths')
    expect(submittedForm).not.toHaveProperty('applicationTermYears')
  })

  it('submits selected natural resource region org unit code from the region label', async () => {
    mockedSubmitProvincialApplicationCreate.mockResolvedValue(successfulCreate('905'))
    mockedFetchProvincialApplicationOptions.mockResolvedValueOnce({
      productTypes: [{ value: 'LOG', label: 'Logs' }],
      exemptionTypes: [{ value: 'SECTION_1', label: 'Section 1' }],
      exemptionReasons: [{ value: 'U', label: 'Unadvertised' }],
      applicationStatuses: [],
      growthTypes: [{ value: 'O', label: 'Old Growth' }],
      regions: [
        { value: '1903', label: 'Cariboo Natural Resource Region' },
        { value: '1910', label: 'West Coast Natural Resource Region' },
      ],
      currentSchedules: [{ value: '987', label: '2026-01-11' }],
    } satisfies Awaited<ReturnType<typeof fetchProvincialApplicationOptions>>)

    render(
      <MemoryRouter
        initialEntries={[
          '/provincial/application/create?ownerClientNumber=00011111&ownerClientLocationCode=00&ownerContactName=Owner%20Contact&productTypeCode=LOG&exemptionReason=U&region=1903&applicationDate=2026-01-09&applicationTermDays=30&receivedDate=2026-01-10&listingDate=2026-01-11&productLocation=Camp%201&applicationVolume=125.5&averageLogVolume=1.2&speciesCodes=HE&endUseCode=SA&comments=Ready',
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

    await selectApplicationCreateTab('Application')
    const regionComboBox = await screen.findByRole('combobox', { name: 'Region' })
    await waitFor(() => {
      expect(regionComboBox).toHaveValue('Cariboo Natural Resource Region')
    })

    await chooseComboBoxOption(regionComboBox, 'West Coast Natural Resource Region')
    await selectApplicationCreateTab('Items')
    await chooseComboBoxOption(
      screen.getByRole('combobox', { name: 'Species list' }),
      'HE - Hemlock',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Add species' }))
    expect(await screen.findByText('HE')).toBeInTheDocument()
    const submitButton = await screen.findByRole('button', { name: 'Save' })
    await waitFor(() => expect(submitButton).toBeEnabled())
    await userEvent.click(submitButton)

    expect(mockedSubmitProvincialApplicationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        region: '1910',
      }),
    )
  }, 20_000)

  it('submits provincial application with agent applicant fields', async () => {
    mockedSubmitProvincialApplicationCreate.mockResolvedValue(successfulCreate('902'))
    mockedFetchApplicationClientLocations.mockImplementation(
      async (_clientNumber, applicantType) =>
        applicantType === 'agent'
          ? [{ locationCode: '12', locationName: '12 - EXPORT BILLING', selected: false }]
          : [{ locationCode: '00', locationName: '00 - OWNER LOCATION', selected: false }],
    )

    render(
      <MemoryRouter
        initialEntries={[
          '/provincial/application/create?ownerClientNumber=11111&ownerClientLocationCode=00&ownerContactName=Owner%20Contact&ownerApplicantType=A&agentClientNumber=2176&agentClientLocationCode=12&agentContactName=Agent%20Contact&productTypeCode=LOG&exemptionReason=U&region=11&applicationDate=2026-01-09&applicationTermDays=30&receivedDate=2026-01-10&listingDate=2026-01-11&productLocation=Camp%201&applicationVolume=125.5&averageLogVolume=1.2&speciesCodes=HE&endUseCode=SA&comments=Ready',
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

    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Owner',
      'Agent',
      'Application',
      'Items',
      'Documents',
      'Remarks',
      'Offers',
      'Review',
    ])
    await selectApplicationCreateTab('Agent')
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Agent number' })).toHaveValue('00002176'),
    )
    expect(screen.getByRole('combobox', { name: 'Contact location' })).toBeInTheDocument()

    const submitButton = await screen.findByRole('button', { name: 'Save' })
    await waitFor(() => expect(submitButton).toBeEnabled())
    await userEvent.click(submitButton)

    expect(mockedFetchApplicationClientLocations).toHaveBeenCalledWith('00011111', 'owner')
    expect(mockedFetchApplicationClientLocations).toHaveBeenCalledWith('00002176', 'agent')
    expect(mockedFetchApplicationClientData).toHaveBeenCalledWith('2176', '12')
    expect(mockedSubmitProvincialApplicationCreate).toHaveBeenCalledWith({
      ownerClientNumber: '00011111',
      ownerClientLocationCode: '00',
      ownerContactName: 'Owner Contact',
      agentClientNumber: '00002176',
      agentClientLocationCode: '12',
      agentContactName: 'Agent Contact',
      applicantTypeCode: 'A',
      productTypeCode: 'LOG',
      ageClass: '',
      exemptionType: 'U',
      region: '11',
      applicationDate: '2026-01-09',
      applicationTermDays: '30',
      receivedDate: '2026-01-10',
      exportScheduleId: '987',
      listingDate: '2026-01-11',
      productLocation: 'Camp 1',
      applicationVolume: '125.5',
      averageLogVolume: '1.2',
      speciesCodes: ['HE'],
      endUseCode: 'SA',
      comments: 'Ready',
    })
    expect(mockNavigate).toHaveBeenCalledWith('/provincial/application/902', {
      state: {
        applicationCreationNotice: {
          applicationNumber: '902',
        },
      },
    })
  })

  it('shows selected owner and agent client details as read-only information', async () => {
    render(
      <MemoryRouter
        initialEntries={[
          '/provincial/application/create?ownerClientNumber=00011111&ownerClientLocationCode=00&ownerContactName=Owner%20Contact&ownerApplicantType=A&agentClientNumber=00033333&agentClientLocationCode=01&agentContactName=Agent%20Contact',
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

    await selectApplicationCreateTab('Owner')
    const ownerDetails = await screen.findByRole('region', { name: 'Owner client details' })
    expect(within(ownerDetails).getByText('Owner Forestry Ltd.')).toBeInTheDocument()
    expect(within(ownerDetails).getByText('123 Timber Road')).toBeInTheDocument()
    expect(within(ownerDetails).getByText('owner@example.test')).toBeInTheDocument()
    expect(within(ownerDetails).queryByRole('textbox')).not.toBeInTheDocument()

    await selectApplicationCreateTab('Agent')
    const agentDetails = await screen.findByRole('region', { name: 'Agent client details' })
    expect(within(agentDetails).getByText('Agent Export Services')).toBeInTheDocument()
    expect(within(agentDetails).getByText('456 Export Road')).toBeInTheDocument()
    expect(within(agentDetails).getByText('agent@example.test')).toBeInTheDocument()
    expect(within(agentDetails).queryByRole('textbox')).not.toBeInTheDocument()

    expect(mockedFetchApplicationClientData).toHaveBeenCalledWith('00011111', '00')
    expect(mockedFetchApplicationClientData).toHaveBeenCalledWith('00033333', '01')
  })

  it('submits a ministerial applicant type without agent fields', async () => {
    mockedSubmitProvincialApplicationCreate.mockResolvedValue(successfulCreate('904'))

    render(
      <MemoryRouter
        initialEntries={[
          '/provincial/application/create?ownerClientNumber=00011111&ownerClientLocationCode=00&ownerContactName=Owner%20Contact&ownerApplicantType=M&productTypeCode=LOG&exemptionReason=U&region=11&applicationDate=2026-01-09&applicationTermDays=30&receivedDate=2026-01-10&listingDate=2026-01-11&productLocation=Camp%201&applicationVolume=125.5&averageLogVolume=1.2&speciesCodes=HE&endUseCode=SA&comments=Ready',
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

    await selectApplicationCreateTab('Owner')
    expect(screen.getByRole('combobox', { name: 'Applicant type' })).toHaveValue('Ministerial')
    expect(screen.queryByRole('tab', { name: 'Agent' })).not.toBeInTheDocument()

    const submitButton = await screen.findByRole('button', { name: 'Save' })
    await waitFor(() => expect(submitButton).toBeEnabled())
    await userEvent.click(submitButton)

    expect(mockedSubmitProvincialApplicationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        applicantTypeCode: 'M',
        agentClientNumber: '',
        agentClientLocationCode: '',
        agentContactName: '',
      }),
    )
    expect(mockNavigate).toHaveBeenCalledWith('/provincial/application/904', {
      state: {
        applicationCreationNotice: {
          applicationNumber: '904',
        },
      },
    })
  })

  it('debounces client lookups while an owner client number is typed', async () => {
    render(
      <MemoryRouter initialEntries={['/provincial/application/create']}>
        <Routes>
          <Route
            path="/provincial/application/create"
            element={<ProvincialApplicationCreatePage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    await selectApplicationCreateTab('Owner')
    const ownerClientNumberInput = screen.getByRole('textbox', { name: 'Client number' })
    mockedFetchApplicationClientLocations.mockClear()

    for (const value of ['0', '00', '000', '0001', '00011', '000111', '0001111', '00011111']) {
      fireEvent.change(ownerClientNumberInput, { target: { value } })
    }

    expect(mockedFetchApplicationClientLocations).not.toHaveBeenCalled()

    await waitFor(() => {
      expect(mockedFetchApplicationClientLocations).toHaveBeenCalledTimes(1)
      expect(mockedFetchApplicationClientLocations).toHaveBeenCalledWith('00011111', 'owner')
    })
  })

  it('ignores an earlier client lookup that resolves after the client number changes', async () => {
    let resolveInitialLocations: (
      locations: Awaited<ReturnType<typeof fetchApplicationClientLocations>>,
    ) => void = () => undefined
    mockedFetchApplicationClientLocations.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveInitialLocations = resolve
      }),
    )

    render(
      <MemoryRouter
        initialEntries={[
          '/provincial/application/create?ownerClientNumber=00011111&ownerClientLocationCode=00',
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

    const ownerClientNumberInput = await screen.findByRole('textbox', { name: 'Client number' })
    await waitFor(() =>
      expect(mockedFetchApplicationClientLocations).toHaveBeenCalledWith('00011111', 'owner'),
    )

    fireEvent.change(ownerClientNumberInput, { target: { value: '00099988' } })
    await act(async () => {
      resolveInitialLocations([
        { locationCode: '99', locationName: 'STALE LOCATION', selected: true },
      ])
    })

    const ownerLocation = screen.getByRole('combobox', { name: 'Client location' })
    expect(ownerLocation).toHaveValue('')
    fireEvent.click(ownerLocation)
    expect(screen.queryByRole('option', { name: '99 - STALE LOCATION' })).not.toBeInTheDocument()

    await waitFor(() =>
      expect(mockedFetchApplicationClientLocations).toHaveBeenCalledWith('00099988', 'owner'),
    )
  })

  it('keeps concurrent client lookup failures visible until each lookup succeeds', async () => {
    mockedFetchApplicationClientLocations.mockImplementation((clientNumber, applicantType) => {
      if (
        (applicantType === 'owner' && clientNumber === '00011111') ||
        (applicantType === 'agent' && clientNumber === '00002176')
      ) {
        return Promise.reject(new Error('client locations unavailable'))
      }

      return Promise.resolve([
        { locationCode: '00', locationName: '00', selected: true },
        { locationCode: '01', locationName: '01 - MAIN LOCATION', selected: false },
      ])
    })

    render(
      <MemoryRouter
        initialEntries={[
          '/provincial/application/create?ownerClientNumber=00011111&ownerClientLocationCode=00&ownerApplicantType=A&agentClientNumber=00002176&agentClientLocationCode=00',
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

    expect(await screen.findByText('Client details unavailable')).toBeInTheDocument()

    const ownerClientNumber = screen.getByRole('textbox', { name: 'Client number' })
    fireEvent.change(ownerClientNumber, { target: { value: '00099988' } })
    await waitFor(() =>
      expect(mockedFetchApplicationClientLocations).toHaveBeenCalledWith('00099988', 'owner'),
    )
    expect(screen.getByText('Client details unavailable')).toBeInTheDocument()

    await selectApplicationCreateTab('Agent')
    const agentClientNumber = screen.getByRole('textbox', { name: 'Agent number' })
    fireEvent.change(agentClientNumber, { target: { value: '00033333' } })
    await waitFor(() =>
      expect(mockedFetchApplicationClientLocations).toHaveBeenCalledWith('00033333', 'agent'),
    )
    await waitFor(() =>
      expect(screen.queryByText('Client details unavailable')).not.toBeInTheDocument(),
    )
  })

  it.each([
    ['non-numeric', '2176X'],
    ['more than eight digits', '123456789'],
  ])(
    'blocks a %s owner client number before lookup or submit',
    async (_description, clientNumber) => {
      render(
        <MemoryRouter
          initialEntries={[
            `/provincial/application/create?ownerClientNumber=${clientNumber}&ownerClientLocationCode=00&ownerContactName=Owner%20Contact&productTypeCode=LOG&exemptionReason=U&region=11&applicationDate=2026-01-09&applicationTermDays=30&receivedDate=2026-01-10&listingDate=2026-01-11&productLocation=Camp%201&applicationVolume=125.5&averageLogVolume=1.2&speciesCodes=HE&endUseCode=SA&comments=Ready`,
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

      const submitButton = await screen.findByRole('button', { name: 'Save' })
      await waitFor(() => expect(submitButton).toBeEnabled())
      await userEvent.click(submitButton)

      expect(
        await screen.findAllByText('Owner client number must be 1 to 8 digits.'),
      ).not.toHaveLength(0)
      expect(mockedFetchApplicationClientLocations).not.toHaveBeenCalled()
      expect(mockedSubmitProvincialApplicationCreate).not.toHaveBeenCalled()
    },
  )

  it('clears stale agent location and contact when the agent number changes', async () => {
    render(
      <MemoryRouter
        initialEntries={[
          '/provincial/application/create?ownerClientNumber=00011111&ownerClientLocationCode=00&ownerContactName=Owner%20Contact&ownerApplicantType=A&agentClientNumber=2176&agentClientLocationCode=12&agentContactName=Agent%20Contact&productTypeCode=LOG&exemptionReason=U&region=11&applicationDate=2026-01-09&applicationTermDays=30&receivedDate=2026-01-10&listingDate=2026-01-11&productLocation=Camp%201&applicationVolume=125.5&averageLogVolume=1.2&speciesCodes=HE&endUseCode=SA&comments=Ready',
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

    await selectApplicationCreateTab('Agent')
    const agentSection = screen.getByRole('region', { name: 'Agent' })
    const agentNumber = within(agentSection).getByRole('textbox', { name: 'Agent number' })
    await waitFor(() => expect(agentNumber).toHaveValue('00002176'))
    await waitFor(() =>
      expect(within(agentSection).getByRole('combobox', { name: 'Contact name' })).toHaveValue(
        'Agent Contact',
      ),
    )

    fireEvent.change(agentNumber, { target: { value: '123456789' } })

    await waitFor(() => {
      const contactLocation = within(agentSection).getByRole('combobox', {
        name: 'Contact location',
      })
      expect(contactLocation).toHaveValue('')
      expect(contactLocation).toBeDisabled()
      const contactName = within(agentSection).getByRole('textbox', { name: 'Contact name' })
      expect(contactName).toHaveValue('')
      expect(contactName).toBeDisabled()
    })
    expect(screen.queryByRole('region', { name: 'Agent client details' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(
      await screen.findAllByText('Agent client number must be 1 to 8 digits.'),
    ).not.toHaveLength(0)
    expect(mockedSubmitProvincialApplicationCreate).not.toHaveBeenCalled()
  })

  it('validates application text storage limits and accepts their exact boundaries', async () => {
    mockedSubmitProvincialApplicationCreate.mockResolvedValue(successfulCreate('907'))
    const overlongLocation = 'L'.repeat(251)
    const overlongComments = 'R'.repeat(255)
    const query = new URLSearchParams({
      ownerClientNumber: '00011111',
      ownerClientLocationCode: '00',
      ownerContactName: 'Owner Contact',
      productTypeCode: 'H',
      ageClass: 'O',
      exemptionReason: 'U',
      region: '11',
      applicationDate: '2026-01-09',
      applicationTermDays: '30',
      receivedDate: '2026-01-10',
      listingDate: '2026-01-11',
      productLocation: overlongLocation,
      applicationVolume: '125.5',
      averageLogVolume: '1.2',
      speciesCodes: 'HE',
      endUseCode: 'SA',
      comments: overlongComments,
    })

    render(
      <MemoryRouter initialEntries={[`/provincial/application/create?${query.toString()}`]}>
        <Routes>
          <Route
            path="/provincial/application/create"
            element={<ProvincialApplicationCreatePage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    const ownerName = await screen.findByRole('combobox', { name: 'Contact name' })
    await waitFor(() => expect(ownerName).toHaveValue('Owner Contact'))
    fireEvent.change(ownerName, { target: { value: 'Café' } })

    const submitButton = screen.getByRole('button', { name: 'Save' })
    await waitFor(() => expect(submitButton).toBeEnabled())
    await userEvent.click(submitButton)

    expect(
      await screen.findAllByText(
        'Owner name contains unsupported characters. Use unaccented letters, numbers, spaces, or standard punctuation.',
      ),
    ).not.toHaveLength(0)
    await selectApplicationCreateTab('Items')
    const locationOfLogs = screen.getByRole('textbox', { name: 'Location of logs' })
    expect(locationOfLogs).toHaveAttribute('maxlength', '250')
    expect(
      locationOfLogs.closest('.cds--form-item')?.querySelector('.cds--text-area__label-counter'),
    ).toHaveTextContent('251/250')
    expect(
      screen.getByText('Location of logs must be 250 characters or fewer.'),
    ).toBeInTheDocument()
    await selectApplicationCreateTab('Remarks')
    expect(screen.getByText('Remarks must be 254 characters or fewer.')).toBeInTheDocument()
    expect(mockedSubmitProvincialApplicationCreate).not.toHaveBeenCalled()

    await selectApplicationCreateTab('Owner')
    fireEvent.change(screen.getByRole('combobox', { name: 'Contact name' }), {
      target: { value: 'O'.repeat(120) },
    })
    await selectApplicationCreateTab('Items')
    fireEvent.change(screen.getByRole('textbox', { name: 'Location of logs' }), {
      target: { value: 'L'.repeat(250) },
    })
    await selectApplicationCreateTab('Remarks')
    fireEvent.change(screen.getByRole('textbox', { name: 'Remarks' }), {
      target: { value: 'R'.repeat(254) },
    })
    await userEvent.click(submitButton)

    await waitFor(() =>
      expect(mockedSubmitProvincialApplicationCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          ownerContactName: 'O'.repeat(120),
          productLocation: 'L'.repeat(250),
          comments: 'R'.repeat(254),
        }),
      ),
    )
  }, 20_000)

  it('ignores forged agent prefill when applicant type changes are not authorized', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({
          principal: 'bceid\\submitter',
          roles: ['PROVINCIAL_SUBMITTER_00077881'],
          forestClientNumber: '00077881',
          orgUnitNo: '11',
        }),
        canPerform: (action: string) => action !== '/changeApplicantType',
      }),
    )

    render(
      <MemoryRouter
        initialEntries={[
          '/provincial/application/create?ownerApplicantType=A&agentClientNumber=00033333&agentClientLocationCode=01&agentContactName=Forged%20Agent',
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

    await selectApplicationCreateTab('Owner')
    const applicantType = screen.getByRole('textbox', { name: 'Applicant type' })
    expect(applicantType).toHaveValue('Owner')
    expect(applicantType).toHaveAttribute('readonly')
    expect(screen.queryByRole('tab', { name: 'Agent' })).not.toBeInTheDocument()
    expect(mockedFetchApplicationClientLocations).not.toHaveBeenCalledWith('00033333', 'agent')
  })

  it('hides Review on application create without review authority', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        canPerform: (action: string) => action !== '/applicationsReview',
      }),
    )

    render(
      <MemoryRouter initialEntries={['/provincial/application/create']}>
        <Routes>
          <Route
            path="/provincial/application/create"
            element={<ProvincialApplicationCreatePage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.queryByRole('tab', { name: 'Review' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Review' })).not.toBeInTheDocument()
  })

  it('hides Remarks on application create without application remarks authority', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        canPerform: (action: string) => action !== '/applicationRemarks',
      }),
    )
    mockedSubmitProvincialApplicationCreate.mockResolvedValue(successfulCreate('907'))

    render(
      <MemoryRouter
        initialEntries={[
          `/provincial/application/create?ownerClientNumber=00011111&ownerClientLocationCode=00&ownerContactName=Owner%20Contact&productTypeCode=LOG&exemptionReason=U&region=11&applicationDate=2026-01-09&applicationTermDays=30&receivedDate=2026-01-10&listingDate=2026-01-11&productLocation=Camp%201&applicationVolume=125.5&averageLogVolume=1.2&speciesCodes=HE&endUseCode=SA&comments=${encodeURIComponent('R'.repeat(255))}`,
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

    expect(screen.queryByRole('tab', { name: 'Remarks' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Remarks' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: 'Offers' }))
    expect(screen.getByRole('region', { name: 'Offers' })).toBeInTheDocument()

    const saveButton = screen.getByRole('button', { name: 'Save' })
    await waitFor(() => expect(saveButton).toBeEnabled())
    await userEvent.click(saveButton)

    await waitFor(() => expect(mockedSubmitProvincialApplicationCreate).toHaveBeenCalledTimes(1))
    expect(mockedSubmitProvincialApplicationCreate.mock.calls[0]?.[0]).not.toHaveProperty(
      'comments',
    )
  })

  it('blocks provincial application submit when owner has no selectable locations', async () => {
    mockedFetchApplicationClientLocations.mockResolvedValueOnce([
      { locationCode: '0', locationName: 'No locations on file', selected: false },
    ])

    render(
      <MemoryRouter
        initialEntries={[
          '/provincial/application/create?ownerClientNumber=00011111&ownerContactName=Owner%20Contact&productTypeCode=LOG&exemptionReason=U&region=11&applicationDate=2026-01-09&applicationTermDays=30&receivedDate=2026-01-10&listingDate=2026-01-11&productLocation=Camp%201&applicationVolume=125.5&averageLogVolume=1.2&speciesCodes=HE&endUseCode=SA&comments=Ready',
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

    const submitButton = await screen.findByRole('button', { name: 'Save' })
    await waitFor(() => expect(submitButton).toBeEnabled())
    await userEvent.click(submitButton)

    expect(await screen.findAllByText('Owner client location code is required.')).not.toHaveLength(
      0,
    )
    expect(mockedSubmitProvincialApplicationCreate).not.toHaveBeenCalled()
  })

  it('prefills new provincial applications with safe legacy defaults and next listing date', async () => {
    mockedFetchProvincialApplicationOptions.mockResolvedValueOnce({
      productTypes: [{ value: 'H', label: 'Harvested Timber' }],
      exemptionTypes: [{ value: 'SECTION_1', label: 'Section 1' }],
      exemptionReasons: [{ value: 'S', label: 'Surplus' }],
      applicationStatuses: [],
      growthTypes: [{ value: 'O', label: 'Old Growth' }],
      regions: [{ value: '1903', label: 'Cariboo Natural Resource Region' }],
      currentSchedules: [
        { value: '1001', label: '2026-07-29' },
        { value: '1002', label: '2026-08-05' },
        { value: '', label: 'Blank' },
      ],
      nextSchedules: [
        { value: '1002', label: '2026-08-05' },
        { value: '1003', label: '2026-08-12' },
        { value: '', label: 'Blank' },
      ],
    } satisfies Awaited<ReturnType<typeof fetchProvincialApplicationOptions>>)

    render(
      <MemoryRouter initialEntries={['/provincial/application/create']}>
        <Routes>
          <Route
            path="/provincial/application/create"
            element={<ProvincialApplicationCreatePage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    const today = formatBusinessIsoDate()
    await selectApplicationCreateTab('Application')
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Product type' })).toHaveValue('Harvested Timber')
      expect(screen.getByRole('combobox', { name: 'Exemption reason' })).toHaveValue('Surplus')
      expect(screen.getByRole('combobox', { name: 'Region' })).toHaveValue('')
      expect(screen.getByRole('textbox', { name: 'Application date (YYYY-MM-DD)' })).toHaveValue(
        today,
      )
      expect(screen.getByRole('spinbutton', { name: 'Exemption term (days)' })).toHaveValue(180)
      expect(screen.getByRole('textbox', { name: 'Date received (YYYY-MM-DD)' })).toHaveValue('')
      expect(screen.getByRole('combobox', { name: 'List date' })).toHaveValue('2026-08-05')
    })

    expect(screen.getByRole('combobox', { name: 'Region' })).toBeEnabled()
    await selectApplicationCreateTab('Owner')
    expect(screen.getByRole('textbox', { name: 'Client number' })).not.toHaveAttribute('readonly')
  })

  it('locks a scoped submitter to its authoritative owner and defaults its valid org unit', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({
          principal: 'bceid\\submitter',
          roles: ['PROVINCIAL_SUBMITTER_00077881'],
          forestClientNumber: '00077881',
          orgUnitNo: '1910',
        }),
        canPerform: (action: string) => action !== '/changeApplicantType',
      }),
    )
    mockedFetchProvincialApplicationOptions.mockResolvedValueOnce({
      productTypes: [{ value: 'H', label: 'Harvested Timber' }],
      exemptionTypes: [{ value: 'SECTION_1', label: 'Section 1' }],
      exemptionReasons: [{ value: 'S', label: 'Surplus' }],
      applicationStatuses: [],
      growthTypes: [{ value: 'O', label: 'Old Growth' }],
      regions: [
        { value: '1903', label: 'Cariboo Natural Resource Region' },
        { value: '1910', label: 'West Coast Natural Resource Region' },
      ],
      currentSchedules: [{ value: '1001', label: '2026-07-01' }],
    } satisfies Awaited<ReturnType<typeof fetchProvincialApplicationOptions>>)

    render(
      <MemoryRouter
        initialEntries={[
          '/provincial/application/create?ownerClientNumber=00099999&ownerClientLocationCode=99&region=1903',
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

    await selectApplicationCreateTab('Application')
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Region' })).toHaveValue(
        'West Coast Natural Resource Region',
      )
    })
    expect(screen.getByRole('combobox', { name: 'Region' })).toBeEnabled()
    expect(screen.getByRole('spinbutton', { name: 'Exemption term (days)' })).toHaveValue(180)

    await selectApplicationCreateTab('Owner')
    expect(screen.getByRole('textbox', { name: 'Client number' })).toHaveValue('00077881')
    expect(screen.getByRole('textbox', { name: 'Client number' })).toHaveAttribute('readonly')
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Client location' })).toHaveValue('00')
    })
    const ownerLocation = screen.getByRole('combobox', { name: 'Client location' })
    expect(ownerLocation).toBeEnabled()
    await chooseComboBoxOption(ownerLocation, '01 - MAIN LOCATION')
    expect(ownerLocation).toHaveValue('01 - MAIN LOCATION')
    expect(mockedFetchApplicationClientLocations).toHaveBeenCalledWith('00077881', 'owner')
    expect(mockedFetchApplicationClientLocations).not.toHaveBeenCalledWith('00099999', 'owner')
    expect(screen.queryByDisplayValue('00099999')).not.toBeInTheDocument()
  })

  it('requires explicit region selection when a scoped org unit is not authoritative', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({
          principal: 'bceid\\submitter',
          roles: ['PROVINCIAL_SUBMITTER_00077881'],
          forestClientNumber: '00077881',
          orgUnitNo: '1999',
        }),
      }),
    )
    mockedFetchProvincialApplicationOptions.mockResolvedValueOnce({
      productTypes: [{ value: 'H', label: 'Harvested Timber' }],
      exemptionTypes: [{ value: 'SECTION_1', label: 'Section 1' }],
      exemptionReasons: [{ value: 'S', label: 'Surplus' }],
      applicationStatuses: [],
      growthTypes: [{ value: 'O', label: 'Old Growth' }],
      regions: [{ value: '1903', label: 'Cariboo Natural Resource Region' }],
      currentSchedules: [{ value: '1001', label: '2026-07-01' }],
    } satisfies Awaited<ReturnType<typeof fetchProvincialApplicationOptions>>)

    render(
      <MemoryRouter
        initialEntries={['/provincial/application/create?region=1903&ownerClientNumber=00099999']}
      >
        <Routes>
          <Route
            path="/provincial/application/create"
            element={<ProvincialApplicationCreatePage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    await selectApplicationCreateTab('Application')
    const region = await screen.findByRole('combobox', { name: 'Region' })
    await waitFor(() => expect(region).toHaveValue(''))
    expect(region).toBeEnabled()
  })

  it('allows manual owner contact entry when lookup has no contacts', async () => {
    mockedSubmitProvincialApplicationCreate.mockResolvedValue(successfulCreate('903'))
    mockedFetchApplicationClientContacts.mockResolvedValue([])

    render(
      <MemoryRouter
        initialEntries={[
          '/provincial/application/create?ownerClientNumber=00011111&ownerClientLocationCode=00&productTypeCode=LOG&exemptionReason=U&region=11&applicationDate=2026-01-09&applicationTermDays=30&receivedDate=2026-01-10&listingDate=2026-01-11&productLocation=Camp%201&applicationVolume=125.5&averageLogVolume=1.2&speciesCodes=HE&endUseCode=SA&comments=Ready',
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

    const ownerNameInput = await screen.findByRole('textbox', { name: 'Contact name' })
    fireEvent.change(ownerNameInput, { target: { value: 'Typed Owner' } })
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(mockedSubmitProvincialApplicationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerContactName: 'Typed Owner',
      }),
    )
  })

  it('allows a custom owner name when the lookup returns contacts', async () => {
    mockedSubmitProvincialApplicationCreate.mockResolvedValue(successfulCreate('904'))

    render(
      <MemoryRouter
        initialEntries={[
          '/provincial/application/create?ownerClientNumber=00011111&ownerClientLocationCode=00&productTypeCode=LOG&exemptionReason=U&region=11&applicationDate=2026-01-09&applicationTermDays=30&receivedDate=2026-01-10&listingDate=2026-01-11&productLocation=Camp%201&applicationVolume=125.5&averageLogVolume=1.2&speciesCodes=HE&endUseCode=SA&comments=Ready',
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

    await selectApplicationCreateTab('Owner')
    const ownerNameInput = await screen.findByRole('combobox', { name: 'Contact name' })
    await waitFor(() => expect(ownerNameInput).toHaveValue('Owner Contact'))
    fireEvent.change(ownerNameInput, { target: { value: 'Advertising Owner' } })
    await waitFor(() => expect(ownerNameInput).toHaveValue('Advertising Owner'))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(mockedSubmitProvincialApplicationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerContactName: 'Advertising Owner',
      }),
    )
  })

  it('blocks provincial application submit when volume precision is invalid', async () => {
    render(
      <MemoryRouter
        initialEntries={[
          '/provincial/application/create?ownerClientNumber=00011111&ownerClientLocationCode=00&ownerContactName=Owner%20Contact&productTypeCode=H&ageClass=O&exemptionReason=U&region=11&applicationDate=2026-01-09&applicationTermDays=30&receivedDate=2026-01-10&listingDate=2026-01-11&productLocation=Camp%201&applicationVolume=125.555&averageLogVolume=1.23&speciesCodes=HE&endUseCode=SA&comments=Ready',
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

    const submitButton = await screen.findByRole('button', { name: 'Save' })
    await waitFor(() => expect(submitButton).toBeEnabled())
    await userEvent.click(submitButton)

    expect(
      await screen.findAllByText('Application volume must have no more than two decimal places.'),
    ).not.toHaveLength(0)
    expect(
      screen.getByText('Average log volume must have no more than one decimal place.'),
    ).toBeInTheDocument()
    expect(mockedSubmitProvincialApplicationCreate).not.toHaveBeenCalled()
  })

  it('rejects application volume above the Oracle maximum and accepts the exact maximum', async () => {
    mockedSubmitProvincialApplicationCreate.mockResolvedValue(successfulCreate('905'))

    render(
      <MemoryRouter
        initialEntries={[
          '/provincial/application/create?ownerClientNumber=00011111&ownerClientLocationCode=00&ownerContactName=Owner%20Contact&productTypeCode=H&ageClass=O&exemptionReason=U&region=11&applicationDate=2026-01-09&applicationTermDays=30&receivedDate=2026-01-10&listingDate=2026-01-11&productLocation=Camp%201&applicationVolume=10000000&averageLogVolume=1.2&speciesCodes=HE&endUseCode=SA&comments=Ready',
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

    const submitButton = await screen.findByRole('button', { name: 'Save' })
    await userEvent.click(submitButton)

    expect(
      screen.getAllByText('Application volume must be 9999999.99 or less.').length,
    ).toBeGreaterThan(0)
    expect(mockedSubmitProvincialApplicationCreate).not.toHaveBeenCalled()

    const applicationVolume = screen.getByRole('textbox', { name: 'Application volume (m³)' })
    await userEvent.clear(applicationVolume)
    await userEvent.type(applicationVolume, '9999999.99')
    await userEvent.click(submitButton)

    await waitFor(() =>
      expect(mockedSubmitProvincialApplicationCreate).toHaveBeenCalledWith(
        expect.objectContaining({ applicationVolume: '9999999.99' }),
      ),
    )
  }, 20_000)

  it('shows only the application fields required by H, S, and T product types', async () => {
    render(
      <MemoryRouter
        initialEntries={[
          '/provincial/application/create?productTypeCode=H&ageClass=O&productLocation=Camp%201&averageLogVolume=1.2',
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

    await selectApplicationCreateTab('Application')
    const productType = await screen.findByRole('combobox', { name: 'Product type' })
    await waitFor(() => expect(productType).toHaveValue('Harvested Timber'))
    await selectApplicationCreateTab('Items')
    expect(screen.getByRole('combobox', { name: 'Age class' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Location of logs' })).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: 'Average log volume (m³)' })).toBeInTheDocument()

    await selectApplicationCreateTab('Application')
    await chooseComboBoxOption(
      screen.getByRole('combobox', { name: 'Product type' }),
      'Standing Timber',
    )
    await selectApplicationCreateTab('Items')
    expect(screen.getByRole('combobox', { name: 'Age class' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Location of logs' })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('spinbutton', { name: 'Average log volume (m³)' }),
    ).not.toBeInTheDocument()

    await selectApplicationCreateTab('Application')
    await chooseComboBoxOption(screen.getByRole('combobox', { name: 'Product type' }), 'Timber')
    await selectApplicationCreateTab('Items')
    expect(screen.queryByRole('combobox', { name: 'Age class' })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Location of logs' })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('spinbutton', { name: 'Average log volume (m³)' }),
    ).not.toBeInTheDocument()
  })

  it('does not let hidden H-only values block a standing-timber application', async () => {
    mockedSubmitProvincialApplicationCreate.mockResolvedValue(successfulCreate('904'))

    render(
      <MemoryRouter
        initialEntries={[
          '/provincial/application/create?ownerClientNumber=00011111&ownerClientLocationCode=00&ownerContactName=Owner%20Contact&productTypeCode=S&ageClass=O&exemptionReason=U&region=11&applicationDate=2026-01-09&applicationTermDays=30&receivedDate=2026-01-10&listingDate=2026-01-11&applicationVolume=125.5&averageLogVolume=-1.23&speciesCodes=HE&endUseCode=SA&comments=Ready',
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

    await userEvent.click(await screen.findByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(mockedSubmitProvincialApplicationCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          productTypeCode: 'S',
          ageClass: 'O',
          productLocation: '',
          averageLogVolume: '-1.23',
        }),
      )
    })
  })

  it('shows provincial application species validation when no species are available', async () => {
    mockedFetchApplicationRemainingSpecies.mockResolvedValue([])

    render(
      <MemoryRouter
        initialEntries={[
          '/provincial/application/create?ownerClientNumber=00011111&ownerClientLocationCode=00&ownerContactName=Owner%20Contact&productTypeCode=LOG&exemptionReason=U&region=11&applicationDate=2026-01-09&applicationTermDays=30&receivedDate=2026-01-10&listingDate=2026-01-11&productLocation=Camp%201&applicationVolume=125.5&averageLogVolume=1.2',
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

    await waitFor(() =>
      expect(mockedFetchApplicationRemainingSpecies).toHaveBeenCalledWith('11', 'LOG', []),
    )
    await waitFor(() => expect(screen.getByPlaceholderText('No remaining species')).toBeDisabled())

    const submitButton = await screen.findByRole('button', { name: 'Save' })
    await userEvent.click(submitButton)

    const speciesErrors = await screen.findAllByText(
      'At least one species is required, but no species are available for the selected region and product type.',
    )
    expect(speciesErrors.length).toBeGreaterThan(0)
    expect(mockedSubmitProvincialApplicationCreate).not.toHaveBeenCalled()
  })

  it('does not use search exemption type as create exemption reason', async () => {
    render(
      <MemoryRouter
        initialEntries={[
          '/provincial/application/create?ownerClientNumber=00011111&ownerClientLocationCode=00&ownerContactName=Owner%20Contact&productTypeCode=LOG&exemptionType=ALL&region=11&applicationDate=2026-01-09&applicationTermDays=30&receivedDate=2026-01-10&listingDate=2026-01-11&productLocation=Camp%201&applicationVolume=125.5&averageLogVolume=1.2&speciesCodes=HE&endUseCode=SA&comments=Ready',
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

    const submitButton = await screen.findByRole('button', { name: 'Save' })
    await waitFor(() => expect(submitButton).toBeEnabled())
    await userEvent.click(submitButton)

    expect(await screen.findAllByText('Exemption reason is required.')).not.toHaveLength(0)
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

    await screen.findByRole('heading', { level: 1, name: 'Create exemption' })
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    const exemptionDetails = screen.getByRole('group', { name: 'Exemption details' })
    expect(exemptionDetails).toHaveClass('create-form-section')
    expect(exemptionDetails.querySelector('.legacy-search-grid')).toHaveClass('create-form-grid')
    expect(screen.getByLabelText('Approved volume (m³)')).toBeInTheDocument()
    expect(screen.queryByLabelText('Approved volumeume (m³)')).not.toBeInTheDocument()
    const exemptionFormActions = screen.getByRole('group', { name: 'Exemption form actions' })
    expect(
      within(exemptionFormActions)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Cancel', 'Save'])
    expect(within(exemptionFormActions).getByRole('button', { name: 'Cancel' })).toHaveAttribute(
      'type',
      'button',
    )
    expect(within(exemptionFormActions).getByRole('button', { name: 'Save' })).toHaveAttribute(
      'type',
      'button',
    )
    expect(screen.queryByRole('group', { name: 'New exemption state' })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: /exemption number/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Client number' })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('textbox', { name: 'Applicant client number' }),
    ).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('Approved volume (m³)')).toHaveValue('250.5'))
    expect(mockedFetchProvincialExemptionCreatePreview).toHaveBeenCalledWith(['321', '654'])
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Exemption type' })).toHaveValue('Ministerial'),
    )
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Exemption status' })).toHaveValue('New'),
    )
    expect(screen.getByText('Exemption status')).not.toHaveClass('required-label')
    expect(screen.getByRole('combobox', { name: 'Exemption status' })).not.toHaveAttribute(
      'aria-required',
      'true',
    )
    expect(screen.getByLabelText('Expiry date (YYYY-MM-DD)')).toHaveValue('2026-06-30')
    await chooseComboBoxOption(
      screen.getByRole('combobox', { name: 'Exemption type' }),
      'Section 1',
    )
    expect(screen.getByText('Exemption status')).toHaveClass('required-label')
    expect(screen.getByRole('combobox', { name: 'Exemption status' })).toHaveAttribute(
      'aria-required',
      'true',
    )
    await chooseComboBoxOption(screen.getByRole('combobox', { name: 'Exemption status' }), 'New')
    await userEvent.type(screen.getByLabelText('Approval date (YYYY-MM-DD)'), '2026-02-01')
    await userEvent.clear(screen.getByLabelText('Expiry date (YYYY-MM-DD)'))
    await userEvent.type(screen.getByLabelText('Expiry date (YYYY-MM-DD)'), '2026-12-31')
    await userEvent.clear(screen.getByLabelText(/Approved Volume/i))
    await userEvent.type(screen.getByLabelText(/Approved Volume/i), '500')

    expect(screen.queryByRole('button', { name: 'Submit' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save Draft' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Back to Search' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    const submitButton = screen.getByRole('button', { name: 'Save' })
    expect(submitButton).toBeEnabled()
    await userEvent.click(submitButton)

    expect(mockedSubmitProvincialExemptionCreate).toHaveBeenCalledWith({
      applicationNumber: '321',
      linkedApplicationNumbers: ['321', '654'],
      exemptionNumber: '',
      exemptionTypeCode: 'SECTION_1',
      exemptionStatusCode: 'NEW',
      approvalDate: '2026-02-01',
      expiryDate: '2026-12-31',
      approvedVolume: '500',
      enableRateOverride: false,
      feeRate: '',
      regionNumbers: [],
      otherConditions: '',
    })
    expect(mockNavigate).toHaveBeenCalledWith('/provincial/exemption/EX-777')
  }, 20_000)

  it('displays every application selected from provincial search', async () => {
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/provincial/exemption/create',
            state: {
              selectedApplicationNumbers: ['321', '654'],
              applicantClientNumber: '00044444',
              ownerClientNumber: '00033333',
            },
          },
        ]}
      >
        <Routes>
          <Route path="/provincial/exemption/create" element={<ProvincialExemptionCreatePage />} />
        </Routes>
      </MemoryRouter>,
    )

    await screen.findByRole('heading', { level: 1, name: 'Create exemption' })

    const selectedApplications = screen.getByRole('list', { name: 'Selected applications' })
    expect(within(selectedApplications).getByText('321')).toBeInTheDocument()
    expect(within(selectedApplications).getByText('654')).toBeInTheDocument()
    expect(within(selectedApplications).getAllByRole('listitem')).toHaveLength(2)
    await waitFor(() =>
      expect(mockedFetchProvincialExemptionCreatePreview).toHaveBeenCalledWith(['321', '654']),
    )
  })

  it('adds, removes, and submits multiple applications from the create page', async () => {
    mockedSubmitProvincialExemptionCreate.mockResolvedValue(successfulCreate('EX-901'))

    render(
      <MemoryRouter initialEntries={['/provincial/exemption/create']}>
        <Routes>
          <Route path="/provincial/exemption/create" element={<ProvincialExemptionCreatePage />} />
        </Routes>
      </MemoryRouter>,
    )

    const applicationNumber = await screen.findByRole('combobox', {
      name: 'Application number (optional)',
    })
    const addApplication = screen.getByRole('button', { name: 'Add application' })
    const setApplicationNumber = async (value: string) => {
      fireEvent.change(applicationNumber, { target: { value } })
      await waitFor(() => expect(addApplication).toBeEnabled())
    }

    await setApplicationNumber('321')
    await userEvent.click(addApplication)
    await waitFor(() =>
      expect(mockedFetchProvincialExemptionCreatePreview).toHaveBeenLastCalledWith(['321']),
    )
    await waitFor(() => expect(applicationNumber).toHaveValue(''))

    await setApplicationNumber('2001')
    await userEvent.click(addApplication)
    await waitFor(() =>
      expect(mockedFetchProvincialExemptionCreatePreview).toHaveBeenLastCalledWith(['321', '2001']),
    )

    const selectedApplications = screen.getByRole('list', { name: 'Selected applications' })
    expect(within(selectedApplications).getAllByRole('listitem')).toHaveLength(2)
    await userEvent.click(
      within(selectedApplications).getByRole('button', {
        name: 'Remove application 321',
      }),
    )
    await waitFor(() =>
      expect(mockedFetchProvincialExemptionCreatePreview).toHaveBeenLastCalledWith(['2001']),
    )

    await waitFor(() => expect(applicationNumber).toHaveValue(''))
    await setApplicationNumber('321')
    await userEvent.click(addApplication)
    await waitFor(() =>
      expect(mockedFetchProvincialExemptionCreatePreview).toHaveBeenLastCalledWith(['2001', '321']),
    )

    const saveButton = screen.getByRole('button', { name: 'Save' })
    await waitFor(() => expect(saveButton).toBeEnabled())
    await userEvent.click(saveButton)

    expect(mockedSubmitProvincialExemptionCreate).toHaveBeenCalledWith({
      applicationNumber: '2001',
      linkedApplicationNumbers: ['2001', '321'],
      exemptionNumber: '',
      exemptionTypeCode: 'M',
      exemptionStatusCode: 'NEW',
      approvalDate: '',
      expiryDate: '2026-06-30',
      approvedVolume: '250.5',
      enableRateOverride: false,
      feeRate: '',
      regionNumbers: [],
      otherConditions: '',
    })
    expect(mockNavigate).toHaveBeenCalledWith('/provincial/exemption/EX-901')
  }, 20_000)

  it('canonicalizes a padded application number before exemption preview', async () => {
    render(
      <MemoryRouter initialEntries={['/provincial/exemption/create']}>
        <Routes>
          <Route path="/provincial/exemption/create" element={<ProvincialExemptionCreatePage />} />
        </Routes>
      </MemoryRouter>,
    )

    const applicationNumber = await screen.findByRole('combobox', {
      name: 'Application number (optional)',
    })
    fireEvent.change(applicationNumber, { target: { value: '0000046275' } })
    await userEvent.click(screen.getByRole('button', { name: 'Add application' }))

    await waitFor(() =>
      expect(mockedFetchProvincialExemptionCreatePreview).toHaveBeenCalledWith(['46275']),
    )
    expect(screen.getByRole('list', { name: 'Selected applications' })).toHaveTextContent('46275')
  })

  it('submits a standalone Ministerial exemption without an application', async () => {
    mockedSubmitProvincialExemptionCreate.mockResolvedValue(successfulCreate('EX-900'))

    render(
      <MemoryRouter initialEntries={['/provincial/exemption/create']}>
        <Routes>
          <Route path="/provincial/exemption/create" element={<ProvincialExemptionCreatePage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(
      await screen.findByRole('combobox', { name: 'Application number (optional)' }),
    ).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Exemption type' })).toHaveValue('Ministerial'),
    )
    const statusSelect = screen.getByRole('combobox', { name: 'Exemption status' })
    expect(statusSelect).toHaveValue('New')
    expect(statusSelect).toBeDisabled()
    expect(statusSelect).not.toHaveAttribute('aria-required', 'true')
    expect(screen.getByText('Exemption status')).not.toHaveClass('required-label')
    expect(screen.getByLabelText('Approval date (YYYY-MM-DD)')).toBeDisabled()
    await userEvent.type(screen.getByLabelText('Approved volume (m³)'), '250.5')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(mockedSubmitProvincialExemptionCreate).toHaveBeenCalledWith({
      applicationNumber: '',
      linkedApplicationNumbers: [],
      exemptionNumber: '',
      exemptionTypeCode: 'M',
      exemptionStatusCode: 'NEW',
      approvalDate: '',
      expiryDate: '',
      approvedVolume: '250.5',
      enableRateOverride: false,
      feeRate: '',
      regionNumbers: [],
      otherConditions: '',
    })
    expect(mockNavigate).toHaveBeenCalledWith('/provincial/exemption/EX-900')
  })

  it('enforces active status and custom number when selecting OIC', async () => {
    render(
      <MemoryRouter initialEntries={['/provincial/exemption/create']}>
        <Routes>
          <Route path="/provincial/exemption/create" element={<ProvincialExemptionCreatePage />} />
        </Routes>
      </MemoryRouter>,
    )

    await chooseComboBoxOption(
      await screen.findByRole('combobox', { name: 'Exemption type' }),
      'Order in Council',
    )

    expect(screen.getByRole('combobox', { name: 'Exemption status' })).toHaveValue('Active')
    expect(screen.getByRole('combobox', { name: 'Exemption status' })).toBeDisabled()
    expect(screen.getByLabelText('Approval date (YYYY-MM-DD)')).toBeEnabled()
    expect(screen.getByLabelText('Exemption number')).toHaveAttribute('maxlength', '8')
    expect(
      screen.getByRole('combobox', { name: 'Application number (optional)' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Enable fee rate override')).toBeInTheDocument()
  })

  it('rejects exemption text that Oracle cannot store', async () => {
    render(
      <MemoryRouter initialEntries={['/provincial/exemption/create']}>
        <Routes>
          <Route path="/provincial/exemption/create" element={<ProvincialExemptionCreatePage />} />
        </Routes>
      </MemoryRouter>,
    )

    await chooseComboBoxOption(
      await screen.findByRole('combobox', { name: 'Exemption type' }),
      'Order in Council',
    )
    await userEvent.type(screen.getByLabelText('Exemption number'), 'OIC-é')
    const conditions = screen.getByLabelText('Conditions')
    expect(conditions).toHaveAttribute('maxlength', '250')
    expect(document.querySelector('.cds--text-area__label-counter')).toHaveTextContent('0/250')
    await userEvent.type(conditions, 'Résumé')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(
      (
        await screen.findAllByText(
          'Exemption number contains unsupported characters. Use unaccented letters, numbers, spaces, or standard punctuation.',
        )
      ).length,
    ).toBeGreaterThanOrEqual(1)
    expect(
      (
        await screen.findAllByText(
          'Conditions contain unsupported characters. Use unaccented letters, numbers, spaces, or standard punctuation.',
        )
      ).length,
    ).toBeGreaterThanOrEqual(1)
    expect(mockedSubmitProvincialExemptionCreate).not.toHaveBeenCalled()
  })

  it('submits standalone Blanket OIC fields and hides regular applications', async () => {
    mockedSubmitProvincialExemptionCreate.mockResolvedValue(successfulCreate('BOIC-1'))

    render(
      <MemoryRouter initialEntries={['/provincial/exemption/create']}>
        <Routes>
          <Route path="/provincial/exemption/create" element={<ProvincialExemptionCreatePage />} />
        </Routes>
      </MemoryRouter>,
    )

    await chooseComboBoxOption(
      await screen.findByRole('combobox', { name: 'Exemption type' }),
      'Blanket OIC',
    )
    expect(
      screen.queryByRole('combobox', { name: 'Application number (optional)' }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Exemption status' })).toHaveValue('Active')
    expect(screen.getByLabelText('Approved volume (m³)')).toHaveValue('9999999.9')

    await userEvent.type(screen.getByLabelText('Exemption number'), 'BOIC-1')
    await userEvent.type(screen.getByLabelText('Approval date (YYYY-MM-DD)'), '2026-07-01')
    await userEvent.type(screen.getByLabelText('Expiry date (YYYY-MM-DD)'), '2027-07-01')
    const regionComboBox = screen.getByRole('combobox', { name: /^Regions/ })
    await userEvent.click(regionComboBox)
    fireEvent.change(regionComboBox, { target: { value: 'Cariboo' } })
    await userEvent.click(
      await screen.findByRole('option', { name: 'Cariboo Natural Resource Region' }),
    )
    await userEvent.click(screen.getByLabelText('Enable fee rate override'))
    await userEvent.type(screen.getByLabelText('Fee rate ($/m³)'), '999.99')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(mockedSubmitProvincialExemptionCreate).toHaveBeenCalledWith({
      applicationNumber: '',
      linkedApplicationNumbers: [],
      exemptionNumber: 'BOIC-1',
      exemptionTypeCode: 'B',
      exemptionStatusCode: 'ACT',
      approvalDate: '2026-07-01',
      expiryDate: '2027-07-01',
      approvedVolume: '9999999.9',
      enableRateOverride: true,
      feeRate: '999.99',
      regionNumbers: ['1903'],
      otherConditions: '',
    })
    expect(mockNavigate).toHaveBeenCalledWith('/provincial/exemption/BOIC-1')
  })

  it('preserves operator volume and clears only the Blanket OIC sentinel', async () => {
    render(
      <MemoryRouter initialEntries={['/provincial/exemption/create']}>
        <Routes>
          <Route path="/provincial/exemption/create" element={<ProvincialExemptionCreatePage />} />
        </Routes>
      </MemoryRouter>,
    )

    const typeSelect = await screen.findByRole('combobox', { name: 'Exemption type' })
    const volumeInput = screen.getByLabelText('Approved volume (m³)')
    await userEvent.type(volumeInput, '125.5')
    await chooseComboBoxOption(typeSelect, 'Blanket OIC')
    expect(volumeInput).toHaveValue('125.5')
    await chooseComboBoxOption(typeSelect, 'Ministerial')
    expect(volumeInput).toHaveValue('125.5')

    await userEvent.clear(volumeInput)
    await chooseComboBoxOption(typeSelect, 'Blanket OIC')
    expect(volumeInput).toHaveValue('9999999.9')
    await chooseComboBoxOption(typeSelect, 'Order in Council')
    expect(volumeInput).toHaveValue('')
  })

  it('rejects an OIC number beyond eight characters', async () => {
    render(
      <MemoryRouter initialEntries={['/provincial/exemption/create']}>
        <Routes>
          <Route path="/provincial/exemption/create" element={<ProvincialExemptionCreatePage />} />
        </Routes>
      </MemoryRouter>,
    )

    await chooseComboBoxOption(
      await screen.findByRole('combobox', { name: 'Exemption type' }),
      'Order in Council',
    )
    fireEvent.change(screen.getByLabelText('Exemption number'), { target: { value: 'OIC-12345' } })
    await userEvent.type(screen.getByLabelText('Approval date (YYYY-MM-DD)'), '2026-07-01')
    await userEvent.type(screen.getByLabelText('Expiry date (YYYY-MM-DD)'), '2027-07-01')
    await userEvent.type(screen.getByLabelText('Approved volume (m³)'), '250.5')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(
      await screen.findAllByText('Exemption number must be 8 characters or fewer.'),
    ).not.toHaveLength(0)
    expect(mockedSubmitProvincialExemptionCreate).not.toHaveBeenCalled()
  })

  it('keeps save disabled after unavailable option warning is dismissed', async () => {
    mockedFetchProvincialExemptionOptions.mockResolvedValueOnce({
      exemptionTypes: [],
      exemptionStatuses: [],
      regions: [],
    })

    render(
      <MemoryRouter initialEntries={['/provincial/exemption/create']}>
        <Routes>
          <Route path="/provincial/exemption/create" element={<ProvincialExemptionCreatePage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText('Required options not configured')).toBeInTheDocument()
    const notification = screen
      .getByText('Required options not configured')
      .closest('[role="status"]')
    const closeButton = notification?.querySelector<HTMLButtonElement>('button')
    expect(closeButton).toBeTruthy()
    await userEvent.click(closeButton as HTMLButtonElement)
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('fails application creation closed when authoritative options cannot be loaded', async () => {
    mockedFetchProvincialApplicationOptions.mockRejectedValueOnce(new Error('private failure'))

    render(
      <MemoryRouter initialEntries={['/provincial/application/create']}>
        <Routes>
          <Route
            path="/provincial/application/create"
            element={<ProvincialApplicationCreatePage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText('Options unavailable')).toBeInTheDocument()
    await selectApplicationCreateTab('Application')
    expect(screen.getByRole('combobox', { name: 'Product type' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(
      screen.getByText('Options unavailable').closest('[role="status"]')?.querySelector('button'),
    ).toBeNull()
  })

  it('preserves federal multi-application query prefill in the successful create payload', async () => {
    mockedSubmitProvincialExemptionCreate.mockResolvedValue(successfulCreate('EX-FED-777'))

    render(
      <MemoryRouter
        initialEntries={['/provincial/exemption/create?applications=301,302&source=federal']}
      >
        <Routes>
          <Route path="/provincial/exemption/create" element={<ProvincialExemptionCreatePage />} />
        </Routes>
      </MemoryRouter>,
    )

    await screen.findByRole('heading', { level: 1, name: 'Create exemption' })
    expect(
      screen.getByText('Enter exemption details for the selected federal applications.'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Selected application numbers')).toHaveValue('301\n302')
    expect(screen.queryByLabelText('Application number')).not.toBeInTheDocument()

    await waitFor(() => expect(screen.getByLabelText('Approved volume (m³)')).toHaveValue('250.5'))

    await chooseComboBoxOption(
      screen.getByRole('combobox', { name: 'Exemption type' }),
      'Section 1',
    )
    await chooseComboBoxOption(screen.getByRole('combobox', { name: 'Exemption status' }), 'New')
    await userEvent.type(screen.getByLabelText('Approval date (YYYY-MM-DD)'), '2026-02-01')
    await userEvent.clear(screen.getByLabelText('Expiry date (YYYY-MM-DD)'))
    await userEvent.type(screen.getByLabelText('Expiry date (YYYY-MM-DD)'), '2026-12-31')
    await userEvent.clear(screen.getByLabelText('Approved volume (m³)'))
    await userEvent.type(screen.getByLabelText('Approved volume (m³)'), '500')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(mockedSubmitProvincialExemptionCreate).toHaveBeenCalledWith({
      applicationNumber: '301',
      linkedApplicationNumbers: ['301', '302'],
      exemptionNumber: '',
      exemptionTypeCode: 'SECTION_1',
      exemptionStatusCode: 'NEW',
      approvalDate: '2026-02-01',
      expiryDate: '2026-12-31',
      approvedVolume: '500',
      enableRateOverride: false,
      feeRate: '',
      regionNumbers: [],
      otherConditions: '',
    })
    expect(mockNavigate).toHaveBeenCalledWith('/provincial/exemption/EX-FED-777')
  })

  it('blocks a direct federal prefill when federal application access is absent', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        canPerform: (action: string) => action !== 'viewFederalApplication',
      }),
    )

    render(
      <MemoryRouter
        initialEntries={['/provincial/exemption/create?applications=301&source=federal']}
      >
        <Routes>
          <Route path="/provincial/exemption/create" element={<ProvincialExemptionCreatePage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(
      await screen.findByText(
        'Your session cannot create an exemption from the selected federal applications.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(mockedSubmitProvincialExemptionCreate).not.toHaveBeenCalled()
  })

  it('fails closed when the selected applications cannot be previewed', async () => {
    mockedFetchProvincialExemptionCreatePreview.mockRejectedValueOnce(
      new Error('Application 321 must have a status of approved.'),
    )

    render(
      <MemoryRouter initialEntries={['/provincial/exemption/create?applications=321']}>
        <Routes>
          <Route path="/provincial/exemption/create" element={<ProvincialExemptionCreatePage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(
      await screen.findByText('Application 321 must have a status of approved.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(mockedSubmitProvincialExemptionCreate).not.toHaveBeenCalled()
  })

  it.each(['EXEMPTION_APPROVER', 'LEXIS_EXEMPTION_APPROVER'])(
    'hides blanket OIC creation from pure %s identities',
    async (role) => {
      mockedUseAuth.mockReturnValue(
        createTestAuthContext({
          capabilities: createTestCapabilities({
            principal: 'idir\\exemption-approver',
            roles: [role],
          }),
        }),
      )
      mockedFetchProvincialExemptionOptions.mockResolvedValue({
        exemptionTypes: [
          { value: 'SECTION_1', label: 'Section 1' },
          { value: 'B', label: 'Blanket OIC' },
        ],
        exemptionStatuses: [{ value: 'NEW', label: 'New' }],
        regions: [{ value: '11', label: 'Cariboo' }],
      })

      render(
        <MemoryRouter initialEntries={['/provincial/exemption/create']}>
          <Routes>
            <Route
              path="/provincial/exemption/create"
              element={<ProvincialExemptionCreatePage />}
            />
          </Routes>
        </MemoryRouter>,
      )

      const typeSelect = await screen.findByRole('combobox', { name: 'Exemption type' })
      await userEvent.click(typeSelect)

      expect(await screen.findByRole('option', { name: 'Section 1' })).toBeInTheDocument()
      expect(screen.queryByRole('option', { name: 'Blanket OIC' })).not.toBeInTheDocument()
    },
  )

  it('retains blanket OIC creation for a mixed industry exemption approver identity', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({
          principal: 'bceid\\industry-approver',
          roles: ['EXEMPTION_APPROVER', 'PROVINCIAL_SUBMITTER_00012345'],
        }),
      }),
    )

    render(
      <MemoryRouter initialEntries={['/provincial/exemption/create']}>
        <Routes>
          <Route path="/provincial/exemption/create" element={<ProvincialExemptionCreatePage />} />
        </Routes>
      </MemoryRouter>,
    )

    const typeSelect = await screen.findByRole('combobox', { name: 'Exemption type' })
    await userEvent.click(typeSelect)

    expect(await screen.findByRole('option', { name: 'Blanket OIC' })).toBeInTheDocument()
  })

  it('blocks provincial exemption submit when status is missing', async () => {
    render(
      <MemoryRouter
        initialEntries={[
          '/provincial/exemption/create?applications=321&ownerClientNumber=00033333&applicantClientNumber=00044444',
        ]}
      >
        <Routes>
          <Route path="/provincial/exemption/create" element={<ProvincialExemptionCreatePage />} />
        </Routes>
      </MemoryRouter>,
    )

    await screen.findByRole('heading', { level: 1, name: 'Create exemption' })
    await chooseComboBoxOption(
      screen.getByRole('combobox', { name: 'Exemption type' }),
      'Section 1',
    )
    await clearComboBox(screen.getByRole('combobox', { name: 'Exemption status' }))
    await userEvent.clear(screen.getByLabelText(/Approved Volume/i))
    await userEvent.type(screen.getByLabelText(/Approved Volume/i), '500')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(screen.getAllByText('Exemption status is required.').length).toBeGreaterThan(0)
    expect(mockedSubmitProvincialExemptionCreate).not.toHaveBeenCalled()
  })

  it('blocks provincial exemption submit when approved volume exceeds Oracle precision', async () => {
    render(
      <MemoryRouter
        initialEntries={[
          '/provincial/exemption/create?applications=321&ownerClientNumber=00033333&applicantClientNumber=00044444',
        ]}
      >
        <Routes>
          <Route path="/provincial/exemption/create" element={<ProvincialExemptionCreatePage />} />
        </Routes>
      </MemoryRouter>,
    )

    await screen.findByRole('heading', { level: 1, name: 'Create exemption' })
    await chooseComboBoxOption(
      screen.getByRole('combobox', { name: 'Exemption type' }),
      'Section 1',
    )
    await chooseComboBoxOption(screen.getByRole('combobox', { name: 'Exemption status' }), 'New')
    await userEvent.clear(screen.getByLabelText(/Approved Volume/i))
    await userEvent.type(screen.getByLabelText(/Approved Volume/i), '121212122')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(
      await screen.findAllByText('Approved volume must be 9999999.99 or less.'),
    ).not.toHaveLength(0)
    expect(mockedSubmitProvincialExemptionCreate).not.toHaveBeenCalled()
  })

  it('requires a Section 1 exemption expiry after approval and accepts the next day', async () => {
    mockedSubmitProvincialExemptionCreate.mockResolvedValue(successfulCreate('EX-902'))

    render(
      <MemoryRouter initialEntries={['/provincial/exemption/create']}>
        <Routes>
          <Route path="/provincial/exemption/create" element={<ProvincialExemptionCreatePage />} />
        </Routes>
      </MemoryRouter>,
    )

    await chooseComboBoxOption(
      await screen.findByRole('combobox', { name: 'Exemption type' }),
      'Section 1',
    )
    await userEvent.type(screen.getByLabelText('Approval date (YYYY-MM-DD)'), '2026-07-01')
    const expiryDate = screen.getByLabelText('Expiry date (YYYY-MM-DD)')
    await userEvent.type(screen.getByLabelText('Approved volume (m³)'), '500')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(screen.getAllByText('Expiry date is required.').length).toBeGreaterThan(0)
    expect(mockedSubmitProvincialExemptionCreate).not.toHaveBeenCalled()

    await userEvent.type(expiryDate, '2026-07-01')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(
      screen.getAllByText('Expiry date must be after the approval date.').length,
    ).toBeGreaterThan(0)
    expect(mockedSubmitProvincialExemptionCreate).not.toHaveBeenCalled()

    await userEvent.clear(expiryDate)
    await userEvent.type(expiryDate, '2026-07-02')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(mockedSubmitProvincialExemptionCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          exemptionTypeCode: 'SECTION_1',
          approvalDate: '2026-07-01',
          expiryDate: '2026-07-02',
        }),
      ),
    )
  })

  it('blocks provincial exemption submit when approved volume has three decimals', async () => {
    render(
      <MemoryRouter initialEntries={['/provincial/exemption/create']}>
        <Routes>
          <Route path="/provincial/exemption/create" element={<ProvincialExemptionCreatePage />} />
        </Routes>
      </MemoryRouter>,
    )

    await chooseComboBoxOption(
      await screen.findByRole('combobox', { name: 'Exemption type' }),
      'Section 1',
    )
    await userEvent.type(screen.getByLabelText('Approved volume (m³)'), '250.999')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(
      screen.getAllByText('Approved volume must have no more than two decimal places.').length,
    ).toBeGreaterThan(0)
    expect(mockedSubmitProvincialExemptionCreate).not.toHaveBeenCalled()
  })

  it('accepts the maximum two-decimal provincial exemption volume', async () => {
    mockedSubmitProvincialExemptionCreate.mockResolvedValue(successfulCreate('EX-901'))

    render(
      <MemoryRouter initialEntries={['/provincial/exemption/create']}>
        <Routes>
          <Route path="/provincial/exemption/create" element={<ProvincialExemptionCreatePage />} />
        </Routes>
      </MemoryRouter>,
    )

    await userEvent.type(await screen.findByLabelText('Approved volume (m³)'), '9999999.99')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(mockedSubmitProvincialExemptionCreate).toHaveBeenCalledWith(
        expect.objectContaining({ approvedVolume: '9999999.99' }),
      )
    })
    expect(mockNavigate).toHaveBeenCalledWith('/provincial/exemption/EX-901')
  })

  it('submits provincial offer form and navigates to details', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({
          principal: 'idir\\approver',
          roles: ['APPLICATION_APPROVER'],
        }),
      }),
    )
    mockedSubmitProvincialOfferCreate.mockResolvedValue({
      ...successfulCreate('8080'),
      warnings: ['Offer saved, but no client email address was found.'],
    })

    render(
      <MemoryRouter
        initialEntries={[
          '/provincial/offers/create?applicationNumber=2001&packageNumber=PKG-9&offeringClientNumber=00099999&region=forged&purchaseOfferDate=1999-01-01&offerWithdrawalDate=2026-03-20&withdrawReason=forged',
        ]}
      >
        <Routes>
          <Route path="/provincial/offers/create" element={<ProvincialOfferCreatePage />} />
        </Routes>
      </MemoryRouter>,
    )

    await screen.findByRole('heading', { level: 1, name: 'Create provincial offer' })
    expect(screen.getByText('Enter offer details and save a new offer.')).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    const offerFormActions = screen.getByRole('group', { name: 'Offer form actions' })
    expect(
      within(offerFormActions)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Cancel', 'Save new offer'])
    expect(within(offerFormActions).getByRole('button', { name: 'Cancel' })).toHaveAttribute(
      'type',
      'button',
    )
    expect(
      within(offerFormActions).getByRole('button', { name: 'Save new offer' }),
    ).toHaveAttribute('type', 'button')
    expect(screen.queryByRole('group', { name: 'New offer state' })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: /offer number/i })).not.toBeInTheDocument()
    const offerSections = [
      screen.getByRole('group', { name: 'Application details' }),
      screen.getByRole('group', { name: 'Offering company details' }),
      screen.getByRole('group', { name: 'Offer details' }),
      screen.getByRole('group', { name: 'Offer withdrawals' }),
      screen.getByRole('group', { name: 'Approval' }),
    ]
    const offerSectionStack = offerSections[0].closest('.provincial-offer-section-stack')
    expect(offerSectionStack).toHaveClass('create-form-tile')
    expect(offerSectionStack).not.toHaveClass('cds--tile')
    for (const section of offerSections) {
      expect(section).toHaveClass('create-form-section')
      expect(section).toHaveClass('offer-form-section')
      expect(section.parentElement).toBe(offerSectionStack)
      expect(section.querySelector('.legacy-search-grid')).toHaveClass('create-form-grid')
    }
    expect(screen.getByRole('button', { name: 'See Scale Detail' })).toBeEnabled()
    expect(await screen.findByDisplayValue('PKG-9')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'See Scale Detail' }))
    expect(mockNavigate).toHaveBeenCalledWith(
      '/provincial/application/2001?tab=items&packageNumber=PKG-9&section=scales',
    )
    expect(await screen.findByDisplayValue('95.0')).toBeInTheDocument()
    expect(screen.getByDisplayValue('H/SA')).toBeInTheDocument()
    expect(screen.getByDisplayValue('03/01/2026')).toBeInTheDocument()
    expect(screen.getByLabelText('Region')).toHaveValue('Cariboo Natural Resource Region')
    expect(screen.getByLabelText('Region')).toHaveAttribute('readonly')
    expect(screen.getByLabelText('Offer received date')).toHaveValue(formatBusinessIsoDate())
    expect(screen.getByLabelText('Offer received date')).toHaveAttribute('readonly')
    expect(screen.getByLabelText('Offer withdrawal date')).toHaveValue('')
    expect(screen.getByLabelText('Offer withdrawal date')).toHaveAttribute('readonly')
    expect(screen.getByLabelText('Offer withdrawal reason')).toHaveValue('')
    expect(screen.getByLabelText('Offer withdrawal reason')).toHaveAttribute('readonly')
    expect(screen.queryByLabelText('Offering client number')).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Fair market value' })).toBeInTheDocument()
    expect(screen.getByLabelText('Offer remarks')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Company'), 'Example Lumber')
    await userEvent.type(screen.getByLabelText('Contact name'), 'Sample Contact')
    await userEvent.type(screen.getByLabelText('Offer volume (m³)'), '94.9')
    await userEvent.type(screen.getByLabelText('Offer amount ($/m³)'), '25000')
    await userEvent.type(screen.getByLabelText('Pickup location'), 'Yard A')
    await userEvent.type(screen.getByLabelText('Offer conditions / remarks'), 'No partial loads')
    await userEvent.type(screen.getByLabelText('Offer remarks'), 'Ready for review')

    expect(screen.queryByRole('button', { name: 'Submit' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save Draft' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Back to Search' })).not.toBeInTheDocument()
    const saveButton = screen.getByRole('button', { name: 'Save new offer' })
    expect(saveButton).toBeEnabled()
    await userEvent.click(saveButton)

    await waitFor(() => {
      expect(mockedSubmitProvincialOfferCreate).toHaveBeenCalledWith({
        applicationNumber: '2001',
        packageNumber: 'PKG-9',
        offeringClientNumber: '',
        companyName: 'Example Lumber',
        contactName: 'Sample Contact',
        offerVolume: '94.9',
        purchaseOfferAmount: '25000',
        teacReviewDate: '',
        fairOfferIndicator: 'N',
        validOfferIndicator: 'Y',
        approvalIndicator: 'N',
        offerRemark: 'Ready for review',
        pickupLocation: 'Yard A',
        offerCondition: 'No partial loads',
        offerInEffectUntil: '',
      })
    })
    expect(mockNavigate).toHaveBeenCalledWith('/provincial/offers/8080', {
      state: {
        offerCreationNotice: {
          warnings: ['Offer saved, but no client email address was found.'],
        },
      },
    })
  }, 15000)

  it('rejects an offer volume above the selected package volume', async () => {
    render(
      <MemoryRouter
        initialEntries={[
          '/provincial/offers/create?applicationNumber=2001&packageNumber=PKG-9&companyName=Example%20Lumber&contactName=Sample%20Contact&pickupLocation=Yard%20A&purchaseOfferAmount=25000&offerVolume=95.1',
        ]}
      >
        <Routes>
          <Route path="/provincial/offers/create" element={<ProvincialOfferCreatePage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByDisplayValue('95.0')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Save new offer' }))

    expect(
      await screen.findAllByText('Offer volume cannot exceed the application/package volume.'),
    ).not.toHaveLength(0)
    expect(mockedSubmitProvincialOfferCreate).not.toHaveBeenCalled()
  })

  it('waits for the selected package volume before validating or saving', async () => {
    let resolveSelectedPackageVolume: (volume: string) => void = () => undefined
    const selectedPackageVolume = new Promise<string>((resolve) => {
      resolveSelectedPackageVolume = resolve
    })
    mockedFetchOfferPackageList.mockResolvedValue(['PKG-10', 'PKG-11'])
    mockedFetchOfferPackageVolume.mockImplementation((packageNumber) =>
      packageNumber === 'PKG-10' ? Promise.resolve('120.0') : selectedPackageVolume,
    )

    render(
      <MemoryRouter
        initialEntries={[
          '/provincial/offers/create?applicationNumber=2001&packageNumber=PKG-10&packageNumbers=PKG-10%2CPKG-11&companyName=Example%20Lumber&contactName=Sample%20Contact&pickupLocation=Yard%20A&purchaseOfferAmount=25000&offerVolume=100.0',
        ]}
      >
        <Routes>
          <Route path="/provincial/offers/create" element={<ProvincialOfferCreatePage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByDisplayValue('120.0')).toBeInTheDocument()
    const saveButton = screen.getByRole('button', { name: 'Save new offer' })
    expect(saveButton).toBeEnabled()

    await chooseComboBoxOption(screen.getByRole('combobox', { name: 'Package number' }), 'PKG-11')

    await waitFor(() => expect(mockedFetchOfferPackageVolume).toHaveBeenCalledWith('PKG-11'))
    expect(saveButton).toBeDisabled()
    expect(screen.queryByDisplayValue('120.0')).not.toBeInTheDocument()
    expect(mockedSubmitProvincialOfferCreate).not.toHaveBeenCalled()

    await act(async () => resolveSelectedPackageVolume('80.0'))

    expect(await screen.findByDisplayValue('80.0')).toBeInTheDocument()
    expect(saveButton).toBeEnabled()
    await userEvent.click(saveButton)
    expect(
      await screen.findAllByText('Offer volume cannot exceed the application/package volume.'),
    ).not.toHaveLength(0)
    expect(mockedSubmitProvincialOfferCreate).not.toHaveBeenCalled()
  })

  it('keeps offer saving unavailable when the selected package volume fails to load', async () => {
    mockedFetchOfferPackageVolume.mockRejectedValue(new Error('Package volume unavailable'))

    render(
      <MemoryRouter
        initialEntries={[
          '/provincial/offers/create?applicationNumber=2001&packageNumber=PKG-9&companyName=Example%20Lumber&contactName=Sample%20Contact&pickupLocation=Yard%20A&purchaseOfferAmount=25000&offerVolume=90.0',
        ]}
      >
        <Routes>
          <Route path="/provincial/offers/create" element={<ProvincialOfferCreatePage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(
      await screen.findByText(
        'Application/package volume could not be loaded. Reload the page to try again.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save new offer' })).toBeDisabled()
    expect(mockedSubmitProvincialOfferCreate).not.toHaveBeenCalled()
  })

  it('keeps offer saving unavailable when the selected package volume is malformed', async () => {
    mockedFetchOfferPackageVolume.mockResolvedValue('not-a-volume')

    render(
      <MemoryRouter
        initialEntries={[
          '/provincial/offers/create?applicationNumber=2001&packageNumber=PKG-9&companyName=Example%20Lumber&contactName=Sample%20Contact&pickupLocation=Yard%20A&purchaseOfferAmount=25000&offerVolume=90.0',
        ]}
      >
        <Routes>
          <Route path="/provincial/offers/create" element={<ProvincialOfferCreatePage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(
      await screen.findByText(
        'Application/package volume could not be loaded. Reload the page to try again.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save new offer' })).toBeDisabled()
    expect(mockedSubmitProvincialOfferCreate).not.toHaveBeenCalled()
  })

  it('keeps offer saving unavailable when the application package list fails to load', async () => {
    mockedFetchOfferPackageList.mockRejectedValue(new Error('Package list unavailable'))

    render(
      <MemoryRouter
        initialEntries={[
          '/provincial/offers/create?applicationNumber=2001&companyName=Example%20Lumber&contactName=Sample%20Contact&pickupLocation=Yard%20A&purchaseOfferAmount=25000&offerVolume=90.0',
        ]}
      >
        <Routes>
          <Route path="/provincial/offers/create" element={<ProvincialOfferCreatePage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(
      await screen.findByText(
        'Application packages could not be loaded. Reload the page and try again.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save new offer' })).toBeDisabled()
    expect(mockedSubmitProvincialOfferCreate).not.toHaveBeenCalled()
  })

  it('keeps offer saving unavailable when a no-package application volume is malformed', async () => {
    mockedFetchOfferPackageList.mockResolvedValue([])
    mockedFetchOfferApplicationVolume.mockResolvedValue('not-a-volume')

    render(
      <MemoryRouter
        initialEntries={[
          '/provincial/offers/create?applicationNumber=2001&companyName=Example%20Lumber&contactName=Sample%20Contact&pickupLocation=Yard%20A&purchaseOfferAmount=25000&offerVolume=90.0',
        ]}
      >
        <Routes>
          <Route path="/provincial/offers/create" element={<ProvincialOfferCreatePage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(
      await screen.findByText(
        'Application volume could not be loaded. Reload the page and try again.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save new offer' })).toBeDisabled()
    expect(mockedSubmitProvincialOfferCreate).not.toHaveBeenCalled()
  })

  it('preserves the raw offer volume while the selected package volume loads', async () => {
    let resolvePackageVolume: (volume: string) => void = () => undefined
    const packageVolume = new Promise<string>((resolve) => {
      resolvePackageVolume = resolve
    })
    mockedFetchOfferPackageVolume.mockReturnValue(packageVolume)

    render(
      <MemoryRouter
        initialEntries={[
          '/provincial/offers/create?applicationNumber=2001&packageNumber=PKG-9&companyName=Example%20Lumber&contactName=Sample%20Contact&pickupLocation=Yard%20A&purchaseOfferAmount=25000',
        ]}
      >
        <Routes>
          <Route path="/provincial/offers/create" element={<ProvincialOfferCreatePage />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() => expect(mockedFetchOfferPackageVolume).toHaveBeenCalledWith('PKG-9'))
    const saveButton = screen.getByRole('button', { name: 'Save new offer' })
    expect(saveButton).toBeDisabled()

    const offerVolumeInput = screen.getByLabelText('Offer volume (m³)')
    await userEvent.type(offerVolumeInput, '95.54')
    await userEvent.click(screen.getByLabelText('Offer amount ($/m³)'))
    expect(offerVolumeInput).toHaveValue('95.54')

    await act(async () => resolvePackageVolume('95.5'))

    expect(await screen.findByDisplayValue('95.5')).toBeInTheDocument()
    expect(saveButton).toBeEnabled()
    await userEvent.click(saveButton)
    expect(
      await screen.findAllByText('Offer volume cannot exceed the application/package volume.'),
    ).not.toHaveLength(0)
    expect(mockedSubmitProvincialOfferCreate).not.toHaveBeenCalled()
  })

  it('compares the raw offer volume before legacy blur formatting', async () => {
    mockedFetchOfferPackageVolume.mockResolvedValue('95.5')
    render(
      <MemoryRouter
        initialEntries={[
          '/provincial/offers/create?applicationNumber=2001&packageNumber=PKG-9&companyName=Example%20Lumber&contactName=Sample%20Contact&pickupLocation=Yard%20A&purchaseOfferAmount=25000',
        ]}
      >
        <Routes>
          <Route path="/provincial/offers/create" element={<ProvincialOfferCreatePage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByDisplayValue('95.5')).toBeInTheDocument()
    const offerVolumeInput = screen.getByLabelText('Offer volume (m³)')
    await userEvent.type(offerVolumeInput, '95.54')
    await userEvent.click(screen.getByRole('button', { name: 'Save new offer' }))

    expect(offerVolumeInput).toHaveValue('95.54')
    expect(
      await screen.findAllByText('Offer volume cannot exceed the application/package volume.'),
    ).not.toHaveLength(0)
    expect(mockedSubmitProvincialOfferCreate).not.toHaveBeenCalled()
  })

  it('debounces offer context lookups while an application number is typed', async () => {
    render(
      <MemoryRouter initialEntries={['/provincial/offers/create']}>
        <Routes>
          <Route path="/provincial/offers/create" element={<ProvincialOfferCreatePage />} />
        </Routes>
      </MemoryRouter>,
    )

    await screen.findByRole('heading', { level: 1, name: 'Create provincial offer' })
    const applicationNumberInput = screen.getByLabelText('Application number')
    mockedValidateOfferApplication.mockClear()
    mockedFetchOfferApplicationDetails.mockClear()
    mockedFetchOfferPackageList.mockClear()
    mockedFetchOfferApplicationVolume.mockClear()

    for (const value of ['4', '46', '460', '4605', '46053']) {
      fireEvent.change(applicationNumberInput, { target: { value } })
    }

    expect(mockedValidateOfferApplication).not.toHaveBeenCalled()
    expect(mockedFetchOfferApplicationDetails).not.toHaveBeenCalled()
    expect(mockedFetchOfferPackageList).not.toHaveBeenCalled()
    expect(mockedFetchOfferApplicationVolume).not.toHaveBeenCalled()

    await waitFor(() => {
      expect(mockedValidateOfferApplication).toHaveBeenCalledTimes(1)
      expect(mockedValidateOfferApplication).toHaveBeenCalledWith('46053')
      expect(mockedFetchOfferApplicationDetails).toHaveBeenCalledTimes(1)
      expect(mockedFetchOfferPackageList).toHaveBeenCalledTimes(1)
      expect(mockedFetchOfferApplicationVolume).toHaveBeenCalledTimes(1)
    })
  })

  it('rejects malformed offer application numbers before remote lookup', async () => {
    render(
      <MemoryRouter initialEntries={['/provincial/offers/create']}>
        <Routes>
          <Route path="/provincial/offers/create" element={<ProvincialOfferCreatePage />} />
        </Routes>
      </MemoryRouter>,
    )

    await screen.findByRole('heading', { level: 1, name: 'Create provincial offer' })
    mockedValidateOfferApplication.mockClear()
    fireEvent.change(screen.getByLabelText('Application number'), {
      target: { value: '1e3' },
    })
    await userEvent.click(screen.getByRole('button', { name: 'Save new offer' }))

    expect(
      screen.getAllByText('Application number must be a positive whole number.'),
    ).not.toHaveLength(0)
    await new Promise((resolve) => window.setTimeout(resolve, 350))
    expect(mockedValidateOfferApplication).not.toHaveBeenCalled()
    expect(mockedSubmitProvincialOfferCreate).not.toHaveBeenCalled()
  })

  it('blocks offers against a federal application before loading offer details', async () => {
    const eligibilityError = 'Application 2001 does not have a valid jurisdiction to accept offers'
    mockedValidateOfferApplication.mockResolvedValue({
      isValid: false,
      errors: [eligibilityError],
    })

    render(
      <MemoryRouter initialEntries={['/provincial/offers/create?applicationNumber=2001']}>
        <Routes>
          <Route path="/provincial/offers/create" element={<ProvincialOfferCreatePage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText(eligibilityError)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save new offer' })).toBeDisabled()
    expect(mockedFetchOfferApplicationDetails).not.toHaveBeenCalled()
    expect(mockedFetchOfferPackageList).not.toHaveBeenCalled()
    expect(mockedFetchOfferApplicationVolume).not.toHaveBeenCalled()
    expect(mockedSubmitProvincialOfferCreate).not.toHaveBeenCalled()
  })

  it('shows an offer save validation error returned by the backend', async () => {
    const saveError = 'Application 2001 does not have a valid jurisdiction to accept offers'
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({
          principal: 'idir\\approver',
          roles: ['APPLICATION_APPROVER'],
        }),
      }),
    )
    mockedSubmitProvincialOfferCreate.mockResolvedValue({
      success: false,
      message: '',
      errors: [saveError],
      warnings: [],
    })

    render(
      <MemoryRouter
        initialEntries={[
          '/provincial/offers/create?applicationNumber=2001&packageNumber=PKG-9&offeringClientNumber=00099999',
        ]}
      >
        <Routes>
          <Route path="/provincial/offers/create" element={<ProvincialOfferCreatePage />} />
        </Routes>
      </MemoryRouter>,
    )

    await screen.findByDisplayValue('PKG-9')
    await userEvent.type(screen.getByLabelText('Company'), 'Example Lumber')
    await userEvent.type(screen.getByLabelText('Contact name'), 'Sample Contact')
    await userEvent.type(screen.getByLabelText('Offer amount ($/m³)'), '25000')
    await userEvent.type(screen.getByLabelText('Pickup location'), 'Yard A')
    await userEvent.click(screen.getByRole('button', { name: 'Save new offer' }))

    expect(await screen.findByText(saveError)).toBeInTheDocument()
    expect(mockedSubmitProvincialOfferCreate).toHaveBeenCalledTimes(1)
  })

  it('uses the authoritative scoped client and non-approver offer defaults', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({
          principal: 'bceid\\buyer',
          roles: ['PROVINCIAL_SUBMITTER_00077881'],
          forestClientNumber: '77881',
        }),
      }),
    )
    mockedSubmitProvincialOfferCreate.mockResolvedValue(successfulCreate('8084'))

    render(
      <MemoryRouter
        initialEntries={[
          '/provincial/offers/create?applicationNumber=2001&packageNumber=PKG-9&offeringClientNumber=00099999&companyName=Scoped%20Buyer&contactName=Buyer%20Contact&region=11&pickupLocation=Yard&purchaseOfferAmount=250&purchaseOfferDate=2026-03-10&teacReviewDate=not-a-date&fairOfferIndicator=Y&validOfferIndicator=N&approvalIndicator=Y&offerRemark=forged',
        ]}
      >
        <Routes>
          <Route path="/provincial/offers/create" element={<ProvincialOfferCreatePage />} />
        </Routes>
      </MemoryRouter>,
    )

    await screen.findByRole('heading', { level: 1, name: 'Create provincial offer' })
    const clientNumber = await screen.findByDisplayValue('00077881')
    expect(clientNumber).toHaveAttribute('readonly')
    expect(mockedFetchOfferClientData).toHaveBeenCalledWith('77881')
    expect(screen.queryByDisplayValue('00099999')).not.toBeInTheDocument()
    expect(await screen.findByDisplayValue('Authoritative Buyer Ltd.')).toHaveAttribute('readonly')
    expect(screen.queryByDisplayValue('Scoped Buyer')).not.toBeInTheDocument()
    const contactName = screen.getByLabelText('Contact name')
    expect(contactName).toHaveValue('')
    expect(screen.queryByDisplayValue('Buyer Contact')).not.toBeInTheDocument()
    expect(screen.getByLabelText('TEAC review date')).toHaveAttribute('readonly')
    expect(screen.getByLabelText('Fair market value')).toHaveAttribute('readonly')
    expect(screen.getByLabelText('Valid offer')).toHaveAttribute('readonly')
    expect(screen.getByLabelText('Offer approved')).toHaveAttribute('readonly')
    expect(screen.queryByLabelText('Offer remarks')).not.toBeInTheDocument()
    await userEvent.type(contactName, 'Buyer Contact')

    await userEvent.click(screen.getByRole('button', { name: 'Save new offer' }))

    await waitFor(() => {
      expect(mockedSubmitProvincialOfferCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          offeringClientNumber: '00077881',
          companyName: 'Authoritative Buyer Ltd.',
          contactName: 'Buyer Contact',
          teacReviewDate: '',
          fairOfferIndicator: 'N',
          validOfferIndicator: 'Y',
          approvalIndicator: 'N',
          offerRemark: '',
        }),
      )
    })
    expect(mockNavigate).toHaveBeenCalledWith('/provincial/offers/8084')
  })

  it('keeps a dual-role approver scoped to its authoritative offering client', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({
          principal: 'idir\\scoped-approver',
          roles: ['APPLICATION_APPROVER', 'PROVINCIAL_SUBMITTER_00077881'],
          forestClientNumber: '00077881',
        }),
      }),
    )

    render(
      <MemoryRouter
        initialEntries={[
          '/provincial/offers/create?applicationNumber=2001&packageNumber=PKG-9&offeringClientNumber=00099999',
        ]}
      >
        <Routes>
          <Route path="/provincial/offers/create" element={<ProvincialOfferCreatePage />} />
        </Routes>
      </MemoryRouter>,
    )

    await screen.findByRole('heading', { level: 1, name: 'Create provincial offer' })
    expect(await screen.findByDisplayValue('00077881')).toHaveAttribute('readonly')
    expect(await screen.findByDisplayValue('Authoritative Buyer Ltd.')).toHaveAttribute('readonly')
    expect(screen.queryByDisplayValue('00099999')).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Fair market value' })).toBeInTheDocument()
    expect(screen.getByLabelText('Offer remarks')).toBeInTheDocument()
  })

  it('fails closed when a scoped offering company cannot be loaded', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({
          principal: 'bceid\\buyer',
          roles: ['PROVINCIAL_SUBMITTER_00077881'],
          forestClientNumber: '00077881',
        }),
      }),
    )
    mockedFetchOfferClientData.mockResolvedValue(null)

    render(
      <MemoryRouter
        initialEntries={[
          '/provincial/offers/create?applicationNumber=2001&packageNumber=PKG-9&companyName=Forged%20Company&contactName=Forged%20Contact&region=11&pickupLocation=Yard&purchaseOfferAmount=250&purchaseOfferDate=2026-03-10',
        ]}
      >
        <Routes>
          <Route path="/provincial/offers/create" element={<ProvincialOfferCreatePage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText('Offering client unavailable')).toBeInTheDocument()
    expect(screen.getByLabelText('Company')).toHaveValue('')
    expect(screen.getByLabelText('Contact name')).toHaveValue('')
    expect(screen.queryByDisplayValue('Forged Company')).not.toBeInTheDocument()
    expect(screen.queryByDisplayValue('Forged Contact')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Save new offer' }))
    expect(await screen.findAllByText('Company name is required.')).not.toHaveLength(0)
    expect(mockedSubmitProvincialOfferCreate).not.toHaveBeenCalled()
  })

  it('uses create offer query prefill for company, contact, pickup, and package options', async () => {
    mockedSubmitProvincialOfferCreate.mockResolvedValue(successfulCreate('8081'))
    mockedFetchOfferPackageList.mockResolvedValue(['PKG-10', 'PKG-11'])
    mockedFetchOfferPackageVolume.mockResolvedValue('120.0')

    render(
      <MemoryRouter
        initialEntries={[
          '/provincial/offers/create?applicationNumber=2001&packageNumber=PKG-10&packageNumbers=PKG-10%2CPKG-11&offeringClientNumber=00099999&companyName=Bell%20Pole%20Company&contactName=Dave%20Kohlen&region=11&pickupLocation=Van',
        ]}
      >
        <Routes>
          <Route path="/provincial/offers/create" element={<ProvincialOfferCreatePage />} />
        </Routes>
      </MemoryRouter>,
    )

    await screen.findByRole('heading', { level: 1, name: 'Create provincial offer' })
    expect(await screen.findByDisplayValue('PKG-10')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Bell Pole Company')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Dave Kohlen')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Van')).toBeInTheDocument()

    await chooseComboBoxOption(screen.getByRole('combobox', { name: 'Package number' }), 'PKG-11')
    expect(screen.getByDisplayValue('PKG-11')).toBeInTheDocument()
  })

  it('replaces stale create offer package query values with application package list values', async () => {
    mockedSubmitProvincialOfferCreate.mockResolvedValue(successfulCreate('8082'))
    mockedFetchOfferPackageList.mockResolvedValue(['PKG-10'])
    mockedFetchOfferPackageVolume.mockResolvedValue('120.0')

    render(
      <MemoryRouter
        initialEntries={[
          '/provincial/offers/create?applicationNumber=45964&packageNumber=45964&offeringClientNumber=00001012&companyName=Bell%20Pole%20Company&contactName=Dave%20Kohlen&region=11&pickupLocation=Van',
        ]}
      >
        <Routes>
          <Route path="/provincial/offers/create" element={<ProvincialOfferCreatePage />} />
        </Routes>
      </MemoryRouter>,
    )

    await screen.findByRole('heading', { level: 1, name: 'Create provincial offer' })
    expect(await screen.findByDisplayValue('PKG-10')).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('Offer amount ($/m³)'), '25000')
    await userEvent.click(screen.getByRole('button', { name: 'Save new offer' }))

    await waitFor(() => {
      expect(mockedSubmitProvincialOfferCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          applicationNumber: '45964',
          packageNumber: 'PKG-10',
        }),
      )
    })
  })

  it('allows provincial offer creation when legacy returns no packages', async () => {
    mockedSubmitProvincialOfferCreate.mockResolvedValue(successfulCreate('8083'))
    mockedFetchOfferPackageList.mockResolvedValue([])
    mockedFetchOfferApplicationVolume.mockResolvedValue('100.0')

    render(
      <MemoryRouter
        initialEntries={[
          '/provincial/offers/create?applicationNumber=45964&offeringClientNumber=00001012&companyName=Bell%20Pole%20Company&contactName=Dave%20Kohlen&region=11&pickupLocation=Van',
        ]}
      >
        <Routes>
          <Route path="/provincial/offers/create" element={<ProvincialOfferCreatePage />} />
        </Routes>
      </MemoryRouter>,
    )

    await screen.findByRole('heading', { level: 1, name: 'Create provincial offer' })
    expect(await screen.findByDisplayValue('No Packages')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'See Scale Detail' })).toBeDisabled()
    expect(screen.getByDisplayValue('100.0')).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('Offer amount ($/m³)'), '25000')
    await userEvent.click(screen.getByRole('button', { name: 'Save new offer' }))

    await waitFor(() => {
      expect(mockedSubmitProvincialOfferCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          applicationNumber: '45964',
          packageNumber: '',
        }),
      )
    })
    expect(mockNavigate).toHaveBeenCalledWith('/provincial/offers/8083')
  })
})
