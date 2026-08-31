import { act, render, screen, waitFor } from '@testing-library/react'
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
const mockedFetchProvincialExemptionCreatePreview = vi.mocked(fetchProvincialExemptionCreatePreview)
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
    saveButtonName: 'Save',
    element: <ProvincialApplicationCreatePage />,
  },
  {
    name: 'exemption',
    createPath: '/provincial/exemption/create',
    targetPath: '/provincial/exemption',
    heading: 'Create exemption',
    fieldLabel: 'Other conditions',
    saveButtonName: 'Save',
    element: <ProvincialExemptionCreatePage />,
  },
  {
    name: 'purchase offer',
    createPath: '/provincial/offers/create',
    targetPath: '/provincial/offers',
    heading: 'Create provincial offer',
    fieldLabel: 'Offer conditions / remarks',
    saveButtonName: 'Save new offer',
    element: <ProvincialOfferCreatePage />,
  },
] as const

const getDraftField = async (testCase: (typeof createCases)[number]) => {
  if (testCase.name === 'application') {
    await userEvent.click(screen.getByRole('tab', { name: 'Items' }))
    return screen.getByRole('textbox', { name: 'Location of logs' })
  }

  return screen.getByLabelText(testCase.fieldLabel)
}

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
    mockedFetchApplicationClientContacts.mockResolvedValue([])
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

  it.each(createCases)('allows a clean $name Cancel without confirmation', async (testCase) => {
    const router = renderCreatePage(testCase.createPath, testCase.targetPath, testCase.element)
    await screen.findByRole('heading', { level: 1, name: testCase.heading })
    await waitFor(() =>
      expect(screen.getByRole('button', { name: testCase.saveButtonName })).toBeEnabled(),
    )

    const unloadEvent = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(unloadEvent)
    expect(unloadEvent.defaultPrevented).toBe(false)

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(router.state.location.pathname).toBe(testCase.targetPath))
    expect(screen.queryByRole('dialog', { name: 'Unsaved changes' })).not.toBeInTheDocument()
  })

  it.each(createCases)(
    'confirms a dirty $name Cancel and protects native unload',
    async (testCase) => {
      const router = renderCreatePage(testCase.createPath, testCase.targetPath, testCase.element)
      await screen.findByRole('heading', { level: 1, name: testCase.heading })
      await waitFor(() =>
        expect(screen.getByRole('button', { name: testCase.saveButtonName })).toBeEnabled(),
      )
      await userEvent.type(await getDraftField(testCase), 'Draft value')

      const unloadEvent = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(unloadEvent)
      expect(unloadEvent.defaultPrevented).toBe(true)

      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

      expect(await screen.findByRole('dialog', { name: 'Unsaved changes' })).toBeInTheDocument()
      expect(router.state.location.pathname).toBe(testCase.createPath)
      await userEvent.click(screen.getByRole('button', { name: 'Discard and leave' }))
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

    expect(await screen.findByRole('dialog', { name: 'Unsaved changes' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe(testCase.createPath)
  })

  it('does not offer application Save-and-leave while client locations are loading', async () => {
    mockedFetchApplicationClientLocations.mockReturnValue(new Promise(() => undefined))
    const testCase = createCases[0]
    const router = renderCreatePage(testCase.createPath, testCase.targetPath, testCase.element)
    await screen.findByRole('heading', { level: 1, name: testCase.heading })
    await userEvent.click(screen.getByRole('tab', { name: 'Owner' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Client number' }), '00011111')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled())

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(
      await screen.findByRole('dialog', { name: 'Unsaved changes' }),
    ).toHaveAccessibleDescription(/Client details must finish loading/)
    expect(screen.queryByRole('button', { name: 'Save and leave' })).not.toBeInTheDocument()
    expect(mockedSubmitProvincialApplicationCreate).not.toHaveBeenCalled()
    expect(router.state.location.pathname).toBe(testCase.createPath)
  })

  it('does not offer exemption Save-and-leave without create authorization', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({ canPerform: vi.fn().mockReturnValue(false) }),
    )
    const testCase = createCases[1]
    const router = renderCreatePage(testCase.createPath, testCase.targetPath, testCase.element)
    await screen.findByRole('heading', { level: 1, name: testCase.heading })
    await userEvent.type(screen.getByLabelText('Other conditions'), 'Draft value')

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(
      await screen.findByRole('dialog', { name: 'Unsaved changes' }),
    ).toHaveAccessibleDescription(/Authorization to create this exemption is required/)
    expect(screen.queryByRole('button', { name: 'Save and leave' })).not.toBeInTheDocument()
    expect(mockedSubmitProvincialExemptionCreate).not.toHaveBeenCalled()
    expect(router.state.location.pathname).toBe(testCase.createPath)
  })

  it('treats a Carbon combobox selection as a dirty create-form change', async () => {
    const testCase = createCases[1]
    const router = renderCreatePage(testCase.createPath, testCase.targetPath, testCase.element)
    await screen.findByRole('heading', { level: 1, name: testCase.heading })
    const exemptionType = screen.getByRole('combobox', { name: 'Exemption type' })
    await userEvent.click(exemptionType)
    const options = await screen.findAllByRole('option', { name: 'Order in Council' })
    await userEvent.click(options.find((option) => option.tagName === 'LI') ?? options[0])

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(await screen.findByRole('dialog', { name: 'Unsaved changes' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe(testCase.createPath)
  })

  it('treats a Flatpickr calendar selection as a dirty create-form change', async () => {
    const testCase = createCases[1]
    const router = renderCreatePage(testCase.createPath, testCase.targetPath, testCase.element)
    await screen.findByRole('heading', { level: 1, name: testCase.heading })
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

    expect(await screen.findByRole('dialog', { name: 'Unsaved changes' })).toBeInTheDocument()
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
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled())
    await userEvent.type(screen.getByLabelText('Approved volume (m³)'), '10')

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/provincial/exemption/EX-123'))
    expect(screen.queryByRole('dialog', { name: 'Unsaved changes' })).not.toBeInTheDocument()
  })

  it('saves a dirty create form and follows the Cancel destination', async () => {
    mockedSubmitProvincialExemptionCreate.mockResolvedValue({
      success: true,
      message: 'ok',
      createdId: 'EX-124',
      errors: [],
      warnings: [],
    })
    const testCase = createCases[1]
    const router = renderCreatePage(testCase.createPath, testCase.targetPath, testCase.element)
    await screen.findByRole('heading', { level: 1, name: testCase.heading })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled())
    await userEvent.type(screen.getByLabelText('Approved volume (m³)'), '10')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await screen.findByRole('dialog', { name: 'Unsaved changes' })

    await userEvent.click(screen.getByRole('button', { name: 'Save and leave' }))

    await waitFor(() => expect(router.state.location.pathname).toBe(testCase.targetPath))
    expect(mockedSubmitProvincialExemptionCreate).toHaveBeenCalledTimes(1)
    expect(router.state.location.pathname).not.toBe('/provincial/exemption/EX-124')
  })
})
