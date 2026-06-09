import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import ProvincialPage from '@/pages/Provincial'
import { searchApplicationReviews } from '@/service/application-review-search-service'
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

const mockedUseAuth = vi.mocked(useAuth)
const mockedSearchProvincialApplications = vi.mocked(searchProvincialApplications)
const mockedSearchProvincialExemptions = vi.mocked(searchProvincialExemptions)
const mockedSearchProvincialOffers = vi.mocked(searchProvincialOffers)
const mockedSearchProvincialPermits = vi.mocked(searchProvincialPermits)
const mockedSearchApplicationReviews = vi.mocked(searchApplicationReviews)

const searchResponse = (totalElements: number) =>
  ({
    content: [],
    page: { number: 0, size: 1, totalElements, totalPages: 1 },
  }) as any

const renderPage = () => {
  render(
    <MemoryRouter initialEntries={['/provincial']}>
      <Routes>
        <Route path="/provincial" element={<ProvincialPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Provincial hub actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseAuth.mockReturnValue({
      canPerform: () => true,
    } as any)
    mockedSearchProvincialApplications.mockResolvedValue(searchResponse(11))
    mockedSearchProvincialExemptions.mockResolvedValue(searchResponse(12))
    mockedSearchProvincialOffers.mockResolvedValue(searchResponse(13))
    mockedSearchProvincialPermits.mockResolvedValue(searchResponse(14))
    mockedSearchApplicationReviews.mockResolvedValue(searchResponse(15))
  })

  it('does not load workflow totals until explicitly refreshed', async () => {
    renderPage()

    expect(mockedSearchProvincialApplications).not.toHaveBeenCalled()
    expect(mockedSearchProvincialExemptions).not.toHaveBeenCalled()
    expect(mockedSearchProvincialOffers).not.toHaveBeenCalled()
    expect(mockedSearchProvincialPermits).not.toHaveBeenCalled()
    expect(mockedSearchApplicationReviews).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Refresh Totals' }))

    await waitFor(() => {
      expect(mockedSearchProvincialApplications).toHaveBeenCalledTimes(1)
      expect(mockedSearchProvincialExemptions).toHaveBeenCalledTimes(1)
      expect(mockedSearchProvincialOffers).toHaveBeenCalledTimes(1)
      expect(mockedSearchProvincialPermits).toHaveBeenCalledTimes(1)
      expect(mockedSearchApplicationReviews).toHaveBeenCalledTimes(1)
    })

    expect(screen.getByText('11')).toBeInTheDocument()
    expect(screen.getByText('15')).toBeInTheDocument()
  })

  it('hides provincial areas the user cannot access', () => {
    mockedUseAuth.mockReturnValue({
      canPerform: (action: string) => action === '/applicationSearch',
    } as any)

    renderPage()

    expect(screen.getByText('Applications')).toBeInTheDocument()
    expect(screen.queryByText('Exemptions')).not.toBeInTheDocument()
    expect(screen.queryByText('Offers')).not.toBeInTheDocument()
    expect(screen.queryByText('Permits')).not.toBeInTheDocument()
    expect(screen.queryByText('Review Queue')).not.toBeInTheDocument()
    expect(screen.queryByText('Summary')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Create Application' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Create Exemption' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Create Offer' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Create Permit' })).not.toBeInTheDocument()
    expect(screen.queryByText('Not Granted')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Show available areas only')).not.toBeInTheDocument()
  })
})
