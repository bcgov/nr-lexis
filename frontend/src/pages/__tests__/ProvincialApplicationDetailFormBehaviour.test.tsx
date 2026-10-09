import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  createMemoryRouter,
  Link,
  MemoryRouter,
  Route,
  RouterProvider,
  Routes,
} from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  applicationDetail,
  chooseComboBoxOption,
  setupApplicationDetailTests,
  getSummaryComboBox,
  mockedFetchApplicationPackageStatusCodes,
  mockedFetchApplicationReviewOptions,
  mockedFetchProvincialApplicationOptions,
  mockedFetchProvincialApplicationDetail,
  mockedAddApplicationPackage,
  mockedAddApplicationScaleToPackage,
  mockedSaveApplicationRemark,
  mockedSubmitAdminUpload,
  mockedUpdateApplicationPackage,
  mockedUpdateApplicationSummary,
  selectApplicationDetailTab,
  selectApplicationReviewTile,
} from './ProvincialApplicationDetailActions.support'
import ProvincialApplicationDetailsPage from '@/pages/ProvincialApplicationDetails'

const renderApplicationDetail = (initialEntry = '/provincial/application/321') =>
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route
          path="/provincial/application/:applicationNumber"
          element={<ProvincialApplicationDetailsPage />}
        />
      </Routes>
    </MemoryRouter>,
  )

const applicantTile = (): HTMLElement =>
  screen.getByRole('heading', { name: 'Applicant details', level: 2 }).closest('.cds--tile')!

/** Opens the applicant card once its client details have loaded. */
const editApplicantDetails = async () => {
  await within(await waitFor(applicantTile)).findAllByText(/Owner Forestry Ltd\./)
  const tile = within(applicantTile())
  await userEvent.click(tile.getByRole('button', { name: 'Edit applicant details' }))
  const contactName = tile.getAllByRole('textbox', { name: 'Contact name' })[0]
  // Editing looks the clients up again; saving waits for that.
  await waitFor(() => expect(applicantTile().querySelector('[aria-busy="true"]')).toBeNull())
  return { tile, contactName }
}

const cardTile = (title: string): HTMLElement =>
  screen.getByRole('heading', { name: title, level: 2 }).closest('.cds--tile')!

const packageDrawer = (): HTMLElement =>
  document.querySelector('.application-items-drawer') as HTMLElement

