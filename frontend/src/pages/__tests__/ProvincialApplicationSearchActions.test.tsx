import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import { useDefaultRegionPreference } from '@/pages/shared/useDefaultRegionPreference'
import ProvincialApplicationPage from '@/pages/ProvincialApplication'
import {
  countProvincialApplications,
  searchProvincialApplications,
} from '@/service/provincial-application-search-service'
import { fetchProvincialApplicationOptions } from '@/service/search-options-service'
import { createTestAuthContext } from '@/test-utils/auth'

const mockNavigate = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...(actual as object),
    useNavigate: () => mockNavigate,
  }
})

vi.mock('@/context/auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/pages/shared/useDefaultRegionPreference', () => ({
  useDefaultRegionPreference: vi.fn(),
}))

vi.mock('@/service/provincial-application-search-service', () => ({
  countProvincialApplications: vi.fn(),
  searchProvincialApplications: vi.fn(),
}))

vi.mock('@/service/search-options-service', () => ({
  fetchProvincialApplicationOptions: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)
const mockedUseDefaultRegionPreference = vi.mocked(useDefaultRegionPreference)
const mockedCountProvincialApplications = vi.mocked(countProvincialApplications)
const mockedSearchProvincialApplications = vi.mocked(searchProvincialApplications)
const mockedFetchProvincialApplicationOptions = vi.mocked(fetchProvincialApplicationOptions)

const renderPage = (
  path = '/provincial/application?region=11&page=1&pageSize=10&sortField=applicationNumber&sortDirection=desc',
) => {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/provincial/application" element={<ProvincialApplicationPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

const searchRowsWithMixedEligibility = [
  {
    applicationNumber: '321',
    status: 'NEW',
    applicantClientNumber: '11111111',
    ownerClientNumber: '22222222',
    region: '11',
    applicationVolume: 100,
    exemptionNumber: '',
    listingDate: '2026-01-10',
    packageNumber: 'PKG-1',
    exemptionType: 'FEE',
    productTypeCode: 'LOG',
    locked: false,
    allowCreateExemption: true,
  },
  {
    applicationNumber: '654',
    status: 'PER',
    applicantClientNumber: '11111111',
    ownerClientNumber: '22222222',
    region: '12',
    applicationVolume: 50,
    exemptionNumber: 'EX-9',
    listingDate: '2026-01-11',
    packageNumber: 'PKG-2',
    exemptionType: 'APP',
    productTypeCode: 'LUM',
    locked: true,
    allowCreateExemption: false,
  },
]

describe('Provincial Application Search Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseDefaultRegionPreference.mockReturnValue({
      defaultRegion: null,
      preferenceLoading: false,
    })
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        canPerform: (action: string) =>
          action === '/createExemption' ||
          action === 'createApplication' ||
          action === 'uploadApplicationSubmission',
      }),
    )
    mockedFetchProvincialApplicationOptions.mockResolvedValue({
      exemptionTypes: [{ value: 'FEE', label: 'Fee in Lieu' }],
      exemptionReasons: [],
      applicationStatuses: [{ value: 'NEW', label: 'New' }],
      productTypes: [{ value: 'LOG', label: 'Logs' }],
      growthTypes: [],
      regions: [{ value: '11', label: 'Cariboo' }],
      currentSchedules: [],
    })
    mockedSearchProvincialApplications.mockResolvedValue({
      content: searchRowsWithMixedEligibility,
      page: {
        number: 0,
        size: 10,
        totalElements: 2,
        totalPages: 1,
      },
    })
  })

  it('displays the pending exemption status supplied by the backend', async () => {
    mockedSearchProvincialApplications.mockResolvedValueOnce({
      content: [
        {
          ...searchRowsWithMixedEligibility[1],
          applicationNumber: '108826',
          status: 'Exempted - New',
          exemptionNumber: '20-8562',
        },
      ],
      page: {
        number: 0,
        size: 10,
        totalElements: 1,
        totalPages: 1,
      },
    })

    renderPage()

    expect(await screen.findByText('Exempted - New')).toBeVisible()
  })

  it('only allows selecting eligible rows and navigates to exemption create with prefill', async () => {
    renderPage()
    await screen.findByText('321')

    const createExemptionButton = screen.getByRole('button', {
      name: 'Create exemption for selected applications',
    })
    expect(createExemptionButton).toBeDisabled()
    expect(createExemptionButton.closest('.legacy-search-table-toolbar__actions')).not.toBeNull()

    expect(screen.getByRole('checkbox', { name: 'Select 321' })).toBeEnabled()
    expect(screen.getByRole('checkbox', { name: 'Select 654' })).toBeDisabled()
    expect(
      screen.queryByRole('link', { name: 'Upload Application Submission' }),
    ).not.toBeInTheDocument()
    const addApplicationAction = screen.getByRole('link', { name: 'Add application' })
    expect(addApplicationAction).toHaveAttribute('href', '/provincial/application/create')
    expect(addApplicationAction).toHaveClass('cds--btn--primary')
    expect(addApplicationAction.closest('.lexis-page-header__actions')).not.toBeNull()

    const ineligibleCheckbox = screen.getByRole('checkbox', { name: 'Select 654' })
    const ineligibleCheckboxTooltipTrigger = ineligibleCheckbox.closest(
      '.disabled-button-tooltip',
    ) as HTMLElement
    expect(ineligibleCheckboxTooltipTrigger).toBeTruthy()

    await userEvent.hover(ineligibleCheckboxTooltipTrigger)

    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'This application already has an exemption.',
    )

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select 321' }))
    expect(
      screen.getByRole('button', { name: 'Create exemption for selected applications' }),
    ).toBeEnabled()

    await userEvent.click(
      screen.getByRole('button', { name: 'Create exemption for selected applications' }),
    )

    expect(mockNavigate).toHaveBeenCalledWith('/provincial/exemption/create', {
      state: {
        selectedApplicationNumbers: ['321'],
        applicantClientNumber: '11111111',
        ownerClientNumber: '22222222',
      },
    })
  })

  it.each([
    {
      applicationNumber: '777',
      locked: true,
      expected: 'This application is currently locked and cannot be selected.',
    },
    {
      applicationNumber: '888',
      locked: false,
      expected:
        'Eligible applications must be approved, have no existing exemption or active valid offer, and not have a future listing date unless they are standing timber.',
    },
  ])('explains why application $applicationNumber cannot be selected', async (rowState) => {
    mockedSearchProvincialApplications.mockResolvedValue({
      content: [
        {
          ...searchRowsWithMixedEligibility[0],
          applicationNumber: rowState.applicationNumber,
          exemptionNumber: '',
          locked: rowState.locked,
          allowCreateExemption: false,
        },
      ],
      page: {
        number: 0,
        size: 10,
        totalElements: 1,
        totalPages: 1,
      },
    })

    renderPage()
    await screen.findByText(rowState.applicationNumber)

    const checkbox = screen.getByRole('checkbox', {
      name: `Select ${rowState.applicationNumber}`,
    })
    expect(checkbox).toBeDisabled()
    const tooltipTrigger = checkbox.closest('.disabled-button-tooltip') as HTMLElement
    expect(tooltipTrigger).toBeTruthy()

    await userEvent.hover(tooltipTrigger)

    expect(await screen.findByRole('tooltip')).toHaveTextContent(rowState.expected)
  })

  it('paints application rows before the exact result count is available', async () => {
    const rows = Array.from({ length: 10 }, (_, index) => ({
      ...searchRowsWithMixedEligibility[0],
      applicationNumber: String(8000 + index),
      packageNumber: `PKG-${index + 1}`,
    }))
    mockedSearchProvincialApplications.mockResolvedValueOnce({
      content: rows,
      page: {
        number: 0,
        size: 10,
        totalElements: 11,
        totalPages: 2,
      },
    })
    let resolveCount!: (total: number) => void
    mockedCountProvincialApplications.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveCount = resolve
      }),
    )

    renderPage()

    await waitFor(() => expect(mockedCountProvincialApplications).toHaveBeenCalledOnce())
    expect(await screen.findByText('8000')).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Counting search results' })).toBeInTheDocument()
    expect(screen.queryByText(/counting/i)).not.toBeInTheDocument()
    expect(screen.queryByText('Loading application search results…')).not.toBeInTheDocument()

    await act(async () => {
      resolveCount(125)
    })

    expect(await screen.findByText('125 results found')).toBeInTheDocument()
    expect(screen.getByText('8000')).toBeInTheDocument()
  })

  it('keeps application rows and marks the exact count unavailable when counting fails', async () => {
    const rows = Array.from({ length: 10 }, (_, index) => ({
      ...searchRowsWithMixedEligibility[0],
      applicationNumber: String(8100 + index),
      packageNumber: `PKG-${index + 1}`,
    }))
    mockedSearchProvincialApplications.mockResolvedValueOnce({
      content: rows,
      page: { number: 0, size: 10, totalElements: 11, totalPages: 2 },
    })
    mockedCountProvincialApplications.mockRejectedValueOnce(new Error('count unavailable'))

    renderPage()

    expect(await screen.findByText('8100')).toBeInTheDocument()
    expect(
      await screen.findByText('At least 10 results found — exact count unavailable'),
    ).toBeInTheDocument()
    expect(screen.getByText('8100')).toBeInTheDocument()
  })

  it('passes every selected eligible application to exemption create', async () => {
    mockedSearchProvincialApplications.mockResolvedValue({
      content: searchRowsWithMixedEligibility.map((row) => ({
        ...row,
        allowCreateExemption: true,
      })),
      page: {
        number: 0,
        size: 10,
        totalElements: 2,
        totalPages: 1,
      },
    })

    renderPage()
    await screen.findByText('321')

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select 321' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select 654' }))
    await userEvent.click(
      screen.getByRole('button', { name: 'Create exemption for selected applications' }),
    )

    expect(mockNavigate).toHaveBeenCalledWith('/provincial/exemption/create', {
      state: {
        selectedApplicationNumbers: ['321', '654'],
        applicantClientNumber: '11111111',
        ownerClientNumber: '22222222',
      },
    })
  })

  it('keeps authoritative filters disabled with a persistent warning when options fail', async () => {
    mockedFetchProvincialApplicationOptions.mockRejectedValueOnce(new Error('private failure'))

    renderPage()

    expect(await screen.findByText('Options unavailable')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Application status' })).toBeDisabled()
    expect(screen.getByRole('combobox', { name: 'Exemption type' })).toBeDisabled()
    expect(screen.getByRole('combobox', { name: 'Product type' })).toBeDisabled()
    expect(screen.getByRole('combobox', { name: /^Region/ })).toBeDisabled()
    expect(screen.getByLabelText('Application number')).toBeEnabled()
    expect(
      screen.getByText('Options unavailable').closest('[role="status"]')?.querySelector('button'),
    ).toBeNull()
  })

  it('explains why the select-all checkbox is disabled when this page has no eligible rows', async () => {
    mockedSearchProvincialApplications.mockResolvedValue({
      content: [
        {
          ...searchRowsWithMixedEligibility[1],
          allowCreateExemption: false,
        },
      ],
      page: {
        number: 0,
        size: 10,
        totalElements: 1,
        totalPages: 1,
      },
    })

    renderPage()
    await screen.findByText('654')

    const selectAllCheckbox = screen.getByRole('checkbox', {
      name: 'Select all rows on this page',
    })
    expect(selectAllCheckbox).toBeDisabled()

    const selectAllTooltipTrigger = selectAllCheckbox.closest(
      '.disabled-button-tooltip',
    ) as HTMLElement
    expect(selectAllTooltipTrigger).toBeTruthy()

    await userEvent.hover(selectAllTooltipTrigger)

    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'No eligible applications are available on this page.',
    )
  })

  it('groups legacy application criteria and modern date ranges in reading order', async () => {
    renderPage()
    await screen.findByText('321')

    const filterGrid = document.querySelector('.provincial-application-search-grid')
    expect(filterGrid).toBeTruthy()
    const fieldLabels = Array.from((filterGrid as HTMLElement).children).map((field) =>
      field
        .querySelector('label, .cds--label')
        ?.textContent?.replace(/Total items selected:.*/, '')
        .trim(),
    )

    expect(fieldLabels).toEqual([
      'Application number',
      'Package number',
      'Exemption type',
      'Exemption number',
      'Application status',
      'Product type',
      'Region',
      'Received from date',
      'Received to date',
      'Listing from date',
      'Listing to date',
      'Applicant client number',
      'Owner client number',
    ])
  })

  it('clears URL-backed filters and removes results without searching again', async () => {
    renderPage(
      '/provincial/application?receivedFromDate=2026-01-01&receivedToDate=2026-01-31&region=11',
    )
    await screen.findByText('321')

    expect(screen.getByLabelText('Received from date')).toHaveValue('2026-01-01')
    expect(screen.getByLabelText('Received to date')).toHaveValue('2026-01-31')
    expect(mockedSearchProvincialApplications).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: expect.objectContaining({
          receivedFromDate: '2026-01-01',
          receivedToDate: '2026-01-31',
        }),
      }),
      expect.any(Object),
    )
    const resultsTable = screen.getByRole('region', { name: 'Search results table' })
    const searchCallsBeforeClear = mockedSearchProvincialApplications.mock.calls.length

    await userEvent.click(screen.getByRole('button', { name: 'Clear all' }))

    expect(screen.getByLabelText('Received from date')).toHaveValue('')
    expect(screen.getByLabelText('Received to date')).toHaveValue('')
    await waitFor(() => {
      expect(resultsTable).not.toBeVisible()
    })
    expect(mockedSearchProvincialApplications).toHaveBeenCalledTimes(searchCallsBeforeClear)
  })

  it('disables search for an invalid received date', async () => {
    renderPage()
    await screen.findByText('321')

    const searchButton = screen.getByRole('button', { name: 'Search' })
    expect(searchButton).toBeEnabled()

    await userEvent.type(screen.getByLabelText('Received from date'), '2026-13-01')

    await waitFor(() => {
      expect(searchButton).toBeDisabled()
    })
  })

  it('hides exemption-only filters, selection, action, and applicant column without permission', async () => {
    mockedUseAuth.mockReturnValue(createTestAuthContext({ canPerform: () => false }))

    renderPage()
    await screen.findByText('321')

    expect(screen.queryByLabelText('Applicant client number')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Owner client number')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Create exemption for selected applications' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('checkbox', { name: 'Select all rows on this page' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'Select 321' })).not.toBeInTheDocument()
    expect(screen.queryByText('Applicant client number')).not.toBeInTheDocument()
    expect(screen.queryByText('11111111')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Owner client number' })).toBeInTheDocument()
  })

  it('renders legacy non-sortable application result headers as plain text', async () => {
    renderPage()
    await screen.findByText('321')

    expect(screen.queryByRole('button', { name: 'Status' })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Application volume (m³)' }),
    ).not.toBeInTheDocument()
  })

  it.each([
    ['Applicant client number', 'applicantClientNumber'],
    ['Owner client number', 'displayOwnerClientNumber'],
    ['Region', 'regionCode'],
    ['Exemption number', 'exemptionNumber'],
    ['Listing date', 'listingDate'],
  ] as const)('dispatches the legacy %s sort key', async (header, expectedSortField) => {
    renderPage()
    await screen.findByText('321')
    mockedSearchProvincialApplications.mockClear()

    await userEvent.click(screen.getByRole('button', { name: header }))

    await waitFor(() => {
      expect(
        mockedSearchProvincialApplications.mock.calls.some(
          ([request]) => request.sortField === expectedSortField && request.sortDirection === 'asc',
        ),
      ).toBe(true)
    })
  })

  it('toggles the default application sort to ascending', async () => {
    renderPage()
    await screen.findByText('321')
    mockedSearchProvincialApplications.mockClear()

    await userEvent.click(screen.getByRole('button', { name: 'Application' }))

    await waitFor(() => {
      expect(
        mockedSearchProvincialApplications.mock.calls.some(
          ([request]) =>
            request.sortField === 'applicationNumber' && request.sortDirection === 'asc',
        ),
      ).toBe(true)
    })
  })

  it('shows validation when selected rows do not share client numbers', async () => {
    mockedSearchProvincialApplications.mockResolvedValue({
      content: [
        {
          ...searchRowsWithMixedEligibility[0],
          allowCreateExemption: true,
          applicantClientNumber: '11111111',
        },
        {
          ...searchRowsWithMixedEligibility[1],
          allowCreateExemption: true,
          applicantClientNumber: '33333333',
        },
      ],
      page: {
        number: 0,
        size: 10,
        totalElements: 2,
        totalPages: 1,
      },
    })

    renderPage()
    await screen.findByText('321')

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select all rows on this page' }))
    await userEvent.click(
      screen.getByRole('button', { name: 'Create exemption for selected applications' }),
    )

    await waitFor(() => {
      expect(screen.getByText('Validation failed')).toBeInTheDocument()
      expect(
        screen.getByText(
          'Selected applications do not share the same client numbers. Multi-application exemptions require matching clients.',
        ),
      ).toBeInTheDocument()
    })
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('clears selected rows when filters change', async () => {
    renderPage()
    await screen.findByText('321')

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select 321' }))
    expect(
      screen.getByRole('button', { name: 'Create exemption for selected applications' }),
    ).toBeEnabled()

    mockedSearchProvincialApplications.mockClear()
    await userEvent.type(screen.getByLabelText('Application number'), '9')

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Create exemption for selected applications' }),
      ).toBeDisabled()
    })
    expect(mockedSearchProvincialApplications).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Search' }))

    await waitFor(() => {
      expect(mockedSearchProvincialApplications).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: expect.objectContaining({
            applicationNumber: '9',
          }),
        }),
        expect.objectContaining({ knownTotal: expect.any(Number) }),
      )
    })
  })

  it('leaves regions unfiltered without searching when no search has been applied', async () => {
    renderPage('/provincial/application')
    await waitFor(() => {
      expect(mockedFetchProvincialApplicationOptions).toHaveBeenCalledOnce()
    })

    expect(
      await screen.findByRole('combobox', { name: /^Region\s*Total items selected:\s*0/ }),
    ).toBeVisible()
    expect(mockedSearchProvincialApplications).not.toHaveBeenCalled()
    const addApplicationAction = screen.getByRole('link', { name: 'Add application' })
    expect(addApplicationAction).toHaveAttribute('href', '/provincial/application/create')
    expect(addApplicationAction.closest('.lexis-page-header__actions')).not.toBeNull()
    const resultsTable = screen.getByRole('region', { name: 'Search results table', hidden: true })
    expect(resultsTable.closest('[hidden]')).toHaveStyle({ display: 'none' })
    expect(resultsTable).not.toBeVisible()
  })

  it('uses the saved region to preselect application search areas', async () => {
    mockedUseDefaultRegionPreference.mockReturnValue({
      defaultRegion: 'RCO',
      preferenceLoading: false,
    })
    mockedFetchProvincialApplicationOptions.mockResolvedValueOnce({
      exemptionTypes: [],
      exemptionReasons: [],
      applicationStatuses: [],
      productTypes: [],
      growthTypes: [],
      regions: [
        { value: '1903', label: 'Cariboo' },
        { value: '1909', label: 'South Coast' },
        { value: '1910', label: 'West Coast' },
      ],
      currentSchedules: [],
    })

    renderPage('/provincial/application')

    expect(
      await screen.findByRole('combobox', { name: /^Region\s*Total items selected:\s*2/ }),
    ).toBeVisible()
    expect(screen.queryByRole('list', { name: 'Selected regions' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Search' }))
    await waitFor(() => {
      expect(mockedSearchProvincialApplications).toHaveBeenLastCalledWith(
        expect.objectContaining({
          filters: expect.objectContaining({ region: ['1909', '1910'] }),
        }),
        expect.objectContaining({ knownTotal: expect.any(Number) }),
      )
    })
  })

  it('loads an export schedule link and explicitly submits its removal', async () => {
    renderPage('/provincial/application?exportScheduleId=1002&region=11')
    await screen.findByText('321')

    expect(screen.getByText('Export schedule filter applied')).toBeInTheDocument()
    expect(
      screen.getByText('Showing applications assigned to export schedule 1002.'),
    ).toBeInTheDocument()
    expect(mockedSearchProvincialApplications).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: expect.objectContaining({
          exportScheduleId: '1002',
        }),
      }),
      expect.objectContaining({ knownTotal: expect.any(Number) }),
    )

    mockedSearchProvincialApplications.mockClear()
    await userEvent.click(screen.getByRole('button', { name: /close notification/i }))
    expect(mockedSearchProvincialApplications).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Search' }))

    await waitFor(() => {
      expect(mockedSearchProvincialApplications).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: expect.objectContaining({
            exportScheduleId: '',
          }),
        }),
        expect.objectContaining({ knownTotal: expect.any(Number) }),
      )
    })
  })

  it('waits for explicit submission while filters are typed', async () => {
    renderPage()
    await screen.findByText('321')
    mockedSearchProvincialApplications.mockClear()

    const applicationNumberInput = screen.getByLabelText('Application number')
    for (const value of ['9', '98', '987']) {
      fireEvent.change(applicationNumberInput, { target: { value } })
    }

    expect(mockedSearchProvincialApplications).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Search' }))

    await waitFor(() => {
      expect(mockedSearchProvincialApplications).toHaveBeenCalledTimes(1)
      expect(mockedSearchProvincialApplications).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: expect.objectContaining({
            applicationNumber: '987',
          }),
        }),
        expect.objectContaining({ knownTotal: expect.any(Number) }),
      )
    })
  })

  it('submits date filter changes explicitly', async () => {
    renderPage()
    await screen.findByText('321')
    mockedSearchProvincialApplications.mockClear()

    fireEvent.change(screen.getByLabelText('Received from date'), {
      target: { value: '2026-07-24' },
    })

    expect(screen.getByLabelText('Received from date')).toHaveValue('2026-07-24')
    expect(mockedSearchProvincialApplications).not.toHaveBeenCalled()

    const searchButton = screen.getByRole('button', { name: 'Search' })
    expect(searchButton).toBeEnabled()
    expect(searchButton).toHaveAttribute('type', 'submit')
    expect(searchButton.closest('form')).toBeValid()
    await userEvent.click(searchButton)

    await waitFor(() => {
      expect(mockedSearchProvincialApplications).toHaveBeenCalledTimes(1)
      expect(mockedSearchProvincialApplications).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: expect.objectContaining({ receivedFromDate: '2026-07-24' }),
        }),
        expect.any(Object),
      )
    })
  })

  it('sends selected region org unit numbers to the application search request', async () => {
    mockedFetchProvincialApplicationOptions.mockResolvedValueOnce({
      exemptionTypes: [{ value: 'FEE', label: 'Fee in Lieu' }],
      exemptionReasons: [],
      applicationStatuses: [{ value: 'NEW', label: 'New' }],
      productTypes: [{ value: 'LOG', label: 'Logs' }],
      growthTypes: [],
      regions: [{ value: '1818', label: 'TST' }],
      currentSchedules: [],
    })

    renderPage('/provincial/application?region=1818')

    await waitFor(() => {
      expect(mockedSearchProvincialApplications).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: expect.objectContaining({
            region: ['1818'],
          }),
        }),
        expect.objectContaining({ knownTotal: expect.any(Number) }),
      )
    })
  })

  it('shows selected application search regions in the default Carbon multi-select', async () => {
    mockedFetchProvincialApplicationOptions.mockResolvedValueOnce({
      exemptionTypes: [{ value: 'FEE', label: 'Fee in Lieu' }],
      exemptionReasons: [],
      applicationStatuses: [{ value: 'NEW', label: 'New' }],
      productTypes: [{ value: 'LOG', label: 'Logs' }],
      growthTypes: [],
      regions: [
        { value: '1903', label: 'Cariboo Natural Resource Region' },
        { value: '1908', label: 'Skeena Natural Resource Region' },
      ],
      currentSchedules: [],
    })

    renderPage('/provincial/application?region=1903,1908')
    await screen.findByText('321')

    expect(
      await screen.findByRole('combobox', { name: /^Region\s*Total items selected:\s*2/ }),
    ).toBeVisible()
    expect(screen.queryByRole('list', { name: 'Selected regions' })).not.toBeInTheDocument()
  })

  it('prevents duplicate submissions while a search is in flight', async () => {
    renderPage()
    await screen.findByText('321')
    mockedSearchProvincialApplications.mockReset()

    let resolveSearch: (value: Awaited<ReturnType<typeof searchProvincialApplications>>) => void
    mockedSearchProvincialApplications.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSearch = resolve
      }),
    )

    const applicationNumberInput = screen.getByLabelText('Application number')
    await userEvent.type(applicationNumberInput, '1')
    await userEvent.click(screen.getByRole('button', { name: 'Search' }))
    await waitFor(() => {
      expect(mockedSearchProvincialApplications).toHaveBeenCalledTimes(1)
    })

    await userEvent.type(applicationNumberInput, '2')
    const searchForm = screen.getByRole('button', { name: 'Searching...' }).closest('form')
    expect(searchForm).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Searching...' })).toBeDisabled()
    fireEvent.submit(searchForm!)
    expect(mockedSearchProvincialApplications).toHaveBeenCalledTimes(1)

    resolveSearch!({
      content: [
        {
          ...searchRowsWithMixedEligibility[0],
          applicationNumber: '111',
        },
      ],
      page: {
        number: 0,
        size: 10,
        totalElements: 1,
        totalPages: 1,
      },
    })
    expect(await screen.findByText('111')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Search' })).toBeEnabled()
  })

  it('shows a request failure instead of a no-results state', async () => {
    mockedSearchProvincialApplications.mockRejectedValue(new Error('Oracle unavailable'))

    renderPage()

    expect(
      await screen.findByRole('heading', { name: 'Application search unavailable' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Unable to retrieve application search results.')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'No applications found' })).not.toBeInTheDocument()
  })
})
