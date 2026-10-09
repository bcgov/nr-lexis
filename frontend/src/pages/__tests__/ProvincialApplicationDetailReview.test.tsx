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
    expect(rows[0]).toHaveTextContent('2026-09-24')
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
    fireEvent.change(await screen.findByLabelText('Package comments'), {
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
    expect(within(remarkRow as HTMLElement).getByText('2026-01-04')).toBeInTheDocument()
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
    // A Ministerial applicant keeps its type visible as the owner section heading.
    expect(
      within(ownerDetailsTile as HTMLElement).getByRole('heading', {
        level: 3,
        name: 'Ministerial',
      }),
    ).toBeVisible()
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
    expect(await within(reviewTile).findByText('Application rejected.')).toBeVisible()
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
    expect(await reviewControls.findByText('Application withdrawn.')).toBeVisible()
    expect(screen.getByText('Email sent to agent@example.test.')).toBeInTheDocument()
    const savedEmail = within(await selectApplicationReviewTile(false))
      .getByText('Client email address')
      .closest('.record-field, .detail-field-item') as HTMLElement
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

  it('blocks status email when the authoritative client account has no valid address', async () => {
    mockedFetchApplicationClientData.mockResolvedValue({
      clientNumber: '00033344',
      companyName: 'Applicant without email',
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

  it('retains the saved status and closes the editor when status email is unavailable', async () => {
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
    expect(within(reviewTile).queryByLabelText(/client email address/i)).not.toBeInTheDocument()
    expect(within(reviewTile).queryByRole('textbox', { name: 'Remarks' })).not.toBeInTheDocument()
    expect(
      within(reviewTile).queryByRole('button', { name: 'Update status' }),
    ).not.toBeInTheDocument()
    expect(screen.getAllByText('Rejected').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Needs correction').length).toBeGreaterThan(0)
  })

  it('applies the committed rejection before email completes and reports an unconfirmed send separately', async () => {
    let rejectEmail!: (reason: Error) => void
    mockedSendApplicationReviewStatusEmail.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectEmail = reject
        }),
    )
    mockedUpdateApplicationReviewStatus.mockResolvedValueOnce({
      valid: true,
      updated: true,
      statusCode: 'REJ',
      remark: 'Needs correction',
      remarkId: 99,
      clientEmail: 'agent@example.test',
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
    const review = within(reviewTile)
    await userEvent.click(review.getByRole('radio', { name: 'Rejected' }))
    fireEvent.change(review.getByLabelText('Remarks'), { target: { value: 'Needs correction' } })
    await userEvent.click(
      review.getByRole('checkbox', {
        name: 'Send email notification to the client, including the remark',
      }),
    )
    await waitFor(() =>
      expect(review.getByLabelText('Client email address')).toHaveValue('agent@example.test'),
    )
    await userEvent.click(review.getByRole('button', { name: 'Reject application and send email' }))
    await waitFor(() => expect(mockedSendApplicationReviewStatusEmail).toHaveBeenCalledTimes(1))
    expect(review.getByText('Rejected')).toBeInTheDocument()
    expect(review.getByText('Needs correction')).toBeInTheDocument()
    expect(review.queryByRole('textbox', { name: 'Remarks' })).not.toBeInTheDocument()

    await act(async () => rejectEmail(new Error('Network response lost')))
    expect(
      await review.findByText(
        'The application status was updated, but the email result could not be confirmed. Check delivery before sending another email.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText('Unable to update application status.')).not.toBeInTheDocument()
    expect(review.queryByText('Client email address')).not.toBeInTheDocument()
    expect(review.queryByRole('button', { name: 'Update status' })).not.toBeInTheDocument()
    expect(mockedUpdateApplicationReviewStatus).toHaveBeenCalledTimes(1)
    expect(mockedSendApplicationReviewStatusEmail).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['NEW', 'Rejected', 'REJ'],
    ['APP', 'Withdrawn', 'WDN'],
  ])(
    'keeps case-insensitive review options selectable from %s',
    async (sourceStatus, label, statusCode) => {
      mockedFetchProvincialApplicationDetail.mockResolvedValue({
        ...reviewableApplicationDetail,
        applicationStatusCode: sourceStatus,
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
      fireEvent.change(review.getByLabelText('Remarks'), { target: { value: 'Review reason' } })
      await userEvent.click(
        review.getByRole('button', {
          name: statusCode === 'REJ' ? 'Reject application' : 'Withdraw application',
        }),
      )
      await waitFor(() =>
        expect(mockedUpdateApplicationReviewStatus).toHaveBeenCalledWith(
          '321',
          expect.objectContaining({ statusCode, remark: 'Review reason' }),
        ),
      )
    },
  )

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
          'Status change remark is required when rejecting, withdrawing, or expiring an application',
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
    expect(await screen.findByLabelText('Remark')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Save remark' }))

    expect(screen.getByText('Remark is required')).toBeInTheDocument()
    expect(mockedSaveApplicationRemark).not.toHaveBeenCalled()
  })
})