describe.sequential('Provincial Application Detail - form behaviour', () => {
  it.each([
    { tab: 'Applicant', edit: 'Edit applicant details' },
    { tab: 'Application', edit: 'Edit application details' },
    { tab: 'Scale', edit: 'Edit scale details' },
  ])(
    'closes unchanged $tab editing without a request or accuracy prompt',
    async ({ tab, edit }) => {
      renderApplicationDetail()
      await selectApplicationDetailTab(tab)
      if (tab === 'Applicant') await editApplicantDetails()
      else await userEvent.click(await screen.findByRole('button', { name: edit }))
      const card = within(
        cardTile(
          tab === 'Applicant'
            ? 'Applicant details'
            : tab === 'Scale'
              ? 'Scale details'
              : 'Application details',
        ),
      )
      await userEvent.click(card.getByRole('button', { name: 'Save changes' }))
      await waitFor(() => expect(screen.getByRole('button', { name: edit })).toHaveFocus())
      expect(mockedUpdateApplicationSummary).not.toHaveBeenCalled()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    },
  )

  it('closes unchanged package editing without updating its stored values', async () => {
    renderApplicationDetail('/provincial/application/321?tab=items')
    await userEvent.click(await screen.findByRole('button', { name: 'Edit package' }))
    const panel = within(packageDrawer())
    await waitFor(() => expect(panel.getByLabelText('Package volume (m³)')).toBeEnabled())
    await userEvent.click(panel.getByRole('button', { name: 'Save package' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit package' })).toHaveFocus())
    expect(mockedUpdateApplicationPackage).not.toHaveBeenCalled()
    expect(packageDrawer()).toBeNull()
  })

  it('closes an unchanged saved remark without a request or notification', async () => {
    renderApplicationDetail()
    await selectApplicationDetailTab('Remarks')
    const row = await screen.findByRole('row', { name: /ok/ })
    await userEvent.click(within(row).getByRole('button', { name: 'Edit' }))
    expect(await screen.findByLabelText('Remark')).toHaveValue('ok')
    await userEvent.click(screen.getByRole('button', { name: 'Update remark' }))
    await waitFor(() => expect(within(row).getByRole('button', { name: 'Edit' })).toHaveFocus())
    expect(mockedSaveApplicationRemark).not.toHaveBeenCalled()
    expect(screen.queryByRole('complementary', { name: 'Edit remark' })).not.toBeInTheDocument()
  })

  beforeEach(setupApplicationDetailTests)

  it('focuses the first field on Edit and returns focus to Edit after Cancel', async () => {
    renderApplicationDetail()
    const { tile, contactName } = await editApplicantDetails()

    await waitFor(() => expect(contactName).toHaveFocus())
    await userEvent.click(tile.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog', { name: 'Discard changes?' })).not.toBeInTheDocument()
    await waitFor(() =>
      expect(tile.getByRole('button', { name: 'Edit applicant details' })).toHaveFocus(),
    )
  })

  it.each([
    {
      tab: 'Application',
      card: 'Application details',
      edit: 'Edit application details',
      firstField: () => getSummaryComboBox(within(cardTile('Application details')), 'Region'),
    },
    {
      tab: 'Scale',
      card: 'Scale details',
      edit: 'Edit scale details',
      firstField: () => within(cardTile('Scale details')).getByLabelText('Location of logs'),
    },
    {
      tab: 'Review',
      card: 'Application review',
      edit: 'Update status',
      firstField: () =>
        within(cardTile('Application review')).getByRole('radio', { name: 'Rejected' }),
    },
  ])('focuses the first $card field on Edit and the Edit button on Cancel', async (card) => {
    renderApplicationDetail()
    await selectApplicationDetailTab(card.tab)
    await waitFor(() => expect(mockedFetchProvincialApplicationOptions).toHaveBeenCalled())
    const tile = within(await waitFor(() => cardTile(card.card)))
    const edit = await tile.findByRole('button', { name: card.edit })
    await waitFor(() => expect(edit).toBeEnabled())

    await userEvent.click(edit)

    await waitFor(() => expect(card.firstField()).toHaveFocus())
    await userEvent.click(tile.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(tile.getByRole('button', { name: card.edit })).toHaveFocus())
  })

  it('keeps Save enabled, shows errors on their fields and focuses the first', async () => {
    renderApplicationDetail()
    const { tile, contactName } = await editApplicantDetails()
    fireEvent.change(contactName, { target: { value: '' } })
    const save = tile.getByRole('button', { name: 'Save changes' })
    expect(save).toBeEnabled()

    await userEvent.click(save)

    expect(await tile.findByText('Applicant contact name is required')).toBeInTheDocument()
    expect(contactName).toHaveAttribute('aria-invalid', 'true')
    await waitFor(() => expect(contactName).toHaveFocus())
    expect(screen.queryByText('Action failed')).not.toBeInTheDocument()
    expect(mockedUpdateApplicationSummary).not.toHaveBeenCalled()

    await userEvent.type(contactName, 'N')
    expect(tile.queryByText('Applicant contact name is required')).not.toBeInTheDocument()
  })

  it('returns focus to Edit after a successful save', async () => {
    renderApplicationDetail()
    const { tile, contactName } = await editApplicantDetails()
    fireEvent.change(contactName, { target: { value: 'New Contact' } })

    await userEvent.click(tile.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(mockedUpdateApplicationSummary).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(tile.getByRole('button', { name: 'Edit applicant details' })).toHaveFocus(),
    )
  })

  it('asks before cancelling a changed card and keeps the changes on Keep editing', async () => {
    renderApplicationDetail()
    const { tile, contactName } = await editApplicantDetails()
    fireEvent.change(contactName, { target: { value: 'Unsaved contact' } })
    const cancel = tile.getByRole('button', { name: 'Cancel' })

    await userEvent.click(cancel)
    const dialog = await screen.findByRole('dialog', { name: 'Discard changes?' })
    expect(dialog).toHaveAccessibleDescription('Your changes will be lost.')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep editing' }))

    await waitFor(() => expect(cancel).toHaveFocus())
    expect(contactName).toHaveValue('Unsaved contact')

    await userEvent.click(cancel)
    await userEvent.click(await screen.findByRole('button', { name: 'Discard changes' }))

    await waitFor(() =>
      expect(tile.getByRole('button', { name: 'Edit applicant details' })).toHaveFocus(),
    )
    expect(tile.getByText('Owner Contact')).toBeInTheDocument()
    expect(mockedUpdateApplicationSummary).not.toHaveBeenCalled()
  })

  it('asks before switching tabs away from a changed card', async () => {
    renderApplicationDetail()
    const { tile, contactName } = await editApplicantDetails()
    fireEvent.change(contactName, { target: { value: 'Unsaved contact' } })

    await userEvent.click(screen.getByRole('tab', { name: 'Application' }))
    const dialog = await screen.findByRole('dialog', { name: 'Discard changes?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep editing' }))

    expect(screen.getByRole('tab', { name: 'Applicant' })).toHaveAttribute('aria-selected', 'true')
    expect(contactName).toHaveValue('Unsaved contact')

    await userEvent.click(screen.getByRole('tab', { name: 'Application' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Discard changes' }))

    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'Application' })).toHaveAttribute(
        'aria-selected',
        'true',
      ),
    )
    await selectApplicationDetailTab('Applicant')
    expect(tile.getByRole('button', { name: 'Edit applicant details' })).toBeInTheDocument()
    expect(tile.getByText('Owner Contact')).toBeInTheDocument()
  })

  it('leaves an unchanged card for another tab without asking', async () => {
    renderApplicationDetail()
    const { tile } = await editApplicantDetails()

    await userEvent.click(screen.getByRole('tab', { name: 'Application' }))

    expect(screen.queryByRole('dialog', { name: 'Discard changes?' })).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Application' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await selectApplicationDetailTab('Applicant')
    expect(tile.getByRole('button', { name: 'Edit applicant details' })).toBeInTheDocument()
  })

  it('asks before leaving the application with a changed card', async () => {
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
    const { contactName } = await editApplicantDetails()
    fireEvent.change(contactName, { target: { value: 'Unsaved contact' } })

    await userEvent.click(screen.getByRole('link', { name: 'Leave application' }))
    const dialog = await screen.findByRole('dialog', { name: 'Discard changes?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep editing' }))
    expect(router.state.location.pathname).toBe('/provincial/application/321')
    expect(contactName).toHaveValue('Unsaved contact')

    await userEvent.click(screen.getByRole('link', { name: 'Leave application' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Discard changes' }))

    expect(await screen.findByRole('heading', { name: 'Next page' })).toBeInTheDocument()
    expect(mockedUpdateApplicationSummary).not.toHaveBeenCalled()
  })

  it('keeps the review action enabled while review options load and explains at the card top', async () => {
    mockedFetchApplicationReviewOptions.mockReturnValue(new Promise(() => undefined))
    renderApplicationDetail()
    const review = within(await selectApplicationReviewTile())
    const update = review.getByRole('button', { name: 'Update status' })
    expect(update).toBeEnabled()

    await userEvent.click(update)

    expect(
      await review.findByText(
        'Authoritative review options must load before review changes can be saved.',
      ),
    ).toBeInTheDocument()
  })

  it('keeps Save package enabled while item options load and explains at the drawer top', async () => {
    mockedFetchApplicationPackageStatusCodes.mockReturnValue(new Promise(() => undefined))
    renderApplicationDetail('/provincial/application/321?tab=items')
    const editPackage = await screen.findByRole('button', { name: 'Edit package' })
    await waitFor(() => expect(editPackage).toBeEnabled())
    await userEvent.click(editPackage)
    const drawer = within(packageDrawer())
    const save = drawer.getByRole('button', { name: 'Save package' })
    expect(save).toBeEnabled()

    await userEvent.click(save)

    expect(await drawer.findByText('Package save failed')).toBeInTheDocument()
    expect(drawer.getByText('Loading authoritative item options…')).toBeInTheDocument()
    expect(mockedUpdateApplicationPackage).not.toHaveBeenCalled()
  })

  it('shows package errors on their fields on Save and focuses the first', async () => {
    renderApplicationDetail('/provincial/application/321?tab=items')
    await userEvent.click(await screen.findByRole('button', { name: 'Edit package' }))
    const drawer = within(packageDrawer())
    const volume = drawer.getByLabelText('Package volume (m³)')
    await waitFor(() => expect(volume).toBeEnabled())
    await userEvent.clear(volume)
    expect(drawer.queryByText('Package volume is required')).not.toBeInTheDocument()

    await userEvent.click(drawer.getByRole('button', { name: 'Save package' }))

    expect(await drawer.findByText('Package volume is required')).toBeInTheDocument()
    await waitFor(() => expect(volume).toHaveFocus())
    expect(drawer.queryByText('Package save failed')).not.toBeInTheDocument()
    expect(mockedUpdateApplicationPackage).not.toHaveBeenCalled()

    await userEvent.type(volume, '9')
    expect(drawer.queryByText('Package volume is required')).not.toBeInTheDocument()
  })

  it('shows a duplicate package number from the server on the package number field', async () => {
    mockedUpdateApplicationPackage.mockResolvedValueOnce({
      valid: false,
      packageNumber: '',
      errors: ['Package PKG-9 already exists.'],
      warnings: [],
    })
    renderApplicationDetail('/provincial/application/321?tab=items')
    await userEvent.click(await screen.findByRole('button', { name: 'Edit package' }))
    const drawer = within(packageDrawer())
    const packageNumber = drawer.getByLabelText('Package number')
    await waitFor(() => expect(packageNumber).toBeEnabled())
    await userEvent.clear(packageNumber)
    await userEvent.type(packageNumber, 'PKG-9')

    await userEvent.click(drawer.getByRole('button', { name: 'Save package' }))

    expect(await drawer.findByText('Package PKG-9 already exists')).toBeInTheDocument()
    expect(packageNumber).toHaveAttribute('aria-invalid', 'true')
    expect(drawer.queryByText('Package save failed')).not.toBeInTheDocument()
  })

  it('asks before a tab switch discards an application package draft', async () => {
    renderApplicationDetail('/provincial/application/321?tab=items')
    await userEvent.click(await screen.findByRole('button', { name: 'Edit package' }))
    const volume = within(packageDrawer()).getByLabelText('Package volume (m³)')
    await waitFor(() => expect(volume).toBeEnabled())
    await userEvent.clear(volume)
    await userEvent.type(volume, '9')

    await selectApplicationDetailTab('Application')
    await userEvent.click(await screen.findByRole('button', { name: 'Keep editing' }))
    expect(screen.getByRole('tab', { name: 'Scale' })).toHaveAttribute('aria-selected', 'true')
    expect(volume).toHaveValue('9')

    await selectApplicationDetailTab('Application')
    await userEvent.click(await screen.findByRole('button', { name: 'Discard changes' }))
    expect(screen.getByRole('tab', { name: 'Application' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(packageDrawer()).toBeNull()
    expect(mockedUpdateApplicationPackage).not.toHaveBeenCalled()
    const unload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(unload)
    expect(unload.defaultPrevented).toBe(false)
  })

  it('asks before a tab switch discards a queued application document', async () => {
    renderApplicationDetail()
    await selectApplicationDetailTab('Documents')
    await userEvent.click(await screen.findByRole('button', { name: 'Add documents' }))
    const panel = await screen.findByRole('complementary', { name: 'Add documents' })
    await userEvent.upload(
      within(panel).getByLabelText('Document File'),
      new File(['test'], 'pending.pdf', { type: 'application/pdf' }),
    )

    await selectApplicationDetailTab('Application')
    await userEvent.click(await screen.findByRole('button', { name: 'Keep editing' }))
    expect(screen.getByRole('tab', { name: 'Documents' })).toHaveAttribute('aria-selected', 'true')
    expect(within(panel).getByText('pending.pdf')).toBeInTheDocument()

    await selectApplicationDetailTab('Application')
    await userEvent.click(await screen.findByRole('button', { name: 'Discard changes' }))
    expect(screen.getByRole('tab', { name: 'Application' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.queryByRole('complementary', { name: 'Add documents' })).not.toBeInTheDocument()
    expect(mockedSubmitAdminUpload).not.toHaveBeenCalled()
  })

  it('uses one discard decision to replace a package draft with scale editing', async () => {
    renderApplicationDetail('/provincial/application/321?tab=items')
    await userEvent.click(await screen.findByRole('button', { name: 'Create package' }))
    const volume = within(packageDrawer()).getByLabelText('Volume (m³)')
    await waitFor(() => expect(volume).toBeEnabled())
    await userEvent.clear(volume)
    await userEvent.type(volume, '9')
    const editScale = screen.getByRole('button', { name: 'Edit scale details' })
    expect(editScale).toBeEnabled()

    await userEvent.click(editScale)
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect(volume).toHaveValue('9')
    await waitFor(() => expect(editScale).toHaveFocus())
    expect(screen.queryByLabelText('Location of logs')).not.toBeInTheDocument()

    await userEvent.click(editScale)
    await userEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
    expect(packageDrawer()).toBeNull()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('Location of logs')).toHaveFocus())
    expect(mockedAddApplicationPackage).not.toHaveBeenCalled()
    expect(mockedUpdateApplicationSummary).not.toHaveBeenCalled()
  })

  it('replaces an unchanged package panel with scale editing without a prompt', async () => {
    renderApplicationDetail('/provincial/application/321?tab=items')
    await userEvent.click(await screen.findByRole('button', { name: 'Create package' }))
    await userEvent.click(screen.getByRole('button', { name: 'Edit scale details' }))

    expect(packageDrawer()).toBeNull()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('Location of logs')).toHaveFocus())
  })

  it('blocks replacement editing while a package save is pending', async () => {
    mockedUpdateApplicationPackage.mockReturnValueOnce(new Promise(() => undefined))
    renderApplicationDetail('/provincial/application/321?tab=items')
    await userEvent.click(await screen.findByRole('button', { name: 'Edit package' }))
    const drawer = within(packageDrawer())
    await waitFor(() => expect(drawer.getByLabelText('Package volume (m³)')).toBeEnabled())
    await userEvent.type(drawer.getByLabelText('Package comments'), ' Pending package')
    await userEvent.click(drawer.getByRole('button', { name: 'Save package' }))

    expect(await drawer.findByRole('button', { name: 'Saving…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Edit scale details' })).toBeDisabled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(mockedUpdateApplicationPackage).toHaveBeenCalledTimes(1)
  })

  it('asks before replacing a new package draft with the scale panel', async () => {
    renderApplicationDetail('/provincial/application/321?tab=items')
    await userEvent.click(await screen.findByRole('button', { name: 'Create package' }))
    const volume = within(packageDrawer()).getByLabelText('Volume (m³)')
    await waitFor(() => expect(volume).toBeEnabled())
    await userEvent.clear(volume)
    await userEvent.type(volume, '9')
    const addScale = screen.getByRole('button', { name: 'Add scale' })
    expect(addScale).toBeEnabled()

    await userEvent.click(addScale)
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect(volume).toHaveValue('9')
    await waitFor(() => expect(addScale).toHaveFocus())

    await userEvent.click(addScale)
    await userEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
    expect(screen.queryByRole('complementary', { name: 'Create package' })).not.toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: 'Add scale' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('Timber mark')).toHaveFocus())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Timber mark'), 'TM-DRAFT')
    await userEvent.click(screen.getByRole('button', { name: 'Edit package' }))
    await userEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
    const packageNumber = within(packageDrawer()).getByLabelText('Package number')
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    )
    expect(packageNumber).toHaveFocus()
    expect(mockedAddApplicationPackage).not.toHaveBeenCalled()
    expect(mockedAddApplicationScaleToPackage).not.toHaveBeenCalled()
  })

  it('asks before package selection discards a new package draft', async () => {
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...applicationDetail,
      packages: [
        ...applicationDetail.packages,
        { packageNumber: 'PKG-2', volume: 100, pieceCount: 5 },
      ],
    })
    renderApplicationDetail('/provincial/application/321?tab=items')
    await userEvent.click(await screen.findByRole('button', { name: 'Create package' }))
    const comments = within(packageDrawer()).getByLabelText('Comments')
    await userEvent.type(comments, 'Unsaved package')
    const selector = screen.getByRole('combobox', { name: 'Selected package' })

    await chooseComboBoxOption(selector, 'PKG-2')
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect(selector).toHaveValue('PKG-1')
    expect(comments).toHaveValue('Unsaved package')

    await chooseComboBoxOption(selector, 'PKG-2')
    await userEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
    await waitFor(() => expect(selector).toHaveValue('PKG-2'))
    expect(packageDrawer()).toBeNull()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(mockedAddApplicationPackage).not.toHaveBeenCalled()
  })

  it('retains a remark draft on Keep editing and starts a clean remark after Discard', async () => {
    renderApplicationDetail()
    await selectApplicationDetailTab('Remarks')
    const add = screen.getByRole('button', { name: 'Add remark' })
    await userEvent.click(add)
    const remark = screen.getByLabelText('Remark')
    await userEvent.type(remark, 'Unsaved note')
    expect(add).toBeEnabled()

    await userEvent.click(add)
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect(remark).toHaveValue('Unsaved note')
    await waitFor(() => expect(add).toHaveFocus())

    await userEvent.click(add)
    await userEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(remark).toHaveValue('')
    await waitFor(() => expect(remark).toHaveFocus())
    expect(screen.getByRole('complementary', { name: 'Add remark' })).toBeInTheDocument()
    expect(mockedSaveApplicationRemark).not.toHaveBeenCalled()
  })

  it('replaces an edited remark with another saved remark only after Discard', async () => {
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...applicationDetail,
      remarks: [
        ...applicationDetail.remarks,
        { remarkId: 89, title: 'Second note', remark: 'Second saved note', date: '2026-01-05' },
      ],
    })
    renderApplicationDetail()
    await selectApplicationDetailTab('Remarks')
    const firstEdit = within(screen.getByRole('row', { name: /ok/ })).getByRole('button', {
      name: 'Edit',
    })
    const secondEdit = within(screen.getByRole('row', { name: /Second saved note/ })).getByRole(
      'button',
      { name: 'Edit' },
    )
    await userEvent.click(firstEdit)
    const remark = screen.getByLabelText('Remark')
    await userEvent.type(remark, ' unsaved')

    await userEvent.click(secondEdit)
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect(remark).toHaveValue('ok unsaved')
    await waitFor(() => expect(secondEdit).toHaveFocus())

    await userEvent.click(secondEdit)
    await userEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
    expect(remark).toHaveValue('Second saved note')
    await waitFor(() => expect(remark).toHaveFocus())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await userEvent.type(remark, ' updated')
    await userEvent.click(screen.getByRole('button', { name: 'Update remark' }))
    await waitFor(() =>
      expect(mockedSaveApplicationRemark).toHaveBeenCalledWith({
        applicationNumber: '321',
        remarkId: '89',
        remarkBody: 'Second saved note updated',
      }),
    )
  })

  it('blocks remark replacement while saving', async () => {
    mockedSaveApplicationRemark.mockReturnValueOnce(new Promise(() => undefined))
    renderApplicationDetail()
    await selectApplicationDetailTab('Remarks')
    await userEvent.click(screen.getByRole('button', { name: 'Add remark' }))
    await userEvent.type(screen.getByLabelText('Remark'), 'Pending note')
    await userEvent.click(screen.getByRole('button', { name: 'Save remark' }))

    expect(await screen.findByRole('button', { name: 'Saving…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Add remark' })).toBeDisabled()
    expect(
      within(screen.getByRole('row', { name: /ok/ })).getByRole('button', { name: 'Edit' }),
    ).toBeDisabled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(mockedSaveApplicationRemark).toHaveBeenCalledTimes(1)
  })
})
