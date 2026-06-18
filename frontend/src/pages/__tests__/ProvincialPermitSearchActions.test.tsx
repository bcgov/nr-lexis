import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import ProvincialPermitPage from '@/pages/ProvincialPermit'
import { clearAllPageDataCache } from '@/pages/shared/page-data-cache'
import { searchProvincialPermits } from '@/service/provincial-permit-search-service'
import { fetchProvincialPermitOptions } from '@/service/search-options-service'

vi.mock('@/context/auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/service/provincial-permit-search-service', () => ({
  searchProvincialPermits: vi.fn(),
}))

vi.mock('@/service/search-options-service', () => ({
  fetchProvincialPermitOptions: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)
const mockedSearchProvincialPermits = vi.mocked(searchProvincialPermits)
const mockedFetchProvincialPermitOptions = vi.mocked(fetchProvincialPermitOptions)

const renderPage = (initialEntry = '/provincial/permit') => {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/provincial/permit" element={<ProvincialPermitPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Provincial Permit Search Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearAllPageDataCache()
    mockedSearchProvincialPermits.mockResolvedValue({
      content: [
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
          permitStatus: 'Issued',
        },
      ],
      page: {
        number: 0,
        size: 10,
        totalElements: 1,
        totalPages: 1,
      },
    } as any)
    mockedFetchProvincialPermitOptions.mockResolvedValue({
      permitStatuses: [{ value: 'Issued', label: 'Issued' }],
      regions: [{ value: '11', label: 'Cariboo' }],
    })
  })

  it('shows add permit link only when createPermit action is granted', async () => {
    mockedUseAuth.mockReturnValue({
      canPerform: (action: string) => action === 'createPermit',
    } as any)

    renderPage()
    await screen.findByText('7001')

    expect(screen.getByRole('link', { name: 'Add Permit' })).toHaveAttribute(
      'href',
      '/provincial/permit/create',
    )
  })

  it('hides add permit link when createPermit action is not granted', async () => {
    mockedUseAuth.mockReturnValue({
      canPerform: () => false,
    } as any)

    renderPage()
    await screen.findByText('7001')

    expect(screen.queryByRole('link', { name: 'Add Permit' })).not.toBeInTheDocument()
  })

  it('does not default region filters when opened without query parameters', async () => {
    mockedUseAuth.mockReturnValue({
      canPerform: () => false,
    } as any)

    renderPage()
    await screen.findByText('7001')

    expect(mockedSearchProvincialPermits).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: expect.objectContaining({
          region: [],
        }),
      }),
    )
  })

  it('reuses cached search results when the route remounts with the same URL state', async () => {
    mockedUseAuth.mockReturnValue({
      canPerform: () => false,
    } as any)

    const firstRender = renderPage('/provincial/permit?permitNumber=7001')
    await screen.findByText('7001')
    expect(mockedSearchProvincialPermits).toHaveBeenCalledTimes(1)

    firstRender.unmount()
    renderPage('/provincial/permit?permitNumber=7001')

    await screen.findByText('7001')
    expect(mockedSearchProvincialPermits).toHaveBeenCalledTimes(1)
  })

  it('reuses the first search total when pagination changes page', async () => {
    mockedUseAuth.mockReturnValue({
      canPerform: () => false,
    } as any)
    mockedSearchProvincialPermits
      .mockResolvedValueOnce({
        content: [
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
        page: {
          number: 0,
          size: 10,
          totalElements: 25,
          totalPages: 3,
        },
      } as any)
      .mockResolvedValueOnce({
        content: [
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
        page: {
          number: 1,
          size: 10,
          totalElements: 25,
          totalPages: 3,
        },
      } as any)

    renderPage('/provincial/permit?permitNumber=7001')
    await screen.findByText('7001')

    await userEvent.click(screen.getByRole('button', { name: /next page/i }))

    await screen.findByText('7002')
    expect(mockedSearchProvincialPermits).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        page: 1,
        pageSize: 10,
      }),
      { knownTotal: 25 },
    )
  })

  it('disables search for invalid dates and requests descending sort when permit header is clicked', async () => {
    mockedUseAuth.mockReturnValue({
      canPerform: () => true,
    } as any)

    renderPage()
    await screen.findByText('7001')

    const searchButton = screen.getByRole('button', { name: 'Search' })
    expect(searchButton).toBeEnabled()

    await userEvent.type(screen.getByLabelText('Issued from date (YYYY-MM-DD)'), '2026-99-99')
    await waitFor(() => {
      expect(searchButton).toBeDisabled()
    })

    await userEvent.clear(screen.getByLabelText('Issued from date (YYYY-MM-DD)'))
    await userEvent.type(screen.getByLabelText('Issued from date (YYYY-MM-DD)'), '2026-02-01')
    await waitFor(() => {
      expect(searchButton).toBeEnabled()
    })

    await userEvent.click(screen.getByRole('button', { name: 'Permit (ASC)' }))

    await waitFor(() => {
      expect(mockedSearchProvincialPermits).toHaveBeenCalledWith(
        expect.objectContaining({
          sortField: 'permitNumber',
          sortDirection: 'desc',
        }),
      )
    })
  })
})
