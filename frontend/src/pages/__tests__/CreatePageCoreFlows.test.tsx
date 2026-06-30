import { render, screen, waitFor, within } from '@testing-library/react'
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
  fetchOfferPackageList,
  fetchOfferPackageVolume,
} from '@/service/provincial-offer-create-service'
import { searchProvincialApplicationNumberOptions } from '@/service/provincial-application-search-service'
import { formatLocalIsoDate } from '@/utils/date'
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
  fetchProvincialOfferOptions: vi.fn(),
}))

vi.mock('@/service/create-submit-service', () => ({
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
  fetchOfferPackageList: vi.fn(),
  fetchOfferPackageVolume: vi.fn(),
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
const mockedFetchProvincialOfferOptions = vi.mocked(fetchProvincialOfferOptions)
const mockedSubmitProvincialApplicationCreate = vi.mocked(submitProvincialApplicationCreate)
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
const mockedFetchOfferPackageList = vi.mocked(fetchOfferPackageList)
const mockedFetchOfferPackageVolume = vi.mocked(fetchOfferPackageVolume)
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
      productTypes: [{ value: 'LOG', label: 'Logs' }],
      exemptionTypes: [{ value: 'SECTION_1', label: 'Section 1' }],
      exemptionReasons: [{ value: 'U', label: 'Unadvertised' }],
      applicationStatuses: [],
      growthTypes: [{ value: 'O', label: 'Old Growth' }],
      regions: [{ value: '11', label: 'Cariboo' }],
      currentSchedules: [{ value: '987', label: '2026-01-11' }],
    } satisfies Awaited<ReturnType<typeof fetchProvincialApplicationOptions>>)
    mockedFetchProvincialExemptionOptions.mockResolvedValue({
      exemptionTypes: [{ value: 'SECTION_1', label: 'Section 1' }],
      exemptionStatuses: [{ value: 'NEW', label: 'New' }],
      regions: [{ value: '11', label: 'Cariboo' }],
    } satisfies Awaited<ReturnType<typeof fetchProvincialExemptionOptions>>)
    mockedFetchProvincialOfferOptions.mockResolvedValue({
      regions: [{ value: '11', label: 'Cariboo' }],
    })
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
    })
    mockedFetchOfferApplicationVolume.mockResolvedValue('100.0')
    mockedFetchOfferPackageList.mockResolvedValue(['PKG-9'])
    mockedFetchOfferPackageVolume.mockResolvedValue('95.0')
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

    const newApplicationState = screen.getByRole('group', { name: 'New application state' })
    expect(within(newApplicationState).getByText('Application number')).toBeInTheDocument()
    expect(within(newApplicationState).getByText('Status')).toBeInTheDocument()
    expect(within(newApplicationState).getAllByText('New')).toHaveLength(2)
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
    expect(screen.getByText('Upload application documents')).toBeInTheDocument()
    expect(screen.getByText('Save the application before uploading documents.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Submit' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save Draft' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Back to Search' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()

    const submitButton = await screen.findByRole('button', { name: 'Save' })
    await waitFor(() => expect(submitButton).toBeEnabled())
    await userEvent.click(submitButton)

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

    const regionComboBox = await screen.findByRole('combobox', { name: 'Region (required)' })
    await waitFor(() => {
      expect(regionComboBox).toHaveValue('Cariboo Natural Resource Region')
    })

    await chooseComboBoxOption(regionComboBox, 'West Coast Natural Resource Region')
    await selectApplicationCreateTab('Packages / Scales')
    await chooseComboBoxOption(
      screen.getByRole('combobox', { name: 'Application species (required)' }),
      'HE - Hemlock',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Add Application species' }))
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

  it('prefills new provincial applications with legacy defaults and next listing date', async () => {
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

    const today = formatLocalIsoDate(new Date())
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Product type (required)' })).toHaveValue(
        'Harvested Timber',
      )
      expect(screen.getByRole('combobox', { name: 'Exemption reason (required)' })).toHaveValue(
        'Surplus',
      )
      expect(screen.getByRole('combobox', { name: 'Region (required)' })).toHaveValue(
        'Cariboo Natural Resource Region',
      )
      expect(
        screen.getByRole('textbox', { name: 'Application date (YYYY-MM-DD) (required)' }),
      ).toHaveValue(today)
      expect(
        screen.getByRole('textbox', { name: 'Received date (YYYY-MM-DD) (required)' }),
      ).toHaveValue(today)
      expect(screen.getByRole('combobox', { name: 'Listing date' })).toHaveValue('2026-07-01')
    })
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

    const ownerNameInput = await screen.findByLabelText('Owner name (required)')
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
          '/provincial/application/create?ownerClientNumber=00011111&ownerClientLocationCode=00&ownerContactName=Owner%20Contact&productTypeCode=LOG&exemptionReason=U&region=11&applicationDate=2026-01-09&applicationTermDays=30&receivedDate=2026-01-10&listingDate=2026-01-11&productLocation=Camp%201&applicationVolume=125.55&averageLogVolume=1.23&speciesCodes=HE&endUseCode=SA&comments=Ready',
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
      await screen.findAllByText('Application volume must have no more than one decimal place.'),
    ).not.toHaveLength(0)
    expect(
      screen.getByText('Average log volume must have no more than one decimal place.'),
    ).toBeInTheDocument()
    expect(mockedSubmitProvincialApplicationCreate).not.toHaveBeenCalled()
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

    await screen.findByText('Create provincial exemption')
    const newExemptionState = screen.getByRole('group', { name: 'New exemption state' })
    expect(within(newExemptionState).getByText('Exemption number')).toBeInTheDocument()
    expect(within(newExemptionState).getAllByText('New')).not.toHaveLength(0)
    expect(screen.queryByRole('textbox', { name: /exemption number/i })).not.toBeInTheDocument()
    await chooseComboBoxOption(
      screen.getByRole('combobox', { name: 'Exemption type (required)' }),
      'Section 1',
    )
    await chooseComboBoxOption(
      screen.getByRole('combobox', { name: 'Exemption status (required)' }),
      'New',
    )
    await userEvent.type(screen.getByLabelText('Approval date (YYYY-MM-DD)'), '2026-02-01')
    await userEvent.type(screen.getByLabelText('Expiry date (YYYY-MM-DD)'), '2026-12-31')
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
      exemptionTypeCode: 'SECTION_1',
      exemptionStatusCode: 'NEW',
      ownerClientNumber: '00033333',
      applicantClientNumber: '00044444',
      approvalDate: '2026-02-01',
      expiryDate: '2026-12-31',
      approvedVolume: '500',
      otherConditions: 'Linked applications: 321, 654',
    })
    expect(mockNavigate).toHaveBeenCalledWith('/provincial/exemption/EX-777')
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

    await screen.findByText('Create provincial exemption')
    await chooseComboBoxOption(
      screen.getByRole('combobox', { name: 'Exemption type (required)' }),
      'Section 1',
    )
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

    await screen.findByText('Create provincial exemption')
    await chooseComboBoxOption(
      screen.getByRole('combobox', { name: 'Exemption type (required)' }),
      'Section 1',
    )
    await chooseComboBoxOption(
      screen.getByRole('combobox', { name: 'Exemption status (required)' }),
      'New',
    )
    await userEvent.type(screen.getByLabelText(/Approved Volume/i), '121212122')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(
      await screen.findAllByText('Approved volume must be 9999999.9 or less.'),
    ).not.toHaveLength(0)
    expect(mockedSubmitProvincialExemptionCreate).not.toHaveBeenCalled()
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

    await screen.findByText('Provincial offers')
    const newOfferState = screen.getByRole('group', { name: 'New offer state' })
    expect(within(newOfferState).getByText('Offer number')).toBeInTheDocument()
    expect(within(newOfferState).getByText('New')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: /offer number/i })).not.toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Application details' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Offering company details' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Offer details' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Offer withdrawals' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Approval' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'See Scale Detail' })).toBeEnabled()
    expect(await screen.findByDisplayValue('PKG-9')).toBeInTheDocument()
    expect(await screen.findByDisplayValue('95.0')).toBeInTheDocument()
    expect(screen.getByDisplayValue('H/SA')).toBeInTheDocument()
    expect(screen.getByDisplayValue('03/01/2026')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Company'), 'Example Lumber')
    await userEvent.type(screen.getByLabelText('Contact name'), 'Alex Example')
    await userEvent.type(screen.getByLabelText('Offer volume (m³)'), '99.9')
    await userEvent.type(screen.getByLabelText('Offer amount ($/m³)'), '25000')
    await userEvent.type(screen.getByLabelText('Offer received date'), '2026-03-10')
    await userEvent.type(screen.getByLabelText('Offer withdrawal date'), '2026-03-20')
    await userEvent.type(screen.getByLabelText('Offer withdrawal reason'), 'Withdrawn by buyer')
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
        contactName: 'Alex Example',
        region: '11',
        offerVolume: '99.9',
        purchaseOfferAmount: '25000',
        purchaseOfferDate: '2026-03-10',
        offerWithdrawalDate: '2026-03-20',
        withdrawReason: 'Withdrawn by buyer',
        teacReviewDate: '',
        fairOfferIndicator: '',
        validOfferIndicator: '',
        approvalIndicator: '',
        offerRemark: 'Ready for review',
        pickupLocation: 'Yard A',
        offerCondition: 'No partial loads',
        offerInEffectUntil: '',
      })
    })
    expect(mockNavigate).toHaveBeenCalledWith('/provincial/offers/8080')
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

    await screen.findByText('Provincial offers')
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

    await screen.findByText('Provincial offers')
    expect(await screen.findByDisplayValue('PKG-10')).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('Offer amount ($/m³)'), '25000')
    await userEvent.type(screen.getByLabelText('Offer received date'), '2026-03-10')
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
})
