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
import { fetchApplicationClientData } from '@/service/application-client-lookup-service'
import { fetchApplicationSummarySnapshot } from '@/service/provincial-application-items-service'
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

vi.mock('@/service/application-client-lookup-service', () => ({
  fetchApplicationClientData: vi.fn(),
}))

vi.mock('@/service/provincial-application-items-service', () => ({
  fetchApplicationSummarySnapshot: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)
const mockedSearchApplicationReviews = vi.mocked(searchApplicationReviews)
const mockedApproveApplicationReview = vi.mocked(approveApplicationReview)
const mockedUpdateApplicationReviewStatus = vi.mocked(updateApplicationReviewStatus)
const mockedSendApplicationReviewStatusEmail = vi.mocked(sendApplicationReviewStatusEmail)
const mockedFetchApplicationClientData = vi.mocked(fetchApplicationClientData)
const mockedFetchApplicationSummarySnapshot = vi.mocked(fetchApplicationSummarySnapshot)
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
    size: 20,
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
    size: 20,
    totalElements: 2,
    totalPages: 1,
  },
}

const applicationSummary = {
  applicationNumber: '1000123',
  federalApplicationNumber: '',
  applicationDate: '2026-02-01',
  termDays: '14',
  receivedDate: '2026-02-01',
  applicationVolume: '210.5',
  averageLogVolume: '1.2',
  productLocation: 'BC',
  exportScheduleId: '1001',
  agentClientNumber: '',
  agentClientLocationCode: '',
  ownerClientNumber: '00012345',
  ownerClientLocationCode: '00',
  exemptionNumber: '',
  exemptionReasonCode: 'S',
  applicationStatusCode: 'NEW',
  applicantTypeCode: 'O',
  orgUnitNumber: '1903',
  productTypeCode: 'H',
  jurisdictionCode: 'P',
  growthTypeCode: 'S',
  agentContactName: '',
  ownerContactName: 'Owner Contact',
  oicIndicator: '',
  endUseCode: '',
  speciesCodes: [],
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
    mockedFetchApplicationSummarySnapshot.mockResolvedValue(applicationSummary)
    mockedFetchApplicationClientData.mockResolvedValue({
      clientNumber: '00012345',
      companyName: 'Client Ltd.',
      address: '',
      city: '',
      province: '',
      postalCode: '',
      country: '',
      phone: '',
      fax: '',
      email: 'client@example.com',
      notfound: '',
    })
  })

  it('keeps bulk status controls out and only enables single-row rejection for NEW rows', async () => {
    renderPage()
    await screen.findByText('1000123')

    const approveButton = screen.getByRole('button', { name: 'Approve Selected Applications' })
    expect(approveButton).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Update Selected Status' })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Update Status and Send Email' }),
    ).not.toBeInTheDocument()

    const newRowCheckbox = screen.getByRole('checkbox', { name: 'Select 1000123' })
    const reviewedRowCheckbox = screen.getByRole('checkbox', { name: 'Select 1000456' })
    expect(newRowCheckbox).toBeEnabled()
    expect(reviewedRowCheckbox).toBeDisabled()

    const rejectButtons = screen.getAllByRole('button', { name: 'Reject' })
    expect(rejectButtons[0]).toBeEnabled()
    expect(rejectButtons[1]).toBeDisabled()

    await userEvent.click(newRowCheckbox)

    expect(approveButton).toBeEnabled()
    expect(mockedUpdateApplicationReviewStatus).not.toHaveBeenCalled()
  })

  it('rejects a single NEW row with editable client-account email', async () => {
    renderPage()
    await screen.findByText('1000123')

    await userEvent.click(screen.getAllByRole('button', { name: 'Reject' })[0])

    await waitFor(() => {
      expect(mockedFetchApplicationSummarySnapshot).toHaveBeenCalledWith('1000123')
    })
    await waitFor(() => {
      expect(screen.getByLabelText('Client email address')).toHaveValue('client@example.com')
    })

    await userEvent.clear(screen.getByLabelText('Client email address'))
    await userEvent.type(screen.getByLabelText('Client email address'), 'edited@example.com')
    await userEvent.type(screen.getByLabelText('Rejection remark'), 'Rejected from review queue')
    await userEvent.click(screen.getByRole('button', { name: 'Reject Application' }))

    await waitFor(() => {
      expect(mockedUpdateApplicationReviewStatus).toHaveBeenCalledWith(
        '1000123',
        expect.objectContaining({
          statusCode: 'REJ',
          remark: 'Rejected from review queue',
          clientEmailAddress: 'edited@example.com',
        }),
      )
      expect(mockedSendApplicationReviewStatusEmail).toHaveBeenCalledWith(
        '1000123',
        expect.objectContaining({
          statusCode: 'REJ',
          remark: 'Rejected from review queue',
          clientEmailAddress: 'edited@example.com',
        }),
      )
    })
    expect(
      await screen.findByText('Rejected application 1000123 and sent email.'),
    ).toBeInTheDocument()
  })

  it('validates single-row rejection before status update', async () => {
    renderPage()
    await screen.findByText('1000123')

    await userEvent.click(screen.getAllByRole('button', { name: 'Reject' })[0])
    await waitFor(() =>
      expect(screen.getByLabelText('Client email address')).toHaveValue('client@example.com'),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Reject Application' }))

    expect(screen.getByText('Rejection remark is required.')).toBeInTheDocument()
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
    await userEvent.click(await screen.findByRole('option', { name: 'TST' }))

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
    expect(screen.getAllByRole('button', { name: 'Reject' })[0]).toBeDisabled()
  })
})
