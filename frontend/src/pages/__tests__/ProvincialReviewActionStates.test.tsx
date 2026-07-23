import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
import { fetchCurrentApplicationRecordVersion } from '@/service/record-version-service'
import { fetchApplicationReviewOptions } from '@/service/search-options-service'
import { createTestAuthContext } from '@/test-utils/auth'

vi.mock('@/context/auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/service/application-review-search-service', () => ({
  countApplicationReviews: vi.fn(),
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

vi.mock('@/service/record-version-service', () => ({
  fetchCurrentApplicationRecordVersion: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)
const mockedSearchApplicationReviews = vi.mocked(searchApplicationReviews)
const mockedApproveApplicationReview = vi.mocked(approveApplicationReview)
const mockedUpdateApplicationReviewStatus = vi.mocked(updateApplicationReviewStatus)
const mockedSendApplicationReviewStatusEmail = vi.mocked(sendApplicationReviewStatusEmail)
const mockedFetchApplicationClientData = vi.mocked(fetchApplicationClientData)
const mockedFetchApplicationSummarySnapshot = vi.mocked(fetchApplicationSummarySnapshot)
const mockedFetchCurrentApplicationRecordVersion = vi.mocked(fetchCurrentApplicationRecordVersion)
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
      status: 'PND',
      region: '12',
      showInfoIcon: false,
    },
  ],
  page: {
    number: 0,
    size: 100,
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
    size: 100,
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
        { value: 'EXP', label: 'Expired' },
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
    mockedFetchCurrentApplicationRecordVersion.mockImplementation((applicationNumber) =>
      Promise.resolve(`application-${applicationNumber}-version`),
    )
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

  it('enables review actions and select-all for mixed NEW and PND rows', async () => {
    renderPage()
    await screen.findByText('1000123')

    const approveButton = screen.getByRole('button', { name: 'Approve Selected Applications' })
    expect(approveButton).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Update Selected Status' })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Update Status and Send Email' }),
    ).not.toBeInTheDocument()

    const newRowCheckbox = screen.getByRole('checkbox', { name: 'Select 1000123' })
    const pendingRowCheckbox = screen.getByRole('checkbox', { name: 'Select 1000456' })
    expect(newRowCheckbox).toBeEnabled()
    expect(pendingRowCheckbox).toBeEnabled()

    const rejectButtons = screen.getAllByRole('button', { name: 'Reject' })
    expect(rejectButtons[0]).toBeEnabled()
    expect(rejectButtons[1]).toBeEnabled()

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select all rows on this page' }))

    expect(newRowCheckbox).toBeChecked()
    expect(pendingRowCheckbox).toBeChecked()
    expect(screen.getByRole('button', { name: 'Approve Selected Applications' })).toBeEnabled()
    expect(mockedUpdateApplicationReviewStatus).not.toHaveBeenCalled()
  })

  it('renders legacy non-sortable review result headers as plain text', async () => {
    renderPage()
    await screen.findByText('1000123')

    expect(screen.queryByRole('button', { name: 'Status' })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Application volume (m³)' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Species end use sort' })).not.toBeInTheDocument()
  })

  it('renders review data columns in legacy order', async () => {
    renderPage()
    await screen.findByText('1000123')

    const headers = screen
      .getAllByRole('columnheader')
      .slice(1)
      .map((header) => header.textContent?.replace(/\s+/g, ' ').trim())

    expect(headers).toEqual([
      'Application (DESC)',
      'Status',
      'Application volume (m³)',
      'Species end use sort',
      'Listing date',
      'Region',
      'Action',
    ])
  })

  it('renders application volume with legacy one-decimal precision', async () => {
    renderPage()
    await screen.findByText('1000456')

    expect(screen.getByText('210.5')).toBeInTheDocument()
    expect(screen.getByText('95.0')).toBeInTheDocument()
  })

  it.each([
    ['Listing date', 'listingDate'],
    ['Region', 'regionCode'],
  ] as const)('dispatches the legacy review %s sort key', async (header, expectedSortField) => {
    renderPage()
    await screen.findByText('1000123')
    mockedSearchApplicationReviews.mockClear()

    await userEvent.click(screen.getByRole('button', { name: header }))

    await waitFor(() => {
      expect(
        mockedSearchApplicationReviews.mock.calls.some(
          ([request]) => request.sortField === expectedSortField && request.sortDirection === 'asc',
        ),
      ).toBe(true)
    })
  })

  it('toggles the default review application sort to ascending', async () => {
    renderPage()
    await screen.findByText('1000123')
    mockedSearchApplicationReviews.mockClear()

    await userEvent.click(screen.getByRole('button', { name: 'Application (DESC)' }))

    await waitFor(() => {
      expect(
        mockedSearchApplicationReviews.mock.calls.some(
          ([request]) =>
            request.sortField === 'applicationNumber' && request.sortDirection === 'asc',
        ),
      ).toBe(true)
    })
  })

  it('approves a selected PND application', async () => {
    renderPage()
    await screen.findByText('1000456')

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select 1000456' }))
    await userEvent.click(screen.getByRole('button', { name: 'Approve Selected Applications' }))

    await waitFor(() => {
      expect(mockedApproveApplicationReview).toHaveBeenCalledTimes(1)
      expect(mockedApproveApplicationReview).toHaveBeenCalledWith(
        '1000456',
        'application-1000456-version',
      )
    })
    expect(await screen.findByText('Approved 1 application(s).')).toBeInTheDocument()
  })

  it('rejects a single NEW row with an editable client email recipient', async () => {
    renderPage()
    await screen.findByText('1000123')

    await userEvent.click(screen.getAllByRole('button', { name: 'Reject' })[0])

    await waitFor(() => {
      expect(mockedFetchApplicationSummarySnapshot).toHaveBeenCalledWith('1000123')
    })
    await waitFor(() => {
      expect(screen.getByLabelText('Client email address')).toHaveValue('client@example.com')
    })

    expect(screen.getByRole('combobox', { name: 'Application status' })).toHaveValue('Rejected')
    expect(screen.getByRole('checkbox', { name: 'Send status email' })).toBeChecked()
    expect(screen.getByLabelText('Client email address')).not.toHaveAttribute('readonly')
    expect(
      screen.getByText(
        "Defaults from the applicant's Oracle client-location email. Changes apply only to this notification.",
      ),
    ).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Client email address'), {
      target: { value: 'edited.client@example.com' },
    })
    await userEvent.type(screen.getByLabelText('Remarks'), 'Rejected from review queue')
    expect(screen.getByLabelText('Client email address')).toHaveValue('edited.client@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Update Application' }))

    await waitFor(() => {
      expect(mockedUpdateApplicationReviewStatus).toHaveBeenCalledWith(
        '1000123',
        expect.objectContaining({
          statusCode: 'REJ',
          remark: 'Rejected from review queue',
          clientEmailAddress: 'edited.client@example.com',
        }),
        'application-1000123-version',
      )
      expect(mockedSendApplicationReviewStatusEmail).toHaveBeenCalledWith(
        '1000123',
        expect.objectContaining({
          statusCode: 'REJ',
          remark: 'Rejected from review queue',
          clientEmailAddress: 'edited.client@example.com',
        }),
      )
    })
    expect(
      await screen.findByText('Updated application 1000123 and queued email.'),
    ).toBeInTheDocument()
  }, 15000)

  it('prefills an owner rejection with the owner client-location email', async () => {
    renderPage()
    await screen.findByText('1000123')
    await userEvent.click(screen.getAllByRole('button', { name: 'Reject' })[0])

    await waitFor(() => {
      expect(screen.getByLabelText('Client email address')).toHaveValue('client@example.com')
    })
  })

  it('rejects a single PND row through the same review workflow', async () => {
    mockedFetchApplicationSummarySnapshot.mockResolvedValueOnce({
      ...applicationSummary,
      applicationNumber: '1000456',
      applicationStatusCode: 'PND',
    })

    renderPage()
    await screen.findByText('1000456')

    await userEvent.click(screen.getAllByRole('button', { name: 'Reject' })[1])

    await waitFor(() => {
      expect(mockedFetchApplicationSummarySnapshot).toHaveBeenCalledWith('1000456')
      expect(screen.getByLabelText('Client email address')).toHaveValue('client@example.com')
    })

    await userEvent.type(screen.getByLabelText('Remarks'), 'Pending application rejected')
    await userEvent.click(screen.getByRole('button', { name: 'Update Application' }))

    await waitFor(() => {
      expect(mockedUpdateApplicationReviewStatus).toHaveBeenCalledWith(
        '1000456',
        expect.objectContaining({
          statusCode: 'REJ',
          remark: 'Pending application rejected',
          clientEmailAddress: 'client@example.com',
        }),
        'application-1000456-version',
      )
      expect(mockedSendApplicationReviewStatusEmail).toHaveBeenCalledWith(
        '1000456',
        expect.objectContaining({
          statusCode: 'REJ',
          remark: 'Pending application rejected',
          clientEmailAddress: 'client@example.com',
        }),
      )
    })
    expect(
      await screen.findByText('Updated application 1000456 and queued email.'),
    ).toBeInTheDocument()
  }, 15000)

  it('expires a federal review row without attempting a status email', async () => {
    mockedFetchApplicationSummarySnapshot.mockResolvedValueOnce({
      ...applicationSummary,
      jurisdictionCode: 'F',
    })

    renderPage()
    await screen.findByText('1000123')
    await userEvent.click(screen.getAllByRole('button', { name: 'Reject' })[0])
    await waitFor(() =>
      expect(screen.getByLabelText('Client email address')).toHaveValue('client@example.com'),
    )

    const statusSelect = screen.getByRole('combobox', { name: 'Application status' })
    await userEvent.click(statusSelect)
    const listboxId = statusSelect.getAttribute('aria-controls')
    const listbox = listboxId ? document.getElementById(listboxId) : null
    expect(listbox).not.toBeNull()
    await userEvent.click(within(listbox as HTMLElement).getByRole('option', { name: 'Expired' }))

    expect(screen.getByRole('checkbox', { name: 'Send status email' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Send status email' })).toBeDisabled()
    expect(
      screen.getByText('Status emails are sent only for rejected or withdrawn applications.'),
    ).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('Remarks'), 'Expired after manual review')
    await userEvent.click(screen.getByRole('button', { name: 'Update Application' }))

    await waitFor(() => {
      expect(mockedUpdateApplicationReviewStatus).toHaveBeenCalledWith(
        '1000123',
        {
          statusCode: 'EXP',
          remark: 'Expired after manual review',
          clientEmailAddress: '',
        },
        'application-1000123-version',
      )
    })
    expect(mockedSendApplicationReviewStatusEmail).not.toHaveBeenCalled()
    expect(await screen.findByText('Updated application 1000123.')).toBeInTheDocument()
  }, 15000)

  it('prefills the agent client email when rejecting an agent application', async () => {
    mockedFetchApplicationSummarySnapshot.mockResolvedValueOnce({
      ...applicationSummary,
      applicantTypeCode: 'A',
      agentClientNumber: '00054321',
      agentClientLocationCode: '02',
    })
    mockedFetchApplicationClientData
      .mockResolvedValueOnce({
        clientNumber: '00012345',
        companyName: 'Owner Ltd.',
        address: '',
        city: '',
        province: '',
        postalCode: '',
        country: '',
        phone: '',
        fax: '',
        email: 'owner@example.com',
        notfound: '',
      })
      .mockResolvedValueOnce({
        clientNumber: '00054321',
        companyName: 'Agent Ltd.',
        address: '',
        city: '',
        province: '',
        postalCode: '',
        country: '',
        phone: '',
        fax: '',
        email: 'agent@example.com',
        notfound: '',
      })

    renderPage()
    await screen.findByText('1000123')

    await userEvent.click(screen.getAllByRole('button', { name: 'Reject' })[0])

    await waitFor(() => {
      expect(mockedFetchApplicationClientData).toHaveBeenCalledWith('00012345', '00')
      expect(mockedFetchApplicationClientData).toHaveBeenCalledWith('00054321', '02')
      expect(screen.getByLabelText('Client email address')).toHaveValue('agent@example.com')
    })

    await userEvent.type(screen.getByLabelText('Remarks'), 'Rejected from review queue')
    await userEvent.click(screen.getByRole('button', { name: 'Update Application' }))

    await waitFor(() => {
      expect(mockedUpdateApplicationReviewStatus).toHaveBeenCalledWith(
        '1000123',
        expect.objectContaining({
          statusCode: 'REJ',
          remark: 'Rejected from review queue',
          clientEmailAddress: 'agent@example.com',
        }),
        'application-1000123-version',
      )
      expect(mockedSendApplicationReviewStatusEmail).toHaveBeenCalledWith(
        '1000123',
        expect.objectContaining({
          statusCode: 'REJ',
          remark: 'Rejected from review queue',
          clientEmailAddress: 'agent@example.com',
        }),
      )
    })
  })

  it('falls back to the owner email when an agent applicant has no email', async () => {
    mockedFetchApplicationSummarySnapshot.mockResolvedValueOnce({
      ...applicationSummary,
      applicantTypeCode: 'A',
      agentClientNumber: '00054321',
      agentClientLocationCode: '02',
    })
    mockedFetchApplicationClientData
      .mockResolvedValueOnce({
        clientNumber: '00012345',
        companyName: 'Owner Ltd.',
        address: '',
        city: '',
        province: '',
        postalCode: '',
        country: '',
        phone: '',
        fax: '',
        email: 'owner@example.com',
        notfound: '',
      })
      .mockResolvedValueOnce({
        clientNumber: '00054321',
        companyName: 'Agent without email',
        address: '',
        city: '',
        province: '',
        postalCode: '',
        country: '',
        phone: '',
        fax: '',
        email: '',
        notfound: '',
      })

    renderPage()
    await screen.findByText('1000123')
    await userEvent.click(screen.getAllByRole('button', { name: 'Reject' })[0])

    await waitFor(() =>
      expect(screen.getByLabelText('Client email address')).toHaveValue('owner@example.com'),
    )
  })

  it('validates single-row rejection before status update', async () => {
    renderPage()
    await screen.findByText('1000123')

    await userEvent.click(screen.getAllByRole('button', { name: 'Reject' })[0])
    await waitFor(() =>
      expect(screen.getByLabelText('Client email address')).toHaveValue('client@example.com'),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Update Application' }))

    expect(screen.getByText('Remarks are required.')).toBeInTheDocument()
    expect(screen.queryByText('Action failed')).not.toBeInTheDocument()
    expect(mockedUpdateApplicationReviewStatus).not.toHaveBeenCalled()
    expect(mockedSendApplicationReviewStatusEmail).not.toHaveBeenCalled()
  })

  it('requires a valid client email before rejecting when the client account has no email', async () => {
    mockedFetchApplicationClientData.mockResolvedValueOnce({
      clientNumber: '00012345',
      companyName: 'Client Ltd.',
      address: '',
      city: '',
      province: '',
      postalCode: '',
      country: '',
      phone: '',
      fax: '',
      email: '',
      notfound: '',
    })

    renderPage()
    await screen.findByText('1000123')

    await userEvent.click(screen.getAllByRole('button', { name: 'Reject' })[0])

    await waitFor(() => expect(screen.getByLabelText('Client email address')).not.toBeDisabled())
    expect(screen.getByLabelText('Client email address')).toHaveValue('')
    expect(
      screen.queryByText('Enter one valid client email address or deselect Send status email.'),
    ).not.toBeInTheDocument()
    expect(
      screen.getByText(
        'No client email was found. Enter an email address or deselect Send status email.',
      ),
    ).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('Remarks'), 'Rejected from review queue')
    await userEvent.click(screen.getByRole('button', { name: 'Update Application' }))

    expect(
      (
        await screen.findAllByText(
          'Enter one valid client email address or deselect Send status email.',
        )
      ).length,
    ).toBeGreaterThan(0)
    expect(mockedUpdateApplicationReviewStatus).not.toHaveBeenCalled()
    expect(mockedSendApplicationReviewStatusEmail).not.toHaveBeenCalled()
  })

  it('updates a rejected application without sending email when email delivery is unchecked', async () => {
    renderPage()
    await screen.findByText('1000123')

    await userEvent.click(screen.getAllByRole('button', { name: 'Reject' })[0])
    await waitFor(() =>
      expect(screen.getByLabelText('Client email address')).toHaveValue('client@example.com'),
    )

    await userEvent.click(screen.getByRole('checkbox', { name: 'Send status email' }))
    expect(screen.getByLabelText('Client email address')).not.toHaveAttribute('readonly')

    await userEvent.type(screen.getByLabelText('Remarks'), 'Rejected without notification')
    await userEvent.click(screen.getByRole('button', { name: 'Update Application' }))

    await waitFor(() => {
      expect(mockedUpdateApplicationReviewStatus).toHaveBeenCalledWith(
        '1000123',
        expect.objectContaining({
          statusCode: 'REJ',
          remark: 'Rejected without notification',
          clientEmailAddress: '',
        }),
        'application-1000123-version',
      )
    })
    expect(mockedSendApplicationReviewStatusEmail).not.toHaveBeenCalled()
    expect(await screen.findByText('Updated application 1000123.')).toBeInTheDocument()
  })

  it('does not default region filters when opened without query parameters', async () => {
    renderPage()
    await screen.findByText('1000123')

    expect(mockedSearchApplicationReviews).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: expect.objectContaining({
          region: [],
        }),
        pageSize: 100,
      }),
      expect.objectContaining({ knownTotal: expect.any(Number) }),
    )
  })

  it('keeps review pagination at 100 by default with expanded page size options', async () => {
    renderPage()
    await screen.findByText('1000123')

    expect(mockedSearchApplicationReviews).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 0,
        pageSize: 100,
      }),
      expect.objectContaining({ knownTotal: expect.any(Number) }),
    )

    const rowsPerPage = screen.getByLabelText('Items per page:')
    expect(rowsPerPage).toHaveValue('100')
    expect(
      Array.from(rowsPerPage.querySelectorAll('option')).map((option) => option.value),
    ).toEqual(['10', '25', '50', '100', '200'])
  })

  it('accepts supported review page sizes from the URL', async () => {
    renderPage('/provincial/review?pageSize=200')
    await screen.findByText('1000123')

    expect(mockedSearchApplicationReviews).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 0,
        pageSize: 200,
      }),
      expect.objectContaining({ knownTotal: expect.any(Number) }),
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
    expect(mockedFetchCurrentApplicationRecordVersion).toHaveBeenNthCalledWith(1, '2000001')
    expect(mockedApproveApplicationReview).toHaveBeenNthCalledWith(
      1,
      '2000001',
      'application-2000001-version',
    )

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
    expect(mockedFetchCurrentApplicationRecordVersion).toHaveBeenNthCalledWith(2, '2000002')
    expect(mockedApproveApplicationReview).toHaveBeenNthCalledWith(
      2,
      '2000002',
      'application-2000002-version',
    )

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
        expect.objectContaining({ knownTotal: expect.any(Number) }),
      )
    })
  })

  it('shows selected review search regions as removable pills', async () => {
    mockedFetchApplicationReviewOptions.mockResolvedValueOnce({
      productTypes: [{ value: 'LOG', label: 'Logs' }],
      regions: [
        { value: '1903', label: 'Cariboo Natural Resource Region' },
        { value: '1908', label: 'Skeena Natural Resource Region' },
      ],
      reviewStatuses: [{ value: 'REJ', label: 'Rejected' }],
    })

    renderPage('/provincial/review?region=1903,1908')
    await screen.findByText('1000123')

    const selectedRegions = await screen.findByRole('list', { name: 'Selected regions' })
    expect(within(selectedRegions).getByText('Cariboo Natural Resource Region')).toBeVisible()
    expect(within(selectedRegions).getByText('Skeena Natural Resource Region')).toBeVisible()
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

    const rowCheckbox = screen.getByRole('checkbox', { name: 'Select 1000123' })
    expect(rowCheckbox).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: 'Select all rows on this page' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Approve Selected Applications' })).toBeDisabled()
    expect(screen.getAllByRole('button', { name: 'Reject' })[0]).toBeDisabled()

    const tooltipTrigger = rowCheckbox.closest('.disabled-button-tooltip') as HTMLElement
    expect(tooltipTrigger).toBeTruthy()

    await userEvent.hover(tooltipTrigger)

    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'You do not have permission to approve applications.',
    )
  })

  it('explains when no reviewable applications are available to select', async () => {
    mockedSearchApplicationReviews.mockResolvedValue({
      content: [
        {
          ...reviewResponse.content[0],
          status: 'APP',
        },
      ],
      page: {
        number: 0,
        size: 100,
        totalElements: 1,
        totalPages: 1,
      },
    })

    renderPage()
    await screen.findByText('1000123')

    const selectAllCheckbox = screen.getByRole('checkbox', {
      name: 'Select all rows on this page',
    })
    expect(selectAllCheckbox).toBeDisabled()

    const tooltipTrigger = selectAllCheckbox.closest('.disabled-button-tooltip') as HTMLElement
    expect(tooltipTrigger).toBeTruthy()

    await userEvent.hover(tooltipTrigger)

    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'No New or Pending applications are available on this page.',
    )
  })

  it('shows a request failure instead of a no-results state', async () => {
    mockedSearchApplicationReviews.mockRejectedValue(new Error('Oracle unavailable'))

    renderPage()

    expect(
      await screen.findByRole('heading', { name: 'Review queue unavailable' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Unable to retrieve application review search results.'),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'No review records found' }),
    ).not.toBeInTheDocument()
  })
})
