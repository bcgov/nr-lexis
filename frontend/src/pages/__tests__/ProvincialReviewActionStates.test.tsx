import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import ProvincialReviewPage from '@/pages/ProvincialReview'
import {
  approveApplicationReview,
  searchApplicationReviews,
  sendApplicationReviewStatusEmail,
  updateApplicationReviewStatus,
} from '@/service/application-review-search-service'
import { fetchApplicationReviewOptions } from '@/service/search-options-service'

vi.mock('@/context/auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/service/application-review-search-service', () => ({
  searchApplicationReviews: vi.fn(),
  approveApplicationReview: vi.fn(),
  updateApplicationReviewStatus: vi.fn(),
  sendApplicationReviewStatusEmail: vi.fn(),
}))

vi.mock('@/service/search-options-service', () => ({
  fetchApplicationReviewOptions: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)
const mockedSearchApplicationReviews = vi.mocked(searchApplicationReviews)
const mockedApproveApplicationReview = vi.mocked(approveApplicationReview)
const mockedUpdateApplicationReviewStatus = vi.mocked(updateApplicationReviewStatus)
const mockedSendApplicationReviewStatusEmail = vi.mocked(sendApplicationReviewStatusEmail)
const mockedFetchApplicationReviewOptions = vi.mocked(fetchApplicationReviewOptions)

const reviewResponse = {
  content: [
    {
      applicationNumber: '1000123',
      volume: 210.5,
      speciesEndUse: 'LOG',
      listingDate: '2026-02-01',
      status: 'NEW',
      region: '11',
      showInfoIcon: false,
    },
    {
      applicationNumber: '1000456',
      volume: 95,
      speciesEndUse: 'LUM',
      listingDate: '2026-02-26',
      status: 'REV',
      region: '12',
      showInfoIcon: false,
    },
  ],
  page: {
    number: 0,
    size: 10,
    totalElements: 2,
    totalPages: 1,
  },
}

const renderPage = () => {
  render(
    <MemoryRouter initialEntries={['/provincial/review']}>
      <Routes>
        <Route path="/provincial/review" element={<ProvincialReviewPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Provincial Review Action State Smoke', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseAuth.mockReturnValue({
      canPerform: () => true,
    } as any)
    mockedSearchApplicationReviews.mockResolvedValue(reviewResponse)
    mockedFetchApplicationReviewOptions.mockResolvedValue({
      productTypes: [
        { value: 'LOG', label: 'Logs' },
        { value: 'LUM', label: 'Lumber' },
      ],
      regions: [
        { value: '11', label: 'Cariboo' },
        { value: '12', label: 'Coast' },
      ],
      reviewStatuses: [
        { value: 'REJ', label: 'Rejected' },
        { value: 'WDN', label: 'Withdrawn' },
      ],
    })
    mockedApproveApplicationReview.mockResolvedValue({
      updated: true,
      valid: true,
      statusCode: 'APP',
      clientEmail: '',
      remark: '',
      message: 'Approved',
    })
    mockedUpdateApplicationReviewStatus.mockResolvedValue({
      updated: true,
      valid: true,
      statusCode: 'REJ',
      clientEmail: 'client@example.com',
      remark: 'Reason',
      message: 'Updated',
    })
    mockedSendApplicationReviewStatusEmail.mockResolvedValue({
      success: true,
      message: 'Sent',
    })
  })

  it('enables review actions only when NEW rows are selected and status code is chosen', async () => {
    renderPage()
    await screen.findByText('1000123')

    const approveButton = screen.getByRole('button', { name: 'Approve Selected Applications' })
    const updateStatusButton = screen.getByRole('button', { name: 'Update Selected Status' })
    const updateAndEmailButton = screen.getByRole('button', {
      name: 'Update Status and Send Email',
    })

    expect(approveButton).toBeDisabled()
    expect(updateStatusButton).toBeDisabled()
    expect(updateAndEmailButton).toBeDisabled()

    const newRowCheckbox = screen.getByRole('checkbox', { name: 'Select 1000123' })
    const reviewedRowCheckbox = screen.getByRole('checkbox', { name: 'Select 1000456' })
    expect(newRowCheckbox).toBeEnabled()
    expect(reviewedRowCheckbox).toBeDisabled()

    await userEvent.click(newRowCheckbox)

    expect(approveButton).toBeEnabled()
    expect(updateStatusButton).toBeDisabled()
    expect(updateAndEmailButton).toBeDisabled()

    await userEvent.selectOptions(screen.getByLabelText('Update Status Code'), 'REJ')

    expect(updateStatusButton).toBeEnabled()
    expect(updateAndEmailButton).toBeEnabled()
  })

  it('shows validation when sending status email without a valid client email', async () => {
    renderPage()
    await screen.findByText('1000123')

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select 1000123' }))
    await userEvent.selectOptions(screen.getByLabelText('Update Status Code'), 'WDN')
    await userEvent.click(screen.getByRole('button', { name: 'Update Status and Send Email' }))

    await waitFor(() => {
      expect(screen.getByText('Action failed')).toBeInTheDocument()
      expect(
        screen.getByText('Enter a valid client email address before sending status email.'),
      ).toBeInTheDocument()
    })
    expect(mockedUpdateApplicationReviewStatus).not.toHaveBeenCalled()
    expect(mockedSendApplicationReviewStatusEmail).not.toHaveBeenCalled()
  })

  it('disables selection and action buttons when user lacks review permission', async () => {
    mockedUseAuth.mockReturnValue({
      canPerform: (action: string) =>
        action === '/applicationSearch' || action === '/applicationDetails',
    } as any)

    renderPage()
    await screen.findByText('1000123')

    expect(screen.getByRole('checkbox', { name: 'Select 1000123' })).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: 'Select all rows on this page' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Approve Selected Applications' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Update Selected Status' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Update Status and Send Email' })).toBeDisabled()
  })
})
