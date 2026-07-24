import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import FederalPage from '@/pages/Federal'
import { searchFederalApplications } from '@/service/federal-application-search-service'
import { fetchFederalApplicationOptions } from '@/service/search-options-service'
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

vi.mock('@/service/federal-application-search-service', () => ({
  countFederalApplications: vi.fn(),
  searchFederalApplications: vi.fn(),
}))

vi.mock('@/service/search-options-service', () => ({
  fetchFederalApplicationOptions: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)
const mockedSearchFederalApplications = vi.mocked(searchFederalApplications)
const mockedFetchFederalApplicationOptions = vi.mocked(fetchFederalApplicationOptions)

const renderPage = () => {
  render(
    <MemoryRouter initialEntries={['/federal']}>
      <Routes>
        <Route path="/federal" element={<FederalPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

const defaultRows = [
  {
    applicationNumber: '1001',
    federalApplicationNumber: 'FED-1001',
    status: 'APPROVED',
    clientNumber: '11111111',
    reason: 'Economic',
    exemptionType: 'Section 1',
    exemptionNumber: '',
    receivedDate: '2026-01-10',
    listingDate: '2026-01-12',
    packageNumber: 'PKG-1',
    eligibleForExemption: true,
    locked: false,
    allowCreateExemption: true,
  },
  {
    applicationNumber: '1002',
    federalApplicationNumber: 'FED-1002',
    status: 'APPROVED',
    clientNumber: '11111111',
    reason: 'Emergency',
    exemptionType: 'Section 2',
    exemptionNumber: 'EX-9',
    receivedDate: '2026-01-11',
    listingDate: '2026-01-13',
    packageNumber: 'PKG-2',
    eligibleForExemption: false,
    locked: false,
    allowCreateExemption: false,
  },
]

describe('Federal Search Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseAuth.mockReturnValue(createTestAuthContext())
    mockedFetchFederalApplicationOptions.mockResolvedValue({
      applicationStatuses: [
        { value: 'NEW', label: 'New' },
        { value: 'APPROVED', label: 'Approved' },
      ],
    })
    mockedSearchFederalApplications.mockResolvedValue({
      content: defaultRows,
      page: {
        number: 0,
        size: 10,
        totalElements: 2,
        totalPages: 1,
      },
    })
  })

  it('only allows eligible federal applications to be selected for exemption creation', async () => {
    renderPage()
    await screen.findByText('FED-1001')

    const createButton = screen.getByRole('button', {
      name: 'Create exemption for Selected Applications',
    })
    expect(createButton).toBeDisabled()
    expect(
      screen.getByRole('checkbox', { name: 'Select federal application FED-1001' }),
    ).toBeEnabled()
    expect(
      screen.getByRole('checkbox', { name: 'Select federal application FED-1002' }),
    ).toBeDisabled()

    await userEvent.click(
      screen.getByRole('checkbox', { name: 'Select federal application FED-1001' }),
    )
    expect(
      screen.getByRole('button', { name: 'Create exemption for Selected Applications' }),
    ).toBeEnabled()
    await userEvent.click(
      screen.getByRole('button', { name: 'Create exemption for Selected Applications' }),
    )

    expect(mockNavigate).toHaveBeenCalledWith(
      '/provincial/exemption/create?applications=1001&source=federal',
      {
        state: {
          selectedApplicationNumbers: ['1001'],
          applicationSource: 'federal',
        },
      },
    )
  })

  it('explains why an ineligible federal application cannot be selected', async () => {
    renderPage()
    await screen.findByText('FED-1001')

    const ineligibleCheckbox = screen.getByRole('checkbox', {
      name: 'Select federal application FED-1002',
    })
    expect(ineligibleCheckbox).toBeDisabled()

    const tooltipTrigger = ineligibleCheckbox.closest('.disabled-button-tooltip') as HTMLElement
    expect(tooltipTrigger).toBeTruthy()

    await userEvent.hover(tooltipTrigger)

    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'This application already has an exemption.',
    )
  })

  it('renders every federal result header as plain text without sort state', async () => {
    renderPage()
    await screen.findByText('FED-1001')

    for (const header of [
      'Application',
      'Status',
      'Client',
      'Reason',
      'Received date',
      'Listing date',
    ]) {
      expect(screen.queryByRole('button', { name: header })).not.toBeInTheDocument()
    }
    expect(mockedSearchFederalApplications).toHaveBeenCalledWith(
      expect.not.objectContaining({
        sortField: expect.anything(),
        sortDirection: expect.anything(),
      }),
      expect.any(Object),
    )
  })

  it('debounces backend searches while text filters are typed', async () => {
    renderPage()
    await screen.findByText('FED-1001')
    mockedSearchFederalApplications.mockClear()

    const applicationNumberInput = screen.getByLabelText('Application number')
    for (const value of ['4', '46', '460', '4605', '46053']) {
      fireEvent.change(applicationNumberInput, { target: { value } })
    }

    expect(mockedSearchFederalApplications).not.toHaveBeenCalled()

    await waitFor(() => {
      expect(mockedSearchFederalApplications).toHaveBeenCalledTimes(1)
      expect(mockedSearchFederalApplications).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: expect.objectContaining({ applicationNumber: '46053' }),
        }),
        expect.any(Object),
      )
    })
  })

  it('select-all includes every eligible row and excludes ineligible rows', async () => {
    mockedSearchFederalApplications.mockResolvedValue({
      content: [
        defaultRows[0],
        {
          ...defaultRows[1],
          exemptionNumber: '',
          eligibleForExemption: true,
          allowCreateExemption: true,
        },
        {
          ...defaultRows[1],
          applicationNumber: '1003',
          federalApplicationNumber: 'FED-1003',
          allowCreateExemption: false,
        },
      ],
      page: {
        number: 0,
        size: 10,
        totalElements: 3,
        totalPages: 1,
      },
    })

    renderPage()
    await screen.findByText('FED-1001')

    await userEvent.click(
      screen.getByRole('checkbox', {
        name: 'Select all eligible federal applications on this page',
      }),
    )
    expect(
      screen.getByRole('checkbox', { name: 'Select federal application FED-1001' }),
    ).toBeChecked()
    expect(
      screen.getByRole('checkbox', { name: 'Select federal application FED-1002' }),
    ).toBeChecked()
    expect(
      screen.getByRole('checkbox', { name: 'Select federal application FED-1003' }),
    ).not.toBeChecked()

    await userEvent.click(
      screen.getByRole('button', { name: 'Create exemption for Selected Applications' }),
    )
    expect(mockNavigate).toHaveBeenCalledWith(
      '/provincial/exemption/create?applications=1001%2C1002&source=federal',
      {
        state: {
          selectedApplicationNumbers: ['1001', '1002'],
          applicationSource: 'federal',
        },
      },
    )
  })

  it('shows a lock marker instead of a checkbox for an otherwise eligible locked row', async () => {
    mockedSearchFederalApplications.mockResolvedValue({
      content: [
        {
          ...defaultRows[0],
          locked: true,
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
    await screen.findByText('FED-1001')

    expect(
      screen.getByRole('status', { name: 'Federal application FED-1001 is locked' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('checkbox', { name: 'Select federal application FED-1001' }),
    ).not.toBeInTheDocument()
    const selectAllCheckbox = screen.getByRole('checkbox', {
      name: 'Select all eligible federal applications on this page',
    })
    expect(selectAllCheckbox).toBeDisabled()

    const tooltipTrigger = selectAllCheckbox.closest('.disabled-button-tooltip') as HTMLElement
    expect(tooltipTrigger).toBeTruthy()

    await userEvent.hover(tooltipTrigger)

    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'No eligible federal applications are available on this page.',
    )
  })

  it('does not expose federal exemption selection without both required actions', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        canPerform: (action: string) => action === 'viewFederalApplication',
      }),
    )

    renderPage()
    await screen.findByText('FED-1001')

    expect(
      screen.queryByRole('button', { name: 'Create exemption for Selected Applications' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('checkbox', { name: /Select federal application/ }),
    ).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Client number')).not.toBeInTheDocument()
  })

  it('keeps repeated federal numbers linked to their distinct internal applications', async () => {
    mockedSearchFederalApplications.mockResolvedValue({
      content: defaultRows.map((row) => ({
        ...row,
        federalApplicationNumber: '700123',
      })),
      page: {
        number: 0,
        size: 10,
        totalElements: 2,
        totalPages: 1,
      },
    })

    renderPage()

    const applicationLinks = await screen.findAllByRole('link', { name: '700123' })
    expect(applicationLinks).toHaveLength(2)
    expect(applicationLinks.map((link) => link.getAttribute('href')?.split('?')[0])).toEqual([
      '/federal/application/1001',
      '/federal/application/1002',
    ])
  })

  it('disables search button for invalid ISO date filters', async () => {
    renderPage()
    await screen.findByText('FED-1001')

    const searchButton = screen.getByRole('button', { name: 'Search' })
    expect(searchButton).toBeEnabled()

    await userEvent.type(screen.getByLabelText('Received from date'), '2026-13-99')

    await waitFor(() => {
      expect(searchButton).toBeDisabled()
    })
  })

  it('does not use date format text in visible date labels', async () => {
    renderPage()
    await screen.findByText('FED-1001')

    expect(screen.getByLabelText('Received from date')).toBeInTheDocument()
    expect(screen.getByLabelText('Received to date')).toBeInTheDocument()
    expect(screen.getByLabelText('Listing from date')).toBeInTheDocument()
    expect(screen.getByLabelText('Listing to date')).toBeInTheDocument()
    expect(screen.queryByLabelText('Received from date (YYYY-MM-DD)')).not.toBeInTheDocument()
  })

  it('shows a request failure instead of a no-results state', async () => {
    mockedSearchFederalApplications.mockRejectedValue(new Error('Oracle unavailable'))

    renderPage()

    expect(
      await screen.findByRole('heading', { name: 'Federal application search unavailable' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Unable to retrieve federal application search results.'),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'No federal applications found' }),
    ).not.toBeInTheDocument()
  })
})
