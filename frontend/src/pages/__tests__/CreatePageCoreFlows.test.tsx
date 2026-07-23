import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
      async (clientNumber, clientLocationCode, applicantType) =>
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
          '/provincial/application/create?ownerClientNumber=00011111&ownerClientLocationCode=00&ownerContactName=Owner%20Contact&productTypeCode=LOG&exemptionReason=U&region=11&applicationDate=2026-01-09&applicationTermDays=30&receivedDate=2026-01-10&listingDate=2026-01-11&productLocation=Camp%201&applicationVolume=125.5&averageLogVolume=1.2&speciesCodes=HE&endUseCode=SA&comments=Ready',
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
    expect(screen.getByRole('region', { name: 'Application summary' })).toBeInTheDocument()
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
      'Summary',
      'Clients',
      'Packages / Scales',
      'Permits',
      'Offers',
      'Documents',
      'Remarks',
    ]) {
      expect(screen.getByRole('tab', { name: tabName })).toBeInTheDocument()
    }

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
      applicationTermMonths: '',
      applicationTermYears: '',
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
    expect(mockNavigate).toHaveBeenCalledWith('/provincial/application/901')
  })

  it('requires the application to be saved before creating a package', async () => {
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

    await selectApplicationCreateTab('Packages / Scales')
    const packageDetailsHeading = await screen.findByRole('heading', {
      name: 'Package Details',
    })
    const packageDetailsCard = packageDetailsHeading.closest('section')
    expect(packageDetailsCard).toHaveClass('application-items-card')
    expect(packageDetailsCard?.parentElement).toHaveClass('application-items-grid')

    const createPackageButton = screen.getByRole('button', { name: 'Create New Package' })
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

    await selectApplicationCreateTab('Packages / Scales')
    const selectedSpecies = await screen.findByRole('list', {
      name: 'Selected application species',
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
    expect(mockNavigate).toHaveBeenCalledWith('/provincial/application/906')
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Confirm application accuracy' }),
      ).not.toBeInTheDocument(),
    )

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    const postSaveDialog = screen.getByRole('dialog', { name: 'Confirm application accuracy' })
    expect(within(postSaveDialog).getByRole('checkbox', { name: 'I Agree' })).not.toBeChecked()
  })

  it('converts provincial application term months and years to total days on submit', async () => {
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

    const submitButton = await screen.findByRole('button', { name: 'Save' })
    await waitFor(() => expect(submitButton).toBeEnabled())
    await userEvent.click(submitButton)

    expect(mockedSubmitProvincialApplicationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationTermDays: '430',
        applicationTermMonths: '2',
        applicationTermYears: '1',
      }),
    )
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

    const regionComboBox = await screen.findByRole('combobox', { name: 'Region' })
    await waitFor(() => {
      expect(regionComboBox).toHaveValue('Cariboo Natural Resource Region')
    })

    await chooseComboBoxOption(regionComboBox, 'West Coast Natural Resource Region')
    await selectApplicationCreateTab('Packages / Scales')
    await chooseComboBoxOption(
      screen.getByRole('combobox', { name: 'Application species' }),
      'HE - Hemlock',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Add application species' }))
    expect(await screen.findByText('HE')).toBeInTheDocument()
    const submitButton = await screen.findByRole('button', { name: 'Save' })
    await waitFor(() => expect(submitButton).toBeEnabled())
    await userEvent.click(submitButton)

    expect(mockedSubmitProvincialApplicationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        region: '1910',
      }),
    )
  })

  it('submits provincial application with agent applicant fields', async () => {
    mockedSubmitProvincialApplicationCreate.mockResolvedValue(successfulCreate('902'))
    mockedFetchApplicationClientLocations.mockImplementation(async (clientNumber, applicantType) =>
      applicantType === 'agent'
        ? [{ locationCode: '01', locationName: '01 - AGENT LOCATION', selected: false }]
        : [{ locationCode: '00', locationName: '00 - OWNER LOCATION', selected: false }],
    )

    render(
      <MemoryRouter
        initialEntries={[
          '/provincial/application/create?ownerClientNumber=00011111&ownerClientLocationCode=00&ownerContactName=Owner%20Contact&ownerApplicantType=A&agentClientNumber=00033333&agentClientLocationCode=01&agentContactName=Agent%20Contact&productTypeCode=LOG&exemptionReason=U&region=11&applicationDate=2026-01-09&applicationTermDays=30&receivedDate=2026-01-10&listingDate=2026-01-11&productLocation=Camp%201&applicationVolume=125.5&averageLogVolume=1.2&speciesCodes=HE&endUseCode=SA&comments=Ready',
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

    expect(mockedFetchApplicationClientLocations).toHaveBeenCalledWith('00011111', 'owner')
    expect(mockedFetchApplicationClientLocations).toHaveBeenCalledWith('00033333', 'agent')
    expect(mockedSubmitProvincialApplicationCreate).toHaveBeenCalledWith({
      ownerClientNumber: '00011111',
      ownerClientLocationCode: '00',
      ownerContactName: 'Owner Contact',
      agentClientNumber: '00033333',
      agentClientLocationCode: '01',
      agentContactName: 'Agent Contact',
      applicantTypeCode: 'A',
      productTypeCode: 'LOG',
      ageClass: '',
      exemptionType: 'U',
      region: '11',
      applicationDate: '2026-01-09',
      applicationTermDays: '30',
      applicationTermMonths: '',
      applicationTermYears: '',
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
    expect(mockNavigate).toHaveBeenCalledWith('/provincial/application/902')
  })

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

    await selectApplicationCreateTab('Clients')
    const applicantType = screen.getByRole('textbox', { name: 'Applicant type' })
    expect(applicantType).toHaveValue('Owner')
    expect(applicantType).toHaveAttribute('readonly')
    expect(screen.queryByLabelText('Agent client number')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Agent client location')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Agent contact name')).not.toBeInTheDocument()
    expect(mockedFetchApplicationClientLocations).not.toHaveBeenCalledWith('00033333', 'agent')
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
        { value: '1001', label: '2026-07-01' },
        { value: '1002', label: '2026-07-15' },
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
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Product type' })).toHaveValue('Harvested Timber')
      expect(screen.getByRole('combobox', { name: 'Exemption reason' })).toHaveValue('Surplus')
      expect(screen.getByRole('combobox', { name: 'Region' })).toHaveValue('')
      expect(screen.getByRole('textbox', { name: 'Application date (YYYY-MM-DD)' })).toHaveValue(
        today,
      )
      expect(screen.getByRole('textbox', { name: 'Application term days' })).toHaveValue('180')
      expect(screen.getByRole('textbox', { name: 'Received date (YYYY-MM-DD)' })).toHaveValue(today)
      expect(screen.getByRole('combobox', { name: 'Listing date' })).toHaveValue('2026-07-01')
    })

    expect(screen.getByRole('combobox', { name: 'Region' })).toBeEnabled()
    await selectApplicationCreateTab('Clients')
    expect(screen.getByRole('textbox', { name: 'Owner client number' })).not.toHaveAttribute(
      'readonly',
    )
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

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Region' })).toHaveValue(
        'West Coast Natural Resource Region',
      )
    })
    expect(screen.getByRole('combobox', { name: 'Region' })).toBeEnabled()
    expect(screen.getByRole('textbox', { name: 'Application term days' })).toHaveValue('180')

    await selectApplicationCreateTab('Clients')
    expect(screen.getByRole('textbox', { name: 'Owner client number' })).toHaveValue('00077881')
    expect(screen.getByRole('textbox', { name: 'Owner client number' })).toHaveAttribute('readonly')
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Owner client location' })).toHaveValue('00')
    })
    const ownerLocation = screen.getByRole('combobox', { name: 'Owner client location' })
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

    const ownerNameInput = await screen.findByLabelText('Owner name')
    await userEvent.type(ownerNameInput, 'Typed Owner')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(mockedSubmitProvincialApplicationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerContactName: 'Typed Owner',
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

    const applicationVolume = screen.getByLabelText('Application volume')
    await userEvent.clear(applicationVolume)
    await userEvent.type(applicationVolume, '9999999.99')
    await userEvent.click(submitButton)

    await waitFor(() =>
      expect(mockedSubmitProvincialApplicationCreate).toHaveBeenCalledWith(
        expect.objectContaining({ applicationVolume: '9999999.99' }),
      ),
    )
  })

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

    const productType = await screen.findByRole('combobox', { name: 'Product type' })
    await waitFor(() => expect(productType).toHaveValue('Harvested Timber'))
    expect(screen.getByRole('combobox', { name: 'Growth type' })).toBeInTheDocument()
    expect(screen.getByLabelText('Location of logs')).toBeInTheDocument()
    expect(screen.getByLabelText('Average log volume')).toBeInTheDocument()

    await chooseComboBoxOption(productType, 'Standing Timber')
    expect(screen.getByRole('combobox', { name: 'Growth type' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Location of logs')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Average log volume')).not.toBeInTheDocument()

    await chooseComboBoxOption(productType, 'Timber')
    expect(screen.queryByRole('combobox', { name: 'Growth type' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Location of logs')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Average log volume')).not.toBeInTheDocument()
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
      'At least one application species is required, but no species are available for the selected region and product type.',
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
    expect(screen.queryByRole('textbox', { name: 'Owner client number' })).not.toBeInTheDocument()
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
    expect(screen.getByLabelText('Expiry date (YYYY-MM-DD)')).toHaveValue('2026-06-30')
    await chooseComboBoxOption(
      screen.getByRole('combobox', { name: 'Exemption type' }),
      'Section 1',
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
  })

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

    const selectedApplicationNumbers = screen.getByLabelText('Selected application numbers')
    expect(selectedApplicationNumbers.closest('.selected-application-numbers')).toBeTruthy()
    expect(selectedApplicationNumbers).toHaveAttribute('rows', '2')
    expect(selectedApplicationNumbers).toHaveValue('321\n654')
    await waitFor(() =>
      expect(mockedFetchProvincialExemptionCreatePreview).toHaveBeenCalledWith(['321', '654']),
    )
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
    expect(screen.getByLabelText('Exemption number')).toHaveAttribute('maxlength', '8')
    expect(
      screen.getByRole('combobox', { name: 'Application number (optional)' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Enable fee rate override')).toBeInTheDocument()
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

  it('rejects an OIC number beyond eight UTF-8 bytes', async () => {
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
    await userEvent.type(screen.getByLabelText('Exemption number'), 'ééééé')
    await userEvent.type(screen.getByLabelText('Approval date (YYYY-MM-DD)'), '2026-07-01')
    await userEvent.type(screen.getByLabelText('Expiry date (YYYY-MM-DD)'), '2027-07-01')
    await userEvent.type(screen.getByLabelText('Approved volume (m³)'), '250.5')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(
      await screen.findAllByText('Exemption number must be 8 UTF-8 bytes or fewer.'),
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
    mockedSubmitProvincialOfferCreate.mockResolvedValue(successfulCreate('8080'))

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
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    const offerFormActions = screen.getByRole('group', { name: 'Offer form actions' })
    expect(
      within(offerFormActions)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Cancel', 'Save'])
    expect(within(offerFormActions).getByRole('button', { name: 'Cancel' })).toHaveAttribute(
      'type',
      'button',
    )
    expect(within(offerFormActions).getByRole('button', { name: 'Save' })).toHaveAttribute(
      'type',
      'button',
    )
    expect(screen.queryByRole('group', { name: 'New offer state' })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: /offer number/i })).not.toBeInTheDocument()
    const offerSections = [
      screen.getByRole('group', { name: 'Application details' }),
      screen.getByRole('group', { name: 'Offering company details' }),
      screen.getByRole('group', { name: 'Offer details' }),
      screen.getByRole('group', { name: 'Offer withdrawals' }),
      screen.getByRole('group', { name: 'Approval' }),
    ]
    expect(offerSections[0].closest('.cds--tile')).toHaveClass('create-form-tile')
    for (const section of offerSections) {
      expect(section).toHaveClass('create-form-section')
      expect(section).toHaveClass('offer-form-section')
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
    expect(screen.getByLabelText('Offering client number')).not.toHaveAttribute('readonly')
    expect(screen.getByRole('combobox', { name: 'Fair market value' })).toBeInTheDocument()
    expect(screen.getByLabelText('Offer remarks')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Company'), 'Example Lumber')
    await userEvent.type(screen.getByLabelText('Contact name'), 'Sample Contact')
    await userEvent.type(screen.getByLabelText('Offer volume (m³)'), '99.9')
    await userEvent.type(screen.getByLabelText('Offer amount ($/m³)'), '25000')
    await userEvent.type(screen.getByLabelText('Pickup location'), 'Yard A')
    await userEvent.type(screen.getByLabelText('Offer conditions / remarks'), 'No partial loads')
    await userEvent.type(screen.getByLabelText('Offer remarks'), 'Ready for review')

    expect(screen.queryByRole('button', { name: 'Submit' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save Draft' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Back to Search' })).not.toBeInTheDocument()
    const saveButton = screen.getByRole('button', { name: 'Save' })
    expect(saveButton).toBeEnabled()
    await userEvent.click(saveButton)

    await waitFor(() => {
      expect(mockedSubmitProvincialOfferCreate).toHaveBeenCalledWith({
        applicationNumber: '2001',
        packageNumber: 'PKG-9',
        offeringClientNumber: '00099999',
        companyName: 'Example Lumber',
        contactName: 'Sample Contact',
        offerVolume: '99.9',
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
    expect(mockNavigate).toHaveBeenCalledWith('/provincial/offers/8080')
  }, 15000)

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
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
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
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText(saveError)).toBeInTheDocument()
    expect(mockedSubmitProvincialOfferCreate).toHaveBeenCalledTimes(1)
  })

  it('uses the authoritative scoped client and non-approver offer defaults', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({
          principal: 'bceid\\buyer',
          roles: ['PROVINCIAL_SUBMITTER_00077881'],
          forestClientNumber: '00077881',
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

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

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

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
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
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

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
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

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
