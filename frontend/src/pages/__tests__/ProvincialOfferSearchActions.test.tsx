import { render, screen, waitFor, within } from '@testing-library/react'
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
  countProvincialOffers: vi.fn(),
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

const renderPage = (path = '/provincial/offers') => {
  render(
    <MemoryRouter initialEntries={[path]}>
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
      expect.objectContaining({ knownTotal: expect.any(Number) }),
    )
  })

  it('defaults listing to date from the first list-date label and leaves blank last', async () => {
    mockedUseAuth.mockReturnValue(createTestAuthContext({ canPerform: () => false }))
    mockedFetchProvincialApplicationOptions.mockResolvedValueOnce({
      exemptionTypes: [],
      exemptionReasons: [],
      applicationStatuses: [],
      productTypes: [],
      growthTypes: [],
      regions: [],
      currentSchedules: [
        { value: '987', label: '2026-07-11' },
        { value: '988', label: '2026-07-25' },
        { value: '', label: 'Blank' },
      ],
    })

    renderPage()
    await screen.findByText('OFF-1001')

    await waitFor(() => {
      expect(mockedSearchProvincialOffers).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: expect.objectContaining({
            listingToDate: '2026-07-11',
          }),
        }),
        expect.objectContaining({ knownTotal: expect.any(Number) }),
      )
    })
  })

  it('shows selected offer search regions as removable pills', async () => {
    mockedUseAuth.mockReturnValue(createTestAuthContext({ canPerform: () => true }))
    mockedFetchProvincialOfferOptions.mockResolvedValueOnce({
      regions: [
        { value: '1903', label: 'Cariboo Natural Resource Region' },
        { value: '1908', label: 'Skeena Natural Resource Region' },
      ],
    })

    renderPage('/provincial/offers?region=1903,1908')
    await screen.findByText('OFF-1001')

    const selectedRegions = await screen.findByRole('list', { name: 'Selected regions' })
    expect(within(selectedRegions).getByText('Cariboo Natural Resource Region')).toBeVisible()
    expect(within(selectedRegions).getByText('Skeena Natural Resource Region')).toBeVisible()
  })

  it('disables search for invalid dates and updates search sort direction from header click', async () => {
    mockedUseAuth.mockReturnValue(createTestAuthContext({ canPerform: () => true }))

    renderPage()
    await screen.findByText('OFF-1001')

    const searchButton = screen.getByRole('button', { name: 'Search' })
    expect(searchButton).toBeEnabled()

    await userEvent.type(screen.getByLabelText('Listing from date'), '2026-50-99')
    await waitFor(() => {
      expect(searchButton).toBeDisabled()
    })

    await userEvent.clear(screen.getByLabelText('Listing from date'))
    await userEvent.type(screen.getByLabelText('Listing from date'), '2026-02-01')
    await waitFor(() => {
      expect(searchButton).toBeEnabled()
    })

    await userEvent.click(screen.getByRole('button', { name: 'Listing date' }))

    await waitFor(() => {
      expect(
        mockedSearchProvincialOffers.mock.calls.some(
          ([request]) => request.sortField === 'listingDate' && request.sortDirection === 'desc',
        ),
      ).toBe(true)
    })
  })

  it('shows a request failure instead of a no-results state', async () => {
    mockedUseAuth.mockReturnValue(createTestAuthContext({ canPerform: () => true }))
    mockedSearchProvincialOffers.mockRejectedValue(new Error('Oracle unavailable'))

    renderPage()

    expect(
      await screen.findByRole('heading', { name: 'Offer search unavailable' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Unable to retrieve offer search results.')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'No offers found' })).not.toBeInTheDocument()
  })
})
