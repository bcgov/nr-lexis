import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import ProvincialApplicationPage from '@/pages/ProvincialApplication'
import { searchProvincialApplications } from '@/service/provincial-application-search-service'
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

vi.mock('@/service/provincial-application-search-service', () => ({
  countProvincialApplications: vi.fn(),
  searchProvincialApplications: vi.fn(),
}))

vi.mock('@/service/search-options-service', () => ({
  fetchProvincialApplicationOptions: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)
const mockedSearchProvincialApplications = vi.mocked(searchProvincialApplications)
const mockedFetchProvincialApplicationOptions = vi.mocked(fetchProvincialApplicationOptions)

const renderPage = (path = '/provincial/application') => {
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
    allowCreateExemption: false,
  },
]

describe('Provincial Application Search Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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

  it('only allows selecting eligible rows and navigates to exemption create with prefill', async () => {
    renderPage()
    await screen.findByText('321')

    const createExemptionButton = screen.getByRole('button', {
      name: 'Create exemption for Selected Applications',
    })
    expect(createExemptionButton).toBeDisabled()

    expect(screen.getByRole('checkbox', { name: 'Select 321' })).toBeEnabled()
    expect(screen.getByRole('checkbox', { name: 'Select 654' })).toBeDisabled()
    expect(
      screen.queryByRole('link', { name: 'Upload Application Submission' }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Add Application' })).toHaveAttribute(
      'href',
      '/provincial/application/create',
    )
    expect(
      screen.getByRole('link', { name: 'Add Application' }).closest('.legacy-search-actions'),
    ).toBeNull()

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select 321' }))
    expect(createExemptionButton).toBeEnabled()

    await userEvent.click(createExemptionButton)

    expect(mockNavigate).toHaveBeenCalledWith('/provincial/exemption/create', {
      state: {
        selectedApplicationNumbers: ['321'],
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

  it('renders application search filters in the legacy order', async () => {
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
      'Application status',
      'Package number',
      'Exemption type',
      'Exemption number',
      'Product type',
      'Region',
      'Applicant client number',
      'Owner client number',
      'Received from date',
      'Received to date',
      'Listing from date',
      'Listing to date',
    ])
  })

  it('restores received date filters from the URL and clears them', async () => {
    renderPage('/provincial/application?receivedFromDate=2026-01-01&receivedToDate=2026-01-31')
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

    await userEvent.click(screen.getByRole('button', { name: 'Clear Filters' }))

    expect(screen.getByLabelText('Received from date')).toHaveValue('')
    expect(screen.getByLabelText('Received to date')).toHaveValue('')
    await waitFor(() => {
      expect(mockedSearchProvincialApplications).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: expect.objectContaining({
            receivedFromDate: '',
            receivedToDate: '',
          }),
        }),
        expect.any(Object),
      )
    })
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
      screen.queryByRole('button', { name: 'Create exemption for Selected Applications' }),
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

    await userEvent.click(screen.getByRole('button', { name: 'Application (DESC)' }))

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
      screen.getByRole('button', { name: 'Create exemption for Selected Applications' }),
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

    const createExemptionButton = screen.getByRole('button', {
      name: 'Create exemption for Selected Applications',
    })

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select 321' }))
    expect(createExemptionButton).toBeEnabled()

    await userEvent.type(screen.getByLabelText('Application number'), '9')

    await waitFor(() => {
      expect(createExemptionButton).toBeDisabled()
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

  it('does not default region filters when opened without query parameters', async () => {
    renderPage()
    await screen.findByText('321')

    expect(mockedSearchProvincialApplications).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: expect.objectContaining({
          region: [],
        }),
      }),
      expect.objectContaining({ knownTotal: expect.any(Number) }),
    )
  })

  it('auto-searches an advertising date supplied by the export schedule link', async () => {
    renderPage('/provincial/application?listingFromDate=2026-07-15&listingToDate=2026-07-15')
    await screen.findByText('321')

    expect(mockedSearchProvincialApplications).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: expect.objectContaining({
          listingFromDate: '2026-07-15',
          listingToDate: '2026-07-15',
        }),
      }),
      expect.objectContaining({ knownTotal: expect.any(Number) }),
    )
  })

  it('debounces backend searches while filters are typed', async () => {
    renderPage()
    await screen.findByText('321')
    mockedSearchProvincialApplications.mockClear()

    await userEvent.type(screen.getByLabelText('Application number'), '987')

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

  it('shows selected application search regions as removable pills', async () => {
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

    const selectedRegions = await screen.findByRole('list', { name: 'Selected regions' })
    expect(within(selectedRegions).getByText('Cariboo Natural Resource Region')).toBeVisible()
    expect(within(selectedRegions).getByText('Skeena Natural Resource Region')).toBeVisible()
    expect(
      within(selectedRegions).getByRole('button', {
        name: 'Remove Cariboo Natural Resource Region',
      }),
    ).toBeEnabled()
  })

  it('ignores stale search responses that resolve after a newer search', async () => {
    renderPage()
    await screen.findByText('321')
    mockedSearchProvincialApplications.mockReset()

    let resolveFirstSearch: (
      value: Awaited<ReturnType<typeof searchProvincialApplications>>,
    ) => void
    let resolveSecondSearch: (
      value: Awaited<ReturnType<typeof searchProvincialApplications>>,
    ) => void
    mockedSearchProvincialApplications
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFirstSearch = resolve
        }),
      )
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveSecondSearch = resolve
        }),
      )

    const applicationNumberInput = screen.getByLabelText('Application number')
    await userEvent.type(applicationNumberInput, '1')
    await waitFor(() => {
      expect(mockedSearchProvincialApplications).toHaveBeenCalledTimes(1)
    })

    await userEvent.type(applicationNumberInput, '2')
    await waitFor(() => {
      expect(mockedSearchProvincialApplications).toHaveBeenCalledTimes(2)
    })

    resolveSecondSearch!({
      content: [
        {
          ...searchRowsWithMixedEligibility[0],
          applicationNumber: '222',
        },
      ],
      page: {
        number: 0,
        size: 10,
        totalElements: 1,
        totalPages: 1,
      },
    })
    expect(await screen.findByText('222')).toBeInTheDocument()

    resolveFirstSearch!({
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

    await waitFor(() => {
      expect(screen.queryByText('111')).not.toBeInTheDocument()
      expect(screen.getByText('222')).toBeInTheDocument()
    })
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
