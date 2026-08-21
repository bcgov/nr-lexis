import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import { useDefaultRegionPreference } from '@/pages/shared/useDefaultRegionPreference'
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

vi.mock('@/pages/shared/useDefaultRegionPreference', () => ({
  useDefaultRegionPreference: vi.fn(),
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
const mockedUseDefaultRegionPreference = vi.mocked(useDefaultRegionPreference)
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

const renderPage = (
  path = '/provincial/offers?region=11&page=1&pageSize=10&sortField=listingDate&sortDirection=asc',
) => {
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
    mockedUseDefaultRegionPreference.mockReturnValue({
      defaultRegion: null,
      preferenceLoading: false,
    })
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

  it('shows the add offer result action only when createOffer is granted', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        canPerform: (action: string) => action === 'createOffer',
      }),
    )

    renderPage()
    await screen.findByText('OFF-1001')

    const addOfferAction = screen.getByRole('link', { name: 'Add offer' })
    expect(addOfferAction).toHaveAttribute('href', '/provincial/offers/create')
    expect(addOfferAction).toHaveClass('cds--btn--primary')
    expect(addOfferAction.closest('.legacy-search-table-toolbar__actions')).not.toBeNull()
  })

  it('hides add offer link when createOffer action is not granted', async () => {
    mockedUseAuth.mockReturnValue(createTestAuthContext({ canPerform: () => false }))

    renderPage()
    await screen.findByText('OFF-1001')

    expect(screen.queryByRole('link', { name: 'Add offer' })).not.toBeInTheDocument()
  })

  it('opens without results or a search request when no search has been applied', async () => {
    mockedUseAuth.mockReturnValue(createTestAuthContext({ canPerform: () => false }))

    renderPage('/provincial/offers')
    await waitFor(() => {
      expect(mockedFetchProvincialOfferOptions).toHaveBeenCalledOnce()
    })

    expect(mockedSearchProvincialOffers).not.toHaveBeenCalled()
    const resultsTable = screen.getByRole('region', { name: 'Search results table', hidden: true })
    expect(resultsTable.closest('[hidden]')).toHaveStyle({ display: 'none' })
    expect(resultsTable).not.toBeVisible()
  })

  it('keeps the results loading while default search filters initialize', async () => {
    mockedUseAuth.mockReturnValue(createTestAuthContext({ canPerform: () => false }))
    let resolveApplicationOptions:
      | ((value: Awaited<ReturnType<typeof fetchProvincialApplicationOptions>>) => void)
      | undefined
    mockedFetchProvincialApplicationOptions.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveApplicationOptions = resolve
        }),
    )

    renderPage()

    expect(screen.getByRole('region', { name: 'Search results table' })).toHaveAttribute(
      'aria-busy',
      'true',
    )
    expect(screen.getByText('Loading offer search results…')).toBeVisible()
    expect(screen.queryByText('0 results found')).not.toBeInTheDocument()

    await act(async () => {
      resolveApplicationOptions?.({
        exemptionTypes: [],
        exemptionReasons: [],
        applicationStatuses: [],
        productTypes: [],
        growthTypes: [],
        regions: [],
        currentSchedules: [],
      })
    })

    expect(await screen.findByText('OFF-1001')).toBeVisible()
  })

  it('waits for explicit submission while text filters are typed', async () => {
    mockedUseAuth.mockReturnValue(createTestAuthContext({ canPerform: () => true }))

    renderPage()
    await screen.findByText('OFF-1001')
    await waitFor(() => {
      expect(mockedSearchProvincialOffers).toHaveBeenLastCalledWith(
        expect.objectContaining({
          filters: expect.objectContaining({ region: ['11'] }),
        }),
        expect.any(Object),
      )
    })
    mockedSearchProvincialOffers.mockClear()

    const applicationNumberInput = screen.getByLabelText('Application number')
    for (const value of ['4', '46', '460', '4605', '46053']) {
      fireEvent.change(applicationNumberInput, { target: { value } })
    }

    expect(applicationNumberInput).toHaveValue('46053')
    expect(mockedSearchProvincialOffers).not.toHaveBeenCalled()

    const searchButton = screen.getByRole('button', { name: 'Search' })
    expect(searchButton).toBeEnabled()
    expect(searchButton).toHaveAttribute('type', 'submit')
    expect(searchButton.closest('form')).toBeValid()
    await userEvent.click(searchButton)

    await waitFor(() => {
      expect(mockedSearchProvincialOffers).toHaveBeenCalledTimes(1)
      expect(mockedSearchProvincialOffers).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: expect.objectContaining({ applicationNumber: '46053' }),
        }),
        expect.any(Object),
      )
    })
  })

  it('defaults the listing date without applying a region filter', async () => {
    mockedUseAuth.mockReturnValue(createTestAuthContext({ canPerform: () => false }))
    mockedFetchProvincialOfferOptions.mockResolvedValueOnce({
      regions: [
        { value: '11', label: 'Cariboo' },
        { value: '22', label: 'Coast' },
      ],
    })
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

    renderPage('/provincial/offers')

    await waitFor(() => {
      expect(screen.getByLabelText('Listing to date')).toHaveValue('2026-07-11')
    })
    expect(
      screen.getByRole('combobox', { name: /^Region\s*Total items selected:\s*0/ }),
    ).toBeVisible()
    expect(mockedSearchProvincialOffers).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Search' }))

    await waitFor(() => {
      expect(mockedSearchProvincialOffers).toHaveBeenLastCalledWith(
        expect.objectContaining({
          filters: expect.objectContaining({
            listingToDate: '2026-07-11',
            region: [],
          }),
        }),
        expect.objectContaining({ knownTotal: expect.any(Number) }),
      )
    })
  })

  it('uses the saved region to preselect offer search areas', async () => {
    mockedUseAuth.mockReturnValue(createTestAuthContext({ canPerform: () => false }))
    mockedUseDefaultRegionPreference.mockReturnValue({
      defaultRegion: 'RCO',
      preferenceLoading: false,
    })
    mockedFetchProvincialOfferOptions.mockResolvedValueOnce({
      regions: [
        { value: '1903', label: 'Cariboo' },
        { value: '1909', label: 'South Coast' },
        { value: '1910', label: 'West Coast' },
      ],
    })

    renderPage('/provincial/offers')

    expect(
      await screen.findByRole('combobox', { name: /^Region\s*Total items selected:\s*2/ }),
    ).toBeVisible()
    expect(screen.queryByRole('list', { name: 'Selected regions' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Search' }))
    await waitFor(() => {
      expect(mockedSearchProvincialOffers).toHaveBeenLastCalledWith(
        expect.objectContaining({
          filters: expect.objectContaining({ region: ['1909', '1910'] }),
        }),
        expect.objectContaining({ knownTotal: expect.any(Number) }),
      )
    })
  })

  it('restores defaults and removes results without searching again', async () => {
    mockedUseAuth.mockReturnValue(createTestAuthContext({ canPerform: () => false }))
    mockedFetchProvincialApplicationOptions.mockResolvedValueOnce({
      exemptionTypes: [],
      exemptionReasons: [],
      applicationStatuses: [],
      productTypes: [],
      growthTypes: [],
      regions: [],
      currentSchedules: [{ value: '987', label: '2026-07-11' }],
    })

    renderPage('/provincial/offers')
    await waitFor(() => {
      expect(screen.getByLabelText('Listing to date')).toHaveValue('2026-07-11')
    })
    await userEvent.click(screen.getByRole('button', { name: 'Search' }))
    await screen.findByText('OFF-1001')

    await userEvent.type(screen.getByLabelText('Application number'), '46053')
    await userEvent.clear(screen.getByLabelText('Listing to date'))
    const resultsTable = screen.getByRole('region', { name: 'Search results table' })
    const searchCallsBeforeClear = mockedSearchProvincialOffers.mock.calls.length
    await userEvent.click(screen.getByRole('button', { name: 'Clear all' }))

    await waitFor(() => {
      expect(screen.getByLabelText('Application number')).toHaveValue('')
      expect(screen.getByLabelText('Listing to date')).toHaveValue('2026-07-11')
      expect(resultsTable).not.toBeVisible()
    })
    expect(mockedSearchProvincialOffers).toHaveBeenCalledTimes(searchCallsBeforeClear)
  })

  it('shows selected offer search regions in the default Carbon multi-select', async () => {
    mockedUseAuth.mockReturnValue(createTestAuthContext({ canPerform: () => true }))
    mockedFetchProvincialOfferOptions.mockResolvedValueOnce({
      regions: [
        { value: '1903', label: 'Cariboo Natural Resource Region' },
        { value: '1908', label: 'Skeena Natural Resource Region' },
      ],
    })

    renderPage('/provincial/offers?region=1903,1908')
    await screen.findByText('OFF-1001')

    expect(
      await screen.findByRole('combobox', { name: /^Region\s*Total items selected:\s*2/ }),
    ).toBeVisible()
    expect(screen.queryByRole('list', { name: 'Selected regions' })).not.toBeInTheDocument()
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
