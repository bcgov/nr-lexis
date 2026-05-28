import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import ProvincialSummaryPage from '@/pages/ProvincialSummary'
import { searchApplicationReviews } from '@/service/application-review-search-service'
import { searchFederalApplications } from '@/service/federal-application-search-service'
import { searchIndianReservePermits } from '@/service/indian-reserve-permit-search-service'
import { searchProvincialApplications } from '@/service/provincial-application-search-service'
import { searchProvincialExemptions } from '@/service/provincial-exemption-search-service'
import { searchProvincialOffers } from '@/service/provincial-offer-search-service'
import { searchProvincialPermits } from '@/service/provincial-permit-search-service'

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

const mockedUseAuth = vi.mocked(useAuth)
const mockedSearchProvincialApplications = vi.mocked(searchProvincialApplications)
const mockedSearchProvincialExemptions = vi.mocked(searchProvincialExemptions)
const mockedSearchProvincialOffers = vi.mocked(searchProvincialOffers)
const mockedSearchProvincialPermits = vi.mocked(searchProvincialPermits)
const mockedSearchApplicationReviews = vi.mocked(searchApplicationReviews)
const mockedSearchFederalApplications = vi.mocked(searchFederalApplications)
const mockedSearchIndianReservePermits = vi.mocked(searchIndianReservePermits)

const renderPage = () => {
  render(
    <MemoryRouter initialEntries={['/provincial/summary']}>
      <Routes>
        <Route path="/provincial/summary" element={<ProvincialSummaryPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Provincial Summary action smoke', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockedUseAuth.mockReturnValue({
      canPerform: () => true,
    } as any)

    mockedSearchProvincialApplications.mockResolvedValue({
      content: [],
      page: { number: 0, size: 1, totalElements: 5, totalPages: 5 },
    })
    mockedSearchProvincialExemptions.mockResolvedValue({
      content: [],
      page: { number: 0, size: 1, totalElements: 6, totalPages: 6 },
    })
    mockedSearchProvincialOffers.mockResolvedValue({
      content: [],
      page: { number: 0, size: 1, totalElements: 7, totalPages: 7 },
    })
    mockedSearchProvincialPermits.mockResolvedValue({
      content: [],
      page: { number: 0, size: 1, totalElements: 8, totalPages: 8 },
    })
    mockedSearchApplicationReviews.mockResolvedValue({
      content: [
        {
          applicationNumber: '901',
          volume: 0,
          speciesEndUse: 'LOG',
          listingDate: '2026-05-20',
          status: 'NEW',
          region: '22',
          showInfoIcon: false,
        },
      ],
      page: { number: 0, size: 5, totalElements: 9, totalPages: 2 },
    })
    mockedSearchFederalApplications.mockResolvedValue({
      content: [],
      page: { number: 0, size: 1, totalElements: 10, totalPages: 10 },
    })
    mockedSearchIndianReservePermits.mockResolvedValue({
      content: [],
      page: { number: 0, size: 1, totalElements: 11, totalPages: 11 },
    })
  })

  it('loads summary totals and navigates through review actions', async () => {
    renderPage()

    await screen.findByText('901')
    expect(mockedSearchProvincialApplications).toHaveBeenCalledTimes(1)
    expect(mockedSearchProvincialExemptions).toHaveBeenCalledTimes(1)
    expect(mockedSearchProvincialOffers).toHaveBeenCalledTimes(1)
    expect(mockedSearchProvincialPermits).toHaveBeenCalledTimes(1)
    expect(mockedSearchApplicationReviews).toHaveBeenCalledTimes(1)
    expect(mockedSearchFederalApplications).toHaveBeenCalledTimes(1)
    expect(mockedSearchIndianReservePermits).toHaveBeenCalledTimes(1)

    await userEvent.click(screen.getByRole('button', { name: 'Open Review Queue' }))
    expect(mockNavigate).toHaveBeenCalledWith('/provincial/review')

    const reviewRow = screen.getByText('901').closest('tr')
    expect(reviewRow).not.toBeNull()

    await userEvent.click(
      within(reviewRow as HTMLTableRowElement).getByRole('button', { name: 'Open' }),
    )
    expect(mockNavigate).toHaveBeenCalledWith('/provincial/application/901')
  })

  it('disables summary route actions when the user lacks all route permissions', async () => {
    mockedUseAuth.mockReturnValue({
      canPerform: () => false,
    } as any)

    renderPage()

    await screen.findByText('No review queue data available.')

    expect(mockedSearchProvincialApplications).not.toHaveBeenCalled()
    expect(mockedSearchProvincialExemptions).not.toHaveBeenCalled()
    expect(mockedSearchProvincialOffers).not.toHaveBeenCalled()
    expect(mockedSearchProvincialPermits).not.toHaveBeenCalled()
    expect(mockedSearchApplicationReviews).not.toHaveBeenCalled()
    expect(mockedSearchFederalApplications).not.toHaveBeenCalled()
    expect(mockedSearchIndianReservePermits).not.toHaveBeenCalled()

    expect(screen.getByRole('button', { name: 'Open Review Queue' })).toBeDisabled()
    expect(screen.getByText('No review queue data available.')).toBeInTheDocument()
    expect(screen.getAllByText('Not Granted')).toHaveLength(7)
    screen.getAllByRole('button', { name: 'Open' }).forEach((button) => {
      expect(button).toBeDisabled()
    })
  })
})
