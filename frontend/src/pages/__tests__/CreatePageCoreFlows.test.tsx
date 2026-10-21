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
import { formatBusinessIsoDate } from '@/utils/date'
import { useAuth } from '@/context/auth/useAuth'
import { fetchOfferScaleDetails } from '@/service/offer-scale-detail-service'
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

vi.mock('@/context/auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/service/offer-scale-detail-service', () => ({
  fetchOfferScaleDetails: vi.fn(),
}))

vi.mock('@/components/ForestClientComboBox', () => ({
  default: ({
    id,
    labelText,
    value,
    onChange,
    onBlur,
    disabled,
    invalid,
    invalidText,
    counterpartyClientNumber,
  }: {
    id: string
    labelText: string
    value: string
    onChange: (value: string) => void
    onBlur?: () => void
    disabled?: boolean
    invalid?: boolean
    invalidText?: string
    counterpartyClientNumber?: string
  }) => (
    <div>
      <label htmlFor={id}>{labelText}</label>
      <input
        id={id}
        value={value}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        data-counterparty-client-number={counterpartyClientNumber ?? ''}
        onBlur={onBlur}
        onChange={(event) => onChange(event.target.value)}
      />
      {invalid && invalidText ? <div>{invalidText}</div> : null}
    </div>
  ),
}))

Element.prototype.scrollIntoView = vi.fn()

const mockedFetchProvincialApplicationOptions = vi.mocked(fetchProvincialApplicationOptions)
const mockedFetchProvincialExemptionOptions = vi.mocked(fetchProvincialExemptionOptions)
const mockedSubmitProvincialApplicationCreate = vi.mocked(submitProvincialApplicationCreate)
const mockedFetchProvincialExemptionCreatePreview = vi.mocked(fetchProvincialExemptionCreatePreview)
const mockedSubmitProvincialExemptionCreate = vi.mocked(submitProvincialExemptionCreate)
const mockedSubmitProvincialOfferCreate = vi.mocked(submitProvincialOfferCreate)
const mockedFetchApplicationClientData = vi.mocked(fetchApplicationClientData)
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
const mockedUseAuth = vi.mocked(useAuth)
const mockedFetchOfferScaleDetails = vi.mocked(fetchOfferScaleDetails)

type EndUseOptions = Awaited<ReturnType<typeof fetchApplicationEndUsesForSpeciesRegion>>

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
  await userEvent.click(await screen.findByRole('tab', { name: new RegExp(`^${name}(?:,|$)`) }))
}

const selectExemptionCreateTab = async (name: string) => {
  await userEvent.click(await screen.findByRole('tab', { name }))
}

const chooseExemptionType = async (name: string) => {
  await userEvent.click(await screen.findByRole('radio', { name }))
}

// Save reports what is still loading instead of saving until options and client details arrive.
const waitForApplicationCreateLoads = async (...clientDetails: string[]) => {
  await waitFor(() =>
    expect(screen.getByRole('combobox', { name: 'Product type', hidden: true })).toBeEnabled(),
  )
  for (const name of clientDetails) {
    await screen.findByRole('region', { name, hidden: true })
  }
}

