import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  createMemoryRouter,
  Link,
  MemoryRouter,
  Route,
  RouterProvider,
  Routes,
} from 'react-router-dom'
import type { ProvincialApplicationDetail } from '@/interfaces/LexisDetails'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  setupApplicationDetailTests,
  applicationDetail,
  applicationSummarySnapshot,
  mockApplicationDetailAuth,
  mockedApproveApplicationReview,
  mockedFetchApplicationClientData,
  mockedFetchApplicationClientLocations,
  mockedFetchApplicationPermits,
  mockedFetchApplicationSummarySnapshot,
  mockedFetchProvincialApplicationDetail,
  mockedSaveApplicationRemark,
  mockedSendApplicationReviewStatusEmail,
  mockedUpdateApplicationPackage,
  mockedUpdateApplicationReviewStatus,
  mockedUpdateApplicationSummary,
  selectApplicationDetailTab,
  selectApplicationItemsForEditing,
  selectApplicationRemarksForEditing,
  selectApplicationReviewTile,
  selectApplicationSummaryTile,
} from './ProvincialApplicationDetailActions.support'
import ProvincialApplicationDetailsPage from '@/pages/ProvincialApplicationDetails'

const reviewableApplicationDetail: ProvincialApplicationDetail = {
  ...applicationDetail,
  applicationStatusCode: 'NEW',
  statusDescription: 'New',
}

