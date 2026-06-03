import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import Dashboard from '@/components/Dashboard'
import { useAuth } from '@/context/auth/useAuth'
import { searchApplicationReviews } from '@/service/application-review-search-service'
import { searchFederalApplications } from '@/service/federal-application-search-service'
import { searchIndianReservePermits } from '@/service/indian-reserve-permit-search-service'
import { searchProvincialApplications } from '@/service/provincial-application-search-service'
import { searchProvincialExemptions } from '@/service/provincial-exemption-search-service'
import { searchProvincialOffers } from '@/service/provincial-offer-search-service'
import { searchProvincialPermits } from '@/service/provincial-permit-search-service'

vi.mock('@/context/auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/service/provincial-application-search-service', () => ({
  searchProvincialApplications: vi.fn(),
}))

vi.mock('@/service/provincial-exemption-search-service', () => ({
  searchProvincialExemptions: vi.fn(),
}))

vi.mock('@/service/provincial-offer-search-service', () => ({
  searchProvincialOffers: vi.fn(),
}))

vi.mock('@/service/provincial-permit-search-service', () => ({
  searchProvincialPermits: vi.fn(),
}))

vi.mock('@/service/application-review-search-service', () => ({
  searchApplicationReviews: vi.fn(),
}))

vi.mock('@/service/federal-application-search-service', () => ({
  searchFederalApplications: vi.fn(),
}))

vi.mock('@/service/indian-reserve-permit-search-service', () => ({
  searchIndianReservePermits: vi.fn(),
}))

describe('Dashboard', () => {
  const mockedUseAuth = vi.mocked(useAuth)
  const mockedSearchProvincialApplications = vi.mocked(searchProvincialApplications)
  const mockedSearchProvincialExemptions = vi.mocked(searchProvincialExemptions)
  const mockedSearchProvincialOffers = vi.mocked(searchProvincialOffers)
  const mockedSearchProvincialPermits = vi.mocked(searchProvincialPermits)
  const mockedSearchApplicationReviews = vi.mocked(searchApplicationReviews)
  const mockedSearchFederalApplications = vi.mocked(searchFederalApplications)
  const mockedSearchIndianReservePermits = vi.mocked(searchIndianReservePermits)

  const searchResponse = (totalElements: number) =>
    ({
      content: [],
      page: { number: 0, size: 1, totalElements, totalPages: 1 },
    }) as any

  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseAuth.mockReturnValue({
      canPerform: () => false,
    } as any)
    mockedSearchProvincialApplications.mockResolvedValue(searchResponse(0))
    mockedSearchProvincialExemptions.mockResolvedValue(searchResponse(0))
    mockedSearchProvincialOffers.mockResolvedValue(searchResponse(0))
    mockedSearchProvincialPermits.mockResolvedValue(searchResponse(0))
    mockedSearchApplicationReviews.mockResolvedValue(searchResponse(0))
    mockedSearchFederalApplications.mockResolvedValue(searchResponse(0))
    mockedSearchIndianReservePermits.mockResolvedValue(searchResponse(0))
  })

  test('renders a heading with the correct text', () => {
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    )
    expect(screen.getByText(/LEXIS Dashboard/i)).toBeInTheDocument()
  })

  test('does not load dashboard counts until explicitly refreshed', async () => {
    mockedUseAuth.mockReturnValue({
      canPerform: () => true,
    } as any)
    mockedSearchProvincialApplications.mockResolvedValue(searchResponse(456))

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    )

    expect(mockedSearchProvincialApplications).not.toHaveBeenCalled()
    expect(screen.getAllByText('-')).toHaveLength(7)

    await userEvent.click(screen.getByRole('button', { name: 'Refresh Dashboard' }))
    expect(await screen.findByText('456')).toBeInTheDocument()

    await waitFor(() => {
      expect(mockedSearchProvincialApplications).toHaveBeenCalledTimes(1)
    })
  })
})
