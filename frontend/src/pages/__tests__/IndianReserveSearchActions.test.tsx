import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import IndianReservePage from '@/pages/IndianReserve'
import { searchIndianReservePermits } from '@/service/indian-reserve-permit-search-service'

vi.mock('@/context/auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/service/indian-reserve-permit-search-service', () => ({
  searchIndianReservePermits: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)
const mockedSearchIndianReservePermits = vi.mocked(searchIndianReservePermits)

const renderPage = () => {
  render(
    <MemoryRouter initialEntries={['/indian-reserve']}>
      <Routes>
        <Route path="/indian-reserve" element={<IndianReservePage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Indigenous Reserve Search Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedSearchIndianReservePermits.mockResolvedValue({
      content: [
        {
          permitNumber: 'IR-1001',
          clientNumber: '12345678',
          issueDate: '2026-02-01',
          shippingDate: '2026-02-15',
          packageNumber: 'PKG-1',
        },
      ],
      page: {
        number: 0,
        size: 10,
        totalElements: 1,
        totalPages: 1,
      },
    })
  })

  it('shows add permit link when user has OIC application and permit detail access', async () => {
    mockedUseAuth.mockReturnValue({
      canPerform: (action: string) =>
        action === 'viewOICApplication' || action === '/indianReservePermitDetails',
    } as any)

    renderPage()
    await screen.findByText('IR-1001')

    expect(screen.getByRole('link', { name: 'Add Permit' })).toHaveAttribute(
      'href',
      '/indian-reserve/permit/create',
    )
  })

  it('hides add permit link when user lacks OIC application access', async () => {
    mockedUseAuth.mockReturnValue({
      canPerform: (action: string) => action === '/indianReservePermitDetails',
    } as any)

    renderPage()
    await screen.findByText('IR-1001')

    expect(screen.queryByRole('link', { name: 'Add Permit' })).not.toBeInTheDocument()
  })

  it('hides add permit link when user lacks permit detail access', async () => {
    mockedUseAuth.mockReturnValue({
      canPerform: (action: string) => action === 'viewOICApplication',
    } as any)

    renderPage()
    await screen.findByText('IR-1001')

    expect(screen.queryByRole('link', { name: 'Add Permit' })).not.toBeInTheDocument()
  })

  it('disables search for invalid date input and reapplies search on sort change', async () => {
    mockedUseAuth.mockReturnValue({
      canPerform: () => true,
    } as any)

    renderPage()
    await screen.findByText('IR-1001')

    const searchButton = screen.getByRole('button', { name: 'Search' })
    expect(searchButton).toBeEnabled()

    await userEvent.type(screen.getByLabelText('Issued from date (YYYY-MM-DD)'), '2026-13-50')
    await waitFor(() => {
      expect(searchButton).toBeDisabled()
    })

    await userEvent.clear(screen.getByLabelText('Issued from date (YYYY-MM-DD)'))
    await userEvent.type(screen.getByLabelText('Issued from date (YYYY-MM-DD)'), '2026-03-10')
    await waitFor(() => {
      expect(searchButton).toBeEnabled()
    })

    await userEvent.click(screen.getByRole('button', { name: 'Permit (ASC)' }))

    await waitFor(() => {
      expect(mockedSearchIndianReservePermits).toHaveBeenCalledWith(
        expect.objectContaining({
          sortField: 'permitNumber',
          sortDirection: 'desc',
        }),
      )
    })
  })
})
