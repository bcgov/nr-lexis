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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  setupApplicationDetailTests,
  applicationDetail,
  applicationSummarySnapshot,
  mockApplicationDetailAuth,
  mockedApproveApplicationReview,
  mockedFetchApplicationClientData,
  mockedFetchApplicationClientLocations,
  mockedFetchApplicationPermits,
  mockedFetchApplicationReviewOptions,
  mockedFetchApplicationSummarySnapshot,
  mockedFetchCurrentApplicationRecordVersion,
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
import { formatBusinessIsoDate } from '@/utils/date'

const reviewableApplicationDetail: ProvincialApplicationDetail = {
  ...applicationDetail,
  applicationStatusCode: 'NEW',
  statusDescription: 'New',
}

// The application as the server returns it once the disapproval is saved: the new status, the
// remark entered with it, and no application-detail edits.
const disapprovedApplicationDetail = (
  applicationStatusCode: string,
  statusDescription: string,
  remark: string,
): ProvincialApplicationDetail => ({
  ...reviewableApplicationDetail,
  applicationStatusCode,
  statusDescription,
  canEditApplicationDetails: false,
  remarks: [
    { remarkId: 99, title: remark, remark, user: 'idir\\reviewer', date: '2026-01-05' },
    ...reviewableApplicationDetail.remarks,
  ],
})

// Serves the new application first and the disapproved one on every reload after it.
const mockDetailAfterDisapproval = (disapproved: ProvincialApplicationDetail) =>
  mockedFetchProvincialApplicationDetail
    .mockReset()
    .mockResolvedValueOnce(reviewableApplicationDetail)
    .mockResolvedValue(disapproved)

const renderReviewPage = () =>
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

const openReviewDisapproval = async (statusLabel = 'Rejected') => {
  const review = await selectApplicationReviewTile()
  await userEvent.click(within(review).getByRole('radio', { name: statusLabel }))
  await userEvent.click(within(review).getByRole('button', { name: 'Update status' }))
  const dialog = await screen.findByRole('dialog', { name: 'Disapprove application 321' })
  return { review, dialog, controls: within(dialog) }
}

