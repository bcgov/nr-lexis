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
  LocationProbe,
  NavigateButton,
  applicationDetail,
  applicationSummarySnapshot,
  chooseComboBoxOption,
  getApplicationSummaryTile,
  getSummaryComboBox,
  mockApplicationDetailAuth,
  mockedCheckApplicationVolumeUsage,
  mockedFetchApplicationClientContacts,
  mockedFetchApplicationClientData,
  mockedFetchApplicationClientLocations,
  mockedFetchApplicationDocuments,
  mockedFetchApplicationSpecies,
  mockedFetchApplicationSummarySnapshot,
  mockedFetchProvincialApplicationDetail,
  mockedFetchProvincialApplicationOptions,
  mockedFetchProvincialExemptionDetail,
  mockedSaveApplicationRemark,
  mockedUpdateApplicationReviewStatus,
  mockedUpdateApplicationSummary,
  newExemptionDetail,
  selectApplicationDetailTab,
  selectApplicationItemDetailsTile,
  selectApplicationRemarksForEditing,
  selectApplicationReviewTile,
  selectApplicationSummaryTile,
} from './ProvincialApplicationDetailActions.support'
import ProvincialApplicationDetailsPage from '@/pages/ProvincialApplicationDetails'

const getOwnerClientDetailsTile = (): HTMLElement => {
  const title = screen.getByRole('heading', {
    name: 'Owner client details',
    level: 2,
  })
  const tile = title.closest('.cds--tile')
  expect(tile).toBeTruthy()
  return tile as HTMLElement
}

const getAgentDetailsTile = (): HTMLElement => {
  const title = screen.getByRole('heading', {
    name: 'Agent details',
    level: 2,
  })
  const tile = title.closest('.cds--tile')
  expect(tile).toBeTruthy()
  return tile as HTMLElement
}

