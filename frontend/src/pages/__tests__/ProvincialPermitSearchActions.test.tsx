import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import type { ProvincialPermitSearchResponse } from '@/interfaces/ProvincialPermitSearch'
import ProvincialPermitPage from '@/pages/ProvincialPermit'
import { clearAllPageDataCache } from '@/pages/shared/page-data-cache'
import { searchProvincialPermits } from '@/service/provincial-permit-search-service'
import { fetchProvincialPermitOptions } from '@/service/search-options-service'
import { createTestAuthContext } from '@/test-utils/auth'

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

const permitSearchResponse = (
  content: ProvincialPermitSearchResponse['content'],
  page: Partial<ProvincialPermitSearchResponse['page']> = {},
): ProvincialPermitSearchResponse => ({
  content,
  page: {
    number: 0,
    size: 100,
    totalElements: content.length,
    totalPages: content.length > 0 ? 1 : 0,
    ...page,
  },
})

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

  it('does not default region filters when opened without query parameters', async () => {
    mockedUseAuth.mockReturnValue(createTestAuthContext({ canPerform: () => false }))

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
    mockedUseAuth.mockReturnValue(createTestAuthContext({ canPerform: () => false }))

    const firstRender = renderPage('/provincial/permit?permitNumber=7001')
    await screen.findByText('7001')
    expect(mockedSearchProvincialPermits).toHaveBeenCalledTimes(1)

    firstRender.unmount()
    renderPage('/provincial/permit?permitNumber=7001')

    await screen.findByText('7001')
    expect(mockedSearchProvincialPermits).toHaveBeenCalledTimes(1)
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

    renderPage('/provincial/permit?permitNumber=7001')
    await screen.findByText('7001')

    await userEvent.click(screen.getByRole('button', { name: /next page/i }))

    await screen.findByText('7002')
    expect(mockedSearchProvincialPermits).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        page: 1,
        pageSize: 100,
      }),
      { knownTotal: 125 },
    )
  })

  it('shows selected permit search region names instead of only the selected count', async () => {
    mockedUseAuth.mockReturnValue(createTestAuthContext({ canPerform: () => true }))
    mockedFetchProvincialPermitOptions.mockResolvedValueOnce({
      permitStatuses: [{ value: 'Issued', label: 'Issued' }],
      regions: [
        { value: '1903', label: 'Cariboo Natural Resource Region' },
        { value: '1908', label: 'Skeena Natural Resource Region' },
      ],
    })

    renderPage()
    await screen.findByText('7001')

    const regionComboBox = screen.getByRole('combobox', { name: /^Region/ })
    await userEvent.click(regionComboBox)
    fireEvent.change(regionComboBox, { target: { value: 'Cariboo' } })
    await userEvent.click(
      await screen.findByRole('option', { name: 'Cariboo Natural Resource Region' }),
    )
    await userEvent.click(regionComboBox)
    fireEvent.change(regionComboBox, { target: { value: 'Skeena' } })
    await userEvent.click(
      await screen.findByRole('option', { name: 'Skeena Natural Resource Region' }),
    )

    expect(
      await screen.findByText(
        'Selected: Cariboo Natural Resource Region, Skeena Natural Resource Region',
      ),
    ).toBeInTheDocument()
  })

  it('disables search for invalid dates and requests descending sort when permit header is clicked', async () => {
    mockedUseAuth.mockReturnValue(createTestAuthContext({ canPerform: () => true }))

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
      expect(
        mockedSearchProvincialPermits.mock.calls.some(
          ([request]) => request.sortField === 'permitNumber' && request.sortDirection === 'desc',
        ),
      ).toBe(true)
    })
  })
})
