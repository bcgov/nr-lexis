import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import type { ProvincialOfferSearchResponse } from '@/interfaces/ProvincialOfferSearch'
import ProvincialOffersPage from '@/pages/ProvincialOffers'
import { searchProvincialOffers } from '@/service/provincial-offer-search-service'
import {
  fetchProvincialApplicationOptions,
  fetchProvincialOfferOptions,
} from '@/service/search-options-service'
import { createTestAuthContext } from '@/test-utils/auth'

vi.mock('@/context/auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/service/provincial-offer-search-service', () => ({
  searchProvincialOffers: vi.fn(),
}))

vi.mock('@/service/search-options-service', () => ({
  fetchProvincialApplicationOptions: vi.fn(),
  fetchProvincialOfferOptions: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)
const mockedSearchProvincialOffers = vi.mocked(searchProvincialOffers)
const mockedFetchProvincialApplicationOptions = vi.mocked(fetchProvincialApplicationOptions)
const mockedFetchProvincialOfferOptions = vi.mocked(fetchProvincialOfferOptions)

const offerSearchResponse = (
  content: ProvincialOfferSearchResponse['content'],
): ProvincialOfferSearchResponse => ({
  content,
  page: {
    number: 0,
    size: 10,
    totalElements: content.length,
    totalPages: content.length > 0 ? 1 : 0,
  },
})

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
    mockedFetchProvincialApplicationOptions.mockResolvedValue({
      exemptionTypes: [],
      exemptionReasons: [],
      applicationStatuses: [],
      productTypes: [],
      growthTypes: [],
      regions: [],
      currentSchedules: [],
    })
    mockedSearchProvincialOffers.mockResolvedValue(
      offerSearchResponse([
        {
          offerNumber: 'OFF-1001',
          applicationNumber: '3001',
          packageNumber: 'PKG-1',
          listingDate: '2026-01-10',
          region: '11',
          offerWithdrawalDate: '',
          clientNumber: '11111111',
        },
      ]),
    )
  })

  it('shows add offer link only when createOffer action is granted', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        canPerform: (action: string) => action === 'createOffer',
      }),
    )

    renderPage()
    await screen.findByText('OFF-1001')

    expect(screen.getByRole('link', { name: 'Add Offer' })).toHaveAttribute(
      'href',
      '/provincial/offers/create',
    )
  })

  it('hides add offer link when createOffer action is not granted', async () => {
    mockedUseAuth.mockReturnValue(createTestAuthContext({ canPerform: () => false }))

    renderPage()
    await screen.findByText('OFF-1001')

    expect(screen.queryByRole('link', { name: 'Add Offer' })).not.toBeInTheDocument()
  })

  it('does not default region filters when opened without query parameters', async () => {
    mockedUseAuth.mockReturnValue(createTestAuthContext({ canPerform: () => false }))

    renderPage()
    await screen.findByText('OFF-1001')

    expect(mockedSearchProvincialOffers).toHaveBeenLastCalledWith(
      expect.objectContaining({
        filters: expect.objectContaining({
          region: [],
        }),
      }),
    )
  })

  it('disables search for invalid dates and updates search sort direction from header click', async () => {
    mockedUseAuth.mockReturnValue(createTestAuthContext({ canPerform: () => true }))

    renderPage()
    await screen.findByText('OFF-1001')

    const searchButton = screen.getByRole('button', { name: 'Search' })
    expect(searchButton).toBeEnabled()

    await userEvent.type(screen.getByLabelText('Listing from date (YYYY-MM-DD)'), '2026-50-99')
    await waitFor(() => {
      expect(searchButton).toBeDisabled()
    })

    await userEvent.clear(screen.getByLabelText('Listing from date (YYYY-MM-DD)'))
    await userEvent.type(screen.getByLabelText('Listing from date (YYYY-MM-DD)'), '2026-02-01')
    await waitFor(() => {
      expect(searchButton).toBeEnabled()
    })

    await userEvent.click(screen.getByRole('button', { name: 'Listing date (ASC)' }))

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
