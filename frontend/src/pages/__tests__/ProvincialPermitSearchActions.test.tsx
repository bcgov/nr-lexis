import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import { useDefaultRegionPreference } from '@/pages/shared/useDefaultRegionPreference'
import type { ProvincialPermitSearchResponse } from '@/interfaces/ProvincialPermitSearch'
import ProvincialPermitPage from '@/pages/ProvincialPermit'
import { clearAllPageDataCache } from '@/pages/shared/page-data-cache'
import {
  countProvincialPermits,
  searchProvincialPermits,
} from '@/service/provincial-permit-search-service'
import { fetchProvincialPermitOptions } from '@/service/search-options-service'
import { createTestAuthContext } from '@/test-utils/auth'

vi.mock('@/context/auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/pages/shared/useDefaultRegionPreference', () => ({
  useDefaultRegionPreference: vi.fn(),
}))

vi.mock('@/service/provincial-permit-search-service', () => ({
  countProvincialPermits: vi.fn(),
  searchProvincialPermits: vi.fn(),
}))

vi.mock('@/service/search-options-service', () => ({
  fetchProvincialPermitOptions: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)
const mockedUseDefaultRegionPreference = vi.mocked(useDefaultRegionPreference)
const mockedCountProvincialPermits = vi.mocked(countProvincialPermits)
const mockedSearchProvincialPermits = vi.mocked(searchProvincialPermits)
const mockedFetchProvincialPermitOptions = vi.mocked(fetchProvincialPermitOptions)

const permitSearchResponse = (
  content: ProvincialPermitSearchResponse['content'],
  page: Partial<ProvincialPermitSearchResponse['page']> = {},
): ProvincialPermitSearchResponse => ({
  content,
  page: {
    number: 0,
    size: 10,
    totalElements: content.length,
    totalPages: content.length > 0 ? 1 : 0,
    ...page,
  },
})

const PermitSearchLocation = () => {
  const location = useLocation()
  return <output data-testid="permit-search-location">{location.search}</output>
}

const renderPage = (
  initialEntry = '/provincial/permit?region=11&page=1&pageSize=10&sortField=permitNumber&sortDirection=desc',
) => {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route
          path="/provincial/permit"
          element={
            <>
              <ProvincialPermitPage />
              <PermitSearchLocation />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Provincial Permit Search Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseDefaultRegionPreference.mockReturnValue({
      defaultRegion: null,
      preferenceLoading: false,
    })
    clearAllPageDataCache()
    mockedSearchProvincialPermits.mockResolvedValue(
      permitSearchResponse([
        {
          permitNumber: '7001',
          status: 'Issued',
          applicantClientNumber: '11111111',
          ownerClientNumber: '22222222',
          totalVolume: 120,
          issueDate: '2026-01-10',
          region: '11',
          packageNumber: 'PKG-1',
          applicationNumber: '3001',
        },
      ]),
    )
    mockedFetchProvincialPermitOptions.mockResolvedValue({
      permitStatuses: [{ value: 'Issued', label: 'Issued' }],
      regions: [{ value: '11', label: 'Cariboo' }],
    })
  })

  it('does not expose the retired add permit link', async () => {
    mockedUseAuth.mockReturnValue(createTestAuthContext({ canPerform: () => true }))

    renderPage()
    await screen.findByText('7001')

    expect(screen.queryByRole('link', { name: 'Add Permit' })).not.toBeInTheDocument()
  })

  it('marks active permits as pending without changing the detail route', async () => {
    mockedUseAuth.mockReturnValue(createTestAuthContext({ canPerform: () => false }))
    mockedSearchProvincialPermits.mockResolvedValue(
      permitSearchResponse([
        {
          permitNumber: '9020935',
          status: 'Active',
          applicantClientNumber: '11111111',
          ownerClientNumber: '22222222',
          totalVolume: 120,
          issueDate: '2026-01-10',
          region: '11',
          packageNumber: 'PKG-1',
          applicationNumber: '3001',
        },
      ]),
    )

    renderPage()

    expect(await screen.findByRole('link', { name: '9020935 (Pending)' })).toHaveAttribute(
      'href',
      '/provincial/permit/9020935?region=11&page=1&pageSize=10&sortField=permitNumber&sortDirection=desc',
    )
  })

  it('leaves regions unfiltered without searching when no search has been applied', async () => {
    mockedUseAuth.mockReturnValue(createTestAuthContext({ canPerform: () => false }))

    renderPage('/provincial/permit')
    await waitFor(() => {
      expect(mockedFetchProvincialPermitOptions).toHaveBeenCalledOnce()
    })

    expect(
      await screen.findByRole('combobox', { name: /^Region\s*Total items selected:\s*0/ }),
    ).toBeVisible()
    expect(mockedSearchProvincialPermits).not.toHaveBeenCalled()
    const resultsTable = screen.getByRole('region', { name: 'Search results table', hidden: true })
    expect(resultsTable.closest('[hidden]')).toHaveStyle({ display: 'none' })
    expect(resultsTable).not.toBeVisible()
  })

  it('uses the saved region to preselect permit search areas', async () => {
    mockedUseAuth.mockReturnValue(createTestAuthContext({ canPerform: () => false }))
    mockedUseDefaultRegionPreference.mockReturnValue({
      defaultRegion: 'RSI',
      preferenceLoading: false,
    })
    mockedFetchProvincialPermitOptions.mockResolvedValueOnce({
      permitStatuses: [],
      regions: [
        { value: '1903', label: 'Cariboo' },
        { value: '1904', label: 'Kootenay-Boundary' },
        { value: '1905', label: 'Northeast' },
        { value: '1907', label: 'Thompson-Okanagan' },
      ],
    })

    renderPage('/provincial/permit')

    expect(
      await screen.findByRole('combobox', { name: /^Region\s*Total items selected:\s*3/ }),
    ).toBeVisible()
    expect(screen.queryByRole('list', { name: 'Selected regions' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Search' }))
    await waitFor(() => {
      expect(mockedSearchProvincialPermits).toHaveBeenLastCalledWith(
        expect.objectContaining({
          filters: expect.objectContaining({ region: ['1903', '1904', '1907'] }),
        }),
        expect.objectContaining({ knownTotal: expect.any(Number) }),
      )
    })
  })

  it('keeps the table loading until the exact result count is available', async () => {
    mockedUseAuth.mockReturnValue(createTestAuthContext({ canPerform: () => false }))
    const rows = Array.from({ length: 10 }, (_, index) => ({
      permitNumber: String(7001 + index),
      status: 'Issued' as const,
      applicantClientNumber: '11111111',
      ownerClientNumber: '22222222',
      totalVolume: 120,
      issueDate: '2026-01-10',
      region: '11',
      packageNumber: `PKG-${index + 1}`,
      applicationNumber: String(3001 + index),
    }))
    mockedSearchProvincialPermits.mockResolvedValueOnce(
      permitSearchResponse(rows, {
        totalElements: 11,
        totalPages: 2,
      }),
    )
    let resolveCount!: (total: number) => void
    mockedCountProvincialPermits.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveCount = resolve
      }),
    )

    renderPage()

    await waitFor(() => expect(mockedCountProvincialPermits).toHaveBeenCalledOnce())
    expect(screen.getByText('Loading permit search results…')).toBeInTheDocument()
    expect(screen.queryByText('11 results found')).not.toBeInTheDocument()
    expect(screen.queryByText('7001')).not.toBeInTheDocument()

    await act(async () => {
      resolveCount(125)
    })

    expect(await screen.findByText('125 results found')).toBeInTheDocument()
    expect(screen.getByText('7001')).toBeInTheDocument()
  })

  it('waits for explicit submission while text filters are typed', async () => {
    mockedUseAuth.mockReturnValue(createTestAuthContext({ canPerform: () => true }))

    renderPage()
    await screen.findByText('7001')
    mockedSearchProvincialPermits.mockClear()

    const applicationNumberInput = screen.getByLabelText('Application number')
    for (const value of ['4', '46', '460', '4605', '46053']) {
      fireEvent.change(applicationNumberInput, { target: { value } })
    }

    expect(mockedSearchProvincialPermits).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Search' }))

    await waitFor(() => {
      expect(mockedSearchProvincialPermits).toHaveBeenCalledTimes(1)
      expect(mockedSearchProvincialPermits).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: expect.objectContaining({ applicationNumber: '46053' }),
        }),
        expect.any(Object),
      )
    })
  })

  it('submits the invoice number to URL-backed filters and clears it with the form', async () => {
    mockedUseAuth.mockReturnValue(createTestAuthContext({ canPerform: () => false }))

    renderPage(
      '/provincial/permit?invoiceNumber=SI-99881&region=11&sortField=permitStatus&sortDirection=desc&page=3&pageSize=25',
    )

    const invoiceNumber = await screen.findByLabelText('Invoice number')
    expect(invoiceNumber).toHaveValue('SI-99881')
    await waitFor(() => {
      expect(
        mockedSearchProvincialPermits.mock.calls.some(
          ([request]) => request.filters.invoiceNumber === 'SI-99881',
        ),
      ).toBe(true)
    })

    mockedSearchProvincialPermits.mockClear()
    fireEvent.change(invoiceNumber, { target: { value: 'GBMS-4402' } })
    let currentParams = new URLSearchParams(
      screen.getByTestId('permit-search-location').textContent ?? '',
    )
    expect(currentParams.get('invoiceNumber')).toBe('SI-99881')
    expect(currentParams.get('page')).toBe('3')
    expect(mockedSearchProvincialPermits).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Search' }))

    await waitFor(() => {
      currentParams = new URLSearchParams(
        screen.getByTestId('permit-search-location').textContent ?? '',
      )
      expect(currentParams.get('invoiceNumber')).toBe('GBMS-4402')
      expect(currentParams.get('page')).toBe('1')
      expect(
        mockedSearchProvincialPermits.mock.calls.some(
          ([request]) => request.filters.invoiceNumber === 'GBMS-4402',
        ),
      ).toBe(true)
    })

    await userEvent.click(screen.getByRole('button', { name: 'Clear all' }))

    expect(invoiceNumber).toHaveValue('')
    await waitFor(() => {
      const currentParams = new URLSearchParams(
        screen.getByTestId('permit-search-location').textContent ?? '',
      )
      expect(currentParams.has('invoiceNumber')).toBe(false)
      expect(currentParams.has('region')).toBe(false)
      expect(currentParams.get('sortField')).toBe('permitNumber')
      expect(currentParams.get('sortDirection')).toBe('desc')
      expect(currentParams.get('page')).toBe('1')
      expect(currentParams.get('pageSize')).toBe('10')
    })
    await waitFor(() => {
      const lastRequest = mockedSearchProvincialPermits.mock.calls.at(-1)?.[0]
      expect(lastRequest?.filters.invoiceNumber).toBe('')
    })
  })

  it('reuses cached search results when the route remounts with the same URL state', async () => {
    mockedUseAuth.mockReturnValue(createTestAuthContext({ canPerform: () => false }))

    const firstRender = renderPage('/provincial/permit?permitNumber=7001&region=11')
    await screen.findByText('7001')
    expect(mockedSearchProvincialPermits).toHaveBeenCalledTimes(1)

    firstRender.unmount()
    renderPage('/provincial/permit?permitNumber=7001&region=11')

    await screen.findByText('7001')
    expect(mockedSearchProvincialPermits).toHaveBeenCalledTimes(1)
  })

  it('renders the latest search response when the cache is invalidated in flight', async () => {
    mockedUseAuth.mockReturnValue(createTestAuthContext({ canPerform: () => false }))
    let resolveSearch: (response: ProvincialPermitSearchResponse) => void = () => {}
    mockedSearchProvincialPermits.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSearch = resolve
      }),
    )

    renderPage('/provincial/permit?permitStatus=Issued&region=11')
    await waitFor(() => expect(mockedSearchProvincialPermits).toHaveBeenCalledTimes(1))

    clearAllPageDataCache()
    await act(async () => {
      resolveSearch(
        permitSearchResponse([
          {
            permitNumber: '7001',
            status: 'Issued',
            applicantClientNumber: '11111111',
            ownerClientNumber: '22222222',
            totalVolume: 120,
            issueDate: '2026-01-10',
            region: '11',
            packageNumber: 'PKG-1',
            applicationNumber: '3001',
          },
        ]),
      )
    })

    expect(await screen.findByText('7001')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'No permits found' })).not.toBeInTheDocument()
  })

  it('reuses the first search total when pagination changes page', async () => {
    mockedUseAuth.mockReturnValue(createTestAuthContext({ canPerform: () => false }))
    mockedSearchProvincialPermits
      .mockResolvedValueOnce(
        permitSearchResponse(
          [
            {
              permitNumber: '7001',
              status: 'Issued',
              applicantClientNumber: '11111111',
              ownerClientNumber: '22222222',
              totalVolume: 120,
              issueDate: '2026-01-10',
              region: '11',
              packageNumber: 'PKG-1',
              applicationNumber: '3001',
            },
          ],
          {
            totalElements: 125,
            totalPages: 2,
          },
        ),
      )
      .mockResolvedValueOnce(
        permitSearchResponse(
          [
            {
              permitNumber: '7002',
              status: 'Issued',
              applicantClientNumber: '11111111',
              ownerClientNumber: '22222222',
              totalVolume: 130,
              issueDate: '2026-01-11',
              region: '11',
              packageNumber: 'PKG-2',
              applicationNumber: '3002',
            },
          ],
          {
            number: 1,
            totalElements: 125,
            totalPages: 2,
          },
        ),
      )

    renderPage('/provincial/permit?permitNumber=7001&region=11')
    await screen.findByText('7001')

    await userEvent.click(screen.getByRole('button', { name: /next page/i }))

    await screen.findByText('7002')
    expect(mockedSearchProvincialPermits).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        page: 1,
        pageSize: 10,
      }),
      { knownTotal: 125 },
    )
  })

  it('shows selected permit search regions in the default Carbon multi-select', async () => {
    mockedUseAuth.mockReturnValue(createTestAuthContext({ canPerform: () => true }))
    mockedFetchProvincialPermitOptions.mockResolvedValueOnce({
      permitStatuses: [{ value: 'Issued', label: 'Issued' }],
      regions: [
        { value: '1903', label: 'Cariboo Natural Resource Region' },
        { value: '1908', label: 'Skeena Natural Resource Region' },
      ],
    })

    renderPage('/provincial/permit?region=1903,1908')
    await screen.findByText('7001')

    expect(
      await screen.findByRole('combobox', { name: /^Region\s*Total items selected:\s*2/ }),
    ).toBeVisible()
    expect(screen.queryByRole('list', { name: 'Selected regions' })).not.toBeInTheDocument()
  })

  it('disables search for invalid dates and requests descending sort when permit header is clicked', async () => {
    mockedUseAuth.mockReturnValue(createTestAuthContext({ canPerform: () => true }))

    renderPage()
    await screen.findByText('7001')

    const searchButton = screen.getByRole('button', { name: 'Search' })
    expect(searchButton).toBeEnabled()

    const issuedFromDate = screen.getByLabelText('Issued from date')
    fireEvent.change(issuedFromDate, { target: { value: '2026-99-99' } })
    await waitFor(() => {
      expect(searchButton).toBeDisabled()
    })

    fireEvent.change(issuedFromDate, { target: { value: '' } })
    fireEvent.change(issuedFromDate, { target: { value: '2026-02-01' } })
    await waitFor(() => {
      expect(searchButton).toBeEnabled()
    })

    await userEvent.click(screen.getByRole('button', { name: 'Permit' }))

    await waitFor(() => {
      expect(
        mockedSearchProvincialPermits.mock.calls.some(
          ([request]) => request.sortField === 'permitNumber' && request.sortDirection === 'asc',
        ),
      ).toBe(true)
    })
  })

  it.each([
    ['Status', 'permitStatus'],
    ['Total volume (m³)', 'permitVolume'],
    ['Issue date', 'dateIssued'],
  ] as const)(
    'sends the supported backend sort key when the %s header is clicked',
    async (header, expectedSortField) => {
      mockedUseAuth.mockReturnValue(createTestAuthContext({ canPerform: () => true }))

      renderPage()
      await screen.findByText('7001')

      await userEvent.click(screen.getByRole('button', { name: header }))

      await waitFor(() => {
        expect(
          mockedSearchProvincialPermits.mock.calls.some(
            ([request]) =>
              request.sortField === expectedSortField && request.sortDirection === 'asc',
          ),
        ).toBe(true)
      })
    },
  )

  it('shows a request failure instead of a no-results state', async () => {
    mockedUseAuth.mockReturnValue(createTestAuthContext({ canPerform: () => true }))
    mockedSearchProvincialPermits.mockRejectedValue(new Error('Oracle unavailable'))

    renderPage()

    expect(
      await screen.findByRole('heading', { name: 'Permit search unavailable' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Unable to retrieve permit search results.')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'No permits found' })).not.toBeInTheDocument()
  })
})
