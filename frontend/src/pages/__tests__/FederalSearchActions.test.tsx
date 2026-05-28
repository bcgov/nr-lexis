import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import FederalPage from '@/pages/Federal'
import { searchFederalApplications } from '@/service/federal-application-search-service'
import { fetchFederalApplicationOptions } from '@/service/search-options-service'

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
    status: 'NEW',
    clientNumber: '11111111',
    reason: 'Economic',
    exemptionType: 'Section 1',
    exemptionNumber: '',
    receivedDate: '2026-01-10',
    listingDate: '2026-01-12',
    packageNumber: 'PKG-1',
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
    allowCreateExemption: false,
  },
]

describe('Federal Search Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseAuth.mockReturnValue({
      canPerform: (action: string) => action === '/createExemption',
    } as any)
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

  it('allows selecting eligible federal rows and navigates with exemption prefill state', async () => {
    renderPage()
    await screen.findByText('FED-1001')

    const createExemptionButton = screen.getByRole('button', {
      name: 'Create Exemption for Selected Applications',
    })
    expect(createExemptionButton).toBeDisabled()

    expect(screen.getByRole('checkbox', { name: 'Select 1001' })).toBeEnabled()
    expect(screen.getByRole('checkbox', { name: 'Select 1002' })).toBeDisabled()

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select 1001' }))
    expect(createExemptionButton).toBeEnabled()

    await userEvent.click(createExemptionButton)

    expect(mockNavigate).toHaveBeenCalledWith('/provincial/exemption/create', {
      state: {
        selectedApplicationNumbers: ['1001'],
        applicantClientNumber: '11111111',
        ownerClientNumber: '11111111',
      },
    })
  })

  it('shows validation when selected federal rows have mismatched client numbers', async () => {
    mockedSearchFederalApplications.mockResolvedValue({
      content: [
        {
          ...defaultRows[0],
          allowCreateExemption: true,
          clientNumber: '11111111',
        },
        {
          ...defaultRows[1],
          allowCreateExemption: true,
          clientNumber: '22222222',
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
    await screen.findByText('FED-1001')

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select all rows on this page' }))
    await userEvent.click(
      screen.getByRole('button', { name: 'Create Exemption for Selected Applications' }),
    )

    await waitFor(() => {
      expect(screen.getByText('Validation failed')).toBeInTheDocument()
      expect(
        screen.getByText(
          'Selected federal applications do not share the same client number. Multi-application exemptions require matching clients.',
        ),
      ).toBeInTheDocument()
    })
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('disables search button for invalid ISO date filters', async () => {
    renderPage()
    await screen.findByText('FED-1001')

    const searchButton = screen.getByRole('button', { name: 'Search' })
    expect(searchButton).toBeEnabled()

    await userEvent.type(screen.getByLabelText('Received From Date (YYYY-MM-DD)'), '2026-13-99')

    await waitFor(() => {
      expect(searchButton).toBeDisabled()
    })
  })
})
