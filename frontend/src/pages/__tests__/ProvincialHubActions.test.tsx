import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import ProvincialPage from '@/pages/Provincial'
import { countApplicationReviews } from '@/service/application-review-search-service'
import { countProvincialApplications } from '@/service/provincial-application-search-service'
import { countProvincialExemptions } from '@/service/provincial-exemption-search-service'
import { countProvincialOffers } from '@/service/provincial-offer-search-service'
import { countProvincialPermits } from '@/service/provincial-permit-search-service'

vi.mock('@/context/auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/service/provincial-application-search-service', () => ({
  countProvincialApplications: vi.fn(),
}))

vi.mock('@/service/provincial-exemption-search-service', () => ({
  countProvincialExemptions: vi.fn(),
}))

vi.mock('@/service/provincial-offer-search-service', () => ({
  countProvincialOffers: vi.fn(),
}))

vi.mock('@/service/provincial-permit-search-service', () => ({
  countProvincialPermits: vi.fn(),
}))

vi.mock('@/service/application-review-search-service', () => ({
  countApplicationReviews: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)
const mockedCountProvincialApplications = vi.mocked(countProvincialApplications)
const mockedCountProvincialExemptions = vi.mocked(countProvincialExemptions)
const mockedCountProvincialOffers = vi.mocked(countProvincialOffers)
const mockedCountProvincialPermits = vi.mocked(countProvincialPermits)
const mockedCountApplicationReviews = vi.mocked(countApplicationReviews)

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
    mockedCountProvincialApplications.mockResolvedValue(11)
    mockedCountProvincialExemptions.mockResolvedValue(12)
    mockedCountProvincialOffers.mockResolvedValue(13)
    mockedCountProvincialPermits.mockResolvedValue(14)
    mockedCountApplicationReviews.mockResolvedValue(15)
  })

  it('does not load workflow totals until explicitly refreshed', async () => {
    renderPage()

    expect(mockedCountProvincialApplications).not.toHaveBeenCalled()
    expect(mockedCountProvincialExemptions).not.toHaveBeenCalled()
    expect(mockedCountProvincialOffers).not.toHaveBeenCalled()
    expect(mockedCountProvincialPermits).not.toHaveBeenCalled()
    expect(mockedCountApplicationReviews).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Refresh Totals' }))

    await waitFor(() => {
      expect(mockedCountProvincialApplications).toHaveBeenCalledTimes(1)
      expect(mockedCountProvincialExemptions).toHaveBeenCalledTimes(1)
      expect(mockedCountProvincialOffers).toHaveBeenCalledTimes(1)
      expect(mockedCountProvincialPermits).toHaveBeenCalledTimes(1)
      expect(mockedCountApplicationReviews).toHaveBeenCalledTimes(1)
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
