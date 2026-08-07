import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/context/auth/useAuth'
import { useDefaultRegionPreference } from '@/pages/shared/useDefaultRegionPreference'
import type { ApplicationReviewSearchResponse } from '@/interfaces/ApplicationReviewSearch'
import ProvincialReviewPage from '@/pages/ProvincialReview'
import { clearAllPageDataCache } from '@/pages/shared/page-data-cache'
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

vi.mock('@/pages/shared/useDefaultRegionPreference', () => ({
  useDefaultRegionPreference: vi.fn(),
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
const mockedUseDefaultRegionPreference = vi.mocked(useDefaultRegionPreference)
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
      volume: 1,
      speciesEndUse: 'LOG',
      listingDate: '2026-02-01',
      status: 'NEW',
      region: '11',
      showInfoIcon: false,
    },
    {
      applicationNumber: '1000456',
      volume: 1212,
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

const renderPage = (
  initialEntry = '/provincial/review?region=11,12&page=1&pageSize=100&sortField=applicationNumber&sortDirection=desc',
) => {
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/provincial/review" element={<ProvincialReviewPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

const confirmSelectedApplicationApproval = async () => {
  await userEvent.click(screen.getByRole('button', { name: 'Approve Selected Applications' }))
  const dialog = await screen.findByRole('dialog', { name: 'Approve applications' })
  await userEvent.click(within(dialog).getByRole('button', { name: 'Approve' }))
}

Element.prototype.scrollIntoView = vi.fn()

describe('Provincial Review Action State Smoke', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseDefaultRegionPreference.mockReturnValue({
      defaultRegion: null,
      preferenceLoading: false,
    })
    clearAllPageDataCache()
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

  it('renders the latest review response when the cache is invalidated in flight', async () => {
    let resolveSearch: (response: ApplicationReviewSearchResponse) => void = () => {}
    mockedSearchApplicationReviews.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSearch = resolve
      }),
    )

    renderPage()
    await waitFor(() => expect(mockedSearchApplicationReviews).toHaveBeenCalledTimes(1))

    clearAllPageDataCache()
    await act(async () => {
      resolveSearch(reviewResponse)
    })

    expect(await screen.findByText('1000123')).toBeInTheDocument()
    expect(screen.queryByText('No review records found')).not.toBeInTheDocument()
  })

  it('uses the legacy provincial application review page title', async () => {
    renderPage()

    expect(
      await screen.findByRole('heading', { name: 'Provincial application review' }),
    ).toBeInTheDocument()
  })

  it('places the search action last and includes the search icon', async () => {
    renderPage()
    await screen.findByText('1000123')

    const searchActions = screen.getByRole('group', { name: 'Review search actions' })
    expect(
      within(searchActions)
        .getAllByRole('button')
        .map((button) => button.textContent?.trim()),
    ).toEqual(['Clear all', 'Search'])
    expect(
      within(searchActions).getByRole('button', { name: 'Search' }).querySelector('svg'),
    ).not.toBeNull()
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

    const approveButtons = screen.getAllByRole('button', { name: 'Approve' })
    const disapproveButtons = screen.getAllByRole('button', { name: 'Disapprove' })
    expect(approveButtons[0]).toBeEnabled()
    expect(approveButtons[1]).toBeEnabled()
    expect(disapproveButtons[0]).toBeEnabled()
    expect(disapproveButtons[1]).toBeEnabled()

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
      'Application',
      'Status',
      'Application volume (m³)',
      'Species end use sort',
      'Listing date',
      'Region',
      'Actions',
    ])
  })

  it('renders application volume with legacy one-decimal precision', async () => {
    renderPage()
    await screen.findByText('1000456')

    expect(screen.getByText('1.0')).toBeInTheDocument()
    expect(screen.getByText('1212.0')).toBeInTheDocument()
  })

  it('waits for explicit submission while the application number is typed', async () => {
    renderPage()
    await screen.findByText('1000123')
    mockedSearchApplicationReviews.mockClear()

    const applicationNumberInput = screen.getByLabelText('Application number')
    for (const value of ['4', '46', '460', '4605', '46053']) {
      fireEvent.change(applicationNumberInput, { target: { value } })
    }

    expect(mockedSearchApplicationReviews).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Search' }))

    await waitFor(() => {
      expect(mockedSearchApplicationReviews).toHaveBeenCalledTimes(1)
      expect(mockedSearchApplicationReviews).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: expect.objectContaining({ applicationNumber: '46053' }),
        }),
        expect.any(Object),
      )
    })
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

    await userEvent.click(screen.getByRole('button', { name: 'Application' }))

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

    const dialog = await screen.findByRole('dialog', { name: 'Approve applications' })
    expect(within(dialog).getByRole('list', { name: 'Applications to approve' })).toHaveTextContent(
      '1000456',
    )
    expect(mockedApproveApplicationReview).not.toHaveBeenCalled()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Approve' }))

    await waitFor(() => {
      expect(mockedApproveApplicationReview).toHaveBeenCalledTimes(1)
      expect(mockedApproveApplicationReview).toHaveBeenCalledWith(
        '1000456',
        'application-1000456-version',
      )
    })
    expect(await screen.findByText('Approved 1 application(s).')).toBeInTheDocument()
  })

  it('approves a single reviewable application from the row action', async () => {
    renderPage()
    await screen.findByText('1000456')

    const pendingRow = screen.getByText('1000456').closest('tr')
    expect(pendingRow).not.toBeNull()
    await userEvent.click(
      within(pendingRow as HTMLTableRowElement).getByRole('button', { name: 'Approve' }),
    )

    await waitFor(() => {
      expect(mockedApproveApplicationReview).toHaveBeenCalledTimes(1)
      expect(mockedApproveApplicationReview).toHaveBeenCalledWith(
        '1000456',
        'application-1000456-version',
      )
    })
    expect(await screen.findByText('Approved 1 application(s).')).toBeInTheDocument()
  })

  it('disapproves a single NEW row and sends email only when opted in', async () => {
    renderPage()
    await screen.findByText('1000123')

    await userEvent.click(screen.getAllByRole('button', { name: 'Disapprove' })[0])

    await waitFor(() => {
      expect(mockedFetchApplicationSummarySnapshot).toHaveBeenCalledWith('1000123')
    })
    await waitFor(() => {
      expect(screen.getByLabelText('Send to:')).toHaveValue('client@example.com')
    })

    expect(screen.getByRole('combobox', { name: 'Application status' })).toHaveValue('Rejected')
    const sendStatusEmailCheckbox = screen.getByRole('checkbox', { name: 'Send status email' })
    expect(sendStatusEmailCheckbox).not.toBeChecked()
    expect(screen.queryByText('Application review')).not.toBeInTheDocument()
    await userEvent.click(sendStatusEmailCheckbox)
    expect(sendStatusEmailCheckbox).toBeChecked()
    expect(screen.getByLabelText('Send to:')).not.toHaveAttribute('readonly')
    expect(
      screen.queryByText(
        "Defaults from the applicant's Oracle client-location email. Changes apply only to this notification.",
      ),
    ).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Send to:'), {
      target: { value: 'edited.client@example.com' },
    })
    await userEvent.type(screen.getByLabelText('Remarks'), 'Rejected from review queue')
    expect(screen.getByLabelText('Remarks')).toHaveAttribute('rows', '6')
    expect(screen.getByLabelText('Send to:')).toHaveValue('edited.client@example.com')
    const saveButton = screen.getByRole('button', { name: 'Save' })
    expect(saveButton).toHaveClass('cds--btn--primary')
    expect(saveButton).not.toHaveClass('cds--btn--danger')
    await userEvent.click(saveButton)

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
      await screen.findByText('Updated application 1000123 and email sent.'),
    ).toBeInTheDocument()
  }, 15000)

  it('prefills an owner disapproval with the owner client-location email', async () => {
    renderPage()
    await screen.findByText('1000123')
    await userEvent.click(screen.getAllByRole('button', { name: 'Disapprove' })[0])

    await waitFor(() => {
      expect(screen.getByLabelText('Send to:')).toHaveValue('client@example.com')
    })
  })

  it('disapproves a single PND row through the same review workflow', async () => {
    mockedFetchApplicationSummarySnapshot.mockResolvedValueOnce({
      ...applicationSummary,
      applicationNumber: '1000456',
      applicationStatusCode: 'PND',
    })

    renderPage()
    await screen.findByText('1000456')

    await userEvent.click(screen.getAllByRole('button', { name: 'Disapprove' })[1])

    await waitFor(() => {
      expect(mockedFetchApplicationSummarySnapshot).toHaveBeenCalledWith('1000456')
      expect(screen.getByLabelText('Send to:')).toHaveValue('client@example.com')
    })

    await userEvent.click(screen.getByRole('checkbox', { name: 'Send status email' }))
    await userEvent.type(screen.getByLabelText('Remarks'), 'Pending application rejected')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

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
      await screen.findByText('Updated application 1000456 and email sent.'),
    ).toBeInTheDocument()
  }, 15000)

  it('expires a federal review row without attempting a status email', async () => {
    mockedFetchApplicationSummarySnapshot.mockResolvedValueOnce({
      ...applicationSummary,
      jurisdictionCode: 'F',
    })

    renderPage()
    await screen.findByText('1000123')
    await userEvent.click(screen.getAllByRole('button', { name: 'Disapprove' })[0])
    await waitFor(() => expect(screen.getByLabelText('Send to:')).toHaveValue('client@example.com'))

    const statusSelect = screen.getByRole('combobox', { name: 'Application status' })
    await userEvent.click(statusSelect)
    const listboxId = statusSelect.getAttribute('aria-controls')
    const listbox = listboxId ? document.getElementById(listboxId) : null
    expect(listbox).not.toBeNull()
    await userEvent.click(within(listbox as HTMLElement).getByRole('option', { name: 'Expired' }))

    expect(screen.getByRole('checkbox', { name: 'Send status email' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Send status email' })).toBeDisabled()
    expect(
      screen.queryByText('Status emails are sent only for rejected or withdrawn applications.'),
    ).not.toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('Remarks'), 'Expired after manual review')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

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

    await userEvent.click(screen.getAllByRole('button', { name: 'Disapprove' })[0])

    await waitFor(() => {
      expect(mockedFetchApplicationClientData).toHaveBeenCalledWith('00012345', '00')
      expect(mockedFetchApplicationClientData).toHaveBeenCalledWith('00054321', '02')
      expect(screen.getByLabelText('Send to:')).toHaveValue('agent@example.com')
    })

    await userEvent.click(screen.getByRole('checkbox', { name: 'Send status email' }))
    await userEvent.type(screen.getByLabelText('Remarks'), 'Rejected from review queue')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

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
  }, 15000)

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
    await userEvent.click(screen.getAllByRole('button', { name: 'Disapprove' })[0])

    await waitFor(() => expect(screen.getByLabelText('Send to:')).toHaveValue('owner@example.com'))
  })

  it('validates single-row disapproval before status update', async () => {
    renderPage()
    await screen.findByText('1000123')

    await userEvent.click(screen.getAllByRole('button', { name: 'Disapprove' })[0])
    await waitFor(() => expect(screen.getByLabelText('Send to:')).toHaveValue('client@example.com'))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

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

    await userEvent.click(screen.getAllByRole('button', { name: 'Disapprove' })[0])

    await waitFor(() => expect(screen.getByLabelText('Send to:')).not.toBeDisabled())
    expect(screen.getByLabelText('Send to:')).toHaveValue('')
    expect(
      screen.queryByText('Enter one valid client email address or deselect Send status email.'),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText(
        'No client email was found. Enter an email address or deselect Send status email.',
      ),
    ).not.toBeInTheDocument()

    const sendStatusEmailCheckbox = screen.getByRole('checkbox', { name: 'Send status email' })
    expect(sendStatusEmailCheckbox).not.toBeChecked()
    await userEvent.click(sendStatusEmailCheckbox)
    await userEvent.type(screen.getByLabelText('Remarks'), 'Rejected from review queue')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(
      (
        await screen.findAllByText(
          'Enter one valid client email address or deselect Send status email.',
        )
      ).length,
    ).toBeGreaterThan(0)
    expect(mockedUpdateApplicationReviewStatus).not.toHaveBeenCalled()
    expect(mockedSendApplicationReviewStatusEmail).not.toHaveBeenCalled()
  }, 15000)

  it('updates a rejected application without sending email by default', async () => {
    renderPage()
    await screen.findByText('1000123')

    await userEvent.click(screen.getAllByRole('button', { name: 'Disapprove' })[0])
    await waitFor(() => expect(screen.getByLabelText('Send to:')).toHaveValue('client@example.com'))

    expect(screen.getByRole('checkbox', { name: 'Send status email' })).not.toBeChecked()
    expect(screen.getByLabelText('Send to:')).not.toHaveAttribute('readonly')

    await userEvent.type(screen.getByLabelText('Remarks'), 'Rejected without notification')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

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
  }, 15000)

  it('leaves regions unfiltered and waits for an explicit search', async () => {
    renderPage('/provincial/review')

    expect(
      await screen.findByRole('combobox', { name: /^Region\s*Total items selected:\s*0/ }),
    ).toBeVisible()
    expect(mockedSearchApplicationReviews).not.toHaveBeenCalled()
    const reviewQueue = screen.getByRole('region', { name: 'Review queue', hidden: true })
    expect(reviewQueue.closest('[hidden]')).toHaveStyle({ display: 'none' })
    expect(reviewQueue).not.toBeVisible()

    await userEvent.click(screen.getByRole('button', { name: 'Search' }))
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
    expect(mockedSearchApplicationReviews).toHaveBeenCalledTimes(1)
  })

  it('uses the saved region to preselect review search areas', async () => {
    mockedUseDefaultRegionPreference.mockReturnValue({
      defaultRegion: 'RNI',
      preferenceLoading: false,
    })
    mockedFetchApplicationReviewOptions.mockResolvedValueOnce({
      productTypes: [],
      regions: [
        { value: '1903', label: 'Cariboo' },
        { value: '1905', label: 'Northeast' },
        { value: '1906', label: 'Omineca' },
        { value: '1908', label: 'Skeena' },
      ],
      reviewStatuses: [],
    })

    renderPage('/provincial/review')

    expect(
      await screen.findByRole('combobox', { name: /^Region\s*Total items selected:\s*3/ }),
    ).toBeVisible()
    expect(screen.queryByRole('list', { name: 'Selected regions' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Search' }))
    await waitFor(() => {
      expect(mockedSearchApplicationReviews).toHaveBeenLastCalledWith(
        expect.objectContaining({
          filters: expect.objectContaining({ region: ['1905', '1906', '1908'] }),
        }),
        expect.objectContaining({ knownTotal: expect.any(Number) }),
      )
    })
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
    await confirmSelectedApplicationApproval()

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

  it('reports bulk approval failures by application and keeps failed rows selected', async () => {
    mockedSearchApplicationReviews.mockResolvedValue(twoNewReviewResponse)
    mockedApproveApplicationReview
      .mockResolvedValueOnce({
        updated: true,
        valid: true,
        statusCode: 'APP',
        clientEmail: '',
        remark: '',
        message: 'Application approved.',
      })
      .mockResolvedValueOnce({
        updated: false,
        valid: false,
        statusCode: 'APP',
        clientEmail: '',
        remark: '',
        message: 'Application owner location does not exist.',
      })

    renderPage()
    await screen.findByText('2000001')

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select all rows on this page' }))
    await confirmSelectedApplicationApproval()

    expect(
      await screen.findByText(
        'Approved 1 application(s); 1 failed. Failed applications: 2000002 — Application owner location does not exist.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('Approval partially completed')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Select 2000001' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Select 2000002' })).toBeChecked()
    expect(mockedSendApplicationReviewStatusEmail).not.toHaveBeenCalled()
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

    renderPage('/provincial/review?applicationNumber=1000123&region=')
    await screen.findByText('1000123')
    await waitFor(() => {
      expect(mockedFetchApplicationReviewOptions).toHaveBeenCalledTimes(1)
    })
    mockedSearchApplicationReviews.mockClear()

    const regionComboBox = screen.getByRole('combobox', { name: /^Region/ })
    await userEvent.click(regionComboBox)
    fireEvent.change(regionComboBox, { target: { value: 'TST' } })
    await userEvent.click(await screen.findByRole('option', { name: 'TST' }))

    expect(mockedSearchApplicationReviews).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Search' }))

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

  it('shows selected review search regions in the default Carbon multi-select', async () => {
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

    expect(
      await screen.findByRole('combobox', { name: /^Region\s*Total items selected:\s*2/ }),
    ).toBeVisible()
    expect(screen.queryByRole('list', { name: 'Selected regions' })).not.toBeInTheDocument()
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
    const reviewRow = screen.getByText('1000123').closest('tr') as HTMLTableRowElement
    expect(rowCheckbox).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: 'Select all rows on this page' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Approve Selected Applications' })).toBeDisabled()
    expect(within(reviewRow).getByRole('button', { name: 'Approve' })).toBeDisabled()
    expect(within(reviewRow).getByRole('button', { name: 'Disapprove' })).toBeDisabled()

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