describe.sequential('Provincial Application Detail Actions - review', () => {
  beforeEach(() => {
    setupApplicationDetailTests()
    mockedFetchProvincialApplicationDetail
      .mockReset()
      .mockResolvedValue(reviewableApplicationDetail)
  })

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
      'Applicant',
      'Application',
      'Scale',
      'Documents',
      'Offers',
    ])
    expect(screen.queryByRole('tab', { name: 'Remarks' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Review' })).not.toBeInTheDocument()
  })

  it('keeps remark and review forms behind explicit actions', async () => {
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
    expect(await screen.findByRole('button', { name: 'Add remark' })).toBeInTheDocument()
    expect(screen.queryByLabelText('New Remark')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Add remark' }))
    const addRemarkInput = await screen.findByLabelText('New Remark')
    expect(addRemarkInput).toHaveAttribute('maxlength', '250')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByLabelText('New Remark')).not.toBeInTheDocument()

    const reviewTile = await selectApplicationReviewTile(false)
    const review = within(reviewTile)
    expect(review.getByRole('button', { name: 'Update status' })).toBeInTheDocument()
    expect(review.queryByRole('group', { name: /Application status/ })).not.toBeInTheDocument()

    await userEvent.click(review.getByRole('button', { name: 'Update status' }))
    expect(await review.findByRole('group', { name: /Application status/ })).toBeInTheDocument()
    await userEvent.click(review.getByRole('button', { name: 'Cancel' }))
    expect(review.queryByRole('group', { name: /Application status/ })).not.toBeInTheDocument()
  })

  it('keeps an approved application review editable for legacy status correction', async () => {
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...reviewableApplicationDetail,
      applicationStatusCode: 'APP',
      statusDescription: 'Approved',
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

    const reviewTile = await selectApplicationReviewTile(false)
    const review = within(reviewTile)
    await userEvent.click(review.getByRole('button', { name: 'Update status' }))

    expect(await review.findByRole('group', { name: /Application status/ })).toBeInTheDocument()
    expect(review.getByRole('button', { name: 'Update status' })).toBeInTheDocument()
    expect(review.queryByRole('button', { name: 'Approve application' })).not.toBeInTheDocument()
  })

  it('keeps remarks read-only when application detail editing is not allowed', async () => {
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...reviewableApplicationDetail,
      applicationStatusCode: 'PMT',
      statusDescription: 'Permitted',
      canEditApplicationDetails: false,
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
    expect(screen.queryByRole('button', { name: 'Add remark' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(await screen.findByText('ok')).toBeInTheDocument()
  })

  // This crosses four async detail sections and refreshes the page under coverage.
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

    await selectApplicationSummaryTile()
    const exemptionTerm = await screen.findByLabelText('Exemption term (days)')
    fireEvent.change(exemptionTerm, {
      target: { value: '181' },
    })
    await selectApplicationRemarksForEditing()
    const newRemark = await screen.findByLabelText('New Remark')
    fireEvent.change(newRemark, {
      target: { value: 'Preserve remark draft' },
    })
    const reviewTile = within(await selectApplicationReviewTile())
    await userEvent.click(reviewTile.getByRole('radio', { name: 'Rejected' }))
    const reviewRemark = reviewTile.getByLabelText('Remarks')
    expect(reviewTile.getByText('Saved to the Remarks tab.')).toBeInTheDocument()
    fireEvent.change(reviewRemark, {
      target: { value: 'Preserve review draft' },
    })
    await selectApplicationItemsForEditing()
    fireEvent.change(await screen.findByLabelText('Package Comments'), {
      target: { value: 'Saved package change' },
    })
    const detailFetchCountBeforeSave = mockedFetchProvincialApplicationDetail.mock.calls.length
    const savePackageButton = screen.getByRole('button', {
      name: 'Save package',
    })
    await waitFor(() => expect(savePackageButton).toBeEnabled())
    fireEvent.click(savePackageButton)
    await waitFor(() => {
      expect(mockedUpdateApplicationPackage).toHaveBeenCalledTimes(1)
      expect(mockedFetchProvincialApplicationDetail).toHaveBeenCalledTimes(
        detailFetchCountBeforeSave + 1,
      )
    })
    expect(screen.queryByRole('button', { name: 'Save package' })).not.toBeInTheDocument()
    expect(await screen.findByText('Package PKG-1 saved.')).toBeInTheDocument()

    expect(exemptionTerm).toBeInTheDocument()
    expect(exemptionTerm).toHaveValue(181)
    expect(newRemark).toBeInTheDocument()
    expect(newRemark).toHaveValue('Preserve remark draft')
    await selectApplicationDetailTab('Review')
    expect(reviewTile.getByRole('radio', { name: 'Rejected' })).toBeChecked()
    expect(reviewRemark).toBeInTheDocument()
    expect(reviewRemark).toHaveValue('Preserve review draft')
  }, 30_000)

  it('saves application remarks and refreshes detail', async () => {
    const detailAfterRemark: ProvincialApplicationDetail = {
      ...reviewableApplicationDetail,
      remarks: [
        ...reviewableApplicationDetail.remarks,
        {
          remarkId: 89,
          title: 'New application note',
          remark: 'New application note',
        },
      ],
    }
    mockedFetchProvincialApplicationDetail
      .mockResolvedValueOnce(reviewableApplicationDetail)
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

    await selectApplicationRemarksForEditing()
    expect(await screen.findByLabelText('New Remark')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('New Remark'), {
      target: { value: 'New application note' },
    })
    await userEvent.click(screen.getByRole('button', { name: 'Save remark' }))

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

  it('gates industry document uploads while permits refresh after a save', async () => {
    const industryDetail: ProvincialApplicationDetail = {
      ...reviewableApplicationDetail,
      industryUser: true,
    }
    let resolveRefreshedPermits:
      | ((value: { permitNumber: string; permitStatusDescription: string }[]) => void)
      | undefined
    mockApplicationDetailAuth(() => true, ['LEXIS_PROVINCIAL_SUBMITTER_00011122'])
    mockedFetchProvincialApplicationDetail.mockResolvedValue(industryDetail)
    mockedFetchApplicationPermits.mockResolvedValueOnce([]).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRefreshedPermits = resolve
      }),
    )

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

    await selectApplicationRemarksForEditing()
    fireEvent.change(screen.getByLabelText('New Remark'), {
      target: { value: 'Refresh permit eligibility' },
    })
    await userEvent.click(screen.getByRole('button', { name: 'Save remark' }))
    await waitFor(() => expect(mockedFetchApplicationPermits).toHaveBeenCalledTimes(2))

    await selectApplicationDetailTab('Documents')
    expect(
      await screen.findByText(
        'Application document upload is unavailable while permit information cannot be retrieved.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit documents' })).not.toBeInTheDocument()

    await act(async () => {
      resolveRefreshedPermits?.([{ permitNumber: '900101', permitStatusDescription: 'Complete' }])
    })

    expect(
      await screen.findByText(
        'Application document upload is unavailable for industry users when the application has a complete permit.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit documents' })).not.toBeInTheDocument()
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

    await selectApplicationRemarksForEditing()
    const remarkInput = await screen.findByLabelText('New Remark')
    fireEvent.change(remarkInput, { target: { value: 'éè' } })
    await userEvent.click(screen.getByRole('button', { name: 'Save remark' }))

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

    await selectApplicationRemarksForEditing()
    fireEvent.change(await screen.findByLabelText('New Remark'), {
      target: { value: 'Operational note' },
    })
    await userEvent.click(screen.getByRole('button', { name: 'Save remark' }))
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

    expect(await screen.findByRole('tab', { name: 'Applicant' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Remarks' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('New Remark')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save remark' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
  })

  it('updates existing application remarks and refreshes detail', async () => {
    const detailAfterRemarkUpdate: ProvincialApplicationDetail = {
      ...reviewableApplicationDetail,
      remarks: [
        {
          remarkId: 88,
          title: 'Updated application note',
          remark: 'Updated application note',
        },
      ],
    }
    mockedFetchProvincialApplicationDetail
      .mockResolvedValueOnce(reviewableApplicationDetail)
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
    const remarksTable = within(
      screen.getByRole('region', { name: 'Application remarks' }),
    ).getByRole('table')
    expect(
      within(remarksTable).queryByRole('columnheader', { name: 'Title' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Filter remarks' })).not.toBeInTheDocument()
    expect(within(remarkRow as HTMLElement).getByText('2026-01-04')).toBeInTheDocument()
    expect(within(remarkRow as HTMLElement).getByText('idir\\reviewer')).toBeInTheDocument()
    await userEvent.click(within(remarkRow as HTMLElement).getByRole('button', { name: 'Edit' }))
    const remarkInput = await screen.findByLabelText('Edit Remark 88')
    fireEvent.change(remarkInput, {
      target: { value: 'Updated application note' },
    })
    await userEvent.click(screen.getByRole('button', { name: 'Update remark' }))

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

    await selectApplicationRemarksForEditing()
    fireEvent.change(await screen.findByLabelText('New Remark'), {
      target: { value: 'Keep this unsaved remark' },
    })
    await selectApplicationSummaryTile()
    fireEvent.change(await screen.findByLabelText('Exemption term (days)'), {
      target: { value: '181' },
    })
    await userEvent.click(screen.getByRole('button', { name: 'Save Summary' }))
    await waitFor(() => expect(mockedUpdateApplicationSummary).toHaveBeenCalledTimes(1))

    await selectApplicationDetailTab('Remarks')
    expect(screen.getByLabelText('New Remark')).toHaveValue('Keep this unsaved remark')
  })

  it('replaces the creation banner when approving an application', async () => {
    const detailAfterApproval: ProvincialApplicationDetail = {
      ...reviewableApplicationDetail,
      applicationStatusCode: 'APP',
      statusDescription: 'Approved',
    }
    mockedFetchProvincialApplicationDetail
      .mockResolvedValueOnce(reviewableApplicationDetail)
      .mockResolvedValueOnce(detailAfterApproval)

    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/provincial/application/321',
            state: { applicationCreationNotice: { applicationNumber: '321' } },
          },
        ]}
      >
        <Routes>
          <Route
            path="/provincial/application/:applicationNumber"
            element={<ProvincialApplicationDetailsPage />}
          />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText('Created application 321.')).toBeInTheDocument()
    const reviewTile = await selectApplicationReviewTile()
    expect(await screen.findByRole('heading', { name: /application review/i })).toBeInTheDocument()
    await userEvent.click(within(reviewTile).getByRole('radio', { name: 'Approved' }))
    await userEvent.click(within(reviewTile).getByRole('button', { name: 'Approve application' }))

    await waitFor(() => {
      expect(mockedApproveApplicationReview).toHaveBeenCalledWith('321')
      expect(mockedFetchProvincialApplicationDetail).toHaveBeenCalledTimes(1)
    })
    expect(await screen.findByText('Application approved.')).toBeInTheDocument()
    expect(screen.queryByText('Created application 321.')).not.toBeInTheDocument()
    expect(screen.getAllByText('Approved').length).toBeGreaterThan(0)

    const actionBanner = screen.getByText('Application approved.').closest('[role="status"]')
    expect(actionBanner).toBeTruthy()
    await userEvent.click(
      within(actionBanner as HTMLElement).getByRole('button', { name: 'close notification' }),
    )
    expect(screen.queryByText('Created application 321.')).not.toBeInTheDocument()
  })

  it('keeps an optional approval remark available to retry when only its save fails', async () => {
    mockedSaveApplicationRemark.mockResolvedValueOnce({
      success: false,
      message: 'Remark storage unavailable.',
      remarkId: '',
      remark: '',
      title: '',
      user: '',
      status: '',
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
    await userEvent.click(within(reviewTile).getByRole('radio', { name: 'Approved' }))
    fireEvent.change(within(reviewTile).getByLabelText('Remarks'), {
      target: { value: 'Approval note' },
    })
    await userEvent.click(within(reviewTile).getByRole('button', { name: 'Approve application' }))

    expect(
      await screen.findByText(/Application approved, but the remark was not saved/),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('New Remark')).toHaveValue('Approval note')
    expect(screen.getByRole('tab', { name: 'Remarks' })).toHaveAttribute('aria-selected', 'true')
    expect(mockedApproveApplicationReview).toHaveBeenCalledTimes(1)
    expect(mockedSaveApplicationRemark).toHaveBeenCalledWith({
      applicationNumber: '321',
      remarkBody: 'Approval note',
    })
  })

  it('keeps navigation blocked after approval when its optional remark could not be saved', async () => {
    mockedSaveApplicationRemark.mockResolvedValueOnce({
      success: false,
      message: 'Remark storage unavailable.',
      remarkId: '',
      remark: '',
      title: '',
      user: '',
      status: '',
    })

    const router = createMemoryRouter(
      [
        {
          path: '/provincial/application/:applicationNumber',
          element: (
            <>
              <ProvincialApplicationDetailsPage />
              <Link to="/next">Leave application</Link>
            </>
          ),
        },
        { path: '/next', element: <h1>Next page</h1> },
      ],
      { initialEntries: ['/provincial/application/321'] },
    )
    render(<RouterProvider router={router} />)

    const reviewTile = await selectApplicationReviewTile()
    await userEvent.click(within(reviewTile).getByRole('radio', { name: 'Approved' }))
    fireEvent.change(within(reviewTile).getByLabelText('Remarks'), {
      target: { value: 'Approval note' },
    })
    await userEvent.click(screen.getByRole('link', { name: 'Leave application' }))
    const unsavedDialog = await screen.findByRole('dialog', { name: 'Unsaved changes' })
    await userEvent.click(within(unsavedDialog).getByRole('button', { name: 'Save and leave' }))

    expect(
      await screen.findByText(/Application approved, but the remark was not saved/),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Next page' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('New Remark')).toHaveValue('Approval note')
    expect(screen.getByRole('tab', { name: 'Remarks' })).toHaveAttribute('aria-selected', 'true')
    expect(mockedApproveApplicationReview).toHaveBeenCalledTimes(1)
  })

  it('leaves without an unsaved prompt when the opened review form is unchanged', async () => {
    const router = createMemoryRouter(
      [
        {
          path: '/provincial/application/:applicationNumber',
          element: (
            <>
              <ProvincialApplicationDetailsPage />
              <Link to="/next">Leave application</Link>
            </>
          ),
        },
        { path: '/next', element: <h1>Next page</h1> },
      ],
      { initialEntries: ['/provincial/application/321'] },
    )
    render(<RouterProvider router={router} />)

    const reviewTile = await selectApplicationReviewTile()
    expect(within(reviewTile).getByRole('radio', { name: 'Approved' })).toBeChecked()
    await userEvent.click(screen.getByRole('link', { name: 'Leave application' }))

    expect(await screen.findByRole('heading', { name: 'Next page' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Unsaved changes' })).not.toBeInTheDocument()
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
    await userEvent.click(within(reviewTile).getByRole('radio', { name: 'Rejected' }))
    await userEvent.click(
      within(reviewTile).getByRole('checkbox', {
        name: 'Send email notification to the client, including the remark',
      }),
    )
    await waitFor(() => {
      expect(within(reviewTile).getByLabelText(/client email address/i)).toHaveValue(
        'agent@example.test',
      )
    })
    expect(within(reviewTile).getByLabelText(/client email address/i)).not.toHaveAttribute(
      'readonly',
    )
    expect(
      within(reviewTile).getByText("Editing this address won't change the client's record."),
    ).toBeInTheDocument()
  })

  it('shows the owner client location and email without a separate notification field', async () => {
    mockedFetchProvincialApplicationDetail.mockResolvedValueOnce({
      ...applicationDetail,
      agentClientNumber: null,
    })
    mockedFetchApplicationClientLocations.mockResolvedValueOnce([
      {
        locationCode: '03',
        locationName: '03 - WOODLANDS SERVICES',
        selected: true,
      },
    ])
    mockedFetchApplicationSummarySnapshot.mockResolvedValueOnce({
      ...applicationSummarySnapshot,
      applicantTypeCode: 'O',
      ownerClientLocationCode: '03',
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

    await selectApplicationDetailTab('Applicant')
    const ownerDetailsTile = (
      await screen.findByRole('heading', { name: 'Applicant details', level: 2 })
    ).closest('.cds--tile')
    expect(ownerDetailsTile).toBeTruthy()
    expect(
      within(ownerDetailsTile as HTMLElement).getByText('owner@example.test'),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Applicant details', level: 3 }),
    ).not.toBeInTheDocument()
    expect(screen.queryByText('Notification email')).not.toBeInTheDocument()

    const applicantTypeField = screen
      .getAllByText('Applicant type')
      .find((element) => element.tagName === 'DT')
      ?.closest('.detail-field-item')
    expect(applicantTypeField).toBeTruthy()
    expect(within(applicantTypeField as HTMLElement).getByText('Owner')).toBeInTheDocument()

    const clientLocationField = screen
      .getAllByText('Client location')
      .find((element) => element.tagName === 'DT')
      ?.closest('.detail-field-item')
    expect(clientLocationField).toBeTruthy()
    expect(
      within(clientLocationField as HTMLElement).getByText('03 - WOODLANDS SERVICES'),
    ).toBeInTheDocument()
    expect(
      within(clientLocationField as HTMLElement).queryByText('03 - 03 - WOODLANDS SERVICES'),
    ).not.toBeInTheDocument()
  })

  it('uses a business label for ministerial applicant types', async () => {
    mockedFetchProvincialApplicationDetail.mockResolvedValueOnce({
      ...applicationDetail,
      agentClientNumber: null,
    })
    mockedFetchApplicationSummarySnapshot.mockResolvedValueOnce({
      ...applicationSummarySnapshot,
      applicantTypeCode: 'M',
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

    await selectApplicationDetailTab('Applicant')
    const ownerDetailsTile = (
      await screen.findByRole('heading', { name: 'Applicant details', level: 2 })
    ).closest('.cds--tile')
    expect(ownerDetailsTile).toBeTruthy()
    const applicantTypeField = within(ownerDetailsTile as HTMLElement)
      .getByText('Ministerial')
      .closest('.detail-field-item')
    expect(applicantTypeField).toBeTruthy()
    expect(
      within(applicantTypeField as HTMLElement).getByText('Applicant type'),
    ).toBeInTheDocument()
    expect(within(applicantTypeField as HTMLElement).getByText('Ministerial')).toBeInTheDocument()
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
    await userEvent.click(within(reviewTile).getByRole('radio', { name: 'Rejected' }))
    await userEvent.click(
      within(reviewTile).getByRole('checkbox', {
        name: 'Send email notification to the client, including the remark',
      }),
    )
    await waitFor(() =>
      expect(within(reviewTile).getByLabelText('Client email address')).toHaveValue(
        'owner@example.test',
      ),
    )
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
    await userEvent.click(reviewControls.getByRole('radio', { name: 'Rejected' }))
    await userEvent.click(
      reviewControls.getByRole('checkbox', {
        name: 'Send email notification to the client, including the remark',
      }),
    )
    await waitFor(() => {
      expect(reviewControls.getByLabelText(/client email address/i)).toHaveValue(
        'agent@example.test',
      )
    })
    await userEvent.click(
      reviewControls.getByRole('checkbox', {
        name: 'Send email notification to the client, including the remark',
      }),
    )
    fireEvent.change(reviewControls.getByLabelText('Remarks'), {
      target: { value: 'Cannot approve this application' },
    })
    await userEvent.click(reviewControls.getByRole('button', { name: 'Reject application' }))

    await waitFor(() => {
      expect(mockedUpdateApplicationReviewStatus).toHaveBeenCalledWith('321', {
        statusCode: 'REJ',
        remark: 'Cannot approve this application',
        clientEmailAddress: 'agent@example.test',
      })
    })
    expect(mockedSendApplicationReviewStatusEmail).not.toHaveBeenCalled()
    expect(await screen.findByText('Application rejected.')).toBeInTheDocument()
    expect(screen.getByText('No email was sent to the client.')).toBeInTheDocument()
    expect(within(reviewTile).queryByText('Client email address')).not.toBeInTheDocument()
  })

  it('leaves the withdrawal email unticked until the reviewer opts in', async () => {
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

    const reviewControls = within(await selectApplicationReviewTile())
    expect(reviewControls.getByRole('radio', { name: 'Approved' })).toBeChecked()
    await userEvent.click(reviewControls.getByRole('radio', { name: 'Withdrawn' }))
    const sendEmail = reviewControls.getByRole('checkbox', {
      name: 'Send email notification to the client, including the remark',
    })
    expect(sendEmail).not.toBeChecked()
    expect(reviewControls.queryByLabelText(/client email address/i)).not.toBeInTheDocument()
    expect(reviewControls.getByRole('button', { name: 'Withdraw application' })).toBeEnabled()

    await userEvent.click(sendEmail)
    await waitFor(() =>
      expect(reviewControls.getByLabelText(/client email address/i)).toHaveValue(
        'agent@example.test',
      ),
    )
    fireEvent.change(reviewControls.getByLabelText('Remarks'), {
      target: { value: 'Withdrawn at the client request' },
    })
    await userEvent.click(
      reviewControls.getByRole('button', { name: 'Withdraw application and send email' }),
    )

    await waitFor(() =>
      expect(mockedSendApplicationReviewStatusEmail).toHaveBeenCalledWith('321', {
        statusCode: 'WDN',
        remark: 'Withdrawn at the client request',
        clientEmailAddress: 'agent@example.test',
      }),
    )
    expect(await screen.findByText('Application withdrawn.')).toBeInTheDocument()
    expect(screen.getByText('Email sent to agent@example.test.')).toBeInTheDocument()
    const savedEmail = within(await selectApplicationReviewTile(false))
      .getByText('Client email address')
      .closest('.detail-field-item') as HTMLElement
    expect(within(savedEmail).getByText('agent@example.test')).toBeInTheDocument()
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
    expect(within(reviewTile).getByText('Expired')).toBeInTheDocument()
    expect(within(reviewTile).getByText('Expired after review')).toBeInTheDocument()
    // No status email is recorded, so neither the placeholder nor a guessed address is shown.
    expect(within(reviewTile).queryByText('Client email address')).not.toBeInTheDocument()
    expect(within(reviewTile).queryByText('Not on file')).not.toBeInTheDocument()
    expect(
      within(reviewTile).queryByRole('button', { name: 'Update status' }),
    ).not.toBeInTheDocument()
    expect(
      within(reviewTile).queryByRole('button', { name: 'Approve application' }),
    ).not.toBeInTheDocument()
    expect(
      within(reviewTile).queryByRole('button', { name: 'Reject application' }),
    ).not.toBeInTheDocument()
  })

  it('shows rejected application review details without unavailable edit actions', async () => {
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...reviewableApplicationDetail,
      applicationStatusCode: 'REJ',
      statusDescription: 'Rejected',
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

    expect(reviewControls.getByText('Rejected')).toBeInTheDocument()
    expect(reviewControls.getByText('ok')).toBeInTheDocument()
    // A loaded review cannot show who was emailed because sent status emails are not recorded.
    expect(reviewControls.queryByText('agent@example.test')).not.toBeInTheDocument()
    expect(reviewControls.queryByRole('button', { name: 'Update status' })).not.toBeInTheDocument()
    expect(
      reviewControls.queryByRole('button', { name: 'Approve application' }),
    ).not.toBeInTheDocument()
    expect(
      reviewControls.queryByRole('button', { name: 'Reject application' }),
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
    await userEvent.click(reviewControls.getByRole('radio', { name: 'Rejected' }))
    await userEvent.click(
      reviewControls.getByRole('checkbox', {
        name: 'Send email notification to the client, including the remark',
      }),
    )
    await waitFor(() =>
      expect(reviewControls.getByLabelText(/client email address/i)).toHaveValue(''),
    )
    await userEvent.type(reviewControls.getByLabelText('Remarks'), 'Missing recipient')
    await userEvent.click(
      reviewControls.getByRole('button', {
        name: 'Reject application and send email',
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
      ...reviewableApplicationDetail,
      applicationStatusCode: 'REJ',
      statusDescription: 'Rejected',
    }
    mockedFetchProvincialApplicationDetail
      .mockResolvedValueOnce(reviewableApplicationDetail)
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
    await userEvent.click(within(reviewTile).getByRole('radio', { name: 'Rejected' }))
    await userEvent.click(
      within(reviewTile).getByRole('checkbox', {
        name: 'Send email notification to the client, including the remark',
      }),
    )
    await waitFor(() => {
      expect(within(reviewTile).getByLabelText(/client email address/i)).toHaveValue(
        'agent@example.test',
      )
    })
    fireEvent.change(within(reviewTile).getByLabelText(/client email address/i), {
      target: { value: 'edited.client@example.test' },
    })
    await userEvent.type(within(reviewTile).getByLabelText('Remarks'), 'Needs correction')
    expect(within(reviewTile).getByLabelText(/client email address/i)).toHaveValue(
      'edited.client@example.test',
    )
    mockedSendApplicationReviewStatusEmail.mockResolvedValueOnce({
      success: false,
      message: 'Application status email is not configured yet. No email was sent.',
    })
    await userEvent.click(
      within(reviewTile).getByRole('button', {
        name: 'Reject application and send email',
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
    expect(within(reviewTile).getByLabelText('Remarks')).toHaveValue('Needs correction')
    expect(screen.getAllByText('Rejected').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Needs correction').length).toBeGreaterThan(0)
  })

  it('validates application review status before updating from detail', async () => {
    // Approval is preselected when available, so use a status that opens without a choice.
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...reviewableApplicationDetail,
      applicationStatusCode: 'APP',
      statusDescription: 'Approved',
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
    expect(
      within(reviewTile).getByRole('group', { name: /Application status/ }),
    ).toBeInTheDocument()
    await userEvent.click(within(reviewTile).getByRole('button', { name: 'Update status' }))

    expect(
      screen.getByText('Choose an application status before updating review status.'),
    ).toBeInTheDocument()
    expect(mockedUpdateApplicationReviewStatus).not.toHaveBeenCalled()
  })

  it.each(['Rejected', 'Withdrawn', 'Expired'])(
    'requires a status change remark before setting application status to %s',
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
      await userEvent.click(within(reviewTile).getByRole('radio', { name: statusLabel }))
      await userEvent.click(
        within(reviewTile).getByRole('button', {
          name:
            statusLabel === 'Rejected'
              ? 'Reject application'
              : statusLabel === 'Withdrawn'
                ? 'Withdraw application'
                : 'Update status',
        }),
      )

      expect(within(reviewTile).getByLabelText('Remarks')).toBeInvalid()
      expect(
        screen.getByText(
          'Status change remark is required when rejecting, withdrawing, or expiring an application.',
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

    await selectApplicationRemarksForEditing()
    expect(await screen.findByLabelText('New Remark')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Save remark' }))

    expect(screen.getByText('Remark is required.')).toBeInTheDocument()
    expect(mockedSaveApplicationRemark).not.toHaveBeenCalled()
  })
})
