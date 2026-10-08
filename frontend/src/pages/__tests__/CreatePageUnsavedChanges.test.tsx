import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import ProvincialApplicationCreatePage from '@/pages/ProvincialApplicationCreate'
import ProvincialExemptionCreatePage from '@/pages/ProvincialExemptionCreate'
import ProvincialOfferCreatePage from '@/pages/ProvincialOfferCreate'
import {
  fetchProvincialExemptionCreatePreview,
  submitProvincialApplicationCreate,
  submitProvincialExemptionCreate,
  submitProvincialOfferCreate,
} from '@/service/create-submit-service'
import {
  fetchProvincialApplicationOptions,
  fetchProvincialExemptionOptions,
} from '@/service/search-options-service'
import { fetchApplicationClientLocations } from '@/service/application-client-lookup-service'
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
import { useAuth } from '@/context/auth/useAuth'
import { createTestAuthContext } from '@/test-utils/auth'

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
  fetchApplicationClientLocations: vi.fn(),
}))

vi.mock('@/service/provincial-application-items-service', () => ({
  fetchApplicationEndUsesForSpeciesRegion: vi.fn(),
  fetchApplicationRemainingSpecies: vi.fn(),
  fetchApplicationSummarySnapshot: vi.fn(),
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
const mockedFetchProvincialExemptionCreatePreview = vi.mocked(fetchProvincialExemptionCreatePreview)
const mockedSubmitProvincialApplicationCreate = vi.mocked(submitProvincialApplicationCreate)
const mockedSubmitProvincialExemptionCreate = vi.mocked(submitProvincialExemptionCreate)
const mockedSubmitProvincialOfferCreate = vi.mocked(submitProvincialOfferCreate)
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

const createCases = [
  {
    name: 'application',
    createPath: '/provincial/application/create',
    targetPath: '/provincial/application',
    heading: 'Create provincial application',
    fieldLabel: 'Location of logs',
    saveButtonName: 'Save application',
    discardTitle: 'Discard this application?',
    discardDescription:
      "The application hasn't been created yet. Everything you've entered will be lost.",
    element: <ProvincialApplicationCreatePage />,
  },
  {
    name: 'exemption',
    createPath: '/provincial/exemption/create',
    targetPath: '/provincial/exemption',
    heading: 'Create new exemption',
    fieldLabel: 'Conditions',
    saveButtonName: 'Save exemption',
    discardTitle: 'Discard this exemption?',
    discardDescription:
      "The exemption hasn't been created yet. Everything you've entered will be lost.",
    element: <ProvincialExemptionCreatePage />,
  },
  {
    name: 'purchase offer',
    createPath: '/provincial/offers/create',
    targetPath: '/provincial/offers',
    heading: 'Create provincial offer',
    fieldLabel: 'Offer conditions / remarks',
    saveButtonName: 'Save new offer',
    discardTitle: 'Discard this offer?',
    discardDescription:
      "The offer hasn't been created yet. Everything you've entered will be lost.",
    element: <ProvincialOfferCreatePage />,
  },
] as const

const getDraftField = async (testCase: (typeof createCases)[number]) => {
  if (testCase.name === 'application') {
    await userEvent.click(screen.getByRole('tab', { name: 'Scale' }))
    return screen.getByRole('textbox', { name: 'Location of logs' })
  }

  if (testCase.name === 'exemption') {
    await userEvent.click(screen.getByRole('tab', { name: 'Exemption details' }))
  }

  return screen.getByLabelText(testCase.fieldLabel)
}

const settleLoads = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })

const renderCreatePage = (
  createPath: string,
  targetPath: string,
  element: React.ReactNode,
  initialEntries: string[] = [createPath],
) => {
  const router = createMemoryRouter(
    [
      { path: createPath, element },
      { path: targetPath, element: <h1>Search destination</h1> },
      { path: `${targetPath}/:recordId`, element: <h1>Created record</h1> },
    ],
    { initialEntries, initialIndex: initialEntries.length - 1 },
  )
  render(<RouterProvider router={router} />)
  return router
}

describe('create page unsaved changes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseAuth.mockReturnValue(createTestAuthContext())
    mockedFetchProvincialApplicationOptions.mockResolvedValue({
      productTypes: [{ value: 'LOG', label: 'Logs' }],
      exemptionTypes: [],
      exemptionReasons: [{ value: 'U', label: 'Unadvertised' }],
      applicationStatuses: [],
      growthTypes: [{ value: 'O', label: 'Old Growth' }],
      regions: [{ value: '11', label: 'Cariboo' }],
      currentSchedules: [{ value: '987', label: '2026-01-11' }],
    })
    mockedFetchProvincialExemptionOptions.mockResolvedValue({
      exemptionTypes: [
        { value: 'M', label: 'Ministerial' },
        { value: 'O', label: 'Order in Council' },
      ],
      exemptionStatuses: [{ value: 'NEW', label: 'New' }],
      regions: [{ value: '1903', label: 'Cariboo Natural Resource Region' }],
    })
    mockedFetchProvincialExemptionCreatePreview.mockResolvedValue({
      exemptionTypeCode: 'M',
      exemptionStatusCode: 'NEW',
      approvedVolume: '10',
      expiryDate: '',
      applicationNumbers: [],
    })
    mockedFetchApplicationClientLocations.mockResolvedValue([])
    mockedFetchApplicationRemainingSpecies.mockResolvedValue([])
    mockedFetchApplicationEndUsesForSpeciesRegion.mockResolvedValue([])
    mockedFetchOfferApplicationDetails.mockResolvedValue({
      success: false,
      speciesGradeCode: '',
      advertisingDate: '',
      teacReviewDate: '',
      region: '',
    })
    mockedFetchOfferApplicationVolume.mockResolvedValue('')
    mockedFetchOfferClientData.mockResolvedValue(null)
    mockedFetchOfferPackageList.mockResolvedValue([])
    mockedFetchOfferPackageVolume.mockResolvedValue('')
    mockedValidateOfferApplication.mockResolvedValue({ isValid: true, errors: [] })
    mockedSearchProvincialApplicationNumberOptions.mockResolvedValue([])
    mockedSubmitProvincialApplicationCreate.mockResolvedValue({
      success: false,
      message: '',
      errors: [],
      warnings: [],
    })
    mockedSubmitProvincialOfferCreate.mockResolvedValue({
      success: false,
      message: '',
      errors: [],
      warnings: [],
    })
  })

  it.each(createCases)(
    'focuses the $name heading and keeps Save enabled on load',
    async (testCase) => {
      renderCreatePage(testCase.createPath, testCase.targetPath, testCase.element)

      const heading = await screen.findByRole('heading', { level: 1, name: testCase.heading })
      await waitFor(() => expect(heading).toHaveFocus())
      expect(screen.getByRole('button', { name: testCase.saveButtonName })).toBeEnabled()
    },
  )

  it.each(createCases)('allows a clean $name Cancel without confirmation', async (testCase) => {
    const router = renderCreatePage(testCase.createPath, testCase.targetPath, testCase.element)
    await screen.findByRole('heading', { level: 1, name: testCase.heading })
    await settleLoads()

    const unloadEvent = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(unloadEvent)
    expect(unloadEvent.defaultPrevented).toBe(false)

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(router.state.location.pathname).toBe(testCase.targetPath))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it.each(createCases)(
    'asks before discarding a dirty $name on Cancel and protects native unload',
    async (testCase) => {
      const router = renderCreatePage(testCase.createPath, testCase.targetPath, testCase.element)
      await screen.findByRole('heading', { level: 1, name: testCase.heading })
      await settleLoads()
      const draftField = await getDraftField(testCase)
      await userEvent.type(draftField, 'Draft value')

      const unloadEvent = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(unloadEvent)
      expect(unloadEvent.defaultPrevented).toBe(true)

      const cancelButton = screen.getByRole('button', { name: 'Cancel' })
      await userEvent.click(cancelButton)

      const dialog = await screen.findByRole('dialog', { name: testCase.discardTitle })
      expect(dialog).toHaveTextContent(testCase.discardDescription)
      expect(within(dialog).queryByRole('button', { name: /Save/ })).not.toBeInTheDocument()
      await userEvent.click(within(dialog).getByRole('button', { name: 'Keep editing' }))
      await waitFor(() =>
        expect(
          screen.queryByRole('dialog', { name: testCase.discardTitle }),
        ).not.toBeInTheDocument(),
      )
      expect(router.state.location.pathname).toBe(testCase.createPath)
      expect(draftField).toHaveValue('Draft value')
      await waitFor(() => expect(cancelButton).toHaveFocus())

      await userEvent.click(cancelButton)
      await userEvent.click(
        within(await screen.findByRole('dialog', { name: testCase.discardTitle })).getByRole(
          'button',
          { name: 'Discard' },
        ),
      )
      await waitFor(() => expect(router.state.location.pathname).toBe(testCase.targetPath))
    },
  )

  it('blocks browser back from a dirty create page', async () => {
    const testCase = createCases[0]
    const router = renderCreatePage(testCase.createPath, testCase.targetPath, testCase.element, [
      testCase.targetPath,
      testCase.createPath,
    ])
    await screen.findByRole('heading', { level: 1, name: testCase.heading })
    await userEvent.type(await getDraftField(testCase), 'Draft value')

    await act(async () => {
      await router.navigate(-1)
    })

    expect(await screen.findByRole('dialog', { name: testCase.discardTitle })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe(testCase.createPath)
  })

  it('keeps a create draft when switching tabs without asking', async () => {
    const testCase = createCases[1]
    renderCreatePage(testCase.createPath, testCase.targetPath, testCase.element)
    await screen.findByRole('heading', { level: 1, name: testCase.heading })
    await userEvent.type(await getDraftField(testCase), 'Draft value')

    await userEvent.click(screen.getByRole('tab', { name: 'Documents' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: 'Exemption details' }))

    expect(screen.getByLabelText('Conditions')).toHaveValue('Draft value')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('treats late application option defaults as initial values when the user reverts an edit', async () => {
    let resolveOptions!: (
      value: Awaited<ReturnType<typeof fetchProvincialApplicationOptions>>,
    ) => void
    const loadedOptions = await fetchProvincialApplicationOptions()
    mockedFetchProvincialApplicationOptions.mockReturnValue(
      new Promise((resolve) => {
        resolveOptions = resolve
      }),
    )
    const testCase = createCases[0]
    const router = renderCreatePage(testCase.createPath, testCase.targetPath, testCase.element)
    await screen.findByRole('heading', { level: 1, name: testCase.heading })

    const draftField = await getDraftField(testCase)
    await userEvent.type(draftField, 'Temporary draft')
    await act(async () => resolveOptions(loadedOptions))
    await settleLoads()
    await userEvent.clear(draftField)
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(router.state.location.pathname).toBe(testCase.targetPath))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('reports pending application client details on Save without submitting', async () => {
    mockedFetchApplicationClientLocations.mockReturnValue(new Promise(() => undefined))
    const testCase = createCases[0]
    const router = renderCreatePage(testCase.createPath, testCase.targetPath, testCase.element)
    await screen.findByRole('heading', { level: 1, name: testCase.heading })
    await userEvent.click(screen.getByRole('tab', { name: 'Applicant' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Client' }), {
      target: { value: '00011111' },
    })
    const saveButton = screen.getByRole('button', { name: 'Save application' })
    await waitFor(() => expect(mockedFetchApplicationClientLocations).toHaveBeenCalled())
    expect(saveButton).toBeEnabled()

    await userEvent.click(saveButton)

    expect(
      await screen.findByText(
        'Client details must finish loading before this application can be saved.',
      ),
    ).toBeInTheDocument()
    expect(mockedSubmitProvincialApplicationCreate).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(await screen.findByRole('dialog', { name: testCase.discardTitle })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe(testCase.createPath)
  })

  it('reports missing exemption create authorization on Save without submitting', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({ canPerform: vi.fn().mockReturnValue(false) }),
    )
    const testCase = createCases[1]
    const router = renderCreatePage(testCase.createPath, testCase.targetPath, testCase.element)
    await screen.findByRole('heading', { level: 1, name: testCase.heading })
    await settleLoads()
    await userEvent.click(screen.getByRole('tab', { name: 'Exemption details' }))
    await userEvent.type(screen.getByLabelText('Conditions'), 'Draft value')

    await userEvent.click(screen.getByRole('button', { name: 'Save exemption' }))

    expect(
      await screen.findByText(
        'Authorization to create this exemption is required before it can be saved.',
      ),
    ).toBeInTheDocument()
    expect(mockedSubmitProvincialExemptionCreate).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(await screen.findByRole('dialog', { name: testCase.discardTitle })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe(testCase.createPath)
  })

  it('treats an exemption type selection as a dirty create-form change', async () => {
    const testCase = createCases[1]
    const router = renderCreatePage(testCase.createPath, testCase.targetPath, testCase.element)
    await screen.findByRole('heading', { level: 1, name: testCase.heading })
    await userEvent.click(screen.getByRole('tab', { name: 'Exemption details' }))
    await userEvent.click(await screen.findByRole('radio', { name: 'Order in Council' }))

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(await screen.findByRole('dialog', { name: testCase.discardTitle })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe(testCase.createPath)
  })

  it('treats a Flatpickr calendar selection as a dirty create-form change', async () => {
    const testCase = createCases[1]
    const router = renderCreatePage(testCase.createPath, testCase.targetPath, testCase.element)
    await screen.findByRole('heading', { level: 1, name: testCase.heading })
    await userEvent.click(screen.getByRole('tab', { name: 'Exemption details' }))
    await userEvent.click(screen.getByLabelText('Expiry date (YYYY-MM-DD)'))
    const calendarDay = await waitFor(() => {
      const day = document.querySelector<HTMLElement>(
        '.flatpickr-calendar.open .flatpickr-day:not(.flatpickr-disabled):not(.prevMonthDay):not(.nextMonthDay)',
      )
      expect(day).toBeTruthy()
      return day as HTMLElement
    })
    await userEvent.click(calendarDay)

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(await screen.findByRole('dialog', { name: testCase.discardTitle })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe(testCase.createPath)
  })

  it('routes a successfully saved create form to its new detail without a second prompt', async () => {
    mockedSubmitProvincialExemptionCreate.mockResolvedValue({
      success: true,
      message: 'ok',
      createdId: 'EX-123',
      errors: [],
      warnings: [],
    })
    const testCase = createCases[1]
    const router = renderCreatePage(testCase.createPath, testCase.targetPath, testCase.element)
    await screen.findByRole('heading', { level: 1, name: testCase.heading })
    await settleLoads()
    await userEvent.click(screen.getByRole('tab', { name: 'Exemption details' }))
    await userEvent.type(screen.getByLabelText('Approval volume (m³)'), '10')

    await userEvent.click(screen.getByRole('button', { name: 'Save exemption' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/provincial/exemption/EX-123'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