describe('Create Page Core Flows', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedFetchOfferScaleDetails.mockResolvedValue([
      {
        timberMark: 'TM-9',
        pieces: 8,
        species: 'HE',
        grade: 'J',
        volume: '95.0',
        cascadeSplitCode: 'E',
      },
    ])
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
    mockedFetchApplicationClientLocations.mockResolvedValue([
      { locationCode: '00', locationName: '00', selected: false },
      { locationCode: '01', locationName: '01 - MAIN LOCATION', selected: false },
    ])
    mockedFetchApplicationClientData.mockImplementation(async (clientNumber) => {
      const confirmedClientNumber = /^\d{1,8}$/.test(clientNumber)
        ? clientNumber.padStart(8, '0')
        : clientNumber
      const isAgent = ['00002176', '00033333'].includes(confirmedClientNumber)
      return {
        clientNumber: confirmedClientNumber,
        companyName: isAgent ? 'Agent Export Services' : 'Owner Forestry Ltd.',
        clientAcronym: '',
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
  })

  it('uses tab labels as accessible panel names without repeating them as headings', async () => {
    render(
      <MemoryRouter initialEntries={['/provincial/application/create?applicantType=A']}>
        <Routes>
          <Route
            path="/provincial/application/create"
            element={<ProvincialApplicationCreatePage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    for (const tabName of ['Applicant', 'Application', 'Scale']) {
      await selectApplicationCreateTab(tabName)
      const panelRegion = screen.getByRole('region', { name: tabName })
      expect(panelRegion).toBeVisible()
      expect(
        within(panelRegion).queryByRole('heading', { level: 2, name: tabName }),
      ).not.toBeInTheDocument()
    }
    // Tabs that need a saved application show a plain note on the tab background, not a card.
    for (const tabName of ['Documents', 'Remarks', 'Offers', 'Review']) {
      await selectApplicationCreateTab(tabName)
      const panel = screen.getByRole('tabpanel', { name: tabName })
      expect(panel).toHaveTextContent(/^Available after the application is saved\.$/)
      expect(panel).toHaveClass('application-detail-tab-panel--empty')
      expect(panel.querySelector('.cds--tile')).toBeNull()
    }
  })

  it('submits provincial application prefilled form and navigates to details', async () => {
    mockedSubmitProvincialApplicationCreate.mockResolvedValue(successfulCreate('901'))

    render(
      <MemoryRouter
        initialEntries={[
          '/provincial/application/create?ownerClientNumber=11111&ownerClientLocationCode=00&ownerContactName=Owner%20Contact&productTypeCode=LOG&ageClass=O&exemptionReason=U&region=11&applicationDate=2026-01-09&applicationTermDays=30&receivedDate=2026-01-10&listingDate=2026-01-11&productLocation=Camp%201&applicationVolume=125.5&averageLogVolume=1.2&speciesCodes=HE&endUseCode=SA&comments=Ready',
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
      screen.getByRole('heading', { level: 1, name: 'Create new application' }),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('region', { name: 'Applicant' })).toBeInTheDocument()
    const applicationFormActions = screen.getByRole('group', {
      name: 'Application form actions',
    })
    expect(
      within(applicationFormActions)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Cancel', 'Save application'])
    expect(within(applicationFormActions).getByRole('button', { name: 'Cancel' })).toHaveAttribute(
      'type',
      'button',
    )
    expect(
      within(applicationFormActions).getByRole('button', { name: 'Save application' }),
    ).toHaveAttribute('type', 'button')
    expect(screen.queryByRole('group', { name: 'New application state' })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: /application number/i })).not.toBeInTheDocument()
    for (const tabName of [
      'Applicant',
      'Application',
      'Scale',
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
    expect(screen.queryByRole('textbox', { name: 'Application status' })).not.toBeInTheDocument()
    expect(
      within(screen.getByRole('tabpanel')).getByText('Available after the application is saved.'),
    ).toBeVisible()

    await selectApplicationCreateTab('Application')
    const applicationSection = screen.getByRole('region', { name: 'Application' })
    expect(
      Array.from(applicationSection.querySelectorAll('input')).map((input) => input.id),
    ).toEqual([
      'region',
      'productTypeCode',
      'exemptionType',
      'exportScheduleId-987',
      'exportScheduleId-no-list-date',
      'applicationDate',
      'applicationTermDays',
    ])

    await selectApplicationCreateTab('Documents')
    expect(screen.queryByRole('button', { name: 'Add document' })).not.toBeInTheDocument()
    expect(
      within(screen.getByRole('tabpanel')).getByText('Available after the application is saved.'),
    ).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Submit' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save Draft' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Back to Search' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()

    const submitButton = await screen.findByRole('button', { name: 'Save application' })
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
      ageClass: 'O',
      exemptionType: 'U',
      region: '11',
      applicationDate: formatBusinessIsoDate(),
      applicationTermDays: '30',
      exportScheduleId: '987',
      listingDate: '2026-01-11',
      productLocation: 'Camp 1',
      applicationVolume: '125.5',
      averageLogVolume: '1.2',
      speciesCodes: ['HE'],
      endUseCode: 'SA',
    })
    expect(mockNavigate).toHaveBeenCalledWith('/provincial/application/901', {
      state: {
        applicationCreationNotice: {
          applicationNumber: '901',
        },
      },
    })
  }, 20_000)

  it('keeps package and dependent entry unavailable before the application is saved', async () => {
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

    await selectApplicationCreateTab('Scale')
    expect(screen.getByRole('region', { name: 'Scale' })).toBeVisible()
    expect(screen.getByText('Total pieces')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Create package/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Selected package' })).not.toBeInTheDocument()
    for (const name of ['Documents', 'Remarks', 'Offers', 'Review']) {
      await selectApplicationCreateTab(name)
      expect(
        within(screen.getByRole('tabpanel')).getByText('Available after the application is saved.'),
      ).toBeVisible()
      expect(screen.getByRole('tabpanel', { name }).querySelector('input, textarea')).toBeNull()
    }
    expect(mockedSubmitProvincialApplicationCreate).not.toHaveBeenCalled()
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

    await selectApplicationCreateTab('Scale')
    const species = await screen.findByRole('combobox', { name: /^Species list/ })
    expect(species).toHaveAttribute('aria-required', 'true')
    await waitFor(() => expect(species).toBeEnabled())
    await userEvent.click(species)
    await userEvent.click(await screen.findByRole('option', { name: /HE/ }))
    await waitFor(() =>
      expect(mockedFetchApplicationRemainingSpecies).toHaveBeenLastCalledWith('11', 'H', ['BA']),
    )
    await waitFor(() => expect(species).toBeEnabled())
    // Carbon keeps the multiselect open while selections change.
    await userEvent.click(await screen.findByRole('option', { name: /BA/ }))
    expect(await screen.findByText('At least one species is required')).toBeVisible()
    await waitFor(() => expect(species).toHaveAttribute('aria-invalid', 'true'))
    expect(species).toHaveAccessibleDescription('At least one species is required')
    expect(mockedSubmitProvincialApplicationCreate).not.toHaveBeenCalled()
  }, 20_000)

  it('keeps selected species descriptions when remaining options omit them', async () => {
    mockedFetchApplicationRemainingSpecies.mockImplementation(async (_region, _product, selected) =>
      [
        { code: 'HE', description: 'Hemlock' },
        { code: 'BA', description: 'Balsam' },
      ].filter((option) => !selected.includes(option.code)),
    )
    render(
      <MemoryRouter initialEntries={['/provincial/application/create?productTypeCode=H&region=11']}>
        <Routes>
          <Route
            path="/provincial/application/create"
            element={<ProvincialApplicationCreatePage />}
          />
        </Routes>
      </MemoryRouter>,
    )
    await selectApplicationCreateTab('Scale')
    const species = await screen.findByRole('combobox', { name: /^Species list/ })
    await waitFor(() => expect(species).toBeEnabled())
    await userEvent.click(species)
    await userEvent.click(await screen.findByRole('option', { name: 'HE - Hemlock' }))
    await waitFor(() =>
      expect(mockedFetchApplicationRemainingSpecies).toHaveBeenLastCalledWith('11', 'H', ['HE']),
    )
    await waitFor(() => expect(species).toBeEnabled())
    expect(screen.getByRole('option', { name: 'HE - Hemlock' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByRole('option', { name: 'BA - Balsam' })).toHaveAttribute(
      'aria-selected',
      'false',
    )
  })

  it('keeps species selectable while the remaining list refreshes after a pick', async () => {
    const pendingRefreshes: Array<() => void> = []
    const allSpecies = [
      { code: 'HE', description: 'Hemlock' },
      { code: 'BA', description: 'Balsam' },
    ]
    mockedFetchApplicationRemainingSpecies.mockImplementation((_region, _product, selected) => {
      const remaining = allSpecies.filter((option) => !selected.includes(option.code))
      if (selected.length === 0) return Promise.resolve(remaining)
      return new Promise((resolve) => pendingRefreshes.push(() => resolve(remaining)))
    })
    render(
      <MemoryRouter initialEntries={['/provincial/application/create?productTypeCode=H&region=11']}>
        <Routes>
          <Route
            path="/provincial/application/create"
            element={<ProvincialApplicationCreatePage />}
          />
        </Routes>
      </MemoryRouter>,
    )
    await selectApplicationCreateTab('Scale')
    const species = await screen.findByRole('combobox', { name: /^Species list/ })
    await waitFor(() => expect(species).toBeEnabled())
    await userEvent.click(species)
    await userEvent.click(await screen.findByRole('option', { name: 'HE - Hemlock' }))
    await waitFor(() =>
      expect(mockedFetchApplicationRemainingSpecies).toHaveBeenLastCalledWith('11', 'H', ['HE']),
    )

    expect(species).toBeEnabled()
    expect(species).toHaveFocus()
    await userEvent.click(screen.getByRole('option', { name: 'BA - Balsam' }))
    await waitFor(() =>
      expect(mockedFetchApplicationRemainingSpecies).toHaveBeenLastCalledWith('11', 'H', [
        'HE',
        'BA',
      ]),
    )
    await act(async () => pendingRefreshes.forEach((resolve) => resolve()))

    expect(screen.getByRole('option', { name: 'HE - Hemlock' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByRole('option', { name: 'BA - Balsam' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  it('validates a submitter application before asking for the accuracy agreement', async () => {
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

    const saveButton = await screen.findByRole('button', { name: 'Save application' })
    await waitForApplicationCreateLoads('Applicant client details')
    await userEvent.click(saveButton)

    const feedback = await screen.findByRole('status')
    expect(feedback).toHaveTextContent('Cannot save yet.')
    expect(
      screen.queryByRole('dialog', { name: 'Confirm application accuracy' }),
    ).not.toBeInTheDocument()
    expect(mockedSubmitProvincialApplicationCreate).not.toHaveBeenCalled()

    await selectApplicationCreateTab('Scale')
    const scaleTab = screen.getByRole('tab', { name: /^Scale, \d+ required fields? outstanding$/ })
    const scale = screen.getByRole('region', { name: 'Scale' })
    expect(scale.querySelectorAll('.cds--form-requirement')).toHaveLength(
      Number(scaleTab.textContent?.replace(/\D/g, '')),
    )
  })

  it('counts species once a region is chosen without a helper under the disabled field', async () => {
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

    const saveButton = await screen.findByRole('button', { name: 'Save application' })
    await waitForApplicationCreateLoads()
    await userEvent.click(saveButton)
    await screen.findByText('Cannot save yet.')

    await selectApplicationCreateTab('Scale')
    const scaleTab = screen.getByRole('tab', { name: /^Scale, \d+ required fields? outstanding$/ })
    const scale = screen.getByRole('region', { name: 'Scale' })
    expect(scale.querySelectorAll('.cds--form-requirement')).toHaveLength(
      Number(scaleTab.textContent?.replace(/\D/g, '')),
    )
    expect(within(scale).getByRole('combobox', { name: /^Species list/ })).toBeDisabled()
    expect(within(scale).getByPlaceholderText('Select region first')).toBeVisible()
    expect(within(scale).queryByText(/Select a region before adding species/)).toBeNull()
    expect(within(scale).queryByText(/At least one species is required/)).toBeNull()
  })

  it('selects the first required tab with an error when Save is refused', async () => {
    render(
      <MemoryRouter
        initialEntries={[
          '/provincial/application/create?ownerClientNumber=00011111&ownerClientLocationCode=00&ownerContactName=Owner%20Contact',
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

    const saveButton = await screen.findByRole('button', { name: 'Save application' })
    await waitForApplicationCreateLoads('Applicant client details')
    await userEvent.click(saveButton)
    await screen.findByText('Cannot save yet.')

    expect(screen.getByRole('tab', { name: 'Applicant' })).toBeVisible()
    const applicationTab = screen.getByRole('tab', {
      name: /^Application, \d+ required fields? outstanding$/,
    })
    expect(
      screen.getByRole('tab', { name: /^Scale, \d+ required fields? outstanding$/ }),
    ).toBeVisible()
    expect(applicationTab).toHaveAttribute('aria-selected', 'true')
    expect(mockedSubmitProvincialApplicationCreate).not.toHaveBeenCalled()
  })

  it('holds Save while end uses load for the chosen species and then saves the first end use', async () => {
    mockedSubmitProvincialApplicationCreate.mockResolvedValue(successfulCreate('902'))
    let resolveEndUses: (options: EndUseOptions) => void = () => undefined
    mockedFetchApplicationEndUsesForSpeciesRegion.mockReturnValue(
      new Promise<EndUseOptions>((resolve) => {
        resolveEndUses = resolve
      }),
    )

    render(
      <MemoryRouter
        initialEntries={[
          '/provincial/application/create?ownerClientNumber=00011111&ownerClientLocationCode=00&ownerContactName=Owner%20Contact&productTypeCode=LOG&ageClass=O&exemptionReason=U&region=11&applicationDate=2026-01-09&applicationTermDays=30&listingDate=2026-01-11&productLocation=Camp%201&applicationVolume=125.5&averageLogVolume=1.2&speciesCodes=HE',
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

    const saveButton = await screen.findByRole('button', { name: 'Save application' })
    await waitForApplicationCreateLoads('Applicant client details')
    await waitFor(() => expect(mockedFetchApplicationEndUsesForSpeciesRegion).toHaveBeenCalled())
    await userEvent.click(saveButton)

    expect(
      await screen.findByText('End uses must finish loading before this application can be saved.'),
    ).toBeVisible()
    expect(mockedSubmitProvincialApplicationCreate).not.toHaveBeenCalled()

    await act(async () => {
      resolveEndUses([{ code: 'SA', description: 'Sawlog' }])
    })
    await userEvent.click(saveButton)

    await waitFor(() =>
      expect(mockedSubmitProvincialApplicationCreate).toHaveBeenCalledWith(
        expect.objectContaining({ speciesCodes: ['HE'], endUseCode: 'SA' }),
      ),
    )
    expect(
      screen.queryByText('End uses must finish loading before this application can be saved.'),
    ).not.toBeInTheDocument()
  })

  it.each([
    ['staff', undefined, 'Documents, Remarks, Offers and Review can be added after that.'],
    [
      'provincial submitters',
      ['PROVINCIAL_SUBMITTER_00077881'],
      'Documents and Offers can be added after that.',
    ],
  ])('names the tabs %s can use once the application is saved', async (_, roles, text) => {
    if (roles) {
      mockedUseAuth.mockReturnValue(
        createTestAuthContext({
          capabilities: createTestCapabilities({ roles, forestClientNumber: '00077881' }),
          canPerform: (action) => ['/applicationSearch', 'createApplication'].includes(action),
        }),
      )
    }

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

    expect(await screen.findByText(text)).toBeVisible()
  })

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
          '/provincial/application/create?ownerContactName=Owner%20Contact&productTypeCode=LOG&ageClass=O&exemptionReason=U&applicationDate=2026-01-09&applicationTermDays=30&receivedDate=2026-01-10&listingDate=2026-01-11&productLocation=Camp%201&applicationVolume=125.5&averageLogVolume=1.2&speciesCodes=HE&endUseCode=SA&comments=Ready',
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

    const saveButton = await screen.findByRole('button', { name: 'Save application' })
    await waitForApplicationCreateLoads('Applicant client details')
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

    await userEvent.click(screen.getByRole('button', { name: 'Save application' }))
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

    expect(await screen.findByText('Save failed')).toBeVisible()
    expect(screen.getByText('Application agent location does not exist.')).toBeVisible()
    expect(postSaveDialog).toBeVisible()
    expect(within(postSaveDialog).getByRole('button', { name: 'Save application' })).toBeEnabled()
    const callsBeforeReopen = mockedSubmitProvincialApplicationCreate.mock.calls.length
    await userEvent.click(within(postSaveDialog).getByRole('button', { name: 'Cancel' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save application' }))
    const cleanDialog = screen.getByRole('dialog', { name: 'Confirm application accuracy' })
    expect(mockedSubmitProvincialApplicationCreate).toHaveBeenCalledTimes(callsBeforeReopen)
    expect(
      within(cleanDialog).queryByText('Application agent location does not exist.'),
    ).not.toBeInTheDocument()
  }, 20_000)

  it('uses one application term field and submits its day value directly', async () => {
    mockedSubmitProvincialApplicationCreate.mockResolvedValue(successfulCreate('904'))

    render(
      <MemoryRouter
        initialEntries={[
          '/provincial/application/create?ownerClientNumber=00011111&ownerClientLocationCode=00&ownerContactName=Owner%20Contact&productTypeCode=LOG&ageClass=O&exemptionReason=U&region=11&applicationDate=2026-01-09&applicationTermDays=5&applicationTermMonths=2&applicationTermYears=1&receivedDate=2026-01-10&listingDate=2026-01-11&productLocation=Camp%201&applicationVolume=125.5&averageLogVolume=1.2&speciesCodes=HE&endUseCode=SA',
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

    const submitButton = await screen.findByRole('button', { name: 'Save application' })
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
          '/provincial/application/create?ownerClientNumber=00011111&ownerClientLocationCode=00&ownerContactName=Owner%20Contact&productTypeCode=LOG&ageClass=O&exemptionReason=U&region=1903&applicationDate=2026-01-09&applicationTermDays=30&receivedDate=2026-01-10&listingDate=2026-01-11&productLocation=Camp%201&applicationVolume=125.5&averageLogVolume=1.2&speciesCodes=HE&endUseCode=SA&comments=Ready',
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
    await selectApplicationCreateTab('Scale')
    await chooseComboBoxOption(
      screen.getByRole('combobox', { name: /^Species list/ }),
      'HE - Hemlock',
    )
    await waitFor(() =>
      expect(mockedFetchApplicationRemainingSpecies).toHaveBeenLastCalledWith('1910', 'LOG', [
        'HE',
      ]),
    )
    const submitButton = await screen.findByRole('button', { name: 'Save application' })
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
          '/provincial/application/create?ownerClientNumber=11111&ownerClientLocationCode=00&ownerContactName=Owner%20Contact&ownerApplicantType=A&agentClientNumber=2176&agentClientLocationCode=12&agentContactName=Agent%20Contact&productTypeCode=LOG&ageClass=O&exemptionReason=U&region=11&applicationDate=2026-01-09&applicationTermDays=30&receivedDate=2026-01-10&listingDate=2026-01-11&productLocation=Camp%201&applicationVolume=125.5&averageLogVolume=1.2&speciesCodes=HE&endUseCode=SA&comments=Ready',
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
      'Applicant',
      'Application',
      'Scale',
      'Documents',
      'Remarks',
      'Offers',
      'Review',
    ])
    await selectApplicationCreateTab('Applicant')
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Agent client' })).toHaveValue('00002176'),
    )
    expect(screen.getByRole('combobox', { name: 'Agent location' })).toBeInTheDocument()

    const submitButton = await screen.findByRole('button', { name: 'Save application' })
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
      ageClass: 'O',
      exemptionType: 'U',
      region: '11',
      applicationDate: formatBusinessIsoDate(),
      applicationTermDays: '30',
      exportScheduleId: '987',
      listingDate: '2026-01-11',
      productLocation: 'Camp 1',
      applicationVolume: '125.5',
      averageLogVolume: '1.2',
      speciesCodes: ['HE'],
      endUseCode: 'SA',
    })
    expect(mockNavigate).toHaveBeenCalledWith('/provincial/application/902', {
      state: {
        applicationCreationNotice: {
          applicationNumber: '902',
        },
      },
    })
  }, 20_000)

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

    await selectApplicationCreateTab('Applicant')
    const ownerDetails = await screen.findByRole('region', { name: 'Applicant client details' })
    // The Client field already names the company, so the details don't repeat it.
    expect(within(ownerDetails).queryByText('Owner Forestry Ltd.')).not.toBeInTheDocument()
    expect(within(ownerDetails).getByText('123 Timber Road')).toBeInTheDocument()
    expect(within(ownerDetails).getByText('owner@example.test')).toBeInTheDocument()
    expect(
      within(ownerDetails).queryByRole('heading', {
        name: 'Applicant client details',
        level: 3,
      }),
    ).not.toBeInTheDocument()
    expect(within(ownerDetails).queryByRole('textbox')).not.toBeInTheDocument()

    await selectApplicationCreateTab('Applicant')
    const agentDetails = await screen.findByRole('region', { name: 'Agent client details' })
    expect(within(agentDetails).queryByText('Agent Export Services')).not.toBeInTheDocument()
    expect(within(agentDetails).getByText('456 Export Road')).toBeInTheDocument()
    expect(within(agentDetails).getByText('agent@example.test')).toBeInTheDocument()
    expect(
      within(agentDetails).queryByRole('heading', {
        name: 'Agent client details',
        level: 3,
      }),
    ).not.toBeInTheDocument()
    expect(within(agentDetails).queryByRole('textbox')).not.toBeInTheDocument()

    expect(mockedFetchApplicationClientData).toHaveBeenCalledWith('00011111', '00')
    expect(mockedFetchApplicationClientData).toHaveBeenCalledWith('00033333', '01')
  })

  it('groups a ten-digit phone and fax number and shows other values as stored', async () => {
    mockedFetchApplicationClientData.mockImplementation(async (clientNumber) => ({
      clientNumber: clientNumber.padStart(8, '0'),
      companyName: 'Owner Forestry Ltd.',
      clientAcronym: '',
      address: '123 Timber Road',
      city: 'Victoria',
      province: 'BC',
      postalCode: 'V8V 1A1',
      country: 'Canada',
      phone: '2505550100',
      fax: '250-555-0101',
      email: 'owner@example.test',
      notfound: '',
    }))
    render(
      <MemoryRouter
        initialEntries={[
          '/provincial/application/create?ownerClientNumber=00011111&ownerClientLocationCode=00&ownerContactName=Owner%20Contact',
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

    const ownerDetails = await screen.findByRole('region', { name: 'Applicant client details' })
    expect(within(ownerDetails).getByText('(250) 555-0100')).toBeInTheDocument()
    expect(within(ownerDetails).getByText('250-555-0101')).toBeInTheDocument()
    expect(within(ownerDetails).queryByText('2505550100')).not.toBeInTheDocument()
  })

  it('keeps agent entry and validation within Applicant and clears it when the agent is removed', async () => {
    mockedSubmitProvincialApplicationCreate.mockResolvedValue(successfulCreate('908'))
    render(
      <MemoryRouter
        initialEntries={[
          '/provincial/application/create?ownerClientNumber=00011111&ownerClientLocationCode=00&ownerContactName=Owner%20Contact&productTypeCode=LOG&ageClass=O&exemptionReason=U&region=11&applicationDate=2026-01-09&applicationTermDays=30&listingDate=2026-01-11&applicationVolume=125.5&speciesCodes=HE&endUseCode=SA',
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
    await userEvent.click(screen.getByRole('checkbox', { name: "I'm an agent" }))
    expect(screen.getByRole('region', { name: 'Agent information' })).toBeVisible()
    expect(
      within(screen.getByRole('region', { name: 'Agent information' })).getByText(
        'Available once a client is selected.',
      ),
    ).toBeVisible()
    expect(screen.queryByRole('tab', { name: 'Agent' })).not.toBeInTheDocument()
    await selectApplicationCreateTab('Application')
    const save = screen.getByRole('button', { name: 'Save application' })
    await waitForApplicationCreateLoads('Applicant client details')
    await userEvent.click(save)
    expect(await screen.findByText('Cannot save yet.')).toBeVisible()
    expect(screen.getByText('Complete the required fields in the Applicant tab.')).toBeVisible()
    // The agent location waits on the agent client, so only the client and contact are counted.
    const applicant = screen.getByRole('tab', {
      name: 'Applicant, 2 required fields outstanding',
    })
    expect(applicant).toHaveAttribute('aria-selected', 'true')
    const agentInformation = screen.getByRole('region', { name: 'Agent information' })
    expect(within(agentInformation).queryByText(/Agent location is required/)).toBeNull()
    expect(mockedSubmitProvincialApplicationCreate).not.toHaveBeenCalled()
    fireEvent.change(screen.getByRole('textbox', { name: 'Agent client' }), {
      target: { value: '00033333' },
    })
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Agent location' })).toBeEnabled(),
    )
    await waitFor(() =>
      expect(applicant).toHaveAccessibleName('Applicant, 2 required fields outstanding'),
    )
    expect(within(agentInformation).getByText('Agent location is required')).toBeVisible()
    await userEvent.click(screen.getByRole('checkbox', { name: "I'm an agent" }))
    expect(screen.queryByRole('region', { name: 'Agent information' })).not.toBeInTheDocument()
    expect(applicant).toHaveAccessibleName('Applicant')
    expect(screen.queryByText('Cannot save yet.')).not.toBeInTheDocument()
    await waitForApplicationCreateLoads('Applicant client details')
    await userEvent.click(save)
    await waitFor(() =>
      expect(mockedSubmitProvincialApplicationCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          applicantTypeCode: 'O',
          agentClientNumber: '',
          agentClientLocationCode: '',
          agentContactName: '',
        }),
      ),
    )
  })

  it('focuses only new application validation attempts and retires resolved feedback', async () => {
    const visibleRects = vi
      .spyOn(HTMLElement.prototype, 'getClientRects')
      .mockReturnValue([new DOMRect(0, 0, 400, 100)] as unknown as DOMRectList)
    try {
      render(
        <MemoryRouter
          initialEntries={[
            '/provincial/application/create?ownerClientNumber=00011111&ownerClientLocationCode=00&ownerContactName=Owner%20Contact&productTypeCode=LOG&ageClass=O&exemptionReason=U&region=11&applicationDate=2026-01-09&applicationTermDays=30&listingDate=2026-01-11&applicationVolume=125.5&speciesCodes=HE&endUseCode=SA',
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
      const save = screen.getByRole('button', { name: 'Save application' })
      await waitForApplicationCreateLoads('Applicant client details')
      const contact = screen.getByRole('textbox', { name: 'Contact name' })
      await userEvent.clear(contact)
      for (let attempt = 0; attempt < 2; attempt += 1) {
        save.focus()
        await userEvent.keyboard('{Enter}')
        const feedback = await screen.findByRole('status')
        expect(feedback).toHaveTextContent('Cannot save yet.')
        // A grid row of its own, like the info notice it replaces, above the tabs.
        expect(feedback.closest('.application-detail-tabs-column')).toBeNull()
        await waitFor(() => expect(feedback).toHaveFocus())
        expect(
          screen.getByRole('tab', { name: 'Applicant, 1 required field outstanding' }),
        ).toBeVisible()
        expect(mockedSubmitProvincialApplicationCreate).not.toHaveBeenCalled()
      }

      await userEvent.type(contact, 'Updated contact')
      expect(screen.queryByText('Cannot save yet.')).not.toBeInTheDocument()
      expect(screen.getByRole('tab', { name: 'Applicant' })).toBeVisible()
      await userEvent.clear(contact)
      await act(async () => {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      })
      expect(screen.queryByText('Cannot save yet.')).not.toBeInTheDocument()
      expect(contact).toHaveFocus()

      save.focus()
      await userEvent.keyboard('{Enter}')
      const feedback = await screen.findByRole('status')
      expect(feedback).toHaveTextContent('Cannot save yet.')
      await waitFor(() => expect(feedback).toHaveFocus())
      expect(mockedSubmitProvincialApplicationCreate).not.toHaveBeenCalled()
    } finally {
      visibleRects.mockRestore()
    }
  })

  it('keeps every typed character and focus in a field while the failed-save notice updates', async () => {
    const visibleRects = vi
      .spyOn(HTMLElement.prototype, 'getClientRects')
      .mockReturnValue([new DOMRect(0, 0, 400, 100)] as unknown as DOMRectList)
    try {
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
      const saveButton = await screen.findByRole('button', { name: 'Save application' })
      await waitForApplicationCreateLoads('Applicant client details')
      await userEvent.click(saveButton)
      const feedback = await screen.findByRole('status')
      expect(feedback).toHaveTextContent('Applicant, Application and Scale tabs')
      await waitFor(() => expect(feedback).toHaveFocus())

      const contact = screen.getByRole('textbox', { name: 'Contact name' })
      await userEvent.click(contact)
      for (const [index, character] of [...'test'].entries()) {
        await userEvent.type(contact, character, { skipClick: true })
        await act(async () => {
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
        })
        expect(contact).toHaveValue('test'.slice(0, index + 1))
        expect(contact).toHaveFocus()
      }
      expect(feedback).toHaveTextContent('Application and Scale tabs')
      expect(feedback).not.toHaveTextContent('Applicant')
    } finally {
      visibleRects.mockRestore()
    }
  })

  it('submits a ministerial applicant type without agent fields', async () => {
    mockedSubmitProvincialApplicationCreate.mockResolvedValue(successfulCreate('904'))

    render(
      <MemoryRouter
        initialEntries={[
          '/provincial/application/create?ownerClientNumber=00011111&ownerClientLocationCode=00&ownerContactName=Owner%20Contact&ownerApplicantType=M&productTypeCode=LOG&ageClass=O&exemptionReason=U&region=11&applicationDate=2026-01-09&applicationTermDays=30&receivedDate=2026-01-10&listingDate=2026-01-11&productLocation=Camp%201&applicationVolume=125.5&averageLogVolume=1.2&speciesCodes=HE&endUseCode=SA&comments=Ready',
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

    await selectApplicationCreateTab('Applicant')
    // Figma has no applicant type control; a prefilled Ministerial type is kept and shown.
    expect(screen.getByRole('heading', { name: 'Ministerial', level: 3 })).toBeInTheDocument()
    expect(screen.queryByLabelText('Applicant type')).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Agent' })).not.toBeInTheDocument()

    const submitButton = await screen.findByRole('button', { name: 'Save application' })
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

  it('loads owner locations after a canonical client selection', async () => {
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

    await selectApplicationCreateTab('Applicant')
    const ownerClientNumberInput = screen.getByRole('textbox', { name: 'Client' })
    mockedFetchApplicationClientLocations.mockClear()

    fireEvent.change(ownerClientNumberInput, { target: { value: '00011111' } })

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

    const ownerClientNumberInput = await screen.findByRole('textbox', { name: 'Client' })
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

    const ownerClientNumber = screen.getByRole('textbox', { name: 'Client' })
    fireEvent.change(ownerClientNumber, { target: { value: '00099988' } })
    await waitFor(() =>
      expect(mockedFetchApplicationClientLocations).toHaveBeenCalledWith('00099988', 'owner'),
    )
    expect(screen.getByText('Client details unavailable')).toBeInTheDocument()

    await selectApplicationCreateTab('Applicant')
    const agentClientNumber = screen.getByRole('textbox', { name: 'Agent client' })
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
            `/provincial/application/create?ownerClientNumber=${clientNumber}&ownerClientLocationCode=00&ownerContactName=Owner%20Contact&productTypeCode=LOG&ageClass=O&exemptionReason=U&region=11&applicationDate=2026-01-09&applicationTermDays=30&receivedDate=2026-01-10&listingDate=2026-01-11&productLocation=Camp%201&applicationVolume=125.5&averageLogVolume=1.2&speciesCodes=HE&endUseCode=SA&comments=Ready`,
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

      const submitButton = await screen.findByRole('button', { name: 'Save application' })
      await waitFor(() => expect(submitButton).toBeEnabled())
      await userEvent.click(submitButton)

      expect(await screen.findAllByText('Client must be 1 to 8 digits')).not.toHaveLength(0)
      expect(mockedFetchApplicationClientLocations).not.toHaveBeenCalled()
      expect(mockedSubmitProvincialApplicationCreate).not.toHaveBeenCalled()
    },
  )

  // Initializing the owner and agent lookup state is interaction-heavy under coverage.
  it('clears the stale agent location but keeps the typed contact name when the client is cleared', async () => {
    render(
      <MemoryRouter
        initialEntries={[
          '/provincial/application/create?ownerClientNumber=00011111&ownerClientLocationCode=00&ownerContactName=Owner%20Contact&ownerApplicantType=A&agentClientNumber=2176&agentClientLocationCode=12&agentContactName=Agent%20Contact&productTypeCode=LOG&ageClass=O&exemptionReason=U&region=11&applicationDate=2026-01-09&applicationTermDays=30&receivedDate=2026-01-10&listingDate=2026-01-11&productLocation=Camp%201&applicationVolume=125.5&averageLogVolume=1.2&speciesCodes=HE&endUseCode=SA&comments=Ready',
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

    await selectApplicationCreateTab('Applicant')
    const agentSection = screen.getByRole('region', { name: 'Agent information' })
    const agentNumber = within(agentSection).getByRole('textbox', { name: 'Agent client' })
    await waitFor(() => expect(agentNumber).toHaveValue('00002176'))
    await waitFor(() =>
      expect(within(agentSection).getByRole('textbox', { name: 'Contact name' })).toHaveValue(
        'Agent Contact',
      ),
    )

    fireEvent.change(agentNumber, { target: { value: '' } })

    await waitFor(() => {
      const contactLocation = within(agentSection).getByRole('combobox', {
        name: 'Agent location',
      })
      expect(contactLocation).toHaveValue('')
      expect(contactLocation).toBeDisabled()
      const contactName = within(agentSection).getByRole('textbox', { name: 'Contact name' })
      expect(contactName).toHaveValue('Agent Contact')
      expect(contactName).toBeEnabled()
    })
    expect(screen.queryByRole('region', { name: 'Agent client details' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Save application' }))
    expect(
      await screen.findAllByText(
        'Agent client is required. Enter name, acronym, or client number (min. 3 characters).',
      ),
    ).not.toHaveLength(0)
    expect(mockedSubmitProvincialApplicationCreate).not.toHaveBeenCalled()
  }, 20_000)

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

    const ownerName = await screen.findByRole('textbox', { name: 'Contact name' })
    await waitFor(() => expect(ownerName).toHaveValue('Owner Contact'))
    fireEvent.change(ownerName, { target: { value: 'Café' } })

    const submitButton = screen.getByRole('button', { name: 'Save application' })
    await waitFor(() => expect(submitButton).toBeEnabled())
    await userEvent.click(submitButton)

    expect(
      await screen.findAllByText(
        'Contact name contains unsupported characters. Use unaccented letters, numbers, spaces, or standard punctuation.',
      ),
    ).not.toHaveLength(0)
    await selectApplicationCreateTab('Scale')
    const locationOfLogs = screen.getByRole('textbox', { name: 'Location of logs' })
    expect(locationOfLogs).toHaveAttribute('maxlength', '250')
    expect(
      locationOfLogs.closest('.cds--form-item')?.querySelector('.cds--text-area__label-counter'),
    ).toHaveTextContent('251/250')
    expect(screen.getByText('Location of logs must be 250 characters or fewer')).toBeInTheDocument()
    await selectApplicationCreateTab('Remarks')
    expect(screen.queryByRole('textbox', { name: 'Remarks' })).not.toBeInTheDocument()
    expect(mockedSubmitProvincialApplicationCreate).not.toHaveBeenCalled()

    await selectApplicationCreateTab('Applicant')
    fireEvent.change(screen.getByRole('textbox', { name: 'Contact name' }), {
      target: { value: 'O'.repeat(120) },
    })
    await selectApplicationCreateTab('Scale')
    fireEvent.change(screen.getByRole('textbox', { name: 'Location of logs' }), {
      target: { value: 'L'.repeat(250) },
    })
    await selectApplicationCreateTab('Remarks')
    await userEvent.click(submitButton)

    await waitFor(() =>
      expect(mockedSubmitProvincialApplicationCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          ownerContactName: 'O'.repeat(120),
          productLocation: 'L'.repeat(250),
        }),
      ),
    )
  }, 20_000)

  const renderSubmitterApplicationCreate = (query = '') => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        capabilities: createTestCapabilities({
          principal: 'bceid\\submitter',
          roles: ['PROVINCIAL_SUBMITTER_00077881'],
          forestClientNumber: '00077881',
          orgUnitNo: '11',
        }),
        canPerform: (action: string) =>
          action !== '/changeApplicantType' && action !== '/applicationsReview',
      }),
    )
    render(
      <MemoryRouter initialEntries={[`/provincial/application/create${query}`]}>
        <Routes>
          <Route
            path="/provincial/application/create"
            element={<ProvincialApplicationCreatePage />}
          />
        </Routes>
      </MemoryRouter>,
    )
  }

  const READY_SUBMITTER_APPLICATION_QUERY =
    '?ownerContactName=Owner%20Contact&productTypeCode=LOG&ageClass=O&exemptionReason=U&applicationDate=2026-01-09&applicationTermDays=30&listingDate=2026-01-11&productLocation=Camp%201&applicationVolume=125.5&averageLogVolume=1.2&speciesCodes=HE&endUseCode=SA'

  const confirmSubmitterSave = async () => {
    await userEvent.click(screen.getByRole('button', { name: 'Save application' }))
    const dialog = await screen.findByRole('dialog', { name: 'Confirm application accuracy' })
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'I Agree' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save application' }))
  }

  it('ignores forged agent prefill for a provincial submitter', async () => {
    renderSubmitterApplicationCreate(
      '?ownerApplicantType=A&agentClientNumber=00033333&agentClientLocationCode=01&agentContactName=Forged%20Agent',
    )

    await selectApplicationCreateTab('Applicant')
    expect(screen.getByRole('heading', { name: 'Owner', level: 3 })).toBeInTheDocument()
    expect(screen.queryByLabelText('Applicant type')).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Agent' })).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: "I'm an agent" })).not.toBeChecked()
    expect(screen.queryByRole('region', { name: 'Agent information' })).not.toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Client' })).toHaveValue(
        'Owner Forestry Ltd. · 00077881',
      ),
    )
    expect(mockedFetchApplicationClientLocations).not.toHaveBeenCalledWith('00033333', 'agent')
  })

  it('lets a provincial submitter create an application as the owner', async () => {
    mockedSubmitProvincialApplicationCreate.mockResolvedValue(successfulCreate('910'))
    renderSubmitterApplicationCreate(READY_SUBMITTER_APPLICATION_QUERY)

    await selectApplicationCreateTab('Applicant')
    const agentChoice = screen.getByRole('checkbox', { name: "I'm an agent" })
    expect(agentChoice).toBeEnabled()
    expect(agentChoice).not.toBeChecked()
    expect(agentChoice.closest('.application-create-applicant-type')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Client' })).toHaveAttribute('readonly')
    await waitForApplicationCreateLoads('Applicant client details')
    await confirmSubmitterSave()

    await waitFor(() =>
      expect(mockedSubmitProvincialApplicationCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          applicantTypeCode: 'O',
          ownerClientNumber: '00077881',
          ownerClientLocationCode: '00',
          agentClientNumber: '',
          agentClientLocationCode: '',
          agentContactName: '',
        }),
      ),
    )
  })

  const NO_OPEN_SCHEDULES_OPTIONS = {
    productTypes: [{ value: 'LOG', label: 'Logs' }],
    exemptionTypes: [{ value: 'SECTION_1', label: 'Section 1' }],
    exemptionReasons: [{ value: 'U', label: 'Unadvertised' }],
    applicationStatuses: [],
    growthTypes: [{ value: 'O', label: 'Old Growth' }],
    regions: [{ value: '11', label: 'Cariboo' }],
    currentSchedules: [],
    nextSchedules: [],
  } satisfies Awaited<ReturnType<typeof fetchProvincialApplicationOptions>>

  it('lets a provincial submitter save with a blank Advertising list date while no list date is open', async () => {
    mockedSubmitProvincialApplicationCreate.mockResolvedValue(successfulCreate('912'))
    mockedFetchProvincialApplicationOptions.mockResolvedValueOnce(NO_OPEN_SCHEDULES_OPTIONS)
    renderSubmitterApplicationCreate(READY_SUBMITTER_APPLICATION_QUERY)

    await waitForApplicationCreateLoads('Applicant client details')
    await selectApplicationCreateTab('Application')
    expect(screen.getByText('Advertising list date').closest('.required-label')).toBeNull()
    expect(screen.queryAllByRole('radio')).toHaveLength(0)
    await confirmSubmitterSave()

    await waitFor(() =>
      expect(mockedSubmitProvincialApplicationCreate).toHaveBeenCalledWith(
        expect.objectContaining({ exportScheduleId: '' }),
      ),
    )
    expect(screen.queryByText('Select a valid list date')).not.toBeInTheDocument()
  })

  it('still asks a provincial submitter for an Advertising list date when a list date is open', async () => {
    renderSubmitterApplicationCreate(
      READY_SUBMITTER_APPLICATION_QUERY.replace('listingDate=2026-01-11', 'listingDate=2026-02-02'),
    )

    await waitForApplicationCreateLoads('Applicant client details')
    await userEvent.click(await screen.findByRole('button', { name: 'Save application' }))

    await selectApplicationCreateTab('Application')
    expect(await screen.findAllByText('Select a valid list date')).not.toHaveLength(0)
    expect(mockedSubmitProvincialApplicationCreate).not.toHaveBeenCalled()
  })

  it('lets a provincial submitter act as the agent for an owner they look up', async () => {
    mockedSubmitProvincialApplicationCreate.mockResolvedValue(successfulCreate('911'))
    renderSubmitterApplicationCreate(READY_SUBMITTER_APPLICATION_QUERY)

    await selectApplicationCreateTab('Applicant')
    await waitForApplicationCreateLoads('Applicant client details')
    await userEvent.click(screen.getByRole('checkbox', { name: "I'm an agent" }))

    const agentInformation = screen.getByRole('region', { name: 'Agent information' })
    const agentClient = within(agentInformation).getByRole('textbox', { name: 'Agent client' })
    await waitFor(() => expect(agentClient).toHaveValue('Owner Forestry Ltd. · 00077881'))
    expect(agentClient).toHaveAttribute('readonly')
    await waitFor(() =>
      expect(
        within(agentInformation).getByRole('combobox', { name: 'Agent location' }),
      ).toBeEnabled(),
    )
    const ownerClient = screen.getByRole('textbox', { name: 'Client' })
    expect(ownerClient).toHaveValue('')
    expect(ownerClient).not.toHaveAttribute('readonly')
    expect(ownerClient).toHaveAttribute('data-counterparty-client-number', '00077881')

    fireEvent.change(ownerClient, { target: { value: '00011111' } })
    await waitFor(() =>
      expect(mockedFetchApplicationClientLocations).toHaveBeenCalledWith(
        '00011111',
        'owner',
        '',
        '00077881',
      ),
    )
    await waitFor(() =>
      expect(mockedFetchApplicationClientData).toHaveBeenCalledWith('00011111', '00', {
        counterpartyClientNumber: '00077881',
      }),
    )
    fireEvent.change(within(agentInformation).getByRole('textbox', { name: 'Contact name' }), {
      target: { value: 'Agent Contact' },
    })
    await waitForApplicationCreateLoads('Applicant client details', 'Agent client details')
    await confirmSubmitterSave()

    await waitFor(() =>
      expect(mockedSubmitProvincialApplicationCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          applicantTypeCode: 'A',
          ownerClientNumber: '00011111',
          ownerClientLocationCode: '00',
          ownerContactName: 'Owner Contact',
          agentClientNumber: '00077881',
          agentClientLocationCode: '00',
          agentContactName: 'Agent Contact',
        }),
      ),
    )
  }, 20_000)

  it('names a locked submitter owner and agent by company, acronym and number', async () => {
    mockedFetchApplicationClientData.mockImplementation(async (clientNumber) => ({
      clientNumber: clientNumber.padStart(8, '0'),
      companyName: 'Submitter Forestry Ltd.',
      clientAcronym: 'FCC',
      address: '123 Timber Road',
      city: 'Victoria',
      province: 'BC',
      postalCode: 'V8V 1A1',
      country: 'Canada',
      phone: '',
      fax: '',
      email: '',
      notfound: '',
    }))
    renderSubmitterApplicationCreate(READY_SUBMITTER_APPLICATION_QUERY)

    await selectApplicationCreateTab('Applicant')
    await waitForApplicationCreateLoads('Applicant client details')
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Client' })).toHaveValue(
        'Submitter Forestry Ltd. (FCC) · 00077881',
      ),
    )

    await userEvent.click(screen.getByRole('checkbox', { name: "I'm an agent" }))
    const agentInformation = screen.getByRole('region', { name: 'Agent information' })
    await waitFor(() =>
      expect(within(agentInformation).getByRole('textbox', { name: 'Agent client' })).toHaveValue(
        'Submitter Forestry Ltd. (FCC) · 00077881',
      ),
    )
  })

  it('refuses the submitter agent as the owner too', async () => {
    renderSubmitterApplicationCreate(READY_SUBMITTER_APPLICATION_QUERY)

    await selectApplicationCreateTab('Applicant')
    await waitForApplicationCreateLoads('Applicant client details')
    await userEvent.click(screen.getByRole('checkbox', { name: "I'm an agent" }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Client' }), {
      target: { value: '00077881' },
    })
    await userEvent.click(screen.getByRole('button', { name: 'Save application' }))

    expect(
      (await screen.findAllByText('The owner must be a different client from the agent')).length,
    ).toBeGreaterThan(0)
    expect(mockedSubmitProvincialApplicationCreate).not.toHaveBeenCalled()
  })

  it('refuses staff naming the owner as the agent', async () => {
    render(
      <MemoryRouter
        initialEntries={[
          '/provincial/application/create?ownerClientNumber=00011111&ownerClientLocationCode=00&ownerContactName=Owner%20Contact&productTypeCode=LOG&ageClass=O&exemptionReason=U&region=11&applicationDate=2026-01-09&applicationTermDays=30&listingDate=2026-01-11&applicationVolume=125.5&speciesCodes=HE&endUseCode=SA',
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
    await waitForApplicationCreateLoads('Applicant client details')
    await userEvent.click(screen.getByRole('checkbox', { name: "I'm an agent" }))
    const agentInformation = screen.getByRole('region', { name: 'Agent information' })
    fireEvent.change(within(agentInformation).getByRole('textbox', { name: 'Agent client' }), {
      target: { value: '00011111' },
    })
    fireEvent.change(within(agentInformation).getByRole('textbox', { name: 'Contact name' }), {
      target: { value: 'Agent Contact' },
    })
    await userEvent.click(screen.getByRole('button', { name: 'Save application' }))

    expect(
      await within(agentInformation).findByText(
        'The agent must be a different client from the owner',
      ),
    ).toBeVisible()
    expect(mockedSubmitProvincialApplicationCreate).not.toHaveBeenCalled()
  })

  it('restores the submitter as the owner when the agent choice is cleared', async () => {
    renderSubmitterApplicationCreate()

    await selectApplicationCreateTab('Applicant')
    const agentChoice = screen.getByRole('checkbox', { name: "I'm an agent" })
    await userEvent.click(agentChoice)
    expect(screen.getByRole('textbox', { name: 'Client' })).toHaveValue('')

    await userEvent.click(agentChoice)
    expect(screen.queryByRole('region', { name: 'Agent information' })).not.toBeInTheDocument()
    const ownerClient = screen.getByRole('textbox', { name: 'Client' })
    await waitFor(() => expect(ownerClient).toHaveValue('Owner Forestry Ltd. · 00077881'))
    expect(ownerClient).toHaveAttribute('readonly')
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Client location' })).toHaveValue('00'),
    )
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
          `/provincial/application/create?ownerClientNumber=00011111&ownerClientLocationCode=00&ownerContactName=Owner%20Contact&productTypeCode=LOG&ageClass=O&exemptionReason=U&region=11&applicationDate=2026-01-09&applicationTermDays=30&receivedDate=2026-01-10&listingDate=2026-01-11&productLocation=Camp%201&applicationVolume=125.5&averageLogVolume=1.2&speciesCodes=HE&endUseCode=SA&comments=${encodeURIComponent('R'.repeat(255))}`,
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
    expect(screen.queryByRole('tabpanel', { name: 'Remarks' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: 'Offers' }))
    expect(screen.getByRole('tabpanel', { name: 'Offers' })).toBeInTheDocument()

    const saveButton = screen.getByRole('button', { name: 'Save application' })
    await waitForApplicationCreateLoads('Applicant client details')
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
          '/provincial/application/create?ownerClientNumber=00011111&ownerContactName=Owner%20Contact&productTypeCode=LOG&ageClass=O&exemptionReason=U&region=11&applicationDate=2026-01-09&applicationTermDays=30&receivedDate=2026-01-10&listingDate=2026-01-11&productLocation=Camp%201&applicationVolume=125.5&averageLogVolume=1.2&speciesCodes=HE&endUseCode=SA&comments=Ready',
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

    const submitButton = await screen.findByRole('button', { name: 'Save application' })
    await waitFor(() => expect(submitButton).toBeEnabled())
    await userEvent.click(submitButton)

    expect(await screen.findAllByText('Client location is required')).not.toHaveLength(0)
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
      expect(screen.getByRole('textbox', { name: 'Application date' })).toHaveValue(today)
      expect(screen.getByRole('textbox', { name: 'Application date' })).toHaveAttribute('readonly')
      expect(screen.getByRole('spinbutton', { name: 'Exemption term (days)' })).toHaveValue(180)
      expect(screen.queryByRole('textbox', { name: /Date received/i })).not.toBeInTheDocument()
      expect(screen.getByRole('radio', { name: 'Aug 5, 2026' })).toBeChecked()
      expect(screen.getByRole('radio', { name: 'Aug 12, 2026' })).not.toBeChecked()
      expect(screen.getByRole('radio', { name: 'No list date' })).not.toBeChecked()
    })
    expect(screen.getByRole('radio', { name: 'Aug 5, 2026' })).toHaveAttribute('value', '1002')
    expect(screen.getByRole('radio', { name: 'Aug 12, 2026' })).toHaveAttribute('value', '1003')
    expect(screen.queryByRole('radio', { name: '2026-08-05' })).not.toBeInTheDocument()

    expect(screen.getByRole('combobox', { name: 'Region' })).toBeEnabled()
    await selectApplicationCreateTab('Applicant')
    expect(screen.getByRole('textbox', { name: 'Client' })).not.toHaveAttribute('readonly')
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
        canPerform: (action: string) =>
          action !== '/changeApplicantType' && action !== '/applicationsReview',
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
      nextSchedules: [
        { value: '1002', label: '2026-10-07' },
        { value: '1003', label: '2026-10-14' },
        { value: '', label: 'Blank' },
      ],
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
    expect(screen.getByRole('radio', { name: 'Oct 7, 2026' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Oct 7, 2026' })).toHaveAttribute('value', '1002')
    expect(screen.getByRole('radio', { name: 'Oct 14, 2026' })).not.toBeChecked()
    expect(screen.queryByRole('radio', { name: 'No list date' })).not.toBeInTheDocument()

    await selectApplicationCreateTab('Applicant')
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Client' })).toHaveValue(
        'Owner Forestry Ltd. · 00077881',
      ),
    )
    expect(screen.getByRole('textbox', { name: 'Client' })).toHaveAttribute('readonly')
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

    render(
      <MemoryRouter
        initialEntries={[
          '/provincial/application/create?ownerClientNumber=00011111&ownerClientLocationCode=00&productTypeCode=LOG&ageClass=O&exemptionReason=U&region=11&applicationDate=2026-01-09&applicationTermDays=30&receivedDate=2026-01-10&listingDate=2026-01-11&productLocation=Camp%201&applicationVolume=125.5&averageLogVolume=1.2&speciesCodes=HE&endUseCode=SA&comments=Ready',
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
    await userEvent.click(screen.getByRole('button', { name: 'Save application' }))

    expect(mockedSubmitProvincialApplicationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerContactName: 'Typed Owner',
      }),
    )
  })

  it('takes the owner contact name as free text without filling it from the client', async () => {
    mockedSubmitProvincialApplicationCreate.mockResolvedValue(successfulCreate('904'))

    render(
      <MemoryRouter
        initialEntries={[
          '/provincial/application/create?ownerClientNumber=00011111&ownerClientLocationCode=00&productTypeCode=LOG&ageClass=O&exemptionReason=U&region=11&applicationDate=2026-01-09&applicationTermDays=30&receivedDate=2026-01-10&listingDate=2026-01-11&productLocation=Camp%201&applicationVolume=125.5&averageLogVolume=1.2&speciesCodes=HE&endUseCode=SA&comments=Ready',
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

    await selectApplicationCreateTab('Applicant')
    const ownerNameInput = await screen.findByRole('textbox', { name: 'Contact name' })
    expect(
      await screen.findByRole('region', { name: 'Applicant client details' }),
    ).toBeInTheDocument()
    expect(ownerNameInput).toHaveValue('')
    expect(ownerNameInput).toBeEnabled()
    fireEvent.change(ownerNameInput, { target: { value: 'Advertising Owner' } })
    await waitFor(() => expect(ownerNameInput).toHaveValue('Advertising Owner'))
    await userEvent.click(screen.getByRole('button', { name: 'Save application' }))

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

    const submitButton = await screen.findByRole('button', { name: 'Save application' })
    await waitFor(() => expect(submitButton).toBeEnabled())
    await userEvent.click(submitButton)

    expect(
      await screen.findAllByText('Application volume must have no more than two decimal places'),
    ).not.toHaveLength(0)
    expect(
      screen.getByText('Average log volume must have no more than one decimal place'),
    ).toBeInTheDocument()
    expect(mockedSubmitProvincialApplicationCreate).not.toHaveBeenCalled()
  })

  it('asks for an application volume greater than 0, as its helper says', async () => {
    render(
      <MemoryRouter
        initialEntries={[
          '/provincial/application/create?ownerClientNumber=00011111&ownerClientLocationCode=00&ownerContactName=Owner%20Contact&productTypeCode=H&ageClass=O&exemptionReason=U&region=11&applicationDate=2026-01-09&applicationTermDays=30&receivedDate=2026-01-10&listingDate=2026-01-11&productLocation=Camp%201&applicationVolume=0&averageLogVolume=1.2&speciesCodes=HE&endUseCode=SA&comments=Ready',
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

    await userEvent.click(await screen.findByRole('button', { name: 'Save application' }))

    expect(
      (await screen.findAllByText('Application volume must be greater than 0')).length,
    ).toBeGreaterThan(0)
    expect(screen.queryByText('Use a positive numeric value')).not.toBeInTheDocument()
    expect(mockedSubmitProvincialApplicationCreate).not.toHaveBeenCalled()
  })

  it('starts Application volume and Average log volume at 0.0', async () => {
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

    await selectApplicationCreateTab('Scale')
    expect(await screen.findByRole('textbox', { name: 'Application volume (m³)' })).toHaveValue(
      '0.0',
    )
    expect(screen.getByRole('spinbutton', { name: 'Average log volume (m³)' })).toHaveValue(0)
  })

  it('refuses an Application volume left at its 0.0 starting value', async () => {
    render(
      <MemoryRouter
        initialEntries={[
          '/provincial/application/create?ownerClientNumber=00011111&ownerClientLocationCode=00&ownerContactName=Owner%20Contact&productTypeCode=H&ageClass=O&exemptionReason=U&region=11&applicationDate=2026-01-09&applicationTermDays=30&receivedDate=2026-01-10&listingDate=2026-01-11&productLocation=Camp%201&speciesCodes=HE&endUseCode=SA&comments=Ready',
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

    await userEvent.click(await screen.findByRole('button', { name: 'Save application' }))

    expect(
      (await screen.findAllByText('Application volume must be greater than 0')).length,
    ).toBeGreaterThan(0)
    expect(screen.queryByText(/Average log volume/, { selector: '[role="alert"]' })).toBeNull()
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

    const submitButton = await screen.findByRole('button', { name: 'Save application' })
    await userEvent.click(submitButton)

    expect(
      screen.getAllByText('Application volume must be 9999999.99 or less').length,
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

  it('shows the same Scale fields for H, S, and T and marks only the required ones', async () => {
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

    const expectScaleFields = (logDetailsRequired: boolean) => {
      const ageClass = screen.getByRole('combobox', { name: 'Age class' })
      const location = screen.getByRole('textbox', { name: 'Location of logs' })
      const logVolume = screen.getByRole('spinbutton', { name: 'Average log volume (m³)' })
      expect(ageClass).toHaveValue('Old Growth')
      expect(location).toHaveValue('Camp 1')
      expect(logVolume).toHaveValue(1.2)
      expect(ageClass).toHaveAttribute('aria-required', 'true')
      for (const field of [location, logVolume]) {
        expect(field).toHaveAttribute('aria-required', String(logDetailsRequired))
      }
    }

    await selectApplicationCreateTab('Application')
    const productType = await screen.findByRole('combobox', { name: 'Product type' })
    await waitFor(() => expect(productType).toHaveValue('Harvested Timber'))
    await selectApplicationCreateTab('Scale')
    await waitFor(() => expectScaleFields(true))

    await selectApplicationCreateTab('Application')
    await chooseComboBoxOption(
      screen.getByRole('combobox', { name: 'Product type' }),
      'Standing Timber',
    )
    await selectApplicationCreateTab('Scale')
    expectScaleFields(false)

    await selectApplicationCreateTab('Application')
    await chooseComboBoxOption(screen.getByRole('combobox', { name: 'Product type' }), 'Timber')
    await selectApplicationCreateTab('Scale')
    expectScaleFields(false)
  })

  it('does not apply H-only rules to a standing-timber application', async () => {
    mockedSubmitProvincialApplicationCreate.mockResolvedValue(successfulCreate('904'))

    render(
      <MemoryRouter
        initialEntries={[
          '/provincial/application/create?ownerClientNumber=00011111&ownerClientLocationCode=00&ownerContactName=Owner%20Contact&productTypeCode=S&ageClass=O&exemptionReason=U&region=11&applicationDate=2026-01-09&applicationTermDays=30&receivedDate=2026-01-10&listingDate=2026-01-11&applicationVolume=125.5&speciesCodes=HE&endUseCode=SA&comments=Ready',
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

    await userEvent.click(await screen.findByRole('button', { name: 'Save application' }))

    await waitFor(() => {
      expect(mockedSubmitProvincialApplicationCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          productTypeCode: 'S',
          ageClass: 'O',
          productLocation: '',
          averageLogVolume: '0.0',
        }),
      )
    })
  })

  it('lets a standing-timber application save with a cleared average log volume', async () => {
    mockedSubmitProvincialApplicationCreate.mockResolvedValue(successfulCreate('904'))

    render(
      <MemoryRouter
        initialEntries={[
          '/provincial/application/create?ownerClientNumber=00011111&ownerClientLocationCode=00&ownerContactName=Owner%20Contact&productTypeCode=S&ageClass=O&exemptionReason=U&region=11&applicationDate=2026-01-09&applicationTermDays=30&receivedDate=2026-01-10&listingDate=2026-01-11&applicationVolume=125.5&averageLogVolume=&speciesCodes=HE&endUseCode=SA&comments=Ready',
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

    await userEvent.click(await screen.findByRole('button', { name: 'Save application' }))

    await waitFor(() => {
      expect(mockedSubmitProvincialApplicationCreate).toHaveBeenCalledWith(
        expect.objectContaining({ productTypeCode: 'S', averageLogVolume: '' }),
      )
    })
  })

  it.each(['H', 'S', 'T'])(
    'requires an age class before saving product type %s',
    async (productTypeCode) => {
      render(
        <MemoryRouter
          initialEntries={[
            `/provincial/application/create?ownerClientNumber=00011111&ownerClientLocationCode=00&ownerContactName=Owner%20Contact&productTypeCode=${productTypeCode}&exemptionReason=U&region=11&applicationDate=2026-01-09&applicationTermDays=30&receivedDate=2026-01-10&listingDate=2026-01-11&productLocation=Camp%201&applicationVolume=125.5&averageLogVolume=1.2&speciesCodes=HE&endUseCode=SA&comments=Ready`,
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

      const submitButton = await screen.findByRole('button', { name: 'Save application' })
      await waitFor(() => expect(submitButton).toBeEnabled())
      await userEvent.click(submitButton)

      expect(await screen.findAllByText('Age class is required')).not.toHaveLength(0)
      expect(mockedSubmitProvincialApplicationCreate).not.toHaveBeenCalled()
    },
  )

  it.each(['S', 'T'])(
    'shows an average log volume over 99.9 as a field error for product type %s',
    async (productTypeCode) => {
      render(
        <MemoryRouter
          initialEntries={[
            `/provincial/application/create?ownerClientNumber=00011111&ownerClientLocationCode=00&ownerContactName=Owner%20Contact&productTypeCode=${productTypeCode}&ageClass=O&exemptionReason=U&region=11&applicationDate=2026-01-09&applicationTermDays=30&receivedDate=2026-01-10&listingDate=2026-01-11&applicationVolume=125.5&averageLogVolume=150&speciesCodes=HE&endUseCode=SA&comments=Ready`,
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

      await userEvent.click(await screen.findByRole('button', { name: 'Save application' }))

      const logVolume = await screen.findByRole('spinbutton', { name: 'Average log volume (m³)' })
      await waitFor(() => expect(logVolume).toHaveAttribute('aria-invalid', 'true'))
      expect(screen.getByText('Average log volume must be 99.9 or less')).toBeInTheDocument()
      expect(mockedSubmitProvincialApplicationCreate).not.toHaveBeenCalled()
    },
  )

  it('shows provincial application species validation when no species are available', async () => {
    mockedFetchApplicationRemainingSpecies.mockResolvedValue([])

    render(
      <MemoryRouter
        initialEntries={[
          '/provincial/application/create?ownerClientNumber=00011111&ownerClientLocationCode=00&ownerContactName=Owner%20Contact&productTypeCode=LOG&ageClass=O&exemptionReason=U&region=11&applicationDate=2026-01-09&applicationTermDays=30&receivedDate=2026-01-10&listingDate=2026-01-11&productLocation=Camp%201&applicationVolume=125.5&averageLogVolume=1.2',
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

    const submitButton = await screen.findByRole('button', { name: 'Save application' })
    await userEvent.click(submitButton)

    const speciesErrors = await screen.findAllByText(
      'At least one species is required, but no species are available for the selected region and product type',
    )
    expect(speciesErrors.length).toBeGreaterThan(0)
    expect(mockedSubmitProvincialApplicationCreate).not.toHaveBeenCalled()
  })

  it('does not use search exemption type as create exemption reason', async () => {
    render(
      <MemoryRouter
        initialEntries={[
          '/provincial/application/create?ownerClientNumber=00011111&ownerClientLocationCode=00&ownerContactName=Owner%20Contact&productTypeCode=LOG&ageClass=O&exemptionType=ALL&region=11&applicationDate=2026-01-09&applicationTermDays=30&receivedDate=2026-01-10&listingDate=2026-01-11&productLocation=Camp%201&applicationVolume=125.5&averageLogVolume=1.2&speciesCodes=HE&endUseCode=SA&comments=Ready',
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

    const submitButton = await screen.findByRole('button', { name: 'Save application' })
    await waitFor(() => expect(submitButton).toBeEnabled())
    await userEvent.click(submitButton)

    expect(await screen.findAllByText('Exemption reason is required')).not.toHaveLength(0)
    expect(mockedSubmitProvincialApplicationCreate).not.toHaveBeenCalled()
  })

  it('submits a provincial exemption without application numbers and navigates to details', async () => {
    mockedSubmitProvincialExemptionCreate.mockResolvedValue(successfulCreate('EX-777'))

    render(
      <MemoryRouter initialEntries={['/provincial/exemption/create']}>
        <Routes>
          <Route path="/provincial/exemption/create" element={<ProvincialExemptionCreatePage />} />
        </Routes>
      </MemoryRouter>,
    )

    await screen.findByRole('heading', { level: 1, name: 'Create new exemption' })
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Exemption details',
      'Applications',
      'Documents',
      'Permits',
      'Fees',
    ])
    await selectExemptionCreateTab('Documents')
    expect(screen.getByRole('tabpanel', { name: 'Documents' })).toHaveTextContent(
      /^Available after the exemption is saved\.$/,
    )
    expect(screen.queryByRole('button', { name: 'Add document' })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Client' })).not.toBeInTheDocument()
    await selectExemptionCreateTab('Exemption details')
    const exemptionDetails = screen.getByRole('group', { name: 'Exemption details' })
    expect(exemptionDetails).toHaveClass('create-form-section')
    expect(exemptionDetails.querySelector('.record-field-grid')).toHaveClass(
      'record-field-grid--editing',
    )
    expect(screen.getByLabelText('Approval volume (m³)')).toBeInTheDocument()
    expect(screen.queryByLabelText('Approved volumeume (m³)')).not.toBeInTheDocument()
    const exemptionFormActions = screen.getByRole('group', { name: 'Page actions' })
    expect(
      within(exemptionFormActions)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Cancel', 'Save exemption'])
    expect(within(exemptionFormActions).getByRole('button', { name: 'Cancel' })).toHaveAttribute(
      'type',
      'button',
    )
    expect(
      within(exemptionFormActions).getByRole('button', { name: 'Save exemption' }),
    ).toHaveAttribute('type', 'button')
    expect(screen.queryByRole('group', { name: 'New exemption state' })).not.toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByRole('radio', { name: 'Order in Council' })).toBeChecked(),
    )
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Status' })).toHaveValue('Active'),
    )
    expect(screen.getByText('Status', { selector: 'label, .required-label' })).not.toHaveClass(
      'required-label',
    )
    expect(screen.getByRole('combobox', { name: 'Status' })).not.toHaveAttribute(
      'aria-required',
      'true',
    )
    await chooseExemptionType('Section 1')
    expect(screen.queryByRole('textbox', { name: /exemption number/i })).not.toBeInTheDocument()
    expect(screen.queryByText('Exemption holder')).not.toBeInTheDocument()
    expect(screen.getByText('Status', { selector: 'label, .required-label' })).toHaveClass(
      'required-label',
    )
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveAttribute(
      'aria-required',
      'true',
    )
    await chooseComboBoxOption(screen.getByRole('combobox', { name: 'Status' }), 'New')
    await userEvent.type(screen.getByLabelText('Approval date'), '2026-02-01')
    await userEvent.type(screen.getByLabelText('Expiry date'), '2026-12-31')
    await userEvent.type(screen.getByLabelText(/Approval Volume/i), '500')

    expect(screen.queryByRole('button', { name: 'Submit' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save Draft' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Back to Search' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    const submitButton = screen.getByRole('button', { name: 'Save exemption' })
    expect(submitButton).toBeEnabled()
    await userEvent.click(submitButton)

    expect(mockedSubmitProvincialExemptionCreate).toHaveBeenCalledWith({
      applicationNumber: '',
      linkedApplicationNumbers: [],
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
    expect(mockNavigate).toHaveBeenCalledWith('/provincial/exemption/EX-777', {
      state: { exemptionCreationNotice: { exemptionNumber: 'EX-777' } },
    })
  }, 20_000)

  it('returns to Exemption details when saving from another tab reveals validation errors', async () => {
    render(
      <MemoryRouter initialEntries={['/provincial/exemption/create']}>
        <Routes>
          <Route path="/provincial/exemption/create" element={<ProvincialExemptionCreatePage />} />
        </Routes>
      </MemoryRouter>,
    )

    await screen.findByRole('heading', { level: 1, name: 'Create new exemption' })
    await screen.findByRole('radio', { name: 'Section 1', hidden: true })
    await selectExemptionCreateTab('Permits')
    await userEvent.click(screen.getByRole('button', { name: 'Save exemption' }))

    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'Exemption details' })).toHaveAttribute(
        'aria-selected',
        'true',
      ),
    )
    expect(screen.getByText('Exemption number is required')).toBeInTheDocument()
    expect(screen.getByText('Approval volume is required')).toBeInTheDocument()
    expect(screen.queryByText('Validation error')).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('Exemption number')).toHaveFocus())
  })

  it('ignores applications passed in the create link or navigation state', async () => {
    mockedSubmitProvincialExemptionCreate.mockResolvedValue(successfulCreate('EX-778'))

    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/provincial/exemption/create',
            search: '?applications=321,654&applicationNumber=321',
            state: { selectedApplicationNumbers: ['321', '654'] },
          },
        ]}
      >
        <Routes>
          <Route path="/provincial/exemption/create" element={<ProvincialExemptionCreatePage />} />
        </Routes>
      </MemoryRouter>,
    )

    await screen.findByRole('heading', { level: 1, name: 'Create new exemption' })
    await waitFor(() =>
      expect(screen.getByRole('radio', { name: 'Order in Council' })).toBeChecked(),
    )
    expect(screen.getByLabelText('Approval volume (m³)')).toHaveValue('')
    expect(screen.getByLabelText('Expiry date')).toHaveValue('')
    expect(screen.queryByText('Prefilled from selected applications')).not.toBeInTheDocument()
    await selectExemptionCreateTab('Applications')
    expect(screen.getByRole('tabpanel', { name: 'Applications' })).toHaveTextContent(
      /^Available after the exemption is saved\.$/,
    )
    expect(screen.queryByRole('list', { name: 'Selected applications' })).not.toBeInTheDocument()

    await selectExemptionCreateTab('Exemption details')
    await userEvent.type(screen.getByLabelText('Exemption number'), 'EX-778')
    await userEvent.type(screen.getByLabelText('Approval date'), '2026-07-01')
    await userEvent.type(screen.getByLabelText('Expiry date'), '2027-07-01')
    await userEvent.type(screen.getByLabelText('Approval volume (m³)'), '250.5')
    await userEvent.click(screen.getByRole('button', { name: 'Save exemption' }))

    expect(mockedSubmitProvincialExemptionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationNumber: '',
        linkedApplicationNumbers: [],
        exemptionTypeCode: 'O',
        approvedVolume: '250.5',
      }),
    )
    expect(mockedFetchProvincialExemptionCreatePreview).not.toHaveBeenCalled()
  })

  it('offers no application selection before an Order in Council exemption is saved', async () => {
    render(
      <MemoryRouter initialEntries={['/provincial/exemption/create']}>
        <Routes>
          <Route path="/provincial/exemption/create" element={<ProvincialExemptionCreatePage />} />
        </Routes>
      </MemoryRouter>,
    )

    await selectExemptionCreateTab('Exemption details')
    await chooseExemptionType('Order in Council')
    await waitFor(() =>
      expect(screen.getByRole('radio', { name: 'Order in Council' })).toBeChecked(),
    )
    await selectExemptionCreateTab('Applications')

    const applications = screen.getByRole('tabpanel', { name: 'Applications' })
    expect(applications).toHaveTextContent(/^Available after the exemption is saved\.$/)
    expect(within(applications).queryByRole('combobox')).not.toBeInTheDocument()
    expect(within(applications).queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add application' })).not.toBeInTheDocument()
  })

  it.each([
    [
      'Order in Council',
      'Applications, documents and permits can be added after you save the exemption.',
    ],
    ['Blanket OIC', 'Documents and Permits can be added after you save the exemption.'],
  ])('lists what a %s exemption can add after saving', async (typeName, subtitle) => {
    render(
      <MemoryRouter initialEntries={['/provincial/exemption/create']}>
        <Routes>
          <Route path="/provincial/exemption/create" element={<ProvincialExemptionCreatePage />} />
        </Routes>
      </MemoryRouter>,
    )

    await selectExemptionCreateTab('Exemption details')
    await chooseExemptionType(typeName)
    await waitFor(() => expect(screen.getByRole('radio', { name: typeName })).toBeChecked())

    const notice = screen.getByText(subtitle).closest('.cds--inline-notification')
    expect(notice?.querySelector('.cds--inline-notification__text-wrapper')).toHaveTextContent(
      new RegExp(`^${subtitle}$`),
    )
    expect(notice?.querySelector('.cds--inline-notification__title')).toBeNull()
  })

  it('offers no Ministerial type and submits the default Order in Council exemption', async () => {
    mockedSubmitProvincialExemptionCreate.mockResolvedValue(successfulCreate('OIC-900'))

    render(
      <MemoryRouter initialEntries={['/provincial/exemption/create']}>
        <Routes>
          <Route path="/provincial/exemption/create" element={<ProvincialExemptionCreatePage />} />
        </Routes>
      </MemoryRouter>,
    )

    await selectExemptionCreateTab('Exemption details')
    await waitFor(() =>
      expect(screen.getByRole('radio', { name: 'Order in Council' })).toBeChecked(),
    )
    const exemptionType = screen.getByRole('group', { name: 'Exemption type' })
    expect(
      within(exemptionType)
        .getAllByRole('radio')
        .map((radio) => radio.getAttribute('value')),
    ).toEqual(['O', 'B', 'SECTION_1'])
    expect(within(exemptionType).queryByRole('radio', { name: 'Ministerial' })).toBeNull()
    const statusSelect = screen.getByRole('combobox', { name: 'Status' })
    expect(statusSelect).toHaveValue('Active')
    expect(statusSelect).toBeDisabled()
    await userEvent.type(screen.getByLabelText('Exemption number'), 'OIC-900')
    await userEvent.type(screen.getByLabelText('Approval date'), '2026-07-01')
    await userEvent.type(screen.getByLabelText('Expiry date'), '2027-07-01')
    await userEvent.type(screen.getByLabelText('Approval volume (m³)'), '250.5')
    await userEvent.click(screen.getByRole('button', { name: 'Save exemption' }))

    expect(mockedSubmitProvincialExemptionCreate).toHaveBeenCalledWith({
      applicationNumber: '',
      linkedApplicationNumbers: [],
      exemptionNumber: 'OIC-900',
      exemptionTypeCode: 'O',
      exemptionStatusCode: 'ACT',
      approvalDate: '2026-07-01',
      expiryDate: '2027-07-01',
      approvedVolume: '250.5',
      enableRateOverride: false,
      feeRate: '',
      regionNumbers: [],
      otherConditions: '',
    })
    expect(mockNavigate).toHaveBeenCalledWith('/provincial/exemption/OIC-900', {
      state: { exemptionCreationNotice: { exemptionNumber: 'OIC-900' } },
    })
  })

  it('enforces active status and custom number when selecting OIC', async () => {
    render(
      <MemoryRouter initialEntries={['/provincial/exemption/create']}>
        <Routes>
          <Route path="/provincial/exemption/create" element={<ProvincialExemptionCreatePage />} />
        </Routes>
      </MemoryRouter>,
    )

    await selectExemptionCreateTab('Exemption details')
    await chooseExemptionType('Order in Council')

    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveValue('Active')
    expect(screen.getByRole('combobox', { name: 'Status' })).toBeDisabled()
    expect(screen.getByLabelText('Approval date')).toBeEnabled()
    expect(screen.getByLabelText('Exemption number')).toHaveAttribute('maxlength', '8')
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Exemption details',
      'Applications',
      'Documents',
      'Permits',
      'Fees',
    ])
    expect(screen.queryByRole('tab', { name: 'Applicant' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Agent' })).not.toBeInTheDocument()
    await selectExemptionCreateTab('Applications')
    expect(screen.getByRole('tabpanel', { name: 'Applications' })).toHaveTextContent(
      /^Available after the exemption is saved\.$/,
    )
    await selectExemptionCreateTab('Fees')
    expect(
      within(screen.getByRole('region', { name: 'Fees' })).getByRole('radio', { name: 'No' }),
    ).toBeChecked()
  })

  it('rejects exemption text that Oracle cannot store', async () => {
    render(
      <MemoryRouter initialEntries={['/provincial/exemption/create']}>
        <Routes>
          <Route path="/provincial/exemption/create" element={<ProvincialExemptionCreatePage />} />
        </Routes>
      </MemoryRouter>,
    )

    await selectExemptionCreateTab('Exemption details')
    await chooseExemptionType('Order in Council')
    await userEvent.type(screen.getByLabelText('Exemption number'), 'OIC-é')
    const conditions = screen.getByLabelText('Conditions')
    expect(conditions).toHaveAttribute('maxlength', '250')
    expect(document.querySelector('.cds--text-area__label-counter')).toHaveTextContent('0/250')
    await userEvent.type(conditions, 'Résumé')
    await userEvent.click(screen.getByRole('button', { name: 'Save exemption' }))

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

    await selectExemptionCreateTab('Exemption details')
    await chooseExemptionType('Blanket OIC')
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveValue('Active')
    expect(screen.getByText('Exemption holder')).toBeVisible()
    expect(screen.getByText('No applications associated with this exemption')).toBeVisible()
    expect(screen.getByLabelText('Approval volume (m³)')).toHaveValue('9999999.9')
    expect(screen.queryByRole('tab', { name: 'Applications' })).not.toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('Exemption number'), 'BOIC-1')
    await userEvent.type(screen.getByLabelText('Approval date'), '2026-07-01')
    await userEvent.type(screen.getByLabelText('Expiry date'), '2027-07-01')
    const regionComboBox = screen.getByRole('combobox', { name: /^Region/ })
    await userEvent.click(regionComboBox)
    fireEvent.change(regionComboBox, { target: { value: 'Cariboo' } })
    await userEvent.click(
      await screen.findByRole('option', { name: 'Cariboo Natural Resource Region' }),
    )
    await selectExemptionCreateTab('Fees')
    const fees = screen.getByRole('region', { name: 'Fees' })
    expect(within(fees).getByRole('radio', { name: 'No' })).toBeChecked()
    expect(screen.queryByLabelText('Fee rate ($/m³)')).not.toBeInTheDocument()
    await userEvent.click(within(fees).getByRole('radio', { name: 'Yes' }))
    await userEvent.type(screen.getByLabelText('Fee rate ($/m³)'), '999.99')
    await userEvent.click(screen.getByRole('button', { name: 'Save exemption' }))

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
    expect(mockNavigate).toHaveBeenCalledWith('/provincial/exemption/BOIC-1', {
      state: { exemptionCreationNotice: { exemptionNumber: 'BOIC-1' } },
    })
  })

  it('opens Fees when a missing fee rate is the only validation error', async () => {
    render(
      <MemoryRouter initialEntries={['/provincial/exemption/create']}>
        <Routes>
          <Route path="/provincial/exemption/create" element={<ProvincialExemptionCreatePage />} />
        </Routes>
      </MemoryRouter>,
    )

    await selectExemptionCreateTab('Exemption details')
    await chooseExemptionType('Blanket OIC')
    await userEvent.type(screen.getByLabelText('Exemption number'), 'BOIC-1')
    await userEvent.type(screen.getByLabelText('Approval date'), '2026-07-01')
    await userEvent.type(screen.getByLabelText('Expiry date'), '2027-07-01')
    const regionComboBox = screen.getByRole('combobox', { name: /^Region/ })
    await userEvent.click(regionComboBox)
    fireEvent.change(regionComboBox, { target: { value: 'Cariboo' } })
    await userEvent.click(
      await screen.findByRole('option', { name: 'Cariboo Natural Resource Region' }),
    )
    await selectExemptionCreateTab('Fees')
    const feesCard = screen.getByRole('region', { name: 'Fees' })
    expect(within(feesCard).queryByText('Required fields')).not.toBeInTheDocument()
    await userEvent.click(within(feesCard).getByRole('radio', { name: 'Yes' }))
    expect(within(feesCard).getByText('Required fields')).toBeInTheDocument()
    await selectExemptionCreateTab('Exemption details')
    await userEvent.click(screen.getByRole('button', { name: 'Save exemption' }))

    expect(screen.getByRole('tab', { name: 'Fees' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByLabelText('Fee rate ($/m³)')).toBeVisible()
    expect(screen.getAllByText('Fee rate is required').length).toBeGreaterThan(0)
    expect(mockedSubmitProvincialExemptionCreate).not.toHaveBeenCalled()
  })

  it('preserves operator volume and clears only the Blanket OIC sentinel', async () => {
    render(
      <MemoryRouter initialEntries={['/provincial/exemption/create']}>
        <Routes>
          <Route path="/provincial/exemption/create" element={<ProvincialExemptionCreatePage />} />
        </Routes>
      </MemoryRouter>,
    )

    await selectExemptionCreateTab('Exemption details')
    const volumeInput = screen.getByLabelText('Approval volume (m³)')
    await userEvent.type(volumeInput, '125.5')
    await chooseExemptionType('Blanket OIC')
    expect(volumeInput).toHaveValue('125.5')
    await chooseExemptionType('Order in Council')
    expect(volumeInput).toHaveValue('125.5')

    await userEvent.clear(volumeInput)
    await chooseExemptionType('Blanket OIC')
    expect(volumeInput).toHaveValue('9999999.9')
    await chooseExemptionType('Order in Council')
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

    await selectExemptionCreateTab('Exemption details')
    await chooseExemptionType('Order in Council')
    const exemptionNumber = screen.getByLabelText('Exemption number')
    fireEvent.change(exemptionNumber, { target: { value: 'OIC-12345' } })
    fireEvent.blur(exemptionNumber)
    expect(
      screen.queryByText('Exemption number must be 8 characters or fewer'),
    ).not.toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Approval date'), '2026-07-01')
    await userEvent.type(screen.getByLabelText('Expiry date'), '2027-07-01')
    await userEvent.type(screen.getByLabelText('Approval volume (m³)'), '250.5')
    await userEvent.click(screen.getByRole('button', { name: 'Save exemption' }))

    expect(
      await screen.findAllByText('Exemption number must be 8 characters or fewer'),
    ).not.toHaveLength(0)
    expect(mockedSubmitProvincialExemptionCreate).not.toHaveBeenCalled()
  })

  it('reports unavailable exemption options on Save after the warning is dismissed', async () => {
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
    const saveButton = screen.getByRole('button', { name: 'Save exemption' })
    expect(saveButton).toBeEnabled()
    await userEvent.click(saveButton)
    expect(
      await screen.findByText(
        'Authoritative exemption options must load before this exemption can be saved.',
      ),
    ).toBeInTheDocument()
    expect(mockedSubmitProvincialExemptionCreate).not.toHaveBeenCalled()
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
    expect(
      screen.getByText('Options unavailable').closest('[role="status"]')?.querySelector('button'),
    ).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Save application' }))
    expect(
      await screen.findByText(
        'Authoritative application options must load before this application can be saved.',
      ),
    ).toBeInTheDocument()
    expect(mockedSubmitProvincialApplicationCreate).not.toHaveBeenCalled()
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

      await selectExemptionCreateTab('Exemption details')
      expect(await screen.findByRole('radio', { name: 'Section 1' })).toBeInTheDocument()
      expect(screen.queryByRole('radio', { name: 'Blanket OIC' })).not.toBeInTheDocument()
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

    await selectExemptionCreateTab('Exemption details')
    expect(await screen.findByRole('radio', { name: 'Blanket OIC' })).toBeInTheDocument()
  })

  it('blocks provincial exemption submit when status is missing', async () => {
    render(
      <MemoryRouter initialEntries={['/provincial/exemption/create']}>
        <Routes>
          <Route path="/provincial/exemption/create" element={<ProvincialExemptionCreatePage />} />
        </Routes>
      </MemoryRouter>,
    )

    await screen.findByRole('heading', { level: 1, name: 'Create new exemption' })
    await selectExemptionCreateTab('Exemption details')
    await chooseExemptionType('Section 1')
    await clearComboBox(screen.getByRole('combobox', { name: 'Status' }))
    await userEvent.clear(screen.getByLabelText(/Approval Volume/i))
    await userEvent.type(screen.getByLabelText(/Approval Volume/i), '500')
    await userEvent.click(screen.getByRole('button', { name: 'Save exemption' }))

    expect(screen.getAllByText('Status is required').length).toBeGreaterThan(0)
    expect(mockedSubmitProvincialExemptionCreate).not.toHaveBeenCalled()
  })

  it('blocks provincial exemption submit when approved volume exceeds Oracle precision', async () => {
    render(
      <MemoryRouter initialEntries={['/provincial/exemption/create']}>
        <Routes>
          <Route path="/provincial/exemption/create" element={<ProvincialExemptionCreatePage />} />
        </Routes>
      </MemoryRouter>,
    )

    await screen.findByRole('heading', { level: 1, name: 'Create new exemption' })
    await selectExemptionCreateTab('Exemption details')
    await chooseExemptionType('Section 1')
    await chooseComboBoxOption(screen.getByRole('combobox', { name: 'Status' }), 'New')
    await userEvent.clear(screen.getByLabelText(/Approval Volume/i))
    await userEvent.type(screen.getByLabelText(/Approval Volume/i), '121212122')
    await userEvent.click(screen.getByRole('button', { name: 'Save exemption' }))

    expect(
      await screen.findAllByText('Approval volume must be 9999999.99 or less'),
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

    await selectExemptionCreateTab('Exemption details')
    await chooseExemptionType('Section 1')
    await userEvent.type(screen.getByLabelText('Approval date'), '2026-07-01')
    const expiryDate = screen.getByLabelText('Expiry date')
    await userEvent.type(screen.getByLabelText('Approval volume (m³)'), '500')
    await userEvent.click(screen.getByRole('button', { name: 'Save exemption' }))

    expect(screen.getAllByText('Expiry date is required').length).toBeGreaterThan(0)
    expect(mockedSubmitProvincialExemptionCreate).not.toHaveBeenCalled()

    await userEvent.type(expiryDate, '2026-07-01')
    await userEvent.click(screen.getByRole('button', { name: 'Save exemption' }))

    expect(
      screen.getAllByText('Expiry date must be after the approval date').length,
    ).toBeGreaterThan(0)
    expect(mockedSubmitProvincialExemptionCreate).not.toHaveBeenCalled()

    await userEvent.clear(expiryDate)
    await userEvent.type(expiryDate, '2026-07-02')
    await userEvent.click(screen.getByRole('button', { name: 'Save exemption' }))

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

    await selectExemptionCreateTab('Exemption details')
    await chooseExemptionType('Section 1')
    await userEvent.type(screen.getByLabelText('Approval volume (m³)'), '250.999')
    await userEvent.click(screen.getByRole('button', { name: 'Save exemption' }))

    expect(
      screen.getAllByText('Approval volume must have no more than two decimal places').length,
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

    await selectExemptionCreateTab('Exemption details')
    await userEvent.type(await screen.findByLabelText('Exemption number'), 'EX-901')
    await userEvent.type(screen.getByLabelText('Approval date'), '2026-07-01')
    await userEvent.type(screen.getByLabelText('Expiry date'), '2027-07-01')
    await userEvent.type(screen.getByLabelText('Approval volume (m³)'), '9999999.99')
    await userEvent.click(screen.getByRole('button', { name: 'Save exemption' }))

    await waitFor(() => {
      expect(mockedSubmitProvincialExemptionCreate).toHaveBeenCalledWith(
        expect.objectContaining({ approvedVolume: '9999999.99' }),
      )
    })
    expect(mockNavigate).toHaveBeenCalledWith('/provincial/exemption/EX-901', {
      state: { exemptionCreationNotice: { exemptionNumber: 'EX-901' } },
    })
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

    await screen.findByRole('heading', { level: 1, name: 'Create new offer' })
    expect(screen.getByText('Enter offer details and save a new offer.')).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    const offerFormActions = screen.getByRole('group', { name: 'Offer form actions' })
    expect(
      within(offerFormActions)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Cancel', 'Save new offer'])
    expect(
      screen.getByRole('heading', { level: 1, name: 'Create new offer' }).closest('header'),
    ).toContainElement(offerFormActions)
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
      expect(section.querySelector('.record-field-grid')).toHaveClass('record-field-grid--editing')
    }
    expect(screen.getByRole('button', { name: 'See scale detail' })).toBeEnabled()
    expect(await screen.findByDisplayValue('PKG-9')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'See scale detail' }))
    const scaleDialog = await screen.findByRole('dialog', { name: 'Scale Detail' })
    expect(await within(scaleDialog).findByText('TM-9')).toBeInTheDocument()
    expect(within(scaleDialog).getByRole('cell', { name: 'I' })).toBeInTheDocument()
    expect(mockedFetchOfferScaleDetails).toHaveBeenCalledWith(
      { packageNumber: 'PKG-9' },
      expect.any(AbortSignal),
    )
    expect(mockNavigate).not.toHaveBeenCalled()
    await userEvent.click(within(scaleDialog).getByRole('button', { name: 'Close' }))
    expect(await screen.findByDisplayValue('95.0')).toBeInTheDocument()
    expect(screen.getByDisplayValue('H/SA')).toBeInTheDocument()
    expect(screen.getByDisplayValue('03/01/2026')).toBeInTheDocument()
    expect(screen.queryByLabelText('Region')).not.toBeInTheDocument()
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

  it('preserves an exact selected package key for offer lookups, scale details, and save', async () => {
    const plainPackageNumber = 'PKG-EXISTING'
    const storedPackageNumber = 'PKG-EXISTING  '
    const storedPackageLabel = 'PKG-EXISTING (2 trailing spaces)'
    let resolvePackageList: ((packages: string[]) => void) | undefined
    mockedFetchOfferPackageList.mockReturnValue(
      new Promise((resolve) => {
        resolvePackageList = resolve
      }),
    )
    mockedFetchOfferPackageVolume.mockImplementation(async (packageNumber) =>
      packageNumber === storedPackageNumber ? '95.0' : '40.0',
    )
    mockedSubmitProvincialOfferCreate.mockResolvedValue(successfulCreate('8085'))

    render(
      <MemoryRouter
        initialEntries={[
          '/provincial/offers/create?applicationNumber=2001&packageNumber=PKG-EXISTING%20%20&companyName=Example%20Lumber&contactName=Sample%20Contact&offerVolume=50.0&purchaseOfferAmount=25000&pickupLocation=Yard%20A',
        ]}
      >
        <Routes>
          <Route path="/provincial/offers/create" element={<ProvincialOfferCreatePage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByRole('combobox', { name: 'Package number' })).toHaveValue(storedPackageLabel)
    await act(async () => resolvePackageList?.([plainPackageNumber, storedPackageNumber]))

    await waitFor(() =>
      expect(mockedFetchOfferPackageVolume).toHaveBeenCalledWith(storedPackageNumber),
    )
    const packageSelector = screen.getByRole('combobox', { name: 'Package number' })
    expect(packageSelector).toHaveValue(storedPackageLabel)
    await waitFor(() => expect(packageSelector).toBeEnabled())
    await chooseComboBoxOption(packageSelector, plainPackageNumber)
    await waitFor(() =>
      expect(mockedFetchOfferPackageVolume).toHaveBeenLastCalledWith(plainPackageNumber),
    )
    await chooseComboBoxOption(packageSelector, storedPackageLabel)
    await waitFor(() =>
      expect(mockedFetchOfferPackageVolume).toHaveBeenLastCalledWith(storedPackageNumber),
    )

    await userEvent.click(screen.getByRole('button', { name: 'See scale detail' }))
    const scaleDialog = await screen.findByRole('dialog', { name: 'Scale Detail' })
    expect(mockedFetchOfferScaleDetails).toHaveBeenCalledWith(
      { packageNumber: storedPackageNumber },
      expect.any(AbortSignal),
    )
    await userEvent.click(within(scaleDialog).getByRole('button', { name: 'Close' }))

    await userEvent.click(screen.getByRole('button', { name: 'Save new offer' }))
    await waitFor(() =>
      expect(mockedSubmitProvincialOfferCreate).toHaveBeenCalledWith(
        expect.objectContaining({ packageNumber: storedPackageNumber }),
      ),
    )
  })

  it('creates an offer with an explicit zero volume', async () => {
    render(
      <MemoryRouter
        initialEntries={[
          '/provincial/offers/create?applicationNumber=2001&packageNumber=PKG-9&companyName=Example%20Lumber&contactName=Sample%20Contact&pickupLocation=Yard%20A&purchaseOfferAmount=25000&offerVolume=0',
        ]}
      >
        <Routes>
          <Route path="/provincial/offers/create" element={<ProvincialOfferCreatePage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByDisplayValue('95.0')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Save new offer' }))

    await waitFor(() => {
      expect(mockedSubmitProvincialOfferCreate).toHaveBeenCalledWith(
        expect.objectContaining({ offerVolume: '0' }),
      )
    })
  })

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
      await screen.findByText('Offer volume cannot exceed the application/package volume'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Validation error')).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('Offer volume (m³)')).toHaveFocus())
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
    expect(screen.queryByDisplayValue('120.0')).not.toBeInTheDocument()
    expect(saveButton).toBeEnabled()
    await userEvent.click(saveButton)
    expect(
      await screen.findByText(
        'Application and client details must finish loading before this offer can be saved.',
      ),
    ).toBeInTheDocument()
    expect(mockedSubmitProvincialOfferCreate).not.toHaveBeenCalled()

    await act(async () => resolveSelectedPackageVolume('80.0'))

    expect(await screen.findByDisplayValue('80.0')).toBeInTheDocument()
    expect(saveButton).toBeEnabled()
    await userEvent.click(saveButton)
    expect(
      await screen.findAllByText('Offer volume cannot exceed the application/package volume'),
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
    await userEvent.click(screen.getByRole('button', { name: 'Save new offer' }))
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Package number' })).toHaveFocus(),
    )
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
    await userEvent.click(screen.getByRole('button', { name: 'Save new offer' }))
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Package number' })).toHaveFocus(),
    )
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
    await userEvent.click(screen.getByRole('button', { name: 'Save new offer' }))
    await waitFor(() => expect(screen.getByLabelText('Application number')).toHaveFocus())
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
    await userEvent.click(screen.getByRole('button', { name: 'Save new offer' }))
    await waitFor(() => expect(screen.getByLabelText('Application number')).toHaveFocus())
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
    expect(saveButton).toBeEnabled()

    const offerVolumeInput = screen.getByLabelText('Offer volume (m³)')
    await userEvent.type(offerVolumeInput, '95.54')
    await userEvent.click(screen.getByLabelText('Offer amount ($/m³)'))
    expect(offerVolumeInput).toHaveValue('95.54')

    await act(async () => resolvePackageVolume('95.5'))

    expect(await screen.findByDisplayValue('95.5')).toBeInTheDocument()
    expect(saveButton).toBeEnabled()
    await userEvent.click(saveButton)
    expect(
      await screen.findAllByText('Offer volume cannot exceed the application/package volume'),
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
      await screen.findAllByText('Offer volume cannot exceed the application/package volume'),
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

    await screen.findByRole('heading', { level: 1, name: 'Create new offer' })
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

    await screen.findByRole('heading', { level: 1, name: 'Create new offer' })
    mockedValidateOfferApplication.mockClear()
    fireEvent.change(screen.getByLabelText('Application number'), {
      target: { value: '1e3' },
    })
    await userEvent.click(screen.getByRole('button', { name: 'Save new offer' }))

    expect(
      screen.getAllByText('Application number must be a positive whole number'),
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
    await userEvent.click(screen.getByRole('button', { name: 'Save new offer' }))
    await waitFor(() => expect(screen.getByLabelText('Application number')).toHaveFocus())
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
    mockedFetchOfferApplicationDetails.mockResolvedValue({
      success: true,
      speciesGradeCode: 'H/SA',
      advertisingDate: '03/01/2026',
      teacReviewDate: '2026-03-20',
      region: 'Cariboo Natural Resource Region',
    })
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

    await screen.findByRole('heading', { level: 1, name: 'Create new offer' })
    expect(await screen.findByDisplayValue('Authoritative Buyer Ltd.')).toHaveAttribute('readonly')
    expect(mockedFetchOfferClientData).toHaveBeenCalledWith('77881')
    expect(screen.queryByLabelText('Offering client number')).not.toBeInTheDocument()
    expect(screen.queryByDisplayValue('00099999')).not.toBeInTheDocument()
    expect(screen.queryByDisplayValue('Scoped Buyer')).not.toBeInTheDocument()
    const contactName = screen.getByLabelText('Contact name')
    expect(contactName).toHaveValue('')
    expect(screen.queryByDisplayValue('Buyer Contact')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('TEAC review date')).not.toBeInTheDocument()
    expect(screen.queryByDisplayValue('2026-03-20')).not.toBeInTheDocument()
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
          teacReviewDate: '2026-03-20',
          fairOfferIndicator: 'N',
          validOfferIndicator: 'Y',
          approvalIndicator: 'N',
          offerRemark: '',
        }),
      )
    })
    expect(mockNavigate).toHaveBeenCalledWith('/provincial/offers/8084', {
      state: { offerCreationNotice: { message: 'ok', warnings: [] } },
    })
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

    await screen.findByRole('heading', { level: 1, name: 'Create new offer' })
    expect(await screen.findByDisplayValue('Authoritative Buyer Ltd.')).toHaveAttribute('readonly')
    expect(screen.queryByLabelText('Offering client number')).not.toBeInTheDocument()
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
    expect(await screen.findByText('Cannot save yet.')).toBeInTheDocument()
    expect(
      screen.getAllByText(
        'The offering company could not be loaded from the authenticated forest client.',
      ),
    ).toHaveLength(2)
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

    await screen.findByRole('heading', { level: 1, name: 'Create new offer' })
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

    await screen.findByRole('heading', { level: 1, name: 'Create new offer' })
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

    await screen.findByRole('heading', { level: 1, name: 'Create new offer' })
    expect(await screen.findByDisplayValue('No Packages')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'See scale detail' })).toBeDisabled()
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
    expect(mockNavigate).toHaveBeenCalledWith('/provincial/offers/8083', {
      state: { offerCreationNotice: { message: 'ok', warnings: [] } },
    })
  })
})