describe.sequential('Provincial Application Detail Actions - review', () => {
  beforeEach(() => {
    setupApplicationDetailTests()
    mockedFetchProvincialApplicationDetail
      .mockReset()
      .mockResolvedValue(reviewableApplicationDetail)
  })

  afterEach(() => vi.restoreAllMocks())

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
    expect(screen.queryByLabelText('Remark')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Add remark' }))
    const addRemarkInput = await screen.findByLabelText('Remark')
    expect(addRemarkInput).toHaveAttribute('maxlength', '250')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByLabelText('Remark')).not.toBeInTheDocument()

    const reviewTile = await selectApplicationReviewTile(false)
    const review = within(reviewTile)
    expect(review.queryByRole('heading', { name: 'Application review' })).not.toBeInTheDocument()
    expect(review.getByRole('button', { name: 'Update status' })).toBeInTheDocument()
    expect(review.queryByRole('group', { name: /Application status/ })).not.toBeInTheDocument()

    await userEvent.click(review.getByRole('button', { name: 'Update status' }))
    expect(await review.findByRole('group', { name: /Application status/ })).toBeInTheDocument()
    expect(review.getByText('Required fields')).toBeInTheDocument()
    expect(review.queryByRole('radio', { name: 'Expired' })).not.toBeInTheDocument()
    await userEvent.click(review.getByRole('button', { name: 'Cancel' }))
    expect(review.queryByRole('group', { name: /Application status/ })).not.toBeInTheDocument()
  })

  it('omits the Remarks row from a review summary when the latest remark is empty', async () => {
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...applicationDetail,
      applicationStatusCode: 'REJ',
      statusDescription: 'Rejected',
      remarks: [
        {
          remarkId: 90,
          title: '',
          remark: '  ',
          user: 'idir\\reviewer',
          date: '2026-01-06',
        },
      ],
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

    const reviewTile = within(await selectApplicationReviewTile(false))
    expect(reviewTile.getByText('Rejected')).toBeVisible()
    expect(reviewTile.queryByText('Remarks', { exact: true })).not.toBeInTheDocument()
  })

  it('lists remarks newest first by remark number and shows the Date and time column', async () => {
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...reviewableApplicationDetail,
      remarks: [
        {
          remarkId: 91,
          title: '',
          remark: 'Earlier note',
          user: 'idir\\reviewer',
          date: '2026-09-24',
          timestamp: '2026-09-24T16:00:00Z',
        },
        {
          remarkId: 93,
          title: '',
          remark: 'Date-only note',
          user: 'idir\\reviewer',
          date: '2026-09-24',
        },
        {
          remarkId: 92,
          title: '',
          remark: 'Later note',
          user: 'idir\\reviewer',
          date: '2026-09-24',
          timestamp: '2026-09-24T17:30:00Z',
        },
      ],
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
    const remarksRegion = await screen.findByRole('region', { name: 'Application remarks' })
    const remarksTable = within(remarksRegion).getByRole('table')
    expect(within(remarksTable).getByRole('columnheader', { name: 'Date and time' })).toBeVisible()
    const rows = within(remarksTable)
      .getAllByRole('row')
      .filter((row) => row.textContent?.includes('note'))
    expect(rows).toHaveLength(3)
    expect(rows[0]).toHaveTextContent('Date-only note')
    expect(rows[0]).toHaveTextContent('Sep 24, 2026')
    expect(rows[0]).not.toHaveTextContent('2026-09-24')
    expect(rows[1]).toHaveTextContent('Later note')
    expect(rows[1]).toHaveTextContent('Sep 24, 2026 · 10:30:00 AM')
    expect(rows[2]).toHaveTextContent('Earlier note')
    expect(rows[2]).toHaveTextContent('Sep 24, 2026 · 09:00:00 AM')
  })

  it.each(['add', 'edit'] as const)(
    'keeps a saved remark in newest-first order during the %s reload',
    async (mode) => {
      const remarksDetail: ProvincialApplicationDetail = {
        ...reviewableApplicationDetail,
        remarks: [
          {
            remarkId: 88,
            title: '',
            remark: 'Recent note',
            user: 'idir\\reviewer',
            date: '2026-09-24',
            timestamp: '2026-09-24T17:30:00Z',
          },
          {
            remarkId: 87,
            title: '',
            remark: 'Older note',
            user: 'idir\\reviewer',
            date: '2026-09-23',
            timestamp: '2026-09-23T17:00:00Z',
          },
        ],
      }
      let resolveReload: (detail: ProvincialApplicationDetail) => void = () => undefined
      mockedFetchProvincialApplicationDetail
        .mockResolvedValueOnce(remarksDetail)
        .mockImplementationOnce(() => new Promise((resolve) => (resolveReload = resolve)))
      const savedText = mode === 'add' ? 'test-2026-09-29 new note' : 'Older note edited'
      mockedSaveApplicationRemark.mockResolvedValueOnce({
        success: true,
        remarkId: mode === 'add' ? '89' : '87',
        remark: savedText,
        title: savedText,
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
      if (mode === 'add') {
        await userEvent.click(await screen.findByRole('button', { name: 'Add remark' }))
      } else {
        await screen.findByText('Older note')
        await userEvent.click(screen.getAllByRole('button', { name: 'Edit' })[1])
      }
      fireEvent.change(await screen.findByLabelText('Remark'), { target: { value: savedText } })
      await userEvent.click(
        screen.getByRole('button', { name: mode === 'add' ? 'Save remark' : 'Update remark' }),
      )
      await waitFor(() => expect(mockedFetchProvincialApplicationDetail).toHaveBeenCalledTimes(2))

      const remarksRegion = screen.getByRole('region', { name: 'Application remarks' })
      const rows = within(within(remarksRegion).getByRole('table'))
        .getAllByRole('row')
        .filter((row) => row.textContent?.includes('note'))
      if (mode === 'add') {
        expect(rows.map((row) => row.textContent)).toEqual([
          expect.stringContaining(savedText),
          expect.stringContaining('Recent note'),
          expect.stringContaining('Older note'),
        ])
      } else {
        expect(rows).toHaveLength(2)
        expect(rows[0]).toHaveTextContent('Recent note')
        expect(rows[1]).toHaveTextContent(savedText)
        expect(rows[1]).toHaveTextContent('Sep 23, 2026 · 10:00:00 AM')
      }

      await act(async () => resolveReload(remarksDetail))
    },
  )

  it.each(['add', 'edit'] as const)(
    'protects the desktop %s remark draft from background launchers through save',
    async (mode) => {
      const originalMatchMedia = window.matchMedia
      vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
        ...originalMatchMedia(query),
        matches: query === '(min-width: 1312px)',
      }))
      const savedRemark = {
        success: true,
        remarkId: mode === 'edit' ? '88' : '89',
        remark: 'Keep this staff note',
        title: 'Keep this staff note',
        user: 'reviewer',
        status: 'saved',
      }
      let resolveSave: (result: typeof savedRemark) => void = () => undefined
      mockedSaveApplicationRemark.mockImplementationOnce(
        () => new Promise((resolve) => (resolveSave = resolve)),
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

      await selectApplicationDetailTab('Remarks')
      const addButton = await screen.findByRole('button', { name: 'Add remark' })
      const editButton = screen.getByRole('button', { name: 'Edit' })
      await userEvent.click(mode === 'add' ? addButton : editButton)
      const remarkInput = await screen.findByLabelText('Remark')
      expect(document.querySelector('.c4p--side-panel--slide-in')).toBeInTheDocument()
      fireEvent.change(remarkInput, { target: { value: savedRemark.remark } })

      for (const action of [addButton, editButton]) {
        expect(action).toBeEnabled()
        await userEvent.click(action)
        expect(screen.getAllByRole('dialog')).toHaveLength(1)
        await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
        expect(remarkInput).toHaveValue(savedRemark.remark)
      }

      await userEvent.click(
        screen.getByRole('button', { name: mode === 'add' ? 'Save remark' : 'Update remark' }),
      )
      await waitFor(() => expect(mockedSaveApplicationRemark).toHaveBeenCalledTimes(1))
      expect(mockedSaveApplicationRemark).toHaveBeenCalledWith({
        applicationNumber: '321',
        remarkBody: savedRemark.remark,
        remarkId: mode === 'edit' ? '88' : undefined,
      })
      expect(addButton).toBeDisabled()
      expect(editButton).toBeDisabled()
      expect(remarkInput).toHaveValue(savedRemark.remark)

      await act(async () => resolveSave(savedRemark))
      expect(
        await within(screen.getByRole('tabpanel', { name: 'Remarks' })).findByText('Remark saved.'),
      ).toBeVisible()
      expect(screen.queryByLabelText(/^Remark$/)).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Add remark' })).toBeEnabled()
      expect(screen.getByRole('button', { name: 'Edit' })).toBeEnabled()
    },
  )

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
    expect(review.getByRole('radio', { name: 'Rejected' })).toBeEnabled()
    expect(review.getByRole('radio', { name: 'Withdrawn' })).toBeEnabled()
    expect(review.queryByRole('button', { name: 'Approve application' })).not.toBeInTheDocument()
  })

  it('keeps an approved application review read-only once its edit window has passed', async () => {
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...reviewableApplicationDetail,
      applicationStatusCode: 'APP',
      statusDescription: 'Approved',
      listingDate: '2026-01-03',
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

    const review = within(await selectApplicationReviewTile(false))
    expect(review.queryByRole('button', { name: 'Update status' })).not.toBeInTheDocument()
    expect(review.queryByRole('group', { name: /Application status/ })).not.toBeInTheDocument()
  })

  it('keeps saved remarks editable after the application details lock', async () => {
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
    const remarkRow = (await screen.findByText('ok')).closest('tr') as HTMLElement
    expect(screen.queryByRole('button', { name: 'Add remark' })).not.toBeInTheDocument()
    await userEvent.click(within(remarkRow).getByRole('button', { name: 'Edit' }))
    fireEvent.change(await screen.findByLabelText('Remark'), {
      target: { value: 'Corrected application note' },
    })
    await userEvent.click(screen.getByRole('button', { name: 'Update remark' }))

    await waitFor(() =>
      expect(mockedSaveApplicationRemark).toHaveBeenCalledWith({
        applicationNumber: '321',
        remarkBody: 'Corrected application note',
        remarkId: '88',
      }),
    )
  })

  it('keeps remarks read-only on an expired application', async () => {
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...reviewableApplicationDetail,
      applicationStatusCode: 'EXP',
      statusDescription: 'Expired',
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
    const remarksTable = within(
      await screen.findByRole('region', { name: 'Application remarks' }),
    ).getByRole('table')
    expect(within(remarksTable).getByText('ok')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add remark' })).not.toBeInTheDocument()
    expect(within(remarksTable).queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
  })

  it('shows the lock notice instead of Update status while another user holds the lock', async () => {
    const lockMessage =
      'This application is currently locked for editing by Reviewer One. The ability to make changes has been disabled.'
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...reviewableApplicationDetail,
      locked: true,
      lockedBy: 'Reviewer One',
      lockMessage,
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

    const review = within(await selectApplicationReviewTile(false))
    expect(screen.getByText('Application locked')).toBeInTheDocument()
    expect(screen.getAllByText(lockMessage).length).toBeGreaterThanOrEqual(1)
    expect(review.queryByRole('button', { name: 'Update status' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Approve application' })).not.toBeInTheDocument()
  })

  it('asks before replacing a remark draft with a package edit', async () => {
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
    const newRemark = await screen.findByLabelText('Remark')
    fireEvent.change(newRemark, {
      target: { value: 'Preserve remark draft' },
    })
    await selectApplicationDetailTab('Scale')
    await userEvent.click(await screen.findByRole('button', { name: 'Keep editing' }))
    expect(newRemark).toHaveValue('Preserve remark draft')
    expect(screen.getByRole('tab', { name: 'Remarks' })).toHaveAttribute('aria-selected', 'true')
    await selectApplicationDetailTab('Scale')
    await userEvent.click(await screen.findByRole('button', { name: 'Discard changes' }))
    await selectApplicationItemsForEditing()
    fireEvent.change(await screen.findByLabelText('Comments'), {
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
    expect(await screen.findByText('Package saved.')).toBeInTheDocument()

    expect(newRemark).not.toBeInTheDocument()
    expect(mockedSaveApplicationRemark).not.toHaveBeenCalled()
  }, 30_000)

  it.each([
    { mode: 'add', close: 'Escape' },
    { mode: 'add', close: 'Cancel' },
    { mode: 'add', close: 'Close' },
    { mode: 'edit', close: 'Escape' },
    { mode: 'edit', close: 'Cancel' },
    { mode: 'edit', close: 'Close' },
  ])(
    'preserves a dirty $mode remark after $close until discard is confirmed',
    async ({ mode, close }) => {
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
      const launcher =
        mode === 'add'
          ? await screen.findByRole('button', { name: 'Add remark' })
          : within(screen.getByRole('region', { name: 'Application remarks' })).getByRole(
              'button',
              {
                name: 'Edit',
              },
            )
      await userEvent.click(launcher)
      const remark = await screen.findByLabelText('Remark')
      const original = mode === 'add' ? '' : 'ok'
      expect(remark).toHaveValue(original)
      fireEvent.change(remark, { target: { value: 'Unsaved application remark' } })

      const requestClose = async () => {
        if (close === 'Escape') {
          remark.focus()
          await userEvent.keyboard('{Escape}')
        } else {
          const drawer = remark.closest('.detail-side-panel') as HTMLElement
          await userEvent.click(within(drawer).getByRole('button', { name: close }))
        }
      }
      await requestClose()
      const confirmation = await screen.findByRole('dialog', { name: 'Discard changes?' })
      expect(confirmation).toHaveAccessibleDescription('Your changes will be lost.')
      expect(remark).toHaveValue('Unsaved application remark')
      await userEvent.click(within(confirmation).getByRole('button', { name: 'Keep editing' }))
      const returnTarget =
        close === 'Escape'
          ? remark
          : within(remark.closest('.detail-side-panel') as HTMLElement).getByRole('button', {
              name: close,
            })
      await waitFor(() => expect(returnTarget).toHaveFocus())
      expect(remark).toHaveValue('Unsaved application remark')
      expect(mockedSaveApplicationRemark).not.toHaveBeenCalled()

      await requestClose()
      await userEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
      await waitFor(() => expect(screen.queryByLabelText('Remark')).not.toBeInTheDocument())
      await waitFor(() => expect(launcher).toHaveFocus())
      await userEvent.click(launcher)
      expect(await screen.findByLabelText('Remark')).toHaveValue(original)
      expect(mockedSaveApplicationRemark).not.toHaveBeenCalled()
    },
  )

  it.each([
    { layout: 'overlay', slideIn: false },
    { layout: 'slide-in', slideIn: true },
  ])(
    'closes only the discard dialog on Escape in the $layout remark panel',
    async ({ slideIn }) => {
      const originalMatchMedia = window.matchMedia
      vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
        ...originalMatchMedia(query),
        matches: slideIn && query === '(min-width: 1312px)',
      }))
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
      await userEvent.click(await screen.findByRole('button', { name: 'Add remark' }))
      const remark = await screen.findByLabelText('Remark')
      fireEvent.change(remark, { target: { value: 'Unsaved application remark' } })
      const drawer = remark.closest('.detail-side-panel') as HTMLElement
      await userEvent.click(within(drawer).getByRole('button', { name: 'Cancel' }))
      await screen.findByRole('dialog', { name: 'Discard changes?' })

      await userEvent.keyboard('{Escape}')

      await waitFor(() =>
        expect(screen.queryByRole('dialog', { name: 'Discard changes?' })).not.toBeInTheDocument(),
      )
      await waitFor(() =>
        expect(within(drawer).getByRole('button', { name: 'Cancel' })).toHaveFocus(),
      )
      expect(remark).toHaveValue('Unsaved application remark')
      expect(mockedSaveApplicationRemark).not.toHaveBeenCalled()
    },
  )

  it('closes an unchanged existing remark without a discard dialog and restores focus', async () => {
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
    const launcher = within(screen.getByRole('region', { name: 'Application remarks' })).getByRole(
      'button',
      { name: 'Edit' },
    )
    await userEvent.click(launcher)
    const remark = await screen.findByLabelText('Remark')
    await waitFor(() => expect(remark).toHaveFocus())
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByLabelText('Remark')).not.toBeInTheDocument())
    expect(screen.queryByRole('dialog', { name: 'Discard changes?' })).not.toBeInTheDocument()
    await waitFor(() => expect(launcher).toHaveFocus())
  })

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
    expect(await screen.findByLabelText('Remark')).toBeInTheDocument()
    // The panel's only field marks itself required, so there is no legend.
    expect(
      within(screen.getByRole('complementary', { name: 'Add remark' })).queryByText(
        'Required fields',
      ),
    ).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Remark'), {
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
    expect(await screen.findByText('Remark saved.')).toBeInTheDocument()
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
    fireEvent.change(screen.getByLabelText('Remark'), {
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

  it('shows a refused remark edit once and clears it when the edit is discarded', async () => {
    const sharedRemarkMessage =
      "This older remark can't be edited because its number is shared with another application's remark. Add a new remark instead."
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...reviewableApplicationDetail,
      applicationStatusCode: 'PMT',
      statusDescription: 'Permitted',
      canEditApplicationDetails: false,
    })
    mockedSaveApplicationRemark.mockResolvedValueOnce({
      success: false,
      status: 'validation_error',
      remarkId: '',
      remark: '',
      title: '',
      user: '',
      message: sharedRemarkMessage,
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
    const remarkRow = (await screen.findByText('ok')).closest('tr') as HTMLElement
    await userEvent.click(within(remarkRow).getByRole('button', { name: 'Edit' }))
    fireEvent.change(await screen.findByLabelText('Remark'), {
      target: { value: 'Corrected application note' },
    })
    await userEvent.click(screen.getByRole('button', { name: 'Update remark' }))

    expect(await screen.findAllByText(sharedRemarkMessage)).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Discard changes' }))

    await waitFor(() => expect(screen.queryByLabelText('Remark')).not.toBeInTheDocument())
    expect(screen.queryByText(sharedRemarkMessage)).not.toBeInTheDocument()
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
    const remarkInput = await screen.findByLabelText('Remark')
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
    fireEvent.change(await screen.findByLabelText('Remark'), {
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
    expect(screen.queryByLabelText('Remark')).not.toBeInTheDocument()
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
    expect(within(remarkRow as HTMLElement).getByText('Jan 4, 2026')).toBeInTheDocument()
    expect(within(remarkRow as HTMLElement).getByText('idir\\reviewer')).toBeInTheDocument()
    await userEvent.click(within(remarkRow as HTMLElement).getByRole('button', { name: 'Edit' }))
    const remarkInput = await screen.findByLabelText('Remark')
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
    expect(await screen.findByText('Remark saved.')).toBeInTheDocument()
    expect(screen.getAllByText('Updated application note').length).toBeGreaterThan(0)
  })

  it('discards a remark draft before saving the application summary', async () => {
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
    fireEvent.change(await screen.findByLabelText('Remark'), {
      target: { value: 'Keep this unsaved remark' },
    })
    await selectApplicationDetailTab('Application')
    await userEvent.click(await screen.findByRole('button', { name: 'Discard changes' }))
    await selectApplicationSummaryTile()
    fireEvent.change(await screen.findByLabelText('Exemption term (days)'), {
      target: { value: '181' },
    })
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(mockedUpdateApplicationSummary).toHaveBeenCalledTimes(1))

    await selectApplicationDetailTab('Remarks')
    expect(screen.queryByLabelText('Remark')).not.toBeInTheDocument()
    expect(mockedSaveApplicationRemark).not.toHaveBeenCalled()
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

    expect(await screen.findByText('The application was saved.')).toBeInTheDocument()
    const reviewTile = await selectApplicationReviewTile()
    expect(await screen.findByRole('heading', { name: /application review/i })).toBeInTheDocument()
    await userEvent.click(within(reviewTile).getByRole('radio', { name: 'Approved' }))
    await userEvent.click(within(reviewTile).getByRole('button', { name: 'Approve application' }))

    await waitFor(() => {
      expect(mockedApproveApplicationReview).toHaveBeenCalledWith('321')
      expect(mockedFetchProvincialApplicationDetail).toHaveBeenCalledTimes(1)
    })
    expect(await within(reviewTile).findByText('Application approved.')).toBeVisible()
    expect(screen.queryByText('The application was saved.')).not.toBeInTheDocument()
    expect(screen.getAllByText('Approved').length).toBeGreaterThan(0)

    const actionBanner = screen.getByText('Application approved.').closest('[role="status"]')
    expect(actionBanner).toBeTruthy()
    await userEvent.click(
      within(actionBanner as HTMLElement).getByRole('button', { name: 'close notification' }),
    )
    expect(screen.queryByText('The application was saved.')).not.toBeInTheDocument()
  })

  it('discards an unrelated remark draft before approving with an approval remark', async () => {
    const approvedDetail = {
      ...reviewableApplicationDetail,
      applicationStatusCode: 'APP',
      statusDescription: 'Approved',
      remarks: [
        ...reviewableApplicationDetail.remarks,
        { remarkId: 89, title: 'Approval note', remark: 'Approval note' },
      ],
    }
    mockedFetchProvincialApplicationDetail
      .mockResolvedValueOnce(reviewableApplicationDetail)
      .mockResolvedValue(approvedDetail)

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
    fireEvent.change(await screen.findByLabelText('Remark'), {
      target: { value: 'Unrelated remark draft' },
    })
    await selectApplicationDetailTab('Review')
    await userEvent.click(await screen.findByRole('button', { name: 'Discard changes' }))
    const review = within(await selectApplicationReviewTile())
    fireEvent.change(review.getByLabelText('Remarks'), { target: { value: 'Approval note' } })
    await userEvent.click(review.getByRole('button', { name: 'Approve application' }))

    await screen.findByText('Application approved.')
    expect(mockedApproveApplicationReview).toHaveBeenCalledTimes(1)
    expect(mockedSaveApplicationRemark).toHaveBeenCalledWith({
      applicationNumber: '321',
      remarkBody: 'Approval note',
    })
    expect(mockedUpdateApplicationSummary).not.toHaveBeenCalled()

    await selectApplicationDetailTab('Remarks')
    expect(screen.queryByLabelText('Remark')).not.toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Approval note' })).toBeInTheDocument()
    const cleanUnload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(cleanUnload)
    expect(cleanUnload.defaultPrevented).toBe(false)
  })

  it.each(['add', 'edit'] as const)(
    'discards the desktop %s remark draft and retries only the failed approval note',
    async (mode) => {
      const originalMatchMedia = window.matchMedia
      vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
        ...originalMatchMedia(query),
        matches: query === '(min-width: 1312px)',
      }))
      if (mode === 'add') {
        mockedSaveApplicationRemark.mockResolvedValueOnce({
          success: false,
          message: 'Remark storage unavailable.',
          remarkId: '',
          remark: '',
          title: '',
          user: '',
          status: '',
        })
      } else {
        mockedSaveApplicationRemark.mockRejectedValueOnce(new Error('Remark storage unavailable.'))
      }
      const approvedDetail = {
        ...reviewableApplicationDetail,
        applicationStatusCode: 'APP',
        statusDescription: 'Approved',
      }
      mockedFetchProvincialApplicationDetail
        .mockResolvedValueOnce(reviewableApplicationDetail)
        .mockResolvedValue(approvedDetail)

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
      await userEvent.click(
        await screen.findByRole('button', { name: mode === 'add' ? 'Add remark' : 'Edit' }),
      )
      const remarkLabel = 'Remark'
      fireEvent.change(await screen.findByLabelText(remarkLabel), {
        target: { value: 'Unrelated remark draft' },
      })
      await selectApplicationDetailTab('Review')
      await userEvent.click(await screen.findByRole('button', { name: 'Discard changes' }))
      const review = within(await selectApplicationReviewTile())
      fireEvent.change(review.getByLabelText('Remarks'), { target: { value: 'Approval note' } })
      await userEvent.click(review.getByRole('button', { name: 'Approve application' }))

      expect(
        await screen.findByText(/Application approved, but the remark was not saved/),
      ).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: 'Review' })).toHaveAttribute('aria-selected', 'true')
      expect(review.getByLabelText('Remarks')).toHaveValue('Approval note')
      expect(review.getByRole('radio', { name: 'Approved' })).toBeChecked()
      expect(review.getByRole('radio', { name: 'Approved' })).toBeDisabled()
      expect(mockedApproveApplicationReview).toHaveBeenCalledTimes(1)
      expect(mockedSaveApplicationRemark).toHaveBeenNthCalledWith(1, {
        applicationNumber: '321',
        remarkBody: 'Approval note',
      })

      // Leaving the review with the note still to retry asks first.
      fireEvent.click(screen.getByRole('tab', { name: 'Remarks' }))
      const leaveDialog = await screen.findByRole('dialog', { name: 'Discard changes?' })
      await userEvent.click(within(leaveDialog).getByRole('button', { name: 'Keep editing' }))
      expect(screen.getByRole('tab', { name: 'Review' })).toHaveAttribute('aria-selected', 'true')
      expect(review.getByLabelText('Remarks')).toHaveValue('Approval note')

      await userEvent.click(review.getByRole('button', { name: 'Save remark' }))
      await waitFor(() => expect(review.queryByLabelText('Remarks')).not.toBeInTheDocument())
      expect(mockedApproveApplicationReview).toHaveBeenCalledTimes(1)
      expect(mockedSaveApplicationRemark).toHaveBeenNthCalledWith(2, {
        applicationNumber: '321',
        remarkBody: 'Approval note',
      })

      await selectApplicationDetailTab('Remarks')
      expect(screen.queryByLabelText(remarkLabel)).not.toBeInTheDocument()
      expect(mockedSaveApplicationRemark).toHaveBeenCalledTimes(2)
      const cleanUnload = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(cleanUnload)
      expect(cleanUnload.defaultPrevented).toBe(false)
    },
  )

  it('validates an empty approval remark retry and allows explicitly cancelling it', async () => {
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
    const review = within(reviewTile)
    fireEvent.change(review.getByLabelText('Remarks'), { target: { value: '   ' } })
    await userEvent.click(review.getByRole('button', { name: 'Save remark' }))

    expect(await review.findByText('Remark is required')).toBeInTheDocument()
    expect(mockedApproveApplicationReview).toHaveBeenCalledTimes(1)
    expect(mockedSaveApplicationRemark).toHaveBeenCalledTimes(1)
    const dirtyUnload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(dirtyUnload)
    expect(dirtyUnload.defaultPrevented).toBe(true)

    await userEvent.click(review.getByRole('button', { name: 'Cancel' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Discard changes' }))
    const cleanUnload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(cleanUnload)
    expect(cleanUnload.defaultPrevented).toBe(false)
    expect(review.queryByRole('button', { name: 'Save remark' })).not.toBeInTheDocument()
    await userEvent.click(review.getByRole('button', { name: 'Update status' }))
    expect(review.getByLabelText('Remarks')).toHaveValue('')
    expect(review.queryByRole('radio', { name: 'Approved' })).not.toBeInTheDocument()
    expect(review.getByRole('radio', { name: 'Rejected' })).toBeEnabled()
  })

  it('asks before leaving after approval when its optional remark could not be saved', async () => {
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
    await userEvent.click(within(reviewTile).getByRole('button', { name: 'Approve application' }))

    expect(
      await screen.findByText(/Application approved, but the remark was not saved/),
    ).toBeInTheDocument()
    expect(within(reviewTile).getByLabelText('Remarks')).toHaveValue('Approval note')
    expect(mockedApproveApplicationReview).toHaveBeenCalledTimes(1)

    await userEvent.click(screen.getByRole('link', { name: 'Leave application' }))
    const keepDialog = await screen.findByRole('dialog', { name: 'Discard changes?' })
    await userEvent.click(within(keepDialog).getByRole('button', { name: 'Keep editing' }))
    expect(screen.queryByRole('heading', { name: 'Next page' })).not.toBeInTheDocument()
    expect(within(reviewTile).getByLabelText('Remarks')).toHaveValue('Approval note')

    await userEvent.click(screen.getByRole('link', { name: 'Leave application' }))
    const discardDialog = await screen.findByRole('dialog', { name: 'Discard changes?' })
    await userEvent.click(within(discardDialog).getByRole('button', { name: 'Discard changes' }))

    expect(await screen.findByRole('heading', { name: 'Next page' })).toBeInTheDocument()
    expect(mockedApproveApplicationReview).toHaveBeenCalledTimes(1)
    expect(mockedSaveApplicationRemark).toHaveBeenCalledTimes(1)
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
    expect(screen.queryByRole('dialog', { name: 'Discard changes?' })).not.toBeInTheDocument()
  })

  it('opens the shared disapproval modal with both client-location recipients and email checked', async () => {
    renderReviewPage()
    const { controls } = await openReviewDisapproval()
    expect(controls.getByRole('checkbox', { name: 'Send disapproval email' })).toBeChecked()
    expect(await controls.findByText('owner@example.test')).toBeVisible()
    expect(controls.getByText('agent@example.test')).toBeVisible()
    expect(controls.getByRole('combobox', { name: 'Application status' })).toHaveValue('Rejected')
    await userEvent.click(controls.getByRole('button', { name: 'Edit recipients' }))
    expect(controls.getByLabelText('Owner email')).toHaveValue('owner@example.test')
    expect(controls.getByLabelText('Agent email')).toHaveValue('agent@example.test')
    expect(controls.getAllByText('Changes apply to this email only.')).toHaveLength(2)
  })

  it('carries the remark typed on the Review tab into the disapproval dialog', async () => {
    renderReviewPage()
    const review = await selectApplicationReviewTile()
    fireEvent.change(within(review).getByLabelText('Remarks'), {
      target: { value: 'Typed on the tab' },
    })
    await userEvent.click(within(review).getByRole('radio', { name: 'Withdrawn' }))
    await userEvent.click(within(review).getByRole('button', { name: 'Update status' }))

    const dialog = within(await screen.findByRole('dialog', { name: 'Disapprove application 321' }))
    expect(dialog.getByRole('combobox', { name: 'Application status' })).toHaveValue('Withdrawn')
    expect(dialog.getByLabelText('Remark')).toHaveValue('Typed on the tab')
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
      await within(ownerDetailsTile as HTMLElement).findByText('owner@example.test'),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Applicant details', level: 3 }),
    ).not.toBeInTheDocument()
    expect(screen.queryByText('Notification email')).not.toBeInTheDocument()

    // Figma heads the owner's details instead of listing an Applicant type field.
    expect(
      within(ownerDetailsTile as HTMLElement).getByRole('heading', { level: 3, name: 'Owner' }),
    ).toBeVisible()
    expect(within(ownerDetailsTile as HTMLElement).queryByText('Applicant type')).toBeNull()

    const clientLocationField = screen
      .getAllByText('Client location')
      .find((element) => element.tagName === 'DT')
      ?.closest('.record-field, .detail-field-item')
    expect(clientLocationField).toBeTruthy()
    expect(
      await within(clientLocationField as HTMLElement).findByText('03 - WOODLANDS SERVICES'),
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
    // A Ministerial applicant keeps its type visible as the owner section heading.
    expect(
      within(ownerDetailsTile as HTMLElement).getByRole('heading', {
        level: 3,
        name: 'Ministerial',
      }),
    ).toBeVisible()
  })

  it('shows only the owner email for an owner application', async () => {
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...applicationDetail,
      agentClientNumber: null,
    })
    mockedFetchApplicationSummarySnapshot.mockResolvedValue({
      ...applicationSummarySnapshot,
      applicantTypeCode: 'O',
      agentClientNumber: '',
      agentClientLocationCode: '',
      agentContactName: '',
    })
    renderReviewPage()
    const { controls } = await openReviewDisapproval()
    expect(await controls.findByText('owner@example.test')).toBeVisible()
    expect(controls.queryByText('Agent email')).not.toBeInTheDocument()
  })

  it('saves a rejection without email and focuses its result after the edit action disappears', async () => {
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([
      new DOMRect(0, 0, 100, 100),
    ] as unknown as DOMRectList)
    mockDetailAfterDisapproval(disapprovedApplicationDetail('REJ', 'Rejected', 'Needs correction'))
    renderReviewPage()
    const { review, controls } = await openReviewDisapproval()
    await userEvent.click(controls.getByRole('checkbox', { name: 'Send disapproval email' }))
    await userEvent.type(controls.getByLabelText('Remark'), 'Needs correction')
    await userEvent.click(controls.getByRole('button', { name: 'Disapprove application' }))
    // No version is passed, so the save carries the version the page loaded.
    await waitFor(() =>
      expect(mockedUpdateApplicationReviewStatus).toHaveBeenCalledWith(
        '321',
        {
          statusCode: 'REJ',
          remark: 'Needs correction',
          clientEmailAddress: '',
        },
        undefined,
      ),
    )
    expect(mockedFetchCurrentApplicationRecordVersion).not.toHaveBeenCalled()
    expect(mockedSendApplicationReviewStatusEmail).not.toHaveBeenCalled()
    expect(await within(review).findByText('No disapproval email was sent.')).toBeVisible()
    await waitFor(() => expect(within(review).getByRole('status')).toHaveFocus())
    expect(within(review).queryByRole('button', { name: 'Update status' })).not.toBeInTheDocument()
    expect(mockedSaveApplicationRemark).not.toHaveBeenCalled()
    await selectApplicationDetailTab('Remarks')
    expect(
      within(screen.getByRole('tabpanel', { name: 'Remarks' })).getAllByText('Needs correction'),
    ).toHaveLength(1)
  })

  it('reloads the application after a rejection so the record drops the edits its new status locks', async () => {
    mockDetailAfterDisapproval(disapprovedApplicationDetail('REJ', 'Rejected', 'Needs correction'))
    renderReviewPage()
    const summaryTile = await selectApplicationSummaryTile(false)
    expect(
      within(summaryTile).getByRole('button', { name: 'Edit application details' }),
    ).toBeInTheDocument()

    const { review, controls } = await openReviewDisapproval()
    await userEvent.click(controls.getByRole('checkbox', { name: 'Send disapproval email' }))
    await userEvent.type(controls.getByLabelText('Remark'), 'Needs correction')
    await userEvent.click(controls.getByRole('button', { name: 'Disapprove application' }))

    expect(await within(review).findByText('No disapproval email was sent.')).toBeVisible()
    expect(within(review).getByText('Application 321 rejected.')).toBeVisible()
    expect(mockedFetchProvincialApplicationDetail).toHaveBeenCalledTimes(2)
    expect(mockedFetchProvincialApplicationDetail).toHaveBeenLastCalledWith('321')
    expect(within(review).queryByRole('button', { name: 'Update status' })).not.toBeInTheDocument()

    expect(
      within(await selectApplicationSummaryTile(false)).queryByRole('button', {
        name: 'Edit application details',
      }),
    ).not.toBeInTheDocument()
  })

  it('keeps the disapproval notice when the reload after it fails', async () => {
    mockedFetchProvincialApplicationDetail
      .mockReset()
      .mockResolvedValueOnce(reviewableApplicationDetail)
      .mockRejectedValue(new Error('Detail unavailable'))
    renderReviewPage()
    const { review, controls } = await openReviewDisapproval()
    await userEvent.click(controls.getByRole('checkbox', { name: 'Send disapproval email' }))
    await userEvent.type(controls.getByLabelText('Remark'), 'Needs correction')
    await userEvent.click(controls.getByRole('button', { name: 'Disapprove application' }))

    expect(await within(review).findByText('Application 321 rejected.')).toBeVisible()
    expect(mockedFetchProvincialApplicationDetail).toHaveBeenCalledTimes(2)
    expect(
      await screen.findByText('Unable to retrieve provincial application detail.'),
    ).toBeVisible()
  })

  it('defaults withdrawal email on, sends to both owner and agent, and focuses the result', async () => {
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([
      new DOMRect(0, 0, 100, 100),
    ] as unknown as DOMRectList)
    mockedUpdateApplicationReviewStatus.mockResolvedValueOnce({
      updated: true,
      valid: true,
      statusCode: 'WDN',
      remark: 'Client request',
      remarkId: 99,
      clientEmail: '',
      message: 'Application status updated.',
    })
    mockDetailAfterDisapproval(disapprovedApplicationDetail('WDN', 'Withdrawn', 'Client request'))
    renderReviewPage()
    const { review, controls } = await openReviewDisapproval('Withdrawn')
    expect(controls.getByRole('combobox', { name: 'Application status' })).toHaveValue('Withdrawn')
    expect(controls.getByRole('checkbox', { name: 'Send disapproval email' })).toBeChecked()
    await controls.findByText('agent@example.test')
    await userEvent.type(controls.getByLabelText('Remark'), 'Client request')
    await userEvent.click(controls.getByRole('button', { name: 'Disapprove and send email' }))
    await waitFor(() =>
      expect(mockedSendApplicationReviewStatusEmail).toHaveBeenCalledWith('321', {
        statusCode: 'WDN',
        remark: 'Client request',
        clientEmailAddress: '',
        ownerEmail: 'owner@example.test',
        agentEmail: 'agent@example.test',
      }),
    )
    expect(
      await within(review).findByText(/Disapproval email sent to the owner/),
    ).toHaveTextContent('and the agent (agent@example.test)')
    expect(within(review).getByText('Application 321 withdrawn.')).toBeVisible()
    expect(within(review).queryByRole('link', { name: /321/ })).not.toBeInTheDocument()
    await waitFor(() => expect(within(review).getByRole('status')).toHaveFocus())
    expect(within(review).queryByRole('button', { name: 'Update status' })).not.toBeInTheDocument()
    expect(within(review).queryByText('Client email address')).not.toBeInTheDocument()
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
      clientAcronym: '',
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

  it('requires at least one recipient before committing the disapproval', async () => {
    mockedFetchApplicationClientData.mockResolvedValue({
      clientNumber: '00033344',
      companyName: 'No email',
      clientAcronym: '',
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
    renderReviewPage()
    const { controls } = await openReviewDisapproval()
    await controls.findByLabelText('Owner email')
    await userEvent.type(controls.getByLabelText('Remark'), 'Missing recipients')
    await userEvent.click(controls.getByRole('button', { name: 'Disapprove and send email' }))
    expect(
      await controls.findByText(
        'Enter at least one email address, or clear Send disapproval email to notify the applicant another way.',
      ),
    ).toBeVisible()
    expect(mockedUpdateApplicationReviewStatus).not.toHaveBeenCalled()
    expect(mockedSendApplicationReviewStatusEmail).not.toHaveBeenCalled()
  })

  it('retains the committed status and one remark when email is not sent', async () => {
    mockedSendApplicationReviewStatusEmail.mockResolvedValueOnce({
      success: false,
      message: 'Not sent',
    })
    mockDetailAfterDisapproval(disapprovedApplicationDetail('REJ', 'Rejected', 'Needs correction'))
    renderReviewPage()
    const { review, controls } = await openReviewDisapproval()
    await controls.findByText('agent@example.test')
    await userEvent.click(controls.getByRole('button', { name: 'Edit recipients' }))
    fireEvent.change(controls.getByLabelText('Agent email'), {
      target: { value: 'edited.agent@example.test' },
    })
    await userEvent.type(controls.getByLabelText('Remark'), 'Needs correction')
    await userEvent.click(controls.getByRole('button', { name: 'Disapprove and send email' }))
    expect(
      await within(review).findByText('The disapproval email could not be sent.'),
    ).toBeVisible()
    expect(
      screen.queryByRole('dialog', { name: 'Disapprove application 321' }),
    ).not.toBeInTheDocument()
    expect(mockedUpdateApplicationReviewStatus).toHaveBeenCalledTimes(1)
    expect(mockedSendApplicationReviewStatusEmail).toHaveBeenCalledWith(
      '321',
      expect.objectContaining({
        ownerEmail: 'owner@example.test',
        agentEmail: 'edited.agent@example.test',
      }),
    )
    expect(mockedFetchProvincialApplicationDetail).toHaveBeenCalledTimes(2)
    expect(mockedSaveApplicationRemark).not.toHaveBeenCalled()
    expect(within(review).getByText('Rejected')).toBeVisible()
    expect(within(review).queryByRole('button', { name: 'Update status' })).not.toBeInTheDocument()
  })

  it('keeps the same dialog while email is pending and reports an unknown send without resaving status', async () => {
    let rejectEmail!: (reason: Error) => void
    mockedSendApplicationReviewStatusEmail.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectEmail = reject
        }),
    )
    mockDetailAfterDisapproval(disapprovedApplicationDetail('REJ', 'Rejected', 'Needs correction'))
    renderReviewPage()
    const { review, dialog, controls } = await openReviewDisapproval()
    await controls.findByText('agent@example.test')
    await userEvent.type(controls.getByLabelText('Remark'), 'Needs correction')
    await userEvent.click(controls.getByRole('button', { name: 'Disapprove and send email' }))
    await waitFor(() => expect(mockedSendApplicationReviewStatusEmail).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('dialog', { name: 'Disapprove application 321' })).toBe(dialog)
    expect(controls.getByRole('button', { name: 'Saving…' })).toBeDisabled()
    expect(controls.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    // The saved status changes the record header before the separate email settles.
    expect(
      screen.getByRole('heading', { name: 'Application 321' }).closest('.lexis-page-header'),
    ).toHaveTextContent('Rejected')
    await act(async () => rejectEmail(new Error('Network response lost')))
    expect(
      await within(review).findByText(
        'The disapproval email status could not be confirmed. Check whether it was sent before sending it again.',
      ),
    ).toBeVisible()
    expect(mockedUpdateApplicationReviewStatus).toHaveBeenCalledTimes(1)
    expect(mockedSendApplicationReviewStatusEmail).toHaveBeenCalledTimes(1)
    expect(within(review).queryByRole('button', { name: 'Update status' })).not.toBeInTheDocument()
  })

  it.each([
    ['NEW', 'Rejected', 'REJ'],
    ['APP', 'Rejected', 'REJ'],
    ['APP', 'Withdrawn', 'WDN'],
  ])(
    'keeps case-insensitive review options selectable from %s',
    async (sourceStatus, label, statusCode) => {
      mockedFetchProvincialApplicationDetail.mockResolvedValue({
        ...reviewableApplicationDetail,
        applicationStatusCode: sourceStatus,
        listingDate: formatBusinessIsoDate(),
      })
      mockedFetchApplicationReviewOptions.mockResolvedValue({
        productTypes: [],
        regions: [],
        reviewStatuses: [
          { value: ' rej ', label: 'Rejected' },
          { value: 'wDn', label: 'Withdrawn' },
          { value: ' exp ', label: 'Expired' },
        ],
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
      const review = within(await selectApplicationReviewTile())
      expect(review.getByRole('radio', { name: 'Rejected' })).toHaveAttribute('value', 'REJ')
      expect(review.getByRole('radio', { name: 'Withdrawn' })).toHaveAttribute('value', 'WDN')
      expect(review.queryByRole('radio', { name: 'Expired' })).not.toBeInTheDocument()
      if (sourceStatus === 'NEW') {
        expect(review.getByRole('radio', { name: 'Approved' })).toBeChecked()
      } else {
        expect(review.queryByRole('radio', { name: 'Approved' })).not.toBeInTheDocument()
      }
      await userEvent.click(review.getByRole('radio', { name: label }))
      await userEvent.click(review.getByRole('button', { name: 'Update status' }))
      const dialog = within(screen.getByRole('dialog', { name: 'Disapprove application 321' }))
      await userEvent.click(dialog.getByRole('checkbox', { name: 'Send disapproval email' }))
      fireEvent.change(dialog.getByLabelText('Remark'), { target: { value: 'Review reason' } })
      await userEvent.click(dialog.getByRole('button', { name: 'Disapprove application' }))
      await waitFor(() =>
        expect(mockedUpdateApplicationReviewStatus).toHaveBeenCalledWith(
          '321',
          expect.objectContaining({ statusCode, remark: 'Review reason' }),
          undefined,
        ),
      )
    },
  )

  it('keeps focus on the status while the arrow keys move through Rejected and Withdrawn', async () => {
    renderReviewPage()
    const review = within(await selectApplicationReviewTile())
    await waitFor(() => expect(review.getByRole('radio', { name: 'Rejected' })).toBeEnabled())
    const approved = review.getByRole('radio', { name: 'Approved' })
    await userEvent.click(approved)
    expect(approved).toHaveFocus()

    await userEvent.keyboard('{ArrowDown}')
    const rejected = review.getByRole('radio', { name: 'Rejected' })
    expect(rejected).toBeChecked()
    expect(rejected).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}')
    const withdrawn = review.getByRole('radio', { name: 'Withdrawn' })
    expect(withdrawn).toBeChecked()
    expect(withdrawn).toHaveFocus()

    expect(
      screen.queryByRole('dialog', { name: 'Disapprove application 321' }),
    ).not.toBeInTheDocument()
    expect(review.getByRole('button', { name: 'Update status' })).toBeVisible()
  })

  it('focuses the status when Update status is used without a choice', async () => {
    // An approved application can't be approved again, so its review opens without a choice.
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...reviewableApplicationDetail,
      applicationStatusCode: 'APP',
      statusDescription: 'Approved',
    })
    renderReviewPage()
    const review = within(await selectApplicationReviewTile())
    await waitFor(() => expect(review.getByRole('radio', { name: 'Rejected' })).toBeEnabled())
    expect(review.getByRole('radio', { name: 'Rejected' })).not.toBeChecked()
    await userEvent.click(review.getByRole('button', { name: 'Update status' }))

    expect(
      review.getByText('Choose an application status before updating review status.'),
    ).toBeVisible()
    await waitFor(() => expect(review.getByRole('radio', { name: 'Rejected' })).toHaveFocus())
    expect(
      screen.queryByRole('dialog', { name: 'Disapprove application 321' }),
    ).not.toBeInTheDocument()
    expect(mockedUpdateApplicationReviewStatus).not.toHaveBeenCalled()
  })

  it('does not offer an approval action when an already approved application has no selected status', async () => {
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...reviewableApplicationDetail,
      applicationStatusCode: 'APP',
      statusDescription: 'Approved',
    })
    renderReviewPage()
    const review = within(await selectApplicationReviewTile())
    expect(review.getByRole('group', { name: /Application status/ })).toBeVisible()
    expect(review.queryByRole('button', { name: 'Approve application' })).not.toBeInTheDocument()
    expect(review.getByRole('radio', { name: 'Rejected' })).not.toBeChecked()
    expect(review.getByRole('radio', { name: 'Withdrawn' })).not.toBeChecked()
    expect(mockedUpdateApplicationReviewStatus).not.toHaveBeenCalled()
  })

  it('keeps the Review action unavailable outside the reviewer region', async () => {
    const canPerform = vi.fn(
      (action: string, orgUnit?: number | null) =>
        action !== '/applicationsReview' || orgUnit === 1903,
    )
    mockApplicationDetailAuth(canPerform, ['APPLICATION_APPROVER'], {
      actionRegions: { '/applicationsReview': ['1903'] },
    })
    renderReviewPage()
    await screen.findByRole('heading', { name: 'Application 321' })

    expect(canPerform).toHaveBeenCalledWith('/applicationsReview', 12)
    expect(screen.queryByRole('tab', { name: 'Review' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Update status' })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('dialog', { name: 'Disapprove application 321' }),
    ).not.toBeInTheDocument()
  })

  it.each(['Rejected', 'Withdrawn'])(
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
      await userEvent.click(within(reviewTile).getByRole('button', { name: 'Update status' }))
      const dialog = within(screen.getByRole('dialog', { name: 'Disapprove application 321' }))
      await userEvent.click(dialog.getByRole('checkbox', { name: 'Send disapproval email' }))
      await userEvent.click(dialog.getByRole('button', { name: 'Disapprove application' }))
      expect(dialog.getByLabelText('Remark')).toBeInvalid()
      expect(dialog.getByText('Remark is required')).toBeVisible()
      expect(mockedUpdateApplicationReviewStatus).not.toHaveBeenCalled()
    },
  )

  it('cancels disapproval and keeps the Review tab draft', async () => {
    renderReviewPage()
    const review = within(await selectApplicationReviewTile())
    await userEvent.type(review.getByLabelText('Remarks'), 'Draft review note')
    await userEvent.click(review.getByRole('radio', { name: 'Withdrawn' }))
    const updateStatus = review.getByRole('button', { name: 'Update status' })
    await userEvent.click(updateStatus)
    const dialog = within(screen.getByRole('dialog', { name: 'Disapprove application 321' }))
    expect(dialog.getByLabelText('Remark')).toHaveValue('Draft review note')
    fireEvent.change(dialog.getByLabelText('Remark'), { target: { value: 'Discard this draft' } })
    await userEvent.click(dialog.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(review.getByRole('radio', { name: 'Withdrawn' })).toBeChecked()
    expect(review.getByLabelText('Remarks')).toHaveValue('Draft review note')
    await waitFor(() => expect(updateStatus).toHaveFocus())
    expect(mockedUpdateApplicationReviewStatus).not.toHaveBeenCalled()
    expect(mockedSaveApplicationRemark).not.toHaveBeenCalled()
  })

  it.each(['Owner email', 'Agent email'])(
    'allows removing %s while sending to the other recipient',
    async (removedLabel) => {
      renderReviewPage()
      const { controls } = await openReviewDisapproval()
      await userEvent.click(await controls.findByRole('button', { name: 'Edit recipients' }))
      await userEvent.clear(controls.getByLabelText(removedLabel))
      await userEvent.type(controls.getByLabelText('Remark'), 'Needs correction')
      await userEvent.click(controls.getByRole('button', { name: 'Disapprove and send email' }))

      await waitFor(() =>
        expect(mockedSendApplicationReviewStatusEmail).toHaveBeenCalledWith(
          '321',
          expect.objectContaining({
            ownerEmail: removedLabel === 'Owner email' ? '' : 'owner@example.test',
            agentEmail: removedLabel === 'Agent email' ? '' : 'agent@example.test',
          }),
        ),
      )
      expect(mockedUpdateApplicationReviewStatus).toHaveBeenCalledTimes(1)
    },
  )

  it('keeps disapproval fields and the unchanged record when its status save fails', async () => {
    mockedUpdateApplicationReviewStatus.mockResolvedValueOnce({
      valid: false,
      updated: false,
      statusCode: 'NEW',
      clientEmail: '',
      remark: '',
      message: 'The application changed. Reload before updating its status.',
    })
    renderReviewPage()
    const { dialog, controls } = await openReviewDisapproval()
    await controls.findByText('agent@example.test')
    await userEvent.type(controls.getByLabelText('Remark'), 'Needs correction')
    await userEvent.click(controls.getByRole('button', { name: 'Disapprove and send email' }))

    expect(
      await controls.findByText('The application changed. Reload before updating its status.'),
    ).toBeVisible()
    expect(screen.getByRole('dialog', { name: 'Disapprove application 321' })).toBe(dialog)
    expect(controls.getByLabelText('Remark')).toHaveValue('Needs correction')
    expect(mockedSendApplicationReviewStatusEmail).not.toHaveBeenCalled()
    await userEvent.click(controls.getByRole('button', { name: 'Cancel' }))
    expect(
      within(await selectApplicationReviewTile(false)).getByRole('radio', { name: 'Rejected' }),
    ).toBeChecked()
  })

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
    expect(await screen.findByLabelText('Remark')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Save remark' }))

    expect(screen.getByText('Remark is required')).toBeInTheDocument()
    expect(mockedSaveApplicationRemark).not.toHaveBeenCalled()
  })
})
