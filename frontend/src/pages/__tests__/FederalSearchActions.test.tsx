import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import FederalPage from '@/pages/Federal'
import { searchFederalApplications } from '@/service/federal-application-search-service'
import { fetchFederalApplicationOptions } from '@/service/search-options-service'
import { createTestAuthContext } from '@/test-utils/auth'

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

  it('does not expose provincial bulk exemption controls', async () => {
    renderPage()
    await screen.findByText('FED-1001')

    expect(
      screen.queryByRole('button', {
        name: 'Create exemption for Selected Applications',
      }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('checkbox', { name: 'Select all rows on this page' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'Select 1001' })).not.toBeInTheDocument()
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
})
