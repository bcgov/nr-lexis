import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { ProvincialApplicationDetail } from '@/interfaces/LexisDetails'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  setupApplicationDetailTests,
  applicationDetail,
  applicationSummarySnapshot,
  chooseComboBoxOption,
  clearComboBox,
  mockApplicationDetailAuth,
  mockedApproveApplicationReview,
  mockedFetchApplicationClientData,
  mockedFetchApplicationSummarySnapshot,
  mockedFetchProvincialApplicationDetail,
  mockedSaveApplicationRemark,
  mockedSendApplicationReviewStatusEmail,
  mockedUpdateApplicationPackage,
  mockedUpdateApplicationReviewStatus,
  mockedUpdateApplicationSummary,
  selectApplicationDetailTab,
  selectApplicationReviewTile,
} from './ProvincialApplicationDetailActions.support'
import ProvincialApplicationDetailsPage from '@/pages/ProvincialApplicationDetails'

describe.sequential('Provincial Application Detail Actions - review', () => {
  beforeEach(setupApplicationDetailTests)

  it('hides remarks and review tabs without legacy remarks/review access', async () => {
    mockApplicationDetailAuth((action: string) => action !== '/applicationRemarks')

    render(
      <MemoryRouter initialEntries={['/provincial/application/321']}>
        <Routes>
          <Route
            path="/provincial/application/:applicationNumber"
            element={<ProvincialApplicationDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    const tabs = await screen.findAllByRole('tab')
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'Owner',
      'Agent',
      'Application',
      'Items',
      'Documents',
      'Offers',
    ])
    expect(screen.queryByRole('tab', { name: 'Remarks' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Review' })).not.toBeInTheDocument()
  })

  it('preserves summary, remark, and review drafts when a package refreshes detail', async () => {
    render(
      <MemoryRouter initialEntries={['/provincial/application/321']}>
        <Routes>
          <Route
            path="/provincial/application/:applicationNumber"
            element={<ProvincialApplicationDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    const locationOfLogs = await screen.findByLabelText('Location of logs')
    fireEvent.change(locationOfLogs, {
      target: { value: 'AB' },
    })
    const newRemark = await screen.findByLabelText('New Remark')
    fireEvent.change(newRemark, {
      target: { value: 'Preserve remark draft' },
    })
    const reviewTile = within(await selectApplicationReviewTile())
    const reviewStatus = reviewTile.getByRole('combobox', { name: 'Application status' })
    await chooseComboBoxOption(reviewStatus, 'Rejected')
    const reviewRemark = reviewTile.getByLabelText('Review remark')
    fireEvent.change(reviewRemark, {
      target: { value: 'Preserve review draft' },
    })
    await selectApplicationDetailTab('Items')
    fireEvent.change(await screen.findByLabelText('Package Comments'), {
      target: { value: 'Saved package change' },
    })
    const detailFetchCountBeforeSave = mockedFetchProvincialApplicationDetail.mock.calls.length
    const savePackageButton = screen.getByRole('button', {
      name: 'Save Package',
    })
    fireEvent.click(savePackageButton)
    await waitFor(() => {
      expect(mockedUpdateApplicationPackage).toHaveBeenCalledTimes(1)
      expect(mockedFetchProvincialApplicationDetail).toHaveBeenCalledTimes(
        detailFetchCountBeforeSave + 1,
      )
      expect(savePackageButton).toBeEnabled()
    })
    expect(await screen.findByText('Package PKG-1 saved.')).toBeInTheDocument()

    expect(locationOfLogs).toBeInTheDocument()
    expect(locationOfLogs).toHaveValue('AB')
    expect(newRemark).toBeInTheDocument()
    expect(newRemark).toHaveValue('Preserve remark draft')
    expect(reviewStatus).toBeInTheDocument()
    expect(reviewStatus).toHaveValue('Rejected')
    expect(reviewRemark).toBeInTheDocument()
    expect(reviewRemark).toHaveValue('Preserve review draft')
  })

  it('saves application remarks and refreshes detail', async () => {
    const detailAfterRemark: ProvincialApplicationDetail = {
      ...applicationDetail,
      remarks: [
        ...applicationDetail.remarks,
        {
          remarkId: 89,
          title: 'New application note',
          remark: 'New application note',
        },
      ],
    }
    mockedFetchProvincialApplicationDetail
      .mockResolvedValueOnce(applicationDetail)
      .mockResolvedValueOnce(detailAfterRemark)

    render(
      <MemoryRouter initialEntries={['/provincial/application/321']}>
        <Routes>
          <Route
            path="/provincial/application/:applicationNumber"
            element={<ProvincialApplicationDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    await selectApplicationDetailTab('Remarks')
    expect(await screen.findByLabelText('New Remark')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('New Remark'), {
      target: { value: 'New application note' },
    })
    await userEvent.click(screen.getByRole('button', { name: 'Save Remark' }))

    await waitFor(() => {
      expect(mockedSaveApplicationRemark).toHaveBeenCalledWith({
        applicationNumber: '321',
        remarkBody: 'New application note',
      })
      expect(mockedFetchProvincialApplicationDetail).toHaveBeenCalledTimes(2)
    })
    expect(await screen.findByText('Application remark saved.')).toBeInTheDocument()
    expect(screen.getAllByText('New application note').length).toBeGreaterThan(0)
  })

  it('shows the explicit remark validation failure without clearing the draft', async () => {
    mockedSaveApplicationRemark.mockResolvedValueOnce({
      success: false,
      status: 'validation_error',
      remarkId: '',
      remark: '',
      title: '',
      user: '',
      message:
        'Application remarks contain unsupported special characters. Remove them and try again.',
    })

    render(
      <MemoryRouter initialEntries={['/provincial/application/321']}>
        <Routes>
          <Route
            path="/provincial/application/:applicationNumber"
            element={<ProvincialApplicationDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    await selectApplicationDetailTab('Remarks')
    const remarkInput = await screen.findByLabelText('New Remark')
    fireEvent.change(remarkInput, { target: { value: 'éè' } })
    await userEvent.click(screen.getByRole('button', { name: 'Save Remark' }))

    expect(
      await screen.findByText(
        'Application remarks contain unsupported special characters. Remove them and try again.',
      ),
    ).toBeInTheDocument()
    expect(remarkInput).toHaveValue('éè')
    expect(mockedFetchProvincialApplicationDetail).toHaveBeenCalledTimes(1)
  })

  it('does not treat a normal remark as a new review-status draft', async () => {
    const rejectedDetail: ProvincialApplicationDetail = {
      ...applicationDetail,
      applicationStatusCode: 'REJ',
      statusDescription: 'Rejected',
      remarks: [
        {
          remarkId: 90,
          title: 'Review decision',
          remark: 'Review decision',
          user: 'idir\\reviewer',
          date: '2026-01-06',
        },
      ],
    }
    const detailAfterNormalRemark: ProvincialApplicationDetail = {
      ...rejectedDetail,
      remarks: [
        {
          remarkId: 91,
          title: 'Operational note',
          remark: 'Operational note',
          user: 'idir\\reviewer',
          date: '2026-01-07',
        },
        ...rejectedDetail.remarks,
      ],
    }
    mockedFetchProvincialApplicationDetail
      .mockResolvedValueOnce(rejectedDetail)
      .mockResolvedValueOnce(detailAfterNormalRemark)
    mockedSaveApplicationRemark.mockResolvedValueOnce({
      success: true,
      remarkId: '91',
      remark: 'Operational note',
      title: 'Operational note',
      user: 'idir\\reviewer',
      status: 'ok',
    })

    render(
      <MemoryRouter initialEntries={['/provincial/application/321']}>
        <Routes>
          <Route
            path="/provincial/application/:applicationNumber"
            element={<ProvincialApplicationDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    await selectApplicationDetailTab('Remarks')
    fireEvent.change(await screen.findByLabelText('New Remark'), {
      target: { value: 'Operational note' },
    })
    await userEvent.click(screen.getByRole('button', { name: 'Save Remark' }))
    await waitFor(() => expect(mockedFetchProvincialApplicationDetail).toHaveBeenCalledTimes(2))

    const unload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(unload)
    expect(unload.defaultPrevented).toBe(false)
    expect(mockedUpdateApplicationReviewStatus).not.toHaveBeenCalled()
  })

  it('hides application remarks tab without application remarks action', async () => {
    mockApplicationDetailAuth((action: string) => action !== '/applicationRemarks')

    render(
      <MemoryRouter initialEntries={['/provincial/application/321']}>
        <Routes>
          <Route
            path="/provincial/application/:applicationNumber"
            element={<ProvincialApplicationDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByRole('tab', { name: 'Owner' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Remarks' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('New Remark')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save Remark' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
  })

  it('updates existing application remarks and refreshes detail', async () => {
    const detailAfterRemarkUpdate: ProvincialApplicationDetail = {
      ...applicationDetail,
      remarks: [
        {
          remarkId: 88,
          title: 'Updated application note',
          remark: 'Updated application note',
        },
      ],
    }
    mockedFetchProvincialApplicationDetail
      .mockResolvedValueOnce(applicationDetail)
      .mockResolvedValueOnce(detailAfterRemarkUpdate)

    render(
      <MemoryRouter initialEntries={['/provincial/application/321']}>
        <Routes>
          <Route
            path="/provincial/application/:applicationNumber"
            element={<ProvincialApplicationDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    await selectApplicationDetailTab('Remarks')
    const remarkRow = (await screen.findByText('ok')).closest('tr')
    expect(remarkRow).toBeTruthy()
    expect(within(remarkRow as HTMLElement).getByText('2026-01-04')).toBeInTheDocument()
    expect(within(remarkRow as HTMLElement).getByText('idir\\reviewer')).toBeInTheDocument()
    await userEvent.click(within(remarkRow as HTMLElement).getByRole('button', { name: 'Edit' }))
    const remarkInput = screen.getByLabelText('Edit Remark 88')
    fireEvent.change(remarkInput, {
      target: { value: 'Updated application note' },
    })
    await userEvent.click(screen.getByRole('button', { name: 'Update Remark' }))

    await waitFor(() => {
      expect(mockedSaveApplicationRemark).toHaveBeenCalledWith({
        applicationNumber: '321',
        remarkBody: 'Updated application note',
        remarkId: '88',
      })
      expect(mockedFetchProvincialApplicationDetail).toHaveBeenCalledTimes(2)
    })
    expect(await screen.findByText('Application remark updated.')).toBeInTheDocument()
    expect(screen.getAllByText('Updated application note').length).toBeGreaterThan(0)
  })

  it('preserves an unrelated remark draft when the summary is saved normally', async () => {
    render(
      <MemoryRouter initialEntries={['/provincial/application/321']}>
        <Routes>
          <Route
            path="/provincial/application/:applicationNumber"
            element={<ProvincialApplicationDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    await selectApplicationDetailTab('Remarks')
    fireEvent.change(await screen.findByLabelText('New Remark'), {
      target: { value: 'Keep this unsaved remark' },
    })
    await selectApplicationDetailTab('Application')
    fireEvent.change(await screen.findByLabelText('Location of logs'), {
      target: { value: 'AB' },
    })
    await userEvent.click(screen.getByRole('button', { name: 'Save Summary' }))
    await waitFor(() => expect(mockedUpdateApplicationSummary).toHaveBeenCalledTimes(1))

    await selectApplicationDetailTab('Remarks')
    expect(screen.getByLabelText('New Remark')).toHaveValue('Keep this unsaved remark')
  })

  it('approves an application from the detail review section and refreshes detail', async () => {
    const detailAfterApproval: ProvincialApplicationDetail = {
      ...applicationDetail,
      applicationStatusCode: 'APP',
      statusDescription: 'Approved',
    }
    mockedFetchProvincialApplicationDetail
      .mockResolvedValueOnce(applicationDetail)
      .mockResolvedValueOnce(detailAfterApproval)

    render(
      <MemoryRouter initialEntries={['/provincial/application/321']}>
        <Routes>
          <Route
            path="/provincial/application/:applicationNumber"
            element={<ProvincialApplicationDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    await selectApplicationDetailTab('Review')
    expect(await screen.findByRole('heading', { name: /application review/i })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Approve Application' }))

    await waitFor(() => {
      expect(mockedApproveApplicationReview).toHaveBeenCalledWith('321')
      expect(mockedFetchProvincialApplicationDetail).toHaveBeenCalledTimes(1)
    })
    expect(await screen.findByText('Application approved.')).toBeInTheDocument()
    expect(screen.getAllByText('Approved').length).toBeGreaterThan(0)
  })

  it('prefills application review email from the applicant client data', async () => {
    render(
      <MemoryRouter initialEntries={['/provincial/application/321']}>
        <Routes>
          <Route
            path="/provincial/application/:applicationNumber"
            element={<ProvincialApplicationDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    const reviewTile = await selectApplicationReviewTile()
    await waitFor(() => {
      expect(within(reviewTile).getByLabelText(/client email address/i)).toHaveValue(
        'agent@example.test',
      )
    })
    expect(within(reviewTile).getByLabelText(/client email address/i)).not.toHaveAttribute(
      'readonly',
    )
    expect(
      within(reviewTile).getByText(
        "Defaults from the applicant's Oracle client-location email. Changes apply only to this notification.",
      ),
    ).toBeInTheDocument()
  })

  it('shows the owner client-location email without a separate notification field', async () => {
    mockedFetchProvincialApplicationDetail.mockResolvedValueOnce({
      ...applicationDetail,
      agentClientNumber: null,
    })
    mockedFetchApplicationSummarySnapshot.mockResolvedValueOnce({
      ...applicationSummarySnapshot,
      applicantTypeCode: 'O',
      agentClientNumber: '',
      agentClientLocationCode: '',
      agentContactName: '',
    })

    render(
      <MemoryRouter initialEntries={['/provincial/application/321']}>
        <Routes>
          <Route
            path="/provincial/application/:applicationNumber"
            element={<ProvincialApplicationDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    await selectApplicationDetailTab('Owner')
    expect(await screen.findByText('owner@example.test')).toBeInTheDocument()
    expect(screen.queryByText('Notification email')).not.toBeInTheDocument()
  })

  it('defaults owner application review mail to the owner client-location email', async () => {
    mockedFetchProvincialApplicationDetail.mockReset().mockResolvedValue({
      ...applicationDetail,
      agentClientNumber: null,
    })
    mockedFetchApplicationSummarySnapshot.mockReset().mockResolvedValue({
      ...applicationSummarySnapshot,
      applicantTypeCode: 'O',
      agentClientNumber: '',
      agentClientLocationCode: '',
      agentContactName: '',
    })

    render(
      <MemoryRouter initialEntries={['/provincial/application/321']}>
        <Routes>
          <Route
            path="/provincial/application/:applicationNumber"
            element={<ProvincialApplicationDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    const reviewTile = await selectApplicationReviewTile()
    await waitFor(() => {
      expect(within(reviewTile).getByLabelText(/client email address/i)).toHaveValue(
        'owner@example.test',
      )
    })
  })

  it('updates a single rejection with the loaded client email without sending email', async () => {
    mockedUpdateApplicationReviewStatus.mockResolvedValueOnce({
      updated: true,
      valid: true,
      statusCode: 'REJ',
      clientEmail: 'agent@example.test',
      remark: 'Cannot approve this application',
      remarkId: 99,
      remarkUser: 'idir\\reviewer',
      remarkDate: '2026-01-05T10:15:00Z',
      message: 'Application status updated.',
    })

    render(
      <MemoryRouter initialEntries={['/provincial/application/321']}>
        <Routes>
          <Route
            path="/provincial/application/:applicationNumber"
            element={<ProvincialApplicationDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    const reviewTile = await selectApplicationReviewTile()
    const reviewControls = within(reviewTile)
    await chooseComboBoxOption(
      reviewControls.getByRole('combobox', { name: /application status/i }),
      'Rejected',
    )
    await waitFor(() => {
      expect(reviewControls.getByLabelText(/client email address/i)).toHaveValue(
        'agent@example.test',
      )
    })
    fireEvent.change(reviewControls.getByLabelText(/review remark/i), {
      target: { value: 'Cannot approve this application' },
    })
    await userEvent.click(reviewControls.getByRole('button', { name: 'Update Review Status' }))

    await waitFor(() => {
      expect(mockedUpdateApplicationReviewStatus).toHaveBeenCalledWith('321', {
        statusCode: 'REJ',
        remark: 'Cannot approve this application',
        clientEmailAddress: 'agent@example.test',
      })
    })
    expect(mockedSendApplicationReviewStatusEmail).not.toHaveBeenCalled()
    expect(await screen.findByText('Application status updated.')).toBeInTheDocument()
  })

  it('loads persisted review status remark without treating placeholder email as persisted', async () => {
    const expiredDetail: ProvincialApplicationDetail = {
      ...applicationDetail,
      applicationStatusCode: 'EXP',
      statusDescription: 'Expired',
      remarks: [
        {
          remarkId: 99,
          title: 'Expired after review',
          remark: 'Expired after review',
          user: 'idir\\reviewer',
          date: '2026-01-06',
        },
        ...applicationDetail.remarks,
      ],
    }
    mockedFetchProvincialApplicationDetail.mockResolvedValue(expiredDetail)
    mockedFetchApplicationClientData.mockResolvedValue({
      clientNumber: '00033344',
      companyName: 'Agent Export Services',
      address: '44 Agent Road',
      city: 'Nanaimo',
      province: 'BC',
      postalCode: 'V9R 1A1',
      country: 'Canada',
      phone: '250-555-0102',
      fax: '',
      email: 'Not on file',
      notfound: '',
    })

    render(
      <MemoryRouter initialEntries={['/provincial/application/321']}>
        <Routes>
          <Route
            path="/provincial/application/:applicationNumber"
            element={<ProvincialApplicationDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    const reviewTile = await selectApplicationReviewTile()
    await waitFor(() => {
      expect(
        within(reviewTile).getByRole('combobox', {
          name: /application status/i,
        }),
      ).toHaveValue('Expired')
    })
    expect(within(reviewTile).getByLabelText(/review remark/i)).toHaveValue('Expired after review')
    expect(within(reviewTile).getByLabelText(/client email address/i)).toHaveValue('')
    expect(
      within(reviewTile).getByRole('combobox', {
        name: /application status/i,
      }),
    ).toBeDisabled()
    expect(within(reviewTile).getByLabelText(/review remark/i)).toBeDisabled()
    expect(within(reviewTile).getByLabelText(/client email address/i)).toBeDisabled()
    expect(
      within(reviewTile).queryByRole('button', { name: 'Approve Application' }),
    ).not.toBeInTheDocument()
    expect(
      within(reviewTile).queryByRole('button', { name: 'Update Review Status' }),
    ).not.toBeInTheDocument()
    expect(
      within(reviewTile).queryByRole('button', { name: 'Update Status and Send Email' }),
    ).not.toBeInTheDocument()
  })

  it('blocks status email when the authoritative client account has no valid address', async () => {
    mockedFetchApplicationClientData.mockResolvedValue({
      clientNumber: '00033344',
      companyName: 'Applicant without email',
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

    render(
      <MemoryRouter initialEntries={['/provincial/application/321']}>
        <Routes>
          <Route
            path="/provincial/application/:applicationNumber"
            element={<ProvincialApplicationDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    const reviewTile = await selectApplicationReviewTile()
    const reviewControls = within(reviewTile)
    await waitFor(() =>
      expect(reviewControls.getByLabelText(/client email address/i)).toHaveValue(''),
    )
    await chooseComboBoxOption(
      reviewControls.getByRole('combobox', { name: /application status/i }),
      'Rejected',
    )
    await userEvent.type(reviewControls.getByLabelText(/review remark/i), 'Missing recipient')
    await userEvent.click(
      reviewControls.getByRole('button', {
        name: 'Update Status and Send Email',
      }),
    )

    expect(
      (await screen.findAllByText('Enter one valid client email address.')).length,
    ).toBeGreaterThan(0)
    expect(mockedUpdateApplicationReviewStatus).not.toHaveBeenCalled()
    expect(mockedSendApplicationReviewStatusEmail).not.toHaveBeenCalled()
  })

  it('updates application review status and can send status email from detail', async () => {
    const detailAfterStatusUpdate: ProvincialApplicationDetail = {
      ...applicationDetail,
      applicationStatusCode: 'REJ',
      statusDescription: 'Rejected',
    }
    mockedFetchProvincialApplicationDetail
      .mockResolvedValueOnce(applicationDetail)
      .mockResolvedValueOnce(detailAfterStatusUpdate)
    mockedUpdateApplicationReviewStatus.mockResolvedValueOnce({
      updated: true,
      valid: true,
      statusCode: 'REJ',
      clientEmail: 'edited.client@example.test',
      remark: 'Needs correction',
      remarkId: 99,
      remarkUser: 'idir\\reviewer',
      remarkDate: '2026-01-05T10:15:00Z',
      message: 'Application status updated.',
    })

    render(
      <MemoryRouter initialEntries={['/provincial/application/321']}>
        <Routes>
          <Route
            path="/provincial/application/:applicationNumber"
            element={<ProvincialApplicationDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    const reviewTile = await selectApplicationReviewTile()
    await waitFor(() => {
      expect(within(reviewTile).getByLabelText(/client email address/i)).toHaveValue(
        'agent@example.test',
      )
    })
    await chooseComboBoxOption(
      within(reviewTile).getByRole('combobox', { name: /application status/i }),
      'Rejected',
    )
    fireEvent.change(within(reviewTile).getByLabelText(/client email address/i), {
      target: { value: 'edited.client@example.test' },
    })
    await userEvent.type(within(reviewTile).getByLabelText(/review remark/i), 'Needs correction')
    expect(within(reviewTile).getByLabelText(/client email address/i)).toHaveValue(
      'edited.client@example.test',
    )
    mockedSendApplicationReviewStatusEmail.mockResolvedValueOnce({
      success: false,
      message: 'Application status email is not configured yet. No email was sent.',
    })
    await userEvent.click(
      within(reviewTile).getByRole('button', {
        name: 'Update Status and Send Email',
      }),
    )

    await waitFor(() => {
      expect(mockedUpdateApplicationReviewStatus).toHaveBeenCalledWith('321', {
        statusCode: 'REJ',
        remark: 'Needs correction',
        clientEmailAddress: 'edited.client@example.test',
      })
      expect(mockedSendApplicationReviewStatusEmail).toHaveBeenCalledWith('321', {
        statusCode: 'REJ',
        remark: 'Needs correction',
        clientEmailAddress: 'edited.client@example.test',
      })
      expect(mockedFetchProvincialApplicationDetail).toHaveBeenCalledTimes(1)
    })
    expect(
      await screen.findByText(
        'Application status email is not configured yet. The application status was updated, but no email was sent.',
      ),
    ).toBeInTheDocument()
    expect(within(reviewTile).getByLabelText(/client email address/i)).toHaveValue(
      'edited.client@example.test',
    )
    expect(within(reviewTile).getByLabelText(/review remark/i)).toHaveValue('Needs correction')
    expect(screen.getAllByText('Rejected').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Needs correction').length).toBeGreaterThan(0)
  })

  it('validates application review status before updating from detail', async () => {
    render(
      <MemoryRouter initialEntries={['/provincial/application/321']}>
        <Routes>
          <Route
            path="/provincial/application/:applicationNumber"
            element={<ProvincialApplicationDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    const reviewTile = await selectApplicationReviewTile()
    await clearComboBox(within(reviewTile).getByRole('combobox', { name: /application status/i }))
    await userEvent.click(within(reviewTile).getByRole('button', { name: 'Update Review Status' }))

    expect(
      screen.getByText('Choose an application status before updating review status.'),
    ).toBeInTheDocument()
    expect(mockedUpdateApplicationReviewStatus).not.toHaveBeenCalled()
  })

  it.each(['Rejected', 'Withdrawn', 'Expired'])(
    'requires review remark before setting application status to %s',
    async (statusLabel) => {
      render(
        <MemoryRouter initialEntries={['/provincial/application/321']}>
          <Routes>
            <Route
              path="/provincial/application/:applicationNumber"
              element={<ProvincialApplicationDetailsPage />}
            />
          </Routes>
        </MemoryRouter>,
      )

      const reviewTile = await selectApplicationReviewTile()
      await chooseComboBoxOption(
        within(reviewTile).getByRole('combobox', {
          name: /application status/i,
        }),
        statusLabel,
      )
      await userEvent.click(
        within(reviewTile).getByRole('button', {
          name: 'Update Review Status',
        }),
      )

      expect(within(reviewTile).getByLabelText(/review remark/i)).toBeInvalid()
      expect(
        screen.getByText(
          'Review remark is required when rejecting, withdrawing, or expiring an application.',
        ),
      ).toBeInTheDocument()
      expect(mockedUpdateApplicationReviewStatus).not.toHaveBeenCalled()
    },
  )

  it('validates application remark before saving', async () => {
    render(
      <MemoryRouter initialEntries={['/provincial/application/321']}>
        <Routes>
          <Route
            path="/provincial/application/:applicationNumber"
            element={<ProvincialApplicationDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    await selectApplicationDetailTab('Remarks')
    expect(await screen.findByLabelText('New Remark')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Save Remark' }))

    expect(screen.getByText('Remark is required.')).toBeInTheDocument()
    expect(mockedSaveApplicationRemark).not.toHaveBeenCalled()
  })
})
