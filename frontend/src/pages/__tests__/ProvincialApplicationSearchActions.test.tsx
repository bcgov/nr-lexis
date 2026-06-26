import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
    expect(screen.getByRole('link', { name: 'Upload Application Submission' })).toHaveAttribute(
      'href',
      '/provincial/application/upload',
    )

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
      )
    })
  })

  it('shows selected application search region names instead of only the selected count', async () => {
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

    renderPage()
    await screen.findByText('321')

    const regionComboBox = screen.getByRole('combobox', { name: /^Region/ })
    await userEvent.click(regionComboBox)
    fireEvent.change(regionComboBox, { target: { value: 'Cariboo' } })
    await userEvent.click(
      await screen.findByRole('option', { name: 'Cariboo Natural Resource Region' }),
    )
    await userEvent.click(regionComboBox)
    fireEvent.change(regionComboBox, { target: { value: 'Skeena' } })
    await userEvent.click(
      await screen.findByRole('option', { name: 'Skeena Natural Resource Region' }),
    )

    expect(
      await screen.findByText(
        'Selected: Cariboo Natural Resource Region, Skeena Natural Resource Region',
      ),
    ).toBeInTheDocument()
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
})
