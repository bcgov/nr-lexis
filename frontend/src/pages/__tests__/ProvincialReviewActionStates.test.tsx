import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
import { createTestAuthContext } from '@/test-utils/auth'

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

const twoNewReviewResponse = {
  content: [
    {
      applicationNumber: '2000001',
      volume: 210.5,
      speciesEndUse: 'LOG',
      listingDate: '2026-02-01',
      status: 'NEW',
      region: '11',
      showInfoIcon: false,
    },
    {
      applicationNumber: '2000002',
      volume: 95,
      speciesEndUse: 'LUM',
      listingDate: '2026-02-26',
      status: 'NEW',
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

const renderPage = (initialEntry = '/provincial/review') => {
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/provincial/review" element={<ProvincialReviewPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

const chooseComboBoxOption = async (labelText: string, optionName: string): Promise<void> => {
  const combobox = screen.getByRole('combobox', { name: labelText })
  await userEvent.click(combobox)
  fireEvent.change(combobox, { target: { value: optionName } })
  const options = await screen.findAllByRole('option', { name: optionName })
  await userEvent.click(options.find((option) => option.tagName === 'LI') ?? options[0])
}

Element.prototype.scrollIntoView = vi.fn()

describe('Provincial Review Action State Smoke', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseAuth.mockReturnValue(createTestAuthContext({ canPerform: () => true }))
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

  it('shows review status validation only after NEW rows are selected', async () => {
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
    expect(mockedUpdateApplicationReviewStatus).not.toHaveBeenCalled()

    await chooseComboBoxOption('Update status code', 'Rejected')

    expect(updateStatusButton).toBeDisabled()
    expect(updateAndEmailButton).toBeDisabled()
    expect(screen.getByText('Status remark is required.')).toBeInTheDocument()

    await userEvent.type(
      screen.getByLabelText('Status remark (required for rejected or withdrawn)'),
      'Rejecting from review queue',
    )

    expect(updateStatusButton).toBeEnabled()
    expect(updateAndEmailButton).toBeDisabled()
  })

  it('does not allow sending status email without a valid client email', async () => {
    renderPage()
    await screen.findByText('1000123')

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select 1000123' }))
    await chooseComboBoxOption('Update status code', 'Withdrawn')
    await userEvent.type(
      screen.getByLabelText('Status remark (required for rejected or withdrawn)'),
      'Withdrawing from review queue',
    )
    const updateAndEmailButton = screen.getByRole('button', {
      name: 'Update Status and Send Email',
    })
    await waitFor(() => expect(updateAndEmailButton).toBeDisabled())
    await userEvent.click(updateAndEmailButton)

    expect(screen.queryByText('Action failed')).not.toBeInTheDocument()
    expect(mockedUpdateApplicationReviewStatus).not.toHaveBeenCalled()
    expect(mockedSendApplicationReviewStatusEmail).not.toHaveBeenCalled()
  })

  it('does not default region filters when opened without query parameters', async () => {
    renderPage()
    await screen.findByText('1000123')

    expect(mockedSearchApplicationReviews).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: expect.objectContaining({
          region: [],
        }),
      }),
    )
  })

  it('approves selected applications sequentially', async () => {
    mockedSearchApplicationReviews.mockResolvedValue(twoNewReviewResponse)
    let resolveFirstApproval:
      | ((value: Awaited<ReturnType<typeof approveApplicationReview>>) => void)
      | undefined
    let resolveSecondApproval:
      | ((value: Awaited<ReturnType<typeof approveApplicationReview>>) => void)
      | undefined
    mockedApproveApplicationReview
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirstApproval = resolve
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSecondApproval = resolve
          }),
      )

    renderPage()
    await screen.findByText('2000001')

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select all rows on this page' }))
    await userEvent.click(screen.getByRole('button', { name: 'Approve Selected Applications' }))

    await waitFor(() => {
      expect(mockedApproveApplicationReview).toHaveBeenCalledTimes(1)
    })
    expect(mockedApproveApplicationReview).toHaveBeenNthCalledWith(1, '2000001')

    await act(async () => {
      resolveFirstApproval?.({
        updated: true,
        valid: true,
        statusCode: 'APP',
        clientEmail: '',
        remark: '',
        message: 'Approved first',
      })
    })

    await waitFor(() => {
      expect(mockedApproveApplicationReview).toHaveBeenCalledTimes(2)
    })
    expect(mockedApproveApplicationReview).toHaveBeenNthCalledWith(2, '2000002')

    await act(async () => {
      resolveSecondApproval?.({
        updated: true,
        valid: true,
        statusCode: 'APP',
        clientEmail: '',
        remark: '',
        message: 'Approved second',
      })
    })

    expect(await screen.findByText('Approved 2 application(s).')).toBeInTheDocument()
  })

  it('updates status and sends emails sequentially per selected application', async () => {
    mockedSearchApplicationReviews.mockResolvedValue(twoNewReviewResponse)
    let resolveFirstEmail:
      | ((value: Awaited<ReturnType<typeof sendApplicationReviewStatusEmail>>) => void)
      | undefined
    mockedSendApplicationReviewStatusEmail
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirstEmail = resolve
          }),
      )
      .mockResolvedValueOnce({
        success: true,
        message: 'Sent second',
      })

    renderPage()
    await screen.findByText('2000001')

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select all rows on this page' }))
    await chooseComboBoxOption('Update status code', 'Rejected')
    await userEvent.type(
      screen.getByLabelText('Status remark (required for rejected or withdrawn)'),
      'Rejecting from review queue',
    )
    await userEvent.type(
      screen.getByLabelText('Client email address (required for status email)'),
      'client@example.com',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Update Status and Send Email' }))

    await waitFor(() => {
      expect(mockedUpdateApplicationReviewStatus).toHaveBeenCalledTimes(1)
      expect(mockedSendApplicationReviewStatusEmail).toHaveBeenCalledTimes(1)
    })
    expect(mockedUpdateApplicationReviewStatus).toHaveBeenNthCalledWith(
      1,
      '2000001',
      expect.objectContaining({
        statusCode: 'REJ',
        clientEmailAddress: 'client@example.com',
      }),
    )

    await act(async () => {
      resolveFirstEmail?.({
        success: true,
        message: 'Sent first',
      })
    })

    await waitFor(() => {
      expect(mockedUpdateApplicationReviewStatus).toHaveBeenCalledTimes(2)
      expect(mockedSendApplicationReviewStatusEmail).toHaveBeenCalledTimes(2)
    })
    expect(mockedUpdateApplicationReviewStatus).toHaveBeenNthCalledWith(
      2,
      '2000002',
      expect.objectContaining({
        statusCode: 'REJ',
        clientEmailAddress: 'client@example.com',
      }),
    )

    expect(
      await screen.findByText('Updated status and sent email for 2 application(s).'),
    ).toBeInTheDocument()
  })

  it('reports status updates separately when status email is unavailable', async () => {
    mockedSearchApplicationReviews.mockResolvedValue(twoNewReviewResponse)
    mockedSendApplicationReviewStatusEmail.mockResolvedValue({
      success: false,
      message: 'Application status email is not configured yet. No email was sent.',
    })

    renderPage()
    await screen.findByText('2000001')

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select all rows on this page' }))
    await chooseComboBoxOption('Update status code', 'Rejected')
    await userEvent.type(
      screen.getByLabelText('Status remark (required for rejected or withdrawn)'),
      'Rejecting from review queue',
    )
    await userEvent.type(
      screen.getByLabelText('Client email address (required for status email)'),
      'client@example.com',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Update Status and Send Email' }))

    await waitFor(() => {
      expect(mockedUpdateApplicationReviewStatus).toHaveBeenCalledTimes(2)
      expect(mockedSendApplicationReviewStatusEmail).toHaveBeenCalledTimes(2)
    })

    expect(
      await screen.findByText(
        'Updated status for 2 application(s), but 2 email(s) were not sent. Application status email is not configured yet. No email was sent.',
      ),
    ).toBeInTheDocument()
  })

  it('sends selected region org unit numbers to the review search request', async () => {
    mockedFetchApplicationReviewOptions.mockResolvedValueOnce({
      productTypes: [{ value: 'LOG', label: 'Logs' }],
      regions: [
        { value: '1818', label: 'TST' },
        { value: '1919', label: 'OTHER' },
      ],
      reviewStatuses: [{ value: 'REJ', label: 'Rejected' }],
    })

    renderPage('/provincial/review?applicationNumber=1000123')
    await screen.findByText('1000123')
    await waitFor(() => {
      expect(mockedFetchApplicationReviewOptions).toHaveBeenCalledTimes(1)
    })
    mockedSearchApplicationReviews.mockClear()

    const regionComboBox = screen.getByRole('combobox', { name: /^Region/ })
    await userEvent.click(regionComboBox)
    fireEvent.change(regionComboBox, { target: { value: 'TST' } })
    await userEvent.click(await screen.findByRole('option', { name: 'TST (1818)' }))

    await waitFor(() => {
      expect(mockedSearchApplicationReviews).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: expect.objectContaining({
            applicationNumber: '1000123',
            region: ['1818'],
          }),
        }),
      )
    })
  })

  it('disables selection and action buttons when user lacks review permission', async () => {
    mockedUseAuth.mockReturnValue(
      createTestAuthContext({
        canPerform: (action: string) =>
          action === '/applicationSearch' || action === '/applicationDetails',
      }),
    )

    renderPage()
    await screen.findByText('1000123')

    expect(screen.getByRole('checkbox', { name: 'Select 1000123' })).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: 'Select all rows on this page' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Approve Selected Applications' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Update Selected Status' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Update Status and Send Email' })).toBeDisabled()
  })
})
