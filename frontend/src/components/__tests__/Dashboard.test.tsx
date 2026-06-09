import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import Dashboard from '@/components/Dashboard'
import { useAuth } from '@/context/auth/useAuth'
import { countApplicationReviews } from '@/service/application-review-search-service'
import { countFederalApplications } from '@/service/federal-application-search-service'
import { countIndianReservePermits } from '@/service/indian-reserve-permit-search-service'
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

vi.mock('@/service/federal-application-search-service', () => ({
  countFederalApplications: vi.fn(),
}))

vi.mock('@/service/indian-reserve-permit-search-service', () => ({
  countIndianReservePermits: vi.fn(),
}))

describe('Dashboard', () => {
  const mockedUseAuth = vi.mocked(useAuth)
  const mockedCountProvincialApplications = vi.mocked(countProvincialApplications)
  const mockedCountProvincialExemptions = vi.mocked(countProvincialExemptions)
  const mockedCountProvincialOffers = vi.mocked(countProvincialOffers)
  const mockedCountProvincialPermits = vi.mocked(countProvincialPermits)
  const mockedCountApplicationReviews = vi.mocked(countApplicationReviews)
  const mockedCountFederalApplications = vi.mocked(countFederalApplications)
  const mockedCountIndianReservePermits = vi.mocked(countIndianReservePermits)

  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseAuth.mockReturnValue({
      canPerform: () => false,
    } as any)
    mockedCountProvincialApplications.mockResolvedValue(0)
    mockedCountProvincialExemptions.mockResolvedValue(0)
    mockedCountProvincialOffers.mockResolvedValue(0)
    mockedCountProvincialPermits.mockResolvedValue(0)
    mockedCountApplicationReviews.mockResolvedValue(0)
    mockedCountFederalApplications.mockResolvedValue(0)
    mockedCountIndianReservePermits.mockResolvedValue(0)
  })

  test('renders a heading with the correct text', () => {
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    )
    expect(screen.getByText(/LEXIS Dashboard/i)).toBeInTheDocument()
  })

  test('loads dashboard counts on mount and still supports explicit refresh', async () => {
    mockedUseAuth.mockReturnValue({
      canPerform: () => true,
    } as any)
    mockedCountProvincialApplications.mockResolvedValueOnce(456).mockResolvedValueOnce(789)

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    )

    expect(await screen.findByText('456')).toBeInTheDocument()

    await waitFor(() => {
      expect(mockedCountProvincialApplications).toHaveBeenCalledTimes(1)
    })

    await userEvent.click(screen.getByRole('button', { name: 'Refresh Dashboard' }))
    expect(await screen.findByText('789')).toBeInTheDocument()

    await waitFor(() => {
      expect(mockedCountProvincialApplications).toHaveBeenCalledTimes(2)
    })
  })

  test('hides inaccessible dashboard modules and quick actions', async () => {
    const allowedActions = new Set([
      '/summary',
      '/applicationSearch',
      '/exemptionSearch',
      '/offersSearch',
      '/permitSearch',
      '/applicationReport',
    ])
    mockedUseAuth.mockReturnValue({
      canPerform: (action: string) => allowedActions.has(action),
    } as any)

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Provincial Applications')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open Provincial Summary' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open Reports' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Open Review Queue' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Open Admin' })).not.toBeInTheDocument()
    expect(screen.queryByText('Provincial Review')).not.toBeInTheDocument()
    expect(screen.queryByText('Federal Applications')).not.toBeInTheDocument()
    expect(screen.queryByText('Indigenous Reserve Permits')).not.toBeInTheDocument()
    expect(screen.queryByText('Admin')).not.toBeInTheDocument()
    expect(screen.queryByText(/Accessible modules:/)).not.toBeInTheDocument()
    expect(screen.queryByText('Not Granted')).not.toBeInTheDocument()
  })
})
