import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import ProvincialOffersPage from '@/pages/ProvincialOffers'
import { searchProvincialOffers } from '@/service/provincial-offer-search-service'
import { fetchProvincialOfferOptions } from '@/service/search-options-service'

vi.mock('@/context/auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/service/provincial-offer-search-service', () => ({
  searchProvincialOffers: vi.fn(),
}))

vi.mock('@/service/search-options-service', () => ({
  fetchProvincialOfferOptions: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)
const mockedSearchProvincialOffers = vi.mocked(searchProvincialOffers)
const mockedFetchProvincialOfferOptions = vi.mocked(fetchProvincialOfferOptions)

const renderPage = () => {
  render(
    <MemoryRouter initialEntries={['/provincial/offers']}>
      <Routes>
        <Route path="/provincial/offers" element={<ProvincialOffersPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Provincial Offer Search Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedFetchProvincialOfferOptions.mockResolvedValue({
      regions: [{ value: '11', label: 'Cariboo' }],
    })
    mockedSearchProvincialOffers.mockResolvedValue({
      content: [
        {
          offerNumber: 'OFF-1001',
          applicationNumber: '3001',
          packageNumber: 'PKG-1',
          listingDate: '2026-01-10',
          region: '11',
          offerWithdrawalDate: '',
          clientNumber: '11111111',
        },
      ],
      page: {
        number: 0,
        size: 10,
        totalElements: 1,
        totalPages: 1,
      },
    } as any)
  })

  it('shows add offer link only when createOffer action is granted', async () => {
    mockedUseAuth.mockReturnValue({
      canPerform: (action: string) => action === 'createOffer',
    } as any)

    renderPage()
    await screen.findByText('OFF-1001')

    expect(screen.getByRole('link', { name: 'Add Offer' })).toHaveAttribute(
      'href',
      '/provincial/offers/create',
    )
  })

  it('hides add offer link when createOffer action is not granted', async () => {
    mockedUseAuth.mockReturnValue({
      canPerform: () => false,
    } as any)

    renderPage()
    await screen.findByText('OFF-1001')

    expect(screen.queryByRole('link', { name: 'Add Offer' })).not.toBeInTheDocument()
  })

  it('disables search for invalid dates and updates search sort direction from header click', async () => {
    mockedUseAuth.mockReturnValue({
      canPerform: () => true,
    } as any)

    renderPage()
    await screen.findByText('OFF-1001')

    const searchButton = screen.getByRole('button', { name: 'Search' })
    expect(searchButton).toBeEnabled()

    await userEvent.type(screen.getByLabelText('Listing From Date (YYYY-MM-DD)'), '2026-50-99')
    await waitFor(() => {
      expect(searchButton).toBeDisabled()
    })

    await userEvent.clear(screen.getByLabelText('Listing From Date (YYYY-MM-DD)'))
    await userEvent.type(screen.getByLabelText('Listing From Date (YYYY-MM-DD)'), '2026-02-01')
    await waitFor(() => {
      expect(searchButton).toBeEnabled()
    })

    await userEvent.click(screen.getByRole('button', { name: 'Listing Date (ASC)' }))

    await waitFor(() => {
      expect(mockedSearchProvincialOffers).toHaveBeenCalledWith(
        expect.objectContaining({
          sortField: 'listingDate',
          sortDirection: 'desc',
        }),
      )
    })
  })
})
