import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import ProvincialSummaryPage from '@/pages/ProvincialSummary'
import {
  countApplicationReviews,
  previewApplicationReviews,
} from '@/service/application-review-search-service'
import { countFederalApplications } from '@/service/federal-application-search-service'
import { countIndianReservePermits } from '@/service/indian-reserve-permit-search-service'
import { countProvincialApplications } from '@/service/provincial-application-search-service'
import { countProvincialExemptions } from '@/service/provincial-exemption-search-service'
import { countProvincialOffers } from '@/service/provincial-offer-search-service'
import { countProvincialPermits } from '@/service/provincial-permit-search-service'

const mockNavigate = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...(actual as object),
    useNavigate: () => mockNavigate,
  }
})

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
  previewApplicationReviews: vi.fn(),
}))

vi.mock('@/service/federal-application-search-service', () => ({
  countFederalApplications: vi.fn(),
}))

vi.mock('@/service/indian-reserve-permit-search-service', () => ({
  countIndianReservePermits: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)
const mockedCountProvincialApplications = vi.mocked(countProvincialApplications)
const mockedCountProvincialExemptions = vi.mocked(countProvincialExemptions)
const mockedCountProvincialOffers = vi.mocked(countProvincialOffers)
const mockedCountProvincialPermits = vi.mocked(countProvincialPermits)
const mockedCountApplicationReviews = vi.mocked(countApplicationReviews)
const mockedPreviewApplicationReviews = vi.mocked(previewApplicationReviews)
const mockedCountFederalApplications = vi.mocked(countFederalApplications)
const mockedCountIndianReservePermits = vi.mocked(countIndianReservePermits)

const renderPage = () => {
  return render(
    <MemoryRouter initialEntries={['/provincial/summary']}>
      <Routes>
        <Route path="/provincial/summary" element={<ProvincialSummaryPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Provincial Summary action smoke', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockedUseAuth.mockReturnValue({
      canPerform: () => true,
    } as any)

    mockedCountProvincialApplications.mockResolvedValue(501)
    mockedCountProvincialExemptions.mockResolvedValue(602)
    mockedCountProvincialOffers.mockResolvedValue(703)
    mockedCountProvincialPermits.mockResolvedValue(804)
    mockedCountApplicationReviews.mockResolvedValue(905)
    mockedPreviewApplicationReviews.mockResolvedValue({
      content: [
        {
          applicationNumber: '901',
          volume: 0,
          speciesEndUse: 'LOG',
          listingDate: '2026-05-20',
          status: 'NEW',
          region: '22',
          showInfoIcon: false,
        },
      ],
      page: { number: 0, size: 5, hasNext: true },
    })
    mockedCountFederalApplications.mockResolvedValue(1006)
    mockedCountIndianReservePermits.mockResolvedValue(1107)
  })

  it('loads summary totals and navigates through review actions', async () => {
    renderPage()

    await screen.findByText('901')
    expect(mockedCountProvincialApplications).toHaveBeenCalledTimes(1)
    expect(mockedCountProvincialExemptions).toHaveBeenCalledTimes(1)
    expect(mockedCountProvincialOffers).toHaveBeenCalledTimes(1)
    expect(mockedCountProvincialPermits).toHaveBeenCalledTimes(1)
    expect(mockedCountApplicationReviews).toHaveBeenCalledTimes(1)
    expect(mockedPreviewApplicationReviews).toHaveBeenCalledTimes(1)
    expect(mockedCountFederalApplications).toHaveBeenCalledTimes(1)
    expect(mockedCountIndianReservePermits).toHaveBeenCalledTimes(1)
    expect(mockedCountProvincialApplications).toHaveBeenCalledWith(
      expect.objectContaining({ page: 0, pageSize: 1 }),
    )
    expect(mockedCountProvincialExemptions).toHaveBeenCalledWith(
      expect.objectContaining({ page: 0, pageSize: 1 }),
    )
    expect(mockedCountProvincialOffers).toHaveBeenCalledWith(
      expect.objectContaining({ page: 0, pageSize: 1 }),
    )
    expect(mockedCountProvincialPermits).toHaveBeenCalledWith(
      expect.objectContaining({ page: 0, pageSize: 1 }),
    )
    expect(mockedCountApplicationReviews).toHaveBeenCalledWith(
      expect.objectContaining({ page: 0, pageSize: 1 }),
    )
    expect(mockedPreviewApplicationReviews).toHaveBeenCalledWith(
      expect.objectContaining({ page: 0, pageSize: 5 }),
    )
    expect(mockedCountFederalApplications).toHaveBeenCalledWith(
      expect.objectContaining({ page: 0, pageSize: 1 }),
    )
    expect(mockedCountIndianReservePermits).toHaveBeenCalledWith(
      expect.objectContaining({ page: 0, pageSize: 1 }),
    )
    expect(screen.getByText('501')).toBeInTheDocument()
    expect(screen.getByText('602')).toBeInTheDocument()
    expect(screen.getByText('703')).toBeInTheDocument()
    expect(screen.getByText('804')).toBeInTheDocument()
    expect(screen.getByText('905')).toBeInTheDocument()
    expect(screen.getByText('1,006')).toBeInTheDocument()
    expect(screen.getByText('1,107')).toBeInTheDocument()
    expect(screen.queryByText(/Accessible modules:/)).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Open review queue' }))
    expect(mockNavigate).toHaveBeenCalledWith('/provincial/review')

    const reviewRow = screen.getByText('901').closest('tr')
    expect(reviewRow).not.toBeNull()

    await userEvent.click(
      within(reviewRow as HTMLTableRowElement).getByRole('button', { name: 'Open' }),
    )
    expect(mockNavigate).toHaveBeenCalledWith('/provincial/application/901')
  })

  it('reuses cached summary metrics when the route remounts', async () => {
    const firstRender = renderPage()

    await screen.findByText('901')
    expect(mockedCountProvincialApplications).toHaveBeenCalledTimes(1)
    expect(mockedCountProvincialPermits).toHaveBeenCalledTimes(1)
    expect(mockedPreviewApplicationReviews).toHaveBeenCalledTimes(1)

    firstRender.unmount()
    renderPage()

    await screen.findByText('901')
    expect(screen.getByText('804')).toBeInTheDocument()
    expect(mockedCountProvincialApplications).toHaveBeenCalledTimes(1)
    expect(mockedCountProvincialPermits).toHaveBeenCalledTimes(1)
    expect(mockedPreviewApplicationReviews).toHaveBeenCalledTimes(1)
  })

  it('refresh summary button bypasses cached metrics', async () => {
    renderPage()

    await screen.findByText('901')
    await userEvent.click(screen.getByRole('button', { name: 'Refresh Summary' }))

    await waitFor(() => {
      expect(mockedCountProvincialApplications).toHaveBeenCalledTimes(2)
    })
    expect(mockedCountProvincialPermits).toHaveBeenCalledTimes(2)
    expect(mockedPreviewApplicationReviews).toHaveBeenCalledTimes(2)
  })

  it('hides summary route actions when the user lacks all route permissions', async () => {
    mockedUseAuth.mockReturnValue({
      canPerform: () => false,
    } as any)

    renderPage()

    await waitFor(() => {
      expect(screen.queryByText('Loading summary metrics...')).not.toBeInTheDocument()
    })

    expect(mockedCountProvincialApplications).not.toHaveBeenCalled()
    expect(mockedCountProvincialExemptions).not.toHaveBeenCalled()
    expect(mockedCountProvincialOffers).not.toHaveBeenCalled()
    expect(mockedCountProvincialPermits).not.toHaveBeenCalled()
    expect(mockedCountApplicationReviews).not.toHaveBeenCalled()
    expect(mockedPreviewApplicationReviews).not.toHaveBeenCalled()
    expect(mockedCountFederalApplications).not.toHaveBeenCalled()
    expect(mockedCountIndianReservePermits).not.toHaveBeenCalled()

    expect(screen.queryByRole('button', { name: 'Open review queue' })).not.toBeInTheDocument()
    expect(screen.queryByText('No review queue data available.')).not.toBeInTheDocument()
    expect(screen.queryByText('Not Granted')).not.toBeInTheDocument()
    expect(screen.queryAllByRole('button', { name: 'Open' })).toHaveLength(0)
  })
})