describe.sequential('Provincial Application Detail Actions - application', () => {
  beforeEach(setupApplicationDetailTests)

  it('does not render a top-right application highlights widget', async () => {
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

    await screen.findByRole('heading', { level: 1, name: 'Application 321' })
    expect(
      screen.queryByRole('group', {
        name: 'Application highlights',
      }),
    ).not.toBeInTheDocument()
  })

  it('opens the application summary in view mode without repeating the application number', async () => {
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

    expect(await screen.findByRole('heading', { level: 1, name: 'Application 321' })).toBeVisible()
    const summaryTile = await selectApplicationSummaryTile(false)
    const summary = within(summaryTile)

    expect(summary.queryByText('Application number')).not.toBeInTheDocument()
    expect(summary.queryByText('Status', { exact: true })).not.toBeInTheDocument()
    expect(summary.queryByText('Author')).not.toBeInTheDocument()
    expect(screen.getByText('Author: idir\\application-author')).toBeInTheDocument()
    expect(summary.getByRole('button', { name: 'Edit application summary' })).toBeInTheDocument()
    expect(summary.queryByRole('button', { name: 'Save Summary' })).not.toBeInTheDocument()
    expect(summary.queryByLabelText('Location of logs')).not.toBeInTheDocument()
    expect(summary.queryByText('Owner client number')).not.toBeInTheDocument()
    expect(summary.queryByText('Agent client number')).not.toBeInTheDocument()
    expect(summary.queryByText('Application volume')).not.toBeInTheDocument()

    const itemDetails = within(await selectApplicationItemDetailsTile())
    fireEvent.change(await itemDetails.findByLabelText('Location of logs'), {
      target: { value: 'Changed location' },
    })
    await userEvent.click(itemDetails.getByRole('button', { name: 'Cancel' }))

    expect(itemDetails.queryByLabelText('Location of logs')).not.toBeInTheDocument()
    expect(
      itemDetails.getByRole('button', { name: 'Edit application item details' }),
    ).toBeInTheDocument()
    expect(mockedUpdateApplicationSummary).not.toHaveBeenCalled()
  })

  it('shows a green creation confirmation after redirecting from application creation', async () => {
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/provincial/application/321',
            state: {
              applicationCreationNotice: {
                applicationNumber: '321',
              },
            },
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

    expect(await screen.findByText('Action complete')).toBeInTheDocument()
    expect(screen.getByText('Created application 321.')).toBeInTheDocument()
  })

  it('shows each summary field once while editing and restores display values on cancel', async () => {
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

    const summary = within(await selectApplicationSummaryTile())
    const fields = ['Region', 'Listing date', 'Jurisdiction', 'Order in Council indicator']
    for (const field of fields) {
      expect(summary.getAllByText(field, { exact: true })).toHaveLength(1)
    }

    await userEvent.click(summary.getByRole('button', { name: 'Cancel' }))
    for (const field of fields) {
      expect(summary.getAllByText(field, { exact: true })).toHaveLength(1)
    }
    expect(summary.getByRole('button', { name: 'Edit application summary' })).toBeVisible()
    expect(mockedUpdateApplicationSummary).not.toHaveBeenCalled()
  })

  it('uses the legacy application detail tab order', async () => {
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
    const pageHeading = screen.getByRole('heading', {
      level: 1,
      name: 'Application 321',
    })
    const pageHeader = pageHeading.closest('.lexis-page-header')
    expect(pageHeader).toBeTruthy()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(
      within(pageHeader as HTMLElement).getByText('Author: idir\\application-author'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Back to Provincial application search' }),
    ).toHaveAttribute('href', '/provincial/application')
    const status = within(pageHeader as HTMLElement).getByText('Approved')
    expect(status).toHaveClass('lexis-status-tag')
    expect(status).toHaveAttribute('data-status-variant', 'positive')
    expect(
      within(pageHeader as HTMLElement).queryByRole('group', {
        name: 'Page actions',
      }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Application highlights' })).not.toBeInTheDocument()
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'Owner',
      'Agent',
      'Application',
      'Items',
      'Documents',
      'Remarks',
      'Offers',
      'Review',
    ])
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
  })

  it('preserves the active detail tab across a page refresh', async () => {
    const router = createMemoryRouter(
      [
        {
          path: '/provincial/application/:applicationNumber',
          element: <ProvincialApplicationDetailsPage />,
        },
      ],
      {
        initialEntries: [
          {
            pathname: '/provincial/application/321',
            state: { lexisDetailTab: 'remarks' },
          },
        ],
      },
    )
    render(<RouterProvider router={router} />)

    expect(await screen.findByRole('tab', { name: 'Remarks' })).toHaveAttribute(
      'aria-selected',
      'true',
    )

    await selectApplicationDetailTab('Application')

    await waitFor(() => {
      expect(router.state.location.state).toEqual({
        lexisDetailTab: 'application',
      })
    })
    expect(router.state.location.pathname).toBe('/provincial/application/321')
    expect(router.state.location.search).toBe('')
  })

  it('shows missing summary options only on the editable Application tab', async () => {
    mockedFetchProvincialApplicationOptions.mockResolvedValueOnce({
      exemptionTypes: [],
      exemptionReasons: [],
      applicationStatuses: [{ value: 'APP', label: 'Approved' }],
      productTypes: [{ value: 'H', label: 'Harvested Timber' }],
      growthTypes: [{ value: 'O', label: 'Old Growth' }],
      regions: [{ value: '12', label: 'Coast' }],
      currentSchedules: [{ value: '987', label: '2026-01-11' }],
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

    await waitFor(() => expect(mockedFetchProvincialApplicationOptions).toHaveBeenCalled())
    expect(screen.queryByText('Application summary options unavailable')).not.toBeInTheDocument()

    await selectApplicationSummaryTile()
    expect(await screen.findByText('Application summary options unavailable')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Missing required options: exemption reason. Summary changes cannot be saved.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save Summary' })).toBeDisabled()

    await selectApplicationDetailTab('Owner')
    expect(screen.queryByText('Application summary options unavailable')).not.toBeInTheDocument()
  })

  it('keeps saved client values visible when enrichment fails', async () => {
    mockedFetchApplicationClientData.mockRejectedValue(new Error('client endpoint unavailable'))
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...applicationDetail,
      packages: [],
      remarks: [],
      offers: [],
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

    const ownerDetails = await screen.findByRole('region', { name: 'Owner client details' })
    expect(within(ownerDetails).getByText('00011122')).toBeInTheDocument()
    expect(await within(ownerDetails).findByText('00 - Owner Main Location')).toBeInTheDocument()
    expect(within(ownerDetails).getByText('Owner Contact')).toBeInTheDocument()
    expect(within(ownerDetails).getByText('Client details unavailable')).toBeInTheDocument()
    expect(
      await screen.findByText(
        'Client details could not be retrieved. Existing selections were preserved. Please try again.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText('Action failed')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Owner details unavailable' }),
    ).not.toBeInTheDocument()

    await selectApplicationDetailTab('Agent')
    const agentDetails = await screen.findByRole('region', { name: 'Agent details' })
    expect(within(agentDetails).getByText('00033344')).toBeInTheDocument()
    expect(await within(agentDetails).findByText('01 - Agent Main Location')).toBeInTheDocument()
    expect(within(agentDetails).getByText('Agent Contact')).toBeInTheDocument()
    expect(within(agentDetails).getByText('Client details unavailable')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'No agent assigned' })).not.toBeInTheDocument()

    await selectApplicationDetailTab('Application')
    expect(
      await screen.findByRole('heading', {
        level: 3,
        name: 'No permits found',
      }),
    ).toBeInTheDocument()

    await selectApplicationDetailTab('Items')
    expect(await screen.findByRole('button', { name: 'Create package' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Items', level: 2 })).not.toBeInTheDocument()
    expect(
      screen.getByText('Create a package before adding Summary of Scale entries.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'No packages found' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Package Details' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Summary of Scale' })).not.toBeInTheDocument()

    await selectApplicationDetailTab('Documents')
    expect(screen.queryByRole('heading', { name: 'Documents', level: 2 })).not.toBeInTheDocument()
    expect(
      await screen.findByRole('heading', {
        level: 3,
        name: 'No documents found',
      }),
    ).toBeInTheDocument()

    await selectApplicationDetailTab('Remarks')
    expect(screen.queryByRole('heading', { name: 'Remarks', level: 2 })).not.toBeInTheDocument()
    expect(
      await screen.findByRole('heading', {
        level: 3,
        name: 'No remarks found',
      }),
    ).toBeInTheDocument()

    await selectApplicationDetailTab('Offers')
    expect(screen.queryByRole('heading', { name: 'Offers', level: 2 })).not.toBeInTheDocument()
    expect(
      await screen.findByRole('heading', {
        level: 3,
        name: 'No offers found',
      }),
    ).toBeInTheDocument()
  })

  it('does not show the previous client enrichment when a changed client lookup fails', async () => {
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

    await screen.findByRole('heading', { level: 2, name: 'Owner client details' })
    const ownerTile = getOwnerClientDetailsTile()
    const ownerControls = within(ownerTile)
    expect(await ownerControls.findByText('Owner Forestry Ltd.')).toBeInTheDocument()
    await waitFor(() =>
      expect(mockedFetchApplicationClientLocations).toHaveBeenCalledWith(
        '00011122',
        'owner',
        '321',
      ),
    )

    await userEvent.click(ownerControls.getByRole('button', { name: 'Edit owner details' }))
    mockedFetchApplicationClientLocations.mockRejectedValueOnce(
      new Error('changed client endpoint unavailable'),
    )
    fireEvent.change(ownerControls.getByLabelText('Client number'), {
      target: { value: '00099988' },
    })

    expect(ownerControls.getByLabelText('Client number')).toHaveValue('00099988')
    expect(ownerControls.queryByText('Owner Forestry Ltd.')).not.toBeInTheDocument()
    expect(ownerControls.getByRole('combobox', { name: 'Client location' })).toHaveValue('')

    await waitFor(() =>
      expect(mockedFetchApplicationClientLocations).toHaveBeenCalledWith(
        '00099988',
        'owner',
        '321',
      ),
    )
    expect(
      await screen.findByText(
        'Client details could not be retrieved. Existing selections were preserved. Please try again.',
      ),
    ).toBeInTheDocument()
    expect(ownerControls.queryByText('Owner Main Location')).not.toBeInTheDocument()
    expect(ownerControls.queryByText('Owner Contact')).not.toBeInTheDocument()
  })

  it('clears a client lookup warning after the latest lookup succeeds', async () => {
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

    await screen.findByRole('heading', { level: 2, name: 'Owner client details' })
    const ownerControls = within(getOwnerClientDetailsTile())
    expect(await ownerControls.findByText('Owner Forestry Ltd.')).toBeInTheDocument()
    await userEvent.click(ownerControls.getByRole('button', { name: 'Edit owner details' }))

    mockedFetchApplicationClientLocations.mockRejectedValueOnce(
      new Error('changed client endpoint unavailable'),
    )
    fireEvent.change(ownerControls.getByLabelText('Client number'), {
      target: { value: '00099988' },
    })

    const lookupErrorMessage =
      'Client details could not be retrieved. Existing selections were preserved. Please try again.'
    expect(await screen.findByText(lookupErrorMessage)).toBeInTheDocument()

    fireEvent.change(ownerControls.getByLabelText('Client number'), {
      target: { value: '00099989' },
    })

    await waitFor(() =>
      expect(mockedFetchApplicationClientLocations).toHaveBeenCalledWith(
        '00099989',
        'owner',
        '321',
      ),
    )
    await waitFor(() => expect(screen.queryByText(lookupErrorMessage)).not.toBeInTheDocument())
    expect(ownerControls.getByRole('combobox', { name: 'Client location' })).toHaveValue(
      '00 - Owner Main Location',
    )
  })

  it('shows an explicit empty state when no agent is assigned', async () => {
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...applicationDetail,
      agentClientNumber: null,
    })
    mockedFetchApplicationSummarySnapshot.mockResolvedValue({
      ...applicationSummarySnapshot,
      agentClientNumber: '',
      agentClientLocationCode: '',
      agentContactName: '',
      applicantTypeCode: 'A',
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

    await selectApplicationDetailTab('Agent')
    const agentDetails = within(getAgentDetailsTile())
    expect(
      agentDetails.getByRole('heading', {
        level: 3,
        name: 'No agent assigned',
      }),
    ).toBeInTheDocument()
    expect(agentDetails.getByText('No agent is assigned to this application.')).toBeInTheDocument()
    expect(agentDetails.queryByText('Client details unavailable')).not.toBeInTheDocument()
  })

  it('edits owner client details with plain applicant type labels', async () => {
    mockedCheckApplicationVolumeUsage.mockResolvedValue({ volumeUsed: false })
    mockedFetchApplicationSummarySnapshot.mockResolvedValue({
      ...applicationSummarySnapshot,
      applicationVolume: '',
      speciesCodes: [],
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

    await screen.findByRole('heading', { level: 1, name: 'Application 321' })
    const ownerTile = getOwnerClientDetailsTile()
    const ownerControls = within(ownerTile)

    expect(
      ownerControls.queryByRole('heading', {
        name: 'Owner client details',
        level: 3,
      }),
    ).not.toBeInTheDocument()
    await userEvent.click(
      ownerControls.getByRole('button', {
        name: 'Edit owner details',
      }),
    )

    expect(ownerControls.getByLabelText('Client number')).toHaveValue('00011122')
    const applicantType = ownerControls
      .getAllByLabelText('Applicant type')
      .find((element) => element.getAttribute('role') === 'combobox')
    expect(applicantType).toBeTruthy()

    await chooseComboBoxOption(applicantType as HTMLElement, 'Ministerial')
    expect(applicantType).toHaveValue('Ministerial')
    expect(ownerControls.queryByDisplayValue('M - Ministerial')).not.toBeInTheDocument()
    expect(ownerControls.queryByDisplayValue('O - Owner')).not.toBeInTheDocument()
    expect(ownerControls.getByLabelText('I am an agent')).not.toBeChecked()

    await chooseComboBoxOption(
      ownerControls.getByRole('combobox', { name: 'Client location' }),
      '02 - Owner Alternate Location',
    )
    await waitFor(() =>
      expect(
        ownerControls.getByRole('combobox', {
          name: 'Contact name',
        }),
      ).toBeEnabled(),
    )
    const ownerContactName = ownerControls.getByRole('combobox', { name: 'Contact name' })
    fireEvent.change(ownerContactName, { target: { value: 'Advertising Owner' } })
    await waitFor(() => expect(ownerContactName).toHaveValue('Advertising Owner'))

    await userEvent.click(ownerControls.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      expect(mockedUpdateApplicationSummary).toHaveBeenCalledWith(
        expect.objectContaining({
          applicationNumber: '321',
          ownerClientNumber: '00011122',
          ownerClientLocationCode: '02',
          ownerContactName: 'Advertising Owner',
          applicantTypeCode: 'M',
          saveSource: 'owner',
        }),
      )
    })
    expect(
      await ownerControls.findByRole('button', {
        name: 'Edit owner details',
      }),
    ).toBeInTheDocument()
    expect(screen.getByText('Owner client details saved.')).toBeInTheDocument()
    expect(mockedCheckApplicationVolumeUsage).not.toHaveBeenCalled()
  })

  it('moves an owner-to-Agent conversion into the conditional Agent editor', async () => {
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...applicationDetail,
      agentClientNumber: null,
    })
    mockedFetchApplicationSummarySnapshot.mockResolvedValue({
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

    await screen.findByRole('heading', { level: 1, name: 'Application 321' })
    const ownerControls = within(getOwnerClientDetailsTile())
    await userEvent.click(ownerControls.getByRole('button', { name: 'Edit owner details' }))
    const applicantType = getSummaryComboBox(ownerControls, 'Applicant type')

    expect(screen.queryByRole('tab', { name: 'Agent' })).not.toBeInTheDocument()
    await chooseComboBoxOption(applicantType, 'Agent')
    const agentTab = await screen.findByRole('tab', { name: 'Agent' })
    await waitFor(() => expect(agentTab).toHaveAttribute('aria-selected', 'true'))
    let agentControls = within(getAgentDetailsTile())
    expect(agentControls.getByLabelText('Agent number')).toHaveValue('00011122')
    await userEvent.click(agentControls.getByRole('button', { name: 'Cancel' }))

    await waitFor(() =>
      expect(screen.queryByRole('tab', { name: 'Agent' })).not.toBeInTheDocument(),
    )
    await selectApplicationDetailTab('Owner')
    const resetOwnerControls = within(getOwnerClientDetailsTile())
    await userEvent.click(resetOwnerControls.getByRole('button', { name: 'Edit owner details' }))
    expect(getSummaryComboBox(resetOwnerControls, 'Applicant type')).toHaveValue('Ministerial')
    await chooseComboBoxOption(getSummaryComboBox(resetOwnerControls, 'Applicant type'), 'Agent')
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'Agent' })).toHaveAttribute('aria-selected', 'true'),
    )
    agentControls = within(getAgentDetailsTile())

    await waitFor(() =>
      expect(agentControls.getByRole('combobox', { name: 'Contact location' })).toBeEnabled(),
    )
    await chooseComboBoxOption(
      agentControls.getByRole('combobox', { name: 'Contact location' }),
      '01 - Agent Main Location',
    )
    await waitFor(() =>
      expect(agentControls.getByRole('combobox', { name: 'Contact name' })).toBeEnabled(),
    )
    await chooseComboBoxOption(
      agentControls.getByRole('combobox', { name: 'Contact name' }),
      'Agent Contact',
    )
    await userEvent.click(agentControls.getByRole('button', { name: 'Save changes' }))

    await waitFor(() =>
      expect(mockedUpdateApplicationSummary).toHaveBeenCalledWith(
        expect.objectContaining({
          saveSource: 'owner-agent',
          applicantTypeCode: 'A',
          agentClientNumber: '00011122',
          agentClientLocationCode: '01',
          agentContactName: 'Agent Contact',
        }),
      ),
    )
  })

  it('submits the confirmed full owner client number when editing an application', async () => {
    mockedFetchApplicationClientData.mockImplementation(async (clientNumber) => ({
      clientNumber: clientNumber === '2176' ? '00002176' : clientNumber,
      companyName: 'Owner Forestry Ltd.',
      address: '22 Owner Road',
      city: 'Victoria',
      province: 'BC',
      postalCode: 'V8V 1A1',
      country: 'Canada',
      phone: '250-555-0101',
      fax: '',
      email: 'owner@example.test',
      notfound: '',
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

    await screen.findByRole('heading', { level: 1, name: 'Application 321' })
    const ownerControls = within(getOwnerClientDetailsTile())
    await userEvent.click(ownerControls.getByRole('button', { name: 'Edit owner details' }))
    const ownerClientNumber = ownerControls.getByLabelText('Client number')
    await userEvent.clear(ownerClientNumber)
    await userEvent.type(ownerClientNumber, '2176')

    await waitFor(() => expect(ownerClientNumber).toHaveValue('00002176'))
    expect(mockedFetchApplicationClientData).toHaveBeenCalledWith('2176', '00', {
      applicationNumber: '321',
    })

    await userEvent.click(ownerControls.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      expect(mockedUpdateApplicationSummary).toHaveBeenCalledWith(
        expect.objectContaining({
          ownerClientNumber: '00002176',
          ownerClientLocationCode: '00',
        }),
      )
    })
  })

  it('cancels owner client edits without changing the persisted summary', async () => {
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

    await screen.findByRole('heading', { level: 1, name: 'Application 321' })
    const ownerControls = within(getOwnerClientDetailsTile())
    await userEvent.click(
      ownerControls.getByRole('button', {
        name: 'Edit owner details',
      }),
    )
    fireEvent.change(ownerControls.getByLabelText('Client number'), {
      target: { value: '00099988' },
    })
    await userEvent.click(ownerControls.getByRole('button', { name: 'Cancel' }))

    expect(mockedUpdateApplicationSummary).not.toHaveBeenCalled()
    expect(ownerControls.queryByLabelText('Client number')).not.toBeInTheDocument()
    const clientNumberField = ownerControls.getByText('Client number').closest('.detail-field-item')
    expect(clientNumberField).toBeTruthy()
    expect(within(clientNumberField as HTMLElement).getByText('00011122')).toBeInTheDocument()
  })

  it('clears discarded client enrichment when the saved client refresh fails after cancel', async () => {
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

    await screen.findByRole('heading', { level: 1, name: 'Application 321' })
    const ownerControls = within(getOwnerClientDetailsTile())
    expect(await ownerControls.findByText('Owner Forestry Ltd.')).toBeInTheDocument()

    const callsBeforeEdit = mockedFetchApplicationClientData.mock.calls.length
    await userEvent.click(ownerControls.getByRole('button', { name: 'Edit owner details' }))
    await waitFor(() =>
      expect(mockedFetchApplicationClientData.mock.calls.length).toBeGreaterThan(callsBeforeEdit),
    )

    mockedFetchApplicationClientData.mockResolvedValueOnce({
      clientNumber: '00099988',
      companyName: 'Discarded Client Ltd.',
      address: '99 Discarded Road',
      city: 'Victoria',
      province: 'BC',
      postalCode: 'V8V 9Z9',
      country: 'Canada',
      phone: '250-555-9999',
      fax: '',
      email: 'discarded@example.test',
      notfound: '',
    })
    fireEvent.change(ownerControls.getByLabelText('Client number'), {
      target: { value: '00099988' },
    })
    expect(await ownerControls.findByText('Discarded Client Ltd.')).toBeInTheDocument()

    mockedFetchApplicationClientData.mockRejectedValueOnce(
      new Error('saved client refresh unavailable'),
    )
    await userEvent.click(ownerControls.getByRole('button', { name: 'Cancel' }))

    expect(
      await screen.findByText(
        'Client details could not be retrieved. Existing selections were preserved. Please try again.',
      ),
    ).toBeInTheDocument()
    expect(ownerControls.queryByText('Discarded Client Ltd.')).not.toBeInTheDocument()
    const clientNumberField = ownerControls.getByText('Client number').closest('.detail-field-item')
    expect(clientNumberField).toBeTruthy()
    expect(within(clientNumberField as HTMLElement).getByText('00011122')).toBeInTheDocument()
  })

  it('edits agent details using the legacy editable fields', async () => {
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

    await screen.findByRole('heading', { level: 1, name: 'Application 321' })
    await selectApplicationDetailTab('Agent')
    const agentTile = getAgentDetailsTile()
    const agentControls = within(agentTile)

    expect(
      agentControls.queryByRole('heading', {
        name: 'Agent client details',
        level: 3,
      }),
    ).not.toBeInTheDocument()
    expect(agentControls.getByText('01 - Agent Main Location')).toBeInTheDocument()

    await userEvent.click(
      agentControls.getByRole('button', {
        name: 'Edit agent details',
      }),
    )

    expect(agentControls.getByLabelText('Agent number')).toHaveValue('00033344')
    expect(agentControls.getByLabelText('Applicant type')).toHaveValue('Agent')
    expect(agentControls.getByLabelText('Applicant type')).toHaveAttribute('readonly')

    await chooseComboBoxOption(
      agentControls.getByRole('combobox', { name: 'Contact location' }),
      '02 - Agent Alternate Location',
    )
    await waitFor(() =>
      expect(
        agentControls.getByRole('combobox', {
          name: 'Contact name',
        }),
      ).toBeEnabled(),
    )
    await chooseComboBoxOption(
      agentControls.getByRole('combobox', { name: 'Contact name' }),
      'Agent Alternate Contact',
    )

    await userEvent.click(agentControls.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      expect(mockedUpdateApplicationSummary).toHaveBeenCalledWith(
        expect.objectContaining({
          applicationNumber: '321',
          agentClientNumber: '00033344',
          agentClientLocationCode: '02',
          agentContactName: 'Agent Alternate Contact',
          saveSource: 'agent',
        }),
      )
    })
    expect(
      await agentControls.findByRole('button', {
        name: 'Edit agent details',
      }),
    ).toBeInTheDocument()
    expect(screen.getByText('Agent details saved.')).toBeInTheDocument()
  })

  it('cancels agent edits without changing the persisted summary', async () => {
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

    await screen.findByRole('heading', { level: 1, name: 'Application 321' })
    await selectApplicationDetailTab('Agent')
    const agentControls = within(getAgentDetailsTile())
    await userEvent.click(
      agentControls.getByRole('button', {
        name: 'Edit agent details',
      }),
    )
    fireEvent.change(agentControls.getByLabelText('Agent number'), {
      target: { value: '00099988' },
    })
    await userEvent.click(agentControls.getByRole('button', { name: 'Cancel' }))

    expect(mockedUpdateApplicationSummary).not.toHaveBeenCalled()
    expect(agentControls.queryByLabelText('Agent number')).not.toBeInTheDocument()
    const agentNumberField = agentControls.getByText('Agent number').closest('.detail-field-item')
    expect(agentNumberField).toBeTruthy()
    expect(within(agentNumberField as HTMLElement).getByText('00033344')).toBeInTheDocument()
  })

  it('loads complete application context without enabling edits for read-only viewers', async () => {
    mockApplicationDetailAuth(
      (action) => ['/applicationDetails', '/applicationRemarks'].includes(action),
      ['LEXIS_READ_ONLY'],
    )
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...applicationDetail,
      readOnly: true,
      canEditApplicationDetails: false,
      canEditPackages: false,
      canAddPackages: false,
      canAddScales: false,
      canUpdatePackageNumber: false,
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

    const ownerDetails = await screen.findByRole('region', { name: 'Owner client details' })
    expect(within(ownerDetails).getByText('Owner Contact')).toBeInTheDocument()
    expect(mockedFetchApplicationSummarySnapshot).toHaveBeenCalledWith('321')
    expect(mockedFetchApplicationClientData).toHaveBeenCalledWith('00011122', '00', {
      applicationNumber: '321',
    })
    expect(mockedFetchApplicationClientLocations).toHaveBeenCalledWith('00011122', 'owner', '321')
    expect(mockedFetchApplicationClientLocations).toHaveBeenCalledWith('00033344', 'agent', '321')
    expect(mockedFetchProvincialApplicationOptions).toHaveBeenCalled()
    expect(
      within(getOwnerClientDetailsTile()).queryByRole('button', {
        name: 'Edit owner details',
      }),
    ).not.toBeInTheDocument()

    await selectApplicationDetailTab('Agent')
    expect(
      within(getAgentDetailsTile()).queryByRole('button', {
        name: 'Edit agent details',
      }),
    ).not.toBeInTheDocument()

    await selectApplicationDetailTab('Application')
    const summaryTile = getApplicationSummaryTile()
    const expectDetailField = (tile: HTMLElement, label: string, value: string) => {
      const field = within(tile).getByText(label).closest('.detail-field-item')
      expect(field).toBeTruthy()
      expect(within(field as HTMLElement).getByText(value)).toBeInTheDocument()
    }
    await waitFor(() => {
      expectDetailField(summaryTile, 'Region', 'Coast')
    })
    expect(within(summaryTile).queryByText('Product type')).not.toBeInTheDocument()
    expect(within(summaryTile).queryByText('Applicant type')).not.toBeInTheDocument()
    expect(within(summaryTile).queryByText('Owner client location')).not.toBeInTheDocument()
    expect(within(summaryTile).queryByText('Agent client location')).not.toBeInTheDocument()
    expect(within(summaryTile).queryByRole('button', { name: 'Save Summary' })).toBeNull()

    const itemDetailsTile = await selectApplicationItemDetailsTile(false)
    await waitFor(() => {
      expectDetailField(itemDetailsTile, 'Product type', 'Harvested Timber')
      expectDetailField(itemDetailsTile, 'Age class', 'Old Growth')
      expectDetailField(itemDetailsTile, 'Location of logs', 'BC')
      expectDetailField(itemDetailsTile, 'Species list', 'FI')
      expectDetailField(itemDetailsTile, 'End use', 'Lumber')
    })
    expect(
      within(itemDetailsTile).queryByRole('button', {
        name: 'Edit application item details',
      }),
    ).not.toBeInTheDocument()

    await selectApplicationDetailTab('Remarks')
    const remarksTable = within(
      screen.getByRole('region', { name: 'Application remarks' }),
    ).getByRole('table')
    expect(within(remarksTable).getByText('ok')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add remark' })).not.toBeInTheDocument()
    expect(
      within(remarksTable).queryByRole('columnheader', { name: 'Actions' }),
    ).not.toBeInTheDocument()
    expect(within(remarksTable).queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
  })

  it('shows offer company and received date from application detail', async () => {
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...applicationDetail,
      offers: [
        {
          offerNumber: 'OFF-77',
          companyName: 'Example Lumber',
          receivedDate: '2026-04-05',
          validOffer: true,
          withdrawalDate: null,
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

    await selectApplicationDetailTab('Offers')

    expect(await screen.findByRole('region', { name: 'Application offers' })).toBeInTheDocument()
    expect(await screen.findByText('Example Lumber')).toBeInTheDocument()
    expect(screen.getByText('2026-04-05')).toBeInTheDocument()
    expect(screen.getByText('OFF-77')).toBeInTheDocument()
  })

  it('preserves the originating application context when opening an offer', async () => {
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...applicationDetail,
      offers: [
        {
          offerNumber: 'OFF-77',
          companyName: 'Example Lumber',
          receivedDate: '2026-04-05',
          validOffer: true,
          withdrawalDate: null,
        },
      ],
    })

    const router = createMemoryRouter(
      [
        {
          path: '/provincial/application/:applicationNumber',
          element: <ProvincialApplicationDetailsPage />,
        },
        {
          path: '/provincial/offers/:offerNumber',
          element: <LocationProbe />,
        },
      ],
      {
        initialEntries: [
          {
            pathname: '/provincial/application/321',
            search: '?from=applications',
            state: {
              lexisDetailTab: 'offers',
              returnTo: {
                label: 'My Applications',
                to: '/provincial/summary?tab=applications',
              },
            },
          },
        ],
      },
    )

    render(<RouterProvider router={router} />)

    const offers = await screen.findByRole('region', { name: 'Application offers' })
    await userEvent.click(within(offers).getByRole('button', { name: 'Open' }))

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/provincial/offers/OFF-77')
      expect(router.state.location.search).toBe('?from=applications')
      expect(router.state.location.state).toEqual({
        lexisDetailTab: 'offers',
        returnTo: {
          label: 'Provincial application detail',
          to: '/provincial/application/321?from=applications',
          state: {
            lexisDetailTab: 'offers',
            returnTo: {
              label: 'My Applications',
              to: '/provincial/summary?tab=applications',
            },
          },
        },
      })
    })
  })

  it('links to the contextual exemption and preserves current query parameters', async () => {
    render(
      <MemoryRouter initialEntries={['/provincial/application/321?packageFilter=PKG-1']}>
        <Routes>
          <Route
            path="/provincial/application/:applicationNumber"
            element={<ProvincialApplicationDetailsPage />}
          />
          <Route path="/provincial/exemption/:exemptionNumber" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    )

    const summaryTile = await selectApplicationSummaryTile()
    const exemptionLink = within(summaryTile).getByRole('link', {
      name: 'EX-555',
    })
    await userEvent.click(exemptionLink)

    const location = await screen.findByTestId('location')
    expect(location.textContent).toBe('/provincial/exemption/EX-555?packageFilter=PKG-1')
    expect(mockedFetchProvincialExemptionDetail).not.toHaveBeenCalled()
  })

  it('renders the exemption number as plain text without exemption route capabilities', async () => {
    mockApplicationDetailAuth(
      (action: string) => action !== '/exemptionSearch' && action !== '/exemptionDetails',
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

    const summaryTile = await selectApplicationSummaryTile()
    expect(within(summaryTile).getByText('EX-555')).toBeInTheDocument()
    expect(within(summaryTile).queryByRole('link', { name: 'EX-555' })).not.toBeInTheDocument()
    expect(mockedFetchProvincialExemptionDetail).not.toHaveBeenCalled()
  })

  it('keeps an industry-linked NEW exemption as plain text', async () => {
    mockApplicationDetailAuth(() => true, ['LEXIS_PROVINCIAL_SUBMITTER_00011122'])
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...applicationDetail,
      industryUser: true,
    })
    mockedFetchProvincialExemptionDetail.mockResolvedValue(newExemptionDetail)

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

    const summaryTile = await selectApplicationSummaryTile()
    await waitFor(() => {
      expect(mockedFetchProvincialExemptionDetail).toHaveBeenCalledWith('EX-555')
    })
    expect(within(summaryTile).getByText('EX-555')).toBeInTheDocument()
    expect(within(summaryTile).queryByRole('link', { name: 'EX-555' })).not.toBeInTheDocument()
  })

  it('links an industry application after non-NEW exemption access is verified', async () => {
    mockApplicationDetailAuth(() => true, ['LEXIS_PROVINCIAL_SUBMITTER_00011122'])
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...applicationDetail,
      industryUser: true,
    })
    mockedFetchProvincialExemptionDetail.mockResolvedValue({
      ...newExemptionDetail,
      exemptionStatusCode: 'ACT',
      exemptionStatusDescription: 'Active',
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

    const summaryTile = await selectApplicationSummaryTile()
    expect(await within(summaryTile).findByRole('link', { name: 'EX-555' })).toHaveAttribute(
      'href',
      '/provincial/exemption/EX-555',
    )
    expect(mockedFetchProvincialExemptionDetail).toHaveBeenCalledWith('EX-555')
  })

  it('hides expired application mutation actions even when server edit flags are true', async () => {
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...applicationDetail,
      applicationStatusCode: 'EXP',
      statusDescription: 'Expired',
      canEditApplicationDetails: true,
      canEditPackages: true,
      canAddPackages: true,
      canAddScales: true,
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

    await selectApplicationDetailTab('Application')
    expect(await screen.findByText('Application summary')).toBeInTheDocument()
    expect(
      within(getApplicationSummaryTile()).queryByRole('combobox', {
        name: 'Exemption reason',
      }),
    ).toBeNull()

    await selectApplicationDetailTab('Items')
    expect(await screen.findByText('Package Details')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Selected Package' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save Package' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Reset package drafts' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Delete Package' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add Species' })).toBeNull()
    expect(screen.queryByText('Create Package')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add Scale' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Reset scale' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Lookup Scale' })).toBeNull()

    await selectApplicationDetailTab('Offers')
    expect(screen.queryByRole('button', { name: 'Create offer' })).toBeNull()
  })

  it('blocks application edits when another user holds the edit lock', async () => {
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...applicationDetail,
      locked: true,
      lockedBy: 'Reviewer One',
      lockMessage:
        'This application is currently locked for editing by Reviewer One. The ability to make changes has been disabled.',
    })
    mockedFetchApplicationDocuments.mockResolvedValue({
      rows: [
        {
          id: '900',
          name: 'locked-doc.pdf',
          description: 'Locked document',
          type: 'Attachment',
        },
      ],
      source: 'api',
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

    await selectApplicationDetailTab('Application')
    expect(await screen.findByText('Application locked')).toBeInTheDocument()
    expect(
      screen.getAllByText(
        'This application is currently locked for editing by Reviewer One. The ability to make changes has been disabled.',
      ).length,
    ).toBeGreaterThanOrEqual(1)
    expect(mockedFetchApplicationSummarySnapshot).toHaveBeenCalledWith('321')

    const summaryTile = getApplicationSummaryTile()
    expect(within(summaryTile).queryByLabelText('Exemption reason')).not.toBeInTheDocument()

    await selectApplicationDetailTab('Items')
    expect(screen.queryByRole('button', { name: 'Edit items' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save Package' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete Package' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Create Package' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add Scale' })).not.toBeInTheDocument()
    await selectApplicationDetailTab('Documents')
    expect(screen.queryByLabelText('Document description')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add document' })).not.toBeInTheDocument()
    expect(await screen.findByText('locked-doc.pdf')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
    await selectApplicationDetailTab('Remarks')
    expect(screen.queryByLabelText('New Remark')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save Remark' })).not.toBeInTheDocument()
  })

  it('ignores stale detail responses after navigating to another application', async () => {
    const secondApplicationDetail: ProvincialApplicationDetail = {
      ...applicationDetail,
      applicationNumber: 654,
      exemptionNumber: 'EX-654',
      statusDescription: 'Second status',
      ownerClientNumber: '00099988',
      agentClientNumber: '00077766',
    }
    let resolveFirstDetail: ((value: ProvincialApplicationDetail) => void) | undefined
    mockedFetchProvincialApplicationDetail
      .mockImplementationOnce(
        () =>
          new Promise<ProvincialApplicationDetail>((resolve) => {
            resolveFirstDetail = resolve
          }),
      )
      .mockResolvedValueOnce(secondApplicationDetail)

    render(
      <MemoryRouter initialEntries={['/provincial/application/321']}>
        <Routes>
          <Route
            path="/provincial/application/:applicationNumber"
            element={
              <>
                <NavigateButton to="/provincial/application/654" />
                <ProvincialApplicationDetailsPage />
              </>
            }
          />
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(mockedFetchProvincialApplicationDetail).toHaveBeenCalledWith('321')
    })

    await userEvent.click(screen.getByRole('button', { name: 'Navigate application' }))

    await waitFor(() => {
      expect(mockedFetchProvincialApplicationDetail).toHaveBeenCalledWith('654')
    })
    expect(
      await screen.findByText('Second status', {
        selector: '.lexis-status-tag',
      }),
    ).toBeInTheDocument()
    expect(screen.getAllByText('00099988').length).toBeGreaterThan(0)

    await act(async () => {
      resolveFirstDetail?.(applicationDetail)
    })

    expect(screen.getByText('Second status', { selector: '.lexis-status-tag' })).toBeInTheDocument()
    expect(screen.getAllByText('00099988').length).toBeGreaterThan(0)
    expect(screen.queryByText('00011122')).not.toBeInTheDocument()
    expect(mockedFetchApplicationDocuments).toHaveBeenCalledTimes(1)
    expect(mockedFetchApplicationDocuments).toHaveBeenCalledWith('654')
  })

  it('saves application summary edits and refreshes detail', async () => {
    mockedCheckApplicationVolumeUsage.mockResolvedValue({ volumeUsed: false })
    const detailAfterSummarySave: ProvincialApplicationDetail = {
      ...applicationDetail,
      termDays: 430,
    }
    mockedFetchProvincialApplicationDetail
      .mockResolvedValueOnce(applicationDetail)
      .mockResolvedValueOnce(detailAfterSummarySave)
    mockedFetchApplicationSummarySnapshot.mockResolvedValueOnce({
      applicationNumber: '321',
      federalApplicationNumber: '',
      applicationDate: '2026-01-01',
      receivedDate: '2026-01-02',
      termDays: '30',
      applicationVolume: '100',
      averageLogVolume: '2',
      exemptionReasonCode: 'S',
      productLocation: 'BC',
      exportScheduleId: '988',
      agentClientNumber: '00033344',
      agentClientLocationCode: '01',
      ownerClientNumber: '00011122',
      ownerClientLocationCode: '02',
      exemptionNumber: 'EX-555',
      applicationStatusCode: 'APP',
      applicantTypeCode: 'A',
      orgUnitNumber: '13',
      productTypeCode: 'TIMBER',
      jurisdictionCode: 'F',
      growthTypeCode: 'S',
      agentContactName: 'Agent Contact',
      ownerContactName: 'Owner Alternate Contact',
      oicIndicator: 'Y',
      endUseCode: 'LU',
      speciesCodes: ['FI'],
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

    await selectApplicationSummaryTile()
    const summaryControls = within(await waitFor(() => getApplicationSummaryTile()))
    expect(summaryControls.queryByLabelText('Application status')).not.toBeInTheDocument()
    expect(summaryControls.getByLabelText('Jurisdiction')).toHaveAttribute('readonly')
    expect(summaryControls.getByLabelText('Jurisdiction')).toHaveValue('F - Federal')
    expect(summaryControls.queryByLabelText('Applicant type')).not.toBeInTheDocument()
    const legacyOrderedControls = [
      getSummaryComboBox(summaryControls, 'Region'),
      getSummaryComboBox(summaryControls, 'Exemption reason'),
      summaryControls.getByLabelText('Application date'),
      summaryControls.getByLabelText('Received date'),
      getSummaryComboBox(summaryControls, 'Listing date'),
      summaryControls.getByLabelText('Exemption term (days)'),
    ]
    legacyOrderedControls.slice(1).forEach((control, index) => {
      expect(
        legacyOrderedControls[index].compareDocumentPosition(control) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).not.toBe(0)
    })
    const termInput = await screen.findByLabelText('Exemption term (days)')
    fireEvent.change(termInput, { target: { value: '430' } })
    expect(screen.queryByLabelText('Exemption term (months)')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Exemption term (years)')).not.toBeInTheDocument()

    await waitFor(() => {
      expect(mockedFetchProvincialApplicationOptions).toHaveBeenCalled()
      expect(mockedFetchApplicationClientLocations).toHaveBeenCalledWith('00011122', 'owner', '321')
      expect(mockedFetchApplicationClientLocations).toHaveBeenCalledWith('00033344', 'agent', '321')
      expect(mockedFetchApplicationClientContacts).toHaveBeenCalledWith(
        '00011122',
        '02',
        'owner',
        '321',
      )
      expect(mockedFetchApplicationClientContacts).toHaveBeenCalledWith(
        '00033344',
        '01',
        'agent',
        '321',
      )
      expect(mockedFetchApplicationClientData).toHaveBeenCalledWith('00011122', '02', {
        applicationNumber: '321',
      })
      expect(mockedFetchApplicationClientData).toHaveBeenCalledWith('00033344', '01', {
        applicationNumber: '321',
      })
    })
    await selectApplicationDetailTab('Owner')
    expect(await screen.findByText('Owner Forestry Ltd.')).toBeInTheDocument()
    expect(screen.getByText('owner@example.test')).toBeInTheDocument()

    await selectApplicationDetailTab('Agent')
    expect(screen.getByText('Agent Export Services')).toBeInTheDocument()
    expect(within(getAgentDetailsTile()).getByText('agent@example.test')).toBeInTheDocument()

    await selectApplicationDetailTab('Application')
    await userEvent.click(screen.getByRole('button', { name: 'Save Summary' }))
    expect(screen.queryByRole('dialog', { name: 'Confirm application accuracy' })).toBeNull()

    await waitFor(() => {
      expect(mockedUpdateApplicationSummary).toHaveBeenCalledWith({
        applicationNumber: '321',
        saveSource: 'summary',
        applicationDate: '2026-01-01',
        receivedDate: '2026-01-02',
        termDays: '430',
        exemptionReasonCode: 'S',
        exportScheduleId: '988',
        orgUnitNumber: '13',
        oicIndicator: 'Y',
      })
      expect(mockedFetchProvincialApplicationDetail).toHaveBeenCalledTimes(2)
    })
    expect(await screen.findByText('The application was saved successfully.')).toBeInTheDocument()
    expect(mockedCheckApplicationVolumeUsage).not.toHaveBeenCalled()
  }, 30000)

  it.each(['owner', 'agent'] as const)(
    'sends only %s fields when historical item values are invalid',
    async (saveSource) => {
      mockedFetchProvincialApplicationDetail.mockResolvedValue({
        ...applicationDetail,
        applicationVolume: 0,
        averageLogVolume: 100,
      })
      mockedFetchApplicationSummarySnapshot.mockResolvedValue({
        ...applicationSummarySnapshot,
        applicationVolume: '0',
        averageLogVolume: '100',
        productLocation: '',
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

      await screen.findByRole('heading', { level: 1, name: 'Application 321' })
      await selectApplicationDetailTab(saveSource === 'owner' ? 'Owner' : 'Agent')
      const controls = within(
        saveSource === 'owner' ? getOwnerClientDetailsTile() : getAgentDetailsTile(),
      )
      await userEvent.click(
        controls.getByRole('button', {
          name: saveSource === 'owner' ? 'Edit owner details' : 'Edit agent details',
        }),
      )
      const contactName = controls.getByRole('combobox', { name: 'Contact name' })
      await waitFor(() => expect(contactName).toBeEnabled())
      await chooseComboBoxOption(
        contactName,
        saveSource === 'owner' ? 'Owner Alternate Contact' : 'Agent Alternate Contact',
      )
      await userEvent.click(controls.getByRole('button', { name: 'Save changes' }))

      await waitFor(() =>
        expect(mockedUpdateApplicationSummary).toHaveBeenCalledWith(
          saveSource === 'owner'
            ? {
                applicationNumber: '321',
                saveSource: 'owner',
                ownerClientNumber: '00011122',
                ownerClientLocationCode: '00',
                ownerContactName: 'Owner Alternate Contact',
                applicantTypeCode: 'A',
              }
            : {
                applicationNumber: '321',
                saveSource: 'agent',
                agentClientNumber: '00033344',
                agentClientLocationCode: '01',
                agentContactName: 'Agent Alternate Contact',
              },
        ),
      )
      expect(mockedCheckApplicationVolumeUsage).not.toHaveBeenCalled()
    },
  )

  it('saves Application-owned fields while unrelated client lookups remain pending', async () => {
    mockedCheckApplicationVolumeUsage.mockResolvedValue({ volumeUsed: false })
    mockedFetchApplicationClientLocations.mockImplementation(
      () => new Promise<never>(() => undefined),
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

    const summaryControls = within(await selectApplicationSummaryTile())
    fireEvent.change(summaryControls.getByLabelText('Exemption term (days)'), {
      target: { value: '31' },
    })
    const saveSummary = summaryControls.getByRole('button', { name: 'Save Summary' })
    await waitFor(() => expect(saveSummary).toBeEnabled())
    await userEvent.click(saveSummary)

    await waitFor(() => {
      expect(mockedUpdateApplicationSummary).toHaveBeenCalledWith(
        expect.objectContaining({ termDays: '31' }),
      )
    })
    expect(mockedCheckApplicationVolumeUsage).not.toHaveBeenCalled()
  })

  it('enforces the single exemption term day input boundaries before saving', async () => {
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
    const termDays = screen.getByLabelText('Exemption term (days)')

    expect(termDays).toHaveAttribute('max', '99999')
    expect(screen.queryByLabelText('Exemption term (months)')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Exemption term (years)')).not.toBeInTheDocument()

    fireEvent.change(termDays, { target: { value: '100000' } })
    await userEvent.click(screen.getByRole('button', { name: 'Save Summary' }))

    expect(await screen.findAllByText('Exemption term days must be 99999 or less.')).toHaveLength(2)
    expect(mockedCheckApplicationVolumeUsage).not.toHaveBeenCalled()
    expect(mockedUpdateApplicationSummary).not.toHaveBeenCalled()

    fireEvent.change(termDays, { target: { value: '0' } })
    await userEvent.click(screen.getByRole('button', { name: 'Save Summary' }))

    expect(await screen.findAllByText('Exemption term days must be greater than 0.')).toHaveLength(
      2,
    )
    expect(mockedCheckApplicationVolumeUsage).not.toHaveBeenCalled()
    expect(mockedUpdateApplicationSummary).not.toHaveBeenCalled()
  })

  it('validates application item text storage boundaries before saving', async () => {
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

    const itemDetails = within(await selectApplicationItemDetailsTile())
    const locationOfLogs = itemDetails.getByLabelText('Location of logs')
    expect(locationOfLogs).toHaveAttribute('maxlength', '250')
    fireEvent.change(locationOfLogs, {
      target: { value: 'L'.repeat(251) },
    })
    expect(
      locationOfLogs.closest('.cds--form-item')?.querySelector('.cds--text-area__label-counter'),
    ).toHaveTextContent('251/250')
    await userEvent.click(itemDetails.getByRole('button', { name: 'Save changes' }))

    expect(itemDetails.getByText('Location of logs must be 250 characters or fewer.')).toBeVisible()
    expect(mockedCheckApplicationVolumeUsage).not.toHaveBeenCalled()
    expect(mockedUpdateApplicationSummary).not.toHaveBeenCalled()
  })

  it('shows the backend agent location error when an application edit is rejected', async () => {
    mockedUpdateApplicationSummary.mockResolvedValueOnce({
      valid: false,
      message: '',
      applicationNumber: '321',
      errors: ['Application agent location does not exist.'],
      warnings: [],
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

    await selectApplicationSummaryTile()
    await userEvent.click(screen.getByRole('button', { name: 'Save Summary' }))

    expect(await screen.findByText('Action failed')).toBeVisible()
    expect(screen.getByText('Application agent location does not exist.')).toBeVisible()
  })

  it('hides stale agent fields without submitting them during an owner application summary save', async () => {
    const ownerApplicationDetail: ProvincialApplicationDetail = {
      ...applicationDetail,
      agentClientNumber: null,
    }
    mockedFetchProvincialApplicationDetail.mockResolvedValue(ownerApplicationDetail)
    mockedFetchApplicationSummarySnapshot.mockResolvedValueOnce({
      applicationNumber: '321',
      federalApplicationNumber: '',
      applicationDate: '2026-01-01',
      receivedDate: '2026-01-02',
      termDays: '30',
      applicationVolume: '100',
      averageLogVolume: '2',
      exemptionReasonCode: 'U',
      productLocation: 'BC',
      exportScheduleId: '987',
      agentClientNumber: '00033344',
      agentClientLocationCode: '01',
      ownerClientNumber: '00011122',
      ownerClientLocationCode: '00',
      exemptionNumber: 'EX-555',
      applicationStatusCode: 'APP',
      applicantTypeCode: 'O',
      orgUnitNumber: '12',
      productTypeCode: 'LOG',
      jurisdictionCode: 'P',
      growthTypeCode: 'O',
      agentContactName: 'Agent Contact',
      ownerContactName: 'Owner Contact',
      oicIndicator: 'N',
      endUseCode: 'LU',
      speciesCodes: ['FI'],
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

    await waitFor(() => {
      expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
        'Owner',
        'Application',
        'Items',
        'Documents',
        'Remarks',
        'Offers',
        'Review',
      ])
    })
    expect(screen.queryByRole('tab', { name: 'Agent' })).not.toBeInTheDocument()

    const summaryTile = await selectApplicationSummaryTile()
    const summaryControls = within(summaryTile)

    await waitFor(() => {
      expect(summaryControls.queryByLabelText('Agent client number')).not.toBeInTheDocument()
      expect(mockedFetchApplicationClientLocations).toHaveBeenCalledWith('00011122', 'owner', '321')
    })
    expect(mockedFetchApplicationClientLocations).not.toHaveBeenCalledWith(
      '00033344',
      'agent',
      '321',
    )

    await userEvent.click(screen.getByRole('button', { name: 'Save Summary' }))

    await waitFor(() => {
      expect(mockedUpdateApplicationSummary).toHaveBeenCalledWith(
        expect.objectContaining({ saveSource: 'summary' }),
      )
    })
    const saved = mockedUpdateApplicationSummary.mock.calls[0][0]
    expect(saved).not.toHaveProperty('applicantTypeCode')
    expect(saved).not.toHaveProperty('agentClientNumber')
    expect(saved).not.toHaveProperty('agentClientLocationCode')
    expect(saved).not.toHaveProperty('agentContactName')
  })

  it('keeps applicant type and workflow fields read-only for scoped submitters', async () => {
    mockApplicationDetailAuth(
      (action: string) => action === 'createApplication',
      ['LEXIS_PROVINCIAL_SUBMITTER_00011122'],
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

    await selectApplicationDetailTab('Owner')
    const ownerControls = within(getOwnerClientDetailsTile())
    await userEvent.click(ownerControls.getByRole('button', { name: 'Edit owner details' }))
    const applicantType = await ownerControls.findByLabelText('Applicant type')
    expect(applicantType).toHaveAttribute('readonly')
    expect(applicantType).toHaveValue('Agent')
    expect(getSummaryComboBox(ownerControls, 'Applicant type')).toBeUndefined()
    await userEvent.click(ownerControls.getByRole('button', { name: 'Cancel' }))

    const summaryControls = within(await selectApplicationSummaryTile())
    expect(summaryControls.queryByLabelText('Application status')).not.toBeInTheDocument()
    expect(summaryControls.getByLabelText('Jurisdiction')).toHaveAttribute('readonly')
    expect(summaryControls.queryByLabelText('Applicant type')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Save Summary' }))

    const accuracyDialog = screen.getByRole('dialog', {
      name: 'Confirm application accuracy',
    })
    await userEvent.click(within(accuracyDialog).getByRole('checkbox', { name: 'I Agree' }))
    await userEvent.click(within(accuracyDialog).getByRole('button', { name: 'Save summary' }))

    await waitFor(() => {
      expect(mockedUpdateApplicationSummary).toHaveBeenCalledWith(
        expect.objectContaining({ saveSource: 'summary' }),
      )
    })
    expect(mockedUpdateApplicationSummary.mock.calls[0][0]).not.toHaveProperty('applicantTypeCode')
  })

  it('validates application item edits before saving', async () => {
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

    const itemDetails = within(await selectApplicationItemDetailsTile())
    const productLocationInput = await itemDetails.findByLabelText('Location of logs')

    await waitFor(() => {
      expect(productLocationInput).toHaveValue('BC')
    })

    fireEvent.change(productLocationInput, { target: { value: '' } })
    await userEvent.click(itemDetails.getByRole('button', { name: 'Save changes' }))

    expect(screen.getAllByText('Location of logs is required.').length).toBeGreaterThan(0)
    expect(mockedUpdateApplicationSummary).not.toHaveBeenCalled()
  })

  it('preserves historical region and listing values during an unrelated summary edit', async () => {
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...applicationDetail,
      orgUnitNumber: 1834,
      orgUnitName: 'Historic Natural Resource Region',
      listingDate: '2011-11-25',
    })
    mockedFetchApplicationSummarySnapshot.mockResolvedValue({
      ...applicationSummarySnapshot,
      orgUnitNumber: '1834',
      exportScheduleId: '31885',
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

    const summaryControls = within(await selectApplicationSummaryTile())
    const termDaysInput = await summaryControls.findByLabelText('Exemption term (days)')

    await waitFor(() => {
      expect(getSummaryComboBox(summaryControls, 'Region')).toHaveValue(
        'Historic Natural Resource Region',
      )
      expect(getSummaryComboBox(summaryControls, 'Listing date')).toHaveValue('2011-11-25')
    })

    fireEvent.change(termDaysInput, {
      target: { value: '31' },
    })
    await userEvent.click(summaryControls.getByRole('button', { name: 'Save Summary' }))

    await waitFor(() => {
      expect(mockedUpdateApplicationSummary).toHaveBeenCalledWith(
        expect.objectContaining({
          termDays: '31',
          orgUnitNumber: '1834',
          exportScheduleId: '31885',
        }),
      )
    })
  })

  it('removes application species through individually labelled dismiss controls', async () => {
    mockedFetchApplicationSummarySnapshot.mockResolvedValueOnce({
      ...applicationSummarySnapshot,
      speciesCodes: ['FI', 'CE'],
    })
    mockedFetchApplicationSpecies.mockResolvedValueOnce([
      { species: 'FI', endUse: 'LU', endUseDescription: 'Lumber' },
      { species: 'CE', endUse: 'LU', endUseDescription: 'Lumber' },
    ])

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

    const itemDetails = within(await selectApplicationItemDetailsTile())
    const selectedSpecies = itemDetails.getByRole('list', {
      name: 'Selected species',
    })
    const removeFir = within(selectedSpecies).getByRole('button', {
      name: 'Remove FI from application',
    })

    expect(
      within(selectedSpecies).getByRole('button', {
        name: 'Remove CE from application',
      }),
    ).toBeInTheDocument()
    expect(within(selectedSpecies).queryByRole('button', { name: 'Remove' })).toBeNull()

    await userEvent.click(removeFir)

    expect(
      within(selectedSpecies).queryByRole('button', {
        name: 'Remove FI from application',
      }),
    ).toBeNull()
    expect(
      within(selectedSpecies).getByRole('button', {
        name: 'Remove CE from application',
      }),
    ).toBeInTheDocument()
  })

  it('requires at least one selected species before saving application item details', async () => {
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

    const itemDetails = within(await selectApplicationItemDetailsTile())
    const speciesCandidate = getSummaryComboBox(itemDetails, 'Species list')
    expect(speciesCandidate).not.toHaveAttribute('aria-required', 'true')
    const selectedSpeciesGroup = itemDetails.getByRole('group', {
      name: 'Selected species',
    })
    expect(selectedSpeciesGroup).toHaveAccessibleDescription('At least one species is required.')
    const selectedSpecies = within(selectedSpeciesGroup).getByRole('list', {
      name: 'Selected species',
    })

    await userEvent.click(
      within(selectedSpecies).getByRole('button', {
        name: 'Remove FI from application',
      }),
    )
    await userEvent.click(itemDetails.getByRole('button', { name: 'Save changes' }))

    expect(
      await itemDetails.findByText('At least one species is required.', {
        selector: '.legacy-search-error',
      }),
    ).toBeVisible()
    expect(selectedSpeciesGroup).toHaveAccessibleDescription('At least one species is required.')
    expect(mockedUpdateApplicationSummary).not.toHaveBeenCalled()
  })

  it('uses natural resource region names in application summary edits', async () => {
    const detailWithNaturalResourceRegion: ProvincialApplicationDetail = {
      ...applicationDetail,
      orgUnitNumber: 1903,
      orgUnitName: 'Cariboo Natural Resource Region',
    }
    mockedFetchProvincialApplicationDetail.mockResolvedValue(detailWithNaturalResourceRegion)
    mockedFetchApplicationSummarySnapshot.mockResolvedValue({
      applicationNumber: '321',
      federalApplicationNumber: '',
      applicationDate: '2026-01-01',
      receivedDate: '2026-01-02',
      termDays: '30',
      applicationVolume: '100',
      averageLogVolume: '2',
      exemptionReasonCode: 'U',
      productLocation: 'BC',
      exportScheduleId: '987',
      agentClientNumber: '00033344',
      agentClientLocationCode: '01',
      ownerClientNumber: '00011122',
      ownerClientLocationCode: '00',
      exemptionNumber: 'EX-555',
      applicationStatusCode: 'APP',
      applicantTypeCode: 'A',
      orgUnitNumber: '1903',
      productTypeCode: 'LOG',
      jurisdictionCode: 'P',
      growthTypeCode: 'O',
      agentContactName: 'Agent Contact',
      ownerContactName: 'Owner Contact',
      oicIndicator: 'N',
      endUseCode: 'LU',
      speciesCodes: ['FI'],
    })
    mockedFetchProvincialApplicationOptions.mockResolvedValueOnce({
      exemptionTypes: [],
      exemptionReasons: [{ value: 'U', label: 'Utilization' }],
      applicationStatuses: [{ value: 'ACTIVE', label: 'Active' }],
      productTypes: [{ value: 'LOG', label: 'Logs' }],
      growthTypes: [{ value: 'O', label: 'Old Growth' }],
      regions: [
        { value: '1903', label: 'Cariboo Natural Resource Region' },
        { value: '1908', label: 'Skeena Natural Resource Region' },
      ],
      currentSchedules: [{ value: '987', label: '2026-01-11' }],
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

    const summaryTile = await selectApplicationSummaryTile()
    const summaryControls = within(summaryTile)
    const regionComboBox = getSummaryComboBox(summaryControls, 'Region')

    await waitFor(() => {
      expect(regionComboBox).toHaveValue('Cariboo Natural Resource Region')
    })

    await chooseComboBoxOption(regionComboBox, 'Skeena Natural Resource Region')
    await userEvent.click(screen.getByRole('button', { name: 'Save Summary' }))

    await waitFor(() => {
      expect(mockedUpdateApplicationSummary).toHaveBeenCalledWith(
        expect.objectContaining({
          applicationNumber: '321',
          orgUnitNumber: '1908',
        }),
      )
    })
  })

  it('can clear application summary listing date with the blank schedule option', async () => {
    mockedFetchProvincialApplicationOptions.mockResolvedValueOnce({
      exemptionTypes: [],
      exemptionReasons: [{ value: 'U', label: 'Utilization' }],
      applicationStatuses: [{ value: 'ACTIVE', label: 'Active' }],
      productTypes: [{ value: 'H', label: 'Harvested Timber' }],
      growthTypes: [{ value: 'O', label: 'Old Growth' }],
      regions: [{ value: '12', label: 'Coast' }],
      currentSchedules: [
        { value: '987', label: '2026-01-11' },
        { value: '988', label: '2026-01-25' },
        { value: '989', label: '2026-02-08' },
        { value: '', label: 'Blank' },
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

    const summaryTile = await selectApplicationSummaryTile()
    const summaryControls = within(summaryTile)
    const listingDateComboBox = getSummaryComboBox(summaryControls, 'Listing date')

    await waitFor(() => {
      expect(listingDateComboBox).toHaveValue('2026-01-11')
    })

    await chooseComboBoxOption(listingDateComboBox, '2026-02-08')
    await waitFor(() => {
      expect(listingDateComboBox).toHaveValue('2026-02-08')
    })
    await chooseComboBoxOption(listingDateComboBox, 'Blank')
    await userEvent.click(screen.getByRole('button', { name: 'Save Summary' }))

    await waitFor(() => {
      expect(mockedUpdateApplicationSummary).toHaveBeenCalledWith(
        expect.objectContaining({
          applicationNumber: '321',
          exportScheduleId: '',
        }),
      )
    })
  })

  it('validates application item volume ranges before saving', async () => {
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

    const itemDetails = within(await selectApplicationItemDetailsTile())
    const applicationVolumeInput = await itemDetails.findByLabelText('Application volume (m³)')
    const averageLogVolumeInput = await itemDetails.findByLabelText('Average log volume (m³)')

    await waitFor(() => {
      expect(applicationVolumeInput).toHaveValue(100)
    })

    fireEvent.change(applicationVolumeInput, { target: { value: '10000000' } })
    fireEvent.change(averageLogVolumeInput, { target: { value: '100' } })
    await userEvent.click(itemDetails.getByRole('button', { name: 'Save changes' }))

    expect(
      screen.getAllByText('Application volume must be 9999999.99 or less.').length,
    ).toBeGreaterThan(0)
    expect(screen.getAllByText('Average log volume must be 99.9 or less.').length).toBeGreaterThan(
      0,
    )
    expect(mockedUpdateApplicationSummary).not.toHaveBeenCalled()
  })

  it('rejects three application-volume decimals and accepts the exact Oracle maximum', async () => {
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

    const itemDetails = within(await selectApplicationItemDetailsTile())
    const applicationVolume = await itemDetails.findByLabelText('Application volume (m³)')
    const saveItemDetails = itemDetails.getByRole('button', {
      name: 'Save changes',
    })

    fireEvent.change(applicationVolume, { target: { value: '250.999' } })
    await userEvent.click(saveItemDetails)

    expect(
      screen.getAllByText('Application volume must have no more than two decimal places.').length,
    ).toBeGreaterThan(0)
    expect(mockedUpdateApplicationSummary).not.toHaveBeenCalled()

    fireEvent.change(applicationVolume, { target: { value: '9999999.99' } })
    await userEvent.click(saveItemDetails)

    await waitFor(() =>
      expect(mockedUpdateApplicationSummary).toHaveBeenCalledWith(
        expect.objectContaining({ applicationVolume: '9999999.99' }),
      ),
    )
  })

  it.each(['H', 'T'])(
    'blocks %s to Standing Timber when packages exist',
    async (productTypeCode) => {
      mockedFetchProvincialApplicationDetail.mockResolvedValue({
        ...applicationDetail,
        productTypeCode,
      })
      mockedFetchApplicationSummarySnapshot.mockResolvedValue({
        ...applicationSummarySnapshot,
        productTypeCode,
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

      const itemDetails = within(await selectApplicationItemDetailsTile())
      await chooseComboBoxOption(getSummaryComboBox(itemDetails, 'Product type'), 'Standing Timber')
      const message =
        'Product type cannot be changed to Standing Timber while packages exist. Remove the packages first.'
      expect(screen.queryByText(message)).not.toBeInTheDocument()
      await userEvent.click(itemDetails.getByRole('button', { name: 'Save changes' }))

      expect(screen.getAllByText(message).length).toBeGreaterThan(0)
      expect(mockedUpdateApplicationSummary).not.toHaveBeenCalled()
      expect(mockedCheckApplicationVolumeUsage).not.toHaveBeenCalled()
      await userEvent.click(itemDetails.getByRole('button', { name: 'Cancel' }))
      expect(screen.queryByText(message)).not.toBeInTheDocument()
    },
  )

  it('keeps item edits open when the backend rejects a product change with persisted scales', async () => {
    const message =
      'Product type cannot be changed to Unmanufactured Timber while Summary of Scale records exist. Remove the Summary of Scale records first.'
    mockedUpdateApplicationSummary.mockResolvedValue({
      valid: false,
      applicationNumber: '321',
      message: '',
      errors: [message],
      warnings: [],
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

    const itemDetails = within(await selectApplicationItemDetailsTile())
    await chooseComboBoxOption(getSummaryComboBox(itemDetails, 'Product type'), 'Timber')
    await userEvent.click(itemDetails.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText(message)).toBeVisible()
    expect(mockedUpdateApplicationSummary).toHaveBeenCalledWith(
      expect.objectContaining({ productTypeCode: 'T' }),
    )
    expect(itemDetails.getByRole('button', { name: 'Save changes' })).toBeEnabled()
    expect(mockedFetchProvincialApplicationDetail).toHaveBeenCalledTimes(1)
    await userEvent.click(itemDetails.getByRole('button', { name: 'Cancel' }))
    expect(itemDetails.getByText('Harvested Timber', { exact: true })).toBeVisible()
  })

  it('shows and saves required item fields when changing Timber to Harvested Timber', async () => {
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...applicationDetail,
      productTypeCode: 'T',
    })
    mockedFetchApplicationSummarySnapshot.mockResolvedValue({
      ...applicationSummarySnapshot,
      productTypeCode: 'T',
      productLocation: '',
      averageLogVolume: '',
      growthTypeCode: '',
      endUseCode: '',
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

    const itemDetails = within(await selectApplicationItemDetailsTile())
    expect(itemDetails.queryByLabelText('Location of logs')).not.toBeInTheDocument()
    expect(itemDetails.queryByLabelText('Average log volume (m³)')).not.toBeInTheDocument()
    expect(itemDetails.queryByLabelText('Age class')).not.toBeInTheDocument()
    expect(itemDetails.queryByLabelText('End use')).not.toBeInTheDocument()

    await chooseComboBoxOption(getSummaryComboBox(itemDetails, 'Product type'), 'Harvested Timber')

    fireEvent.change(await itemDetails.findByLabelText('Location of logs'), {
      target: { value: 'Prince George' },
    })
    fireEvent.change(itemDetails.getByLabelText('Average log volume (m³)'), {
      target: { value: '2.5' },
    })
    await chooseComboBoxOption(getSummaryComboBox(itemDetails, 'Age class'), 'Old Growth')
    await waitFor(() => expect(getSummaryComboBox(itemDetails, 'End use')).toBeEnabled())
    await chooseComboBoxOption(getSummaryComboBox(itemDetails, 'End use'), 'LU - Lumber')
    await userEvent.click(itemDetails.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      expect(mockedUpdateApplicationSummary).toHaveBeenCalledWith(
        expect.objectContaining({
          productTypeCode: 'H',
          productLocation: 'Prince George',
          averageLogVolume: '2.5',
          growthTypeCode: 'O',
          endUseCode: 'LU',
        }),
      )
    })
  })

  it('requires submitter accuracy confirmation while preserving the volume warning', async () => {
    mockApplicationDetailAuth(() => true, ['PROVINCIAL_SUBMITTER_00011122'])
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...applicationDetail,
      industryUser: true,
    })
    mockedCheckApplicationVolumeUsage.mockResolvedValue({
      volumeUsed: false,
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

    const itemDetails = within(await selectApplicationItemDetailsTile())
    await itemDetails.findByLabelText('Application volume (m³)')
    await userEvent.click(itemDetails.getByRole('button', { name: 'Save changes' }))

    const firstDialog = screen.getByRole('dialog', {
      name: 'Confirm application accuracy',
    })
    const firstAcknowledgement = within(firstDialog).getByRole('checkbox', {
      name: 'I Agree',
    })
    const firstConfirm = within(firstDialog).getByRole('button', {
      name: 'Save changes',
    })
    expect(firstAcknowledgement).not.toBeChecked()
    expect(firstConfirm).toBeDisabled()
    await userEvent.click(firstConfirm)
    expect(mockedCheckApplicationVolumeUsage).not.toHaveBeenCalled()
    expect(mockedUpdateApplicationSummary).not.toHaveBeenCalled()

    await userEvent.click(firstAcknowledgement)
    await userEvent.click(within(firstDialog).getByRole('button', { name: 'Cancel' }))
    await userEvent.click(itemDetails.getByRole('button', { name: 'Save changes' }))

    const reopenedDialog = screen.getByRole('dialog', {
      name: 'Confirm application accuracy',
    })
    const reopenedAcknowledgement = within(reopenedDialog).getByRole('checkbox', {
      name: 'I Agree',
    })
    expect(reopenedAcknowledgement).not.toBeChecked()
    await userEvent.click(reopenedAcknowledgement)
    await userEvent.click(within(reopenedDialog).getByRole('button', { name: 'Save changes' }))

    expect(
      await screen.findByText(
        'The sum of package volumes is less than the total application volume. Review package volumes or save again to continue.',
      ),
    ).toBeInTheDocument()
    expect(mockedUpdateApplicationSummary).not.toHaveBeenCalled()
    expect(reopenedDialog).toBeVisible()
    expect(reopenedAcknowledgement).toBeChecked()
    await userEvent.click(
      within(reopenedDialog).getByRole('button', {
        name: 'Save changes',
      }),
    )

    await waitFor(() => expect(mockedUpdateApplicationSummary).toHaveBeenCalledTimes(1))
  })

  it('resets application item edits from the editable snapshot', async () => {
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

    const itemDetails = within(await selectApplicationItemDetailsTile())
    const productLocationInput = await itemDetails.findByLabelText('Location of logs')

    await waitFor(() => {
      expect(productLocationInput).toHaveValue('BC')
    })

    fireEvent.change(productLocationInput, { target: { value: 'Changed location' } })
    await userEvent.click(itemDetails.getByRole('button', { name: 'Cancel' }))

    const resetItemDetails = within(await selectApplicationItemDetailsTile())
    await waitFor(() => {
      expect(resetItemDetails.getByLabelText('Location of logs')).toHaveValue('BC')
    })
  })

  it('guards unload only after application item details differ from the persisted baseline', async () => {
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

    const itemDetails = within(await selectApplicationItemDetailsTile())
    const productLocationInput = await itemDetails.findByLabelText('Location of logs')
    await waitFor(() => expect(productLocationInput).toHaveValue('BC'))

    const unchangedUnload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(unchangedUnload)
    expect(unchangedUnload.defaultPrevented).toBe(false)

    fireEvent.change(productLocationInput, { target: { value: 'Changed location' } })
    const dirtyUnload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(dirtyUnload)
    expect(dirtyUnload.defaultPrevented).toBe(true)

    await userEvent.click(itemDetails.getByRole('button', { name: 'Cancel' }))
    const resetUnload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(resetUnload)
    expect(resetUnload.defaultPrevented).toBe(false)
  })

  it('saves all dirty application sections sequentially before leaving', async () => {
    mockedFetchProvincialApplicationDetail.mockResolvedValue({
      ...applicationDetail,
      applicationStatusCode: 'NEW',
      statusDescription: 'New',
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

    const summaryControls = within(await selectApplicationSummaryTile())
    fireEvent.change(await summaryControls.findByLabelText('Exemption term (days)'), {
      target: { value: '31' },
    })
    await selectApplicationRemarksForEditing()
    fireEvent.change(await screen.findByLabelText('New Remark'), {
      target: { value: 'Sequential remark' },
    })
    const reviewTile = within(await selectApplicationReviewTile())
    await chooseComboBoxOption(
      reviewTile.getByRole('combobox', { name: 'Application status' }),
      'Rejected',
    )
    fireEvent.change(reviewTile.getByLabelText('Status change remark'), {
      target: { value: 'Needs correction' },
    })

    await userEvent.click(screen.getByRole('link', { name: 'Leave application' }))
    await screen.findByRole('dialog', { name: 'Unsaved changes' })
    await userEvent.click(screen.getByRole('button', { name: 'Save and leave' }))

    expect(await screen.findByRole('heading', { name: 'Next page' })).toBeInTheDocument()
    expect(mockedUpdateApplicationSummary).toHaveBeenCalledTimes(1)
    expect(mockedSaveApplicationRemark).toHaveBeenCalledTimes(1)
    expect(mockedUpdateApplicationReviewStatus).toHaveBeenCalledTimes(1)
    expect(mockedUpdateApplicationSummary.mock.invocationCallOrder[0]).toBeLessThan(
      mockedSaveApplicationRemark.mock.invocationCallOrder[0],
    )
    expect(mockedSaveApplicationRemark.mock.invocationCallOrder[0]).toBeLessThan(
      mockedUpdateApplicationReviewStatus.mock.invocationCallOrder[0],
    )
    expect(mockedFetchProvincialApplicationDetail).toHaveBeenCalledTimes(1)
  })

  it('allows manual summary contact entry when lookup has no contacts', async () => {
    mockedFetchApplicationClientContacts.mockResolvedValue([])

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
    const ownerControls = within(getOwnerClientDetailsTile())
    await userEvent.click(ownerControls.getByRole('button', { name: 'Edit owner details' }))
    const ownerContactInput = await ownerControls.findByLabelText('Contact name', {
      selector: '#applicationOwnerContactNameEdit',
    })
    fireEvent.change(ownerContactInput, { target: { value: 'Typed Owner' } })
    await userEvent.click(ownerControls.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      expect(mockedUpdateApplicationSummary).toHaveBeenCalledWith(
        expect.objectContaining({
          ownerContactName: 'Typed Owner',
        }),
      )
    })
  })

  it('debounces owner client lookups while the client number is typed', async () => {
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
    const ownerControls = within(getOwnerClientDetailsTile())
    await userEvent.click(ownerControls.getByRole('button', { name: 'Edit owner details' }))
    await waitFor(() => {
      expect(mockedFetchApplicationClientData).toHaveBeenCalledWith('00011122', '00', {
        applicationNumber: '321',
      })
      expect(mockedFetchApplicationClientLocations).toHaveBeenCalledWith('00011122', 'owner', '321')
      expect(mockedFetchApplicationClientContacts).toHaveBeenCalledWith(
        '00011122',
        '00',
        'owner',
        '321',
      )
    })
    mockedFetchApplicationClientData.mockClear()
    mockedFetchApplicationClientLocations.mockClear()
    mockedFetchApplicationClientContacts.mockClear()

    const ownerClientNumberInput = ownerControls.getByLabelText('Client number')
    for (const value of ['0', '00', '000', '0004', '00044', '000444', '0004444', '00044444']) {
      fireEvent.change(ownerClientNumberInput, { target: { value } })
    }

    expect(mockedFetchApplicationClientData).not.toHaveBeenCalled()
    expect(mockedFetchApplicationClientLocations).not.toHaveBeenCalled()
    expect(mockedFetchApplicationClientContacts).not.toHaveBeenCalled()

    await waitFor(
      () => {
        expect(mockedFetchApplicationClientData).toHaveBeenCalledWith('00044444', '00', {
          applicationNumber: '321',
        })
        expect(mockedFetchApplicationClientLocations).toHaveBeenCalledWith(
          '00044444',
          'owner',
          '321',
        )
        expect(mockedFetchApplicationClientContacts).toHaveBeenCalledWith(
          '00044444',
          '00',
          'owner',
          '321',
        )
      },
      { timeout: 5_000 },
    )
  })

  it('does not substitute the owner email when an agent applicant has no email', async () => {
    mockedFetchApplicationClientData.mockImplementation(async (clientNumber) => ({
      clientNumber,
      companyName: clientNumber === '00033344' ? 'Agent without email' : 'Owner Forestry Ltd.',
      address: '',
      city: '',
      province: '',
      postalCode: '',
      country: '',
      phone: '',
      fax: '',
      email: clientNumber === '00033344' ? '' : 'owner@example.test',
      notfound: '',
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

    const reviewTile = await selectApplicationReviewTile()
    await waitFor(() => {
      expect(mockedFetchApplicationClientData).toHaveBeenCalledWith('00033344', '01', {
        applicationNumber: '321',
      })
      expect(within(reviewTile).getByLabelText('Client email address')).toHaveValue('')
    })
  })

  it('shows detail error contract when application detail endpoint fails', async () => {
    mockedFetchProvincialApplicationDetail.mockRejectedValue(new Error('backend down'))

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

    expect(
      await screen.findByText('Unable to retrieve provincial application detail.', {
        selector: '.detail-page-inline-error',
      }),
    ).toBeInTheDocument()
    expect(mockedFetchApplicationDocuments).not.toHaveBeenCalled()
  })
})
